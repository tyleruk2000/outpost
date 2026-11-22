/**
 * The quiet line under a per-household screen's title: "For Caravan · Change". Nothing
 * when there is only one household, so most installations see no change.
 */
import { Link } from "react-router";
import { cn } from "@/lib/utils";
import { useHousehold } from "./use-household";

export function ForHousehold({ className }: { className?: string }) {
  const { data } = useHousehold();
  if (!data?.several) return null;
  return (
    <p className={cn("text-small text-ink-muted", className)} data-testid="for-household">
      For {data.household.name} ·{" "}
      <Link
        to="/prepare/households"
        className="text-primary underline decoration-1 underline-offset-[0.2em] hover:decoration-2"
        aria-label={`Change household (now ${data.household.name})`}
      >
        Change
      </Link>
    </p>
  );
}
