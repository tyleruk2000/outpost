/**
 * Folders for a test to work in, removed when the file's tests have run, whether they
 * passed or not. (Each test that made its own and removed it at its end left it behind
 * when it failed: several hundred a day, in the system's temporary directory.)
 *
 * The removal is registered for every test file in temp-setup.ts, and global-temp.ts
 * fails the run if anything is left over all the same.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const made = new Set<string>();

/** A new, empty folder in the temporary directory, whose name starts with `prefix`. */
export function tempDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  made.add(dir);
  return dir;
}

/** Puts a folder made some other way on the list to remove. */
export function removeAfterwards(dir: string): void {
  made.add(dir);
}

/** Removes every folder made so far. */
export function removeTempDirs(): void {
  for (const dir of made) fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  made.clear();
}
