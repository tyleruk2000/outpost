import { describe, expect, it, vi } from "vitest";
import { createTileLoader, regionsCacheKey, tilePath, tileTemplate } from "./tiles";

class Missing extends Error {
  status = 404;
}

const loaderFor = (response: Response) => {
  const fetchTile = vi.fn(async () => response);
  return { fetchTile, load: createTileLoader(fetchTile as unknown as typeof fetch, (url) => new Missing(url)) };
};

describe("tile addresses", () => {
  it("wraps the server's template in the tile protocol", () => {
    expect(tileTemplate("/api/maps/tiles/{z}/{x}/{y}.mvt", "abc")).toBe("outpost-tiles://local/api/maps/tiles/{z}/{x}/{y}.mvt?v=abc");
    expect(tileTemplate("/api/maps/tiles/{z}/{x}/{y}.mvt", "")).toBe("outpost-tiles://local/api/maps/tiles/{z}/{x}/{y}.mvt");
  });

  it("maps a protocol address back to a same-origin path", () => {
    expect(tilePath("outpost-tiles://local/api/maps/tiles/12/2003/1332.mvt?v=abc")).toBe("/api/maps/tiles/12/2003/1332.mvt?v=abc");
  });

  it("reaches nothing but the maps API", () => {
    expect(tilePath("https://example.com/api/maps/tiles/1/1/1.mvt")).toBeNull();
    expect(tilePath("outpost-tiles://local/api/settings")).toBeNull();
    expect(tilePath("outpost-tiles://example.com/api/maps/tiles/1/1/1.mvt")).toBeNull();
  });
});

describe("tile loader", () => {
  it("returns the tile's bytes and no expiry, so the map does not fetch every tile on screen again each hour", async () => {
    const { fetchTile, load } = loaderFor(
      new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { "Cache-Control": "private, max-age=3600" } }),
    );
    const abort = new AbortController();
    const result = await load({ url: "outpost-tiles://local/api/maps/tiles/12/2003/1332.mvt?v=abc" }, abort);
    expect(new Uint8Array(result.data)).toEqual(new Uint8Array([1, 2, 3]));
    // The browser's own cache still follows the server's headers; MapLibre, given them, sets a reload timer per tile.
    expect(result).toEqual({ data: expect.any(ArrayBuffer) });
    expect(fetchTile).toHaveBeenCalledWith("/api/maps/tiles/12/2003/1332.mvt?v=abc", { signal: abort.signal, credentials: "same-origin" });
  });

  it("reports an empty answer as a missing tile, so a coarser one can stand in", async () => {
    const { load } = loaderFor(new Response(null, { status: 204 }));
    await expect(load({ url: "outpost-tiles://local/api/maps/tiles/10/500/330.mvt" }, new AbortController())).rejects.toMatchObject({
      status: 404,
    });
  });

  it("reports other failures as errors", async () => {
    const { load } = loaderFor(new Response("no", { status: 500 }));
    await expect(load({ url: "outpost-tiles://local/api/maps/tiles/10/500/330.mvt" }, new AbortController())).rejects.toThrow(
      "could not be loaded (500)",
    );
  });

  it("refuses addresses that are not tiles, without fetching", async () => {
    const { fetchTile, load } = loaderFor(new Response(null, { status: 200 }));
    await expect(load({ url: "outpost-tiles://elsewhere/x" }, new AbortController())).rejects.toThrow();
    expect(fetchTile).not.toHaveBeenCalled();
  });
});

describe("regionsCacheKey", () => {
  const region = (id: string, installedAt = 1, extra: Partial<{ available: boolean; status: string }> = {}) => ({
    id,
    installedAt,
    available: true,
    status: "installed",
    ...extra,
  });

  it("is the same for the same regions in any order", () => {
    expect(regionsCacheKey([region("a"), region("b")])).toBe(regionsCacheKey([region("b"), region("a")]));
  });

  it("changes when a region is added, replaced, or its drive goes away", () => {
    const base = regionsCacheKey([region("a")]);
    expect(regionsCacheKey([region("a"), region("b")])).not.toBe(base);
    expect(regionsCacheKey([region("a", 2)])).not.toBe(base);
    expect(regionsCacheKey([region("a", 1, { available: false })])).not.toBe(base);
    expect(regionsCacheKey([])).toBe(regionsCacheKey([region("a", 1, { status: "missing" })]));
  });
});
