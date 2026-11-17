/**
 * Where OS Open Names comes from: Ordnance Survey's Downloads API.
 *
 * Read on 17 November 2026 (docs/sources.md has the quotes): OS OpenData is under the
 * Open Government Licence v3.0, and "To use the OS OpenData parts of this API, you do
 * not require an API Key." So no account and no key are asked for. Two questions are
 * asked of api.os.uk, only when a person presses "Check the size": the product's
 * details (its edition, "2026-10") and its list of downloads (each file's size and MD5).
 * The download itself is `.../downloads?area=GB&format=CSV&redirect`, which api.os.uk
 * answers with a redirect to a signed address on OS's own file store
 * (omseprd1stdstordownload.blob.core.windows.net) that lasts an hour; a resumed download
 * asks api.os.uk again and gets a fresh one.
 *
 * In tests a local server stands in (`OUTPOST_OS_DOWNLOADS_URL`).
 */
import { z } from "zod";
import { AppError, classifyNetworkError } from "../../../core/errors.ts";
import type { HttpClient } from "../../../core/http.ts";
import { hostOf } from "../source.ts";

export const OS_DOWNLOADS_API = "https://api.os.uk/downloads/v1/";
/** The file store api.os.uk redirects downloads to, as seen on 17 November 2026. */
export const OS_FILE_HOST = "omseprd1stdstordownload.blob.core.windows.net";
const PRODUCT = "OpenNames";
/** The most one answer from the API may be. */
const MAX_ANSWER_BYTES = 1024 * 1024;

const productSchema = z.object({ id: z.string(), version: z.string().regex(/^\d{4}-\d{2}$/) }).passthrough();
const downloadsSchema = z.array(
  z
    .object({
      url: z.string().url(),
      fileName: z.string(),
      format: z.string(),
      area: z.string(),
      size: z.number().int().positive(),
      md5: z.string().regex(/^[0-9a-f]{32}$/i),
    })
    .passthrough(),
);

export interface OsNamesOffer {
  edition: string;
  url: string;
  fileName: string;
  sizeBytes: number;
  md5: string;
  /** Hosts the download may start at: the API, which redirects to OS's file store. */
  hosts: string[];
}

/** The API's address: api.os.uk, or a stand-in in tests. Always ends in a slash. */
export function apiBase(override?: string): string {
  const base = override ?? OS_DOWNLOADS_API;
  return base.endsWith("/") ? base : `${base}/`;
}

async function getJson(client: HttpClient, url: string, signal?: AbortSignal): Promise<unknown> {
  try {
    const { response } = await client.fetch(url, {
      signal,
      allowedHosts: [hostOf(url)],
      // What OS says about its own files is trusted only from OS.
      everyHop: true,
      headers: { accept: "application/json" },
    });
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw new AppError(
        "upstream",
        `Ordnance Survey's download service answered with an error (HTTP ${response.status}). Try again later.`,
      );
    }
    // Counted as it arrives: the product's details and its list of downloads are a few kilobytes.
    const chunks: Uint8Array[] = [];
    let size = 0;
    for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
      size += chunk.byteLength;
      if (size > MAX_ANSWER_BYTES) {
        await response.body?.cancel().catch(() => undefined);
        throw new AppError("upstream", "Ordnance Survey's download service sent far more than its list of downloads should be.");
      }
      chunks.push(chunk);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (classifyNetworkError(error) === "offline") {
      throw new AppError("offline", "Outpost could not reach Ordnance Survey. Checking for place names needs an internet connection.");
    }
    throw new AppError("upstream", "Ordnance Survey's download service could not be read. Try again later.");
  }
}

/** Asks OS which edition of OS Open Names it offers now, and the size and checksum of the CSV file for all of Great Britain. */
export async function fetchOffer(client: HttpClient, options: { base?: string; signal?: AbortSignal } = {}): Promise<OsNamesOffer> {
  const base = apiBase(options.base);
  const product = productSchema.safeParse(await getJson(client, new URL(`products/${PRODUCT}`, base).toString(), options.signal));
  const list = downloadsSchema.safeParse(await getJson(client, new URL(`products/${PRODUCT}/downloads`, base).toString(), options.signal));
  if (!product.success || !list.success) {
    throw new AppError(
      "upstream",
      "Ordnance Survey's list of downloads was not in the form Outpost expects. Try again later, or report it.",
    );
  }
  const csv = list.data.find((entry) => entry.format === "CSV" && entry.area === "GB");
  if (!csv) throw new AppError("upstream", "Ordnance Survey no longer lists OS Open Names as one CSV file for Great Britain.");
  const url = new URL(csv.url);
  // The download must come from the API Outpost asked; a list that pointed elsewhere is not followed.
  if (url.host !== new URL(base).host) {
    throw new AppError("upstream", "Ordnance Survey's list pointed the download at another address, so it was not used.");
  }
  return {
    edition: product.data.version,
    url: url.toString(),
    fileName: csv.fileName,
    sizeBytes: csv.size,
    md5: csv.md5.toLowerCase(),
    hosts: [url.hostname, OS_FILE_HOST],
  };
}
