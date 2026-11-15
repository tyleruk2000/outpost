/**
 * HTML → page document, for imported web pages and HTML exports from other tools.
 * See `html-pipeline.ts` for how the HTML is made safe before it is read.
 */
import type { NoteDoc } from "@outpost/shared";
import { toText } from "hast-util-to-text";
import rehypeParse from "rehype-parse";
import { unified } from "unified";
import { type LinkResolver, mdastToBlocks } from "./from-mdast.ts";
import { htmlToMdast } from "./html-pipeline.ts";
import { sanitizeDoc } from "./sanitize.ts";
import type { PMNode } from "./schema.ts";

export type HtmlToDocOptions = LinkResolver;

export interface HtmlToDocResult {
  doc: NoteDoc;
  /** From `<title>`, or the first `<h1>` when the page has no title. */
  title?: string;
  warnings: string[];
}

/** Last resort when conversion fails: the visible text, one paragraph per line. */
function textOnly(html: string): PMNode[] {
  let text: string;
  try {
    text = toText(unified().use(rehypeParse).parse(html));
  } catch {
    text = "";
  }
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => ({ type: "paragraph", content: [{ type: "text", text: line }] }));
}

export function htmlToDoc(html: string, options: HtmlToDocOptions = {}): HtmlToDocResult {
  const source = typeof html === "string" ? html : "";
  let blocks: PMNode[];
  let warnings: string[];
  let title: string | undefined;
  try {
    const converted = htmlToMdast(source);
    title = converted.title;
    ({ blocks, warnings } = mdastToBlocks(converted.tree, options));
  } catch {
    blocks = textOnly(source);
    warnings = ["This page could not be converted with its formatting and was imported as plain text."];
  }
  const doc = sanitizeDoc({ type: "doc", content: blocks });
  return title ? { doc, title, warnings } : { doc, warnings };
}
