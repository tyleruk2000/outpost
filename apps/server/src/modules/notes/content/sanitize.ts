/**
 * Validates and normalises a page document that came from outside: the browser, an
 * importer, a template. The result contains only node types, marks and attributes of
 * the content model, with safe URLs, and is structurally valid for the editor (lists
 * hold items, items start with a paragraph, containers are never empty).
 *
 * The aim is to keep a person's writing. Something unknown is unwrapped to the text
 * inside it rather than rejected, because a refused autosave loses more than a dropped
 * decoration does. Only two things are refused outright: input that is not a document
 * at all, and a document over the size limit.
 */
import type { NoteDoc, NoteNodeType } from "@outpost/shared";
import { AppError, badRequest } from "../../../core/errors.ts";
import { pushInline } from "./inline.ts";
import {
  CALLOUT_VARIANTS,
  type ContentRule,
  isId,
  isMarkType,
  MAX_DOC_BYTES,
  MAX_DOC_DEPTH,
  type PMMark,
  type PMNode,
  ruleOf,
  safeUrl,
} from "./schema.ts";

export interface SanitizeOptions {
  maxBytes?: number;
  maxDepth?: number;
}

type Raw = Record<string, unknown>;

const isObject = (value: unknown): value is Raw => typeof value === "object" && value !== null && !Array.isArray(value);
const childrenOf = (raw: Raw): unknown[] => (Array.isArray(raw.content) ? raw.content : []);
const attrsOf = (raw: Raw): Raw => (isObject(raw.attrs) ? raw.attrs : {});

/** NUL cannot be stored in SQLite text reliably and is never something a person typed. */
const cleanText = (value: string): string => value.replaceAll("\u0000", "");

function shortString(value: unknown, max: number): string | null {
  return typeof value === "string" ? cleanText(value).slice(0, max) : null;
}

function intInRange(value: unknown, min: number, max: number): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max ? value : undefined;
}

/**
 * All text under a node, found without recursion so that a maliciously deep document
 * cannot exhaust the stack on the way to being flattened.
 */
function flattenText(raw: unknown, limit = 200_000): string {
  const parts: string[] = [];
  let length = 0;
  const stack: unknown[] = [raw];
  while (stack.length > 0 && length < limit) {
    const current = stack.pop();
    if (!isObject(current)) continue;
    if (typeof current.text === "string") {
      parts.push(current.text);
      length += current.text.length;
    } else if (current.type === "pageLink" && typeof attrsOf(current).label === "string") {
      parts.push(attrsOf(current).label as string);
    }
    const children = childrenOf(current);
    for (let index = children.length - 1; index >= 0; index -= 1) stack.push(children[index]);
  }
  return cleanText(parts.join(" ")).slice(0, limit);
}

function sanitizeMarks(raw: unknown): PMMark[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const marks: PMMark[] = [];
  for (const entry of raw) {
    if (!isObject(entry) || !isMarkType(entry.type)) continue;
    if (marks.some((mark) => mark.type === entry.type)) continue;
    if (entry.type === "link") {
      const href = safeUrl(attrsOf(entry).href, "link");
      // An unsafe link loses the link, not the words.
      if (href) marks.push({ type: "link", attrs: { href } });
    } else {
      marks.push({ type: entry.type });
    }
  }
  return marks.length > 0 ? marks : undefined;
}

function textNode(text: string, marks?: PMMark[]): PMNode | null {
  const cleaned = cleanText(text);
  if (!cleaned) return null;
  return marks ? { type: "text", text: cleaned, marks } : { type: "text", text: cleaned };
}

