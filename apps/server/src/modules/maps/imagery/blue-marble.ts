/**
 * The world in map tiles, from NASA's Blue Marble: Next Generation.
 *
 * NASA publishes the picture as GeoTIFFs in plain latitude and longitude, one row of
 * pixels to each Deflate-compressed strip: the whole world in one file at 2 km a pixel,
 * or in eight 90° squares at 500 m. The files are fetched whole (resuming where they
 * stopped) into a folder beside the partial archive, then read row by row, so the
 * picture is never held in memory whole.
 *
 * Each map pixel of the deepest zoom is the average of the picture's pixels whose
 * centres fall inside it; nothing finer than the picture is made (zoom 6 for 2 km,
 * zoom 8 for 500 m). Each coarser zoom is the average of four pixels of the one below.
 */
import fs from "node:fs";
import path from "node:path";
import type { WorldEntry } from "./catalogue.ts";
import { type ByteSource, Cog } from "./cog.ts";
import type { ImageArchiveWriter } from "./pmtiles-writer.ts";
import { TILE_SIZE, worldPixelToLonLat } from "./projection.ts";
import type { RangeFetcher } from "./ranges.ts";
import { cut, encodeTile, halve, type Picture } from "./render.ts";

/** Bytes asked for at once while fetching a file. */
const CHUNK_BYTES = 8 * 1024 * 1024;

export function sourcePathOf(dir: string, url: string): string {
  return path.join(dir, path.basename(new URL(url).pathname));
}

/** Fetches every file of the entry into `dir`, carrying on from whatever is already there. */
export async function fetchWorldFiles(
  entry: WorldEntry,
  fetcher: RangeFetcher,
  dir: string,
  options: { signal?: AbortSignal; onProgress?: (have: number, total: number) => void } = {},
): Promise<void> {
  await fs.promises.mkdir(dir, { recursive: true });
  const total = entry.files.reduce((sum, file) => sum + file.bytes, 0);
  let before = 0;
  for (const file of entry.files) {
    const target = sourcePathOf(dir, file.url);
    let have = (await fs.promises.stat(target).catch(() => undefined))?.size ?? 0;
    if (have > file.bytes) {
      // Longer than NASA says it is: not this file. Start it again.
      await fs.promises.rm(target, { force: true });
      have = 0;
    }
    const handle = await fs.promises.open(target, have > 0 ? "r+" : "w");
    try {
      while (have < file.bytes) {
        options.signal?.throwIfAborted();
        const length = Math.min(CHUNK_BYTES, file.bytes - have);
        const bytes = await fetcher.read(file.url, have, length);
        await handle.write(bytes, 0, bytes.length, have);
        have += bytes.length;
        options.onProgress?.(before + have, total);
      }
      await handle.sync();
    } finally {
      await handle.close();
    }
    before += file.bytes;
  }
}

/** A local file as something the GeoTIFF reader can read. */
async function localSource(filePath: string): Promise<{ source: ByteSource; close: () => Promise<void> }> {
  const handle = await fs.promises.open(filePath, "r");
  return {
    source: {
      async read(offset, length) {
        const buffer = Buffer.allocUnsafe(length);
        const { bytesRead } = await handle.read(buffer, 0, length, offset);
        return buffer.subarray(0, bytesRead);
      },
    },
    close: () => handle.close(),
  };
}

interface Square {
  cog: Cog;
  source: ByteSource;
  /** First global column and row of this square. */
  column: number;
  row: number;
}

export interface WorldBuildProgress {
  tilesWritten: number;
  tilesTotal: number;
}

export function worldTileCount(maxZoom: number): number {
  let count = 0;
  for (let z = 0; z <= maxZoom; z += 1) count += 4 ** z;
  return count;
}

