/**
 * What is kept on this phone, and where.
 *
 * Everything a person chooses to keep is filed in the browser's Cache Storage: one
 * cache per kept thing (`outpost-kept:<kind>:<id>`), holding the server's answers under
 * the addresses they came from, and one small record per thing in an index cache, which
 * is the list the "On this phone" screen shows. One cache per thing means removing a
 * thing is deleting its cache: nothing of it can be left behind.
 *
 * The service worker reads these caches (pictures of a kept page, tiles of a kept map
 * area) and never writes to them. Only this module writes, and only when a person
 * asked for something to be kept or a kept copy is being refreshed from the server.
 */
import type { Bbox, MapSources, MarkerColor } from "@outpost/shared";
import { useSyncExternalStore } from "react";
import { KEPT_INDEX, keptCacheName, keptKey } from "@/sw/rules";

interface KeptBase {
  id: string;
  title: string;
  /** What the copy takes in this browser, counted as it was stored. */
  bytes: number;
  /** When it was first kept, and when the copy was last brought up to date. */
  keptAt: number;
  refreshedAt: number;
  /** Set when the server no longer has it. The copy is left alone until the person removes it. */
  gone?: boolean;
}

export interface KeptPage {
  id: string;
  title: string;
  icon: string | null;
  updatedAt: number;
}

/** A page of notes, with every page inside it. */
export interface KeptNote extends KeptBase {
  kind: "note";
  icon: string | null;
  /** The page itself first, then its sub-pages, however deep. */
  pages: KeptPage[];
  /** Pictures and attached files kept with the pages. */
  files: number;
  /** Attached files left out because they were too large. */
  skipped: number;
}

export interface KeptTrack extends KeptBase {
  kind: "track";
  color: MarkerColor;
  distanceMeters: number;
  bounds: Bbox | null;
  updatedAt: number;
}

/** Saved places are kept as a set: all of them, as they were. */
export interface KeptPlaces extends KeptBase {
  kind: "places";
  count: number;
}

export interface KeptArea extends KeptBase {
  kind: "area";
  bbox: Bbox;
  /** The deepest zoom kept, for the map and for terrain (null when terrain was not kept). */
  maxZoom: number;
  terrainMaxZoom: number | null;
  /** Tiles stored so far, and tile positions looked at so far out of `positions`. */
  tiles: number;
  done: number;
  positions: number;
  /** False while tiles are still being fetched, or if fetching stopped part of the way. */
  complete: boolean;
  /** What the server said was installed when the area was kept: the map is drawn from this out of reach. */
  sources: MapSources;
  /** Changes when the maps installed on the server do; see `regionsCacheKey`. */
  regionsKey: string;
  /** Set when the server's maps have changed since the tiles were fetched. */
  stale?: boolean;
  /**
   * Set while a whole area is being fetched again, and left set if that stopped part of
   * the way: every tile is there, but some are from the newer maps and the rest from the
   * copy that was here before.
   */
  mixed?: boolean;
}

/**
 * An emergency plan, as "Use now" needs it: the server's answer for the plan (its steps,
 * numbers, people and places, with what its links point at). Unlike every other kept
 * thing, a plan can be changed on the phone in one way: steps can be ticked while the
 * server is out of reach. Those ticks are kept with the copy and sent when the server
 * is back (`features/kept/plan-copy.ts`).
 */
export interface KeptPlan extends KeptBase {
  kind: "plan";
  /** The plan's own date when the copy was made. */
  updatedAt: number;
  steps: number;
  /** Ticks and unticks made on this device and not yet sent. */
  pending: number;
  /** The household's name, when there were several as the copy was made; absent with one. */
  household?: string;
}

/**
 * The household's medical sheets, kept as a set only when a person asks. A sheet locked
 * with a passphrase or key is kept as the locked message it is on the server, and opened
 * on the phone in memory only; a sheet not locked is kept readable.
 */
export interface KeptMedical extends KeptBase {
  kind: "medical";
  count: number;
  /** Of them, how many are locked. */
  locked: number;
}

export type KeptItem = KeptNote | KeptTrack | KeptPlaces | KeptArea | KeptPlan | KeptMedical;
export type KeptKind = KeptItem["kind"];

/**
 * Whether this browser can keep anything at all. Cache Storage and service workers
 * exist only on a secure origin: HTTPS, or the computer Outpost itself runs on.
 */
