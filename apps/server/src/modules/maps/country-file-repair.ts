/**
 * Repairing a kept country file (a Geofabrik `.osm.pbf`) that no longer matches its
 * checksum, on a press, without downloading all of it again: the file is read block by
 * block until a block will not decompress (or the file ends early), and only that stretch
 * is asked of Geofabrik with a bounded Range request (`bytes=start-end`) for the same dated
 * file. The bytes are written over the damaged stretch, and the whole file is then checked
 * against Geofabrik's own MD5. If it still does not match, every byte written is put back
 * as it was and the person is told to download it again.
 *
 * A server that ignores the Range and sends the whole file (HTTP 200) is not read on: the
 * answer is dropped and nothing is changed. At most `REPAIR_MOST_BYTES` are fetched in all,
 * in at most `MOST_STRETCHES` stretches; more damage than that is a new download's job.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import zlib from "node:zlib";
import type { AppContext } from "../../core/context.ts";
import { AppError, badRequest } from "../../core/errors.ts";
import type { HttpClient } from "../../core/http.ts";
import { PermanentJobError } from "../../core/jobs.ts";
import { Proto } from "../layers/adapters/pbf.ts";

/** The most fetched in one repair: past this, downloading again is the honest answer. */
export const REPAIR_MOST_BYTES = 64 * 1048576;
export const MOST_STRETCHES = 8;
/** A block header (BlobHeader) is never larger than this, by the format. */
const MAX_HEADER = 64 * 1024;
/** Nor a block (Blob). */
const MAX_BLOB = 32 * 1048576;
/** Where a block's header itself is unreadable its end is not known: this much is fetched from its start, and the file read again from there. */
const UNKNOWN_STRETCH = 4 * 1048576;

/** Bytes `start` up to (not including) `end`. */
export interface Stretch {
  start: number;
  end: number;
}

async function readAt(handle: fs.promises.FileHandle, position: number, length: number): Promise<Buffer | null> {
  const buffer = Buffer.alloc(length);
  const { bytesRead } = await handle.read(buffer, 0, length, position);
  return bytesRead === length ? buffer : null;
}

/** Whether a block's bytes are a block that decompresses to the size it says. */
function blockIsWhole(bytes: Uint8Array): boolean {
  try {
    const blob = new Proto(bytes);
    let raw: Uint8Array | null = null;
    let zipped: Uint8Array | null = null;
    let rawSize = -1;
    for (let field = blob.field(); field; field = blob.field()) {
      if (field.no === 1 && field.wire === 2) raw = blob.bytes();
      else if (field.no === 2 && field.wire === 0) rawSize = blob.varint();
      else if (field.no === 3 && field.wire === 2) zipped = blob.bytes();
      else blob.skip(field.wire);
    }
    if (raw) return true;
    if (!zipped) return false;
    const data = zlib.inflateSync(zipped, { maxOutputLength: MAX_BLOB });
    return rawSize < 0 || data.length === rawSize;
  } catch {
    return false;
  }
}

/**
 * The first damaged stretch at or after `from` (a block's start), or null when every block
 * from there on reads: a block that will not decompress, a header that cannot be read (its
 * end unknown: `UNKNOWN_STRETCH` from its start), or the file ending before `bytes`.
 */
export async function findDamage(filePath: string, bytes: number, from = 0, signal?: AbortSignal): Promise<Stretch | null> {
  const handle = await fs.promises.open(filePath, "r");
  try {
    const size = (await handle.stat()).size;
    let offset = from;
    const unknown = (start: number): Stretch => ({ start, end: Math.min(bytes, start + UNKNOWN_STRETCH) });
    while (offset < bytes) {
      signal?.throwIfAborted();
      if (offset >= size) return { start: offset, end: bytes };
      const length = await readAt(handle, offset, 4);
      if (!length) return { start: offset, end: bytes };
      const headerLength = length.readUInt32BE(0);
      if (headerLength === 0 || headerLength > MAX_HEADER) return unknown(offset);
      const headerBytes = await readAt(handle, offset + 4, headerLength);
      if (!headerBytes) return { start: offset, end: bytes };
      let dataSize = -1;
      let typed = false;
      try {
        const header = new Proto(headerBytes);
        for (let field = header.field(); field; field = header.field()) {
          if (field.no === 1 && field.wire === 2) typed = header.bytes().length > 0;
          else if (field.no === 3 && field.wire === 0) dataSize = header.varint();
          else header.skip(field.wire);
        }
      } catch {
        return unknown(offset);
      }
      if (!typed || dataSize < 0 || dataSize > MAX_BLOB) return unknown(offset);
      const end = offset + 4 + headerLength + dataSize;
      if (end > bytes) return unknown(offset);
      const data = await readAt(handle, offset + 4 + headerLength, dataSize);
      if (!data) return { start: offset, end: bytes };
      if (!blockIsWhole(data)) return { start: offset, end };
      offset = end;
    }
    return null;
  } finally {
    await handle.close();
  }
}

