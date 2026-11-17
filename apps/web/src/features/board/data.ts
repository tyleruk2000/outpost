/**
 * The board's data: queries and changes against the server, and the two things kept on
 * this device only, the name it posts under and the newest message it has shown.
 *
 * Every query key starts with "board", which is what the `board.changed` event refreshes
 * (`lib/events.tsx`): new messages arrive by the live-events stream and nothing polls. A
 * hidden tab fetches nothing and catches up once when it is shown.
 */
import {
  BOARD_CHANNEL,
  type BoardCheckInInput,
  type BoardMessage,
  type BoardMessageResponse,
  type BoardMessagesResponse,
  type BoardSummaryResponse,
} from "@outpost/shared";
import { type InfiniteData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";
import { api } from "@/lib/api";

// ── Kept on this device ──

const NAME_KEY = "outpost.board.name";
const SEEN_KEY = "outpost.board.seenAt";
const changed = new Set<() => void>();

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Private browsing with storage refused: kept for this visit only.
    memory.set(key, value);
  }
  for (const listener of changed) listener();
}

const memory = new Map<string, string | null>();
const stored = (key: string) => (memory.has(key) ? memory.get(key)! : read(key));

function subscribe(listener: () => void): () => void {
  changed.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === NAME_KEY || event.key === SEEN_KEY) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    changed.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** The name this device posts under, or null until one is chosen. */
export const deviceName = () => stored(NAME_KEY);
export const setDeviceName = (name: string | null) => write(NAME_KEY, name?.trim() ? name.trim() : null);
export const useDeviceName = () => useSyncExternalStore(subscribe, deviceName, () => null);

/** The newest message this device has shown on the board, or null if it never has. */
export function seenAt(): number | null {
  const value = Number(stored(SEEN_KEY));
  return Number.isFinite(value) && value > 0 ? value : null;
}
export function markSeen(at: number): void {
  if ((seenAt() ?? 0) < at) write(SEEN_KEY, String(at));
}
export const useSeenAt = () => useSyncExternalStore(subscribe, seenAt, () => null);

/** Where the device can give its position: only on a secure page, and only where the browser has it. */
export const positionAvailable = () =>
  typeof window !== "undefined" && window.isSecureContext && typeof navigator !== "undefined" && "geolocation" in navigator;

/** Asks the browser for the device's position, once. */
export function currentPosition(): Promise<{ lat: number; lon: number; accuracyM: number | null }> {
  return new Promise((resolve, reject) => {
    if (!window.isSecureContext || !("geolocation" in navigator)) {
      reject(new Error("This page cannot ask for the device's position."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          lat: Math.round(position.coords.latitude * 1e6) / 1e6,
          lon: Math.round(position.coords.longitude * 1e6) / 1e6,
          accuracyM: Number.isFinite(position.coords.accuracy) ? Math.round(position.coords.accuracy) : null,
        }),
      (error) =>
        reject(
          new Error(
            error.code === error.PERMISSION_DENIED
              ? "The browser was not allowed to give this device's position."
              : "The device could not find its position just now.",
          ),
        ),
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 60_000 },
    );
  });
}

// ── From the server ──

const MESSAGES = ["board", "messages", BOARD_CHANNEL];

export function useBoardMessages() {
  return useInfiniteQuery({
    queryKey: MESSAGES,
    queryFn: ({ pageParam }) => api.get<BoardMessagesResponse>("/api/board/messages", pageParam ? { before: pageParam } : undefined),
    initialPageParam: null as string | null,
    // "Next" is further back in time: the pages are drawn in reverse, the oldest on top.
    getNextPageParam: (page) => page.older,
  });
}

/** Every message loaded, oldest first. */
export function allMessages(data: InfiniteData<BoardMessagesResponse> | undefined): BoardMessage[] {
  if (!data) return [];
  return [...data.pages].reverse().flatMap((page) => page.messages);
}

export const useBoardSummary = (since?: number | null) =>
  useQuery({
    queryKey: ["board", "summary", since ?? null],
    queryFn: () => api.get<BoardSummaryResponse>("/api/board/summary", since ? { since } : undefined),
  });

/** Puts a message the server sent back in place in the loaded pages, so the screen changes before the event's refetch. */
function useReplace() {
  const client = useQueryClient();
  return (message: BoardMessage, add: boolean) => {
    client.setQueryData<InfiniteData<BoardMessagesResponse>>(MESSAGES, (data) => {
      if (!data) return data;
      const pages = data.pages.map((page) => ({
        ...page,
        messages: page.messages.map((entry) => (entry.id === message.id ? message : entry)),
      }));
      const known = pages.some((page) => page.messages.some((entry) => entry.id === message.id));
      if (add && !known && pages[0]) pages[0] = { ...pages[0], messages: [...pages[0].messages, message] };
      return { ...data, pages };
    });
    void client.invalidateQueries({ queryKey: ["board", "summary"] });
  };
}

export function usePost() {
  const replace = useReplace();
  return useMutation({
    mutationFn: (input: { author: string; body: string }) => api.post<BoardMessageResponse>("/api/board/messages", input),
    onSuccess: ({ message }) => replace(message, true),
  });
}

export function useCheckIn() {
  const replace = useReplace();
  return useMutation({
    mutationFn: (input: BoardCheckInInput) => api.post<BoardMessageResponse>("/api/board/check-ins", input),
    onSuccess: ({ message }) => replace(message, true),
  });
}

export function useEdit() {
  const replace = useReplace();
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...input
    }: {
      id: string;
      by: string;
      body?: string;
      place?: string | null;
      status?: BoardMessage["status"] & {};
      baseUpdatedAt: number;
    }) => api.patch<BoardMessageResponse>(`/api/board/messages/${encodeURIComponent(id)}`, input),
    onSuccess: ({ message }) => replace(message, false),
    // Changed or removed on another device meanwhile: show it as it is now.
    onError: () => void client.invalidateQueries({ queryKey: ["board"] }),
  });
}

export function useRemove() {
  const replace = useReplace();
  return useMutation({
    mutationFn: ({ id, by }: { id: string; by: string }) =>
      api.post<BoardMessageResponse>(`/api/board/messages/${encodeURIComponent(id)}/remove`, { by }),
    onSuccess: ({ message }) => replace(message, false),
  });
}

export function useAddToLibrary() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (fileId: string) =>
      api.post<{ status: "created" | "duplicate"; document: { id: string; title: string } }>(
        `/api/board/files/${encodeURIComponent(fileId)}/library`,
      ),
    onSuccess: () => void client.invalidateQueries({ queryKey: ["documents"] }),
  });
}

export { useReplace };
