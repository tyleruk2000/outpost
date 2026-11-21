/**
 * The household PIN, as this device sees it: whether one is set, and whether this device
 * is unlocked with it. The server is the authority (`modules/access`); this only reads and
 * asks.
 */
import type { AccessResponse, AccessState, RemovePinBody, SetPinBody, UnlockBody } from "@outpost/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { DEVICE } from "../kept/device";

export const accessKeys = { state: ["access"] as const };

export const useAccess = () =>
  useQuery({ queryKey: accessKeys.state, queryFn: () => api.get<AccessResponse>("/api/access"), select: (data) => data.access });

/** One of the PIN's actions: the answer is the new state, kept at once, and every screen's data is read again. */
function useAccessAction<Body>(path: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: Body) => api.post<AccessResponse>(path, body),
    onSuccess: (data) => {
      client.setQueryData(accessKeys.state, data);
    },
  });
}

export const useUnlock = () => useAccessAction<UnlockBody>("/api/access/unlock");
export const useLock = () => useAccessAction<Record<string, never>>("/api/access/lock");
export const useSetPin = () => useAccessAction<SetPinBody>("/api/access/pin");
export const useRemovePin = () => useAccessAction<RemovePinBody>("/api/access/remove");

export function useLockOthers() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<AccessResponse & { locked: number }>("/api/access/lock-others", {}),
    onSuccess: (data) => client.setQueryData(accessKeys.state, { access: data.access }),
  });
}

/** The words for which way Outpost is set, the same in Settings and wherever else it is said. */
export function accessWords(access: AccessState): string {
  if (access.mode === "open") return "No PIN. Every device that can reach Outpost can read, add, change and delete.";
  return access.canChange
    ? `Household PIN on. This ${DEVICE} is unlocked: it can change and delete. Devices without the PIN can only read.`
    : `Household PIN on. This ${DEVICE} can only read: changing and deleting need the PIN.`;
}
