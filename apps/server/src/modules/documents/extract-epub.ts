/**
 * Text from an EPUB book.
 *
 * Each document in the reading order, usually a chapter, becomes one section. How the
 * book is taken apart is in `epub-package.ts`, which the reading view shares.
 */

import { expandSelfClosing, isProtected, PROTECTED_MESSAGE, readPackage } from "./epub-package.ts";
import { decodeText, firstHeading, htmlText, parseHtml } from "./extract-text.ts";
import { type Extracted, type ExtractedSection, ExtractionError, type ExtractProgress } from "./extract-types.ts";
import { openZip } from "./zip.ts";

export { expandSelfClosing } from "./epub-package.ts";

const MAX_CHAPTER_BYTES = 32 * 1024 * 1024;
/** Extracted text kept from one book; a guard against archives built to exhaust memory. */
const MAX_BOOK_CHARS = 64 * 1024 * 1024;

export async function extractEpub(file: string, onProgress: (progress: ExtractProgress) => void): Promise<Extracted> {
  const zip = await openZip(file);
  try {
    // A locked book's chapters are scrambled bytes; reading them would index noise.
    if (await isProtected(zip)) throw new ExtractionError(PROTECTED_MESSAGE);
    const { meta, spine } = await readPackage(zip);
    const chapters = spine.map((item) => item.path);
    const sections: ExtractedSection[] = [];
    const notes: string[] = [];
    let skipped = 0;
    let chars = 0;

    for (const [index, chapter] of chapters.entries()) {
      if (chars >= MAX_BOOK_CHARS) {
        notes.push("This book is unusually large, so only the first part of it can be searched.");
        break;
      }
      try {
        const parsed = parseHtml(expandSelfClosing(decodeText(await zip.read(chapter, MAX_CHAPTER_BYTES))));
        const text = htmlText(parsed.tree);
        if (text) {
          // `chapter` is its place in the reading order, which is how the reader finds it again.
          sections.push({ heading: firstHeading(parsed.tree) ?? parsed.title, text, chapter: index + 1 });
          chars += text.length;
        }
      } catch {
        // Oversized, damaged or encrypted chapters are left out; the rest still counts.
        skipped += 1;
      }
      onProgress({ current: index + 1, total: chapters.length, message: `Reading chapter ${index + 1} of ${chapters.length}` });
    }

    if (skipped > 0) {
      notes.push(
        `${skipped} of ${chapters.length} chapters could not be read and ${skipped === 1 ? "is" : "are"} not searchable. The book may be damaged.`,
      );
    }
    return { sections, pageCount: null, meta, notes };
  } finally {
    zip.close();
  }
}
