#!/usr/bin/env node
/**
 * Writes a small, real PMTiles archive for the end-to-end tests: genuine (if nearly
 * empty) vector tiles, gzipped as a real archive holds them, over a box in the Lake
 * District from zoom 0 to 9. Each tile carries one name, with letters outside plain
 * Latin, so that keeping an area has lettering to work out.
 *
 *   node e2e/tools/small-map.mjs <file.pmtiles>
 *
 * It uses the server tests' archive writer, which the official `pmtiles` reader checks.
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { buildArchive, tileInBbox } from "../../apps/server/test/fixtures/maps/archive.ts";

export const SMALL_MAP_BBOX = [-3.4, 54.3, -2.8, 54.7];
const MAX_ZOOM = 9;

const field = (tag, bytes) => Buffer.concat([Buffer.from([tag, bytes.length]), bytes]);

/** One vector tile: a layer called "places" with a name among its values and nothing drawn. */
function tile(z, x, y) {
  const value = field(0x0a, Buffer.from(`Łąka ${z}/${x}/${y}`));
  const layer = Buffer.concat([
    field(0x0a, Buffer.from("places")),
    field(0x1a, Buffer.from("name")),
    field(0x22, value),
    Buffer.from([0x28, 0x80, 0x20]), // extent 4096
    Buffer.from([0x78, 0x02]), // version 2
  ]);
  return zlib.gzipSync(field(0x1a, layer));
}

const tiles = [];
for (let z = 0; z <= MAX_ZOOM; z += 1) {
  for (let x = 0; x < 2 ** z; x += 1) {
    for (let y = 0; y < 2 ** z; y += 1) {
      if (tileInBbox(SMALL_MAP_BBOX, z, x, y)) tiles.push({ z, x, y, data: tile(z, x, y) });
    }
  }
}

const out = process.argv[2];
if (!out) throw new Error("Give the file to write.");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, buildArchive({ tiles, metadata: { name: "Small map for tests", attribution: "Outpost tests" } }).bytes);
console.log(`${tiles.length} tiles`);
