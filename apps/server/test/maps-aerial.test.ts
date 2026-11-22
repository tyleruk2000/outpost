/**
 * National aerial photographs: New Zealand's from a stand-in for LINZ's bucket (its
 * catalogue, a survey's description, its capture area and one WebP-compressed sheet),
 * and the United States' NAIP from a stand-in for the Planetary Computer (its search,
 * its token service and one Deflate sheet in NAD83 / UTM). Everything is served from
 * this computer; nothing in here reaches the internet.
 */
import http from "node:http";
import type { AddressInfo } from "node:net";
import type { ImageryEstimate, ImageryOverview, MapSources, SceneSearchResponse } from "@outpost/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { aerialMaxZoom, levelFor } from "../src/modules/maps/imagery/aerial.ts";
import { coverageOf, linzTileNames, spanText } from "../src/modules/maps/imagery/aerial-sources.ts";
import { Cog } from "../src/modules/maps/imagery/cog.ts";
import { aerialWarning } from "../src/modules/maps/imagery/index.ts";
import { lonLatToTransverseMercator, lonLatToUtm, lonLatToWorldPixel } from "../src/modules/maps/imagery/projection.ts";
import { decodeWebpSync, loadWebpDecoder } from "../src/modules/maps/imagery/webp.ts";
import { buildAerialTiff } from "./fixtures/maps/aerial-tiff.ts";
import { createTestApp, type TestApp } from "./helpers.ts";

const NZTM = { centralMeridian: 173, scale: 0.9996, falseEasting: 1_600_000, falseNorthing: 10_000_000 };

// ── The stand-in publishers ──

/** Sheet BW23_500_098098 of Christchurch: 240 m by 360 m from (1563280, 5191080), at 0.6 m in the stand-in. */
const NZ_AREA: [number, number, number, number] = [172.5466, -43.4352, 172.5505, -43.4326];
/** Near Boulder, Colorado, in UTM zone 13 on NAD83. */
const US_AREA: [number, number, number, number] = [-105.2815, 40.0145, -105.2785, 40.0165];
const US_ORIGIN = lonLatToUtm(-105.284, 40.018, 13, false).map((value) => Math.round(value)) as [number, number];

const files: Record<string, Buffer> = {};
const requests: Array<{ method: string; url: string; range?: string }> = [];
let server: http.Server;
let base = "";

const collectionPath = "/canterbury/test-town_2023_0.6m/rgb/2193/";

function collectionJson(): string {
  // As LINZ lays it out: the list of files first, the extent, dates and licensor at the end.
  return JSON.stringify(
    {
      type: "Collection",
      stac_version: "1.0.0",
      id: "test",
      title: "Test Town 0.6m Urban Aerial Photos (2023)",
      license: "CC-BY-4.0",
      links: [
        { rel: "self", href: "./collection.json" },
        { href: "./BW23_500_098098.json", rel: "item", type: "application/geo+json" },
        ...Array.from({ length: 300 }, (_, i) => ({ href: `./BW23_500_0${String(i).padStart(2, "0")}001.json`, rel: "item" })),
      ],
      providers: [
        { name: "Toitū Te Whenua Land Information New Zealand", roles: ["host", "processor"] },
        { name: "Test City Council", roles: ["licensor"] },
      ],
      extent: {
        spatial: { bbox: [[172.5, -43.5, 172.6, -43.4]] },
        temporal: { interval: [["2023-01-15T11:00:00Z", "2023-04-04T12:00:00Z"]] },
      },
      gsd: 0.6,
      "linz:geospatial_category": "urban-aerial-photos",
      assets: { capture_area: { href: "./capture-area.geojson", "file:size": 300 } },
    },
    null,
    2,
  );
}

