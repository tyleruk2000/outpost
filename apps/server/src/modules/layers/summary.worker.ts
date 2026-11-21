/** Counts what each map layer holds away from the server's thread (see `summary.ts`). */
import { parentPort, workerData } from "node:worker_threads";
import Database from "better-sqlite3";
import { countLayers } from "./summary.ts";

const { file } = workerData as { file: string };
try {
  const db = new Database(file, { readonly: true, fileMustExist: true });
  try {
    db.pragma("busy_timeout = 5000");
    parentPort?.postMessage({ ok: true, layers: countLayers(db) });
  } finally {
    db.close();
  }
} catch (error) {
  parentPort?.postMessage({ ok: false, message: error instanceof Error ? error.message : String(error) });
}
