/**
 * What each map layer holds: five counts over every place held. About 5 s on a Raspberry
 * Pi's SD card with 190,000 places, so it is never worked out on the server's own thread.
 * It is counted in a worker (`summary.worker.ts`) and the answer is kept in the database,
 * so that the first map opened after a restart is answered at once from the last count.
 */
import { Worker } from "node:worker_threads";
import type { FeatureProvenance, ReferenceLayerId, ReferenceLayerSummary } from "@outpost/shared";
import type Database from "better-sqlite3";
import { workerUrl } from "../../core/paths.ts";

/** A layer's counts as they are kept: providers and kinds by id, named when they are given out. */
export interface CountedLayer {
  id: ReferenceLayerId;
  count: number;
  countries: string[];
  providers: Array<{ id: string; count: number }>;
  kinds: Array<{ kind: string; count: number }>;
  provenance: Array<{ provenance: FeatureProvenance; count: number }>;
}

/** The key in `library_meta`, and the shape kept there. A new `version` makes an older copy count as missing. */
export const SUMMARY_KEY = "layers.summary";
const SUMMARY_VERSION = 1;

const LIVE = "duplicate_of IS NULL AND collection_id NOT LIKE 'pending:%'";

/** Counts every layer, in one read transaction so that every figure is of the same moment. */
export function countLayers(db: Database.Database): CountedLayer[] {
  return db.transaction(() => {
    const layers = db.prepare(`SELECT layer, count(*) AS n FROM reference_features WHERE ${LIVE} GROUP BY layer`).all() as Array<{
      layer: ReferenceLayerId;
      n: number;
    }>;
    const countries = db.prepare(
      `SELECT DISTINCT country FROM reference_features WHERE ${LIVE} AND layer = ? AND country IS NOT NULL ORDER BY country`,
    );
    const providers = db.prepare(
      `SELECT provider, count(*) AS n FROM reference_features WHERE ${LIVE} AND layer = ? GROUP BY provider ORDER BY provider`,
    );
    const kinds = db.prepare(`SELECT kind, count(*) AS n FROM reference_features WHERE ${LIVE} AND layer = ? GROUP BY kind ORDER BY kind`);
    const provenance = db.prepare(
      `SELECT provenance, count(*) AS n FROM reference_features WHERE ${LIVE} AND layer = ? GROUP BY provenance`,
    );
    return layers.map(({ layer, n }) => ({
      id: layer,
      count: n,
      countries: (countries.all(layer) as Array<{ country: string }>).map((row) => row.country),
      providers: (providers.all(layer) as Array<{ provider: string; n: number }>).map((row) => ({ id: row.provider, count: row.n })),
      kinds: (kinds.all(layer) as Array<{ kind: string; n: number }>).map((row) => ({ kind: row.kind, count: row.n })),
      provenance: (provenance.all(layer) as Array<{ provenance: FeatureProvenance; n: number }>).map((row) => ({
        provenance: row.provenance,
        count: row.n,
      })),
    }));
  })();
}

/** The counts with names for people. */
export function nameLayers(
  counted: CountedLayer[],
  providerName: (id: string) => string,
  kindLabel: (kind: string) => string,
): ReferenceLayerSummary[] {
  return counted.map((layer) => ({
    ...layer,
    providers: layer.providers.map((provider) => ({ ...provider, name: providerName(provider.id) })),
    kinds: layer.kinds.map((kind) => ({ ...kind, label: kindLabel(kind.kind) })),
  }));
}

/** The kept copy, or null when there is none or it is of an older shape. */
export function readKept(db: Database.Database): CountedLayer[] | null {
  try {
    const row = db.prepare("SELECT value FROM library_meta WHERE key = ?").get(SUMMARY_KEY) as { value: string } | undefined;
    if (!row) return null;
    const kept = JSON.parse(row.value) as { version?: number; layers?: unknown };
    return kept.version === SUMMARY_VERSION && Array.isArray(kept.layers) ? (kept.layers as CountedLayer[]) : null;
  } catch {
    return null;
  }
}

export function writeKept(db: Database.Database, layers: CountedLayer[] | null): void {
  if (layers === null) {
    db.prepare("DELETE FROM library_meta WHERE key = ?").run(SUMMARY_KEY);
    return;
  }
  db.prepare("INSERT INTO library_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(
    SUMMARY_KEY,
    JSON.stringify({ version: SUMMARY_VERSION, layers }),
  );
}

/** Counts in a worker thread, which opens the database file for reading on its own connection. */
export function countInWorker(file: string, signal: AbortSignal): Promise<CountedLayer[]> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error("Stopped"));
      return;
    }
    const worker = new Worker(workerUrl(new URL("./summary.worker.ts", import.meta.url), "summary"), { workerData: { file } });
    let settled = false;
    const settle = (finish: () => void) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", stop);
      void worker.terminate();
      finish();
    };
    const stop = () => settle(() => reject(new Error("Stopped")));
    signal.addEventListener("abort", stop, { once: true });
    worker.once("message", (message: { ok: true; layers: CountedLayer[] } | { ok: false; message: string }) =>
      settle(() => (message.ok ? resolve(message.layers) : reject(new Error(message.message)))),
    );
    worker.once("error", (error) => settle(() => reject(error)));
    worker.once("exit", (code) => settle(() => reject(new Error(`The map layers' count stopped unexpectedly (${code}).`))));
  });
}
