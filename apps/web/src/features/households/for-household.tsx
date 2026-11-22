/**
 * "For Family · Change": the quiet line under a per-household screen's title that says
 * which household it is for, with the way to the households page. Nothing at all when
 * there is only one household, which is most Outposts.
 */
import { Link } from "react-router";
import { cn } from "@/lib/utils";
import { useHouseholds } from "./use-household";

export function ForHousehold({ className }: { className?: string }) {
  const { data } = useHouseholds();
  const households = Array.isArray(data?.households) ? data.households : [];
  if (households.length < 2) return null;
  const household = households.find((entry) => entry.id === data?.currentId) ?? households[0]!;
  return (
    <p className={cn("text-small text-ink-muted", className)}>
      For {household.name} ·{" "}
      <Link to="/prepare/households" className="text-primary underline underline-offset-2">
        Change
      </Link>
    </p>
  );
}