/** The stretch from the source, by a bounded Range request; a whole file sent instead is refused unread. */
async function fetchStretch(
  client: HttpClient,
  url: string,
  stretch: Stretch,
  bytes: number,
  allowedHosts: string[],
  signal?: AbortSignal,
): Promise<Buffer> {
  const want = stretch.end - stretch.start;
  const { response } = await client.fetch(url, {
    headers: { Range: `bytes=${stretch.start}-${stretch.end - 1}` },
    allowedHosts,
    signal,
  });
  const drop = () => response.body?.cancel().catch(() => undefined);
  if (response.status === 200) {
    await drop();
    throw new AppError(
      "upstream",
      "Geofabrik sent the whole file instead of the damaged stretch asked for, so nothing was changed. Download the file again instead.",
    );
  }
  if (response.status !== 206) {
    await drop();
    throw new AppError("upstream", `Geofabrik answered ${response.status} when asked for the damaged stretch. Nothing was changed.`);
  }
  const range = /^bytes (\d+)-(\d+)\/(\d+|\*)$/.exec(response.headers.get("content-range") ?? "");
  if (
    !range ||
    Number(range[1]) !== stretch.start ||
    Number(range[2]) !== stretch.end - 1 ||
    // The whole file's size must be given, and be the size kept: "*" says nothing of which file this is.
    range[3] === "*" ||
    Number(range[3]) !== bytes
  ) {
    await drop();
    throw new AppError(
      "upstream",
      "Geofabrik sent a different stretch from the one asked for, or its file is no longer the size kept. Nothing was changed.",
    );
  }
  const parts: Buffer[] = [];
  let got = 0;
  const reader = response.body?.getReader();
  if (!reader) throw new AppError("upstream", "Geofabrik sent nothing for the damaged stretch. Nothing was changed.");
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    got += value.length;
    if (got > want) {
      await reader.cancel().catch(() => undefined);
      throw new AppError("upstream", "Geofabrik sent more than the stretch asked for. Nothing was changed.");
    }
    parts.push(Buffer.from(value));
  }
  if (got !== want) throw new AppError("upstream", "The damaged stretch came short. Nothing was changed; try again.");
  return Buffer.concat(parts);
}

async function md5Of(filePath: string, signal?: AbortSignal): Promise<string> {
  const hash = crypto.createHash("md5");
  for await (const chunk of fs.createReadStream(filePath, { highWaterMark: 1 << 20, signal })) hash.update(chunk as Buffer);
  return hash.digest("hex");
}

/** Where the bytes a repair writes over are kept until Geofabrik's checksum is matched: beside the file. */
export const undoPathOf = (filePath: string) => `${filePath}.outpost-repair-undo`;
const UNDO_MAGIC = "OUTPOST-REPAIR-UNDO 1\n";

/** Writes the undo file in full and to the disk, before any byte of the file is changed. */
async function writeUndo(filePath: string, originalSize: number, undo: Array<{ start: number; bytes: Buffer }>): Promise<void> {
  const head = Buffer.from(`${UNDO_MAGIC}${JSON.stringify({ originalSize, stretches: undo.map((u) => [u.start, u.bytes.length]) })}\n`);
  const target = undoPathOf(filePath);
  const handle = await fs.promises.open(`${target}.tmp`, "w");
  try {
    await handle.writeFile(Buffer.concat([head, ...undo.map((u) => u.bytes)]));
    await handle.sync();
  } finally {
    await handle.close();
  }
  await fs.promises.rename(`${target}.tmp`, target);
}

