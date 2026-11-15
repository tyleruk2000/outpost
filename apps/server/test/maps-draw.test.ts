import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import {
  haversineMeters,
  MAX_ROUTE_POINTS,
  type RouteSaveResponse,
  type TrackDto,
  type TrackImportResponse,
  type TrackWithGeometryDto,
} from "@outpost/shared";
import { DOMParser } from "@xmldom/xmldom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanRoutePoints, densify } from "../src/modules/maps/drawn-route.ts";
import { terrariumHeights } from "../src/modules/maps/elevation.ts";
import { decimal, parseGpx } from "../src/modules/maps/gpx.ts";
import { Compression, TileType } from "../src/modules/maps/pmtiles/header.ts";
import { decodePng } from "../src/modules/maps/terrain/png.ts";
import { decodeLosslessWebp, ImageDecodeError } from "../src/modules/maps/terrain/webp-lossless.ts";
import { buildArchive, type FixtureTile } from "./fixtures/maps/archive.ts";
import { createTestApp, type TestApp } from "./helpers.ts";

// ── Images ──────────────────────────────────────────────────────────────────
// Three small lossless WebP files made with `cwebp -lossless -exact -z 9` from images
// whose every pixel follows a whole-number rule, so the test can say what each pixel
// must be without a second decoder. Between them they use the predictor, colour and
// subtract-green transforms, copies of earlier pixels, and a packed palette with
// transparency. (The decoder was also compared, pixel for pixel, with `dwebp` on real
// terrain tiles and on sixty-odd images made to exercise every part of the format.)

