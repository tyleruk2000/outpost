/**
 * Text from a PDF, one section per page so that a search result can open the document
 * at the page it matched.
 *
 * A book's bookmarks (its outline) name the chapter each page falls in: a page's heading
 * is the last bookmark at or before it, the most particular one where they nest ("Chapter
 * 1: Batteries", not "Part one"). Headings are searched and shown as other formats'
 * headings are, so a whole book found by its words says which chapter matched.
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
    return new ExtractionError(
      "This PDF is protected with a password, so its text cannot be read. Save a copy without the password and add that instead.",
    );
  }
  return new ExtractionError(
    "This file could not be read as a PDF. It may be damaged or incomplete; check that it opens on your computer.",
  );
}

/** Bookmarks read at most: a table of contents, not every paragraph of a generated file. */
const MAX_BOOKMARKS = 5_000;

interface OutlineItem {
  title?: unknown;
  dest?: unknown;
  items?: OutlineItem[];
}

type PdfDocument = Awaited<ReturnType<typeof getDocumentProxy>>;

/**
 * Where each bookmark goes, as [page, depth, title], in the order of the outline. A
 * bookmark that goes to no page (a link to a web address, a broken destination) is left
 * out. Never throws: a book without a readable outline is read without one.
 */
async function bookmarks(pdf: PdfDocument): Promise<Array<{ page: number; depth: number; order: number; title: string }>> {
  const outline = (await pdf.getOutline().catch(() => null)) as OutlineItem[] | null;
  if (!outline?.length) return [];
  const found: Array<{ page: number; depth: number; order: number; title: string }> = [];
  const pageOf = async (dest: unknown): Promise<number | null> => {
    const explicit = typeof dest === "string" ? await pdf.getDestination(dest) : dest;
    if (!Array.isArray(explicit) || explicit.length === 0) return null;
    const target = explicit[0];
    // A page given by its number, as some writers do, or by a reference to the page itself.
    if (Number.isInteger(target)) return (target as number) + 1;
    if (target && typeof target === "object") return (await pdf.getPageIndex(target as Parameters<PdfDocument["getPageIndex"]>[0])) + 1;
    return null;
  };
  const walk = async (items: OutlineItem[], depth: number) => {
    for (const item of items) {
      if (found.length >= MAX_BOOKMARKS) return;
      const title = clean(item.title);
      const page = await pageOf(item.dest).catch(() => null);
      if (title && page !== null && page >= 1 && page <= pdf.numPages) found.push({ page, depth, order: found.length, title });
      if (item.items?.length) await walk(item.items, depth + 1);
    }
  };
  await walk(outline, 0);
  return found;
}

/** The heading of each page from 1 to `pages`: the last bookmark at or before it, the deepest among those at one page. */
function headingsByPage(
  marks: Array<{ page: number; depth: number; order: number; title: string }>,
  pages: number,
): Array<string | undefined> {
  const byPage = new Map<number, { depth: number; order: number; title: string }>();
  for (const mark of marks) {
    const held = byPage.get(mark.page);
    // On one page, the deepest bookmark names it; between equally deep ones, the last in the outline.
    if (!held || mark.depth > held.depth || (mark.depth === held.depth && mark.order > held.order)) byPage.set(mark.page, mark);
  }
  const headings: Array<string | undefined> = [];
  let current: string | undefined;
  for (let page = 1; page <= pages; page += 1) {
    current = byPage.get(page)?.title ?? current;
    headings[page] = current;
  }
  return headings;
}

export async function extractPdf(file: string, maxPages: number, onProgress: (progress: ExtractProgress) => void): Promise<Extracted> {
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
    const headings = headingsByPage(await bookmarks(pdf), limit);
    /** The headings of pages without text, for OCR. */
    const pageHeadings: Record<number, string> = {};

    for (let number = 1; number <= limit; number += 1) {
      try {
        const page = await pdf.getPage(number);
        const content = await page.getTextContent();
        const text = pageText(content.items as TextItem[]);
        const heading = headings[number];
        if (text) sections.push(heading ? { page: number, heading, text } : { page: number, text });
        else {
          blank += 1;
          if (heading) pageHeadings[number] = heading;
        }
        // Frees the page's parsed objects; without it memory grows with every page.
        page.cleanup();
      } catch {
        // One broken page should not cost the rest of the document.
        unreadable += 1;
        if (headings[number]) pageHeadings[number] = headings[number]!;
      }
      onProgress({ current: number, total: limit, message: `Reading page ${number} of ${limit}` });
    }

    if (limit < pageCount) {
      notes.push(
        `Only the first ${limit.toLocaleString("en")} of ${pageCount.toLocaleString("en")} pages can be searched. Raise the limit in Settings, then read the text again.`,
      );
    }
    if (unreadable > 0) {
      notes.push(
        `${unreadable.toLocaleString("en")} ${unreadable === 1 ? "page" : "pages"} could not be read and ${unreadable === 1 ? "is" : "are"} not searchable.`,
      );
    }
    if (sections.length > 0 && blank > limit / 2) {
      notes.push(
        `${blank.toLocaleString("en")} of ${limit.toLocaleString("en")} pages have no text of their own. They may be scanned pages (pictures of text).`,
      );
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
      pagesWithoutText: blank + unreadable,
      ...(Object.keys(pageHeadings).length > 0 ? { pageHeadings } : {}),
    };
  } finally {
    // Ends the document's parser and frees everything it loaded.
    await pdf.loadingTask.destroy().catch(() => undefined);
  }
}
