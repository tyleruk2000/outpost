/**
 * The board, seen from other screens: one quiet line on Home when there is something
 * newer than this device has seen, and a line on an emergency plan in use. Home's line
 * is refreshed by the `board.changed` event (its query key starts with "board"), never
 * by a poll.
 */
import { MessageSquareText } from "lucide-react";
import { useRef } from "react";
import { Link } from "react-router";
import { useBoardSummary, useSeenAt } from "./data";

/** A device that has never opened the board counts what came in over the last day. */
const NEVER_SEEN_WINDOW_MS = 24 * 60 * 60 * 1000;

/** "2 new on the board", or nothing at all. */
export function BoardHomeLine({ className }: { className?: string }) {
  const seen = useSeenAt();
  // Fixed for the life of the line, so that the query key does not change on every draw.
  const fallback = useRef(Date.now() - NEVER_SEEN_WINDOW_MS).current;
  const summary = useBoardSummary(seen ?? fallback);
  const count = summary.data?.newSince ?? 0;
  if (count === 0) return null;
  return (
    <p className={className}>
      <Link
        to="/messages"
        className="inline-flex min-h-11 items-center gap-2 text-body text-primary underline decoration-1 underline-offset-[0.2em] hover:decoration-2 md:min-h-0"
      >
        <MessageSquareText aria-hidden className="size-4" />
        {count} new on the board
      </Link>
    </p>
  );
}

/** On an emergency plan in use: the way to the board, to check in. The plan's own steps are not touched. */
export function BoardPlanLine({ className }: { className?: string }) {
  return (
    <p className={className}>
      <Link
        to="/messages"
        className="inline-flex min-h-11 items-center gap-2 text-body text-primary underline decoration-1 underline-offset-[0.2em] hover:decoration-2"
      >
        <MessageSquareText aria-hidden className="size-4" />
        Check in on the household board
      </Link>
    </p>
  );
}
