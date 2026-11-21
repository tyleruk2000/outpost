/**
 * The settlement on the server, read with `useSteading` and changed with
 * `useSteadingAction`. The server is the authority and stamps every action with its own
 * clock. Between fetches the screen works the settlement out with the device's clock,
 * corrected by how far it is from the server's, for drawing only. The key starts with
 * "games", which the "games.changed" event refreshes when any device changes it.
 */
import type { SteadingAction, SteadingResponse } from "@outpost/shared/games/steading";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, errorMessage } from "@/lib/api";
import { notify } from "@/lib/notify";

export const steadingKey = ["games", "steading"] as const;

export interface SteadingView extends SteadingResponse {
  /** The server's clock less this device's when the answer came. */
  clockOffset: number;
}

const withOffset = (answer: SteadingResponse): SteadingView => ({ ...answer, clockOffset: answer.now - Date.now() });

export function useSteading() {
  return useQuery({
    queryKey: steadingKey,
    queryFn: async () => withOffset(await api.get<SteadingResponse>("/api/games/steading")),
  });
}

export function useSteadingAction(onDone?: (action: SteadingAction, before: SteadingView | undefined, after: SteadingView) => void) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (action: SteadingAction) => withOffset(await api.post<SteadingResponse>("/api/games/steading/actions", action)),
    onSuccess: (after, action) => {
      const before = client.getQueryData<SteadingView>(steadingKey);
      client.setQueryData(steadingKey, after);
      onDone?.(action, before, after);
    },
    // A refused action is said in the server's own words; nothing in the settlement changed.
    onError: (error) => notify.error(errorMessage(error)),
  });
}
