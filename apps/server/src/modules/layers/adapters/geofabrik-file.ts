/**
 * Which file a Geofabrik extract is fetched as: the dated file its `-latest` address leads
 * to, with that file's own MD5.
 *
 * Geofabrik's `-latest` address answers with a redirect to the newest dated file
 * (`united-kingdom-261122.osm.pbf`). On 23 November 2026 that redirect led to a dated file
 * that answered 404 while the day before's was there: the redirect had been updated before
 * the file was published. Then the newest dated file the region's own page lists (read
 * the same day at https://download.geofabrik.de/europe/united-kingdom/, which links each
 * dated file and its `.md5` by a relative address) is used instead, checked against its
 * own MD5, and the download says which file it was.
 */
import { AppError } from "../../../core/errors.ts";
import type { HttpClient } from "../../../core/http.ts";
import { fetchText, headSize } from "./http.ts";

export interface GeofabrikFile {
  /** The dated address that will be downloaded. */
  url: string;
  /** Its file name ("united-kingdom-261121.osm.pbf"). */
  fileName: string;
  bytes: number | null;
  md5: string;
  /** The day in the dated name, as "2026-11-21", or null for a name without one. */
  nameDate: string | null;
  /** Said when the newest file was not there and an older one is used: for the download's history. */
  fallback: string | null;
}

const DATED = /-(\d{6})\.osm\.pbf$/;
/** The region's page is about 20 kB; this leaves it room. */
const MAX_LISTING_BYTES = 2 * 1048576;

export const fileNameOf = (url: string) => decodeURIComponent(new URL(url).pathname.split("/").at(-1) ?? "");

/** "261121" → "2026-11-21". */
export function dateOfName(name: string): string | null {
  const match = DATED.exec(name);
  if (!match) return null;
  const [yy, mm, dd] = [match[1]!.slice(0, 2), match[1]!.slice(2, 4), match[1]!.slice(4, 6)];
  return `20${yy}-${mm}-${dd}`;
}

/** The dated files a listing links to for one extract (`united-kingdom`), newest first, as absolute addresses on the same host. */
export function datedFilesIn(html: string, listingUrl: string, extract: string): string[] {
  const base = new URL(listingUrl);
  const found = new Map<string, string>();
  const escaped = extract.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`href\\s*=\\s*["']([^"']*?(?:^|/)?${escaped}-(\\d{6})\\.osm\\.pbf)["']`, "gi");
  for (const match of html.matchAll(pattern)) {
    let url: URL;
    try {
      url = new URL(match[1]!, base);
    } catch {
      continue;
    }
    if (url.host !== base.host || url.protocol !== base.protocol) continue;
    if (fileNameOf(url.toString()) !== `${extract}-${match[2]}.osm.pbf`) continue;
    found.set(match[2]!, url.toString());
  }
  return [...found.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([, url]) => url);
}

async function md5Of(client: HttpClient, url: string, signal?: AbortSignal): Promise<string | null> {
  const text = await fetchText(client, `${url}.md5`, { max: 4096, signal });
  return /^([0-9a-f]{32})\b/i.exec(text.trim())?.[1]?.toLowerCase() ?? null;
}

const notThere = (error: unknown) => error instanceof AppError && /answered HTTP 404/.test(error.message);

/**
 * The file to download for an extract's `-latest` address, and its MD5. Asks Geofabrik
 * (a HEAD, the MD5, and the region's page only when the newest file is not there): call it
 * only on a person's press.
 */
export async function resolveGeofabrikFile(
  client: HttpClient,
  latestUrl: string,
  name: string,
  signal?: AbortSignal,
): Promise<GeofabrikFile> {
  const host = new URL(latestUrl).hostname;
  let redirected: string | null = null;
  try {
    const head = await headSize(client, latestUrl, signal);
    const md5 = await md5Of(client, head.finalUrl, signal);
    if (!md5)
      throw new AppError("upstream", `Geofabrik did not give an MD5 for ${name}'s file, so it was not downloaded. Try again later.`);
    const fileName = fileNameOf(head.finalUrl);
    return { url: head.finalUrl, fileName, bytes: head.bytes, md5, nameDate: dateOfName(fileName), fallback: null };
  } catch (error) {
    if (!notThere(error)) throw error;
    redirected = await whereItLeads(client, latestUrl, signal);
    if (!redirected || !DATED.test(redirected)) throw error;
  }

  const missing = fileNameOf(redirected);
  const extract = missing.replace(DATED, "");
  const missingDate = DATED.exec(missing)![1]!;
  // The folder the dated file is in, then the region's own page (the `-latest` address without its ending).
  const listings = [...new Set([new URL(".", redirected).toString(), `${latestUrl.replace(/-latest\.osm\.pbf$/, "")}/`])];
  for (const listing of listings) {
    let html: string;
    try {
      html = await fetchText(client, listing, { max: MAX_LISTING_BYTES, signal });
    } catch (error) {
      if (notThere(error)) continue;
      throw error;
    }
    const older = datedFilesIn(html, listing, extract).filter((url) => DATED.exec(fileNameOf(url))![1]! < missingDate);
    for (const url of older.slice(0, 3)) {
      try {
        const head = await headSize(client, url, signal);
        const md5 = await md5Of(client, head.finalUrl, signal);
        if (!md5) continue;
        const fileName = fileNameOf(head.finalUrl);
        return {
          url: head.finalUrl,
          fileName,
          bytes: head.bytes,
          md5,
          nameDate: dateOfName(fileName),
          fallback: `Geofabrik's newest file for ${name}, ${missing}, was not there yet (HTTP 404), so ${fileName}, the newest its page lists, was downloaded instead, checked against its own MD5.`,
        };
      } catch (error) {
        if (!notThere(error)) throw error;
      }
    }
  }
  throw new AppError(
    "upstream",
    `${host} sends ${name}'s newest file as ${missing}, which is not there yet, and lists no earlier file that is. Try again later.`,
  );
}

/** Where an address's redirects end, on the same host, when what is there answers 404; null otherwise. */
async function whereItLeads(client: HttpClient, url: string, signal?: AbortSignal): Promise<string | null> {
  const host = new URL(url).hostname;
  const { response, url: finalUrl } = await client.fetch(url, {
    method: "HEAD",
    allowedHosts: [host],
    everyHop: true,
    signal,
    headers: { "accept-encoding": "identity" },
  });
  await response.body?.cancel().catch(() => undefined);
  return response.status === 404 && finalUrl !== url ? finalUrl : null;
}
