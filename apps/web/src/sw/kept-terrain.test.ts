/**
 * Heights and an aerial's range worked out on the phone from kept terrain, when the
 * server does not answer: the same sums as the server's, over the tiles a kept area holds.
 */
import type { PointHeight, SightRange } from "@outpost/shared";
import { describe, expect, it } from "vitest";
import { FakeCacheStorage } from "@/features/kept/fake-caches";
import { HILL_WEBP, hillValue } from "./hill-webp.fixture";
import { answerFromKept, keptExtent } from "./kept-terrain";
import { handlingOf, KEPT_INDEX, keptCacheName } from "./rules";

const Z = 10;
const TX = 500;
const TY = 330;
const lonOf = (x: number) => (x / 2 ** Z) * 360 - 180;
const latOf = (y: number) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / 2 ** Z))) * 180) / Math.PI;
const tileBox: [number, number, number, number] = [lonOf(TX), latOf(TY + 1), lonOf(TX + 1), latOf(TY)];

const bytes = Uint8Array.from(atob(HILL_WEBP), (char) => char.charCodeAt(0));

async function keptArea(storage: FakeCacheStorage) {
  const record = {
    kind: "area",
    id: "a1",
    bbox: tileBox,
    terrainMaxZoom: Z,
    sources: { sources: { terrain: { minzoom: 0, maxzoom: 13, bounds: [-180, -85, 180, 85] } } },
  };
  await (await storage.open(KEPT_INDEX)).put("/__kept/area/a1", new Response(JSON.stringify(record)));
  await (await storage.open(keptCacheName("area", "a1"))).put(
    `/api/maps/terrain/${Z}/${TX}/${TY}.webp`,
    new Response(bytes, { headers: { "Content-Type": "image/webp" } }),
  );
}

const ask = async (storage: FakeCacheStorage, path: string) => {
  const response = await answerFromKept(new URL(path, "https://outpost.home"), storage as unknown as CacheStorage);
  return { status: response!.status, body: await response!.json(), by: response!.headers.get("X-Outpost-Worked-On") };
};

describe("heights out of reach, from kept terrain", () => {
  it("reads the height at a point from the kept tile, as the server reads it", async () => {
    const storage = new FakeCacheStorage();
    await keptArea(storage);
    // The centre of pixel (10, 20) of a 64-pixel tile.
    const lon = lonOf(TX + 10.5 / 64);
    const lat = latOf(TY + 20.5 / 64);
    const { body, by } = await ask(storage, `/api/maps/height?at=${lat},${lon}`);
    const height = body as PointHeight;
    expect(by).toBe("phone");
    expect(height.heightMeters).toBeCloseTo((hillValue(10, 20) & 0xffffff) / 256 - 32768, 0);
    expect(height.cellMeters).toBeGreaterThan(0);
  });

  it("says no height is known outside what is kept, and with nothing kept", async () => {
    const storage = new FakeCacheStorage();
    expect(((await ask(storage, "/api/maps/height?at=10,10")).body as PointHeight).heightMeters).toBeNull();
    await keptArea(storage);
    expect(((await ask(storage, "/api/maps/height?at=10,10")).body as PointHeight).heightMeters).toBeNull();
    expect((await ask(storage, "/api/maps/height?at=nowhere")).status).toBe(400);
  });

  it("works out an estimated range from the kept ground, unknown beyond it", async () => {
    const storage = new FakeCacheStorage();
    await keptArea(storage);
    const lat = latOf(TY + 0.5);
    const lon = lonOf(TX + 0.5);
    const range = (await ask(storage, `/api/maps/sight-range?at=${lat},${lon}&aerial=10&station=2`)).body as SightRange;
    expect(range.coverage).toBe("partial");
    expect(range.groundMeters).not.toBeNull();
    expect(range.bearings).toHaveLength(720);
    // One tile, a few tens of kilometres across, holds the ground near the aerial and nothing past its edge.
    expect(range.bearings.every((bearing) => bearing.unknownFromMeters !== null && bearing.unknownFromMeters < 60_000)).toBe(true);
    const none = (await ask(new FakeCacheStorage(), `/api/maps/sight-range?at=${lat},${lon}&aerial=10&station=2`)).body as SightRange;
    expect(none.coverage).toBe("none");
  });

  it("takes the extent of the kept terrain from the areas kept with it", () => {
    const area = (bbox: [number, number, number, number], zoom: number) => ({
      kind: "area" as const,
      id: String(zoom),
      bbox,
      terrainMaxZoom: zoom,
      sources: { sources: { terrain: { minzoom: 2, maxzoom: 13, bounds: [-180, -85, 180, 85] as [number, number, number, number] } } },
    });
    expect(keptExtent([area([0, 0, 1, 1], 10), area([2, 2, 3, 3], 12)])).toEqual({ minzoom: 2, maxzoom: 12, bounds: [0, 0, 3, 3] });
    expect(keptExtent([])).toBeNull();
  });

  it("asks the server first for heights and ranges, and answers from what is kept only when it does not", () => {
    const facts = (path: string) => ({ method: "GET", url: `https://outpost.home${path}`, mode: "cors", destination: "" });
    expect(handlingOf(facts("/api/maps/height?at=1,1"), "https://outpost.home", new Set())).toBe("worked");
    expect(handlingOf(facts("/api/maps/sight-range?at=1,1&aerial=1&station=1"), "https://outpost.home", new Set())).toBe("worked");
    expect(handlingOf(facts("/api/maps/relay"), "https://outpost.home", new Set())).toBe("none");
  });
});
