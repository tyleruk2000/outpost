/**
 * A stand-in for satellite imagery's publishers, for the end-to-end tests: NASA's world
 * picture (a 1° GeoTIFF of one colour), the Sentinel-2 catalogue's search, and one
 * Sentinel-2 scene of 10 km by 10 km over the tests' made-up map (e2e/tests/map-fixture.ts),
 * also of one colour, so that a test can tell from a pixel which picture it is seeing.
 * Files are served by range, as the real ones are. Nothing in it is a real picture.
 *
 * Also New Zealand's aerial photographs (LINZ's bucket, under /imagery/linz/): its
 * catalogue, one survey of Christchurch and one sheet of it, BW23_5000_1010, a single
 * strong green, at 2 m a pixel.
 */
import type http from "node:http";
import { buildAerialTiff } from "./aerial-tiff.ts";
import { buildGeoTiff } from "./geotiff.ts";

/** The stand-in sheet's outline in longitude and latitude, a little inside its corners. */
export const STAND_IN_SHEET_BOUNDS: [number, number, number, number] = [172.527, -43.4415, 172.554, -43.41];
/** The photograph's colour: a strong green. */
export const STAND_IN_PHOTO_RGB: [number, number, number] = [40, 200, 60];
const LINZ_SURVEY = "/imagery/linz/canterbury/christchurch_2023_2m/rgb/2193/";

function linzFiles(): Record<string, Buffer> {
  const [w, s, e, n] = STAND_IN_SHEET_BOUNDS;
  const collection = Buffer.from(
    JSON.stringify(
      {
        type: "Collection",
        title: "Christchurch 2m Urban Aerial Photos (2023)",
        license: "CC-BY-4.0",
        links: [
          { rel: "self", href: "./collection.json" },
          { href: "./BW23_5000_1010.json", rel: "item" },
        ],
        providers: [{ name: "Stand-in City Council", roles: ["licensor"] }],
        extent: { spatial: { bbox: [[w, s, e, n]] }, temporal: { interval: [["2023-01-15T11:00:00Z", "2023-04-04T12:00:00Z"]] } },
        gsd: 2,
        assets: { capture_area: { href: "./capture-area.geojson", "file:size": 300 } },
      },
      null,
      2,
    ),
  );
  return {
    "/imagery/linz/catalog.json": Buffer.from(
      JSON.stringify({
        type: "Catalog",
        links: [
          {
            rel: "child",
            href: `.${LINZ_SURVEY.slice("/imagery/linz".length)}collection.json`,
            title: "Christchurch 2m Urban Aerial Photos (2023)",
            "file:size": collection.length,
          },
        ],
      }),
    ),
    [`${LINZ_SURVEY}collection.json`]: collection,
    [`${LINZ_SURVEY}capture-area.geojson`]: Buffer.from(
      JSON.stringify({
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
      }),
    ),
  };
}

/** The sheet, made when first asked for (it takes a moment to compress). */
let sheet: Promise<Buffer> | undefined;
const linzSheet = () =>
  (sheet ??= buildAerialTiff({
    width: 1200,
    height: 1800,
    samples: 4,
    alpha: true,
    tile: 256,
    compression: "deflate",
    overviews: 2,
    epsg: 2193,
    // Sheet BW23_5000_1010 of LINZ's grid: 2,400 m by 3,600 m from here.
    originX: 1_561_600,
    originY: 5_193_600,
    pixelSize: 2,
    values: (_x, _y, sample) => (sample === 3 ? 255 : STAND_IN_PHOTO_RGB[sample]!),
  }));

/** The scene: UTM zone 30N, 10 m pixels, top-left corner here. */
const ORIGIN = { x: 422_000, y: 5_886_000 };
/** Its outline in longitude and latitude, a little inside the grid's corners. */
export const STAND_IN_SCENE_BOUNDS: [number, number, number, number] = [-4.155, 53.03, -4.005, 53.115];
/** Reflectances of the scene: a strong red, unlike anything the map draws. */
const REFLECTANCE = { red: 0.25, green: 0.05, blue: 0.04 };
/** The world's colour: a strong blue. */
export const STAND_IN_WORLD_RGB: [number, number, number] = [30, 90, 210];

