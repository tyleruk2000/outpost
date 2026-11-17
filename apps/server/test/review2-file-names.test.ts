/**
 * A file's name is kept to what a disk can hold. Disks count a name in bytes (255 on APFS,
 * ext4 and NTFS's UTF-16 aside); 120 characters of Japanese or emoji are well over that.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { safeFileName } from "../src/core/fs-safe.ts";
import { tempDir } from "./temp.ts";

describe("a long name in a script of several bytes a character", () => {
  const dir = tempDir("outpost-review2-names-");

  it("is shortened to a name the disk takes, keeping its extension and whole characters", () => {
    for (const name of [`${"日本語の文書".repeat(40)}.pdf`, `${"📻".repeat(200)}.txt`, `${"é".repeat(300)}.md`]) {
      const safe = safeFileName(name);
      expect(Buffer.byteLength(safe)).toBeLessThanOrEqual(240);
      expect(path.extname(safe)).toBe(path.extname(name));
      expect(safe).not.toMatch(/�/);
      expect(safe.isWellFormed()).toBe(true);
      fs.writeFileSync(path.join(dir, safe), "x");
    }
  });
});