beforeAll(async () => {
  files[`${collectionPath}collection.json`] = Buffer.from(collectionJson());
  files[`${collectionPath}capture-area.geojson`] = Buffer.from(
    JSON.stringify({
      type: "Polygon",
      coordinates: [
        [
          [172.5, -43.5],
          [172.6, -43.5],
          [172.6, -43.4],
          [172.5, -43.4],
          [172.5, -43.5],
        ],
      ],
    }),
  );
  files["/catalog.json"] = Buffer.from(
    JSON.stringify({
      type: "Catalog",
      links: [
        { rel: "self", href: "./catalog.json" },
        {
          rel: "child",
          href: `.${collectionPath}collection.json`,
          title: "Test Town 0.6m Urban Aerial Photos (2023)",
          "file:size": files[`${collectionPath}collection.json`]!.length,
        },
        // Too old, scanned film, and in another region: none of these is read.
        {
          rel: "child",
          href: "./canterbury/old_1990_0.5m/rgb/2193/collection.json",
          title: "Old 0.5m Urban Aerial Photos (1990)",
          "file:size": 100,
        },
        {
          rel: "child",
          href: "./canterbury/film_2020_0.5m/rgb/2193/collection.json",
          title: "Film 0.5m Scanned Aerial Photos (2020)",
          "file:size": 100,
        },
        {
          rel: "child",
          href: "./auckland/a_2024_0.1m/rgb/2193/collection.json",
          title: "A 0.1m Urban Aerial Photos (2024)",
          "file:size": 100,
        },
      ],
    }),
  );
  // One sheet; its neighbour to the east (BW23_500_098099) was not photographed.
  files[`${collectionPath}BW23_500_098098.tiff`] = await buildAerialTiff({
    width: 400,
    height: 600,
    samples: 4,
    alpha: true,
    tile: 128,
    compression: "webp",
    overviews: 2,
    epsg: 2193,
    originX: 1_563_280,
    originY: 5_191_080,
    pixelSize: 0.6,
    // Red and blue halves; the bottom rows transparent, as beyond the edge of a survey.
    values: (x, y, s) => (s === 3 ? (y >= 560 ? 0 : 255) : s === 0 ? (x < 200 ? 220 : 30) : s === 2 ? (x < 200 ? 30 : 220) : 90),
  });
  files["/naip/m_4010562_se_13_030_20230925.tif"] = await buildAerialTiff({
    width: 1200,
    height: 1200,
    samples: 4,
    tile: 256,
    compression: "deflate",
    overviews: 2,
    epsg: 26913,
    originX: US_ORIGIN[0],
    originY: US_ORIGIN[1],
    pixelSize: 0.6,
    // Green, with near infra-red that must not show; a black corner outside the quarter-quad.
    values: (x, y, s) => (x + y < 100 ? 0 : s === 1 ? 160 : s === 3 ? 250 : 40),
  });

  server = http.createServer((request, response) => {
    const url = request.url ?? "";
    requests.push({ method: request.method ?? "", url, range: request.headers.range });
    if (request.method === "POST" && url === "/naip/search") {
      response.setHeader("content-type", "application/geo+json");
      const [w, s, e, n] = [-105.29, 40.0, -105.27, 40.02];
      response.end(
        JSON.stringify({
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              id: "co_m_4010562_se_13_030_20230925",
              geometry: {
                type: "Polygon",
                coordinates: [
                  [
                    [w, s],
                    [e, s],
                    [e, n],
                    [w, n],
                    [w, s],
                  ],
                ],
              },
              properties: { datetime: "2023-09-25T16:00:00Z", gsd: 0.6, "naip:year": "2023", "naip:state": "co", "proj:epsg": 26913 },
              assets: {
                image: { href: `${base}/naip/m_4010562_se_13_030_20230925.tif` },
                thumbnail: { href: "https://example.com/t.jpg" },
              },
            },
            // Elsewhere: never offered.
            {
              type: "Feature",
              id: "elsewhere",
              geometry: {
                type: "Polygon",
                coordinates: [
                  [
                    [w, s],
                    [e, s],
                    [e, n],
                    [w, n],
                    [w, s],
                  ],
                ],
              },
              properties: { datetime: "2021-07-26T16:00:00Z", gsd: 0.6, "naip:year": "2021", "naip:state": "co" },
              assets: { image: { href: "https://example.com/m.tif" } },
            },
          ],
        }),
      );
      return;
    }
    if (url === "/naip/token") {
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ token: "sv=test&sig=stand-in", "msft:expiry": new Date(Date.now() + 3_600_000).toISOString() }));
      return;
    }
    const bytes = files[url.split("?")[0]!];
    if (!bytes) {
      response.statusCode = 404;
      response.end();
      return;
    }
    if (url.startsWith("/naip/") && !url.includes("sig=stand-in")) {
      response.statusCode = 403;
      response.end();
      return;
    }
    const match = /^bytes=(\d+)-(\d+)$/.exec(request.headers.range ?? "");
    if (!match) {
      response.statusCode = 200;
      response.end(bytes);
      return;
    }
    const start = Number(match[1]);
    const end = Math.min(bytes.length - 1, Number(match[2]));
    response.statusCode = 206;
    response.setHeader("content-range", `bytes ${start}-${end}/${bytes.length}`);
    response.end(bytes.subarray(start, end + 1));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

