/**
 * Home's two quiet lines for when the internet is down: the household's emergency plan, with
 * the way straight into it, and how many days its food and water last. Each is there only
 * when there is something to say. Both are read once, from what the server already has
 * (`GET /api/emergency-plans`, `GET /api/supplies/outlook`), and refreshed by the
 * `emergency-plans.changed` and `supplies.changed` events, never on a timer.
 */
import { daysWords, type EmergencyPlanSummary, type SupplyOutlook } from "@outpost/shared";
import { ClipboardList, Package } from "lucide-react";
import { Link } from "react-router";
import { useOutlook, usePlans } from "@/features/emergency-plans/data";

const link = "text-primary underline decoration-1 underline-offset-[0.2em] hover:decoration-2";
// The icon beside the first line of words, which wrap under each other rather than under the icon.
const line = "flex items-start gap-2 py-1.5 text-body text-ink-muted md:py-0.5";
const icon = "mt-[0.3em] size-4 shrink-0";

/** The plan to offer: one in use, else the one opened last, else the newest. */
export function planToOffer(plans: EmergencyPlanSummary[]): EmergencyPlanSummary | undefined {
  const score = (plan: EmergencyPlanSummary) => (plan.startedAt !== null ? 1e15 : 0) + (plan.openedAt ?? plan.updatedAt);
  return [...plans].sort((a, b) => score(b) - score(a))[0];
}

/** "food for about 3.8 days, water for about 5.3 days", or null when nothing is stored. */
export function suppliesText(outlook: SupplyOutlook): string | null {
  const { food, water } = outlook;
  if (food.items === 0 && water.items === 0) return null;
  const parts = [
    food.items > 0 && food.days !== null ? `food for ${daysWords(food.days)}` : null,
    water.items > 0 && water.days !== null ? `water for ${daysWords(water.days)}` : null,
  ].filter((part): part is string => part !== null);
  // Kept, but with nobody in the household to divide by: there is no number of days to give.
  if (parts.length === 0) return "add the household to see how long they last";
  return parts.join(", ");
}

export function PreparedLines({ className }: { className?: string }) {
  const plans = usePlans();
  const outlook = useOutlook();
  const plan = plans.data ? planToOffer(plans.data) : undefined;
  const others = (plans.data?.length ?? 0) - 1;
  const supplies = outlook.data ? suppliesText(outlook.data.outlook) : null;
  if (!plan && !supplies) return null;
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
            <Link to={`/prepare/plans/${plan.id}/use`} aria-label={`Use now: ${plan.name}`} className={`${link} font-medium`}>
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
            Supplies:{" "}
            <Link to="/prepare/supplies" className={link}>
              {supplies}
            </Link>
          </span>
        </p>
      ) : null}
    </div>
  );
}
