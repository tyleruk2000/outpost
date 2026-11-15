import type { DocumentDto, DocumentTextResponse } from "@outpost/shared";
import { useQuery } from "@tanstack/react-query";
import { FileWarning, TextSearch } from "lucide-react";
import { Fragment, type ReactNode } from "react";
import { ErrorState } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/misc";
import { api } from "@/lib/api";
import { documentKeys, isReading, kindOfDocument } from "./document-meta";
import { ViewerMessage } from "./document-viewer-message";

/** Files whose line and column positions carry meaning, shown in fixed-width type. */
const isData = (document: Pick<DocumentDto, "ext">) => document.ext === "csv" || document.ext === "json";

/**
 * A table as the server reads it out of a Markdown file: one line per row, cells joined
 * by " | ", the first row being the header. Anything that is not at least two rows of
 * the same two-or-more cells is ordinary text, so a stray "|" in a sentence stays a sentence.
 */
export function tableOf(paragraph: string): string[][] | null {
  const lines = paragraph.split("\n");
  if (lines.length < 2) return null;
  const rows: string[][] = [];
  for (const line of lines) {
    if (!line.includes("|")) return null;
    rows.push(line.split(/ ?\| ?/).map((cell) => cell.trim()));
  }
  const width = rows[0]?.length ?? 0;
  return width >= 2 && rows.every((row) => row.length === width) ? rows : null;
}

const ADDRESS = /https?:\/\/[^\s<>"']+/g;

/**
 * Text with the web addresses in it made into links. The address is all the server kept
 * of a Markdown link, and a list of sources is not much use if they cannot be followed.
 * Only http(s) addresses are linked, and they open away from Outpost.
 */
function Linked({ text }: { text: string }): ReactNode {
  const parts: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(ADDRESS)) {
    // Punctuation that ends the sentence, not the address.
    const address = match[0].replace(/[.,;:!?)\]]+$/, "");
    const start = match.index;
    if (start > last) parts.push(text.slice(last, start));
    parts.push(
      <a key={start} href={address} target="_blank" rel="noreferrer noopener" className="break-all">
        {address}
      </a>,
    );
    last = start + address.length;
  }
  if (parts.length === 0) return text;
  if (last < text.length) parts.push(text.slice(last));
  return parts.map((part, index) => (
    // biome-ignore lint/suspicious/noArrayIndexKey: pieces of one string, in order
    <Fragment key={index}>{part}</Fragment>
  ));
}