/**
 * Puts a file back as it was before a repair that did not finish (the server stopped while
 * it ran), from the undo file beside it, and removes the undo file. Returns whether there
 * was one. An undo file that cannot be read is left where it is, and the file untouched.
 */
export async function restoreFromUndo(filePath: string): Promise<boolean> {
  const target = undoPathOf(filePath);
  await fs.promises.rm(`${target}.tmp`, { force: true });
  let data: Buffer;
  try {
    data = await fs.promises.readFile(target);
  } catch {
    return false;
  }
  const end = data.indexOf(10, UNDO_MAGIC.length);
  if (data.toString("utf8", 0, UNDO_MAGIC.length) !== UNDO_MAGIC || end < 0) return false;
  const head = JSON.parse(data.toString("utf8", UNDO_MAGIC.length, end)) as { originalSize: number; stretches: Array<[number, number]> };
  const handle = await fs.promises.open(filePath, "r+");
  try {
    let at = end + 1;
    const pieces = head.stretches.map(([start, length]) => {
      const piece = { start, bytes: data.subarray(at, at + length) };
      at += length;
      return piece;
    });
    // Last first: a stretch fetched twice holds the original bytes in its first entry.
    for (const { start, bytes } of pieces.reverse()) await handle.write(bytes, 0, bytes.length, start);
    await handle.truncate(head.originalSize);
    await handle.sync();
  } finally {
    await handle.close();
  }
  await fs.promises.rm(target, { force: true });
  return true;
}

export interface RepairResult {
  stretches: Stretch[];
  /** Bytes fetched in all. */
  fetched: number;
}

/**
 * Repairs the file in place from `url` (the same dated file), or leaves it exactly as it
 * was and throws. `bytes` and `md5` are the file's as Geofabrik published it.
 */
export async function repairCountryFile(input: {
  filePath: string;
  url: string;
  bytes: number;
  md5: string;
  client: HttpClient;
  allowedHosts: string[];
  signal?: AbortSignal;
  progress?: (message: string) => void;
}): Promise<RepairResult> {
  const { filePath, bytes, signal } = input;
  // A repair cut short before: put back first, so that this one starts from the file as it was.
  await restoreFromUndo(filePath);
  const originalSize = (await fs.promises.stat(filePath)).size;
  if (originalSize > bytes)
    throw new AppError("bad_request", "The file is larger than Geofabrik's, so it cannot be repaired in place. Download it again.");
  const undo: Array<{ start: number; bytes: Buffer }> = [];
  const stretches: Stretch[] = [];
  let fetched = 0;
  const putBack = () => restoreFromUndo(filePath);
  try {
    let from = 0;
    for (;;) {
      input.progress?.("Looking for the damaged stretch");
      const stretch = await findDamage(filePath, bytes, from, signal);
      if (!stretch) break;
      if (stretches.length >= MOST_STRETCHES || fetched + (stretch.end - stretch.start) > REPAIR_MOST_BYTES)
        throw new AppError("bad_request", "Too much of the file is damaged to repair a stretch at a time. Download it again.");
      input.progress?.(`Fetching ${stretch.end - stretch.start} bytes from ${stretch.start}`);
      const fresh = await fetchStretch(input.client, input.url, stretch, bytes, input.allowedHosts, signal);
      const handle = await fs.promises.open(filePath, "r+");
      try {
        const old = Buffer.alloc(stretch.end - stretch.start);
        const { bytesRead } = await handle.read(old, 0, old.length, stretch.start);
        undo.push({ start: stretch.start, bytes: old.subarray(0, bytesRead) });
        // The way back is on the disk before the file is touched, so that a power cut leaves both.
        await writeUndo(filePath, originalSize, undo);
        await handle.write(fresh, 0, fresh.length, stretch.start);
        await handle.sync();
      } finally {
        await handle.close();
      }
      stretches.push(stretch);
      fetched += fresh.length;
      from = stretch.start;
    }
    input.progress?.("Checking the whole file against Geofabrik's checksum");
    const md5 = await md5Of(filePath, signal);
    if (md5 !== input.md5.toLowerCase())
      throw new AppError(
        "bad_request",
        stretches.length === 0
          ? "No damaged stretch was found, but the file does not match Geofabrik's checksum. Download it again."
          : "The file still does not match Geofabrik's checksum after the repair, so it was put back as it was. Download it again.",
      );
    await fs.promises.rm(undoPathOf(filePath), { force: true });
    return { stretches, fetched };
  } catch (error) {
    if (undo.length > 0) await putBack();
    throw error;
  }
}

