/**
 * Home's two quiet lines for when the internet is down: the household's emergency plan, with
 * the way straight into it, and how many days its food and water last. Each is there only
 * when there is something to say. Both are read once, from what the server already has
 * (`GET /api/emergency-plans`, `GET /api/supplies/outlooks`), and refreshed by the
 * `emergency-plans.changed` and `supplies.changed` events, never on a timer.
 *
 * With several households the supplies line is the current household's, headed by its
 * name, and each other household with supplies has a short line of its own under it.
 */
import { daysWords, type EmergencyPlanSummary, localDay, type SupplyOutlook, type SupplyOutlooksResponse } from "@outpost/shared";
import { useQuery } from "@tanstack/react-query";
import { ClipboardList, Package } from "lucide-react";
import { Link } from "react-router";
import { usePlans } from "@/features/emergency-plans/data";
import { api } from "@/lib/api";

const link = "text-primary underline decoration-1 underline-offset-[0.2em] hover:decoration-2";
// The icon beside the first line of words, which wrap under each other rather than under the icon.
const line = "flex items-start gap-2 py-1.5 text-body text-ink-muted md:py-0.5";
const icon = "mt-[0.3em] size-4 shrink-0";

/** The plan to offer: one in use, else the one opened last, else the newest. */
export function planToOffer(plans: EmergencyPlanSummary[]): EmergencyPlanSummary | undefined {
  const score = (plan: EmergencyPlanSummary) => (plan.startedAt !== null ? 1e15 : 0) + (plan.openedAt ?? plan.updatedAt);
  return [...plans].sort((a, b) => score(b) - score(a))[0];
}

const NOBODY = "add the household to see how long they last";

/** "food for about 3.8 days, water for about 5.3 days", or null when nothing is stored. */
export function suppliesText(outlook: SupplyOutlook): string | null {
  const { food, water } = outlook;
  if (food.items === 0 && water.items === 0) return null;
  const parts = [
    food.items > 0 && food.days !== null ? `food for ${daysWords(food.days)}` : null,
    water.items > 0 && water.days !== null ? `water for ${daysWords(water.days)}` : null,
  ].filter((part): part is string => part !== null);
  // Kept, but with nobody in the household to divide by: there is no number of days to give.
  if (parts.length === 0) return NOBODY;
  return parts.join(", ");
}

/** Every household's days of food and water, the current one first, for this device's today. */
const useOutlooks = () =>
  useQuery({
    queryKey: ["supplies", "outlooks", localDay()],
    queryFn: () => api.get<SupplyOutlooksResponse>("/api/supplies/outlooks", { today: localDay() }),
  });

export function PreparedLines({ className }: { className?: string }) {
  const plans = usePlans();
  const outlooks = useOutlooks();
  const plan = plans.data ? planToOffer(plans.data) : undefined;
  const others = (plans.data?.length ?? 0) - 1;
  const households = outlooks.data?.households ?? [];
  const current = households.find((entry) => entry.current) ?? households[0];
  const several = households.length > 1;
  const supplies = current ? suppliesText(current.outlook) : null;
  // Another household: only how long its food and water last, or that nobody is in it to count for.
  const elsewhere = households
    .filter((entry) => entry !== current)
    .flatMap((entry) => {
      const text = suppliesText(entry.outlook);
      if (!text) return [];
      return [{ id: entry.householdId, text: `${entry.name}: ${text === NOBODY ? "nobody in it yet to count days for" : text}` }];
    });
  if (!plan && !supplies && elsewhere.length === 0) return null;
  return (
    <div className={className}>
      {plan ? (
        <p className={line}>
          <ClipboardList aria-hidden className={icon} />
          <span>
            Emergency plan:{" "}
            <Link to={`/prepare/plans/${plan.id}`} className={link}>
              {plan.name}
            </Link>{" "}
            ·{" "}
            <Link
              to={`/prepare/plans/${plan.id}/use`}
              aria-label={`Use now: ${plan.name}`}
              // The one to reach in a hurry: a full 44 px to press on a touch screen, not the line's height.
              className={`${link} font-medium pointer-coarse:-my-3 pointer-coarse:inline-flex pointer-coarse:min-h-11 pointer-coarse:min-w-11 pointer-coarse:items-center`}
            >
              Use now
            </Link>
            {others > 0 ? (
              <>
                {" "}
                ·{" "}
                <Link to="/prepare/plans" className={link}>
                  {others === 1 ? "1 more plan" : `${others} more plans`}
                </Link>
              </>
            ) : null}
          </span>
        </p>
      ) : null}
      {supplies ? (
        <p className={line}>
          <Package aria-hidden className={icon} />
          <span>
            {several && current ? `Supplies for ${current.name}:` : "Supplies:"}{" "}
            <Link to="/prepare/supplies" className={link}>
              {supplies}
            </Link>
          </span>
        </p>
      ) : null}
      {elsewhere.map((entry) => (
        <p key={entry.id} className={`${line} pl-6`}>
          {entry.text}
        </p>
      ))}
    </div>
  );
}
