/** A position's Maidenhead locator, written beside its coordinates wherever the map shows them. */
import { toMaidenhead } from "@outpost/shared";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { copyText } from "../hooks";
import type { LatLon } from "../lib/geo";

/** Six characters, the subsquare: what is exchanged on the air and written in a log. */
export const locatorOf = (position: LatLon) => toMaidenhead(position.lat, position.lon, 6) ?? "";

/** "Locator IO83QM", which copies the locator when pressed. */
export function Locator({ position, className }: { position: LatLon; className?: string }) {
  const locator = locatorOf(position);
  if (!locator) return null;
  return (
    <button
      type="button"
      onClick={async () => {
        if (await copyText(locator)) toast.success(`Copied ${locator}`);
      }}
      title="Copy"
      aria-label={`Copy Maidenhead locator ${locator}`}
      className={cn("tabular min-h-6 rounded-[3px] text-left text-small text-ink-muted", className)}
    >
      Locator{" "}
      <span className="font-mono text-[0.8125rem] text-ink underline decoration-border-strong decoration-dotted underline-offset-4 hover:decoration-ink">
        {locator}
      </span>
    </button>
  );
}

/** "IO83QM to IO83XB": the squares a measured path starts and ends in. */
export function PathLocators({ points, className }: { points: LatLon[]; className?: string }) {
  const first = points[0];
  const last = points.at(-1);
  if (!first || !last || points.length < 2) return null;
  return (
    <p className={cn("tabular text-small text-ink-muted", className)}>
      Locators <span className="font-mono text-[0.8125rem] text-ink">{locatorOf(first)}</span> to{" "}
      <span className="font-mono text-[0.8125rem] text-ink">{locatorOf(last)}</span>
    </p>
  );
}
