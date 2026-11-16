/**
 * Fetching a kept map area, and fetching it again, against a stand-in server that can
 * stop answering part of the way through. The cache is the stand-in from fake-caches.
 */
import type { MapAreaSize, MapSources } from "@outpost/shared";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { areaPositions, continueArea, dismissAreaWork, startArea, stopArea } from "./area";
import { type FakeCacheStorage, installFakeCaches } from "./fake-caches";
import { forgetKeptSnapshot, getKept } from "./store";

const bbox: [number, number, number, number] = [-3.4, 54.3, -2.8, 54.7];
const size: MapAreaSize = {
  bbox,
  map: { tiles: 15, bytes: 15_000, minZoom: 0, maxZoom: 9 },
  terrain: null,
  totalTiles: 15,
  totalBytes: 15_000,
};
const sourcesOf = (attribution: string): MapSources =>
  ({
    hasTiles: true,
    hasTerrain: false,
    sources: { basemap: { type: "vector", tiles: [], minzoom: 0, maxzoom: 15, bounds: [-180, -85, 180, 85], attribution } },
    sprites: { light: "/map-assets/sprites/light" },
  }) as unknown as MapSources;

/** A map server: every tile says which edition of the map it was cut from. */
function mapServer() {
  const state = {
    edition: 1,
    /** After this many tiles of the current edition the server stops answering. */
    answersLeft: Number.POSITIVE_INFINITY,
    /** Positions the map has nothing at. */
    empty: new Set<string>(),
    /** Called as each tile is asked for. */
    onTile: undefined as ((path: string) => void) | undefined,
    tilesAsked: 0,
  };
  const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, window.location.origin)
        .pathname;
      if (init?.signal?.aborted) throw new DOMException("Stopped", "AbortError");
      if (path === "/api/maps/sources") return json(sourcesOf(`edition ${state.edition}`));
      if (path === "/api/maps/overview") {
        return json({ regions: [{ id: "north", installedAt: state.edition, available: true, status: "installed" }] });
      }
      if (path.startsWith("/api/maps/tiles/")) {
        state.tilesAsked += 1;
        state.onTile?.(path);
        if (state.answersLeft <= 0) throw new TypeError("Failed to fetch");
        state.answersLeft -= 1;
        if (state.empty.has(path)) return new Response(null, { status: 204 });
        return new Response(`edition ${state.edition} of ${path}`, { headers: { "Content-Type": "application/x-protobuf" } });
      }
      if (path.startsWith("/map-assets/")) return new Response(`edition ${state.edition}`, { headers: { "Content-Type": "text/plain" } });
      return new Response("", { status: 404 });
    }),
  );
  return state;
}

let storage: FakeCacheStorage;
let restore: () => void;
let server: ReturnType<typeof mapServer>;
let finished: ReturnType<typeof vi.spyOn>;
let failed: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  ({ storage, restore } = installFakeCaches());
  forgetKeptSnapshot();
  server = mapServer();
  finished = vi.spyOn(toast, "success").mockImplementation(() => "");
  failed = vi.spyOn(toast, "error").mockImplementation(() => "");
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  restore();
});

const tilePaths = areaPositions({ bbox, maxZoom: 9, terrainMaxZoom: null, sources: sourcesOf("") }).map((position) => position.path);

/** What each kept tile says it is: the edition of the map it was cut from. */
async function editions(id: string): Promise<Map<string, number>> {
  const cache = await storage.open(`outpost-kept:area:${id}`);
  const found = new Map<string, number>();
  for (const path of tilePaths) {
    const copy = await cache.match(path);
    if (copy) found.set(path, Number(/^edition (\d+)/.exec(await copy.text())?.[1]));
  }
  return found;
}

async function bytesKept(id: string): Promise<number> {
  const cache = await storage.open(`outpost-kept:area:${id}`);
  let bytes = 0;
  for (const request of await cache.keys()) bytes += (await (await cache.match(request))!.arrayBuffer()).byteLength;
  return bytes;
}

/** Keeps the box whole from the first edition of the map, then the server's maps change. */
async function keptThenChanged(): Promise<string> {
  const area = await startArea({ title: "The fells", bbox, size });
  await vi.waitFor(() => expect(finished).toHaveBeenCalledTimes(1));
  expect([...(await editions(area.id)).values()]).toEqual(Array(15).fill(1));
  const record = await getKept("area", area.id);
  expect(record).toMatchObject({ complete: true, tiles: 15, positions: 15 });
  // Counted as stored, though six tiles are stored at a time.
  expect(record?.bytes).toBe(await bytesKept(area.id));
  server.edition = 2;
  server.tilesAsked = 0;
  return area.id;
}

