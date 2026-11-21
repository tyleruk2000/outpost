/** The cover, authors and series of a book brought in from Calibre, in a document's details. Nothing for any other document. */

import { useBookDetails } from "./calibre-data";
import { authorsText, seriesText } from "./calibre-model";

export function CalibreBookDetails({ documentId, title }: { documentId: string; title: string }) {
  const details = useBookDetails(documentId);
  const book = details.data;
  if (!book) return null;
  const series = seriesText(book.series, book.seriesIndex);
  return (
    <section className="border-t border-border px-5 py-5 first:border-t-0">
      <h3 className="mb-3 text-small font-semibold text-ink">From Calibre</h3>
      <div className="flex items-start gap-4">
        {book.coverUrl ? (
          <img
            src={book.coverUrl}
            alt={`Cover of ${title}`}
            className="h-auto w-20 shrink-0 rounded-control border border-border bg-surface object-cover"
          />
        ) : null}
        <dl className="grid min-w-0 gap-2 text-small">
          {book.authors.length > 0 ? (
            <div>
              <dt className="text-ink-muted">{book.authors.length === 1 ? "Author" : "Authors"}</dt>
              <dd className="break-words text-ink">{authorsText(book.authors)}</dd>
            </div>
          ) : null}
          {series ? (
            <div>
              <dt className="text-ink-muted">Series</dt>
              <dd className="break-words text-ink">{series}</dd>
            </div>
          ) : null}
        </dl>
      </div>
    </section>
  );
}
