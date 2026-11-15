/**
 * A Markdown file as a person reads it: headings, paragraphs, lists, tables, and the
 * bold, italic, code and links inside them.
 *
 * The file is never turned into HTML. It becomes a small tree of plain values
 * (`MarkdownBlock`) that the web app draws with its own elements, so nothing written in
 * a file can run, load a picture from the internet, or style the page. Embedded HTML
 * is reduced to its words; a picture is reduced to its description.
 */
import fs from "node:fs";
import type { MarkdownBlock, MarkdownInline, MarkdownListItem } from "@outpost/shared";
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
      // A link Outpost will not follow keeps its words.
      return href ? [{ t: "link", href, c: label.length > 0 ? label : text(href) }] : label;
    }
    case "image":
    case "imageReference":
      return text(node.alt ?? "");
    case "footnoteReference":
      return text(`[${node.label ?? node.identifier}]`);
    case "html":
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
      case "heading":
        out.push({ t: "heading", depth: node.depth, c: inline(node, context) });
        break;
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
      case "code":
        out.push({ t: "code", v: node.value });
        break;
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

export function markdownBlocks(source: string): MarkdownBlock[] {
  const { body } = splitFrontMatter(source);
  const tree = unified().use(remarkParse).use(remarkGfm).parse(body) as Root;
  return blocks(tree.children, { definitions: definitionsOf(tree) }, 0);
}

/** Reads a Markdown file for display. Refuses one too large to send as a tree. */
export async function readMarkdownBlocks(file: string): Promise<MarkdownBlock[]> {
  const stat = await fs.promises.stat(file).catch(() => undefined);
  if (!stat?.isFile()) throw new AppError("not_found", "The file is missing from its storage location.");
  if (stat.size > MAX_FORMATTED_BYTES) {
    throw new AppError("too_large", "This Markdown file is too large to show with its formatting, so it is shown as plain text.");
  }
  return markdownBlocks(decodeText(await fs.promises.readFile(file)));
}
