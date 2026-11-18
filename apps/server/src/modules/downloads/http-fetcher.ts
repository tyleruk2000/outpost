/**
 * The built-in fetcher: one file over HTTP, resumable.
 *
 * Whatever is already in the partial file is kept and the server is asked for the rest
 * with a Range request. Servers answer that in three ways and each is handled:
 *
 *   206  here is the rest            → append
 *   200  here is the whole file      → the server ignored the range, or the file has
 *                                      changed since last time: start again from byte 0
 *   416  that range does not exist   → the partial file is already complete, or it
 *                                      belongs to a different file: finish or start again
 *
 * Mirror networks (Kiwix's download host redirects to one of many mirrors) may hand the
 * rest of a file from a different server than the first part came from. ETags and dates
 * differ between mirrors, so they are only used when the same host answers each time;
 * across mirrors the checksum, verified after the download, is what decides.
 */
import fs from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { HttpClient } from "../../core/http.ts";
import { PermanentJobError } from "../../core/jobs.ts";
import { syncedWriteStream } from "../../core/synced-write.ts";
import type { FetchContext, Fetcher } from "./types.ts";

/** How often a stale partial file may be thrown away before giving up on this attempt. */
const MAX_RESTARTS = 2;

type Outcome = "done" | "restart";

async function sizeOf(file: string): Promise<number> {
  try {
    return (await fs.promises.stat(file)).size;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return 0;
    throw error;
  }
}

// Parses "bytes 100-199/1000" and the 416 form "bytes */1000". The total may be "*" when unknown.
export function parseContentRange(value: string | null): { start: number | null; total: number | null } | undefined {
  const match = /^bytes\s+(?:(\d+)-\d+|\*)\/(\d+|\*)$/i.exec(value?.trim() ?? "");
  if (!match) return undefined;
  return {
    start: match[1] === undefined ? null : Number(match[1]),
    total: match[2] === "*" ? null : Number(match[2]),
  };
}

function contentLength(headers: { get(name: string): string | null }): number | null {
  const value = headers.get("content-length");
  return value !== null && /^\d+$/.test(value) ? Number(value) : null;
}

/** A validator usable in If-Range: a strong ETag, or failing that the modification date. */
function validatorOf(etag: string | null, lastModified: string | null): string | undefined {
  if (etag && !etag.startsWith("W/")) return etag;
  return lastModified ?? undefined;
}

/** How much is let through per request to the speed limiter. */
const THROTTLE_SLICE_BYTES = 16 * 1024;

function sameHost(a: string, b: string): boolean {
  return new URL(a).host.toLowerCase() === new URL(b).host.toLowerCase();
}

