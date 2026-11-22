/**
 * The quiet line under a per-household screen's title: "For <household> · Change", with
 * the change on the Households page. Nothing at all with one household (most installs),
 * nor while the households are loading or could not be read.
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
      <Link to="/prepare/households" className="text-primary underline underline-offset-2">
        Change
      </Link>
    </p>
  );
}
