/**
 * Live updates from the server over one EventSource per tab. Instead of every screen
 * polling, the server says what changed and the matching cached queries are refreshed.
 */
import { type QueryClient, useQueryClient } from "@tanstack/react-query";
import { createContext, type ReactNode, useContext, useEffect, useRef, useState } from "react";

type Listener = (payload: { id?: string; data?: unknown }) => void;

interface EventsValue {
  /** False while the connection to the server is down. */
  connected: boolean;
  subscribe(type: string, listener: Listener): () => void;
}

const EventsContext = createContext<EventsValue>({ connected: true, subscribe: () => () => {} });

/** Which cached queries each server event makes stale. Keys are query-key prefixes. */
const invalidations: Record<string, string[][]> = {
  "job.updated": [["jobs"], ["system"]],
  "download.updated": [["downloads"], ["catalog"]],
  "storage.changed": [["storage"], ["collections"], ["documents"]],
  "settings.changed": [["settings"]],
  "documents.changed": [["documents"], ["search"], ["storage"]],
  "notes.changed": [["notes"], ["search"]],
  "collections.changed": [["collections"], ["catalog"], ["storage"], ["kiwix"], ["maps"]],
  "catalog.changed": [["catalog"]],
  "maps.changed": [["maps"], ["collections"]],
  "imports.changed": [["imports"]],
  "semantic.changed": [["semantic"]],
  "portable.changed": [["portable"]],
};

function scheduleInvalidation(client: QueryClient, pending: Set<string>, timer: { id?: number }, keys: string[][]): void {
  for (const key of keys) pending.add(JSON.stringify(key));
  if (timer.id !== undefined) return;
  // Progress events arrive in bursts; refresh each affected query at most twice a second.
  timer.id = window.setTimeout(() => {
    timer.id = undefined;
    for (const key of pending) void client.invalidateQueries({ queryKey: JSON.parse(key) as string[] });
    pending.clear();
  }, 500);
}

export function EventsProvider({ children, enabled }: { children: ReactNode; enabled: boolean }) {
  const client = useQueryClient();
  const [connected, setConnected] = useState(true);
  const listeners = useRef(new Map<string, Set<Listener>>());

  useEffect(() => {
    if (!enabled) return;
    const source = new EventSource("/api/events");
    const pending = new Set<string>();
    const timer: { id?: number } = {};
    let wasDown = false;

    source.onopen = () => {
      setConnected(true);
      // Anything may have changed while we were away.
      if (wasDown) void client.invalidateQueries();
      wasDown = false;
    };
    source.onerror = () => {
      wasDown = true;
      setConnected(false);
    };

    const handlers: Array<[string, (event: MessageEvent<string>) => void]> = Object.keys(invalidations).map((type) => [
      type,
      (event) => {
        scheduleInvalidation(client, pending, timer, invalidations[type]!);
        const set = listeners.current.get(type);
        if (set?.size) {
          const payload = JSON.parse(event.data) as { id?: string; data?: unknown };
          for (const listener of set) listener(payload);
        }
      },
    ]);
    for (const [type, handler] of handlers) source.addEventListener(type, handler as EventListener);

    return () => {
      for (const [type, handler] of handlers) source.removeEventListener(type, handler as EventListener);
      source.close();
      if (timer.id !== undefined) window.clearTimeout(timer.id);
    };
  }, [client, enabled]);

  const value: EventsValue = {
    connected,
    subscribe(type, listener) {
      let set = listeners.current.get(type);
      if (!set) {
        set = new Set();
        listeners.current.set(type, set);
      }
      set.add(listener);
      return () => set.delete(listener);
    },
  };

  return <EventsContext.Provider value={value}>{children}</EventsContext.Provider>;
}

export const useServerConnection = () => useContext(EventsContext).connected;

/** Run `listener` whenever the server publishes an event of `type`. */
export function useServerEvent(type: string, listener: Listener): void {
  const { subscribe } = useContext(EventsContext);
  const latest = useRef(listener);
  latest.current = listener;
  // biome-ignore lint/correctness/useExhaustiveDependencies: subscribe is stable for the provider's lifetime
  useEffect(() => subscribe(type, (payload) => latest.current(payload)), [type]);
}