/** Makes every tile of the world from zoom 0 to the entry's deepest and writes them. */
export async function buildWorld(
  entry: WorldEntry,
  dir: string,
  writer: ImageArchiveWriter,
  options: { signal?: AbortSignal; onProgress?: (progress: WorldBuildProgress) => void } = {},
): Promise<void> {
  const opened: Array<{ close: () => Promise<void> }> = [];
  try {
    const squares: Square[] = [];
    let pixelsPerDegree = 0;
    for (const file of entry.files) {
      const local = await localSource(sourcePathOf(dir, file.url));
      opened.push(local);
      const cog = await Cog.open(local.source);
      const image = cog.images[0]!;
      if (image.bitsPerSample !== 8 || image.samplesPerPixel < 3) throw new Error("NASA's file is not the 8-bit colour picture expected.");
      const ppd = image.width / (file.bounds[2] - file.bounds[0]);
      if (pixelsPerDegree && Math.abs(ppd - pixelsPerDegree) > 1e-6) throw new Error("NASA's files are not all at the same resolution.");
      pixelsPerDegree = ppd;
      squares.push({
        cog,
        source: local.source,
        column: Math.round((file.bounds[0] + 180) * ppd),
        row: Math.round((90 - file.bounds[3]) * ppd),
      });
    }
    const globalWidth = Math.round(360 * pixelsPerDegree);
    const globalHeight = Math.round(180 * pixelsPerDegree);
    const maxZoom = entry.maxZoom;
    const width = TILE_SIZE * 2 ** maxZoom;

    // Which picture columns go into each map column: those whose centres fall inside it.
    const columnStart = new Int32Array(width + 1);
    for (let x = 0; x <= width; x += 1) {
      const lon = (x / width) * 360 - 180;
      columnStart[x] = Math.min(globalWidth, Math.max(0, Math.ceil((lon + 180) * pixelsPerDegree - 0.5)));
    }

    /** One global row of the picture, RGB, read from whichever squares hold it. */
    const rowCache = new Map<number, Uint8Array>();
    async function globalRow(r: number): Promise<Uint8Array> {
      const cached = rowCache.get(r);
      if (cached) return cached;
      const out = new Uint8Array(globalWidth * 3);
      for (const square of squares) {
        const image = square.cog.images[0]!;
        const local = r - square.row;
        if (local < 0 || local >= image.height) continue;
        const [ref] = square.cog.tilesFor(0, 0, local, image.width, local + 1);
        if (!ref) continue;
        const bytes = await square.source.read(ref.offset, ref.length);
        const window = square.cog.assemble(0, 0, local, image.width, local + 1, new Map([[ref.index, bytes]]));
        const samples = window.samples;
        const data = window.data as Uint8Array;
        if (samples === 3) out.set(data, square.column * 3);
        else for (let i = 0; i < image.width; i += 1) out.set(data.subarray(i * samples, i * samples + 3), (square.column + i) * 3);
      }
      rowCache.set(r, out);
      return out;
    }

    const total = worldTileCount(maxZoom);
    let done = 0;
    const pending = new Map<number, Picture>();

    async function emit(z: number, ty: number, strip: Picture): Promise<void> {
      const across = strip.width / TILE_SIZE;
      for (let tx = 0; tx < across; tx += 1) {
        options.signal?.throwIfAborted();
        await writer.addTile(z, tx, ty, await encodeTile(cut(strip, tx, 0)));
        done += 1;
      }
      options.onProgress?.({ tilesWritten: done, tilesTotal: total });
      if (z === 0) return;
      if (ty % 2 === 0) {
        pending.set(z, strip);
        return;
      }
      const top = pending.get(z)!;
      pending.delete(z);
      const joined: Picture = { width: strip.width, height: TILE_SIZE * 2, data: new Uint8ClampedArray(strip.data.length * 2) };
      joined.data.set(top.data, 0);
      joined.data.set(strip.data, top.data.length);
      await emit(z - 1, ty >> 1, halve(joined));
    }

    const sums = new Float64Array(globalWidth * 3);
    for (let ty = 0; ty < 2 ** maxZoom; ty += 1) {
      const strip: Picture = { width, height: TILE_SIZE, data: new Uint8ClampedArray(width * TILE_SIZE * 4) };
      for (let y = 0; y < TILE_SIZE; y += 1) {
        const py = ty * TILE_SIZE + y;
        const top = worldPixelToLonLat(0, py, maxZoom)[1];
        const bottom = worldPixelToLonLat(0, py + 1, maxZoom)[1];
        let r0 = Math.ceil((90 - top) * pixelsPerDegree - 0.5);
        let r1 = Math.ceil((90 - bottom) * pixelsPerDegree - 0.5);
        if (r1 <= r0) {
          // A map row thinner than a picture row: the picture row it lies in.
          r0 = Math.min(globalHeight - 1, Math.floor((90 - (top + bottom) / 2) * pixelsPerDegree));
          r1 = r0 + 1;
        }
        sums.fill(0);
        for (let r = r0; r < r1; r += 1) {
          const row = await globalRow(r);
          for (let i = 0; i < row.length; i += 1) sums[i]! += row[i]!;
        }
        const rows = r1 - r0;
        const base = y * width * 4;
        for (let x = 0; x < width; x += 1) {
          let c0 = columnStart[x]!;
          let c1 = columnStart[x + 1]!;
          if (c1 <= c0) {
            c0 = Math.min(globalWidth - 1, c0);
            c1 = c0 + 1;
          }
          let r = 0;
          let g = 0;
          let b = 0;
          for (let c = c0; c < c1; c += 1) {
            r += sums[c * 3]!;
            g += sums[c * 3 + 1]!;
            b += sums[c * 3 + 2]!;
          }
          const n = rows * (c1 - c0);
          const at = base + x * 4;
          strip.data[at] = r / n;
          strip.data[at + 1] = g / n;
          strip.data[at + 2] = b / n;
          strip.data[at + 3] = 255;
        }
        // Rows above this one will not be needed again.
        for (const key of rowCache.keys()) if (key < r0) rowCache.delete(key);
      }
      await emit(maxZoom, ty, strip);
    }
  } finally {
    for (const item of opened) await item.close().catch(() => undefined);
  }
}