function createSanitizer(maxDepth: number) {
  /** Inline content: text, hard breaks, page links. Anything else gives up its text. */
  function inlineInto(out: PMNode[], rawChildren: unknown[], depth: number): void {
    for (const child of rawChildren) {
      if (!isObject(child)) continue;
      if (depth > maxDepth) {
        const text = textNode(flattenText(child));
        if (text) pushInline(out, text);
        continue;
      }
      if (child.type === "text") {
        const text = typeof child.text === "string" ? textNode(child.text, sanitizeMarks(child.marks)) : null;
        if (text) pushInline(out, text);
      } else if (child.type === "hardBreak") {
        out.push({ type: "hardBreak" });
      } else if (child.type === "pageLink") {
        const attrs = attrsOf(child);
        const label = shortString(attrs.label, 500) ?? "";
        if (isId(attrs.noteId)) out.push({ type: "pageLink", attrs: { noteId: attrs.noteId, label } });
        else if (label) pushInline(out, { type: "text", text: label });
      } else {
        // A block or an unknown node where only inline content fits: keep what it says.
        if (typeof child.text === "string") {
          const text = textNode(child.text);
          if (text) pushInline(out, text);
        }
        inlineInto(out, childrenOf(child), depth + 1);
      }
    }
  }

  /** Text only, for code blocks (no marks) and toggle summaries (marks kept). */
  function textOnly(rawChildren: unknown[], depth: number, keepMarks: boolean): PMNode[] {
    const inline: PMNode[] = [];
    inlineInto(inline, rawChildren, depth);
    const out: PMNode[] = [];
    for (const node of inline) {
      const text =
        node.type === "text" ? (node.text ?? "") : node.type === "hardBreak" ? (keepMarks ? " " : "\n") : String(node.attrs?.label ?? "");
      if (text) pushInline(out, keepMarks && node.marks ? { type: "text", text, marks: node.marks } : { type: "text", text });
    }
    return out;
  }

  /** Block content. Stray inline nodes are gathered into paragraphs; unknown wrappers are opened. */
  function blocksInto(out: PMNode[], rawChildren: unknown[], depth: number): void {
    let pending: PMNode[] = [];
    const flush = () => {
      if (pending.length > 0) out.push({ type: "paragraph", content: pending });
      pending = [];
    };
    for (const child of rawChildren) {
      if (!isObject(child)) continue;
      if (depth > maxDepth) {
        // Too deep to be real writing. Keep the words as one paragraph and stop descending.
        const text = textNode(flattenText(child));
        if (text && pending.length > 0) pushInline(pending, { type: "text", text: " " });
        if (text) pushInline(pending, text);
        continue;
      }
      const rule = ruleOf(child.type);
      if (rule?.group === "block") {
        flush();
        const node = sanitizeBlock(child, child.type as NoteNodeType, depth);
        if (node) out.push(node);
      } else if (rule?.group === "inline") {
        inlineInto(pending, [child], depth);
      } else {
        // Unknown node, or a list item or table cell outside its parent: lift its content.
        flush();
        if (typeof child.text === "string") {
          const text = textNode(child.text);
          if (text) out.push({ type: "paragraph", content: [text] });
        }
        blocksInto(out, childrenOf(child), depth + 1);
      }
    }
    flush();
  }

  function blockContent(raw: Raw, depth: number, paragraphFirst = false): PMNode[] {
    const out: PMNode[] = [];
    blocksInto(out, childrenOf(raw), depth + 1);
    if (out.length === 0 || (paragraphFirst && out[0]!.type !== "paragraph")) out.unshift({ type: "paragraph" });
    return out;
  }

  /** Children of lists, tables and rows: the allowed part types, with strays wrapped. */
  function partsOf(raw: Raw, content: Extract<ContentRule, { kind: "children" }>, depth: number): PMNode[] {
    const out: PMNode[] = [];
    for (const child of childrenOf(raw)) {
      if (!isObject(child)) continue;
      const allowed = (content.allowed as readonly unknown[]).includes(child.type);
      // A list item in a task list (or the reverse) is the same thing under another name.
      const sibling = ruleOf(child.type)?.group === "part" && ruleOf(content.wrapper)?.content.kind === "block";
      const type = allowed ? (child.type as NoteNodeType) : content.wrapper;
      const source: Raw = allowed || sibling ? child : { content: [child] };
      // Depth is enforced where the part's own content is read, so nothing is lost here.
      const node = sanitizePart(source, type, depth + 1);
      if (node) out.push(node);
    }
    return out;
  }

  function sanitizePart(raw: Raw, type: NoteNodeType, depth: number): PMNode | null {
    const rule = ruleOf(type)!;
    switch (type) {
      case "listItem":
        return { type, content: blockContent(raw, depth, true) };
      case "taskItem":
        return { type, attrs: { checked: attrsOf(raw).checked === true }, content: blockContent(raw, depth, true) };
      case "tableRow": {
        const cells = partsOf(raw, rule.content as Extract<ContentRule, { kind: "children" }>, depth);
        return cells.length > 0 ? { type, content: cells } : null;
      }
      case "tableHeader":
      case "tableCell": {
        const attrs = cellAttrs(attrsOf(raw));
        const content = blockContent(raw, depth);
        return attrs ? { type, attrs, content } : { type, content };
      }
      default:
        return null;
    }
  }

  function sanitizeDetails(raw: Raw, depth: number): PMNode {
    let summary: PMNode[] | undefined;
    const body: unknown[] = [];
    for (const child of childrenOf(raw)) {
      if (!isObject(child)) continue;
      if (child.type === "detailsSummary" && summary === undefined) summary = textOnly(childrenOf(child), depth + 2, true);
      else if (child.type === "detailsContent") body.push(...childrenOf(child));
      else body.push(child);
    }
    const summaryNode: PMNode = summary?.length ? { type: "detailsSummary", content: summary } : { type: "detailsSummary" };
    return { type: "details", content: [summaryNode, { type: "detailsContent", content: blockContent({ content: body }, depth + 1) }] };
  }

  function sanitizeBlock(raw: Raw, type: NoteNodeType, depth: number): PMNode | null {
    const attrs = attrsOf(raw);
    switch (type) {
      case "paragraph":
      case "heading": {
        const content: PMNode[] = [];
        inlineInto(content, childrenOf(raw), depth + 1);
        const node: PMNode = type === "heading" ? { type, attrs: { level: headingLevel(attrs.level) } } : { type };
        if (content.length > 0) node.content = content;
        return node;
      }
      case "bulletList":
      case "orderedList":
      case "taskList":
      case "table": {
        const parts = partsOf(raw, ruleOf(type)!.content as Extract<ContentRule, { kind: "children" }>, depth);
        if (parts.length === 0) return null;
        const start = type === "orderedList" ? intInRange(attrs.start, 0, 1_000_000_000) : undefined;
        return start === undefined ? { type, content: parts } : { type, attrs: { start }, content: parts };
      }
      case "blockquote":
        return { type, content: blockContent(raw, depth) };
      case "callout": {
        const variant = (CALLOUT_VARIANTS as readonly unknown[]).includes(attrs.variant) ? attrs.variant : "info";
        return { type, attrs: { variant }, content: blockContent(raw, depth) };
      }
      case "codeBlock": {
        const language = typeof attrs.language === "string" && /^[A-Za-z0-9_+#.-]{1,40}$/.test(attrs.language) ? attrs.language : null;
        const content = textOnly(childrenOf(raw), depth + 1, false);
        return content.length > 0 ? { type, attrs: { language }, content } : { type, attrs: { language } };
      }
      case "horizontalRule":
        return { type };
      case "image": {
        const src = safeUrl(attrs.src, "image");
        const alt = shortString(attrs.alt, 1000);
        // An image that cannot be shown safely leaves its description behind.
        if (!src) return alt ? { type: "paragraph", content: [{ type: "text", text: alt }] } : null;
        return { type, attrs: { src, alt, title: shortString(attrs.title, 1000) } };
      }
      case "documentEmbed": {
        const title = shortString(attrs.title, 500) ?? "";
        if (isId(attrs.documentId)) return { type, attrs: { documentId: attrs.documentId, title } };
        return title ? { type: "paragraph", content: [{ type: "text", text: title }] } : null;
      }
      case "details":
        return sanitizeDetails(raw, depth);
      default:
        return null;
    }
  }

  return { blockContent };
}

function headingLevel(value: unknown): 1 | 2 | 3 {
  if (value === 1 || value === 2 || value === 3) return value;
  return typeof value === "number" && value > 3 ? 3 : 1;
}

function cellAttrs(raw: Raw): Record<string, unknown> | undefined {
  const attrs: Record<string, unknown> = {};
  const colspan = intInRange(raw.colspan, 1, 1000);
  const rowspan = intInRange(raw.rowspan, 1, 1000);
  if (colspan !== undefined) attrs.colspan = colspan;
  if (rowspan !== undefined) attrs.rowspan = rowspan;
  if (raw.colwidth === null) {
    attrs.colwidth = null;
  } else if (Array.isArray(raw.colwidth) && raw.colwidth.length <= 1000) {
    const widths = raw.colwidth.map((width) => intInRange(width, 1, 100_000));
    if (widths.length > 0 && widths.every((width) => width !== undefined)) attrs.colwidth = widths;
  }
  return Object.keys(attrs).length > 0 ? attrs : undefined;
}

function serialisedBytes(input: unknown): number {
  try {
    return Buffer.byteLength(JSON.stringify(input) ?? "");
  } catch {
    // Circular, or nested too deeply even to serialise.
    throw badRequest("That page content could not be read. Reload the page and try again.");
  }
}

/** See the file comment. Throws `bad_request` for a non-document and `too_large` over the size limit. */
export function sanitizeDoc(input: unknown, options: SanitizeOptions = {}): NoteDoc {
  if (!isObject(input) || input.type !== "doc") {
    throw badRequest("That page content is not a document Outpost understands.");
  }
  const maxBytes = options.maxBytes ?? MAX_DOC_BYTES;
  if (serialisedBytes(input) > maxBytes) {
    throw new AppError(
      "too_large",
      `This page is too large to save (the limit is ${Math.round(maxBytes / (1024 * 1024))} MB). Split it into smaller pages, or attach big images as files instead of pasting them.`,
    );
  }
  const { blockContent } = createSanitizer(options.maxDepth ?? MAX_DOC_DEPTH);
  // The root counts as depth 0, its blocks as depth 1.
  return { type: "doc", content: blockContent(input, 0) } as NoteDoc;
}
