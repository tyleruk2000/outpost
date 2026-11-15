/**
 * Text from a PDF, one section per page so that a search result can open the document
 * at the page it matched.
 *
 * Runs only inside the extraction worker: parsing a large PDF is long, synchronous
 * work that would otherwise stall every other request to the server.
 */
import fs from "node:fs";
import { getDocumentProxy } from "unpdf";
import { type Extracted, type ExtractedSection, ExtractionError, type ExtractProgress, tidyText } from "./extract-types.ts";

/** Titles that authoring tools write on their own and that say nothing about the content. */
const JUNK_TITLE = /^(untitled|microsoft word - .*|.*\.(docx?|pdf|pptx?|xlsx?|indd|qxd|dvi|tex|rtf))$/i;

interface TextItem {
  str?: string;
  hasEOL?: boolean;
}

function pageText(items: TextItem[]): string {
  let text = "";
  for (const item of items) {
    if (typeof item.str !== "string") continue;
    text += item.str + (item.hasEOL ? "\n" : "");
  }
  return tidyText(text);
}

function clean(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = tidyText(value).slice(0, 300);
  return text || undefined;
}

function openError(error: unknown): ExtractionError {
  const name = (error as { name?: string } | null)?.name;
  if (name === "PasswordException") {
    return new ExtractionError("This PDF is protected with a password, so its text cannot be read. Save a copy without the password and add that instead.");
  }
  return new ExtractionError("This file could not be read as a PDF. It may be damaged or incomplete; check that it opens on your computer.");
}

export async function extractPdf(
  file: string,
  maxPages: number,
  onProgress: (progress: ExtractProgress) => void,
): Promise<Extracted> {
  const data = new Uint8Array(await fs.promises.readFile(file));
  // verbosity 0: the parser's own warnings about odd files would otherwise fill the log.
  const pdf = await getDocumentProxy(data, { verbosity: 0 }).catch((error: unknown) => {
    throw openError(error);
  });

  try {
    const pageCount = pdf.numPages;
    const limit = maxPages > 0 ? Math.min(pageCount, maxPages) : pageCount;
    const sections: ExtractedSection[] = [];
    const notes: string[] = [];
    let unreadable = 0;
    let blank = 0;

    for (let number = 1; number <= limit; number += 1) {
      try {
        const page = await pdf.getPage(number);
        const content = await page.getTextContent();
        const text = pageText(content.items as TextItem[]);
        if (text) sections.push({ page: number, text });
        else blank += 1;
        // Frees the page's parsed objects; without it memory grows with every page.
        page.cleanup();
      } catch {
        // One broken page should not cost the rest of the document.
        unreadable += 1;
      }
      onProgress({ current: number, total: limit, message: `Reading page ${number} of ${limit}` });
    }

    if (limit < pageCount) {
      notes.push(
        `Only the first ${limit.toLocaleString("en")} of ${pageCount.toLocaleString("en")} pages can be searched. An administrator can raise the limit in Settings, then read the text again.`,
      );
    }
    if (unreadable > 0) {
      notes.push(`${unreadable.toLocaleString("en")} ${unreadable === 1 ? "page" : "pages"} could not be read and ${unreadable === 1 ? "is" : "are"} not searchable.`);
    }
    if (sections.length > 0 && blank > limit / 2) {
      notes.push(`${blank.toLocaleString("en")} of ${limit.toLocaleString("en")} pages have no text. They may be scanned images, which cannot be searched in this version.`);
    }

    const info = await pdf.getMetadata().then(
      (metadata) => metadata.info as { Title?: unknown; Author?: unknown },
      () => undefined,
    );
    const title = clean(info?.Title);
    return {
      sections,
      pageCount,
      meta: { title: title && !JUNK_TITLE.test(title) ? title : undefined, author: clean(info?.Author) },
      notes,
    };
  } finally {
    // Ends the document's parser and frees everything it loaded.
    await pdf.loadingTask.destroy().catch(() => undefined);
  }
}
