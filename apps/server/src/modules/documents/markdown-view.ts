/**
 * A Markdown file as a person reads it: headings, paragraphs, lists, tables, and the
 * bold, italic, code and links inside them.
 *
 * The file is never turned into HTML. It becomes a small tree of plain values
 * (`MarkdownBlock`) that the web app draws with its own elements, so nothing written in
 * a file can run, load a picture from the internet, or style the page. Embedded HTML
 * is reduced to its words; a picture is reduced to its description.
 *
 * A link survives in one of three forms, and in no other: a web or mail address; a jump
 * to a heading of the same document (`#heading-words`); or a reference to something in
 * Outpost's own catalogue (`outpost:entry/<entry id>/<chapter key>`), which is looked up
 * here so that the browser is only ever given ids this server found.
 *
 * A fenced block keeps the word after its opening fence (`mermaid`, `viz`), so the web
 * app can draw the diagram it describes. The block's text is still only text.
 */
import fs from "node:fs";
import type { MarkdownBlock, MarkdownInline, MarkdownListItem, MarkdownRef } from "@outpost/shared";
import type { Nodes, Root, RootContent } from "mdast";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { AppError } from "../../core/errors.ts";
import { decodeText, markdownText, splitFrontMatter } from "./extract-text.ts";

/**
 * The largest Markdown file shown with its formatting. The tree sent to the browser is
 * several times the size of the file; anything larger is shown as plain text instead.
 */
export const MAX_FORMATTED_BYTES = 2 * 1024 * 1024;

/** Quotes inside lists inside quotes: past this depth the rest is shown as plain text. */
const MAX_DEPTH = 16;

/** Only addresses that leave Outpost for the web or a mail program become links. */
export function safeHref(url: string): string | null {
  const trimmed = url.trim();
  if (!/^(https?:\/\/|mailto:)/i.test(trimmed)) return null;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "http:" || parsed.protocol === "https:" || parsed.protocol === "mailto:" ? parsed.href : null;
  } catch {
    return null;
  }
}

/** What a link written as `outpost:entry/…` names. */
export interface OutpostLink {
  entryId: string;
  chapterKey?: string;
  /** A heading in the target, as its id (see `headingSlug`). */
  anchor?: string;
}

const HEADING_ID = /^[\p{L}\p{M}\p{N}_-]{1,200}$/u;
const OUTPOST_LINK = /^outpost:entry\/([a-z0-9]+(?:[.-][a-z0-9]+)*)(?:\/([a-z0-9]+(?:-[a-z0-9]+)*))?(?:#(.*))?$/;

/**
 * Reads a link into Outpost. The form is exact: a catalogue entry id, optionally a
 * chapter key, optionally a heading. Anything else (a path, a query, another scheme,
 * stray characters) is not a link into Outpost at all.
 */
export function parseOutpostLink(url: string): OutpostLink | null {
  const match = OUTPOST_LINK.exec(url);
  if (!match) return null;
  const [, entryId = "", chapterKey, anchor] = match;
  if (entryId.length < 3 || entryId.length > 120 || (chapterKey !== undefined && chapterKey.length > 80)) return null;
  if (anchor !== undefined && !HEADING_ID.test(anchor)) return null;
  return { entryId, ...(chapterKey ? { chapterKey } : {}), ...(anchor ? { anchor } : {}) };
}

/** What a link into Outpost leads to on this server; undefined when the catalogue has no such entry. */
export type LinkResolver = (
  entryId: string,
  chapterKey?: string,
) => { entryId: string; entryName: string; collectionId?: string; documentId?: string } | undefined;

/**
 * The id of a heading, made from its words the way links to headings are usually
 * written (as GitHub and most Markdown tools do): lower case, punctuation dropped,
 * spaces to hyphens. "Height matters (usually)" becomes "height-matters-usually".
 */
export function headingSlug(words: string): string {
  return words
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\p{Pc}\- ]/gu, "")
    .replace(/ /g, "-")
    .slice(0, 200);
}

const text = (v: string): MarkdownInline[] => (v ? [{ t: "text", v }] : []);

