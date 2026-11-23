/**
 * The contents of a book: its parts and chapters in reading order. This is what a
 * book's page is for, so it comes before the details of where the book is stored.
 */
import type { BookChapterDto, BookContentsResponse } from "@outpost/shared";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { ErrorState } from "@/components/page";
import { Skeleton } from "@/components/ui/misc";
import { api } from "@/lib/api";
import { plural } from "@/lib/utils";

/** The key starts with "collections", so the contents follow anything that happens to the book. */
export const useBookContents = (collectionId: string | undefined, enabled = true) =>
  useQuery({
    queryKey: ["collections", "chapters", collectionId],
    queryFn: () => api.get<BookContentsResponse>(`/api/collections/${collectionId}/chapters`),
    enabled: Boolean(collectionId) && enabled,
  });

/** The first chapter, where "Start reading" goes. */
export const firstChapter = (contents: BookContentsResponse | undefined): BookChapterDto | undefined => contents?.sections[0]?.chapters[0];

function ChapterRow({ chapter, readable }: { chapter: BookChapterDto; readable: boolean }) {
  const body = (
    <>
      <span aria-hidden className="tabular w-10 shrink-0 pt-px font-mono text-small text-ink-muted">
        {chapter.number ?? ""}
      </span>
      <span className="min-w-0">
        <span className="block font-title text-body text-ink decoration-primary decoration-1 underline-offset-[0.22em] group-hover:underline">
          {chapter.number ? <span className="sr-only">Chapter {chapter.number}: </span> : null}
          {chapter.title}
        </span>
        {chapter.summary ? <span className="mt-0.5 block text-small text-ink-muted">{chapter.summary}</span> : null}
      </span>
    </>
  );
  const row = "group -mx-3 flex gap-2 rounded-control px-3 py-2.5";
  return (
    <li>
      {readable ? (
        <Link
          to={`/library/documents/${chapter.documentId}`}
          className={`${row} transition-colors duration-(--duration-fast) hover:bg-surface`}
        >
          {body}
        </Link>
      ) : (
        <div className={row}>{body}</div>
      )}
    </li>
  );
}

export function BookContents({
  collectionId,
  readable,
  expected,
}: {
  collectionId: string;
  /** False while the book's storage is disconnected: the contents are listed, but nothing can be opened. */
  readable: boolean;
  /** How many chapters the book is recorded as having, for the skeleton. */
  expected?: number | null;
}) {
  const contents = useBookContents(collectionId);
  const heading = (
    <h2 id="book-contents" className="text-lead font-semibold text-ink">
      Contents
    </h2>
  );

  if (contents.isPending) {
    return (
      <section className="mt-8" aria-labelledby="book-contents" aria-busy>
        {heading}
        <div className="mt-3 grid gap-3">
          {Array.from({ length: Math.min(expected ?? 6, 8) }, (_, row) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: placeholders with no identity
            <Skeleton key={row} className="h-10" />
          ))}
        </div>
      </section>
    );
  }
  if (contents.isError) {
    return (
      <section className="mt-8" aria-labelledby="book-contents">
        {heading}
        <div className="mt-3">
          <ErrorState error={contents.error} onRetry={() => contents.refetch()} />
        </div>
      </section>
    );
  }

  const { sections, total } = contents.data;
  return (
    <section className="mt-8" aria-labelledby="book-contents">
      <div className="flex items-baseline justify-between gap-4">
        {heading}
        <p className="tabular text-small text-ink-muted">{plural(total, "chapter")}</p>
      </div>
      {total === 0 ? (
        <p className="mt-3 text-ink-muted">This book has no chapters left. Remove it, and add it again from Explore to get them back.</p>
      ) : (
        sections.map((section, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: parts of a book in their fixed order; titles may repeat
          <div key={index} className="mt-5 first-of-type:mt-3">
            {section.title ? <h3 className="border-b border-border pb-1.5 text-small font-semibold text-ink">{section.title}</h3> : null}
            <ol className="mt-1">
              {section.chapters.map((chapter) => (
                <ChapterRow key={chapter.key} chapter={chapter} readable={readable} />
              ))}
            </ol>
          </div>
        ))
      )}
    </section>
  );
}
