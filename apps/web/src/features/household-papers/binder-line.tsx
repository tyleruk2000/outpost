/**
 * Home's one line about the household binder: there only when the binder last made is
 * older than what is in it. Read once (`GET /api/household-binder`) and refreshed by the
 * events of what it is made from, never on a timer.
 */
import { BINDER_PARTS, type BinderPart } from "@outpost/shared";
import { BookCopy } from "lucide-react";
import { Link } from "react-router";
import { formatDate } from "@/lib/utils";
import { useBinderStatus } from "./data";

/** "emergency plans, medical sheets and keeping in touch". */
export const partsWords = (parts: readonly BinderPart[]) => {
  const names = parts.map((id) => (BINDER_PARTS.find((part) => part.id === id)?.label ?? id).toLowerCase());
  return names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
};

export function BinderHomeLine({ className }: { className?: string }) {
  const status = useBinderStatus();
  const made = status.data?.made;
  if (!made || !status.data || status.data.stale.length === 0) return null;
  return (
    <div className={className}>
      <p className="flex items-start gap-2 py-1.5 text-body text-ink-muted md:py-0.5">
        <BookCopy aria-hidden className="mt-[0.3em] size-4 shrink-0" />
        <span>
          The household binder made on {formatDate(made.madeAt)} is older than its {partsWords(status.data.stale)}:{" "}
          <Link to="/prepare/binder" className="text-primary underline decoration-1 underline-offset-[0.2em] hover:decoration-2">
            make it again
          </Link>
        </span>
      </p>
    </div>
  );
}
