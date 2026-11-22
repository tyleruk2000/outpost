/**
 * The quiet line under a per-household screen's title: "For Caravan · Change". Nothing
 * at all with one household, which is how most Outposts are.
 */
import { Link } from "react-router";
import { cn } from "@/lib/utils";
import { useHousehold } from "./use-household";

export const HOUSEHOLDS_PATH = "/prepare/households";

export function ForHousehold({ className }: { className?: string }) {
  const { data } = useHousehold();
  if (!data?.several) return null;
  return (
    <p className={cn("text-small text-ink-muted", className)} data-testid="for-household">
      For <span className="font-medium text-ink">{data.household.name}</span>
      <span aria-hidden="true"> · </span>
      <span className="sr-only">. </span>
      <Link
        to={HOUSEHOLDS_PATH}
        aria-label={`Change household (now ${data.household.name})`}
        className="inline-flex items-center text-primary underline decoration-1 underline-offset-[0.2em] hover:decoration-2 max-md:min-h-11"
      >
        Change
      </Link>
    </p>
  );
}
