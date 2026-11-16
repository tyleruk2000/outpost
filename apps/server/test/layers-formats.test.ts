/**
 * The reference layers' readers, each against a file in its publisher's own format made
 * here: coordinate systems, LZW and float GeoTIFFs as WorldPop writes them, `.osm.pbf`
 * as Geofabrik publishes it, and the tags each layer is drawn from.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { csvRecords } from "../src/modules/layers/adapters/csv.ts";
import { classifyOsm } from "../src/modules/layers/adapters/osm-tags.ts";
import { readPbf, wantedForLayers } from "../src/modules/layers/adapters/pbf.ts";
import {
  britishNationalGrid,
  CrsError,
  checkDegrees,
  crsFromName,
  geoJsonCrs,
  nationalGridToOsgb36,
  swissGrid,
  toWgs84,
} from "../src/modules/layers/crs.ts";
import { cellAreaKm2, openPopulationTiff, roundPeople } from "../src/modules/layers/population.ts";
import { containsPoint, sameName, simplifyGeometry } from "../src/modules/layers/store.ts";
import { lzwDecode } from "../src/modules/maps/imagery/lzw.ts";
import { buildPbf, buildTiff, lzwEncode } from "./fixtures/layers/builders.ts";

const scratch = () => fs.mkdtempSync(path.join(os.tmpdir(), "outpost-layers-"));

describe("coordinate systems", () => {
  it("projects the British National Grid back to OSGB36 as Ordnance Survey's worked example does", () => {
    // Ordnance Survey, "A guide to coordinate systems in Great Britain", annexe C.2: E 651409.903, N 313177.270
    // is OSGB36 52°39′27.2531″N 1°43′4.5177″E.
    const [phi, lambda] = nationalGridToOsgb36(651409.903, 313177.27);
    expect((phi * 180) / Math.PI).toBeCloseTo(52 + 39 / 60 + 27.2531 / 3600, 7);
    expect((lambda * 180) / Math.PI).toBeCloseTo(1 + 43 / 60 + 4.5177 / 3600, 7);
  });

  it("moves OSGB36 to WGS 84 by the published Helmert shift: some tens of metres to a little over a hundred in Great Britain", () => {
    const [phi, lambda] = nationalGridToOsgb36(651409.903, 313177.27);
    const [lon, lat] = britishNationalGrid(651409.903, 313177.27);
    const metres = Math.hypot((lat - (phi * 180) / Math.PI) * 111_000, (lon - (lambda * 180) / Math.PI) * 111_000 * Math.cos(phi));
    expect(metres).toBeGreaterThan(20);
    expect(metres).toBeLessThan(150);
  });

  it("converts Swiss LV95 by swisstopo's approximate formulas: the projection's origin in Bern is 46°57′03.9″N 7°26′19.1″E in WGS 84", () => {
    // (46°57′08.66″N 7°26′22.50″E is the same point on the Swiss datum, CH1903; the difference is the datum shift.)
    const [lon, lat] = swissGrid(2_600_000, 1_200_000)(2_600_000, 1_200_000);
    expect(lat).toBeCloseTo(46 + 57 / 60 + 3.9 / 3600, 4);
    expect(lon).toBeCloseTo(7 + 26 / 60 + 19.1 / 3600, 4);
  });

  it("reads a GeoJSON file's crs member, and refuses a system it does not convert rather than misplacing it", () => {
    expect(geoJsonCrs({ crs: { type: "name", properties: { name: "urn:ogc:def:crs:EPSG::2056" } } }).name).toMatch(/LV95/);
    expect(geoJsonCrs({ crs: { type: "name", properties: { name: "urn:ogc:def:crs:OGC:1.3:CRS84" } } }).name).toBe("WGS 84");
    expect(crsFromName("EPSG:3857").name).toMatch(/Mercator/);
    expect(() => crsFromName("EPSG:32633")).toThrow(CrsError);
    expect(() => crsFromName("EPSG:32633")).toThrow(/does not convert/);
  });

  it("says what is likely wrong with a position that is not degrees", () => {
    expect(checkDegrees(-0.12, 51.5)).toBeNull();
    expect(checkDegrees(530000, 180000)).toMatch(/metres/);
    expect(checkDegrees(120, 51)).toBeNull();
    expect(checkDegrees(51.5, 120)).toMatch(/wrong way round/);
    expect(() => toWgs84(crsFromName(null), 530000, 180000)).toThrow(CrsError);
  });
});

describe("GeoTIFF population grids as WorldPop writes them", () => {
  it("decodes TIFF LZW, including the code table filling and being cleared", () => {
    const input = new Uint8Array(40_000);
    for (let i = 0; i < input.length; i += 1) input[i] = (i * 7 + (i >> 5)) % 251;
    expect(Array.from(lzwDecode(lzwEncode(input), input.length))).toEqual(Array.from(input));
  });

  it("reads a BigTIFF of 32-bit floats, LZW with horizontal differencing, in EPSG:4326 with a nodata value", async () => {
    const width = 93;
    const height = 87;
    const values = new Float32Array(width * height);
    for (let i = 0; i < values.length; i += 1) values[i] = i % 13 === 0 ? -99999 : (i % 97) * 1.25;
    const dir = scratch();
    const file = path.join(dir, "lux_ppp_2020_1km_Aggregated_UNadj.tif");
    fs.writeFileSync(
      file,
      buildTiff({ width, height, values, originLon: 5.748749977638909, originLat: 50.182916651778896, pixel: 1 / 120, nodata: -99999 }),
    );
    const { cog, source } = await openPopulationTiff(file);
    try {
      expect(cog.images[0]).toMatchObject({ width, height, sampleFormat: 3, compression: 5, predictor: 2 });
      expect(cog.geo.epsg).toBe(4326);
      expect(cog.geo.nodata).toBe(-99999);
      const ref = cog.tilesFor(0, 0, 0, width, height)[0]!;
      const decoded = cog.decodeFloatTile(0, await source.read(ref.offset, ref.length));
      expect(Array.from(decoded.subarray(0, width * height))).toEqual(Array.from(values));
    } finally {
      await source.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("refuses a grid in another coordinate system", async () => {
    const dir = scratch();
    const file = path.join(dir, "projected.tif");
    fs.writeFileSync(
      file,
      buildTiff({ width: 4, height: 4, values: new Float32Array(16), originLon: 600000, originLat: 6600000, pixel: 1000, epsg: 3857 }),
    );
    await expect(openPopulationTiff(file)).rejects.toThrow(/EPSG:3857, not latitude and longitude/);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("works out cell areas and rounds sums to what the product supports", () => {
    // A 30 arc-second cell at the equator is about 0.926 km a side.
    expect(cellAreaKm2(0, 1 / 120)).toBeCloseTo(0.855, 2);
    expect(cellAreaKm2(60, 1 / 120)).toBeCloseTo(0.4275, 2);
    expect(roundPeople(123_456)).toBe(120_000);
    expect(roundPeople(987)).toBe(990);
    expect(roundPeople(7.4)).toBe(7);
  });
});

describe("OpenStreetMap", () => {
  it("puts objects in layers by their documented tags, and leaves out wartime bunkers and reactors inside a station", () => {
    expect(classifyOsm({ landuse: "military" })).toEqual({ layer: "military", kind: "landuse=military" });
    expect(classifyOsm({ landuse: "military", military: "airfield" })).toEqual({ layer: "military", kind: "military=airfield" });
    expect(classifyOsm({ power: "plant", "plant:source": "nuclear" })).toEqual({ layer: "nuclear", kind: "plant:source=nuclear" });
    expect(classifyOsm({ power: "generator", "generator:source": "nuclear" })).toBeNull();
    expect(classifyOsm({ military: "bunker" })).toBeNull();
    expect(classifyOsm({ military: "bunker", bunker_type: "nuclear" })).toEqual({ layer: "shelters", kind: "bunker_type=nuclear" });
    expect(classifyOsm({ amenity: "shelter", shelter_type: "bomb_shelter" })?.layer).toBe("shelters");
    expect(classifyOsm({ amenity: "shelter", shelter_type: "picnic_shelter" })).toBeNull();
    expect(classifyOsm({ emergency: "assembly_point" })?.layer).toBe("shelters");
    expect(classifyOsm({ healthcare: "hospital" })?.layer).toBe("hospitals");
    expect(classifyOsm({ emergency: "ambulance_station" })?.layer).toBe("emergency");
    expect(classifyOsm({ name: "Air Base" })).toBeNull();
  });

  it("reads an .osm.pbf extract: tagged nodes, ways with their nodes' positions, and the outer ways of a relation", async () => {
    const dir = scratch();
    const file = path.join(dir, "liechtenstein-latest.osm.pbf");
    fs.writeFileSync(
      file,
      buildPbf({
        timestamp: Date.UTC(2026, 10, 15, 20, 21, 2) / 1000,
        nodes: [
          { id: 1, lat: 47.14, lon: 9.52, tags: { amenity: "hospital", name: "Landesspital" } },
          { id: 2, lat: 47.1, lon: 9.5 },
          { id: 3, lat: 47.1, lon: 9.51 },
          { id: 4, lat: 47.11, lon: 9.51 },
          { id: 5, lat: 47.11, lon: 9.5 },
          { id: 6, lat: 47.2, lon: 9.55, tags: { amenity: "bench" } },
          { id: 7, lat: 47.05, lon: 9.6 },
          { id: 8, lat: 47.06, lon: 9.61 },
          { id: 9, lat: 47.12, lon: 9.53, tags: { military: "bunker", bunker_type: "nuclear", name: "Schutzraum" } },
        ],
        ways: [
          { id: 100, refs: [2, 3, 4, 5, 2], tags: { landuse: "military", name: "Übungsplatz" } },
          { id: 101, refs: [7, 8] },
          { id: 102, refs: [3, 4], tags: { highway: "track" } },
          { id: 103, refs: [999, 998], tags: { amenity: "police" } },
        ],
        relations: [{ id: 500, members: [{ ref: 101, role: "outer" }], tags: { type: "multipolygon", military: "range" } }],
      }),
    );
    const found: Array<{ type: string; id: number; lat: number; lon: number; points?: unknown; lines?: unknown }> = [];
    const skipped: string[] = [];
    let timestamp: string | null = null;
    await readPbf(file, {
      wanted: wantedForLayers,
      onObject: async (object) => {
        found.push(object);
      },
      onSkip: (reason) => skipped.push(reason),
      onHeader: (header) => {
        timestamp = header.timestamp;
      },
    });
    expect(timestamp).toBe("2026-11-15T20:21:02.000Z");
    expect(found.map((object) => `${object.type}/${object.id}`).sort()).toEqual(["node/1", "node/9", "relation/500", "way/100"]);
    const way = found.find((object) => object.id === 100)!;
    expect(way.points).toHaveLength(5);
    expect(way.lat).toBeCloseTo(47.105, 6);
    expect(found.find((object) => object.id === 500)!.lines).toEqual([
      [
        [9.6, 47.05],
        [9.61, 47.06],
      ],
    ]);
    // A way whose nodes the extract cut off is said, not drawn.
    expect(skipped).toEqual(["way/103 is missing the points it is made of (the extract cut it off)."]);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("refuses a file that is not a PBF extract, and a damaged one", async () => {
    const dir = scratch();
    const text = path.join(dir, "not.osm.pbf");
    fs.writeFileSync(text, "<osm version='0.6'></osm>");
    await expect(readPbf(text, { wanted: wantedForLayers, onObject: async () => {}, onSkip: () => {} })).rejects.toThrow(
      /not an OpenStreetMap PBF file/,
    );
    const whole = buildPbf({ nodes: [{ id: 1, lat: 1, lon: 1, tags: { amenity: "hospital" } }], ways: [], relations: [] });
    const cut = path.join(dir, "cut.osm.pbf");
    fs.writeFileSync(cut, whole.subarray(0, whole.length - 20));
    await expect(readPbf(cut, { wanted: wantedForLayers, onObject: async () => {}, onSkip: () => {} })).rejects.toThrow(/damaged/);
    const history = path.join(dir, "history.osm.pbf");
    fs.writeFileSync(history, buildPbf({ nodes: [], ways: [], relations: [], features: ["OsmSchema-V0.6", "LocationsOnWays"] }));
    await expect(readPbf(history, { wanted: wantedForLayers, onObject: async () => {}, onSkip: () => {} })).rejects.toThrow(
      /LocationsOnWays/,
    );
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe("geometry", () => {
  it("compares names for being the same thing", () => {
    expect(sameName("Sizewell B", "Sizewell B nuclear power station")).toBe(true);
    expect(sameName("Sizewell A", "Sizewell B")).toBe(false);
    expect(sameName("Centrale nucléaire de Cattenom", "Centrale nucleaire de Cattenom")).toBe(true);
    expect(sameName("Hinkley Point", "Hinkley Point C")).toBe(true);
    expect(sameName("", "Anything")).toBe(false);
  });

  it("simplifies a shape to the view's scale and tests whether a point is inside it", () => {
    const ring = [
      [0, 0],
      [1, 0.0001],
      [2, 0],
      [2, 2],
      [0, 2],
      [0, 0],
    ];
    const simple = simplifyGeometry({ type: "Polygon", coordinates: [ring] }, 0.01)!;
    expect((simple.coordinates as number[][][])[0]).toHaveLength(5);
    expect(simplifyGeometry({ type: "Polygon", coordinates: [ring] }, 5)).toBeNull();
    expect(containsPoint({ type: "Polygon", coordinates: [ring] }, 1, 1)).toBe(true);
    expect(containsPoint({ type: "Polygon", coordinates: [ring] }, 3, 1)).toBe(false);
  });
});

describe("reading a CSV file that cannot be read", () => {
  it("fails the reading, rather than ending the process", async () => {
    const read = async () => {
      for await (const _ of csvRecords(path.join(os.tmpdir(), "outpost-no-such-folder", "figures.csv"))) {
        // Nothing to read.
      }
    };
    await expect(read()).rejects.toMatchObject({ code: "ENOENT" });
  });
});

describe("names looked up in a table", () => {
  it("are never read from what every object has", async () => {
    const { kindLabel } = await import("../src/modules/layers/kinds.ts");
    const { licenseUrlOf } = await import("../src/modules/layers/store.ts");
    const { serviceLabel } = await import("../src/modules/network/announcements.ts");
    for (const name of ["constructor", "__proto__", "toString"]) {
      expect(kindLabel(name)).toBe(name);
      expect(licenseUrlOf(name)).toBeNull();
      expect(serviceLabel(name)).toBe(name);
      expect(serviceLabel(`${name}._tcp.local`)).toBe(`${name}._tcp.local`);
    }
  });
});
