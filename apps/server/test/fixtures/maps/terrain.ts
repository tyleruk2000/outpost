/**
 * Test-only terrain: a PNG writer, and Terrarium elevation tiles made from a rule that
 * says how high the ground is, so a test knows the height of every point without a
 * second decoder.
 */
import zlib from "node:zlib";
import type { FixtureTile } from "./archive.ts";

/** A PNG writer for tests: 8-bit RGB or RGBA, each row stored with the filter asked for. */
export function encodePng(
  width: number,
  height: number,
  pixel: (x: number, y: number) => number,
  options: { alpha?: boolean; filter?: number } = {},
) {
  const channels = options.alpha ? 4 : 3;
  const stride = width * channels;
  const rows: Buffer[] = [];
  let previous = Buffer.alloc(stride);
  for (let y = 0; y < height; y += 1) {
    const row = Buffer.alloc(stride);
    for (let x = 0; x < width; x += 1) {
      const argb = pixel(x, y);
      row[x * channels] = (argb >>> 16) & 0xff;
      row[x * channels + 1] = (argb >>> 8) & 0xff;
      row[x * channels + 2] = argb & 0xff;
      if (options.alpha) row[x * channels + 3] = argb >>> 24;
    }
    // Rows cycle through all five filters unless one is asked for.
    const filter = options.filter ?? y % 5;
    const stored = Buffer.alloc(stride + 1);
    stored[0] = filter;
    for (let index = 0; index < stride; index += 1) {
      const left = index >= channels ? row[index - channels]! : 0;
      const up = previous[index]!;
      const upperLeft = index >= channels ? previous[index - channels]! : 0;
      const estimate = left + up - upperLeft;
      const nearest =
        Math.abs(estimate - left) <= Math.abs(estimate - up) && Math.abs(estimate - left) <= Math.abs(estimate - upperLeft)
          ? left
          : Math.abs(estimate - up) <= Math.abs(estimate - upperLeft)
            ? up
            : upperLeft;
      const predicted = [0, left, up, (left + up) >> 1, nearest][filter]!;
      stored[index + 1] = (row[index]! - predicted) & 0xff;
    }
    rows.push(stored);
    previous = row;
  }
  const chunk = (kind: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(kind, "latin1"), data]);
    const framed = Buffer.alloc(body.length + 8);
    framed.writeUInt32BE(data.length, 0);
    body.copy(framed, 4);
    framed.writeUInt32BE(zlib.crc32(body), body.length + 4);
    return framed;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, options.alpha ? 6 : 2, 0, 0, 0], 8);
  const packed = zlib.deflateSync(Buffer.concat(rows));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    // Split in two, as large images are.
    chunk("IDAT", packed.subarray(0, packed.length >> 1)),
    chunk("IDAT", packed.subarray(packed.length >> 1)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/**
 * How high the ground is, in metres, at a place given as a share of the way across the
 * world and down it on the Web Mercator map (0 to 1 each way, from the top-left corner).
 */
export type Ground = (worldX: number, worldY: number) => number;

/** Where a position is on the Web Mercator map, as `Ground` takes it. */
export const worldOf = (lat: number, lon: number): [worldX: number, worldY: number] => [
  (lon + 180) / 360,
  (1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2,
];

/** The longitude and latitude of a place on the Web Mercator map: the other way round. */
export const positionOf = (worldX: number, worldY: number): { lat: number; lon: number } => ({
  lon: worldX * 360 - 180,
  lat: (Math.atan(Math.sinh(Math.PI * (1 - 2 * worldY))) * 180) / Math.PI,
});

/**
 * Terrain tiles (PNG, Terrarium) of a ground, for every tile from `minZoom` to
 * `maxZoom` that `keep` accepts. Each pixel holds the height at its centre.
 */
export function groundTiles(
  ground: Ground,
  options: { maxZoom: number; minZoom?: number; keep?: (z: number, x: number, y: number) => boolean; size?: number },
): FixtureTile[] {
  const size = options.size ?? 64;
  const keep = options.keep ?? (() => true);
  const tiles: FixtureTile[] = [];
  for (let z = options.minZoom ?? 0; z <= options.maxZoom; z += 1) {
    for (let x = 0; x < 2 ** z; x += 1) {
      for (let y = 0; y < 2 ** z; y += 1) {
        if (!keep(z, x, y)) continue;
        const data = encodePng(
          size,
          size,
          (i, j) => {
            const value = Math.round((ground((x + (i + 0.5) / size) / 2 ** z, (y + (j + 0.5) / size) / 2 ** z) + 32768) * 256);
            return (0xff000000 | value) >>> 0;
          },
          { filter: 0 },
        );
        tiles.push({ z, x, y, data });
      }
    }
  }
  return tiles;
}
