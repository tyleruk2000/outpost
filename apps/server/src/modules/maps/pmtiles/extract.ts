/**
 * Carrying out an extract plan: fetching the planned byte ranges from the remote
 * archive and writing a new, smaller archive, in a way that survives being stopped.
 *
 * Three small files sit next to the partial archive while this runs:
 *
 *   <part>.plan.json      what is being built and from where (address, ETag, ranges)
 *   <part>.head           the finished header and directories, ready to be put in place
 *   <part>.progress.json  which requests have been written and flushed to disk
 *
 * Tile data is written first, at its final offsets. The header and directories go in
 * last, so a file that was interrupted starts with zeros and can never be mistaken for
 * a complete archive. When the work is picked up again, the source's ETag is compared
 * with the one in the plan: same archive, carry on from the recorded progress;
 * different archive, start again, because bytes from two builds must not be mixed.
 */

import { createHash } from "node:crypto";
import fs from "node:fs";
import { HEADER_BYTES } from "./header.ts";
import { type CopyRange, type ExtractPlan, type ExtractRequest, type FetchRange, type PlanOptions, planExtract } from "./plan.ts";
import { type RemoteArchive, SourceChangedError } from "./remote.ts";

const PLAN_VERSION = 1;

export const planPathOf = (partPath: string): string => `${partPath}.plan.json`;
export const headPathOf = (partPath: string): string => `${partPath}.head`;
export const progressPathOf = (partPath: string): string => `${partPath}.progress.json`;

/** The part of a plan needed to carry it out, as it is kept on disk between runs. */
interface SavedPlan {
  version: number;
  sourceUrl: string;
  etag: string | null;
  sourceFingerprint: string;
  request: ExtractRequest;
  outputSize: number;
  tileDataOffset: number;
  tileDataLength: number;
  tileCount: number;
  /** Flattened `CopyRange`s: src, dst, length. */
  copies: number[];
  /** Flattened `FetchRange`s: offset, length, copyFrom, copyTo. */
  requests: number[];
  createdAt: number;
}

interface Work {
  saved: SavedPlan;
  copies: CopyRange[];
  requests: FetchRange[];
}

export interface ExtractProgress {
  /** Bytes of the output written so far. */
  writtenBytes: number;
  totalBytes: number;
  message?: string;
}

export interface ExtractOptions {
  archive: RemoteArchive;
  request: ExtractRequest;
  /** The partial output file. Sidecar files are created next to it. */
  partPath: string;
  signal?: AbortSignal;
  /** Tile-data requests in flight at once. */
  concurrency?: number;
  /** How often progress is flushed to disk while running. */
  checkpointMs?: number;
  planOptions?: PlanOptions;
  /** Supplies the plan; defaults to planning against `archive`. Lets a cached plan be reused. */
  plan?: () => Promise<ExtractPlan>;
  onProgress?(progress: ExtractProgress): void;
}

export interface ExtractResult {
  sizeBytes: number;
  tileCount: number;
  /** Tile-data requests in the whole plan. */
  totalRequests: number;
  /** Tile-data requests made by this run (the rest were already on disk). */
  requestsMade: number;
  /** True when earlier progress was continued. */
  resumed: boolean;
  /** Set when earlier progress had to be thrown away, with the reason in plain words. */
  restartedBecause: string | null;
  etag: string | null;
}

function sameRequest(a: ExtractRequest, b: ExtractRequest): boolean {
  return a.minZoom === b.minZoom && a.maxZoom === b.maxZoom && a.bbox.every((value, index) => value === b.bbox[index]);
}

async function readJson<T>(file: string): Promise<T | undefined> {
  try {
    return JSON.parse(await fs.promises.readFile(file, "utf8")) as T;
  } catch {
    return undefined;
  }
}

/** Writes a small file so that a crash leaves either the old or the new one, never half. */
async function writeAtomic(file: string, content: string | Uint8Array): Promise<void> {
  const temporary = `${file}.tmp`;
  await fs.promises.writeFile(temporary, content);
  await fs.promises.rename(temporary, file);
}

function inflate(saved: SavedPlan): Work {
  const copies: CopyRange[] = [];
  for (let i = 0; i < saved.copies.length; i += 3) {
    copies.push({ src: saved.copies[i]!, dst: saved.copies[i + 1]!, length: saved.copies[i + 2]! });
  }
  const requests: FetchRange[] = [];
  for (let i = 0; i < saved.requests.length; i += 4) {
    requests.push({
      offset: saved.requests[i]!,
      length: saved.requests[i + 1]!,
      copyFrom: saved.requests[i + 2]!,
      copyTo: saved.requests[i + 3]!,
    });
  }
  return { saved, copies, requests };
}

