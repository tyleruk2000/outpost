/**
 * Extracted text, kept as one JSON file per document under `<dataDir>/extracted/`.
 *
 * It lives in the data directory rather than beside the original for two reasons: the
 * text stays readable (and re-indexable) while the drive holding the original is
 * unplugged, and nothing but the original is ever written to a person's storage.
 */
import fs from "node:fs";
import path from "node:path";
import type { AppContext } from "../../core/context.ts";
import { resolveInside } from "../../core/fs-safe.ts";
import type { ExtractedSection } from "./extract-types.ts";

interface StoredText {
  version: 1;
  documentId: string;
  extractedAt: number;
  sections: ExtractedSection[];
}

export interface ExtractedStore {
  read(documentId: string): Promise<ExtractedSection[]>;
  write(documentId: string, sections: ExtractedSection[]): Promise<void>;
  remove(documentId: string): Promise<void>;
}

export function createExtractedStore(ctx: AppContext): ExtractedStore {
  const dir = path.join(ctx.config.dataDir, "extracted");
  const fileFor = (documentId: string) => resolveInside(dir, `${documentId}.json`);

  return {
    async read(documentId) {
      try {
        const stored = JSON.parse(await fs.promises.readFile(fileFor(documentId), "utf8")) as StoredText;
        return Array.isArray(stored.sections) ? stored.sections : [];
      } catch {
        // Not extracted yet, or the file was lost: the document simply has no text.
        return [];
      }
    },

    async write(documentId, sections) {
      await fs.promises.mkdir(dir, { recursive: true });
      const file = fileFor(documentId);
      const stored: StoredText = { version: 1, documentId, extractedAt: Date.now(), sections };
      // Written beside the target and renamed, so a crash never leaves half a file.
      const temporary = `${file}.${process.pid}.tmp`;
      await fs.promises.writeFile(temporary, JSON.stringify(stored));
      await fs.promises.rename(temporary, file);
    },

    async remove(documentId) {
      await fs.promises.rm(fileFor(documentId), { force: true });
    },
  };
}
