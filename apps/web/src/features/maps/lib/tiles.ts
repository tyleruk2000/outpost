/**
 * How map tiles are fetched.
 *
 * Outpost answers 204 for a tile no installed region holds. MapLibre draws such a tile
 * as empty and stops there, which would leave a hole wherever only a coarser region
 * (say, the world overview) covers the view. For a source marked `sparse`, a tile
 * reported as "not found" is instead cut from the nearest ancestor that exists, so the
 * map stays continuous between regions of different detail. Tiles therefore go through
 * a small protocol of our own that turns 204 into that signal. Every request stays on
 * Outpost's own origin.
 */
export const TILE_PROTOCOL = "outpost-tiles";

/**
 * A MapLibre tile address for a server template such as "/api/maps/tiles/{z}/{x}/{y}.mvt".
 * `cacheKey` changes whenever the installed regions do: browsers keep tiles (and empty
 * answers) for an hour, and a newly downloaded region has to show up at once.
 */
export function tileTemplate(template: string, cacheKey: string): string {
  const path = template.startsWith("/") ? template : `/${template}`;
  return `${TILE_PROTOCOL}://local${path}${cacheKey ? `?v=${encodeURIComponent(cacheKey)}` : ""}`;
}

/** The same-origin path behind a protocol address, or null if it is not one of ours. */
export function tilePath(url: string): string | null {
  const prefix = `${TILE_PROTOCOL}://local/`;
  if (!url.startsWith(prefix)) return null;
  const path = url.slice(prefix.length - 1);
  // Only the maps API is reachable through this protocol, whatever a style might say.
  return path.startsWith("/api/maps/") ? path : null;
}

export interface TileResponse {
  data: ArrayBuffer;
  cacheControl?: string | null;
  expires?: string | null;
}

/**
 * The loader behind the protocol. `missing` builds the error MapLibre understands as
 * "this tile does not exist" (its AJAXError with status 404); it is passed in so this
 * module can be tested without MapLibre.
 */
export function createTileLoader(fetchTile: typeof fetch, missing: (url: string) => Error) {
  return async (request: { url: string }, abort: AbortController): Promise<TileResponse> => {
    const path = tilePath(request.url);
    if (!path) throw new Error("That is not a map tile address.");
    const response = await fetchTile(path, { signal: abort.signal, credentials: "same-origin" });
    if (response.status === 204 || response.status === 404) throw missing(request.url);
    if (!response.ok) throw new Error(`The map tile could not be loaded (${response.status}).`);
    return {
      data: await response.arrayBuffer(),
      cacheControl: response.headers.get("Cache-Control"),
      expires: response.headers.get("Expires"),
    };
  };
}

/** A short key that changes when the set of installed regions changes. */
export function regionsCacheKey(regions: Array<{ id: string; installedAt: number; available: boolean; status: string }>): string {
  let hash = 2166136261;
  const text = regions
    .filter((region) => region.available && region.status === "installed")
    .map((region) => `${region.id}:${region.installedAt}`)
    .sort()
    .join("|");
  for (let index = 0; index < text.length; index += 1) hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
  return (hash >>> 0).toString(36);
}
