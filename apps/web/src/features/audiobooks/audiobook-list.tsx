/**
 * The Library's documents, narrowed to audiobooks: each book once, however many files
 * it has, and each recording added on its own. Shown in place of the document list
 * when the Type filter is "Audiobooks".
 */
import { Headphones, Plus } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { EmptyState, ErrorState, Rows } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/misc";
import { plural } from "@/lib/utils";
import { AddAudiobookDialog } from "./add-audiobook";
import { byline, factsLine, useAudiobooks } from "./audiobook-data";
import { readPlace } from "./place";

export function AddAudiobookButton({ variant = "secondary" }: { variant?: "primary" | "secondary" }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)}>
        <Plus /> Add audiobook
      </Button>
      <AddAudiobookDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

function RowSkeleton() {
  return (
    <li className="grid gap-2 py-3.5">
      <Skeleton className="h-5 w-64 max-w-full" />
      <Skeleton className="h-4 w-48 max-w-full" />
    </li>
  );
}

export default function AudiobookList({ q, sort }: { q: string; sort: "added" | "title" }) {
  const list = useAudiobooks(q, sort);
  const books = list.data?.audiobooks ?? [];

  return (
    <div className="mt-3">
      <div className="flex min-h-9 flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="tabular text-small text-ink-muted" aria-live="polite">
          {list.data ? plural(books.length, "audiobook") : ""}
        </p>
        <AddAudiobookButton />
      </div>

      {list.isPending ? (
        <ul className="mt-3 divide-y divide-border border-y border-border" aria-busy aria-label="Loading audiobooks">
          <RowSkeleton />
          <RowSkeleton />
          <RowSkeleton />
        </ul>
      ) : list.isError ? (
        <div className="mt-3">
          <ErrorState error={list.error} onRetry={() => list.refetch()} />
        </div>
      ) : books.length === 0 ? (
        q ? (
          <div className="mt-3 border-y border-border py-10">
            <h2 className="font-title text-heading text-ink">No audiobooks match “{q}”</h2>
            <p className="mt-2 max-w-[52ch] text-ink-muted">Audiobooks are found by title, author and reader.</p>
          </div>
        ) : (
          <EmptyState title="No audiobooks yet" seed={11} className="mt-3" action={<AddAudiobookButton variant="primary" />}>
            <p>
              Add a book's zip, as LibriVox offers it, or its audio files. It is kept on this server and plays here, picking up where you
              left off.
            </p>
            <p className="mt-2 text-small">
              Explore lists{" "}
              <Link to="/explore?category=audiobooks" className="text-primary underline underline-offset-2">
                public-domain audiobooks from LibriVox
              </Link>{" "}
              to download in your browser.
            </p>
          </EmptyState>
        )
      ) : (
        <Rows aria-label="Audiobooks" className="mt-3">
          {books.map((book) => {
            const by = byline(book);
            const started = readPlace(book.id);
            return (
              <li key={book.id}>
                <Link to={book.url} className="group flex items-start gap-3 py-3.5 max-md:min-h-11 md:pointer-coarse:min-h-11">
                  <Headphones aria-hidden className="mt-1 size-4 shrink-0 text-ink-muted" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-title text-lead text-ink decoration-primary decoration-1 underline-offset-[0.22em] group-hover:underline">
                      {book.title}
                    </span>
                    {by ? <span className="mt-0.5 block text-small text-ink-muted">{by}</span> : null}
                    <span className="tabular mt-0.5 block text-small text-ink-muted">
                      {factsLine(book)}
                      {started ? ", started on this device" : ""}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </Rows>
      )}
    </div>
  );
}
