/**
 * What the service worker does with a request, as plain functions with no worker in
 * them, so the rules can be read and tested on their own. The worker (`sw.ts`) and the
 * page (`features/kept/store.ts`) both import the names here: they must agree on what
 * a cache is called and under which address a kept copy is filed.
 *
 * The rules, in one place:
 *
 * - A page of the app is asked of the server first, every time. Only when the server
 *   does not answer is the kept copy of the app shown. So a phone in reach of the
 *   server always gets the server's current build, never an old one out of a cache.
 * - The app's own files (scripts, styles, fonts) are answered from the copy made when
 *   this build was installed. Their names change with their contents.
 * - `/api/*` and `/kiwix/*` are never stored by the worker and never answered from a
 *   cache, with one exception: things a person chose to keep on this phone. For those
 *   (pictures in a kept page, tiles and lettering of a kept map area) the server is
 *   still asked first, and the kept copy is used only when it does not answer.
 * - The height of a point and an aerial's estimated range (`/api/maps/height`,
 *   `/api/maps/sight-range`) are asked of the server first too. When it does not
 *   answer, the worker works them out from the terrain of kept map areas
 *   (`kept-terrain.ts`), with the server's own sums. Nothing is stored for them.
 * - Everything else is left to the browser, as if there were no worker.
 */

/** The app's own files, one cache per build: `outpost-shell:<build>`. */
export const SHELL_PREFIX = "outpost-shell:";
/** One cache per thing a person chose to keep: `outpost-kept:<kind>:<id>`. */
export const KEPT_PREFIX = "outpost-kept:";
/** The list of what is kept: one small JSON record per thing. */
export const KEPT_INDEX = "outpost-kept-index";
/** A kept map tile is stored still gzipped, and says so in this header; see `modules/maps/index.ts`. */
export const TILE_ENCODING_HEADER = "X-Outpost-Tile-Encoding";
/** The address the shell is filed under in its cache. */
export const SHELL_PAGE = "/index.html";

export const shellCacheName = (build: string) => `${SHELL_PREFIX}${build}`;
export const keptCacheName = (kind: string, id: string) => `${KEPT_PREFIX}${kind}:${id}`;

export type Handling =
  /** A page of the app: the server first, the kept shell if it does not answer. */
  | "page"
  /** One of the app's own files: from the copy installed with this build. */
  | "shell"
  /** Something that may have been kept on purpose: the server first, the kept copy if it does not answer. */
  | "kept"
  /** A height or a range: the server first, worked out from kept terrain if it does not answer. */
  | "worked"
  /** Not the worker's business. */
  | "none";

export interface RequestFacts {
  method: string;
  url: string;
  /** `Request.mode`: "navigate" for a page load. */
  mode: string;
  /** `Request.destination`: "document" for the page itself, "iframe" for a frame inside it. */
  destination: string;
}

/** Addresses under which a kept copy may exist. Nothing else under `/api/` is ever answered from a cache. */
const KEPT_PATHS = ["/api/attachments/", "/api/maps/tiles/", "/api/maps/terrain/", "/map-assets/"];

/** True for a map tile address: where nothing is kept, the worker answers "no tile here" rather than failing. */
/** Questions the worker can answer from kept terrain when the server cannot. */
export const WORKED_PATHS = ["/api/maps/height", "/api/maps/sight-range"];

export function isTilePath(pathname: string): boolean {
  return pathname.startsWith("/api/maps/tiles/") || pathname.startsWith("/api/maps/terrain/");
}

export function handlingOf(request: RequestFacts, origin: string, precached: ReadonlySet<string>): Handling {
  if (request.method !== "GET") return "none";
  let url: URL;
  try {
    url = new URL(request.url);
  } catch {
    return "none";
  }
  if (url.origin !== origin) return "none";
  const path = url.pathname;

  if (KEPT_PATHS.some((prefix) => path.startsWith(prefix))) {
    // A kept copy is a picture in a page or a tile on a map, never a document to open: an uploaded
    // file opened as a page is the server's to answer, with the sandbox the server puts on it.
    if (request.mode === "navigate") return "none";
    // The request that fetches a tile in order to keep it must reach the server itself.
    return url.searchParams.get("raw") === "1" ? "none" : "kept";
  }
  if (WORKED_PATHS.includes(path)) return request.mode === "navigate" ? "none" : "worked";
  if (path.startsWith("/api/") || path.startsWith("/kiwix/")) return "none";
  if (precached.has(path) || path.startsWith("/assets/")) return "shell";
  // The same test the server uses to decide that an address is a page of the app.
  const isPage = request.mode === "navigate" && request.destination === "document" && !/\.[A-Za-z0-9]+$/.test(path);
  return isPage ? "page" : "none";
}

/** The address a kept copy is filed under: the path alone. A tile's `?v=` changes with the installed regions; the kept tile does not. */
export function keptKey(url: string, origin: string): string {
  return new URL(url, origin).pathname;
}

/**
 * How long the worker goes on believing the server is out of reach after a request to
 * it failed or timed out. While it believes so, kept copies are used at once, so a map
 * of two hundred tiles does not wait two hundred times. The page tells the worker as
 * soon as it knows better, in either direction.
 */
export const DOWN_FOR_MS = 20_000;
/** How long a request that has a kept copy behind it may take before the copy is used instead. */
export const NETWORK_TIMEOUT_MS = 4_000;

/** The wait for a page of the app when the server was out of reach a moment ago. A page is still always asked for. */
export const PAGE_TIMEOUT_WHEN_DOWN_MS = 1_500;

/** Messages from a page to the worker. */
export type WorkerMessage =
  /** "I am running this build; if you are the same build and waiting, take over." */
  | { type: "activate"; build: string | null }
  /** What the page has just learnt about the server. */
  | { type: "reach"; reachable: boolean };
