/**
 * Live updates from the server over one EventSource per tab. Instead of every screen
 * polling, the server says what changed and the matching cached queries are refreshed.
 */
import type { JobDto, StorageLocationsResponse } from "@outpost/shared";
import { useQueryClient } from "@tanstack/react-query";
import { createContext, type ReactNode, useContext, useEffect, useMemo, useRef, useState } from "react";

type Listener = (payload: { id?: string; data?: unknown }) => void;

interface EventsValue {
  /** False while the connection to the server is down. */
  connected: boolean;
  subscribe(type: string, listener: Listener): () => void;
}

const EventsContext = createContext<EventsValue>({ connected: true, subscribe: () => () => {} });

/** Which cached queries each server event makes stale. Keys are query-key prefixes. */
const invalidations: Record<string, string[][]> = {
  // Progress arrives about twice a second per running job. The shared list of active jobs
  // is patched from the event; lists are fetched again only when a job changes state
  // (see `onEvent`). Screens that follow one job fetch it themselves.
  "job.updated": [],
  // Progress arrives about twice a second per download. Screens that show it patch
  // their cached list from the event itself, so nothing is refetched here; the lists
  // are refreshed when a download changes state (see the listener below).
  "download.updated": [],
  "download.removed": [["downloads"], ["catalog"], ["manage"]],
  // Also sent when only free space moved. What is on a drive changes only when a drive
  // comes or goes, so the lists that depend on that are fetched when a location's status
  // or path changed (see the cache watch in the provider), not on every one of these.
  "storage.changed": [["storage"]],
  "settings.changed": [["settings"], ["answers"], ["chat"]],
  // A conversation was added to, renamed or removed, here or on another device.
  "chat.changed": [["chat"]],
  "documents.changed": [["documents"], ["search"], ["storage"], ["manage"]],
  "notes.changed": [["notes"], ["search"]],
  // A passage was marked in a document, or its note changed (features/library/highlights).
  "highlights.changed": [["highlights"], ["search"]],
  "collections.changed": [["collections"], ["catalog"], ["storage"], ["kiwix"], ["maps"], ["manage"]],
  "catalog.changed": [["catalog"]],
  "maps.changed": [["maps"], ["collections"], ["household-papers", "binder"]],
  // A reference pack was installed, updated or removed (features/layers).
  "layers.changed": [["layers"], ["collections"], ["manage"], ["search"]],
  "contacts.changed": [["contacts"], ["search"], ["manage"], ["household-papers", "binder"]],
  "repeaters.changed": [["repeaters"], ["search"]],
  "imports.changed": [["imports"]],
  "semantic.changed": [["semantic"]],
  "portable.changed": [["portable"]],
  "merge.changed": [["merge"]],
  // A Calibre library was read or brought in (features/library/calibre).
  "calibre.changed": [["calibre"]],
  "backup.changed": [["backup"], ["database"]],
  "update.changed": [["update"]],
  // An export of everything was started, finished, or its file removed (Settings, Take everything out).
  "export-all.changed": [["export-all"]],
  // A check or a reclaim of the database finished, or its contents were worked out.
  "database.changed": [["database"]],
  "https.changed": [["https"]],
  "encryption.changed": [["encryption"]],
  "propagation.changed": [["propagation"]],
  "power.changed": [["power"]],
  "supplies.changed": [["supplies"], ["manage"], ["household-papers", "binder"]],
  "nuclear.changed": [["nuclear"]],
  "network.changed": [["network"], ["manage"]],
  "weather.changed": [["weather"], ["manage"]],
  "emergency-plans.changed": [["emergency-plans"], ["manage"], ["household-papers", "binder"]],
  // A medical sheet, the communication plan or the binder's record changed, here or on another device.
  "household-papers.changed": [["household-papers"], ["search"], ["manage"]],
  // The log of events, a routine check or an offline drill changed, here or on another device.
  "readiness.changed": [["readiness"], ["manage"]],
  // A sowing or the last-frost date changed in the garden, here or on another device.
  "garden.changed": [["garden"], ["manage"]],
  // The Morse trainer kept a session or a change of progress, here or on another device.
  "morse.changed": [["morse"], ["manage"]],
  // The allotment or a game's tally changed, here or on another device.
  "games.changed": [["games"], ["manage"]],
  // A message, check-in or file on the household board was posted, changed, removed or expired, here or on another device.
  "board.changed": [["board"], ["manage"]],
  // A page was marked done, or a learner's progress removed, here or on another device.
  "learning.changed": [["learning"], ["manage"]],
  // The mesh radio link's state changed: a radio connected or went away, or something was heard.
  "mesh.changed": [["mesh"]],
  // The background count of what is on disk has finished.
  "manage.changed": [["manage"]],
};

