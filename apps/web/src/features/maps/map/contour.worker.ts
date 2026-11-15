/**
 * The worker that draws contour lines. For each tile the map asks for, it reads the
 * installed terrain tiles around it from Outpost's own server, traces lines of equal
 * height (maplibre-contour's marching squares), and answers with a vector tile.
 *
 * It runs here rather than on the page so that tracing never makes the map stutter.
 * It is built and served with the rest of the app: nothing is loaded from elsewhere,
 * and the only requests it makes are for terrain tiles on this origin.
 */
import mlcontour from "maplibre-contour";
import {
  CONTOUR_ELEVATION_KEY,
  CONTOUR_LEVEL_KEY,
  CONTOUR_SOURCE_LAYER,
  type ContourRequest,
  contourInterval,
  parseContourRequest,
} from "../lib/contours";

export type ContourWorkerRequest = { type: "tile"; id: number; url: string } | { type: "cancel"; id: number };
export type ContourWorkerResponse = { id: number; data: ArrayBuffer } | { id: number; error: string };

type Manager = InstanceType<typeof mlcontour.LocalDemManager>;
type DemTile = Awaited<ReturnType<Manager["fetchAndParseTile"]>>;

/** Decoded terrain tiles kept (about 1 MB each at 512 px), and as many finished contour tiles. */
const CACHE_SIZE = 32;
const TIMEOUT_MS = 15_000;

/** Stands in for a terrain tile that is not installed. */
const NOTHING_HERE: DemTile = { width: 0, height: 0, data: new Float32Array(0) };

/**
 * maplibre-contour's tile manager, taught that terrain has edges. Outpost answers 204
 * for a tile no installed region holds; as it comes, the library would fail the whole
 * contour tile because one of its neighbours was missing. Here a missing tile is simply
 * no heights: lines stop at the edge of what is installed.
 */
class InstalledTerrain extends mlcontour.LocalDemManager {
  override async fetchDem(...args: Parameters<Manager["fetchDem"]>): ReturnType<Manager["fetchDem"]> {
    const tile = await super.fetchDem(...args);
    // The library reads "undefined" as "no tile on this side", and draws nothing for a tile with no middle.
    return (tile.width > 0 ? tile : undefined) as typeof tile;
  }
}

function createManager(source: ContourRequest): Manager {
  const manager = new InstalledTerrain({
    demUrlPattern: `${self.location.origin}${source.dem}`,
    cacheSize: CACHE_SIZE,
    encoding: source.encoding,
    maxzoom: source.maxZoom,
    timeoutMs: TIMEOUT_MS,
    getTile: async (url, abort) => {
      const response = await fetch(url, { signal: abort.signal, credentials: "same-origin" });
      if (response.status === 204 || response.status === 404) return { data: new Blob([]) };
      if (!response.ok) throw new Error(`A terrain tile could not be read (${response.status}).`);
      return {
        data: await response.blob(),
        expires: response.headers.get("Expires") ?? undefined,
        cacheControl: response.headers.get("Cache-Control") ?? undefined,
      };
    },
  });
  const decode = manager.decodeImage;
  manager.decodeImage = (blob, encoding, abort) => (blob.size === 0 ? Promise.resolve(NOTHING_HERE) : decode(blob, encoding, abort));
  return manager;
}

/** One manager, for the terrain the style currently names. A new address (regions changed) starts afresh. */
let current: { key: string; manager: Manager } | undefined;

function managerFor(source: ContourRequest): Manager {
  const key = `${source.dem}|${source.encoding}|${source.maxZoom}`;
  if (current?.key !== key) current = { key, manager: createManager(source) };
  return current.manager;
}

const inFlight = new Map<number, AbortController>();

async function contourTile(url: string, abort: AbortController): Promise<ArrayBuffer> {
  const request = parseContourRequest(url);
  if (!request) throw new Error("That is not a contour tile address.");
  const spacing = contourInterval(request.z);
  if (!spacing) return new ArrayBuffer(0);
  const tile = await managerFor(request).fetchContourTile(
    request.z,
    request.x,
    request.y,
    {
      levels: [spacing.interval, spacing.index],
      contourLayer: CONTOUR_SOURCE_LAYER,
      elevationKey: CONTOUR_ELEVATION_KEY,
      levelKey: CONTOUR_LEVEL_KEY,
      // Terrain tiles are 512 px, as wide as the map tile they cover. Reading the zoom above halves the
      // work and the tiles fetched, and a line traced every two pixels is smoother than one traced every pixel.
      overzoom: 1,
    },
    abort,
  );
  return tile.arrayBuffer;
}

self.onmessage = (event: MessageEvent<ContourWorkerRequest>) => {
  const message = event.data;
  if (message.type === "cancel") {
    inFlight.get(message.id)?.abort();
    inFlight.delete(message.id);
    return;
  }
  const abort = new AbortController();
  inFlight.set(message.id, abort);
  contourTile(message.url, abort)
    .then(
      (data): ContourWorkerResponse => ({ id: message.id, data }),
      (error: unknown): ContourWorkerResponse => ({
        id: message.id,
        error: error instanceof Error ? error.message : "Contour lines could not be drawn.",
      }),
    )
    .then((response) => {
      inFlight.delete(message.id);
      // An answer nobody is waiting for any more is not sent.
      if (abort.signal.aborted) return;
      if ("data" in response) self.postMessage(response, { transfer: [response.data] });
      else self.postMessage(response);
    });
};
