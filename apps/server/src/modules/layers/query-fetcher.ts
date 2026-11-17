/**
 * The download manager's fetcher for answers to queries (Overpass, Wikidata's query
 * service): the question is posted or sent once, and the answer written to the
 * download's file. One question at a time to each host, with a pause after each and a
 * longer one after a host says it is busy, as their operators ask. An answer cannot be
 * resumed part-way, so a retry asks again from the start; retries are the download
 * manager's, with its back-off.
 */
import fs from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { AppError } from "../../core/errors.ts";
import type { HttpClient } from "../../core/http.ts";
import { PermanentJobError } from "../../core/jobs.ts";
import type { Fetcher } from "../downloads/types.ts";
import { REFERENCE_USER_AGENT } from "./adapters/http.ts";

export const QUERY_FETCHER = "reference-query";
/** Between two questions to one host. */
export const QUERY_GAP_MS = 2_000;
/** After a host says it is busy. */
export const BUSY_GAP_MS = 60_000;

export interface QuerySpec {
  method: "GET" | "POST";
  url: string;
  /** Form body of a POST. */
  body?: string;
  accept: string;
  /** Larger answers are refused. */
  maxBytes: number;
  /** The name Outpost gives: the project's (REFERENCE_USER_AGENT) unless the source is asked under Outpost's plain name. */
  userAgent?: string;
  /** Headers the source needs (the Food Standards Agency's API wants the version it is asked in). */
  headers?: Record<string, string>;
}

export function createQueryFetcher(client: HttpClient, options: { gapMs?: number; busyMs?: number } = {}): Fetcher {
  const gap = options.gapMs ?? QUERY_GAP_MS;
  const busyGap = options.busyMs ?? BUSY_GAP_MS;
  /** Per host: the end of the question in hand, and when the next may start. */
  const turns = new Map<string, { chain: Promise<void>; notBefore: number }>();

  async function take(host: string, signal: AbortSignal): Promise<() => void> {
    const turn = turns.get(host) ?? { chain: Promise.resolve(), notBefore: 0 };
    turns.set(host, turn);
    const before = turn.chain;
    let release = () => {};
    turn.chain = before.then(() => new Promise<void>((resolve) => (release = resolve)));
    await before;
    const wait = turn.notBefore - Date.now();
    if (wait > 0) {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, wait);
        signal.addEventListener(
          "abort",
          () => {
            clearTimeout(timer);
            reject(signal.reason);
          },
          { once: true },
        );
      }).catch((error) => {
        release();
        throw error;
      });
    }
    return release;
  }

  return async ({ download, partPath, signal, throttle, progress }) => {
    const spec = (download.meta as { query?: QuerySpec }).query;
    if (!spec) throw new PermanentJobError("This download does not say what to ask.");
    const host = new URL(spec.url).hostname;
    const release = await take(host, signal);
    const turn = turns.get(host)!;
    let busy = false;
    try {
      progress(0, null, `Asking ${host}`);
      const { response } = await client.fetch(spec.url, {
        method: spec.method,
        ...(spec.body !== undefined ? { body: spec.body } : {}),
        headers: {
          ...spec.headers,
          "user-agent": spec.userAgent ?? REFERENCE_USER_AGENT,
          accept: spec.accept,
          ...(spec.method === "POST" ? { "content-type": "application/x-www-form-urlencoded; charset=UTF-8" } : {}),
        },
        allowedHosts: [host],
        everyHop: true,
        signal,
      });
      if (!response.ok) {
        await response.body?.cancel().catch(() => undefined);
        if ([429, 502, 503, 504].includes(response.status)) {
          busy = true;
          throw new AppError("upstream", `${host} is busy (HTTP ${response.status}). Outpost will ask again later.`);
        }
        if (response.status === 400) throw new PermanentJobError(`${host} did not accept the question (HTTP 400).`);
        throw new AppError("upstream", `${host} could not answer (HTTP ${response.status}).`);
      }
      let received = 0;
      // pipeline(), as the other fetchers: a write that fails (a full drive, one unplugged,
      // a folder that has gone) rejects here and becomes the job's error, and the disk's
      // pace holds the socket back. The part file is left for the download manager.
      await pipeline(
        response.body ? Readable.fromWeb(response.body as never) : Readable.from([]),
        async function* count(chunks: AsyncIterable<Buffer>) {
          for await (const chunk of chunks) {
            received += chunk.byteLength;
            if (received > spec.maxBytes) {
              throw new PermanentJobError(
                `The answer from ${host} is larger than ${Math.round(spec.maxBytes / 1048576)} MB. Choose a smaller area or fewer layers.`,
              );
            }
            await throttle(chunk.byteLength);
            progress(received, null);
            yield chunk;
          }
        },
        fs.createWriteStream(partPath, { flags: "w" }),
        { signal },
      );
      progress(received, received);
    } finally {
      turn.notBefore = Date.now() + (busy ? busyGap : gap);
      release();
    }
  };
}