async function waitFor<T>(probe: () => T | undefined, what: string, timeoutMs = 30_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = probe();
    if (value !== undefined) return value;
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${what}.`);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

async function withApp(run: (app: TestApp) => Promise<void>): Promise<void> {
  const app = await createTestApp({
    // Sentinel-2's search is not stood in here: it fails, and the photographs are still offered.
    OUTPOST_IMAGERY_STAC_URL: `${base}/no-sentinel/v1/search`,
    OUTPOST_IMAGERY_SENTINEL_HOST: "127.0.0.1",
    OUTPOST_IMAGERY_LINZ_BASE: base,
    OUTPOST_IMAGERY_NAIP_SEARCH_URL: `${base}/naip/search`,
    OUTPOST_IMAGERY_NAIP_TOKEN_URL: `${base}/naip/token`,
    OUTPOST_IMAGERY_NAIP_HOST: "127.0.0.1",
  });
  try {
    await run(app);
  } finally {
    await app.close();
  }
}

const settled = (app: TestApp, id: string) =>
  waitFor(() => {
    const row = app.ctx.services.downloads.get(id);
    return row && ["completed", "failed", "cancelled"].includes(row.state) ? row : undefined;
  }, "the download to finish");

async function tileAt(app: TestApp, id: string, lon: number, lat: number, z: number) {
  const [px, py] = lonLatToWorldPixel(lon, lat, z);
  return app.app.inject({ method: "GET", url: `/api/maps/imagery/${id}/${z}/${Math.floor(px / 256)}/${Math.floor(py / 256)}.webp?raw=1` });
}

// ── Pieces ──

describe("the publishers' grids", () => {
  it("puts New Zealand's sheets where LINZ's own files say they are", () => {
    // Item BW23_500_098098 of Christchurch 2023: its north-west corner, as its STAC item gives it.
    const [e, n] = lonLatToTransverseMercator(172.5462766, -43.4322753, NZTM);
    expect(e).toBeCloseTo(1_563_278, -1);
    expect(n).toBeCloseTo(5_191_080, -1);
    expect(linzTileNames([1_563_300, 5_190_800, 1_563_500, 5_191_000], 500, 3)).toEqual(["BW23_500_098098"]);
    expect(linzTileNames([1_563_300, 5_190_800, 1_563_600, 5_191_000], 500, 3)).toEqual(["BW23_500_098098", "BW23_500_098099"]);
    // Item AT24_5000_0203 of Northland 2023-2024: its north-west corner is (1568800, 6194400).
    expect(linzTileNames([1_568_900, 6_191_000, 1_571_000, 6_194_300], 5000, 2)).toEqual(["AT24_5000_0203"]);
  });

  it("says when a survey was flown in words", () => {
    expect(spanText("2023-01-15", "2023-04-04")).toBe("January to April 2023");
    expect(spanText("2022-12-01", "2023-03-02")).toBe("December 2022 to March 2023");
    expect(spanText("2024-03-01", null)).toBe("March 2024");
  });

  it("measures how much of an area a survey covers", () => {
    const ring: Array<[number, number]> = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
      [0, 0],
    ];
    expect(coverageOf([ring], [0, 0, 1, 1])).toBe(100);
    expect(coverageOf([ring], [0.5, 0, 1.5, 1])).toBe(50);
  });

  it("makes no zoom finer than the photograph, and no deeper than the ceiling", () => {
    expect(aerialMaxZoom(0.6, NZ_AREA, 19)).toBe(18);
    expect(aerialMaxZoom(0.075, NZ_AREA, 19)).toBe(19);
  });
});

describe("reading an aerial photograph", () => {
  it("reads WebP inside a GeoTIFF, with its transparency, and picks the reduced copy a zoom needs", async () => {
    const bytes = files[`${collectionPath}BW23_500_098098.tiff`]!;
    const cog = await Cog.open({ read: async (offset, length) => bytes.subarray(offset, offset + length) });
    expect(cog.images.map((image) => image.width)).toEqual([400, 200, 100]);
    expect(cog.images[0]).toMatchObject({ compression: 50001, samplesPerPixel: 4, alpha: true });
    expect(cog.geo.epsg).toBe(2193);
    expect(levelFor(cog, 0.6)).toBe(0);
    expect(levelFor(cog, 1.3)).toBe(1);
    expect(levelFor(cog, 5)).toBe(2);
    const [ref] = cog.tilesFor(0, 10, 10, 11, 11);
    const pixels = cog.decodeTile(0, bytes.subarray(ref!.offset, ref!.offset + ref!.length));
    // Lossy WebP: near the stand-in's colours, not exactly them.
    expect(Math.abs(pixels[0]! - 220)).toBeLessThan(12);
    expect(Math.abs(pixels[2]! - 30)).toBeLessThan(12);
    expect(pixels[3]).toBe(255);
  });

  it("warns by bytes and tiles, not area, and refuses past the ceiling", () => {
    const common = { areaKm2: 1, sizeBytes: 10e6, seconds: { low: 10, high: 60 }, coveragePercent: 100 };
    expect(aerialWarning({ ...common, transferBytes: 20e6, tiles: 2_000 }).level).toBe("none");
    expect(aerialWarning({ ...common, transferBytes: 80e6, tiles: 2_000 }).level).toBe("notice");
    const warn = aerialWarning({ ...common, transferBytes: 80e6, tiles: 20_000 });
    expect(warn.level).toBe("warn");
    expect(warn.message).toMatch(/town centre/);
    expect(aerialWarning({ ...common, transferBytes: 3e9, tiles: 2_000 }).level).toBe("refuse");
    expect(aerialWarning({ ...common, transferBytes: null, tiles: 90_000 }).level).toBe("refuse");
  });
});

// ── Through the API ──

describe("aerial photographs through the API", () => {
  it("offers New Zealand's survey beside the satellite, says what it takes, builds it from the sheets there are, and credits the licensor", async () => {
    await withApp(async (app) => {
      requests.length = 0;
      const search = await app.api<SceneSearchResponse>("POST", "/api/maps/imagery/scenes", { bbox: NZ_AREA });
      expect(search.status, JSON.stringify(search.body)).toBe(200);
      const photo = search.body.options.find((option) => option.source === "linz-aerial")!;
      expect(photo).toMatchObject({
        title: "Test Town 0.6m Urban Aerial Photos (2023)",
        dateText: "January to April 2023",
        resolutionMeters: 0.6,
        licensor: "Test City Council",
        coveragePercent: 100,
      });
      // Sentinel-2 could not be asked; that is said, and the photograph is still offered.
      expect(search.body.notes.join(" ")).toMatch(/Sentinel-2/);
      // Only the survey in the area's region, of the last ten years, and not scanned film, was read; and only its end.
      const read = requests.filter((entry) => entry.url.includes("collection.json"));
      expect(read.map((entry) => entry.url)).toEqual([`${collectionPath}collection.json`]);
      // NAIP was not asked about New Zealand.
      expect(requests.some((entry) => entry.url.startsWith("/naip"))).toBe(false);

      requests.length = 0;
      const estimate = await app.api<ImageryEstimate>("POST", "/api/maps/imagery/estimate", { bbox: NZ_AREA, sceneKey: photo.key });
      expect(estimate.status, JSON.stringify(estimate.body)).toBe(200);
      expect(estimate.body).toMatchObject({ minZoom: 10, maxZoom: 18, areaCloudPercent: null });
      expect(estimate.body.aerial).toMatchObject({
        files: 1,
        readMeters: 0.6,
        credit: "Licensed by Test City Council for re-use under CC-BY-4.0",
      });
      expect(estimate.body.source.licence).toMatch(/CC BY 4.0/);
      expect(estimate.body.source.cost).toMatch(/^Free/);
      expect(estimate.body.transferBytes).toBeGreaterThan(0);
      // The missing neighbouring sheet was asked for once and left out; no picture tile was fetched yet.
      expect(requests.filter((entry) => entry.url.endsWith("098099.tiff"))).toHaveLength(1);
      expect(requests.every((entry) => !entry.url.endsWith(".tiff") || entry.range === "bytes=0-32767")).toBe(true);

      requests.length = 0;
      const started = await app.api("POST", "/api/maps/imagery/areas", { bbox: NZ_AREA, sceneKey: photo.key, name: "Test Town" });
      expect(started.status, JSON.stringify(started.body)).toBe(200);
      const done = await settled(app, started.body.download.id);
      expect(done.state, done.error ?? "").toBe("completed");
      expect(requests.every((entry) => entry.range)).toBe(true);

      const overview = (await app.api<ImageryOverview>("GET", "/api/maps/imagery")).body;
      const set = overview.sets.find((item) => item.source === "linz-aerial")!;
      expect(set).toMatchObject({ name: "Test Town", imageDateText: "January to April 2023", resolutionMeters: 0.6, maxZoom: 18 });
      expect(set.attribution).toContain("Licensed by Test City Council for re-use under CC-BY-4.0");
      expect(set.attribution).toContain("January to April 2023");
      expect(overview.sources.map((source) => source.id)).toContain("linz-aerial");
      const sources = (await app.api<MapSources>("GET", "/api/maps/sources")).body;
      expect(sources.imagery!.map((source) => source.id)).toEqual([set.id]);

      // On the photographed sheet: a picture. On the one never flown: nothing, so whatever lies beneath shows.
      const inside = await tileAt(app, set.id, 172.5475, -43.434, 18);
      expect(inside.statusCode).toBe(200);
      expect(inside.rawPayload.subarray(0, 4).toString("latin1")).toBe("RIFF");
      const missing = await tileAt(app, set.id, 172.5503, -43.434, 18);
      expect(missing.statusCode).toBe(204);
    });
  });

  it("offers NAIP with a token from Microsoft's service, draws red, green and blue and not near infra-red, and refuses a county", async () => {
    await withApp(async (app) => {
      requests.length = 0;
      const search = await app.api<SceneSearchResponse>("POST", "/api/maps/imagery/scenes", { bbox: US_AREA });
      expect(search.status, JSON.stringify(search.body)).toBe(200);
      const photos = search.body.options.filter((option) => option.source === "naip");
      // The survey whose file is elsewhere is not offered.
      expect(photos).toHaveLength(1);
      expect(photos[0]).toMatchObject({ title: "NAIP 2023, CO", dateText: "25 September 2023", resolutionMeters: 0.6 });
      // A browser in the United States reads the day the way it writes one.
      const asUs = await app.api<SceneSearchResponse>(
        "POST",
        "/api/maps/imagery/scenes",
        { bbox: US_AREA },
        { headers: { "accept-language": "en-US" } },
      );
      expect(asUs.body.options.find((option) => option.source === "naip")?.dateText).toBe("September 25, 2023");
      expect(requests.some((entry) => entry.url === "/catalog.json")).toBe(false);

      const estimate = await app.api<ImageryEstimate>("POST", "/api/maps/imagery/estimate", { bbox: US_AREA, sceneKey: photos[0]!.key });
      expect(estimate.status, JSON.stringify(estimate.body)).toBe(200);
      expect(estimate.body.aerial?.credit).toBe("NAIP imagery provided by USDA Farm Service Agency");
      // Every request for the file carried the token; the token was asked for once.
      expect(requests.filter((entry) => entry.url.startsWith("/naip/m_")).every((entry) => entry.url.includes("sig=stand-in"))).toBe(true);
      expect(requests.filter((entry) => entry.url === "/naip/token")).toHaveLength(1);

      const started = await app.api("POST", "/api/maps/imagery/areas", { bbox: US_AREA, sceneKey: photos[0]!.key, name: "Boulder" });
      expect(started.status, JSON.stringify(started.body)).toBe(200);
      const done = await settled(app, started.body.download.id);
      expect(done.state, done.error ?? "").toBe("completed");
      const set = (await app.api<ImageryOverview>("GET", "/api/maps/imagery")).body.sets.find((item) => item.source === "naip")!;
      expect(set.attribution).toContain("NAIP imagery provided by USDA Farm Service Agency");
      const tile = await tileAt(app, set.id, -105.28, 40.0155, 18);
      expect(tile.statusCode).toBe(200);
      // Red, green and blue as the file holds them: the fourth band, near infra-red (250), is not drawn as anything.
      await loadWebpDecoder();
      const picture = decodeWebpSync(new Uint8Array(tile.rawPayload));
      const middle = (128 * 256 + 128) * 4;
      expect(Math.abs(picture.data[middle]! - 40)).toBeLessThan(10);
      expect(Math.abs(picture.data[middle + 1]! - 160)).toBeLessThan(10);
      expect(picture.data[middle + 3]).toBe(255);

      // A county of 30 cm photograph is refused before anything is read.
      requests.length = 0;
      const county = await app.api("POST", "/api/maps/imagery/estimate", { bbox: [-105.6, 39.8, -105.0, 40.3], sceneKey: photos[0]!.key });
      expect(county.status).toBe(400);
      expect(county.body.error.message).toMatch(/not a county/);
      expect(requests.filter((entry) => entry.url.startsWith("/naip/m_"))).toEqual([]);
    });
  });
});