/** 64 × 64: a hillside as Terrarium colours. */
const HILL_WEBP = [
  "UklGRlgKAABXRUJQVlA4TEsKAAAvP8APAM1VIKL/MXBT27YTbQmUlPhXRBkFXGBS/YesAC0kSWqEDT88f5LHWIRFKHj/1aZtwGhIeUWc46VTIyYg4iEg6kA3QBwiRhVxG9uwVpXogBbK",
  "P7KsyCJAdrT4/SCTw9BLjk+cRJY1NrJtFLp1EPFAZBt6ENl5ZAQFbdtIDn/Yu5dBREyASkUh5YFdJ31z1c5AteiArNCiVTibDxyE6mC5wCJlUIgkSZIk7Zrdu//yOP4A3T1yDoKAoMh0",
  "z+W6/x+3zdhz7nx3vSlIkOLc9+FWtOky+Bt0GfyLv0CBrJn7mC6halgI0No3yNxz7jt06to36FyEIwVsw+ZiEJiidbKkfoFiI0mOJAlnfpzf6y9tZna/CiHX/f84UjiqfQVKWkR5jjKy",
  "lSjWWGPyZ/+stdxn65EtW7ZijRUr1kSTvWquko6eems6XgFRIioegGCkAG2YS0FwYFa1ecN/X33y6BP32c8P1z889MEvt/guO+jRx08ff3+8/aeDP/z60+2/iE9fP//9fO/L+OXyy8GX",
  "x1+/fP3z9c634euPL+786+0XV1/8+2Lmi/DV76/d/fn6x7ef/35VP/e/fv668fv9D19++P/D0g/tT39+evyL++XnL9d+9fq3z7/9/Xfzn/rv+3//oYEgGDrL620bjO3amZ11gVZaCEql",
  "szyvLxqUduZO0aCFBqIIES5fLzU0tjMjoAkzEQwsvHZxgOMVAg0UyaTZfH1b6zqHsKOOPYeCBoIoms3nClbxOkh6ApCCBqpASQ4+K4itCAA7giwRkIysPHZ1oOMVIi3MYNVaK4PRbmR6",
  "LgUtFKXSWbVaa2tQZhABlLSwA62unTE7JCUFUDNKVWpQYAZMqoqbqVrXqYKAFAA0hAZSNJIX6meqdqQnkNqEgkYRIqMMJ4CJPAMWE/IlUtcOWgiSsWCyM5UMwFVLAkJTW5SK5asxqaEO",
  "tvdEA4CGGqkIkawGaysD2B5SANWfqlQO25rR/AqRBooQ26TR/auKOAQCIDSBPRhwhECyU0hAhiUB+Xq89QAFQAAIMSzeh+oK6UtIzU+olVrXoZKQFAAyFuRXyAOoCJGsgLUd8EKhCXnt",
  "DpFd4WtFXAbiEGUlBKGQkYXXrBCY7MmuwMFz1fV4A3ijpDnNChmKGIwqq9bPEI3gqiHVQEkDwURI4DC5Yyqh2RM0UNBARCiVyaMCJhGN0AxZImAySJnIEdJhVqo77Q4BDiEZDBShQCmr",
  "8Y4ZwKQnAiloYUBWxFby+k5QACM7lPpWhxKA8PX7E1UVSAtBIhlk8Pc3kz0BQEkDiVTKaZLbixgjSQIG9EHYCFnfI06lUWFvFVxCQQCY9wSnTrFEBJWQdDa694Bm95oHkKjzRwJBimUZ",
  "NC+2GiHSR3fY+g41ZHSnkbZQIJGFx3BZAbD5UihVNntt1l49DQBQ0R2lQ1mrHt/bHN8T4Oo+QGNRSgDQNLmDmrs9vl8jQUACNBSCCq6QrqSYiGZSNUASUN31TmJxuVK5uTVcSmR9P0GE",
  "GCAjm0arj5D8TJANw+UnVS++E0V3G7OH765v4AkQvviO4faqAITCEz0Fs6hCNdjkFlwCMqzwHAwREmTqaLA4AcID8Hx0IKMMJwJIQpYImGKklpEVUtchlEZAvUsx2WklWUGFWgGN2tEd",
  "HHyhKJUrpubO1KiVXt1NNcmKqVlBjdqjuytkQHopCzoumAPuQXrAUhJBOMcBhwImt6KsoC+U+l6GOjWxOcKX3MKjl5KEgJTMipmsaLCSXDm9Z2OZPRRVswIUiWSU7oop2ZP6Th+UPZQm",
  "UlwCIABW93ORq6y6s0hzM1VDHbjqBSiQwGmswUplEJofvYdMfpRJcgDNEIFCUO42O0LKQRiZKB7f7RAKOITCDEQoZTFZKOJEBSadQdIQSqPeTWSLdICqAhHigHx9nFC29wI44ZlbqMfd",
  "lgjQRF7fndxiUiJoIiE0WN2vVCkBmsb30tktobqsCNY3Aop4OXi8G6c3bpGRV/cDxLgcDAUMxmJCjEkDUEOiCU0wFEgCVsjkNkYmdDelmt6tbbtC1NNHABTQGAzSAbWj7OZ2KGKrhrqX",
  "7jLEuLy+J+jdUmmWm6MchI/cysDugR/K+PYOgS4qiet7yOALMSmhLi4GCJ++nbwARraKy2Ol7W0gCLHNeQQmN+ZuxWRkMXmEIFdfl7OiZHMjMUZuvxTR5MYIUeBHupMszbfuzgoyeO6+",
  "W81jjaUgTWfX9y/gmBhVdX/A+k5dXKhPcnyv4Nqc7KjjASIY2afvpWflpKpR/OouYKfCqXL09WZyT2WABjtBXGa528gRsoPJnhJ6626OhLrI526Tu3C3NyT7Zgjre1z+NENsCrGF5ZQg",
  "TgDwAfUtpRnbe3O3eIJICTJMzt6wQk7v4bkYYqSWqGaFXN0JYtuGRlWqFdSgPboTxFIZp7qgGpcI+tS7Hd+RypUmM0KcbXV3hRxwLgH8sQI3K5N7UNJzN7lCcX9Tsrlxfe8AIOiuKP9j",
  "BXlzD1r4Rrm+H9+7QuD4nuWW+N0b1veQ7YpdPO4Wyd295yW3ltlDaaoInu+eOOrje0hk4WtTj9xLTW/VxNbIzQE2BIpgkJ53rzyU23viiQq4BMLcLSIZOExub0d3uBzdIZHb3K3suwuA",
  "mt4TOUJefB/b3J7eUHBzq/70ngUnpkn1CkQyvdva0tP3DKd52XtObqwQeoUc/evbAUV8wEvvrdQV0hJjMQArDVAtqQZqfAtOnUJshORuETIQoUQGv8oGNEOESHtPOnKFdCU1lCIuv/ru",
  "9K7VnVCFSjj53Bbp9X2lLsvsIva6N2Cluzcc39Y4RGi9vg1Y38Mkt0U6vQ0JICUt3N56ivzmRhHfzxRmBRFKOExqr0SQv3pP9BgBJhGmN75zo7rjxuZP3wlBqzudfKw7aYvs9AakK1Uq",
  "P/ee+yqjkoBc3yvQIa1grb2nulOBUm51r251D4B69e4DZAZUxyRZefTGAM3OVVV3eVBz+wZR/et76SmSFSJ9fSP+2HvevaG6O77HbRAfuXF6QwKELTE9sNytJhGs753eYwtDs7rHE0W3",
  "9zT3aFObUNN70N2Mgrs3TO8UB6hCHVc6utMeDkOkvQft9O7s9M4WWXOdrSDD7WakmKBfYI5X7mFPh6d3SZ3cE8TH3iW1vncvMnytlA9Fagdis2dFALW5HX1QIMeZMtCa2KW09yzlf/cG",
  "HGL59u76XuRSmt72bu5Qmup7PUjfJSa5N717ci82pe7pPc293MPIx/eQZo6Qrkzu5otn70GY7670HprS3snd8Q0kcPJoYZVB0j5oAJjew1wh77sNAua76/Seh+6nd9+Yvu3duZPbmxun",
  "Faq707s11uz0nldvzJ1FBCavb2emyLQ83y2n95QIRXx6jxBMhMQsJjM+6j1TpDUyyRIRy92iewyQmd6DD+Vxt9u7/sd3d+96fLdmcitkdAfz9O1HbxibMr30HpIrnN4e3W1vKMTGtx+5",
  "QVTEITY3xMzI3tzobHWUzqLCFplyEh98t2pNp5YDAA==",
].join("");
const hillValue = (x: number, y: number) => (32768 + 300) * 256 + x * x * 37 + y * 611 + ((x * y) % 17) * 3;