const ACTIVE_JOBS = ["jobs", "active"];
const STORAGE_LOCATIONS = ["storage", "locations"];
/** What shows whether a drive is there: fetched again when one comes or goes. */
const dependsOnLocations = [["collections"], ["documents"], ["manage"]];

/** Each location's identity, status and path: what other lists depend on, unlike its free space. */
function locationsMark(data: StorageLocationsResponse | undefined): string | undefined {
  return data?.locations.map((location) => `${location.id}|${location.status}|${location.path}`).join("\n");
}

/** After this long hidden, the stream is closed; the server then keeps nothing open for a tab nobody is looking at. */
export const HIDDEN_CLOSE_MS = 60_000;
/** Waits between attempts to reach a server that is not answering: 1 s, doubling, at most a minute. */
export const reconnectDelayMs = (failures: number) => Math.min(60_000, 1000 * 2 ** Math.max(0, failures - 1));

/**
 * One stream per tab, for as long as the tab is being looked at. While it is hidden,
 * events still mark what they change as stale but nothing is fetched until the tab is
 * shown again, and after a minute hidden the stream is closed. A stream that fails is
 * opened again after a wait that grows, so a server that is off for the night is not
 * asked every three seconds.
 */
export function EventsProvider({ children, enabled }: { children: ReactNode; enabled: boolean }) {
  const client = useQueryClient();
  const [connected, setConnected] = useState(true);
  const listeners = useRef(new Map<string, Set<Listener>>());

  useEffect(() => {
    if (!enabled) return;
    let source: EventSource | undefined;
    let failures = 0;
    // Events may have been missed: everything on screen is fetched again once the stream is back.
    let missed = false;
    let retry: number | undefined;
    let hiding: number | undefined;
    let flush: number | undefined;
    const pending = new Set<string>();
    const staleWhileHidden = new Set<string>();
    // Screens' own listeners (useServerEvent) mostly fetch something; while the tab is hidden
    // what they would have heard is held, in order, and handed to them when it is shown.
    const heardWhileHidden: Array<[string, { id?: string; data?: unknown }]> = [];
    const tell = (type: string, payload: { id?: string; data?: unknown }) => {
      const set = listeners.current.get(type);
      if (set) for (const listener of set) listener(payload);
    };
    const downloadStates = new Map<string, string>();

    const invalidate = (keys: string[][]) => {
      for (const key of keys) pending.add(JSON.stringify(key));
      // Progress events arrive in bursts; refresh each affected query at most twice a second.
      flush ??= window.setTimeout(() => {
        flush = undefined;
        const hidden = document.visibilityState === "hidden";
        for (const key of pending) {
          if (hidden) staleWhileHidden.add(key);
          const queryKey = JSON.parse(key) as string[];
          void client.invalidateQueries({ queryKey, refetchType: hidden ? "none" : "active" }, { cancelRefetch: false });
        }
        pending.clear();
      }, 500);
    };

    const jobStates = new Map<string, string>();
    const onJob = (payload: { id?: string; data?: unknown }) => {
      const job = payload.data as JobDto | undefined;
      if (!payload.id || !job?.state) return;
      const active = client.getQueryData<{ jobs: JobDto[] }>(ACTIVE_JOBS);
      const listed = active?.jobs.find((entry) => entry.id === payload.id);
      const known = jobStates.get(payload.id) ?? listed?.state;
      jobStates.set(payload.id, job.state);
      if (known !== job.state || !active || !listed) {
        invalidate([["jobs"], ["system"]]);
        return;
      }
      client.setQueryData<{ jobs: JobDto[] }>(ACTIVE_JOBS, {
        ...active,
        jobs: active.jobs.map((entry) => (entry.id === payload.id ? job : entry)),
      });
    };

    const onEvent = (type: string, event: MessageEvent<string>) => {
      invalidate(invalidations[type]!);
      if (type === "storage.changed" && !client.getQueryData(STORAGE_LOCATIONS)) invalidate(dependsOnLocations);
      const set = listeners.current.get(type);
      if (type !== "download.updated" && type !== "job.updated" && !set?.size) return;
      const payload = JSON.parse(event.data) as { id?: string; data?: unknown };
      if (type === "job.updated") onJob(payload);
      if (type === "download.updated") {
        const state = (payload.data as { state?: string } | undefined)?.state;
        if (payload.id && state && downloadStates.get(payload.id) !== state) {
          downloadStates.set(payload.id, state);
          invalidate([["downloads"], ["catalog"], ["collections"], ["storage"]]);
        }
      }
      if (!set?.size) return;
      if (document.visibilityState === "hidden") heardWhileHidden.push([type, payload]);
      else tell(type, payload);
    };

    const close = () => {
      source?.close();
      source = undefined;
    };

    const open = () => {
      window.clearTimeout(retry);
      retry = undefined;
      if (source) return;
      const opened = new EventSource("/api/events");
      source = opened;
      opened.onopen = () => {
        failures = 0;
        setConnected(true);
        if (missed) void client.invalidateQueries();
        missed = false;
      };
      opened.onerror = () => {
        // The browser would try again every three seconds for ever; the wait here grows instead.
        close();
        missed = true;
        failures += 1;
        setConnected(false);
        if (document.visibilityState !== "hidden") retry = window.setTimeout(open, reconnectDelayMs(failures));
      };
      for (const type of Object.keys(invalidations)) {
        opened.addEventListener(type, ((event: MessageEvent<string>) => onEvent(type, event)) as EventListener);
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiding ??= window.setTimeout(() => {
          hiding = undefined;
          if (!source) return;
          close();
          missed = true;
        }, HIDDEN_CLOSE_MS);
        return;
      }
      window.clearTimeout(hiding);
      hiding = undefined;
      // What changed while hidden is fetched now, once, for the screen that is showing.
      for (const key of staleWhileHidden)
        void client.refetchQueries({ queryKey: JSON.parse(key) as string[], type: "active", stale: true });
      staleWhileHidden.clear();
      for (const [type, payload] of heardWhileHidden.splice(0)) tell(type, payload);
      if (!source) {
        failures = 0;
        open();
      }
    };
    // Back on a network: try at once rather than waiting out the back-off.
    const onOnline = () => {
      if (!source && document.visibilityState !== "hidden") {
        failures = 0;
        open();
      }
    };

    // When the list of locations is fetched again, the lists that depend on a drive being
    // there are fetched only if a location came, went or moved.
    let seenLocations = locationsMark(client.getQueryData(STORAGE_LOCATIONS));
    const unwatch = client.getQueryCache().subscribe((change) => {
      if (change.type !== "updated" || change.action.type !== "success") return;
      if (JSON.stringify(change.query.queryKey) !== JSON.stringify(STORAGE_LOCATIONS)) return;
      const mark = locationsMark(change.query.state.data as StorageLocationsResponse | undefined);
      if (seenLocations !== undefined && mark !== seenLocations) invalidate(dependsOnLocations);
      seenLocations = mark;
    });
    open();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onOnline);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
      window.clearTimeout(retry);
      window.clearTimeout(hiding);
      window.clearTimeout(flush);
      unwatch();
      close();
    };
  }, [client, enabled]);

  const value = useMemo<EventsValue>(
    () => ({
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
    }),
    [connected],
  );

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