async function attempt(client: HttpClient, context: FetchContext, stated: number | null): Promise<Outcome> {
  const { download, partPath, signal } = context;
  const have = await sizeOf(partPath);
  context.progress(have, download.totalBytes);

  // Sizes and ranges are about the stored bytes, so ask for them as they are.
  // "Connection: close": one file per connection. A download held to a speed limit is
  // read more slowly than the server sends, so the server finishes, waits out its idle
  // timeout and hangs up while the tail of the file is still buffered here. On a
  // kept-alive connection the HTTP client reports that as an error and drops what was
  // buffered; on one both sides know will close, it reads the buffer to the end.
  const headers: Record<string, string> = { "accept-encoding": "identity", connection: "close" };
  if (have > 0) {
    headers.range = `bytes=${have}-`;
    // If the file changed since the first part was fetched, If-Range makes the server
    // send the whole new file (200) instead of a tail that would not fit.
    const validator = validatorOf(download.etag, download.lastModified);
    if (validator) headers["if-range"] = validator;
  }

  const { response, url } = await client.fetch(download.url, { headers, signal, allowedHosts: context.allowedHosts });
  const status = response.status;

  if (status === 416) {
    await response.body?.cancel();
    const total = parseContentRange(response.headers.get("content-range"))?.total ?? download.totalBytes;
    if (have > 0 && total !== null && total === have) {
      // Everything was already here; an earlier attempt stopped just before verifying.
      context.progress(have, total);
      return "done";
    }
    if (have === 0) throw new Error("The server would not send this file (HTTP 416). Outpost will try again.");
    await fs.promises.rm(partPath, { force: true });
    return "restart";
  }
  if (status === 404 || status === 410) {
    await response.body?.cancel();
    throw new PermanentJobError("The file is no longer at this address. Refresh the catalogue and try again.", "not_found");
  }
  if (status === 408 || status === 425 || status === 429 || status >= 500) {
    await response.body?.cancel();
    throw new Error(`The server is busy or having trouble (HTTP ${status}). Outpost will try again.`);
  }
  if (status !== 200 && status !== 206) {
    await response.body?.cancel();
    throw new PermanentJobError(`The server refused this download (HTTP ${status}).`, "upstream");
  }

  let append = false;
  let total: number | null;
  if (status === 206) {
    const range = parseContentRange(response.headers.get("content-range"));
    if (have === 0 || range?.start !== have) {
      // A tail that does not start where the partial file ends cannot be used.
      await response.body?.cancel();
      await fs.promises.rm(partPath, { force: true });
      return "restart";
    }
    append = true;
    const rest = contentLength(response.headers);
    total = range.total ?? (rest === null ? null : have + rest);
  } else {
    total = contentLength(response.headers);
  }

  const viaMirror = !sameHost(download.url, url);
  context.remember({
    etag: viaMirror ? null : response.headers.get("etag"),
    lastModified: viaMirror ? null : response.headers.get("last-modified"),
    // Shown on the download's details: which server actually sent the bytes.
    meta: { servedBy: new URL(url).hostname, resumedAt: append ? have : 0 },
  });

  let received = append ? have : 0;
  // What is written from here on is recorded as it arrives, to be held against what the storage gives back.
  context.written.cutTo(received);
  // What the server says is exact. What the download stated (a catalogue's size) may be a little out, so it is given room.
  const limit = total ?? (stated === null ? null : Math.ceil(stated * 1.1) + 1024 * 1024);
  context.progress(received, total);
  if (response.body) {
    // pipeline() applies backpressure: the socket is only read as fast as the disk writes.
    await pipeline(
      Readable.fromWeb(response.body as never),
      async function* count(chunks: AsyncIterable<Buffer>) {
        for await (const chunk of chunks) {
          // A fast link hands over 100 kB and more at a time. The speed limit is asked
          // for in small slices, so a low limit is a steady trickle and not a burst every
          // few seconds, and a small file cannot slip through whole.
          for (let offset = 0; offset < chunk.length; offset += THROTTLE_SLICE_BYTES) {
            const slice = chunk.subarray(offset, offset + THROTTLE_SLICE_BYTES);
            // Stopped as soon as more arrives than the server said, or, when it said nothing, than the download stated.
            if (limit !== null && received + slice.length > limit) {
              throw new Error("More data arrived than the server said the file contains. Outpost will start this download again.");
            }
            // Holding the slice here slows the socket itself: backpressure reaches the server.
            await context.throttle(slice.length);
            context.written.append(received, slice);
            received += slice.length;
            context.progress(received, total);
            yield slice;
          }
        }
      },
      syncedWriteStream(partPath, { flags: append ? "a" : "w" }),
      { signal },
    );
  } else if (!append) {
    await fs.promises.writeFile(partPath, "");
  }

  const onDisk = await sizeOf(partPath);
  if (total !== null && onDisk > total) {
    await fs.promises.rm(partPath, { force: true });
    throw new Error("More data arrived than the server said the file contains. Outpost will start this download again.");
  }
  if (total !== null && onDisk < total) {
    throw new Error("The connection closed before the file was complete. Outpost will continue from where it stopped.");
  }
  context.progress(onDisk, total ?? onDisk);
  return "done";
}

export function createHttpFetcher(client: HttpClient): Fetcher {
  return async function httpFetcher(context) {
    if (!context.allowedHosts?.length) {
      throw new PermanentJobError("This download does not say which hosts it may use, so it was not started.", "forbidden");
    }
    // The size the download stated before any server answered; later answers replace it in the row.
    const stated = context.download.totalBytes;
    for (let restarts = 0; ; restarts += 1) {
      if ((await attempt(client, context, stated)) === "done") return;
      if (restarts >= MAX_RESTARTS) {
        throw new Error("The server kept rejecting the request to continue this download. Outpost will try again.");
      }
    }
  };
}
