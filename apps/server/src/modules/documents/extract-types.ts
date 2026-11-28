/**
 * What passes between the server and the extraction worker thread. Kept free of
 * imports so that both sides can load it cheaply.
 */

/** File families that have text to read. Images never reach the worker. */
export type ExtractKind = "pdf" | "markdown" | "html" | "text" | "epub";

export interface ExtractRequest {
  filePath: string;
  kind: ExtractKind;
  /** Largest number of PDF pages to read; 0 means no limit. */
  maxPdfPages: number;
}

export interface ExtractedSection {
  text: string;
  heading?: string;
  /** 1-based page number, for PDFs. */
  page?: number;
  /** Set when the text was read from a picture of the page by OCR, not from the file itself. */
  ocr?: true;
  /** For an EPUB: which document of the reading order the text came from, counted from 1. */
  chapter?: number;
}

/** The section under `heading`, or with none when there is none. */
export function withHeading(section: ExtractedSection, heading: string | undefined): ExtractedSection {
  const { heading: _old, ...rest } = section;
  return heading ? { ...rest, heading } : rest;
}

export interface Extracted {
  sections: ExtractedSection[];
  /** Pages in the whole PDF (not only those read); null for other types. */
  pageCount: number | null;
  /** Metadata found inside the file. Only ever used to fill fields a person left empty. */
  meta: { title?: string; author?: string; language?: string };
  /** Things a person should know about the result, such as that it was cut short. */
  notes: string[];
  /**
   * For PDFs: how many of the pages read gave no text, which is what a scanned page
   * (a picture of text) looks like.
   */
  pagesWithoutText?: number;
  /**
   * For PDFs with bookmarks: the heading of each page that gave no text, by page number,
   * for the text OCR reads from it later.
   */
  pageHeadings?: Record<number, string>;
}

export interface ExtractProgress {
  current: number;
  total: number;
  message?: string;
}

export type WorkerMessage =
  | { kind: "progress"; progress: ExtractProgress }
  | { kind: "done"; result: Extracted }
  /** `friendly` messages were written for people; others are raw parser errors. */
  | { kind: "error"; message: string; friendly: boolean };

/** A failure whose message can be shown to a person as it is. */
export class ExtractionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExtractionError";
  }
}

/** Collapses the whitespace PDFs and HTML leave behind without losing line structure. */
export function tidyText(text: string): string {
  return (
    text
      // biome-ignore lint/suspicious/noControlCharactersInRegex: NUL and friends break SQLite text and JSON consumers
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
      .replace(/\r\n?/g, "\n")
      .replace(/[^\S\n]+/g, " ")
      .replace(/ ?\n ?/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}