describe("fetching a kept map area again", () => {
  it("keeps the whole earlier copy when the server stops answering part of the way, and says the copy is mixed", async () => {
    const id = await keptThenChanged();
    const before = await getKept("area", id);
    // Out of range after four tiles.
    server.answersLeft = 4;
    await continueArea(id, true);
    await vi.waitFor(() => expect(failed).toHaveBeenCalledTimes(1));

    const kept = await editions(id);
    // Every tile of the area is still there to draw: four new, the rest as they were.
    expect([...kept.keys()].sort()).toEqual([...tilePaths].sort());
    expect([...kept.values()].filter((edition) => edition === 2)).toHaveLength(4);
    expect([...kept.values()].filter((edition) => edition === 1)).toHaveLength(11);
    // The lettering and icons the earlier copy drew with are still there too.
    expect(storage.paths(`outpost-kept:area:${id}`).filter((path) => path.startsWith("/map-assets/")).length).toBeGreaterThan(0);

    const after = await getKept("area", id);
    // Still a whole area, drawn the way the earlier copy was, and still offered to be fetched again.
    expect(after).toMatchObject({ complete: true, stale: true, mixed: true, tiles: 15, positions: 15 });
    expect(after?.sources).toEqual(before?.sources);
    expect(after?.refreshedAt).toBe(before?.refreshedAt);
    expect(String(failed.mock.calls[0]?.[0])).toMatch(/The area is still whole/);
  });

  it("keeps the whole earlier copy when a person stops it", async () => {
    const id = await keptThenChanged();
    server.onTile = () => {
      if (server.tilesAsked === 7) stopArea(id);
    };
    await continueArea(id, true);
    await vi.waitFor(async () => expect((await getKept("area", id))?.mixed).toBe(true));
    await vi.waitFor(() => expect(server.tilesAsked).toBeGreaterThanOrEqual(7));
    await new Promise((resolve) => setTimeout(resolve, 20));
    dismissAreaWork(id);

    const kept = await editions(id);
    expect([...kept.keys()].sort()).toEqual([...tilePaths].sort());
    expect([...kept.values()]).toContain(1);
    expect(await getKept("area", id)).toMatchObject({ complete: true, stale: true, mixed: true });
    expect(failed).not.toHaveBeenCalled();
  });

  it("replaces every tile when it finishes, and only then removes what is no longer part of the area", async () => {
    const id = await keptThenChanged();
    const gone = tilePaths.at(-1)!;
    server.empty.add(gone);
    let goneWasThereThroughout = true;
    server.onTile = () => {
      void storage
        .open(`outpost-kept:area:${id}`)
        .then((cache) => cache.match(gone))
        .then((copy) => {
          if (!copy) goneWasThereThroughout = false;
        });
    };
    await continueArea(id, true);
    await vi.waitFor(() => expect(finished).toHaveBeenCalledTimes(2));

    const kept = await editions(id);
    expect(kept.has(gone)).toBe(false);
    expect(goneWasThereThroughout).toBe(true);
    expect([...kept.values()]).toEqual(Array(14).fill(2));
    const after = await getKept("area", id);
    expect(after).toMatchObject({ complete: true, stale: false, tiles: 14, done: 15, positions: 15 });
    expect(after?.mixed).toBeFalsy();
    expect(after?.sources.sources.basemap?.attribution).toBe("edition 2");
    // Counted as stored: fourteen new tiles and the lettering and icons fetched with them.
    expect(after?.bytes).toBe(await bytesKept(id));
  });

  it("keeps the earlier copy when the server now has no map for the area at all", async () => {
    const id = await keptThenChanged();
    for (const path of tilePaths) server.empty.add(path);
    await continueArea(id, true);
    await vi.waitFor(() => expect(failed).toHaveBeenCalledTimes(1));
    expect([...(await editions(id)).values()]).toEqual(Array(15).fill(1));
    expect(await getKept("area", id)).toMatchObject({ complete: true, stale: true });
    expect(String(failed.mock.calls[0]?.[0])).toMatch(/no map for this area now/);
  });
});

describe("carrying on an area that was not finished", () => {
  it("asks only for the tiles it does not have", async () => {
    server.answersLeft = 6;
    const area = await startArea({ title: "The fells", bbox, size });
    await vi.waitFor(() => expect(failed).toHaveBeenCalledTimes(1));
    expect(await getKept("area", area.id)).toMatchObject({ complete: false });
    expect((await editions(area.id)).size).toBe(6);

    server.answersLeft = Number.POSITIVE_INFINITY;
    server.tilesAsked = 0;
    dismissAreaWork(area.id);
    await continueArea(area.id);
    await vi.waitFor(() => expect(finished).toHaveBeenCalledTimes(1));
    expect(server.tilesAsked).toBe(9);
    expect(await getKept("area", area.id)).toMatchObject({ complete: true, tiles: 15 });
  });
});
