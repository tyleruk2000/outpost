/**
 * For tests only: writes a made PDF to the folder named by OUTPOST_PRINT_SAMPLES, so that
 * it can be looked at (scripts turn the pages into pictures). Does nothing without it.
 */
import fs from "node:fs";
import path from "node:path";

export function writeSample(name: string, bytes: Uint8Array): void {
  const folder = process.env.OUTPOST_PRINT_SAMPLES;
  if (!folder) return;
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(path.join(folder, `${name}.pdf`), bytes);
}
