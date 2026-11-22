/**
 * A printed document from its parts: a cover with nothing round it, sections that each
 * start on a new page with a running header on every page after their first, and plain
 * pages with only the footer. Pure: parts in, pdfmake's document definition out.
 */
import type { Content, ContentSection, DynamicContent, TDocumentDefinitions } from "pdfmake/interfaces";
import { footer, runningHeader } from "./components";
import { measureOf, PRINT_COLOURS, PRINT_FONT, PRINT_MARGINS, PRINT_PAPERS, PRINT_TYPE, type PrintPaper } from "./tokens";

export interface PrintPart {
  /** cover: no header or footer. section: the running header and the footer. plain: the footer only. */
  kind: "cover" | "section" | "plain";
  content: Content[];
  /** The running header's words: "3 · Water". */
  running?: string;
}

export interface PrintBook {
  paper: PrintPaper;
  /** The file's title, as a PDF reader shows it. */
  title: string;
  subject?: string;
  /** When it was made: the file's creation date, so that the same book made twice is dated the same. */
  made: Date;
  /** The footer: the book's name on the left, and the words on the right (a date). */
  footerName: string;
  footerRight: string;
  parts: PrintPart[];
}

/**
 * Which page is a section's first, for its running header. pdfmake lays a document out
 * and then calls each section's header for its pages in order, once a pass, and may make
 * more than one pass; the first page a section's header is asked about in a pass is its
 * first page. A page lower than the last one asked about starts a new pass.
 */
function firstPages() {
  const first = new Map<number, number>();
  let last = 0;
  return (part: number) => (page: number) => {
    if (page < last) first.clear();
    last = page;
    if (!first.has(part)) first.set(part, page);
    return first.get(part) === page;
  };
}

export function printDocument(book: PrintBook): TDocumentDefinitions {
  const paper = PRINT_PAPERS[book.paper];
  const measure = measureOf(book.paper);
  const isFirst = firstPages();
  const foot = footer(book.footerName, book.footerRight, PRINT_MARGINS);
  const sections: ContentSection[] = book.parts.map((part, index) => ({
    section: part.content,
    header: part.kind === "section" && part.running ? runningHeader(part.running, PRINT_MARGINS, measure, isFirst(index)) : null,
    footer: part.kind === "cover" ? null : foot,
  }));
  return {
    pageSize: { width: paper.width, height: paper.height },
    pageMargins: PRINT_MARGINS,
    content: sections,
    defaultStyle: { font: PRINT_FONT, fontSize: PRINT_TYPE.body, lineHeight: PRINT_TYPE.leading, color: PRINT_COLOURS.ink },
    info: { title: book.title, subject: book.subject, author: "Outpost", creator: "Outpost", producer: "Outpost", creationDate: book.made },
    language: "en-GB",
  } as TDocumentDefinitions;
}

/** Every dynamic header and footer in a document, wrapped to note the page count pdfmake gives them. */
export function countingPages(doc: TDocumentDefinitions): { doc: TDocumentDefinitions; pages: () => number } {
  let pages = 0;
  const wrap = (getter: unknown) =>
    typeof getter === "function"
      ? (((page: number, count: number, size: never) => {
          pages = Math.max(pages, count);
          return (getter as DynamicContent)(page, count, size);
        }) as DynamicContent)
      : getter;
  const content = Array.isArray(doc.content)
    ? (doc.content as Content[]).map((part) =>
        part && typeof part === "object" && "section" in part
          ? { ...part, header: wrap((part as ContentSection).header), footer: wrap((part as ContentSection).footer) }
          : part,
      )
    : doc.content;
  return {
    doc: { ...doc, content: content as Content, header: wrap(doc.header) as never, footer: wrap(doc.footer) as never },
    pages: () => pages,
  };
}