/** Joins neighbouring text runs, so "a", " ", "b" from the parser is one run. */
function merged(runs: MarkdownInline[]): MarkdownInline[] {
  const out: MarkdownInline[] = [];
  for (const run of runs) {
    const last = out.at(-1);
    if (run.t === "text" && last?.t === "text") last.v += run.v;
    else out.push(run);
  }
  return out;
}

interface Context {
  /** Reference-style link targets: `[label]: https://…`. */
  definitions: Map<string, string>;
  /** The id given to each heading, in the order they come. */
  headings: Map<Nodes, string>;
  /** Every heading id in the document: a jump is kept only when it has somewhere to land. */
  headingIds: Set<string>;
  resolve?: LinkResolver;
}

/** A link that stays inside Outpost: to a heading of this document, or to a catalogue entry or chapter. */
function innerLink(url: string, label: MarkdownInline[], context: Context): MarkdownInline[] | undefined {
  if (url.startsWith("#")) {
    let to = url.slice(1);
    try {
      to = decodeURIComponent(to);
    } catch {
      // Not valid percent-encoding; it will not match a heading.
    }
    return context.headingIds.has(to) ? [{ t: "jump", to, c: label }] : undefined;
  }
  const link = parseOutpostLink(url);
  const target = link ? context.resolve?.(link.entryId, link.chapterKey) : undefined;
  if (!link || !target) return undefined;
  const ref: MarkdownRef = {
    t: "ref",
    entryId: target.entryId,
    entryName: target.entryName,
    c: label.length > 0 ? label : text(target.entryName),
  };
  if (target.collectionId) ref.collectionId = target.collectionId;
  if (target.documentId) ref.documentId = target.documentId;
  if (link.anchor && target.documentId) ref.anchor = link.anchor;
  return [ref];
}

function inline(node: Nodes, context: Context): MarkdownInline[] {
  const children = () => merged("children" in node ? (node.children as Nodes[]).flatMap((child) => inline(child, context)) : []);
  switch (node.type) {
    case "text":
      return text(node.value);
    case "inlineCode":
      return node.value ? [{ t: "code", v: node.value }] : [];
    case "break":
      return [{ t: "break" }];
    case "strong":
      return [{ t: "strong", c: children() }];
    case "emphasis":
      return [{ t: "em", c: children() }];
    case "delete":
      return [{ t: "del", c: children() }];
    case "link":
    case "linkReference": {
      const url = node.type === "link" ? node.url : (context.definitions.get(node.identifier) ?? "");
      const href = safeHref(url);
      const label = children();
      if (href) return [{ t: "link", href, c: label.length > 0 ? label : text(href) }];
      // A link Outpost will not follow keeps its words.
      return innerLink(url.trim(), label, context) ?? label;
    }
    case "image":
    case "imageReference": {
      // The picture itself is never fetched or shown. What its author wrote about it is.
      const alt = (node.alt ?? "").trim();
      const caption = node.type === "image" ? (node.title ?? "").trim() : "";
      return alt || caption ? [{ t: "image", alt, ...(caption ? { caption } : {}) }] : [];
    }
    case "footnoteReference":
      return text(`[${node.label ?? node.identifier}]`);
    case "html":
      // A line break is the one tag with a meaning of its own in a table cell or a sentence.
      if (/^<br\s*\/?>$/i.test(node.value.trim())) return [{ t: "break" }];
      return text(markdownText(node));
    default:
      return "children" in node ? children() : [];
  }
}

