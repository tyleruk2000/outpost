/** Small requests made while estimating: a file's size from its publisher, or a short text such as a checksum. */
import { AppError, classifyNetworkError } from "../../../core/errors.ts";
import type { HttpClient } from "../../../core/http.ts";

/** Outpost's name to sources that ask for one with a way to find the project (Wikimedia, Overpass). */
export { ROUTE_FINDER_USER_AGENT as REFERENCE_USER_AGENT } from "../../maps/route-finder/index.ts";

function unreachable(host: string, error: unknown): AppError {
  if (error instanceof AppError) return error;
  return classifyNetworkError(error) === "offline"
    ? new AppError(
        "offline",
        `Outpost could not reach ${host}. Estimating needs an internet connection; what is installed works without one.`,
      )
    : new AppError("upstream", `${host} did not answer properly. Try again in a little while.`);
}

/** The size the publisher gives for a file, from a HEAD request, following redirects on the same host. */
export async function headSize(
  client: HttpClient,
  url: string,
  signal?: AbortSignal,
): Promise<{ bytes: number | null; finalUrl: string; lastModified: string | null }> {
  const host = new URL(url).hostname;
  try {
    const { response, url: finalUrl } = await client.fetch(url, { method: "HEAD", allowedHosts: [host], everyHop: true, signal });
    await response.body?.cancel().catch(() => undefined);
    if (!response.ok) throw new AppError("upstream", `${host} answered HTTP ${response.status} for ${new URL(url).pathname}.`);
    const length = Number(response.headers.get("content-length"));
    return { bytes: Number.isFinite(length) && length > 0 ? length : null, finalUrl, lastModified: response.headers.get("last-modified") };
  } catch (error) {
    throw unreachable(host, error);
  }
}

/** A short text from a publisher (at most `max` bytes), such as an MD5 file or an index. */
export async function fetchText(
  client: HttpClient,
  url: string,
  options: { max: number; signal?: AbortSignal; headers?: Record<string, string> },
): Promise<string> {
  const host = new URL(url).hostname;
  try {
    const { response } = await client.fetch(url, {
      allowedHosts: [host],
      everyHop: true,
      signal: options.signal,
      headers: options.headers,
    });
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw new AppError("upstream", `${host} answered HTTP ${response.status} for ${new URL(url).pathname}.`);
    }
    const chunks: Uint8Array[] = [];
    let size = 0;
    for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
      size += chunk.byteLength;
      if (size > options.max) throw new AppError("too_large", `${host} sent more than was expected for ${new URL(url).pathname}.`);
      chunks.push(chunk);
    }
    return Buffer.concat(chunks).toString("utf8");
  } catch (error) {
    throw unreachable(host, error);
  }
}
