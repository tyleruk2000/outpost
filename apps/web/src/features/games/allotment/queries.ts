/**
 * The plot on the server, read with `useAllotment` and changed with `useAllotmentAction`.
 * The server is the authority and stamps every action with its own clock. Between
 * fetches the screen draws growth with the device's clock, corrected by how far it is
 * from the server's (`clockOffset`), so a device set to the wrong time still shows the
 * plot as it is. The key starts with "games", which the "games.changed" event refreshes.
 */
import type { AllotmentAction, AllotmentResponse } from "@outpost/shared/games/allotment";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api, errorMessage } from "@/lib/api";
import { gamesKey } from "../kit/queries";

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
    // Every minute while the screen is open; never while the tab is hidden (the default).
    refetchInterval: 60_000,
  });
}

export function useAllotmentAction(onDone?: (action: AllotmentAction, before: AllotmentView | undefined, after: AllotmentView) => void) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (action: AllotmentAction) => withOffset(await api.post<AllotmentResponse>("/api/games/allotment/actions", action)),
    onSuccess: (after, action) => {
      const before = client.getQueryData<AllotmentView>(allotmentKey);
      client.setQueryData(allotmentKey, after);
      // The Games page says whether the allotment has been started.
      void client.invalidateQueries({ queryKey: gamesKey, exact: true });
      onDone?.(action, before, after);
    },
    // A refused action is said in the server's own words; nothing on the plot changed.
    onError: (error) => toast.error(errorMessage(error)),
  });
}

/**
 * The device's time now, corrected to the server's, moving every few seconds while the
 * page is visible and not at all while it is hidden.
 */
export function useServerNow(offset: number, everyMs = 5000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    const start = () => {
      setNow(Date.now());
      timer ??= setInterval(() => setNow(Date.now()), everyMs);
    };
    const stop = () => {
      if (timer !== undefined) clearInterval(timer);
      timer = undefined;
    };
    const onVisibility = () => (document.hidden ? stop() : start());
    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [everyMs]);
  return now + offset;
}
