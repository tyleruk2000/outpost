/**
 * Extracted text, kept as one JSON file per document under `<dataDir>/extracted/`.
 *
 * It lives in the data directory rather than beside the original for two reasons: the
 * text stays readable (and re-indexable) while the drive holding the original is
 * unplugged, and nothing but the original is ever written to a person's storage.
 *
 * Text read by OCR is kept in the same file, each section marked as such. While OCR
 * is under way on a long document, the pages read so far are kept beside it in
 * `<id>.ocr.json`, so that a restart continues instead of starting again.
 */
import fs from "node:fs";
import path from "node:path";
import type { AppContext } from "../../core/context.ts";
import { resolveInside } from "../../core/fs-safe.ts";
import type { OcrPage } from "../ocr/types.ts";
import type { ExtractedSection } from "./extract-types.ts";

interface StoredText {
  version: 1;
  documentId: string;
  extractedAt: number;
  sections: ExtractedSection[];
  /** Pages OCR has been run on, whether or not it found text; 0 stands for an image. */
  ocrPages?: number[];
}

/** OCR results waiting to be made part of the document's text. */
interface StoredOcrProgress {
  version: 1;
  documentId: string;
  pages: OcrPage[];
}

export interface StoredDocumentText {
  sections: ExtractedSection[];
  ocrPages: number[];
}

export interface ExtractedStore {
  read(documentId: string): Promise<ExtractedSection[]>;
  /** The sections, and which pages OCR has already been run on. */
  readAll(documentId: string): Promise<StoredDocumentText>;
  write(documentId: string, sections: ExtractedSection[], ocrPages?: number[]): Promise<void>;
  /** Removes everything kept for a document, unfinished OCR included. */
  remove(documentId: string): Promise<void>;
  readOcrProgress(documentId: string): Promise<OcrPage[]>;
  writeOcrProgress(documentId: string, pages: OcrPage[]): Promise<void>;
  clearOcrProgress(documentId: string): Promise<void>;
}

export function createExtractedStore(ctx: AppContext): ExtractedStore {
  const dir = path.join(ctx.config.dataDir, "extracted");
  const fileFor = (documentId: string) => resolveInside(dir, `${documentId}.json`);
  const progressFor = (documentId: string) => resolveInside(dir, `${documentId}.ocr.json`);

  /** Written beside the target and renamed, so a crash never leaves half a file. */
  async function writeJson(file: string, value: unknown): Promise<void> {
    await fs.promises.mkdir(dir, { recursive: true });
    const temporary = `${file}.${process.pid}.tmp`;
    await fs.promises.writeFile(temporary, JSON.stringify(value));
    await fs.promises.rename(temporary, file);
  }

  async function readAll(documentId: string): Promise<StoredDocumentText> {
    try {
      const stored = JSON.parse(await fs.promises.readFile(fileFor(documentId), "utf8")) as StoredText;
      return {
        sections: Array.isArray(stored.sections) ? stored.sections : [],
        ocrPages: Array.isArray(stored.ocrPages) ? stored.ocrPages.filter((page) => Number.isInteger(page)) : [],
      };
    } catch {
      // Not extracted yet, or the file was lost: the document simply has no text.
      return { sections: [], ocrPages: [] };
    }
  }

  return {
    readAll,

    async read(documentId) {
      return (await readAll(documentId)).sections;
    },

    async write(documentId, sections, ocrPages = []) {
      const stored: StoredText = { version: 1, documentId, extractedAt: Date.now(), sections };
      if (ocrPages.length > 0) stored.ocrPages = ocrPages;
      await writeJson(fileFor(documentId), stored);
    },

    async remove(documentId) {
      await fs.promises.rm(fileFor(documentId), { force: true });
      await fs.promises.rm(progressFor(documentId), { force: true });
    },

    async readOcrProgress(documentId) {
      try {
        const stored = JSON.parse(await fs.promises.readFile(progressFor(documentId), "utf8")) as StoredOcrProgress;
        return Array.isArray(stored.pages) ? stored.pages : [];
      } catch {
        return [];
      }
    },

    async writeOcrProgress(documentId, pages) {
      const stored: StoredOcrProgress = { version: 1, documentId, pages };
      await writeJson(progressFor(documentId), stored);
    },

    async clearOcrProgress(documentId) {
      await fs.promises.rm(progressFor(documentId), { force: true });
    },
  };
}