/** A table from a document. It keeps its own width and scrolls inside its box, so a phone never scrolls the page sideways. */
function DataTable({ rows }: { rows: string[][] }) {
  const [header = [], ...body] = rows;
  return (
    <section
      className="doc-table scroll-quiet"
      // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrolling region must be reachable by keyboard
      tabIndex={0}
      aria-label={`Table: ${header.filter(Boolean).join(", ")}`}
    >
      <table>
        <thead>
          <tr>
            {header.map((cell, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: columns have no identity beyond their order
              <th key={index} scope="col">
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, rowIndex) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: rows have no identity beyond their order
            <tr key={rowIndex}>
              {row.map((cell, index) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: columns have no identity beyond their order
                <td key={index}>
                  <Linked text={cell} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

/**
 * The text Outpost read from a Markdown, text, HTML, EPUB, CSV or JSON file. The
 * original is never drawn here: an uploaded page must not be able to act inside Outpost.
 */
export function TextViewer({ document, downloadUrl }: { document: DocumentDto; downloadUrl: string }) {
  const reading = isReading(document);
  const text = useQuery({
    queryKey: documentKeys.text(document.id),
    queryFn: () => api.get<DocumentTextResponse>(`/api/documents/${document.id}/text`),
    enabled: document.extraction === "done",
  });
  const kind = kindOfDocument(document);
  const download = (
    <Button asChild>
      <a href={downloadUrl}>Download original</a>
    </Button>
  );

  if (reading) {
    return (
      <ViewerMessage title="Reading this document">
        <p className="flex items-center gap-2.5 text-lamp-ink">
          <span aria-hidden className="size-2 shrink-0 rounded-[2px] bg-lamp" />
          Reading text…
        </p>
        <p>Its text will appear here as soon as Outpost has finished. There is no need to reload.</p>
      </ViewerMessage>
    );
  }
  if (document.extraction === "failed") {
    return (
      <ViewerMessage icon={<FileWarning />} title="The text of this document could not be read" actions={download}>
        {document.extractionDetail ? <p className="text-ink">{document.extractionDetail}</p> : null}
        <p>The original file is safe. Download it to open it in another program, or use “Read text again” in the details.</p>
      </ViewerMessage>
    );
  }
  if (document.extraction === "unsupported") {
    return (
      <ViewerMessage icon={<TextSearch />} title="There is no text to show for this document" actions={download}>
        {document.extractionDetail ? <p className="text-ink">{document.extractionDetail}</p> : null}
        <p>Outpost keeps the original file. Download it to open it in another program.</p>
      </ViewerMessage>
    );
  }

  const sections = text.data?.sections.filter((section) => section.heading || section.text.trim()) ?? [];
  // Markdown is the one type whose tables arrive in a known shape (see `tableOf`).
  const markdown = document.type === "markdown";
  return (
    <section
      // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrolling region must be reachable by keyboard
      tabIndex={0}
      aria-label={`Text of ${document.title}`}
      className="scroll-quiet min-h-0 flex-1 overflow-y-auto bg-page focus-visible:outline-offset-[-2px]"
    >
      <div className={`${markdown ? "max-w-[68rem]" : "max-w-[48rem]"} px-5 pt-6 pb-16 md:px-10 md:pt-8`}>
        <p className="mb-8 max-w-[48rem] border-b border-border pb-4 text-small text-ink-muted">
          This is the text Outpost read from the {document.ext === "txt" ? "text" : kind.label} file, without its original layout.{" "}
          <a href={downloadUrl} className="font-medium text-primary underline decoration-1 underline-offset-[0.2em] hover:decoration-2">
            Download the original
          </a>
        </p>
        {text.isPending ? (
          <div className="grid gap-3" aria-busy>
            <Skeleton className="h-7 w-64 max-w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
          </div>
        ) : text.isError ? (
          <ErrorState error={text.error} onRetry={() => text.refetch()} />
        ) : sections.length === 0 ? (
          <p className="text-ink-muted">This document has no text.</p>
        ) : (
          <article className={markdown ? "prose prose-doc" : "prose"}>
            {sections.map((section, index) => (
              // Long books are many sections; the browser skips laying out the ones far off screen.
              <section
                // biome-ignore lint/suspicious/noArrayIndexKey: sections have no identity beyond their order
                key={index}
                className="[contain-intrinsic-size:auto_24rem] [content-visibility:auto] [&>*+*]:mt-[0.85em] [&>h2:first-child]:mt-[0.65em] first:[&>h2:first-child]:mt-0"
              >
                {section.heading ? <h2>{section.heading}</h2> : null}
                {isData(document) ? (
                  <pre>{section.text}</pre>
                ) : (
                  section.text
                    .split(/\n{2,}/)
                    .filter((paragraph) => paragraph.trim())
                    .map((paragraph, paragraphIndex) => {
                      const table = markdown ? tableOf(paragraph) : null;
                      return table ? (
                        // biome-ignore lint/suspicious/noArrayIndexKey: paragraphs have no identity beyond their order
                        <DataTable key={paragraphIndex} rows={table} />
                      ) : (
                        // biome-ignore lint/suspicious/noArrayIndexKey: paragraphs have no identity beyond their order
                        <p key={paragraphIndex} className="whitespace-pre-wrap">
                          {markdown ? <Linked text={paragraph} /> : paragraph}
                        </p>
                      );
                    })
                )}
              </section>
            ))}
          </article>
        )}
      </div>
    </section>
  );
}
