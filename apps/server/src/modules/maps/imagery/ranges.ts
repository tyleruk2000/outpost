/**
 * Fetching parts of a publisher's files, politely, and never twice.
 *
 * - Only byte ranges are asked for, and an answer that is not a 206 is refused: a server
 *   that ignored `Range` would otherwise send a whole 150 MB scene.
 * - At most `concurrency` requests are open at once (4 by default).
 * - A refusal for being too busy (429, 503) or a failure of the network is tried again
 *   after 2, 8 and 30 seconds, or after the server's own Retry-After when it gives one
 *   (up to two minutes); anything else, and a fourth failure, stops the job with the
 *   reason. Retries are of a request that delivered nothing usable, so they cannot add
 *   up to more than four times one tile's bytes.
 * - What arrives is kept in a folder beside the partial file, so a job that is paused,
 *   stopped or interrupted fetches nothing again when it carries on.
 * - Every byte received is counted, cached or not, and the count is what the person is
 *   told was transferred.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { AppError, classifyNetworkError } from "../../../core/errors.ts";
import type { HttpClient } from "../../../core/http.ts";
import { PermanentJobError } from "../../../core/jobs.ts";
import { hostOf } from "../source.ts";

export interface Transfer {
  bytes: number;
  requests: number;
}

export interface RangeFetcherOptions {
  client: HttpClient;
  /** The only hosts asked. */
  allowedHosts: string[];
  /** Where fetched parts are kept between runs; none in an estimate. */
  cacheDir?: string;
  signal?: AbortSignal;
  /** Called for every chunk before it is used, for the download speed limit. */
  throttle?: (bytes: number) => Promise<void>;
  concurrency?: number;
  /**
   * Adds what a publisher asks to be sent with each request (a short-lived token in the
   * query, for Microsoft's Planetary Computer). What is kept between runs is filed under
   * the address without it, so a new token does not mean fetching again.
   */
  sign?: (url: string) => Promise<string>;
  /** Waits before a retry; replaced in tests. */
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
}

export interface RangeFetcher {
  read(url: string, offset: number, length: number): Promise<Uint8Array>;
  /** As `read`, but undefined when the publisher has no such file (403, 404 or 410): for files that may not exist. */
  readIfExists(url: string, offset: number, length: number): Promise<Uint8Array | undefined>;
  readonly transfer: Transfer;
}

const RETRY_DELAYS_MS = [2_000, 8_000, 30_000];
const MAX_RETRY_AFTER_MS = 120_000;

const defaultSleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });

class Busy extends Error {
  readonly waitMs: number | undefined;
  constructor(message: string, waitMs?: number) {
    super(message);
    this.waitMs = waitMs;
  }
}

