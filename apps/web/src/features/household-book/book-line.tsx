/**
 * The household book's word on whether the book last made is older than what it is made
 * from: Home's one line, and the notice on the book's own screen. As the binder's
 * (household-papers/binder-line.tsx), read once and refreshed by the events of what the
 * book is made from, never on a timer.
 */
import { BOOK_SOURCES, type BookSource } from "@outpost/shared";
import { BookOpen } from "lucide-react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/api";
import { notify } from "@/lib/notify";
import { cn, formatDate } from "@/lib/utils";
import { useBook, useSaveBook } from "./data";

/**
 * On the emergency plans screens: whether a plan (or every plan) is in the household
 * book, a way to put one in when the book takes only some, and a way to make the book
 * again when it is older than the plans.
 */
export function BookPlansLine({ planId, className }: { planId?: string; className?: string }) {
  const book = useBook();
  const save = useSaveBook();
  const data = book.data;
  if (!data) return null;
  const answers = data.answers;
  const inBook =
    answers.sections.includes("situations") && (answers.planChoice === "all" || (planId ? answers.planIds.includes(planId) : true));
  const stale = data.made !== null && data.stale.includes("plans");
  const putIn = async () => {
    try {
      await save.mutateAsync({
        ...answers,
        sections: answers.sections.includes("situations") ? answers.sections : [...answers.sections, "situations"],
        planIds: planId && !answers.planIds.includes(planId) ? [...answers.planIds, planId] : answers.planIds,
        baseAnswersAt: data.answersAt,
      });
    } catch (error) {
      notify.error(errorMessage(error));
    }
  };
  const link = "text-primary underline decoration-1 underline-offset-[0.2em] hover:decoration-2";
  return (
    <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-2 text-small text-ink-muted", className)}>
      <BookOpen aria-hidden className="size-4 shrink-0" />
      {inBook ? (
        <span>
          {planId
            ? "This plan is in the household book"
            : answers.planChoice === "all"
              ? "Every plan goes in the household book"
              : "The plans you chose go in the household book"}
          {data.made === null
            ? ", which is not made yet"
            : stale
              ? `, made on ${formatDate(data.made.madeAt)}, before the plans last changed`
              : ""}
          .{" "}
          <Link to="/prepare/book" className={link}>
            {data.made === null ? "Make the book" : "Make the book again"}
          </Link>
        </span>
      ) : (
        <>
          <span>{planId ? "This plan is not in the household book." : "The household book has no plans in it."}</span>
          <Button size="sm" loading={save.isPending} onClick={() => void putIn()}>
            Put in the household book
          </Button>
        </>
      )}
    </div>
  );
}

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