export function keepingSupported(): boolean {
  return typeof window !== "undefined" && window.isSecureContext && "caches" in window && "serviceWorker" in navigator;
}

const recordKey = (kind: KeptKind, id: string) => `/__kept/${kind}/${encodeURIComponent(id)}`;

// ── Telling screens that the list changed, in this tab and in others ──

const listeners = new Set<() => void>();
const channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel("outpost-kept");
let snapshot: KeptItem[] | undefined;
let loading: Promise<void> | undefined;

async function reload(): Promise<void> {
  snapshot = await listKept();
  for (const listener of listeners) listener();
}
function changed(): void {
  channel?.postMessage("changed");
  void reload();
}
channel?.addEventListener("message", () => void reload());

// ── Reading ──

export async function listKept(): Promise<KeptItem[]> {
  if (!keepingSupported()) return [];
  const index = await caches.open(KEPT_INDEX);
  const items: KeptItem[] = [];
  for (const request of await index.keys()) {
    const record = await index.match(request);
    if (!record) continue;
    try {
      items.push((await record.json()) as KeptItem);
    } catch {
      // A record that cannot be read is not shown; its cache is still removed by "remove everything".
    }
  }
  return items.sort((a, b) => a.title.localeCompare(b.title, "en"));
}

export async function getKept<K extends KeptKind>(kind: K, id: string): Promise<Extract<KeptItem, { kind: K }> | undefined> {
  if (!keepingSupported()) return undefined;
  const record = await (await caches.open(KEPT_INDEX)).match(recordKey(kind, id));
  return record ? ((await record.json()) as Extract<KeptItem, { kind: K }>) : undefined;
}

export const openKept = (kind: KeptKind, id: string): Promise<Cache> => caches.open(keptCacheName(kind, id));

/** One of the server's answers, as it was kept. */
export async function readKeptJson<T>(kind: KeptKind, id: string, path: string): Promise<T | undefined> {
  if (!keepingSupported()) return undefined;
  const copy = await (await openKept(kind, id)).match(keptKey(path, window.location.origin));
  return copy ? ((await copy.json()) as T) : undefined;
}

// ── Writing ──

const encoder = new TextEncoder();

/** Files a value as JSON under the address it came from. Returns the bytes stored. */
export async function putKeptJson(cache: Cache, path: string, value: unknown): Promise<number> {
  const text = JSON.stringify(value);
  await cache.put(keptKey(path, window.location.origin), new Response(text, { headers: { "Content-Type": "application/json" } }));
  return encoder.encode(text).byteLength;
}

/** Files bytes under an address, with the headers the page will need when they are served back. */
export async function putKeptBytes(cache: Cache, path: string, body: ArrayBuffer | Blob, headers: Record<string, string>): Promise<number> {
  await cache.put(keptKey(path, window.location.origin), new Response(body, { headers }));
  return body instanceof Blob ? body.size : body.byteLength;
}

export async function putKept(item: KeptItem): Promise<void> {
  const index = await caches.open(KEPT_INDEX);
  await index.put(recordKey(item.kind, item.id), new Response(JSON.stringify(item), { headers: { "Content-Type": "application/json" } }));
  changed();
}

/** Removes a kept thing from this phone: its copy and its line in the list. Nothing on the server is touched. */
export async function removeKept(kind: KeptKind, id: string): Promise<void> {
  await caches.delete(keptCacheName(kind, id));
  await (await caches.open(KEPT_INDEX)).delete(recordKey(kind, id));
  changed();
}

// ── For screens ──

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (snapshot === undefined) loading ??= reload().finally(() => (loading = undefined));
  return () => listeners.delete(listener);
}

/** The list of what is kept, kept up to date. `undefined` until it has been read once. */
export function useKept(): KeptItem[] | undefined {
  return useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => undefined,
  );
}

/** For tests: forget what was read. */
export function forgetKeptSnapshot(): void {
  snapshot = undefined;
}

/** The message for a browser that has run out of room, or undefined for any other failure. */
export function outOfRoomMessage(error: unknown): string | undefined {
  return error instanceof DOMException && error.name === "QuotaExceededError"
    ? "This browser has no more room for Outpost. Remove something that is kept, then try again."
    : undefined;
}
