/**
 * Splits text into passages for search and retrieval.
 *
 * Callers hand over "sections": the natural units of a source (a PDF page, the text
 * under a heading). Sections are never merged, so a passage always belongs to exactly
 * one page and one heading and can be cited precisely. Long sections are cut at
 * paragraph, then sentence, then word boundaries, with a small overlap so a sentence
 * that straddles a cut is still found whole in one of the two passages.
 */
import { sha256Hex } from "../../core/ids.ts";

export interface Section {
  text: string;
  heading?: string;
  page?: number;
}

export interface Passage {
  ordinal: number;
  text: string;
  heading: string;
  page: number | null;
  /** Offsets into the concatenation of all section texts, joined by a blank line. */
  charStart: number;
  charEnd: number;
  contentHash: string;
}

export interface ChunkOptions {
  size: number;
  overlap: number;
}

const SECTION_JOIN = "\n\n".length;

/** Best place to cut `text` at or before `limit`, preferring larger boundaries. */
function cutPoint(text: string, limit: number): number {
  if (text.length <= limit) return text.length;
  const window = text.slice(0, limit);
  const floor = Math.floor(limit * 0.5);
  const paragraph = window.lastIndexOf("\n\n");
  if (paragraph >= floor) return paragraph + 2;
  const sentence = Math.max(window.lastIndexOf(". "), window.lastIndexOf("? "), window.lastIndexOf("! "), window.lastIndexOf(".\n"));
  if (sentence >= floor) return sentence + 2;
  const line = window.lastIndexOf("\n");
  if (line >= floor) return line + 1;
  const space = window.lastIndexOf(" ");
  if (space >= floor) return space + 1;
  return limit;
}

/** Moves an overlap start forward to the beginning of a word. */
function wordStart(text: string, index: number): number {
  if (index <= 0) return 0;
  const next = text.indexOf(" ", index);
  return next === -1 || next > index + 80 ? index : next + 1;
}

export function chunkSections(sections: Section[], options: ChunkOptions): Passage[] {
  const size = Math.max(200, options.size);
  const overlap = Math.min(Math.max(0, options.overlap), Math.floor(size / 2));
  const passages: Passage[] = [];
  let base = 0;

  for (const section of sections) {
    const text = section.text.replace(/\r\n?/g, "\n");
    let offset = 0;
    while (offset < text.length) {
      const remaining = text.slice(offset);
      const end = offset + cutPoint(remaining, size);
      const raw = text.slice(offset, end);
      const trimmed = raw.trim();
      if (trimmed) {
        const lead = raw.length - raw.trimStart().length;
        passages.push({
          ordinal: passages.length,
          text: trimmed,
          heading: section.heading?.trim() ?? "",
          page: section.page ?? null,
          charStart: base + offset + lead,
          charEnd: base + offset + lead + trimmed.length,
          contentHash: sha256Hex(trimmed).slice(0, 32),
        });
      }
      if (end >= text.length) break;
      offset = Math.max(offset + 1, wordStart(text, end - overlap));
    }
    base += text.length + SECTION_JOIN;
  }
  return passages;
}