function toSaved(plan: ExtractPlan, archive: RemoteArchive): SavedPlan {
  return {
    version: PLAN_VERSION,
    sourceUrl: archive.url,
    etag: archive.etag(),
    sourceFingerprint: plan.sourceFingerprint,
    request: plan.request,
    outputSize: plan.outputSize,
    tileDataOffset: plan.header.tileDataOffset,
    tileDataLength: plan.tileDataLength,
    tileCount: plan.tileCount,
    copies: plan.copies.flatMap((copy) => [copy.src, copy.dst, copy.length]),
    requests: plan.requests.flatMap((request) => [request.offset, request.length, request.copyFrom, request.copyTo]),
    createdAt: Date.now(),
  };
}

/** Removes the partial archive's sidecar files. Missing ones are fine. */
export async function removeExtractSidecars(partPath: string): Promise<void> {
  for (const file of [planPathOf(partPath), headPathOf(partPath), progressPathOf(partPath)]) {
    await fs.promises.rm(file, { force: true });
    await fs.promises.rm(`${file}.tmp`, { force: true });
  }
}

/** Bytes of a request that are tile data rather than over-fetched gap. */
function payloadOf(request: FetchRange, copies: CopyRange[]): number {
  let total = 0;
  for (let i = request.copyFrom; i < request.copyTo; i += 1) {
    const copy = copies[i]!;
    total += Math.max(0, Math.min(request.offset + request.length, copy.src + copy.length) - Math.max(request.offset, copy.src));
  }
  return total;
}

/** Collapses a list of finished request numbers into [from, to) pairs. */
function toSpans(done: Uint8Array): Array<[number, number]> {
  const spans: Array<[number, number]> = [];
  for (let i = 0; i < done.length; i += 1) {
    if (!done[i]) continue;
    const last = spans[spans.length - 1];
    if (last && last[1] === i) last[1] = i + 1;
    else spans.push([i, i + 1]);
  }
  return spans;
}

/**
 * Decides whether what is on disk can be continued. It can when the saved plan is for
 * the same request and the same archive: same address, same ETag, same header bytes.
 */
async function loadResumable(options: ExtractOptions): Promise<{ work?: Work; discardedBecause?: string }> {
  const { archive, partPath, request } = options;
  const saved = await readJson<SavedPlan>(planPathOf(partPath));
  if (!saved) return {};
  if (saved.version !== PLAN_VERSION || saved.sourceUrl !== archive.url || !sameRequest(saved.request, request)) {
    return { discardedBecause: "The download was started for a different area or source, so it is starting again." };
  }
  const head = await fs.promises.stat(headPathOf(partPath)).catch(() => undefined);
  if (!head || head.size !== saved.tileDataOffset)
    return { discardedBecause: "Part of the saved progress was missing, so the download is starting again." };

  // One small request tells us whether the archive is still the one the plan was made from.
  const header = await archive.read(0, HEADER_BYTES, options.signal);
  const fingerprint = createHash("sha256").update(header).digest("hex");
  if (archive.etag() !== saved.etag || fingerprint !== saved.sourceFingerprint) {
    return { discardedBecause: "The map source was updated since this download began, so it is starting again from the beginning." };
  }
  return { work: inflate(saved) };
}

