/**
 * The household book's word on whether the book last made is older than what it is made
 * from: Home's one line, and the notice on the book's own screen. As the binder's
 * (household-papers/binder-line.tsx), read once and refreshed by the events of what the
 * book is made from, never on a timer.
 */
import { BOOK_SOURCES, type BookSource } from "@outpost/shared";
import { BookOpen } from "lucide-react";
import { Link } from "react-router";
import { formatDate } from "@/lib/utils";
import { useBook } from "./data";

/** "answers, saved places and medical sheets". */
export const sourcesWords = (sources: readonly BookSource[]) => {
  const names = sources.map((id) => BOOK_SOURCES.find((source) => source.id === id)?.label ?? id);
  return names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
};

export function BookHomeLine({ className }: { className?: string }) {
  const book = useBook();
  const made = book.data?.made;
  if (!made || !book.data || book.data.stale.length === 0) return null;
  return (
    <div className={className}>
      <p className="flex items-start gap-2 py-1.5 text-body text-ink-muted md:py-0.5">
        <BookOpen aria-hidden className="mt-[0.3em] size-4 shrink-0" />
        <span>
          The household book made on {formatDate(made.madeAt)} is older than its {sourcesWords(book.data.stale)}:{" "}
          <Link to="/prepare/book" className="text-primary underline decoration-1 underline-offset-[0.2em] hover:decoration-2">
            make it again
          </Link>
        </span>
      </p>
    </div>
  );
}
