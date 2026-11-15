/**
 * Reads a page document as plain text: for previews and change detection
 * (`docToText`), for the search index (`docToSections`) and to find what a page links
 * to (`extractLinks`). These never change a document and never throw on odd input.
 */
import type { NoteDoc } from "@outpost/shared";
import { type PMNode, parseInAppHref, ruleOf } from "./schema.ts";

type DocInput = NoteDoc | PMNode | null | undefined;

/** A passage for the search index: the text under one heading. Matches the index's `Section`. */
export interface NoteSection {
  heading?: string;
  text: string;
}

export interface NoteLinks {
  noteIds: string[];
  documentIds: string[];
  attachmentIds: string[];
}

const childrenOf = (node: DocInput): PMNode[] => (node && Array.isArray(node.content) ? (node.content as PMNode[]) : []);
const attr = (node: PMNode, name: string): string => {
  const value = node.attrs?.[name];
  return typeof value === "string" ? value : "";
};

/** Text of inline content. A page link reads as its label, a hard break as a new line. */
export function inlineText(node: PMNode): string {
  let text = "";
  for (const child of childrenOf(node)) {
    if (child.type === "text") text += child.text ?? "";
    else if (child.type === "hardBreak") text += "\n";
    else if (child.type === "pageLink") text += attr(child, "label");
    else text += inlineText(child);
  }
  return text;
}

/** Appends the lines of text a block contributes. */
function blockLines(node: PMNode, lines: string[]): void {
  const push = (line: string) => {
    if (line.trim()) lines.push(line.trim());
  };
  switch (node.type) {
    case "image":
      push(attr(node, "alt") || attr(node, "title"));
      return;
    case "documentEmbed":
      push(attr(node, "title"));
      return;
    case "horizontalRule":
      return;
    case "tableRow": {
      // One line per row keeps a row's cells together in a search passage.
      const cells = childrenOf(node).map((cell) => {
        const cellLines: string[] = [];
        blockLines(cell, cellLines);
        return cellLines.join(" ");
      });
      push(cells.filter(Boolean).join(" | "));
      return;
    }
    default: {
      const content = ruleOf(node.type)?.content.kind;
      if (content === "inline" || content === "text") {
        push(inlineText(node));
        return;
      }
      for (const child of childrenOf(node)) blockLines(child, lines);
    }
  }
}

/** Everything a person can read on the page, one block per line. */
export function docToText(doc: DocInput): string {
  if (!doc) return "";
  const lines: string[] = [];
  for (const block of childrenOf(doc)) blockLines(block, lines);
  return lines.join("\n");
}

/**
 * Splits a page at its top-level headings. Headings inside a callout, a quote or a
 * toggle stay part of the surrounding section: they label a detail, not a section.
 */
export function docToSections(doc: DocInput): NoteSection[] {
  if (!doc) return [];
  const sections: NoteSection[] = [];
  let heading: string | undefined;
  let lines: string[] = [];
  const flush = () => {
    const text = lines.join("\n");
    // The index skips passages without text, so a heading with nothing under it yet
    // carries its own words; otherwise an outline of headings could not be found.
    if (text) sections.push(heading ? { heading, text } : { text });
    else if (heading) sections.push({ heading, text: heading });
    lines = [];
  };
  for (const block of childrenOf(doc)) {
    if (block.type === "heading") {
      flush();
      heading = inlineText(block).replace(/\s+/g, " ").trim() || undefined;
    } else {
      blockLines(block, lines);
    }
  }
  flush();
  return sections;
}

/** The pages, library documents and attachments a page refers to, each listed once. */
export function extractLinks(doc: DocInput): NoteLinks {
  const noteIds = new Set<string>();
  const documentIds = new Set<string>();
  const attachmentIds = new Set<string>();

  const addHref = (href: unknown) => {
    if (typeof href !== "string") return;
    const target = parseInAppHref(href);
    if (target?.type === "note") noteIds.add(target.noteId);
    else if (target?.type === "document") documentIds.add(target.documentId);
    else if (target?.type === "attachment") attachmentIds.add(target.attachmentId);
  };

  const visit = (node: PMNode) => {
    if (node.type === "pageLink" && attr(node, "noteId")) noteIds.add(attr(node, "noteId"));
    else if (node.type === "documentEmbed" && attr(node, "documentId")) documentIds.add(attr(node, "documentId"));
    else if (node.type === "image") {
      const target = parseInAppHref(attr(node, "src"));
      if (target?.type === "attachment") attachmentIds.add(target.attachmentId);
    }
    for (const mark of node.marks ?? []) if (mark.type === "link") addHref(mark.attrs?.href);
    for (const child of childrenOf(node)) visit(child);
  };
  if (doc) visit(doc as PMNode);

  return { noteIds: [...noteIds], documentIds: [...documentIds], attachmentIds: [...attachmentIds] };
}