function blocks(nodes: readonly RootContent[], context: Context, depth: number): MarkdownBlock[] {
  const out: MarkdownBlock[] = [];
  const paragraph = (runs: MarkdownInline[]) => {
    if (runs.some((run) => run.t !== "text" || run.v.trim())) out.push({ t: "paragraph", c: runs });
  };
  for (const node of nodes) {
    if (depth >= MAX_DEPTH) {
      paragraph(text(markdownText(node)));
      continue;
    }
    switch (node.type) {
      case "heading": {
        const id = context.headings.get(node);
        out.push({ t: "heading", depth: node.depth, ...(id ? { id } : {}), c: inline(node, context) });
        break;
      }
      case "paragraph":
        paragraph(inline(node, context));
        break;
      case "blockquote":
        out.push({ t: "quote", c: blocks(node.children, context, depth + 1) });
        break;
      case "list": {
        const items: MarkdownListItem[] = node.children.map((item) => ({
          ...(typeof item.checked === "boolean" ? { checked: item.checked } : {}),
          c: blocks(item.children, context, depth + 1),
        }));
        out.push({
          t: "list",
          ordered: node.ordered === true,
          ...(node.ordered && typeof node.start === "number" && node.start !== 1 ? { start: node.start } : {}),
          items,
        });
        break;
      }
      case "code": {
        const lang = node.lang?.toLowerCase() ?? "";
        out.push({ t: "code", ...(/^[a-z0-9][a-z0-9+#_.-]{0,39}$/.test(lang) ? { lang } : {}), v: node.value });
        break;
      }
      case "table": {
        const width = Math.max(0, ...node.children.map((row) => row.children.length));
        if (width === 0) break;
        out.push({
          t: "table",
          rows: node.children.map((row) =>
            Array.from({ length: width }, (_, column) => inline(row.children[column] ?? { type: "text", value: "" }, context)),
          ),
        });
        break;
      }
      case "thematicBreak":
        out.push({ t: "rule" });
        break;
      case "footnoteDefinition": {
        const body = blocks(node.children, context, depth + 1);
        const label = `[${node.label ?? node.identifier}] `;
        const first = body[0];
        if (first?.t === "paragraph") first.c = merged([...text(label), ...first.c]);
        else body.unshift({ t: "paragraph", c: text(label) });
        out.push(...body);
        break;
      }
      case "html":
        paragraph(text(markdownText(node).replace(/\s+/g, " ").trim()));
        break;
      case "definition":
      case "yaml":
        break;
      default:
        paragraph(inline(node, context));
    }
  }
  return out;
}

function definitionsOf(node: Nodes, found = new Map<string, string>(), depth = 0): Map<string, string> {
  if (node.type === "definition") found.set(node.identifier, node.url);
  else if ("children" in node && depth < MAX_DEPTH) for (const child of node.children as Nodes[]) definitionsOf(child, found, depth + 1);
  return found;
}

/** Gives every heading an id of its own: the slug of its words, numbered when the words repeat. */
function headingsOf(node: Nodes, found = new Map<Nodes, string>(), used = new Map<string, number>(), depth = 0): Map<Nodes, string> {
  if (node.type === "heading") {
    const slug = headingSlug(markdownText(node));
    if (slug) {
      const seen = used.get(slug) ?? 0;
      used.set(slug, seen + 1);
      found.set(node, seen === 0 ? slug : `${slug}-${seen}`);
    }
  } else if ("children" in node && depth < MAX_DEPTH) {
    for (const child of node.children as Nodes[]) headingsOf(child, found, used, depth + 1);
  }
  return found;
}

export function markdownBlocks(source: string, options: { resolve?: LinkResolver } = {}): MarkdownBlock[] {
  const { body } = splitFrontMatter(source);
  const tree = unified().use(remarkParse).use(remarkGfm).parse(body) as Root;
  const headings = headingsOf(tree);
  return blocks(
    tree.children,
    { definitions: definitionsOf(tree), headings, headingIds: new Set(headings.values()), resolve: options.resolve },
    0,
  );
}

/** Reads a Markdown file for display. Refuses one too large to send as a tree. */
export async function readMarkdownBlocks(file: string, options: { resolve?: LinkResolver } = {}): Promise<MarkdownBlock[]> {
  const stat = await fs.promises.stat(file).catch(() => undefined);
  if (!stat?.isFile()) throw new AppError("not_found", "The file is missing from its storage location.");
  if (stat.size > MAX_FORMATTED_BYTES) {
    throw new AppError("too_large", "This Markdown file is too large to show with its formatting, so it is shown as plain text.");
  }
  return markdownBlocks(decodeText(await fs.promises.readFile(file)), options);
}
