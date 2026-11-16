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
  // Progress arrives about twice a second per download. Screens that show it patch
  // their cached list from the event itself, so nothing is refetched here; the lists
  // are refreshed when a download changes state (see the listener below).
  "download.updated": [],
  "download.removed": [["downloads"], ["catalog"], ["manage"]],
  "storage.changed": [["storage"], ["collections"], ["documents"], ["manage"]],
  "settings.changed": [["settings"], ["answers"], ["chat"]],
  // A conversation was added to, renamed or removed, here or on another device.
  "chat.changed": [["chat"]],
  "documents.changed": [["documents"], ["search"], ["storage"], ["manage"]],
  "notes.changed": [["notes"], ["search"]],
  "collections.changed": [["collections"], ["catalog"], ["storage"], ["kiwix"], ["maps"], ["manage"]],
  "catalog.changed": [["catalog"]],
  "maps.changed": [["maps"], ["collections"]],
  // A reference pack was installed, updated or removed (features/layers).
  "layers.changed": [["layers"], ["collections"], ["manage"], ["search"]],
  "contacts.changed": [["contacts"], ["search"], ["manage"]],
  "repeaters.changed": [["repeaters"], ["search"]],
  "imports.changed": [["imports"]],
  "semantic.changed": [["semantic"]],
  "portable.changed": [["portable"]],
  "merge.changed": [["merge"]],
  "backup.changed": [["backup"], ["database"]],
  // A check or a reclaim of the database finished, or its contents were worked out.
  "database.changed": [["database"]],
  "https.changed": [["https"]],
  "encryption.changed": [["encryption"]],
  "propagation.changed": [["propagation"]],
  "power.changed": [["power"]],
  "supplies.changed": [["supplies"], ["manage"]],
  "nuclear.changed": [["nuclear"]],
  "network.changed": [["network"], ["manage"]],
  "weather.changed": [["weather"], ["manage"]],
  "emergency-plans.changed": [["emergency-plans"], ["manage"]],
  // The Morse trainer kept a session or a change of progress, here or on another device.
  "morse.changed": [["morse"], ["manage"]],
  // The background count of what is on disk has finished.
  "manage.changed": [["manage"]],
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

    const downloadStates = new Map<string, string>();
    const handlers: Array<[string, (event: MessageEvent<string>) => void]> = Object.keys(invalidations).map((type) => [
      type,
      (event) => {
        scheduleInvalidation(client, pending, timer, invalidations[type]!);
        if (type === "download.updated") {
          const payload = JSON.parse(event.data) as { id?: string; data?: { state?: string } };
          const state = payload.data?.state;
          if (payload.id && state && downloadStates.get(payload.id) !== state) {
            downloadStates.set(payload.id, state);
            scheduleInvalidation(client, pending, timer, [["downloads"], ["catalog"], ["collections"], ["storage"]]);
          }
        }
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
