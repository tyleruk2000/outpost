/**
 * Finding your way round a book from inside a chapter: which book this is and how far
 * through it, at the top; the chapters on either side and the way back to the contents,
 * at the end.
 */
import type { ChapterLinkDto, DocumentChapterDto, DocumentResponse } from "@outpost/shared";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, ChevronLeft } from "lucide-react";
import { Link } from "react-router";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { documentKeys } from "./document-meta";

/** Where a document comes in its book. The document's own details are already loaded, so this asks for nothing new. */
export function useChapter(documentId: string): DocumentChapterDto | undefined {
  return useQuery({
    queryKey: documentKeys.detail(documentId),
    queryFn: () => api.get<DocumentResponse>(`/api/documents/${documentId}`),
    select: (data) => data.chapter,
  }).data;
}

const contentsOf = (chapter: DocumentChapterDto) => `/library/collections/${chapter.collectionId}`;

/** Above the text: the book, as the way back to its contents, and where this chapter comes in it. */
export function ChapterPlace({ chapter }: { chapter: DocumentChapterDto | undefined }) {
  if (!chapter) return null;
  return (
    <nav aria-label="Book" className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-small">
      <Link
        to={contentsOf(chapter)}
        className="-ml-1 inline-flex items-center gap-1 rounded-control font-medium text-primary underline-offset-[0.2em] hover:underline"
      >
        <ChevronLeft aria-hidden className="size-4 self-center" />
        {chapter.bookTitle}
      </Link>
      <span className="tabular text-ink-muted">
        {chapter.section ? `${chapter.section}, ` : ""}
        {chapter.position} of {chapter.total}
      </span>
    </nav>
  );
}

function Neighbour({ to, direction }: { to: ChapterLinkDto; direction: "previous" | "next" }) {
  const next = direction === "next";
  return (
    <Link
      to={`/library/documents/${to.documentId}`}
      rel={next ? "next" : "prev"}
      className={cn(
        "group flex min-w-0 flex-1 basis-56 flex-col gap-0.5 rounded-control border border-border px-4 py-3 transition-colors duration-150 hover:border-border-strong hover:bg-surface",
        next && "sm:items-end sm:text-right",
      )}
    >
      <span className="flex items-center gap-1.5 text-small text-ink-muted">
        {next ? null : <ArrowLeft aria-hidden className="size-4" />}
        {next ? "Next" : "Previous"}
        {next ? <ArrowRight aria-hidden className="size-4" /> : null}
      </span>
      <span className="font-title text-body text-ink decoration-primary decoration-1 underline-offset-[0.22em] group-hover:underline">
        {to.number ? <span className="tabular mr-2 font-mono text-small text-ink-muted">{to.number}</span> : null}
        {to.title}
      </span>
    </Link>
  );
}

/** After the text: the chapters on either side, and the contents. */
export function ChapterTurn({ chapter }: { chapter: DocumentChapterDto | undefined }) {
  if (!chapter) return null;
  return (
    <nav aria-label="Chapters" className="mt-12 max-w-[48rem] border-t border-border pt-6">
      <div className="flex flex-wrap gap-3">
        {chapter.previous ? <Neighbour to={chapter.previous} direction="previous" /> : null}
        {chapter.next ? <Neighbour to={chapter.next} direction="next" /> : null}
      </div>
      <p className="mt-4 text-small text-ink-muted">
        {chapter.next ? null : "This is the last chapter. "}
        <Link
          to={contentsOf(chapter)}
          className="font-medium text-primary underline decoration-1 underline-offset-[0.2em] hover:decoration-2"
        >
          Contents of {chapter.bookTitle}
        </Link>
      </p>
    </nav>
  );
}