/** 96 × 96: rolling ground with a repeating texture. */
const GROUND_WEBP = [
  "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",
].join("");
const groundValue = (x: number, y: number) =>
  (32768 + 250) * 256 + x * 900 + y * y * 11 + ((x * 7 + y * 13) % 23) * 5 + ((Math.floor(x / 8) + Math.floor(y / 8)) % 3) * 400;

/** 21 × 9: three colours, one of them fully transparent. */
const FLAGS_WEBP = "UklGRjAAAABXRUJQVlA4TCMAAAAvFAACEApFbdtATMYf1ADd/7S6AvJRtPrfgwgqkbqSpUrPEQA=";
const FLAG_COLOURS = [0xffc81e28, 0x00000000, 0xff0adc5a];

const rgbOf = (value: number) => (0xff000000 | (value & 0xffffff)) >>> 0;

/** A PNG writer for tests: 8-bit RGB or RGBA, each row stored with the filter asked for. */
function encodePng(
  width: number,
  height: number,
  pixel: (x: number, y: number) => number,
  options: { alpha?: boolean; filter?: number } = {},
) {
  const channels = options.alpha ? 4 : 3;
  const stride = width * channels;
  const rows: Buffer[] = [];
  let previous = Buffer.alloc(stride);
  for (let y = 0; y < height; y += 1) {
    const row = Buffer.alloc(stride);
    for (let x = 0; x < width; x += 1) {
      const argb = pixel(x, y);
      row[x * channels] = (argb >>> 16) & 0xff;
      row[x * channels + 1] = (argb >>> 8) & 0xff;
      row[x * channels + 2] = argb & 0xff;
      if (options.alpha) row[x * channels + 3] = argb >>> 24;
    }
    // Rows cycle through all five filters unless one is asked for.
    const filter = options.filter ?? y % 5;
    const stored = Buffer.alloc(stride + 1);
    stored[0] = filter;
    for (let index = 0; index < stride; index += 1) {
      const left = index >= channels ? row[index - channels]! : 0;
      const up = previous[index]!;
      const upperLeft = index >= channels ? previous[index - channels]! : 0;
      const estimate = left + up - upperLeft;
      const nearest =
        Math.abs(estimate - left) <= Math.abs(estimate - up) && Math.abs(estimate - left) <= Math.abs(estimate - upperLeft)
          ? left
          : Math.abs(estimate - up) <= Math.abs(estimate - upperLeft)
            ? up
            : upperLeft;
      const predicted = [0, left, up, (left + up) >> 1, nearest][filter]!;
      stored[index + 1] = (row[index]! - predicted) & 0xff;
    }
    rows.push(stored);
    previous = row;
  }
  const chunk = (kind: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(kind, "latin1"), data]);
    const framed = Buffer.alloc(body.length + 8);
    framed.writeUInt32BE(data.length, 0);
    body.copy(framed, 4);
    framed.writeUInt32BE(zlib.crc32(body), body.length + 4);
    return framed;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, options.alpha ? 6 : 2, 0, 0, 0], 8);
  const packed = zlib.deflateSync(Buffer.concat(rows));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    // Split in two, as large images are.
    chunk("IDAT", packed.subarray(0, packed.length >> 1)),
    chunk("IDAT", packed.subarray(packed.length >> 1)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

describe("reading lossless WebP", () => {
  it("decodes every pixel of images with a known rule", () => {
    const hill = decodeLosslessWebp(Buffer.from(HILL_WEBP, "base64"));
    expect([hill.width, hill.height]).toEqual([64, 64]);
    const ground = decodeLosslessWebp(Buffer.from(GROUND_WEBP, "base64"));
    expect([ground.width, ground.height]).toEqual([96, 96]);
    for (const [image, rule] of [
      [hill, hillValue],
      [ground, groundValue],
    ] as const) {
      const wrong: string[] = [];
      for (let y = 0; y < image.height; y += 1) {
        for (let x = 0; x < image.width; x += 1) {
          if (image.argb[y * image.width + x] !== rgbOf(rule(x, y))) wrong.push(`${x},${y}`);
        }
      }
      expect(wrong).toEqual([]);
    }
  });

  it("decodes a palette image, several pixels to a byte, with transparency", () => {
    const flags = decodeLosslessWebp(Buffer.from(FLAGS_WEBP, "base64"));
    expect([flags.width, flags.height]).toEqual([21, 9]);
    for (let y = 0; y < 9; y += 1) {
      for (let x = 0; x < 21; x += 1) expect(flags.argb[y * 21 + x], `${x},${y}`).toBe(FLAG_COLOURS[(x * x + y) % 3]);
    }
  });

  it("refuses what it cannot read instead of inventing pixels", () => {
    const hill = Buffer.from(HILL_WEBP, "base64");
    expect(() => decodeLosslessWebp(Buffer.from("not an image at all, just text"))).toThrow(ImageDecodeError);
    expect(() => decodeLosslessWebp(Buffer.concat([Buffer.from("RIFF\0\0\0\0WEBPVP8 \x04\0\0\0abcd", "latin1")]))).toThrow(/lossy/);
    // Cut short: the declared chunk no longer fits, or the pixels run out part-way.
    expect(() => decodeLosslessWebp(hill.subarray(0, hill.length - 200))).toThrow(ImageDecodeError);
    const truncated = Buffer.from(hill.subarray(0, 600));
    truncated.writeUInt32LE(600 - 20, 16);
    expect(() => decodeLosslessWebp(truncated)).toThrow(ImageDecodeError);
    // Damaged in the middle: either refused or decoded to the stated size, never a crash of another kind.
    for (const at of [40, 300, 1200, 2000]) {
      const damaged = Buffer.from(hill);
      damaged[at] = damaged[at]! ^ 0xff;
      try {
        expect(decodeLosslessWebp(damaged).argb).toHaveLength(64 * 64);
      } catch (error) {
        expect(error).toBeInstanceOf(ImageDecodeError);
      }
    }
  });
});

describe("reading PNG", () => {
  it("decodes RGB and RGBA rows stored with each of the five filters", () => {
    for (const alpha of [false, true]) {
      const pixel = (x: number, y: number) => (((alpha ? (x * 9 + y) & 0xff : 0xff) << 24) | (hillValue(x, y) & 0xffffff)) >>> 0;
      const image = decodePng(encodePng(40, 23, pixel, { alpha }));
      expect([image.width, image.height]).toEqual([40, 23]);
      for (let y = 0; y < 23; y += 1) for (let x = 0; x < 40; x += 1) expect(image.argb[y * 40 + x], `${x},${y}`).toBe(pixel(x, y));
    }
  });

  it("refuses other kinds of PNG and damaged files", () => {
    const good = encodePng(8, 8, () => 0xff102030);
    expect(() => decodePng(Buffer.from("GIF89a, not a PNG, and long enough to look at"))).toThrow(/not a PNG/);
    const sixteenBit = Buffer.from(good);
    sixteenBit[24] = 16;
    expect(() => decodePng(sixteenBit)).toThrow(/8-bit RGB or RGBA/);
    expect(() => decodePng(good.subarray(0, 60))).toThrow(ImageDecodeError);
  });

  it("turns Terrarium colours into heights, and holes into gaps", () => {
    // 1085.5 m, sea level, a transparent pixel and an impossible height.
    const values = [(32768 + 1085) * 256 + 128, 32768 * 256, 32768 * 256, 0];
    const tile = terrariumHeights(
      decodePng(encodePng(2, 2, (x, y) => ((x === 0 && y === 1 ? 0 : 0xff000000) | values[y * 2 + x]!) >>> 0, { alpha: true })),
    )!;
    expect(tile.size).toBe(2);
    expect(tile.heights[0]).toBe(1085.5);
    expect(tile.heights[1]).toBe(0);
    expect(tile.heights[2]).toBeNaN();
    expect(tile.heights[3]).toBeNaN();
  });
});

// ── Routes ──────────────────────────────────────────────────────────────────

let app: TestApp;
beforeEach(async () => {
  app = await createTestApp();
});
afterEach(async () => {
  await app.close();
});

const THREE_POINTS = [
  { lat: 53.085, lon: -4.1 },
  { lat: 53.0685, lon: -4.0763 },
  { lat: 53.06, lon: -4.05 },
];
const lengthOf = (points: Array<{ lat: number; lon: number }>) =>
  points.slice(1).reduce((sum, point, index) => sum + haversineMeters(points[index]!.lat, points[index]!.lon, point.lat, point.lon), 0);

type Failure = { error: { code: string; message: string } };
const createRoute = (body: unknown) => app.api<RouteSaveResponse & Failure>("POST", "/api/maps/tracks", body);
const getTrack = async (id: string) => (await app.api<{ track: TrackWithGeometryDto }>("GET", `/api/maps/tracks/${id}`)).body.track;
async function getText(url: string) {
  const response = await app.app.inject({ method: "GET", url, headers: { host: "localhost" } });
  return { status: response.statusCode, text: response.body, headers: response.headers };
}

/** Ground that rises steadily to the east and to the south: 800 m across the world, 400 m down it. */
const groundAt = (worldX: number, worldY: number) => 200 + 800 * worldX + 400 * worldY;
const worldOf = (lat: number, lon: number): [number, number] => [
  (lon + 180) / 360,
  (1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2,
];
const heightAt = (lat: number, lon: number) => groundAt(...worldOf(lat, lon));

/** Terrain tiles (64 px, PNG, Terrarium) for every tile from zoom 0 to `maxZoom` that `keep` accepts. */
function terrainTiles(maxZoom: number, keep: (z: number, x: number) => boolean = () => true): FixtureTile[] {
  const size = 64;
  const tiles: FixtureTile[] = [];
  for (let z = 0; z <= maxZoom; z += 1) {
    for (let x = 0; x < 2 ** z; x += 1) {
      if (!keep(z, x)) continue;
      for (let y = 0; y < 2 ** z; y += 1) {
        const data = encodePng(
          size,
          size,
          (i, j) => {
            const value = Math.round((groundAt((x + (i + 0.5) / size) / 2 ** z, (y + (j + 0.5) / size) / 2 ** z) + 32768) * 256);
            return (0xff000000 | value) >>> 0;
          },
          { filter: 0 },
        );
        tiles.push({ z, x, y, data });
      }
    }
  }
  return tiles;
}

/** Installs a terrain archive the way a person would: a file on a storage location, registered. */
async function installTerrain(name: string, tiles: FixtureTile[], bounds: [number, number, number, number]) {
  const archive = buildArchive({ tiles, bounds, tileType: TileType.Png, tileCompression: Compression.None });
  const location = app.ctx.services.storage.getDefault();
  const relPath = `imports/${name}.pmtiles`;
  fs.mkdirSync(path.join(location.path, "imports"), { recursive: true });
  fs.writeFileSync(path.join(location.path, relPath), archive.bytes);
  const imported = await app.api("POST", "/api/maps/import", { locationId: location.id, relPath, name, tileType: "terrain" });
  expect(imported.status).toBe(200);
}

describe("drawing a route", () => {
  it("saves the points as a route with its length, size and extent worked out on the server", async () => {
    const created = await createRoute({ name: "  Over the top ", color: "violet", description: "Planned for June.", points: THREE_POINTS });
    expect(created.status).toBe(200);
    expect(created.body.elevation).toBe("none");
    expect(created.body.track).toMatchObject({
      name: "Over the top",
      description: "Planned for June.",
      color: "violet",
      sourceFilename: null,
      ascentMeters: null,
      pointCount: 3,
      bounds: [-4.1, 53.06, -4.05, 53.085],
    });
    expect(created.body.track.distanceMeters).toBeCloseTo(lengthOf(THREE_POINTS), 0);

    // It is a track like any other: listed, fetched with its line, found by search.
    const list = await app.api<{ tracks: TrackDto[] }>("GET", "/api/maps/tracks");
    expect(list.body.tracks.map((track) => track.name)).toEqual(["Over the top"]);
    const track = await getTrack(created.body.track.id);
    expect(track.geojson.features).toEqual([
      {
        type: "Feature",
        properties: { _gpxType: "trk", _drawn: true, _elevation: "none" },
        geometry: {
          type: "LineString",
          coordinates: [
            [-4.1, 53.085],
            [-4.0763, 53.0685],
            [-4.05, 53.06],
          ],
        },
      },
    ]);
    expect((await app.api("GET", "/api/maps/overview")).body.counts.tracks).toBe(1);
    const found = await app.api("GET", "/api/search?q=over%20the%20top");
    expect(
      found.body.results.map((result: { kind: string; title: string; url: string }) => [result.kind, result.title, result.url]),
    ).toEqual([["track", "Over the top", `/maps?track=${created.body.track.id}`]]);
    expect((await app.api("GET", "/api/search?q=june")).body.results).toHaveLength(1);
  });

  it("refuses points that cannot make a route, in plain words", async () => {
    const cases: Array<[unknown, RegExp]> = [
      [{ name: "One", points: [THREE_POINTS[0]] }, /at least two points/],
      [{ name: "None", points: [] }, /at least two points/],
      [{ name: "Missing" }, /list of \{ lat, lon \}/],
      [{ name: "", points: THREE_POINTS }, /Give the route a name/],
      [{ name: "North of north", points: [THREE_POINTS[0], { lat: 91, lon: 0 }] }, /Latitude must be between -90 and 90/],
      [{ name: "East of east", points: [THREE_POINTS[0], { lat: 0, lon: 180.5 }] }, /Longitude must be between -180 and 180/],
      [{ name: "Not numbers", points: [THREE_POINTS[0], { lat: "53", lon: -4 }] }, /./],
      [{ name: "Colour", color: "puce", points: THREE_POINTS }, /Choose one of the marker colours/],
      [
        { name: "Too many", points: Array.from({ length: MAX_ROUTE_POINTS + 1 }, (_, index) => ({ lat: 10 + index / 1000, lon: 5 })) },
        new RegExp(`at most ${MAX_ROUTE_POINTS} points`),
      ],
      // The same place twice is one point.
      [{ name: "Standing still", points: [THREE_POINTS[0], { lat: 53.0850000001, lon: -4.1 }] }, /all in the same place/],
    ];
    for (const [body, message] of cases) {
      const refused = await createRoute(body);
      expect(refused.status, JSON.stringify(body).slice(0, 80)).toBe(400);
      expect(refused.body.error.message).toMatch(message);
    }
    expect((await app.api("GET", "/api/maps/tracks")).body.tracks).toEqual([]);

    // The largest route allowed is accepted.
    const most = await createRoute({
      name: "As many as allowed",
      points: Array.from({ length: MAX_ROUTE_POINTS }, (_, index) => ({ lat: 10 + index / 1000, lon: 5 })),
    });
    expect(most.status).toBe(200);
    expect(most.body.track.pointCount).toBe(MAX_ROUTE_POINTS);
  });

  it("stores positions to six decimal places and drops a point repeated straight after itself", () => {
    expect(
      cleanRoutePoints([
        { lat: 53.12345678, lon: -4.00000049 },
        { lat: 53.123456781, lon: -4.0000004 },
        { lat: 53.2, lon: -4.1 },
        { lat: 53.2, lon: -4.1 },
        { lat: 53.12345678, lon: -4.0000004 },
      ]),
    ).toEqual([
      [-4, 53.123457],
      [-4.1, 53.2],
      [-4, 53.123457],
    ]);
  });

  it("samples the line between two points no further apart than asked, ending on each point", () => {
    const line: Array<[number, number]> = [
      [-4.1, 53.085],
      [-4.0763, 53.0685],
      [-4.0763, 53.0684],
    ];
    const dense = densify(line, 100);
    expect(dense.filter((sample) => sample.vertex >= 0).map((sample) => sample.position)).toEqual(line);
    expect(dense.at(-1)!.vertex).toBe(2);
    for (let index = 1; index < dense.length; index += 1) {
      const [a, b] = [dense[index - 1]!.position, dense[index]!.position];
      expect(haversineMeters(a[1], a[0], b[1], b[0])).toBeLessThanOrEqual(100.5);
    }
    // Added positions lie on the line: the same share of the way east as of the way south.
    const middle = dense[Math.floor((dense.findIndex((sample) => sample.vertex === 1) + 0) / 2)]!.position;
    const east = (middle[0] - line[0]![0]) / (line[1]![0] - line[0]![0]);
    const south = (middle[1] - line[0]![1]) / (line[1]![1] - line[0]![1]);
    expect(east).toBeCloseTo(south, 3);
    // A leg shorter than the spacing gets nothing added.
    expect(densify(line.slice(1), 100)).toHaveLength(2);
  });

  it("fills in heights from installed terrain, and counts the climb between the points", async () => {
    await installTerrain("everywhere", terrainTiles(3), [-180, -85.0511, 180, 85.0511]);
    // 700 km eastwards and a little south: uphill all the way on this ground.
    const points = [
      { lat: 47, lon: 2 },
      { lat: 46.5, lon: 6 },
      { lat: 46, lon: 11 },
    ];
    const created = await createRoute({ name: "Across", points });
    expect(created.status).toBe(200);
    expect(created.body.elevation).toBe("terrain");

    const track = await getTrack(created.body.track.id);
    const line = track.geojson.features[0] as {
      properties: { _elevation: string; _profile: number[][] };
      geometry: { coordinates: number[][] };
    };
    expect(line.properties._elevation).toBe("terrain");
    for (const [index, point] of points.entries()) {
      const [lon, lat, height] = line.geometry.coordinates[index]!;
      expect([lon, lat]).toEqual([point.lon, point.lat]);
      expect(Math.abs(height! - heightAt(point.lat, point.lon))).toBeLessThan(1);
    }
    // The line between the points is sampled too, each sample at the height of the ground there.
    const profile = line.properties._profile;
    expect(profile.length).toBeGreaterThan(1500);
    expect(profile[0]).toEqual(line.geometry.coordinates[0]);
    expect(profile.at(-1)).toEqual(line.geometry.coordinates[2]);
    for (const [lon, lat, height] of profile) expect(Math.abs(height! - heightAt(lat!, lon!))).toBeLessThan(1);
    const climb = heightAt(46, 11) - heightAt(47, 2);
    expect(climb).toBeGreaterThan(15);
    expect(Math.abs(created.body.track.ascentMeters! - climb)).toBeLessThan(3.5);
    expect(created.body.track.pointCount).toBe(3);
    expect(created.body.track.distanceMeters).toBeCloseTo(lengthOf(points), 0);
  });

  it("says when terrain covers only part of a route, and when it covers none of it", async () => {
    // Terrain for the western half of the world only.
    await installTerrain(
      "west",
      terrainTiles(3, (z, x) => x < 2 ** z / 2),
      [-180, -85.0511, 0, 85.0511],
    );
    const straddling = await createRoute({
      name: "Coast to coast",
      points: [
        { lat: 47, lon: -3 },
        { lat: 47, lon: 3 },
      ],
    });
    expect(straddling.body.elevation).toBe("partial");
    const line = (await getTrack(straddling.body.track.id)).geojson.features[0] as {
      properties: { _profile: number[][] };
      geometry: { coordinates: number[][] };
    };
    expect(line.geometry.coordinates.map((position) => position.length)).toEqual([3, 2]);
    const withHeight = line.properties._profile.filter((position) => position.length === 3);
    expect(withHeight.length).toBeGreaterThan(100);
    expect(withHeight.every(([lon]) => lon! <= 0)).toBe(true);
    expect(line.properties._profile.filter((position) => position.length === 2).every(([lon]) => lon! >= 0)).toBe(true);
    expect(straddling.body.track.ascentMeters).not.toBeNull();

    const outside = await createRoute({
      name: "All in the east",
      points: [
        { lat: 47, lon: 3 },
        { lat: 47, lon: 9 },
      ],
    });
    expect(outside.body.elevation).toBe("none");
    expect(outside.body.track.ascentMeters).toBeNull();
    const plain = (await getTrack(outside.body.track.id)).geojson.features[0] as { properties: Record<string, unknown> };
    expect(plain.properties).toEqual({ _gpxType: "trk", _drawn: true, _elevation: "none" });
  });

  it("carries on without heights when a terrain file cannot be read", async () => {
    // An archive that claims to hold image tiles, but whose tiles are not images.
    const junk = terrainTiles(2).map((tile) => ({ ...tile, data: Buffer.from(`not an image ${tile.z}/${tile.x}/${tile.y}`) }));
    await installTerrain("junk", junk, [-180, -85.0511, 180, 85.0511]);
    const created = await createRoute({ name: "Over junk", points: THREE_POINTS });
    expect(created.status).toBe(200);
    expect(created.body.elevation).toBe("none");
    expect(created.body.track.ascentMeters).toBeNull();
  });
});

describe("exporting a drawn route", () => {
  /** Element names of an element's children, in order. */
  const childNames = (parent: { childNodes: ArrayLike<{ nodeType: number; nodeName: string }> }) =>
    Array.from(parent.childNodes)
      .filter((node) => node.nodeType === 1)
      .map((node) => node.nodeName);

  it("writes GPX 1.1 with the name, the points as placed, heights when known and no times", async () => {
    await installTerrain(
      "west",
      terrainTiles(3, (z, x) => x < 2 ** z / 2),
      [-180, -85.0511, 0, 85.0511],
    );
    // Two points over terrain, one beyond it, and a name that needs escaping.
    const points = [
      { lat: 47.123456, lon: -3.5 },
      { lat: 47.25, lon: -0.000001 },
      { lat: 47.3, lon: 1.25 },
    ];
    const created = await createRoute({ name: 'Tom & Ann\'s <"long"> day', points });
    const exported = await getText(`/api/maps/tracks/${created.body.track.id}/export.gpx`);
    expect(exported.status).toBe(200);
    expect(exported.headers["content-type"]).toBe("application/gpx+xml; charset=utf-8");
    expect(exported.headers["content-disposition"]).toContain('filename="Tom Ann s long day.gpx"');
    expect(exported.text.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Outpost" ')).toBe(true);

    const document = new DOMParser({
      onError(level, message) {
        if (level !== "warning") throw new Error(message);
      },
    }).parseFromString(exported.text, "text/xml");
    const root = document.documentElement!;
    expect(root.namespaceURI).toBe("http://www.topografix.com/GPX/1/1");
    expect(root.getAttribute("version")).toBe("1.1");
    expect(root.getAttribute("creator")).toBe("Outpost");
    // Element order is fixed by the GPX schema: metadata, then (waypoints, routes,) tracks.
    expect(childNames(root)).toEqual(["metadata", "trk"]);
    const track = root.getElementsByTagName("trk")[0]!;
    expect(childNames(track)).toEqual(["name", "trkseg"]);
    expect(track.getElementsByTagName("name")[0]!.textContent).toBe('Tom & Ann\'s <"long"> day');
    expect(root.getElementsByTagName("metadata")[0]!.getElementsByTagName("name")[0]!.textContent).toBe('Tom & Ann\'s <"long"> day');

    const written = Array.from(track.getElementsByTagName("trkpt"));
    expect(written.map((point) => [point.getAttribute("lat"), point.getAttribute("lon")])).toEqual([
      ["47.123456", "-3.5"],
      // A very small number is still written as plain digits, never as "-1e-6".
      ["47.25", "-0.000001"],
      ["47.3", "1.25"],
    ]);
    // Heights where the terrain knows them, and nothing invented where it does not.
    expect(written.map((point) => childNames(point))).toEqual([["ele"], ["ele"], []]);
    const heights = written.slice(0, 2).map((point) => Number(point.getElementsByTagName("ele")[0]!.textContent));
    expect(Math.abs(heights[0]! - heightAt(47.123456, -3.5))).toBeLessThan(1);
    expect(Math.abs(heights[1]! - heightAt(47.25, -0.000001))).toBeLessThan(1);
    // A drawn route was never walked: no time anywhere, and none of Outpost's own bookkeeping.
    expect(exported.text).not.toMatch(/<time>|_profile|_drawn|_elevation|[0-9]e-?[0-9]/);

    // Outpost reads its own file back to the same line, as a track.
    const parsed = parseGpx(exported.text);
    expect(parsed.name).toBe('Tom & Ann\'s <"long"> day');
    expect(parsed.collection.features).toHaveLength(1);
    expect(parsed.collection.features[0]!.properties._gpxType).toBe("trk");
    expect(parsed.collection.features[0]!.geometry.coordinates).toEqual([
      [-3.5, 47.123456, heights[0]],
      [-0.000001, 47.25, heights[1]],
      [1.25, 47.3],
    ]);
  });

  it("goes into a combined export with places, and imports back as the same route", async () => {
    const created = await createRoute({ name: "Ridge plan", points: THREE_POINTS });
    await app.api("POST", "/api/maps/markers", { name: "Tiny offsets", lat: 0.00000004, lon: -0.0000002 });
    const combined = await getText(`/api/maps/export.gpx?markers=1&tracks=${created.body.track.id}`);
    expect(combined.status).toBe(200);
    expect(combined.text).toContain('<wpt lat="0" lon="-0.0000002">');
    expect(combined.text).not.toMatch(/[0-9]e-[0-9]/);
    expect(combined.text).toContain("<trk>\n    <name>Ridge plan</name>");

    const boundary = "----outpost-test-boundary";
    const payload = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="ridge-plan.gpx"\r\nContent-Type: application/gpx+xml\r\n\r\n`,
      ),
      Buffer.from((await getText(`/api/maps/tracks/${created.body.track.id}/export.gpx`)).text),
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const imported = await app.api<TrackImportResponse>("POST", "/api/maps/tracks/import", payload, {
      headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
    });
    expect(imported.status).toBe(200);
    expect(imported.body.track).toMatchObject({
      name: "Ridge plan",
      pointCount: 3,
      distanceMeters: created.body.track.distanceMeters,
      bounds: created.body.track.bounds,
    });
  });

  it("writes numbers as plain decimals", () => {
    expect(decimal(53.0685, 7)).toBe("53.0685");
    expect(decimal(-4, 7)).toBe("-4");
    expect(decimal(1e-7, 7)).toBe("0.0000001");
    expect(decimal(-4e-9, 7)).toBe("0");
    expect(decimal(1085.04, 2)).toBe("1085.04");
    expect(decimal(120, 2)).toBe("120");
    expect(decimal(Number.NaN, 2)).toBe("0");
  });
});

describe("changing the shape of a route", () => {
  const FIXTURE = fs.readFileSync(path.join(import.meta.dirname, "fixtures/maps/fairfield.gpx"), "utf8");

  it("replaces the points of a drawn route and works its figures out again", async () => {
    const created = await createRoute({ name: "First go", color: "amber", points: THREE_POINTS });
    const longer = [...THREE_POINTS, { lat: 53.04, lon: -4.0 }];
    const changed = await app.api<RouteSaveResponse>("PUT", `/api/maps/tracks/${created.body.track.id}/points`, { points: longer });
    expect(changed.status).toBe(200);
    expect(changed.body.track).toMatchObject({
      id: created.body.track.id,
      name: "First go",
      color: "amber",
      pointCount: 4,
      bounds: [-4.1, 53.04, -4.0, 53.085],
    });
    expect(changed.body.track.distanceMeters).toBeCloseTo(lengthOf(longer), 0);
    expect(changed.body.track.updatedAt).toBeGreaterThanOrEqual(created.body.track.updatedAt);
    const line = (await getTrack(created.body.track.id)).geojson.features[0] as { geometry: { coordinates: number[][] } };
    expect(line.geometry.coordinates).toHaveLength(4);
    expect((await app.api("GET", "/api/maps/tracks")).body.tracks).toHaveLength(1);
  });

  it("replaces an imported recording's lines with the new one and keeps its waypoints", async () => {
    const boundary = "----outpost-test-boundary";
    const payload = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="fairfield.gpx"\r\nContent-Type: application/gpx+xml\r\n\r\n`,
      ),
      Buffer.from(FIXTURE),
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const imported = await app.api<TrackImportResponse>("POST", "/api/maps/tracks/import", payload, {
      headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
    });
    const before = await getTrack(imported.body.track!.id);
    const waypoints = before.geojson.features.filter((feature) => (feature as { geometry: { type: string } }).geometry.type === "Point");
    expect(waypoints.length).toBeGreaterThan(0);
    expect(before.geojson.features.length - waypoints.length).toBeGreaterThan(1);
    expect(before.ascentMeters).not.toBeNull();

    const changed = await app.api<RouteSaveResponse>("PUT", `/api/maps/tracks/${before.id}/points`, { points: THREE_POINTS });
    expect(changed.status).toBe(200);
    // No terrain is installed, so the heights that came with the file are gone and nothing replaces them.
    expect(changed.body.elevation).toBe("none");
    expect(changed.body.track).toMatchObject({ name: before.name, sourceFilename: "fairfield.gpx", pointCount: 3, ascentMeters: null });
    const after = await getTrack(before.id);
    expect(after.geojson.features.slice(1)).toEqual(waypoints);
    expect(after.geojson.features[0]).toMatchObject({ properties: { _drawn: true }, geometry: { type: "LineString" } });
    // The bounds still take in the waypoints, which may lie off the new line.
    const [west, south, east, north] = after.bounds!;
    for (const waypoint of waypoints as Array<{ geometry: { coordinates: number[] } }>) {
      const [lon, lat] = waypoint.geometry.coordinates;
      expect(lon! >= west && lon! <= east && lat! >= south && lat! <= north).toBe(true);
    }
    // Search still finds it by the names of its waypoints.
    expect((await app.api("GET", "/api/search?q=fairfield")).body.results.length).toBeGreaterThan(0);
  });

  it("refuses bad points and unknown routes, and leaves the route as it was", async () => {
    const created = await createRoute({ name: "Keep me", points: THREE_POINTS });
    const url = `/api/maps/tracks/${created.body.track.id}/points`;
    expect((await app.api("PUT", url, { points: [THREE_POINTS[0]] })).status).toBe(400);
    expect((await app.api("PUT", url, {})).status).toBe(400);
    expect((await app.api("PUT", url, { points: [THREE_POINTS[0], { lat: -100, lon: 0 }] })).status).toBe(400);
    expect((await app.api("PUT", "/api/maps/tracks/no-such-track/points", { points: THREE_POINTS })).status).toBe(404);
    expect((await getTrack(created.body.track.id)).pointCount).toBe(3);
  });

  it("tells the browser when a route is drawn or reshaped", async () => {
    const events: string[] = [];
    const unsubscribe = app.ctx.events.subscribe((event) => events.push(event.type));
    const created = await createRoute({ name: "Announced", points: THREE_POINTS });
    await app.api("PUT", `/api/maps/tracks/${created.body.track.id}/points`, { points: THREE_POINTS.slice(0, 2) });
    unsubscribe();
    expect(events.filter((type) => type === "maps.changed")).toHaveLength(2);
  });
});
