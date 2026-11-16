/**
 * Writing a new PMTiles archive of image tiles, one tile at a time and in any order.
 *
 * Imagery is made tile by tile, area by area, never in tile-id order, and a world of it
 * does not fit in memory. So the tile data is written straight to the file as each tile
 * is made, starting after a reserved first 16 KB; the index is sorted and written after
 * the data once everything is in; and the header and root directory go into the
 * reserved space last. A file that was interrupted therefore starts with zeros and can
 * never be taken for a complete archive. The archive is marked "not clustered", which
 * the PMTiles specification allows for data that is not in tile-id order.
 *
 * Identical tiles (the sea, say, or a transparent tile) are stored once and pointed at
 * by every position that has them.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import zlib from "node:zlib";
import { buildDirectoriesGently, DirectoryBuilder } from "../pmtiles/directory.ts";
import { Compression, FIRST_READ_BYTES, type PmtilesHeader, serializeHeader, TileType } from "../pmtiles/header.ts";
import { zxyToTileId } from "../pmtiles/tiles.ts";

export interface ImageArchiveInfo {
  bounds: [number, number, number, number];
  minZoom: number;
  maxZoom: number;
  /** Written into the archive's metadata, for anyone who opens the file with other tools. */
  metadata: Record<string, unknown>;
}

export class ImageArchiveWriter {
  private readonly handle: fs.promises.FileHandle;
  private position = FIRST_READ_BYTES;
  private readonly entries: Array<{ id: number; offset: number; length: number }> = [];
  private readonly seen = new Map<string, { offset: number; length: number }>();
  private readonly ids = new Set<number>();
  /** Bytes of distinct tile data written so far. */
  dataBytes = 0;

  private constructor(handle: fs.promises.FileHandle) {
    this.handle = handle;
  }

  /** Starts a new archive at `filePath`, replacing whatever was there. */
  static async create(filePath: string): Promise<ImageArchiveWriter> {
    const handle = await fs.promises.open(filePath, "w");
    // The reserved first read: zeros until the very end.
    await handle.write(Buffer.alloc(FIRST_READ_BYTES), 0, FIRST_READ_BYTES, 0);
    return new ImageArchiveWriter(handle);
  }

  get tileCount(): number {
    return this.entries.length;
  }

  async addTile(z: number, x: number, y: number, data: Uint8Array): Promise<void> {
    const id = zxyToTileId(z, x, y);
    if (this.ids.has(id)) throw new Error(`Tile ${z}/${x}/${y} was written twice.`);
    this.ids.add(id);
    const key = createHash("sha1").update(data).digest("base64");
    const existing = this.seen.get(key);
    if (existing) {
      this.entries.push({ id, ...existing });
      return;
    }
    const offset = this.position - FIRST_READ_BYTES;
    await this.handle.write(data, 0, data.length, this.position);
    this.position += data.length;
    this.dataBytes += data.length;
    const stored = { offset, length: data.length };
    this.seen.set(key, stored);
    this.entries.push({ id, ...stored });
  }

  /** Writes the index and the header, and closes the file. Returns its size in bytes. */
  async finish(info: ImageArchiveInfo, tileType: number = TileType.Webp): Promise<number> {
    try {
      this.entries.sort((a, b) => a.id - b.id);
      // Runs of the same bytes at consecutive ids become one entry.
      const runs: Array<{ id: number; run: number; offset: number; length: number }> = [];
      for (const entry of this.entries) {
        const last = runs.at(-1);
        if (last && last.id + last.run === entry.id && last.offset === entry.offset) last.run += 1;
        else runs.push({ id: entry.id, run: 1, offset: entry.offset, length: entry.length });
      }
      const builder = new DirectoryBuilder(runs.length);
      for (const run of runs) builder.push(run.id, run.run, run.offset, run.length);
      const built = await buildDirectoriesGently(builder.finish(), { compression: Compression.Gzip });
      const tileDataLength = this.position - FIRST_READ_BYTES;
      const metadata = zlib.gzipSync(Buffer.from(JSON.stringify(info.metadata)));
      const metadataOffset = this.position;
      await this.handle.write(metadata, 0, metadata.length, metadataOffset);
      const leafOffset = metadataOffset + metadata.length;
      if (built.leaves.length > 0) await this.handle.write(built.leaves, 0, built.leaves.length, leafOffset);
      const end = leafOffset + built.leaves.length;

      const [west, south, east, north] = info.bounds;
      const header: PmtilesHeader = {
        rootDirectoryOffset: 127,
        rootDirectoryLength: built.root.length,
        metadataOffset,
        metadataLength: metadata.length,
        leafDirectoryOffset: leafOffset,
        leafDirectoryLength: built.leaves.length,
        tileDataOffset: FIRST_READ_BYTES,
        tileDataLength,
        addressedTiles: this.entries.length,
        tileEntries: builder.count,
        tileContents: this.seen.size,
        clustered: false,
        internalCompression: Compression.Gzip,
        tileCompression: Compression.None,
        tileType,
        minZoom: info.minZoom,
        maxZoom: info.maxZoom,
        minLon: west,
        minLat: south,
        maxLon: east,
        maxLat: north,
        centerZoom: Math.round((info.minZoom + info.maxZoom) / 2),
        centerLon: (west + east) / 2,
        centerLat: (south + north) / 2,
      };
      const head = Buffer.concat([serializeHeader(header), built.root]);
      await this.handle.write(head, 0, head.length, 0);
      await this.handle.sync();
      return end;
    } finally {
      await this.handle.close();
    }
  }

  /** Gives up on the archive without finishing it. */
  async abandon(): Promise<void> {
    await this.handle.close().catch(() => undefined);
  }
}
