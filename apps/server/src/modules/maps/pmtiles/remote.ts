/**
 * A remote PMTiles archive read over HTTP range requests.
 *
 * Extraction only works against servers that honour `Range`: one that answers with the
 * whole file instead would mean downloading a planet. So anything other than a 206 is
 * refused, loudly. The ETag of every answer is compared with the first one seen, so a
 * source that is replaced part-way through is noticed rather than mixed into the output.
 */
import { AppError } from "../../../core/errors.ts";
import type { HttpClient } from "../../../core/http.ts";
import type { RangeReader } from "./plan.ts";

/** The archive behind the address is not the one this extract started from. */
export class SourceChangedError extends Error {
  constructor(message = "The map source changed while it was being read.") {
    super(message);
    this.name = "SourceChangedError";
  }
}

/** The address no longer has an archive at all (daily builds are kept for about a week). */
export class SourceGoneError extends Error {
  constructor(message = "The map source is no longer available at that address.") {
    super(message);
    this.name = "SourceGoneError";
  }
}

export interface RemoteArchive {
  url: string;
  read: RangeReader;
  /** ETag of the archive as last reported by its server; null if it sends none. */
  etag(): string | null;
}

export interface RemoteArchiveOptions {
  /** Hosts the request may go to first; redirects may then lead to any public host. */
  allowedHosts?: string[];
  /** ETag the archive is expected to have; any other is a `SourceChangedError`. */
  expectedEtag?: string | null;
}

export function createRemoteArchive(client: HttpClient, url: string, options: RemoteArchiveOptions = {}): RemoteArchive {
  let etag: string | null = options.expectedEtag ?? null;
  let pinned = options.expectedEtag != null;

  const read: RangeReader = async (offset, length, signal) => {
    const { response } = await client.fetch(url, {
      // Asking for the bytes as they are: a compressed answer could not be addressed by range.
      headers: { range: `bytes=${offset}-${offset + length - 1}`, "accept-encoding": "identity" },
      signal,
      allowedHosts: options.allowedHosts,
    });
    if (response.status !== 206) {
      await response.body?.cancel().catch(() => undefined);
      if (response.status === 200) {
        throw new AppError(
          "unsupported",
          "This map source does not support partial downloads (HTTP range requests), so a region cannot be cut out of it. Use a different source, or download the whole file and import it.",
        );
      }
      if (response.status === 404 || response.status === 410) throw new SourceGoneError();
      if (response.status === 412 || response.status === 416) throw new SourceChangedError();
      if (response.status === 401 || response.status === 403) {
        throw new AppError("forbidden", `The map source refused the request (HTTP ${response.status}).`);
      }
      // 429 and 5xx are worth another try; the download manager decides when.
      throw new Error(`The map source answered with HTTP ${response.status}.`);
    }

    const seen = response.headers.get("etag");
    if (seen) {
      if (pinned && etag !== seen) {
        await response.body?.cancel().catch(() => undefined);
        throw new SourceChangedError();
      }
      etag = seen;
      pinned = true;
    }
    const start = /^bytes (\d+)-/i.exec(response.headers.get("content-range") ?? "");
    if (start && Number(start[1]) !== offset) {
      await response.body?.cancel().catch(() => undefined);
      throw new Error("The map source answered with a different byte range than was asked for.");
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length > length) throw new Error("The map source sent more data than was asked for.");
    return bytes;
  };

  return { url, read, etag: () => etag };
}
