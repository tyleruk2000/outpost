/**
 * Writes a small terrain archive for the end-to-end tests, made the way the server's
 * own tests make theirs (apps/server/test/fixtures/maps): elevation tiles from a rule
 * that says how high the ground is, so a test knows the answer before it asks.
 *
 * The ground is a plain at 100 m with two ridges running north to south, each 400 m
 * high and about 1.3 km wide: one along 3.5° W and one along 3.3° W, between 56.9° N and 57.1° N. A path across a
 * ridge from plain to plain is blocked; a path from one crest to the other is clear.
 *
 *   node e2e/tools/terrain-fixture.mjs <file to write> [cells per tile]
 */
import fs from "node:fs";
import path from "node:path";
import { Compression, TileType } from "../../apps/server/src/modules/maps/pmtiles/header.ts";
import { buildArchive } from "../../apps/server/test/fixtures/maps/archive.ts";
import { groundTiles, positionOf } from "../../apps/server/test/fixtures/maps/terrain.ts";

export const BOX = [-3.8, 56.9, -3.1, 57.1];
export const RIDGES = [-3.5, -3.3];

const ground = (worldX, worldY) => {
  const { lon } = positionOf(worldX, worldY);
  return 100 + RIDGES.reduce((height, ridge) => height + 400 * Math.exp(-(((lon - ridge) / 0.02) ** 2)), 0);
};

const [file, size] = process.argv.slice(2);
if (file) {
  const tiles = groundTiles(ground, { minZoom: 12, maxZoom: 12, size: Number(size) || 64, bbox: BOX });
  const archive = buildArchive({ tiles, bounds: BOX, tileType: TileType.Png, tileCompression: Compression.None });
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, archive.bytes);
  console.log(`${tiles.length} tiles, ${archive.bytes.length} bytes`);
}
