/**
 * Settings → Who can use this library: the household PIN. Off by default; with it on,
 * every device reads and only devices unlocked with the PIN change or delete.
 */

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/misc";
import { errorMessage } from "@/lib/api";
import { notify } from "@/lib/notify";
import { formatDateTime, plural } from "@/lib/utils";
import { DEVICE } from "../kept/device";
import { accessWords, useAccess, useLock, useLockOthers } from "./data";
import { RemovePinDialog, SetPinDialog, UnlockDialog } from "./pin-dialog";

type Asking = null | "set" | "change" | "remove" | "unlock";

export function AccessPinSetting() {
  const access = useAccess();
  const lock = useLock();
  const lockOthers = useLockOthers();
  const [asking, setAsking] = useState<Asking>(null);
  const close = (open: boolean) => !open && setAsking(null);

  if (access.isPending) return <Skeleton className="h-16" />;
  if (access.isError) return <p className="text-small text-danger">Whether a PIN is set could not be read: {errorMessage(access.error)}</p>;
  const state = access.data;
  const others = state.unlockedDevices - (state.canChange ? 1 : 0);

  return (
    <div className="grid gap-3">
      <div>
        <h3 className="text-small font-medium text-ink">Household PIN</h3>
        <p className="mt-0.5 text-small text-ink-muted">{accessWords(state)}</p>
        {state.mode === "pin" ? (
          <p className="mt-0.5 text-small text-ink-muted">
            Set {formatDateTime(state.pinSetAt ?? 0)}.{" "}
            {state.canChange && state.unlockedAt ? `This ${DEVICE} was unlocked ${formatDateTime(state.unlockedAt)}. ` : null}
            {others > 0 ? `${plural(others, "other device")} unlocked.` : "No other device is unlocked."}
          </p>
        ) : (
          <p className="mt-0.5 text-small text-ink-muted">
            With a PIN, every device still reads. A device changes or deletes only after someone has entered the PIN on it, and stays
            unlocked until it is locked again. A PIN keeps changes to the people who know it; it is not a password against someone who wants
            in.
          </p>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {state.mode === "open" ? (
          <Button onClick={() => setAsking("set")}>Set a PIN</Button>
        ) : state.canChange ? (
          <>
            <Button
              loading={lock.isPending}
              onClick={() =>
                lock.mutate(
                  {},
                  {
                    onSuccess: () => toast.success(`This ${DEVICE} is locked. It can read until the PIN is entered again.`),
                    onError: (error) => notify.error(errorMessage(error)),
                  },
                )
              }
            >
              Lock this {DEVICE}
            </Button>
            {others > 0 ? (
              <Button
                variant="secondary"
                loading={lockOthers.isPending}
                onClick={() =>
                  lockOthers.mutate(undefined, {
                    onSuccess: (data) => toast.success(`${plural(data.locked, "device")} locked.`),
                    onError: (error) => notify.error(errorMessage(error)),
                  })
                }
              >
                Lock every other device
              </Button>
            ) : null}
            <Button variant="ghost" onClick={() => setAsking("change")}>
              Change the PIN
            </Button>
            <Button variant="ghost" className="text-danger" onClick={() => setAsking("remove")}>
              Remove the PIN
            </Button>
          </>
        ) : (
          <Button variant="primary" onClick={() => setAsking("unlock")}>
            Enter the PIN
          </Button>
        )}
      </div>
      {state.mode === "pin" ? (
        <p className="text-small text-ink-muted">
          Forgotten it? Add <span className="font-mono text-[0.8125rem] text-ink">OUTPOST_FORGET_PIN=true</span> to Outpost’s{" "}
          <span className="font-mono text-[0.8125rem] text-ink">.env</span> file, restart Outpost, then take that line out again.
        </p>
      ) : null}
      <SetPinDialog open={asking === "set" || asking === "change"} changing={asking === "change"} onOpenChange={close} />
      <RemovePinDialog open={asking === "remove"} onOpenChange={close} />
      <UnlockDialog open={asking === "unlock"} onOpenChange={close} />
    </div>
  );
}