export async function extractArchive(options: ExtractOptions): Promise<ExtractResult> {
  const { archive, partPath, signal } = options;
  const report = (writtenBytes: number, totalBytes: number, message?: string) =>
    options.onProgress?.({ writtenBytes, totalBytes, message });

  let { work, discardedBecause } = await loadResumable(options);
  const resumed = work !== undefined;
  if (!work) {
    await removeExtractSidecars(partPath);
    await fs.promises.rm(partPath, { force: true });
    if (discardedBecause) report(0, 0, discardedBecause);
    else report(0, 0, "Reading the map index");
    const plan = await (options.plan ?? (() => planExtract(archive.read, options.request, { ...options.planOptions, signal })))();
    const saved = toSaved(plan, archive);
    await fs.promises.writeFile(headPathOf(partPath), plan.head);
    await writeAtomic(planPathOf(partPath), JSON.stringify(saved));
    work = inflate(saved);
  }
  const { saved, copies, requests } = work;

  const done = new Uint8Array(requests.length);
  let written = 0;
  const partExists = await fs.promises.stat(partPath).then(
    () => true,
    () => false,
  );
  if (resumed && partExists) {
    const progress = await readJson<{ done: Array<[number, number]> }>(progressPathOf(partPath));
    for (const [from, to] of progress?.done ?? []) {
      for (let i = Math.max(0, from); i < Math.min(to, requests.length); i += 1) {
        if (!done[i]) written += payloadOf(requests[i]!, copies);
        done[i] = 1;
      }
    }
  }

  const handle = await fs.promises.open(partPath, fs.constants.O_RDWR | fs.constants.O_CREAT);
  const stopper = new AbortController();
  const onOuterAbort = () => stopper.abort(signal?.reason);
  if (signal?.aborted) onOuterAbort();
  signal?.addEventListener("abort", onOuterAbort, { once: true });

  let requestsMade = 0;
  let lastCheckpoint = Date.now();
  let checkpointing: Promise<void> | undefined;
  const checkpoint = (): Promise<void> => {
    // Flush before recording: progress must never claim bytes the disk does not have yet.
    const spans = toSpans(done);
    checkpointing = (checkpointing ?? Promise.resolve())
      .then(() => handle.datasync())
      .then(() => writeAtomic(progressPathOf(partPath), JSON.stringify({ done: spans })));
    return checkpointing;
  };

  const fetchOne = async (index: number): Promise<void> => {
    const request = requests[index]!;
    const bytes = await archive.read(request.offset, request.length, stopper.signal);
    if (bytes.length !== request.length) {
      // A shorter archive than the plan describes is a different archive.
      throw new SourceChangedError("The map source is shorter than it was when this download was planned.");
    }
    requestsMade += 1;
    let payload = 0;
    for (let i = request.copyFrom; i < request.copyTo; i += 1) {
      const copy = copies[i]!;
      const from = Math.max(request.offset, copy.src);
      const to = Math.min(request.offset + request.length, copy.src + copy.length);
      if (to <= from) continue;
      await handle.write(bytes, from - request.offset, to - from, saved.tileDataOffset + copy.dst + (from - copy.src));
      payload += to - from;
    }
    done[index] = 1;
    written += payload;
    report(written, saved.outputSize);
    if (Date.now() - lastCheckpoint >= (options.checkpointMs ?? 2_000)) {
      lastCheckpoint = Date.now();
      await checkpoint();
    }
  };

  let next = 0;
  let failure: unknown;
  const worker = async (): Promise<void> => {
    while (failure === undefined) {
      while (next < requests.length && done[next]) next += 1;
      if (next >= requests.length) return;
      const index = next;
      next += 1;
      try {
        if (stopper.signal.aborted) throw stopper.signal.reason ?? new DOMException("Stopped.", "AbortError");
        await fetchOne(index);
      } catch (error) {
        // The first failure wins; the others are only its echo once the rest are told to stop.
        if (failure === undefined) failure = error ?? new Error("Stopped.");
        stopper.abort(error);
        return;
      }
    }
  };

  try {
    report(written, saved.outputSize, resumed ? "Continuing where it stopped" : "Downloading map tiles");
    await Promise.all(Array.from({ length: Math.max(1, options.concurrency ?? 4) }, worker));
    if (failure !== undefined) {
      await checkpoint().catch(() => undefined);
      throw failure;
    }

    // Everything is in place; now, and only now, the file gets its header and index.
    await handle.datasync();
    const head = await fs.promises.readFile(headPathOf(partPath));
    await handle.write(head, 0, head.length, 0);
    const size = (await handle.stat()).size;
    if (size < saved.outputSize) throw new Error("The extracted map is shorter than planned. The disk may be full.");
    if (size > saved.outputSize) await handle.truncate(saved.outputSize);
    await handle.datasync();
  } finally {
    signal?.removeEventListener("abort", onOuterAbort);
    await checkpointing?.catch(() => undefined);
    await handle.close();
  }

  await removeExtractSidecars(partPath);
  report(saved.outputSize, saved.outputSize);
  return {
    sizeBytes: saved.outputSize,
    tileCount: saved.tileCount,
    totalRequests: requests.length,
    requestsMade,
    resumed,
    restartedBecause: discardedBecause ?? null,
    etag: saved.etag,
  };
}
