/**
 * Small helpers that were once written again on screen after screen live in `lib`, once.
 * This guard reads the source and fails when a feature defines its own copy again.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");
const SHARED = {
  useDebounced: "lib/use-debounced.ts",
  usePageVisible: "lib/page-visible.ts",
  copyText: "lib/clipboard.ts",
  useWidth: "lib/use-width.ts",
} as const;

function sources(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) return sources(file);
    return /\.(ts|tsx)$/.test(entry.name) && !/\.test\.(ts|tsx)$/.test(entry.name) ? [file] : [];
  });
}

describe("shared helpers", () => {
  it("are defined once, in lib", () => {
    const found: string[] = [];
    for (const file of sources(root)) {
      const relative = path.relative(root, file).split(path.sep).join("/");
      const text = fs.readFileSync(file, "utf8");
      for (const [name, home] of Object.entries(SHARED)) {
        if (relative !== home && new RegExp(`function ${name}\\b`).test(text)) found.push(`${relative}: its own ${name} (use ${home})`);
      }
    }
    expect(found).toEqual([]);
  });
});
