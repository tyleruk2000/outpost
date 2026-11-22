/**
 * Which household a plan is for, under its title, as the server answered it
 * (`EmergencyPlanResponse.household`), so that a copy kept on a phone says so out of
 * reach too. Nothing with one household. In reach, a plan of a household other than
 * the current one says so, since its list is not the one shown.
 */
import type { PlanHousehold } from "@outpost/shared";
import { Link } from "react-router";
import { useHousehold } from "@/features/households/use-household";
import { cn } from "@/lib/utils";

/** The words alone, for a phone's copy and the printed plan. Null with one household. */
export function planHouseholdWords(household: PlanHousehold | undefined): string | null {
  return household?.several ? `For ${household.name}` : null;
}

export function PlanHouseholdLine({ household, className }: { household: PlanHousehold | undefined; className?: string }) {
  const current = useHousehold().data;
  const words = planHouseholdWords(household);
  if (!words || !household) return null;
  const other = current !== undefined && current.household.id !== household.id;
  return (
    <p className={cn("text-small text-ink-muted", className)} data-testid="plan-household">
      {words}
      {other ? `, not ${current.household.name}, the household Outpost is set to now` : ""} ·{" "}
      <Link to="/prepare/households" className="text-primary underline underline-offset-2">
        Change
      </Link>
    </p>
  );
}

/** The same line on a phone's copy: no link, the server being out of reach. */
export function KeptPlanHouseholdLine({ household, className }: { household: PlanHousehold | undefined; className?: string }) {
  const words = planHouseholdWords(household);
  if (!words) return null;
  return (
    <p className={cn("text-small text-ink-muted", className)} data-testid="plan-household">
      {words}
    </p>
  );
}
