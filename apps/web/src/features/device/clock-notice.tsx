import type { SetClockResult } from "@outpost/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Clock } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { api, errorMessage } from "@/lib/api";
import { notify } from "@/lib/notify";
import { DEVICE } from "../kept/device";
import { clockIsWrong, offsetSentence, useServerClock } from "./clock";

/** The button's words, here and on the status screen. */
export const SET_CLOCK = `Set the server's clock from this ${DEVICE}`;

/** Sets the server's clock to this device's, and reads it again. */
export function useSetClock() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<SetClockResult>("/api/device/clock", { deviceNow: Date.now() }),
    onSuccess: async () => {
      toast.success(`The server's clock was set from this ${DEVICE}'s.`);
      await client.invalidateQueries({ queryKey: ["device"] });
    },
    onError: (error) => notify.error(errorMessage(error)),
  });
}

/**
 * A server with no clock that keeps time while it is off, and no internet, starts at the
 * wrong time; everything dated by it (check-ins, readings, backups' ages, sun times) is
 * then wrong too. Each visit compares its clock with this device's, and when they differ
 * by more than a minute says so in a line, with the way to put it right, or why it
 * cannot be put right from here and what to do instead.
 */
export function ClockNotice() {
  const clock = useServerClock();
  const set = useSetClock();
  const [hidden, setHidden] = useState(false);
  if (hidden || !clock.data || !clockIsWrong(clock.data.offsetMs)) return null;
  const { setting } = clock.data.server;
  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border bg-warning-soft px-4 py-2.5 text-small text-ink md:px-6"
    >
      <Clock aria-hidden className="size-4 shrink-0 text-warning" />
      <p className="min-w-0 flex-1 basis-56">
        <span className="font-medium">{offsetSentence(clock.data.offsetMs)}</span>{" "}
        {setting.allowed ? "Times Outpost records and shows are out by as much." : setting.reason}
      </p>
      <div className="flex flex-wrap gap-2">
        {setting.allowed ? (
          <Button size="sm" onClick={() => set.mutate()} disabled={set.isPending}>
            {SET_CLOCK}
          </Button>
        ) : null}
        <Button size="sm" variant="ghost" onClick={() => setHidden(true)}>
          Not now
        </Button>
      </div>
    </div>
  );
}
