/**
 * Explore → Audiobooks: a starter shelf of LibriVox recordings, as links.
 *
 * Outpost does not download these itself (docs/sources.md says why): each book has a
 * link to its zip, which the person's own browser downloads, and a button to add that
 * zip once it is on the device. Every entry states its running time, size, reader and
 * licence before anything is fetched.
 */
import { formatBytes, LIBRIVOX_SHELVES, type LibrivoxBookDto } from "@outpost/shared";
import { Download, ExternalLink, Headphones, Plus } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { ErrorState, Rows } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/misc";
import { plural } from "@/lib/utils";
import { AddAudiobookDialog } from "./add-audiobook";
import { runningTime, useLibrivoxShelf } from "./audiobook-data";

function readers(book: LibrivoxBookDto): string {
  if (book.readers.length === 1) return `read by ${book.readers[0]}`;
  if (book.readers.length <= 3) return `read by ${book.readers.join(", ")}`;
  return `read by ${plural(book.readers.length, "volunteer")}`;
}

function BookRow({ book, onAdd }: { book: LibrivoxBookDto; onAdd: (book: LibrivoxBookDto) => void }) {
  return (
    <li className="py-4">
      <h4 className="font-title text-lead text-ink">{book.title}</h4>
      <p className="mt-0.5 text-small text-ink-muted">
        {book.authors.join(", ")}, {readers(book)}
      </p>
      <p className="tabular mt-0.5 text-small text-ink-muted">
        {runningTime(book.totalSeconds)}, {plural(book.sections, "file")}, about {formatBytes(book.approxBytes)} (MP3, 64 kbps)
      </p>
      <p className="mt-2 max-w-[68ch] text-body text-ink">{book.summary}</p>
      <p className="mt-1 text-small text-ink-muted">Public domain in the United States; elsewhere it depends on the country.</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {book.inLibrary ? (
          <Button asChild variant="soft">
            <Link to={book.inLibrary.url}>
              <Headphones /> In your library: listen
            </Link>
          </Button>
        ) : (
          <>
            <Button asChild>
              <a href={book.zipUrl} target="_blank" rel="noreferrer noopener">
                <Download /> Download the zip
              </a>
            </Button>
            <Button onClick={() => onAdd(book)}>
              <Plus /> Add the downloaded zip
            </Button>
          </>
        )}
        <Button asChild variant="ghost">
          <a href={book.pageUrl} target="_blank" rel="noreferrer noopener">
            LibriVox page <ExternalLink />
          </a>
        </Button>
      </div>
    </li>
  );
}

export function LibrivoxShelf() {
  const shelf = useLibrivoxShelf();
  const [adding, setAdding] = useState<LibrivoxBookDto | null>(null);
  const [open, setOpen] = useState(false);

  return (
    <div className="min-w-0 max-lg:mt-3">
      <h2 className="text-lead font-semibold text-ink">Audiobooks</h2>
      <div className="mt-1 mb-2 grid max-w-[68ch] gap-2 text-small text-ink-muted">
        <p>
          Recordings of public-domain books, read by LibriVox's volunteers. Outpost does not download these itself: LibriVox's files are
          kept by the Internet Archive, whose terms Outpost could not read. Download a book's zip in your browser, then add it here or under
          Library, where it plays with its chapters in order.
        </p>
        <p>
          LibriVox says its recordings are public domain in the United States, and that they may not be elsewhere: outside the United
          States, check the status of the book where you live before downloading it.
        </p>
      </div>

      {shelf.isPending ? (
        <div className="mt-4 grid gap-3" aria-busy>
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
      ) : shelf.isError ? (
        <ErrorState error={shelf.error} onRetry={() => shelf.refetch()} />
      ) : shelf.data.books.length === 0 ? (
        <p className="mt-4 text-body text-ink-muted">This copy of Outpost lists no audiobooks.</p>
      ) : (
        LIBRIVOX_SHELVES.map((group) => {
          const books = shelf.data.books.filter((book) => book.shelf === group.id);
          if (books.length === 0) return null;
          return (
            <section key={group.id} className="mt-6" aria-labelledby={`shelf-${group.id}`}>
              <h3 id={`shelf-${group.id}`} className="text-body font-semibold text-ink">
                {group.label} <span className="tabular font-normal text-ink-muted">{books.length}</span>
              </h3>
              <Rows className="mt-1">
                {books.map((book) => (
                  <BookRow
                    key={book.id}
                    book={book}
                    onAdd={(chosen) => {
                      setAdding(chosen);
                      setOpen(true);
                    }}
                  />
                ))}
              </Rows>
            </section>
          );
        })
      )}
      {shelf.data ? <p className="mt-6 text-small text-ink-muted">Records read from LibriVox on {shelf.data.checked}.</p> : null}

      <AddAudiobookDialog
        key={adding?.id ?? "none"}
        open={open}
        onOpenChange={setOpen}
        librivox={adding ? { id: adding.id, title: adding.title, zipName: adding.zipName } : undefined}
      />
    </div>
  );
}
