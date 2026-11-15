/**
 * Text from plain text, Markdown and HTML. Each returns the source's natural sections
 * (the text under a heading) so a search result can say where in the document it is.
 *
 * Everything here ends up as plain text in the search index and is never rendered as
 * markup, so the parsing is about finding words and headings, not preserving layout.
 */
import fs from "node:fs";
import type { Element, Nodes as HastNodes, Root as HastRoot } from "hast";
import { toText } from "hast-util-to-text";
import type { Nodes as MdastNodes, Root as MdastRoot } from "mdast";
import rehypeParse from "rehype-parse";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { type Extracted, type ExtractedSection, tidyText } from "./extract-types.ts";

/** Most of a plain text, CSV or JSON file that is read for search. */
export const MAX_TEXT_BYTES = 32 * 1024 * 1024;
/** Markdown and HTML are parsed into a tree several times their size, so less is read. */
export const MAX_MARKUP_BYTES = 8 * 1024 * 1024;

/** Decodes text, honouring a byte-order mark; anything without one is read as UTF-8. */
export function decodeText(bytes: Buffer): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes.subarray(2));
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes.subarray(2));
  return new TextDecoder("utf-8").decode(bytes).replace(/^﻿/, "");
}

async function readStart(file: string, maxBytes: number): Promise<{ text: string; note?: string }> {
  const handle = await fs.promises.open(file, "r");
  try {
    const { size } = await handle.stat();
    const length = Math.min(size, maxBytes);
    const buffer = Buffer.alloc(length);
    let read = 0;
    while (read < length) {
      const { bytesRead } = await handle.read(buffer, read, length - read, read);
      if (bytesRead === 0) break;
      read += bytesRead;
    }
    let text = decodeText(buffer.subarray(0, read));
    if (size <= maxBytes) return { text };
    // End on a whole line so the cut does not leave half a word or half a character.
    const lastBreak = text.lastIndexOf("\n");
    if (lastBreak > text.length / 2) text = text.slice(0, lastBreak);
    const megabytes = Math.round(maxBytes / (1024 * 1024));
    return { text, note: `This file is very large, so only its first ${megabytes} MB can be searched.` };
  } finally {
    await handle.close();
  }
}

const result = (sections: ExtractedSection[], meta: Extracted["meta"] = {}, note?: string): Extracted => ({
  sections: sections.filter((section) => section.text || section.heading),
  pageCount: null,
  meta,
  notes: note ? [note] : [],
});

export async function extractPlainText(file: string): Promise<Extracted> {
  const { text, note } = await readStart(file, MAX_TEXT_BYTES);
  return result([{ text: tidyText(text) }], {}, note);
}

// ── Markdown ────────────────────────────────────────────────────────────────

const stripTags = (html: string) =>
  html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<[^>]*>/g, " ");

/** The words of a Markdown node, with its syntax gone. */
function markdownText(node: MdastNodes): string {
  switch (node.type) {
    case "text":
    case "inlineCode":
    case "code":
      return node.value;
    case "html":
      return stripTags(node.value);
    case "image":
    case "imageReference":
      return node.alt ?? "";
    case "break":
      return "\n";
    case "thematicBreak":
    case "definition":
    case "yaml":
    case "footnoteReference":
      return "";
    case "table":
    case "list":
    case "listItem":
    case "blockquote":
    case "footnoteDefinition":
    case "root":
      return node.children.map(markdownText).filter(Boolean).join("\n");
    case "tableRow":
      return node.children.map(markdownText).join(" | ");
    default:
      return "children" in node ? (node.children as MdastNodes[]).map(markdownText).join("") : "";
  }
}

/**
 * Front matter (`---` … `---` at the very top) is metadata, not content. Without this
 * the Markdown parser would read its last line as a heading.
 */
