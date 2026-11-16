/**
 * "Keep on this phone" for an emergency plan, at the foot of its "Use now" view. A plan
 * holds people's names and numbers, so the action says first that a copy will be on
 * this device. Over plain http it says why nothing can be kept, and where to fix it, as
 * the other keep actions do.
 */
import type { EmergencyPlan } from "@outpost/shared";
import { useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { Notice } from "@/components/page";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/api";
import { formatDateTime, plural, timeAgo } from "@/lib/utils";
import { DEVICE, DeviceIcon, KEEP_ON_THIS_DEVICE } from "./device";
import { keepPlan } from "./plan-copy";
import { keepingSupported, outOfRoomMessage, removeKept, useKept } from "./store";

export function KeepPlanSection({ plan }: { plan: Pick<EmergencyPlan, "id" | "name"> }) {
  const kept = useKept();
  const [busy, setBusy] = useState(false);
  const item = kept?.find((entry) => entry.kind === "plan" && entry.id === plan.id);

  return (
    <section aria-labelledby="keep-plan" className="mt-8 border-t border-border pt-4">
      <h2 id="keep-plan" className="text-body font-semibold text-ink">
        {KEEP_ON_THIS_DEVICE}
      </h2>
      {!keepingSupported() ? (
        <Notice tone="info" className="mt-2">
          Keeping this plan on this {DEVICE}, so that it opens when the server is out of reach, needs Outpost opened at an HTTPS address,
          which this one is not.{" "}
          <Link to="/settings#https" className="font-medium underline underline-offset-2">
            Settings, HTTPS on your network
          </Link>{" "}
          says how to give it one.
        </Notice>
      ) : item && item.kind === "plan" ? (
        <div className="mt-1 grid gap-2">
          <p className="max-w-[62ch] text-small text-ink-muted">
            Kept on this {DEVICE}: copy from {formatDateTime(item.refreshedAt)} ({timeAgo(item.refreshedAt)}). It is brought up to date
            whenever this {DEVICE} has Outpost open within reach of the server.
            {item.pending > 0 ? ` ${plural(item.pending, "tick")} made here ${item.pending === 1 ? "is" : "are"} waiting to be sent.` : ""}
          </p>
          <div>
            <Button
              size="sm"
              variant="ghost"
              className="-ml-2.5"
              onClick={() =>
                void removeKept("plan", plan.id).then(
                  () => toast(`“${plan.name}” is no longer kept on this ${DEVICE}. The plan itself is untouched.`),
                  (error) => toast.error(errorMessage(error)),
                )
              }
            >
              Remove from this {DEVICE}
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-1 grid gap-2">
          <p className="max-w-[62ch] text-small text-ink-muted">
            Keeps this plan in this browser so that “Use now” still opens when this {DEVICE} cannot reach the server: the steps, the numbers
            to call, the people and the places to meet. A copy of the people's names and numbers will be on this {DEVICE}, readable by
            anyone who can open this browser. Steps ticked while the server is out of reach are sent to it when it is back.
          </p>
          <div>
            <Button
              loading={busy}
              onClick={() => {
                setBusy(true);
                keepPlan(plan.id)
                  .then(
                    () => toast.success(`“${plan.name}” is kept on this ${DEVICE}.`),
                    (error) => toast.error(outOfRoomMessage(error) ?? errorMessage(error)),
                  )
                  .finally(() => setBusy(false));
              }}
            >
              <DeviceIcon /> {KEEP_ON_THIS_DEVICE}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
