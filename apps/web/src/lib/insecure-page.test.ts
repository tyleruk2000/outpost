/**
 * Outpost is mostly used at a plain http address on a home network, which browsers do
 * not count as a secure page. Some browser features exist only on secure pages and
 * simply are not there otherwise, so calling them throws and a button appears to do
 * nothing. The tests and the end-to-end suite run at localhost, which is secure, so
 * they never see it. This guard reads the source instead.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");

function sources(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) return sources(file);
    return /\.(ts|tsx)$/.test(entry.name) && !/\.test\.(ts|tsx)$/.test(entry.name) ? [file] : [];
  });
}

describe("features that only a secure page has", () => {
  it("are not called where a plain http page would throw", () => {
    const found: string[] = [];
    for (const file of sources(root)) {
      const text = fs.readFileSync(file, "utf8");
      // Identifiers come from localId() in lib/utils.ts, which works everywhere.
      if (/crypto\s*\.\s*randomUUID\s*\(/.test(text)) found.push(`${path.relative(root, file)}: crypto.randomUUID() (use localId)`);
      // The camera is missing on such a page: a file that asks for it must check first, and say what to do (see supplies/barcode/camera.ts).
      if (/getUserMedia\s*\(/.test(text) && !/isSecureContext/.test(text))
        found.push(`${path.relative(root, file)}: getUserMedia() without checking window.isSecureContext first`);
    }
    expect(found).toEqual([]);
  });
});