const band = (reflectance: number) =>
  buildGeoTiff({
    width: 1000,
    height: 1000,
    samples: 1,
    bits: 16,
    tile: 256,
    predictor: 2,
    epsg: 32630,
    originX: ORIGIN.x,
    originY: ORIGIN.y,
    pixelSize: 10,
    nodata: 0,
    // Collection 1 stores reflectance × 10,000 + 1,000.
    values: () => Math.round(reflectance * 10_000 + 1_000),
  });

export function standInWorld(): Buffer {
  return buildGeoTiff({
    width: 360,
    height: 180,
    samples: 3,
    bits: 8,
    epsg: 4326,
    originX: -180,
    originY: 90,
    pixelSize: 1,
    values: (_x, _y, sample) => STAND_IN_WORLD_RGB[sample]!,
  });
}

export function createImageryStandIn(base: () => string) {
  const files: Record<string, Buffer> = {
    ...linzFiles(),
    "/imagery/world.tif": standInWorld(),
    "/imagery/scene/B04.tif": band(REFLECTANCE.red),
    "/imagery/scene/B03.tif": band(REFLECTANCE.green),
    "/imagery/scene/B02.tif": band(REFLECTANCE.blue),
    "/imagery/scene/SCL.tif": buildGeoTiff({
      width: 500,
      height: 500,
      samples: 1,
      bits: 8,
      tile: 256,
      epsg: 32630,
      originX: ORIGIN.x,
      originY: ORIGIN.y,
      pixelSize: 20,
      values: () => 4,
    }),
  };

  function item() {
    const [w, s, e, n] = STAND_IN_SCENE_BOUNDS;
    const href = (name: string) => `${base()}/imagery/scene/${name}.tif`;
    const conversion = [{ scale: 0.0001, offset: -0.1, nodata: 0 }];
    return {
      type: "Feature",
      id: "S2B_T30UVE_20260712T112112_L2A",
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
      properties: { datetime: "2026-07-12T11:26:09Z", platform: "sentinel-2b", "eo:cloud_cover": 3.2, "proj:epsg": 32630 },
      assets: {
        red: { href: href("B04"), "raster:bands": conversion },
        green: { href: href("B03"), "raster:bands": conversion },
        blue: { href: href("B02"), "raster:bands": conversion },
        scl: { href: href("SCL") },
      },
    };
  }

  return {
    worldBytes: files["/imagery/world.tif"]!.length,
    handle(request: http.IncomingMessage, response: http.ServerResponse): void {
      if (request.method === "POST" && request.url === "/imagery/v1/search") {
        request.resume();
        request.on("end", () => {
          response.setHeader("content-type", "application/geo+json");
          response.end(JSON.stringify({ type: "FeatureCollection", features: [item()] }));
        });
        return;
      }
      if (request.url === `${LINZ_SURVEY}BW23_5000_1010.tiff`) {
        void linzSheet().then((built) => serve(request, response, built));
        return;
      }
      const bytes = files[request.url ?? ""];
      serve(request, response, bytes);
    },
  };
}

function serve(request: http.IncomingMessage, response: http.ServerResponse, bytes: Buffer | undefined): void {
  if (!bytes) {
    response.statusCode = 404;
    response.end();
    return;
  }
  const match = /^bytes=(\d+)-(\d+)$/.exec(request.headers.range ?? "");
  if (!match) {
    response.setHeader("content-length", bytes.length);
    response.end(bytes);
    return;
  }
  const start = Number(match[1]);
  const end = Math.min(bytes.length - 1, Number(match[2]));
  response.statusCode = 206;
  response.setHeader("content-range", `bytes ${start}-${end}/${bytes.length}`);
  response.end(bytes.subarray(start, end + 1));
}