export const COUNTRY_FILE_REPAIR_JOB = "maps.country-file.repair";

/**
 * The repair as a task (`POST /api/maps/data/repair`, on a press): for a kept country file
 * marked damaged, from the dated file it was downloaded from and Geofabrik's MD5 kept with
 * it. Once repaired, the file is checked again as Storage checks it, which marks it intact.
 */
export function createCountryFileRepair(ctx: AppContext, client: HttpClient) {
  const { collections, storage } = ctx.services;
  ctx.jobs.register<{ collectionId: string }>(COUNTRY_FILE_REPAIR_JOB, {
    queue: "import",
    async run({ payload, signal, progress, job }) {
      const row = collections.get(payload.collectionId);
      if (!row) throw new PermanentJobError("The source file has been removed, so there is nothing to repair.");
      // Started again by a restart, not by a press: nothing is asked of Geofabrik; the file is put back as it was.
      if (job.progressMessage === "Resuming after restart") {
        if (storage.isAvailable(row.locationId)) await restoreFromUndo(storage.resolve(row.locationId, row.relPath));
        throw new PermanentJobError("Outpost stopped while the repair was under way, so it was not finished: press Repair again.");
      }
      const meta = (row.meta as { countryFile?: { sourceUrl?: string; md5?: string | null } }).countryFile;
      if (!meta?.sourceUrl || !meta.md5)
        throw new PermanentJobError("Outpost does not have Geofabrik's checksum for this file, so it cannot repair it. Download it again.");
      const filePath = storage.resolve(row.locationId, row.relPath);
      if (!fs.existsSync(filePath)) throw new PermanentJobError("The source file is missing from its storage location. Download it again.");
      try {
        const result = await repairCountryFile({
          filePath,
          url: meta.sourceUrl,
          bytes: row.sizeBytes,
          md5: meta.md5,
          client,
          allowedHosts: [new URL(meta.sourceUrl).hostname],
          signal,
          progress: (message) => progress({ current: 0, total: null, message }),
        });
        return { stretches: result.stretches.length, fetched: result.fetched };
      } catch (error) {
        if (error instanceof AppError) throw new PermanentJobError(error.message);
        throw error;
      }
    },
    // Checked again once the repair has let go of the file: Storage's own check marks it intact.
    onSettled(job) {
      const collectionId = (job.payload as { collectionId?: unknown }).collectionId;
      if (job.state === "succeeded" && typeof collectionId === "string" && collections.get(collectionId)) collections.verify(collectionId);
      ctx.events.publish({ type: "maps.changed" });
    },
  });
  // Soon after start: a repair cut short by a power cut has its file put back from the undo beside it.
  const leftOver = setTimeout(() => {
    void (async () => {
      // A server closed at once after it started (a test, a quick restart) has no database to look in: nothing to put back then.
      let rows: ReturnType<typeof collections.list> = [];
      try {
        rows = collections.list({ kind: "extract" }).filter((row) => storage.isAvailable(row.locationId));
      } catch (error) {
        ctx.log.debug({ err: error }, "source files not looked at for unfinished repairs: the server is closing");
        return;
      }
      for (const row of rows) {
        try {
          if (await restoreFromUndo(storage.resolve(row.locationId, row.relPath)))
            ctx.log.info({ collection: row.id }, "A source file's unfinished repair was put back as it was");
        } catch (error) {
          ctx.log.warn({ err: error, collection: row.id }, "A source file's unfinished repair could not be put back");
        }
      }
    })();
  }, 0);
  leftOver.unref();
  return {
    start(collectionId: string): { taskId: string } {
      const row = collections.get(collectionId);
      if (row?.kind !== "extract") throw new AppError("not_found", "That source file was not found. It may have been removed.");
      if (row.status !== "damaged")
        throw badRequest("Only a source file that no longer matches its checksum is repaired. Check it under Storage first.");
      const job = ctx.jobs.enqueue(
        COUNTRY_FILE_REPAIR_JOB,
        { collectionId },
        { title: `${row.title}: repair`, subject: `collection:${row.id}`, maxAttempts: 1 },
      );
      return { taskId: job.id };
    },
  };
}
