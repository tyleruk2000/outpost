/**
 * The plot on the server, read with `useAllotment` and changed with `useAllotmentAction`.
 * The server is the authority and stamps every action with its own clock. Between
 * fetches the screen draws growth with the device's clock, corrected by how far it is
 * from the server's (`clockOffset`), so a device set to the wrong time still shows the
 * plot as it is. The key starts with "games", which the "games.changed" event refreshes
 * when any device changes the plot; nothing else asks the server again, since growth is
 * worked out from the time (and the rain from the date).
 */
import {
  type AllotmentAction,
  type AllotmentResponse,
  type AllotmentState,
  type Hemisphere,
  MINUTE,
  untilChangeMs,
} from "@outpost/shared/games/allotment";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { notify } from "@/lib/notify";
import { usePageVisible } from "@/lib/page-visible";

export const allotmentKey = ["games", "allotment"] as const;

export interface AllotmentView extends AllotmentResponse {
  /** The server's clock less this device's when the answer came. */
  clockOffset: number;
}

const withOffset = (answer: AllotmentResponse): AllotmentView => ({ ...answer, clockOffset: answer.now - Date.now() });

export function useAllotment() {
  return useQuery({
    queryKey: allotmentKey,
    queryFn: async () => withOffset(await api.get<AllotmentResponse>("/api/games/allotment")),
  });
}

export function useAllotmentAction(onDone?: (action: AllotmentAction, before: AllotmentView | undefined, after: AllotmentView) => void) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (action: AllotmentAction) => withOffset(await api.post<AllotmentResponse>("/api/games/allotment/actions", action)),
    onSuccess: (after, action) => {
      const before = client.getQueryData<AllotmentView>(allotmentKey);
      client.setQueryData(allotmentKey, after);
      onDone?.(action, before, after);
    },
    // A refused action is said in the server's own words; nothing on the plot changed.
    onError: (error) => notify.error(errorMessage(error)),
  });
}

/**
 * The device's time now, corrected to the server's. It moves on once, `nextMs` after it
 * was last read (the screen asks for the moment the next thing on the plot changes), and
 * not at all while the page is hidden: shown again, it is read afresh.
 */
export function useServerNow(offset: number, nextMs: (now: number) => number): number {
  const visible = usePageVisible();
  const [now, setNow] = useState(() => Date.now());
  const shown = now + offset;
  const wait = nextMs(shown);
  useEffect(() => {
    if (!visible) return;
    // Back in view after a while: the time is read again at once.
    if (Date.now() - now > 1000) {
      setNow(Date.now());
      return;
    }
    const timer = window.setTimeout(() => setNow(Date.now()), wait);
    return () => window.clearTimeout(timer);
  }, [visible, now, wait]);
  return shown;
}

/**
 * How long until something on the plot changes that the screen should show: a bed
 * ripening, drying or being wetted by rain, the rain starting or stopping, the month
 * turning, or an egg, a jar or an apple waiting. At most a minute, for the time left on
 * each bed and the light; never less than a second.
 */
export function untilNextChange(plot: AllotmentState, hemisphere: Hemisphere): number {
  const wait = Math.min(MINUTE, untilChangeMs(plot, hemisphere) ?? MINUTE);
  // A moment past the change, so that it has happened when the plot is drawn again.
  return Math.max(1000, Math.ceil(wait) + 50);
}
