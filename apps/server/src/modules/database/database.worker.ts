/**
 * Reads or rewrites the database away from the server's own thread (see `inspect.ts`).
 * better-sqlite3 is synchronous, so on the server's thread a check of a large file
 * would stop every other request until it finished.
 */
import { parentPort, workerData } from "node:worker_threads";
import { checkFile, measureContents, vacuumFile } from "./inspect.ts";

export type WorkerTask =
  | { task: "contents"; file: string }
  | { task: "check"; file: string; kind: "quick" | "full" }
  | { task: "vacuum"; file: string };

const input = workerData as WorkerTask;
try {
  const result =
    input.task === "contents"
      ? measureContents(input.file)
      : input.task === "check"
        ? checkFile(input.file, input.kind)
        : vacuumFile(input.file);
  parentPort?.postMessage({ ok: true, result });
} catch (error) {
  parentPort?.postMessage({ ok: false, message: error instanceof Error ? error.message : String(error) });
}
