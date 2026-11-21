/**
 * A line across the top of every screen while this device can only read, because the
 * household PIN is on and has not been entered here. When a change is refused for that
 * reason (`LOCKED_EVENT`), the PIN is asked for at once.
 */
import { useQueryClient } from "@tanstack/react-query";
import { Lock } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { LOCKED_EVENT } from "@/lib/api";
import { DEVICE } from "../kept/device";
import { accessKeys, useAccess } from "./data";
import { UnlockDialog } from "./pin-dialog";

export function AccessNotice() {
  const access = useAccess();
  const client = useQueryClient();
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    const onLocked = () => {
      // The PIN may have been set or changed on another device since this one last asked.
      void client.invalidateQueries({ queryKey: accessKeys.state });
      setAsking(true);
    };
    window.addEventListener(LOCKED_EVENT, onLocked);
    return () => window.removeEventListener(LOCKED_EVENT, onLocked);
  }, [client]);

  const reading = access.data?.mode === "pin" && !access.data.canChange;
  return (
    <>
      {reading ? (
        <div
          role="status"
          className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border bg-surface px-4 py-2.5 text-small text-ink md:px-6"
        >
          <Lock aria-hidden className="size-4 shrink-0 text-ink-muted" strokeWidth={1.6} />
          <p className="min-w-0 flex-1 basis-56">
            <span className="font-medium">This {DEVICE} can read but not change anything.</span> Changing and deleting need the household
            PIN.
          </p>
          <Button size="sm" onClick={() => setAsking(true)}>
            Enter the PIN
          </Button>
        </div>
      ) : null}
      <UnlockDialog open={asking} onOpenChange={setAsking} />
    </>
  );
}
