/**
 * Markdown → page document. The inverse of `docToMarkdown`, and the entry point for
 * importers: it accepts whatever people's Markdown contains and never throws on a
 * construct it does not know (only on a result over the size limit, see `sanitizeDoc`).
 */
import type { NoteDoc } from "@outpost/shared";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { type LinkResolver, type MdNode, mdastToBlocks } from "./from-mdast.ts";
import { sanitizeDoc } from "./sanitize.ts";
import type { PMNode } from "./schema.ts";

export interface MarkdownToDocOptions extends LinkResolver {
  /**
   * Take a leading `---` … `---` block of `key: value` lines off the text and return
   * it as `frontmatter` instead of showing it on the page. Default: true.
   */
  frontmatter?: boolean;
}

export interface MarkdownToDocResult {
  doc: NoteDoc;
  /** Things that were simplified, in words for the person importing. */
  warnings: string[];
  /** The raw front matter, without the fences, when there was one. */
  frontmatter?: string;
}

const processor = unified().use(remarkParse).use(remarkGfm).freeze();

const FRONTMATTER = /^﻿?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

/** Front matter must look like YAML; a page that merely starts with a rule is left alone. */
function splitFrontmatter(markdown: string): { body: string; frontmatter?: string } {
  const match = FRONTMATTER.exec(markdown);
  if (!match || !/^[A-Za-z_][\w .-]*:/.test(match[1]!.trimStart())) return { body: markdown };
  return { body: markdown.slice(match[0].length), frontmatter: match[1]! };
}

/** Last resort when the parser itself fails: every paragraph of the text, as text. */
function plainParagraphs(text: string): PMNode[] {
  return text
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => ({ type: "paragraph", content: [{ type: "text", text: part }] }));
}

export function markdownToDoc(markdown: string, options: MarkdownToDocOptions = {}): MarkdownToDocResult {
  const source = typeof markdown === "string" ? markdown : "";
  const { body, frontmatter } = options.frontmatter === false ? { body: source } : splitFrontmatter(source);

  let blocks: PMNode[];
  let warnings: string[];
  try {
    ({ blocks, warnings } = mdastToBlocks(processor.parse(body) as unknown as MdNode, options));
  } catch {
    blocks = plainParagraphs(body);
    warnings = ["This text could not be read as Markdown and was imported as plain paragraphs."];
  }

  const doc = sanitizeDoc({ type: "doc", content: blocks });
  return frontmatter === undefined ? { doc, warnings } : { doc, warnings, frontmatter };
}
