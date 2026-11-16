/**
 * Where a recording lives until Outpost has it: this device's own storage (IndexedDB).
 * Each point is written as it is kept, so a reload, a closed tab or a flat battery
 * loses nothing that was recorded before it. The server is not involved at all.
 *
 * Two stores: one small record for each recording, and one row for each point. A point
 * is a row of its own so that keeping it costs the same on the ten-thousandth as on
 * the first; nothing is ever read back and rewritten.
 */
import type { MarkerColor } from "@outpost/shared";
import type { RecordedPoint, Totals } from "./track-log";

/** A span in which the page was out of sight and no position arrived. */
export interface Interruption {
  from: number;
  to: number;
}

export interface RecordingMeta {
  id: string;
  startedAt: number;
  /**
   * "active": being recorded, or it was when its page went away.
   * "stopped": ended, and not yet named and saved.
   * "queued": named, and waiting to be sent to Outpost.
   * "refused": sent, and Outpost would not take it; `refusal` says why.
   */
  status: "active" | "stopped" | "queued" | "refused";
  name: string;
  color: MarkerColor;
  /** The stretch being recorded; the next one after any pause or interruption. */
  segment: number;
  interruptions: Interruption[];
  refusal: string | null;
  /** What it added up to when this record was last written. The points are the authority. */
  totals: Totals;
}

export interface RecordingStore {
  list(): Promise<RecordingMeta[]>;
  put(meta: RecordingMeta): Promise<void>;
  addPoint(id: string, point: RecordedPoint): Promise<void>;
  /** Every point of a recording, in the order they were kept. */
  points(id: string): Promise<RecordedPoint[]>;
  /** Removes a recording and its points. */
  remove(id: string): Promise<void>;
}

const DATABASE = "outpost-recordings";
const RECORDINGS = "recordings";
const POINTS = "points";

/** A point as stored: short keys, because there may be a hundred thousand of them. */
interface StoredPoint {
  r: string;
  s: number;
  t: number;
  la: number;
  lo: number;
  e: number | null;
  a: number;
}

const done = <T>(request: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("This device's storage refused the request."));
  });

const finished = (transaction: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("This device's storage refused the request."));
    transaction.onabort = () => reject(transaction.error ?? new Error("This device's storage refused the request."));
  });

/**
 * Opens the store, or rejects where the browser keeps nothing for this page (some
 * private windows). The caller then does not offer recording at all, rather than make
 * a recording that a reload would lose.
 */
export async function openRecordingStore(factory: IDBFactory | undefined = globalThis.indexedDB): Promise<RecordingStore> {
  if (!factory) throw new Error("This browser has no storage for this page.");
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = factory.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(RECORDINGS)) db.createObjectStore(RECORDINGS, { keyPath: "id" });
      if (!db.objectStoreNames.contains(POINTS)) {
        db.createObjectStore(POINTS, { autoIncrement: true }).createIndex("recording", "r");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("This browser would not open its storage for this page."));
    request.onblocked = () => reject(new Error("Another tab is holding this page's storage."));
  });
  // Another tab running a newer Outpost may need to change the stores; let it.
  database.onversionchange = () => database.close();

  return {
    async list() {
      return done(database.transaction(RECORDINGS, "readonly").objectStore(RECORDINGS).getAll() as IDBRequest<RecordingMeta[]>);
    },
    async put(meta) {
      const transaction = database.transaction(RECORDINGS, "readwrite");
      transaction.objectStore(RECORDINGS).put(meta);
      await finished(transaction);
    },
    async addPoint(id, point) {
      const transaction = database.transaction(POINTS, "readwrite");
      const stored: StoredPoint = { r: id, s: point.segment, t: point.time, la: point.lat, lo: point.lon, e: point.ele, a: point.accuracy };
      transaction.objectStore(POINTS).add(stored);
      await finished(transaction);
    },
    async points(id) {
      // Keys are handed out in order, and the index keeps rows with the same recording in key order.
      const request = database.transaction(POINTS, "readonly").objectStore(POINTS).index("recording").getAll(IDBKeyRange.only(id));
      const rows = await done(request as IDBRequest<StoredPoint[]>);
      return rows.map((row) => ({ segment: row.s, time: row.t, lat: row.la, lon: row.lo, ele: row.e, accuracy: row.a }));
    },
    async remove(id) {
      const transaction = database.transaction([RECORDINGS, POINTS], "readwrite");
      transaction.objectStore(RECORDINGS).delete(id);
      const cursor = transaction.objectStore(POINTS).index("recording").openKeyCursor(IDBKeyRange.only(id));
      cursor.onsuccess = () => {
        const at = cursor.result;
        if (!at) return;
        transaction.objectStore(POINTS).delete(at.primaryKey);
        at.continue();
      };
      await finished(transaction);
    },
  };
}

/** The same store kept in memory, for tests of everything that sits on top of it. */
export function createMemoryStore(): RecordingStore & { metas: Map<string, RecordingMeta>; rows: Map<string, RecordedPoint[]> } {
  const metas = new Map<string, RecordingMeta>();
  const rows = new Map<string, RecordedPoint[]>();
  return {
    metas,
    rows,
    async list() {
      return [...metas.values()].map((meta) => structuredClone(meta));
    },
    async put(meta) {
      metas.set(meta.id, structuredClone(meta));
    },
    async addPoint(id, point) {
      const list = rows.get(id) ?? [];
      list.push({ ...point });
      rows.set(id, list);
    },
    async points(id) {
      return (rows.get(id) ?? []).map((point) => ({ ...point }));
    },
    async remove(id) {
      metas.delete(id);
      rows.delete(id);
    },
  };
}
