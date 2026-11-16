/**
 * Reading tiles out of a PMTiles archive on a local disk.
 *
 * Only the header and the directories on the way to a tile are ever read; the tile's
 * bytes are then read from their exact position. Decoded directories are kept in a
 * small cache, because neighbouring tiles (which is what a map asks for) live in the
 * same leaf directory.
 */
import fs from "node:fs";
import { type Directory, decodeDirectory, decompress, findEntryIndex } from "./directory.ts";
import { HEADER_BYTES, PmtilesError, type PmtilesHeader, parseHeader } from "./header.ts";
import { zxyToTileId } from "./tiles.ts";

/** Directory entries kept decoded per archive (24 bytes each). */
const CACHED_ENTRIES_BUDGET = 400_000;
/** No real tile is this big; a length beyond it means a damaged directory. */
const MAX_TILE_BYTES = 64 * 1024 * 1024;
const MAX_DEPTH = 4;

export class LocalArchive {
  readonly header: PmtilesHeader;
  readonly filePath: string;
  private readonly handle: fs.promises.FileHandle;
  private root: Directory | undefined;
  private readonly leaves = new Map<number, Directory>();
  private cachedEntries = 0;
  private closed = false;
  private active = 0;

  private constructor(filePath: string, handle: fs.promises.FileHandle, header: PmtilesHeader) {
    this.filePath = filePath;
    this.handle = handle;
    this.header = header;
  }

  /** Opens an archive and checks its header. Throws `PmtilesError` if it is not one. */
  static async open(filePath: string): Promise<LocalArchive> {
    const handle = await fs.promises.open(filePath, "r");
    try {
      const bytes = Buffer.alloc(HEADER_BYTES);
      const { bytesRead } = await handle.read(bytes, 0, HEADER_BYTES, 0);
      const header = parseHeader(bytes.subarray(0, bytesRead));
      const { size } = await handle.stat();
      if (header.tileDataOffset + header.tileDataLength > size || header.rootDirectoryOffset + header.rootDirectoryLength > size) {
        throw new PmtilesError("This PMTiles archive is incomplete: it is shorter than its own index says.");
      }
      return new LocalArchive(filePath, handle, header);
    } catch (error) {
      await handle.close();
      throw error;
    }
  }

  private async readAt(offset: number, length: number): Promise<Buffer> {
    const buffer = Buffer.allocUnsafe(length);
    let filled = 0;
    while (filled < length) {
      const { bytesRead } = await this.handle.read(buffer, filled, length - filled, offset + filled);
      if (bytesRead === 0) throw new PmtilesError("This PMTiles archive is incomplete: a read ran past its end.");
      filled += bytesRead;
    }
    return buffer;
  }

  private async directory(offset: number, length: number): Promise<Directory> {
    return decodeDirectory(decompress(await this.readAt(offset, length), this.header.internalCompression));
  }

  private async leaf(offset: number, length: number): Promise<Directory> {
    const cached = this.leaves.get(offset);
    if (cached) {
      // Re-insert so the map's order is least recently used first.
      this.leaves.delete(offset);
      this.leaves.set(offset, cached);
      return cached;
    }
    const directory = await this.directory(this.header.leafDirectoryOffset + offset, length);
    this.leaves.set(offset, directory);
    this.cachedEntries += directory.count;
    for (const [key, value] of this.leaves) {
      if (this.cachedEntries <= CACHED_ENTRIES_BUDGET || this.leaves.size === 1) break;
      this.leaves.delete(key);
      this.cachedEntries -= value.count;
    }
    return directory;
  }

  /** The stored bytes of a tile (still compressed as the archive has them), or undefined. */
  async getTile(z: number, x: number, y: number): Promise<Buffer | undefined> {
    return this.during(z, async () => {
      const found = await this.locate(zxyToTileId(z, x, y));
      return found ? this.readAt(this.header.tileDataOffset + found.offset, found.length) : undefined;
    });
  }

  /** How many bytes a tile takes as stored, read from the directories alone, or undefined when the archive has no such tile. */
  async tileLength(z: number, x: number, y: number): Promise<number | undefined> {
    return this.during(z, async () => (await this.locate(zxyToTileId(z, x, y)))?.length);
  }

  /** Runs one read, keeping the file open until it has finished even if the archive is closed meanwhile. */
  private async during<T>(z: number, read: () => Promise<T | undefined>): Promise<T | undefined> {
    if (this.closed || z < this.header.minZoom || z > this.header.maxZoom) return undefined;
    this.active += 1;
    try {
      return await read();
    } finally {
      this.active -= 1;
      if (this.closed && this.active === 0) await this.handle.close();
    }
  }

  /** Where a tile's bytes are within the tile data, from the directories. */
  private async locate(tileId: number): Promise<{ offset: number; length: number } | undefined> {
    this.root ??= await this.directory(this.header.rootDirectoryOffset, this.header.rootDirectoryLength);
    let directory = this.root;
    for (let depth = 0; depth < MAX_DEPTH; depth += 1) {
      const index = findEntryIndex(directory, tileId);
      if (index === -1) return undefined;
      const run = directory.runLengths[index]!;
      const offset = directory.offsets[index]!;
      const length = directory.lengths[index]!;
      if (run === 0) {
        directory = await this.leaf(offset, length);
        continue;
      }
      if (tileId >= directory.tileIds[index]! + run) return undefined;
      if (length === 0 || length > MAX_TILE_BYTES || offset + length > this.header.tileDataLength) return undefined;
      return { offset, length };
    }
    return undefined;
  }

  /** The archive's JSON description (layers, attribution), or an empty object. */
  async getMetadata(): Promise<Record<string, unknown>> {
    if (this.closed || this.header.metadataLength === 0) return {};
    const packed = await this.readAt(this.header.metadataOffset, this.header.metadataLength);
    try {
      const parsed: unknown = JSON.parse(Buffer.from(decompress(packed, this.header.internalCompression)).toString("utf8"));
      return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }

  /** Lets go of the file. Reads already under way finish first. */
  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    if (this.active === 0) await this.handle.close();
  }
}

/** Reads and checks just the header of a file. */
export async function readLocalHeader(filePath: string): Promise<PmtilesHeader> {
  const archive = await LocalArchive.open(filePath);
  try {
    return archive.header;
  } finally {
    await archive.close();
  }
}