function splitFrontMatter(source: string): { body: string; meta: Extracted["meta"] } {
  const match = /^---[ \t]*\r?\n([\s\S]*?)\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/.exec(source);
  if (!match) return { body: source, meta: {} };
  const field = (name: string) => {
    const line = new RegExp(`^${name}[ \\t]*:[ \\t]*(.+)$`, "im").exec(match[1] ?? "");
    return (
      line?.[1]
        ?.trim()
        .replace(/^(["'])(.*)\1$/, "$2")
        .trim() || undefined
    );
  };
  return { body: source.slice(match[0].length), meta: { title: field("title"), author: field("author") } };
}

export function markdownSections(source: string): { sections: ExtractedSection[]; meta: Extracted["meta"] } {
  const { body, meta } = splitFrontMatter(source);
  const tree = unified().use(remarkParse).use(remarkGfm).parse(body) as MdastRoot;
  const sections: ExtractedSection[] = [];
  let heading: string | undefined;
  let blocks: string[] = [];
  const flush = () => {
    const text = tidyText(blocks.join("\n\n"));
    if (text || heading) sections.push({ heading, text });
    blocks = [];
  };
  for (const node of tree.children) {
    if (node.type === "heading") {
      flush();
      heading = tidyText(markdownText(node)) || undefined;
    } else {
      const text = markdownText(node);
      if (text.trim()) blocks.push(text);
    }
  }
  flush();
  return { sections, meta };
}

export async function extractMarkdown(file: string): Promise<Extracted> {
  const { text, note } = await readStart(file, MAX_MARKUP_BYTES);
  const { sections, meta } = markdownSections(text);
  return result(sections, meta, note);
}

// ── HTML ────────────────────────────────────────────────────────────────────

/**
 * The default schema keeps the text of elements it does not allow. For these the text
 * is code, styling or hidden interface, not something a person reads.
 */
const textSchema = {
  ...defaultSchema,
  strip: ["script", "style", "title", "template", "noscript", "iframe", "object", "svg"],
};

const htmlParser = unified().use(rehypeParse);
const htmlCleaner = unified().use(rehypeSanitize, textSchema);

const SECTION_HEADINGS = new Set(["h1", "h2", "h3"]);
const isElement = (node: HastNodes): node is Element => node.type === "element";

function findElement(node: HastNodes, test: (element: Element) => boolean): Element | undefined {
  if (isElement(node) && test(node)) return node;
  if (!("children" in node)) return undefined;
  for (const child of node.children) {
    const found = findElement(child, test);
    if (found) return found;
  }
  return undefined;
}

export interface ParsedHtml {
  /** Sanitised tree: no scripts, styles or anything else that is not content. */
  tree: HastRoot;
  title?: string;
  language?: string;
}

export function parseHtml(source: string): ParsedHtml {
  const raw = htmlParser.parse(source) as HastRoot;
  const titleElement = findElement(raw, (element) => element.tagName === "title");
  const lang = findElement(raw, (element) => element.tagName === "html")?.properties.lang;
  const tree = htmlCleaner.runSync(raw) as HastRoot;
  return {
    tree,
    // `title` is not rendered, so innerText rules give nothing; read its text directly.
    title: titleElement
      ? tidyText(titleElement.children.map((child) => (child.type === "text" ? child.value : "")).join("")) || undefined
      : undefined,
    language: typeof lang === "string" && lang.trim() ? lang.trim().slice(0, 35) : undefined,
  };
}

export function htmlText(node: HastNodes): string {
  return tidyText(toText(node));
}

export function firstHeading(tree: HastRoot): string | undefined {
  const element = findElement(tree, (candidate) => SECTION_HEADINGS.has(candidate.tagName));
  return element ? htmlText(element) || undefined : undefined;
}

/**
 * One section per h1–h3, wherever in the tree the heading sits. Subtrees without a
 * heading are turned into text whole, so their own line structure is kept.
 */
export function htmlSections(tree: HastRoot): ExtractedSection[] {
  const withHeading = new WeakSet<HastNodes>();
  const mark = (node: HastNodes): boolean => {
    let found = isElement(node) && SECTION_HEADINGS.has(node.tagName);
    if ("children" in node) for (const child of node.children) found = mark(child) || found;
    if (found) withHeading.add(node);
    return found;
  };
  mark(tree);

  const sections: ExtractedSection[] = [];
  let heading: string | undefined;
  let blocks: string[] = [];
  const flush = () => {
    // Pieces gathered here are siblings such as paragraphs and lists: separate blocks.
    const text = tidyText(blocks.join("\n\n"));
    if (text || heading) sections.push({ heading, text });
    blocks = [];
  };
  const visit = (node: HastNodes): void => {
    if (isElement(node) && SECTION_HEADINGS.has(node.tagName)) {
      flush();
      heading = htmlText(node) || undefined;
    } else if (withHeading.has(node) && "children" in node) {
      for (const child of node.children) visit(child);
    } else if (node.type === "element" || node.type === "text" || node.type === "root") {
      const text = htmlText(node);
      if (text) blocks.push(text);
    }
  };
  visit(tree);
  flush();
  return sections;
}

export async function extractHtml(file: string): Promise<Extracted> {
  const { text, note } = await readStart(file, MAX_MARKUP_BYTES);
  const parsed = parseHtml(text);
  return result(htmlSections(parsed.tree), { title: parsed.title, language: parsed.language }, note);
}
