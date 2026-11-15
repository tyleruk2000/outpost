/**
 * Turning one source file into a page: its title, tags and content.
 *
 * The notes module's converters do the real work. This file adds what is particular
 * to importing: taking the title out of the text, reading front matter, and making
 * sure nothing in the result points at a place that will not exist. A relative link
 * that could not be matched to an imported file becomes plain text, and a picture at
 * a web address becomes a link, because an import never fetches anything.
 */
import type { ImportConstructKind, ImportItemFormat, NoteDoc } from "@outpost/shared";
import { docToText, htmlToDoc, type InAppTarget, markdownToDoc, parseInAppHref, sanitizeDoc } from "../notes/content/index.ts";
import type { PMNode } from "../notes/content/schema.ts";
import { cleanTitle } from "./names.ts";

/** Says what a link or image address in the file points to inside Outpost, if anything. */
export type ResolveLink = (href: string) => InAppTarget | null;

export interface ConvertedPage {
  /** From front matter, the leading heading or the HTML title. Absent when the file names none. */
  title?: string;
  doc: NoteDoc;
  tags: string[];
  /** What the converter simplified, in its own words. */
  warnings: string[];
  /** Every link and image address in the file, as written, each once. */
  hrefs: string[];
  /** Pictures at web addresses that were turned into links. */
  externalImages: number;
  /** Relative addresses that matched nothing and were reduced to their text. */
  missing: string[];
}

const MAX_TAGS = 50;
const MAX_TAG_LENGTH = 50;

