/**
 * A hostile audio file's tags cost a bounded amount to read. An MP4 is walked atom by
 * atom from the disk; a file made of nothing but the smallest atoms must not cost one
 * read for every eight bytes of it.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { readAudioFacts } from "../src/modules/documents/audio-tags.ts";
import { m4b } from "./fixtures/audio/builders.ts";
import { tempDir } from "./temp.ts";

describe("an MP4 of many tiny atoms", () => {
  const dir = tempDir("outpost-review2-audio-");

  it("stops walking long before the end, instead of reading the file eight bytes at a time", async () => {
    const free = Buffer.alloc(8);
    free.writeUInt32BE(8, 0);
    free.write("free", 4, "latin1");
    // 200,000 empty atoms (1.6 MB) and then the tags. A real file has a handful of top-level atoms.
    const file = path.join(dir, "tiny-atoms.m4b");
    fs.writeFileSync(file, Buffer.concat([Buffer.concat(Array.from({ length: 200_000 }, () => free)), m4b(10, { title: "Reached" })]));
    expect(await readAudioFacts(file, "m4b")).toEqual({});
    // An ordinary file is still read.
    const plain = path.join(dir, "plain.m4b");
    fs.writeFileSync(plain, m4b(10, { title: "Reached" }));
    expect((await readAudioFacts(plain, "m4b")).title).toBe("Reached");
  });
});
