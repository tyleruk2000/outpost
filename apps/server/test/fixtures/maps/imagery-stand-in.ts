/**
 * A stand-in for satellite imagery's publishers, for the end-to-end tests: NASA's world
 * picture (a 1° GeoTIFF of one colour), the Sentinel-2 catalogue's search, and one
 * Sentinel-2 scene of 10 km by 10 km over the tests' made-up map (e2e/tests/map-fixture.ts),
 * also of one colour, so that a test can tell from a pixel which picture it is seeing.
 * Files are served by range, as the real ones are. Nothing in it is a real picture.
 */
import type http from "node:http";
import { buildGeoTiff } from "./geotiff.ts";

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
      const bytes = files[request.url ?? ""];
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
    },
  };
}