export function createRangeFetcher(options: RangeFetcherOptions): RangeFetcher {
  const transfer: Transfer = { bytes: 0, requests: 0 };
  const allowed = new Set(options.allowedHosts.map((host) => host.toLowerCase()));
  const limit = Math.max(1, options.concurrency ?? 4);
  const sleep = options.sleep ?? defaultSleep;
  let running = 0;
  const waiting: Array<() => void> = [];

  async function slot<T>(work: () => Promise<T>): Promise<T> {
    if (running >= limit) await new Promise<void>((resolve) => waiting.push(resolve));
    running += 1;
    try {
      return await work();
    } finally {
      running -= 1;
      waiting.shift()?.();
    }
  }

  const cachePath = (url: string, offset: number, length: number) =>
    options.cacheDir
      ? path.join(options.cacheDir, `${createHash("sha1").update(`${url}#${offset}+${length}`).digest("hex")}.bin`)
      : undefined;

  async function once(url: string, offset: number, length: number): Promise<Uint8Array> {
    const host = hostOf(url);
    const signed = options.sign ? await options.sign(url) : url;
    if (hostOf(signed) !== host) throw new PermanentJobError(`${host} is not where this file was to come from.`);
    const { response } = await options.client.fetch(signed, {
      headers: { range: `bytes=${offset}-${offset + length - 1}`, "accept-encoding": "identity" },
      signal: options.signal,
      allowedHosts: [host],
      // A redirect must not take a request somewhere the person was not told about.
      everyHop: true,
    });
    transfer.requests += 1;
    if (response.status === 206) {
      // Asking past the end of a file is answered with what there is (a header read of a small file).
      const total = Number(/\/(\d+)$/.exec(response.headers.get("content-range") ?? "")?.[1]);
      const expected = Number.isFinite(total) && total > 0 ? Math.max(0, Math.min(length, total - offset)) : length;
      const chunks: Uint8Array[] = [];
      let received = 0;
      for await (const chunk of response.body ?? []) {
        const bytes = chunk as Uint8Array;
        await options.throttle?.(bytes.length);
        transfer.bytes += bytes.length;
        received += bytes.length;
        if (received > length) {
          throw new AppError("upstream", `${host} sent more than was asked for. Nothing more will be fetched from it.`);
        }
        chunks.push(bytes);
      }
      if (received !== expected) throw new Error(`${host} sent ${received} bytes where ${expected} were expected.`);
      return Buffer.concat(chunks, received);
    }
    await response.body?.cancel().catch(() => undefined);
    if (response.status === 429 || response.status === 503 || response.status === 502 || response.status === 504) {
      const after = Number(response.headers.get("retry-after"));
      throw new Busy(`${host} is busy (HTTP ${response.status}).`, Number.isFinite(after) && after > 0 ? after * 1000 : undefined);
    }
    if (response.status === 200) {
      throw new PermanentJobError(
        `${host} sent the whole file instead of the part asked for. Outpost stopped rather than download all of it.`,
      );
    }
    if (response.status === 403 || response.status === 404 || response.status === 410) {
      throw new PermanentJobError(
        `${host} no longer has this file (HTTP ${response.status}). The scene may have been withdrawn; choose another date.`,
        "not_found",
      );
    }
    throw new PermanentJobError(`${host} refused the request (HTTP ${response.status}). Nothing more was asked of it.`);
  }

  async function read(url: string, offset: number, length: number): Promise<Uint8Array> {
    if (!allowed.has(hostOf(url))) throw new PermanentJobError(`${hostOf(url)} is not a source Outpost fetches imagery from.`);
    if (length <= 0) return new Uint8Array(0);
    const cached = cachePath(url, offset, length);
    if (cached) {
      const kept = await fs.promises.readFile(cached).catch(() => undefined);
      if (kept && kept.length > 0 && kept.length <= length) return kept;
    }
    const bytes = await slot(async () => {
      for (let attempt = 0; ; attempt += 1) {
        try {
          return await once(url, offset, length);
        } catch (error) {
          if (options.signal?.aborted) throw error;
          const retryable =
            error instanceof Busy ||
            (!(error instanceof AppError) && !(error instanceof PermanentJobError) && classifyNetworkError(error) !== "other");
          if (!retryable || attempt >= RETRY_DELAYS_MS.length) {
            if (error instanceof Busy) throw new Error(`${error.message} Outpost stopped asking; it will try again later.`);
            throw error;
          }
          const wait = error instanceof Busy && error.waitMs ? Math.min(error.waitMs, MAX_RETRY_AFTER_MS) : RETRY_DELAYS_MS[attempt]!;
          await sleep(wait, options.signal);
        }
      }
    });
    if (cached) {
      await fs.promises.mkdir(path.dirname(cached), { recursive: true });
      const temporary = `${cached}.${process.pid}.tmp`;
      await fs.promises.writeFile(temporary, bytes);
      await fs.promises.rename(temporary, cached);
    }
    return bytes;
  }

  async function readIfExists(url: string, offset: number, length: number): Promise<Uint8Array | undefined> {
    try {
      return await read(url, offset, length);
    } catch (error) {
      if (error instanceof PermanentJobError && error.kind === "not_found") return undefined;
      throw error;
    }
  }

  return { read, readIfExists, transfer };
}