const unquote = (value: string): string =>
  value
    .trim()
    .replace(/^(["'])(.*)\1$/, "$2")
    .trim();

/** Tags as the notes module accepts them: no commas, no blanks, no repeats, a sensible length. */
export function cleanTags(raw: readonly string[]): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const entry of raw) {
    // A leading "#" is how tags are written in running text, not part of the name.
    const tag = unquote(entry).replace(/^#/, "").replace(/\s+/g, " ").trim();
    const key = tag.normalize("NFC").toLowerCase();
    if (!tag || tag.length > MAX_TAG_LENGTH || tag.includes(",") || seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
    if (tags.length === MAX_TAGS) break;
  }
  return tags;
}

/**
 * Reads the two things an import uses from front matter: `title` and `tags`. Front
 * matter is YAML, but these two keys are written in a handful of simple ways (a
 * string; `[a, b]`; `a, b`; a dashed list), which is all that is understood here.
 */
export function parseFrontmatter(raw: string): { title?: string; tags: string[] } {
  const lines = raw.split(/\r?\n/);
  let title: string | undefined;
  const tags: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const match = /^([A-Za-z_][\w-]*)[ \t]*:(.*)$/.exec(lines[index]!);
    if (!match) continue;
    const key = match[1]!.toLowerCase();
    const value = match[2]!.trim();
    if (key === "title") {
      title = unquote(value) || undefined;
    } else if (key === "tags" || key === "tag") {
      if (value === "") {
        while (index + 1 < lines.length) {
          const item = /^\s*-\s+(.*)$/.exec(lines[index + 1]!);
          if (!item) break;
          tags.push(item[1]!);
          index += 1;
        }
      } else {
        tags.push(...value.replace(/^\[(.*)\]$/, "$1").split(","));
      }
    }
  }
  return { title, tags: cleanTags(tags) };
}

const sameTitle = (a: string, b: string): boolean => cleanTitle(a, "").toLowerCase() === cleanTitle(b, "").toLowerCase();

/**
 * Takes a first-level heading off the top of the page when it is the page's title, so
 * the title is not shown twice. A heading that says something else stays where it is.
 */
function takeTitle(doc: NoteDoc, known: string | undefined): { title?: string; doc: NoteDoc } {
  const blocks = doc.content as unknown as PMNode[];
  const first = blocks[0];
  if (first?.type !== "heading" || first.attrs?.level !== 1) return { title: known, doc };
  const heading = docToText({ type: "doc", content: [first] } as unknown as NoteDoc);
  if (!heading.trim() || (known !== undefined && !sameTitle(known, heading))) return { title: known, doc };
  const rest = blocks.slice(1);
  return { title: known ?? heading, doc: { type: "doc", content: rest.length > 0 ? rest : [{ type: "paragraph" }] } as unknown as NoteDoc };
}

/** Plain text as paragraphs: a blank line starts a new one, and line breaks inside one are kept. */
function textToDoc(text: string): NoteDoc {
  const paragraphs = text
    .replace(/^﻿/, "")
    .split(/\r?\n[ \t]*(?:\r?\n[ \t]*)+/)
    .map((part) => part.replace(/\s+$/, ""))
    .filter((part) => part.trim())
    .map((part) => {
      const content: PMNode[] = [];
      part.split(/\r?\n/).forEach((line, index) => {
        if (index > 0) content.push({ type: "hardBreak" });
        if (line) content.push({ type: "text", text: line });
      });
      return { type: "paragraph", content };
    });
  return { type: "doc", content: paragraphs.length > 0 ? paragraphs : [{ type: "paragraph" }] } as unknown as NoteDoc;
}

/** An address that means something as it stands: in-app, on the web, or a place on the same page. */
function standsAlone(address: string): boolean {
  return (
    parseInAppHref(address) !== null || /^[A-Za-z][A-Za-z0-9+.-]*:/.test(address) || address.startsWith("#") || address.startsWith("//")
  );
}

const paragraphOf = (text: string, href?: string): PMNode => ({
  type: "paragraph",
  content: [href ? { type: "text", text, marks: [{ type: "link", attrs: { href } }] } : { type: "text", text }],
});

/**
 * Removes every address that would be dead on arrival. Runs after the converter, so it
 * sees what the resolver could not place.
 */
function settleAddresses(doc: NoteDoc): { doc: NoteDoc; externalImages: number; missing: string[] } {
  const missing = new Set<string>();
  let externalImages = 0;

  const text = (node: PMNode): PMNode => {
    const link = node.marks?.find((mark) => mark.type === "link");
    const href = typeof link?.attrs?.href === "string" ? link.attrs.href : "";
    if (!link || standsAlone(href)) return node;
    missing.add(href);
    const marks = (node.marks ?? []).filter((mark) => mark !== link);
    return marks.length > 0 ? { ...node, marks } : { type: "text", text: node.text };
  };

  const image = (node: PMNode): PMNode[] => {
    const src = typeof node.attrs?.src === "string" ? node.attrs.src : "";
    if (parseInAppHref(src) !== null || src.startsWith("data:")) return [node];
    const label = String(node.attrs?.alt || node.attrs?.title || "").trim();
    if (/^https?:/i.test(src)) {
      externalImages += 1;
      return [paragraphOf(label || src, src)];
    }
    missing.add(src);
    return label ? [paragraphOf(label)] : [];
  };

  const visit = (node: PMNode): PMNode[] => {
    if (node.type === "image") return image(node);
    if (node.type === "text") return [text(node)];
    if (!Array.isArray(node.content)) return [node];
    return [{ ...node, content: node.content.flatMap(visit) }];
  };

  const settled = sanitizeDoc({ type: "doc", content: (doc.content as unknown as PMNode[]).flatMap(visit) });
  return { doc: settled, externalImages, missing: [...missing] };
}

/**
 * Converts the text of a file. `resolve` is asked about every address; without it, or
 * when it answers null, the address is treated as pointing nowhere inside Outpost.
 */
export function convertPage(format: Exclude<ImportItemFormat, "csv" | "folder">, raw: string, resolve?: ResolveLink): ConvertedPage {
  const hrefs = new Set<string>();
  const resolveLink = (href: string) => {
    hrefs.add(href);
    return resolve?.(href) ?? null;
  };

  let doc: NoteDoc;
  let title: string | undefined;
  let tags: string[] = [];
  let warnings: string[] = [];

  if (format === "markdown") {
    const result = markdownToDoc(raw, { resolveLink });
    const meta = result.frontmatter === undefined ? { title: undefined, tags: [] } : parseFrontmatter(result.frontmatter);
    ({ doc, title } = takeTitle(result.doc, meta.title));
    tags = meta.tags;
    warnings = result.warnings;
  } else if (format === "html") {
    const result = htmlToDoc(raw, { resolveLink });
    ({ doc, title } = takeTitle(result.doc, result.title));
    warnings = result.warnings;
  } else {
    doc = textToDoc(raw);
  }

  const settled = settleAddresses(doc);
  return {
    title: title === undefined ? undefined : cleanTitle(title),
    doc: settled.doc,
    tags,
    warnings,
    hrefs: [...hrefs],
    externalImages: settled.externalImages,
    missing: settled.missing,
  };
}

// ── What the source holds that a page cannot ────────────────────────────────

const count = (text: string, pattern: RegExp): number => text.match(pattern)?.length ?? 0;

/** Markdown with its code taken out, so that a `$` or a tag inside an example is not mistaken for the real thing. */
function withoutCode(markdown: string): string {
  return markdown.replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[ \t]*$/gm, "").replace(/`[^`\n]*`/g, "");
}

/**
 * Counts the constructs in a source file that can be recognised with confidence.
 * Nothing here guesses: a bare address on its own line may or may not have been a
 * Notion embed, so it is not counted as one.
 */
export function scanConstructs(format: ImportItemFormat, raw: string): Partial<Record<ImportConstructKind, number>> {
  if (format !== "markdown" && format !== "html") return {};
  const found: Partial<Record<ImportConstructKind, number>> = {};
  const add = (kind: ImportConstructKind, n: number) => {
    if (n > 0) found[kind] = (found[kind] ?? 0) + n;
  };
  const text = format === "markdown" ? withoutCode(raw) : raw;

  add("embedded-media", count(text, /<(?:iframe|video|audio|embed|object)\b/gi));
  add("html-comment", count(text, /<!--/g));
  add("callout", count(text, /<aside\b/gi));
  add("toggle", count(text, /<details\b/gi));

  if (format === "html") {
    add("equation", count(text, /<math\b/gi));
    add("columns", count(text, /class="[^"]*\bcolumn-list\b/gi));
    return found;
  }

  const blocks = count(text, /\$\$[\s\S]+?\$\$/g);
  const inlineOnly = text.replace(/\$\$[\s\S]+?\$\$/g, "");
  // Inline maths hugs its dollar signs ("$x^2$"); prices ("$5 and $10") do not close that way.
  add("equation", blocks + count(inlineOnly, /(?<![\\$\w])\$(?![\s$])[^$\n]{0,300}?(?<![\s\\])\$(?![\w$])/g));
  add("wiki-link", count(text, /\[\[[^[\]\n]+\]\]/g));
  return found;
}

/** Which kind of loss one of the converter's warnings describes. */
export function kindOfWarning(warning: string): ImportConstructKind {
  if (/footnote/i.test(warning)) return "footnote";
  if (/address that is not allowed/i.test(warning)) return "unsafe-address";
  if (/HTML/.test(warning)) return "html";
  return "other";
}
