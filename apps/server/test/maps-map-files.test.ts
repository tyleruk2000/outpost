import type { MapFilePreview, TrackImportResponse, TrackWithGeometryDto } from "@outpost/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readGeoJson } from "../src/modules/maps/geojson-reader.ts";
import { trackStats } from "../src/modules/maps/gpx.ts";
import { readKml } from "../src/modules/maps/kml-reader.ts";
import { MAP_FILE_LIMITS, plainText } from "../src/modules/maps/map-file-limits.ts";
import { mapFileFormat } from "../src/modules/maps/map-files.ts";
import { buildZip, multipart } from "./fixtures/documents/builders.ts";
import { createTestApp, type TestApp } from "./helpers.ts";

const KML = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:gx="http://www.google.com/kml/ext/2.2">
  <Document>
    <name>Lakes weekend</name>
    <description>Two days round Grasmere</description>
    <Folder>
      <name>Not the file's name</name>
      <Placemark>
        <name>Car park</name>
        <description><![CDATA[<p>Pay &amp; display<br/>Opens at 8</p>]]></description>
        <Point><coordinates>-3.0235,54.4589,64</coordinates></Point>
      </Placemark>
      <Placemark>
        <name>Fairfield horseshoe</name>
        <LineString><coordinates>
          -2.962,54.432,100 -2.97,54.44,300
          -2.98, 54.45, 500
        </coordinates></LineString>
      </Placemark>
      <Placemark>
        <name>Access land</name>
        <Polygon>
          <outerBoundaryIs><LinearRing><coordinates>-3.0,54.4 -3.1,54.4 -3.1,54.5 -3.0,54.5 -3.0,54.4</coordinates></LinearRing></outerBoundaryIs>
          <innerBoundaryIs><LinearRing><coordinates>-3.05,54.45 -3.06,54.45 -3.06,54.46</coordinates></LinearRing></innerBoundaryIs>
        </Polygon>
      </Placemark>
      <Placemark>
        <name>Recorded</name>
        <gx:Track><when>2026-11-01T10:00:00Z</when><gx:coord>-3.01 54.41 90</gx:coord><gx:coord>-3.02 54.42 95</gx:coord></gx:Track>
      </Placemark>
      <Placemark>
        <name>Two summits</name>
        <MultiGeometry>
          <Point><coordinates>-3.01,54.49</coordinates></Point>
          <Point><coordinates>-3.02,54.50</coordinates></Point>
        </MultiGeometry>
        <ExtendedData><Data name="name"><value>ignored</value></Data></ExtendedData>
      </Placemark>
      <NetworkLink><Link><href>http://example.invalid/more.kml</href></Link></NetworkLink>
    </Folder>
  </Document>
</kml>`;

const GEOJSON = JSON.stringify({
  type: "FeatureCollection",
  name: "Council paths",
  features: [
    { type: "Feature", properties: { name: "Bench" }, geometry: { type: "Point", coordinates: [-1.5, 53.8] } },
    {
      type: "Feature",
      properties: { title: "Riverside path", description: "Surfaced" },
      geometry: {
        type: "LineString",
        coordinates: [
          [-1.5, 53.8],
          [-1.51, 53.81],
        ],
      },
    },
    {
      type: "Feature",
      properties: { NAME: "Park" },
      geometry: {
        type: "MultiPolygon",
        coordinates: [
          [
            [
              [-1.5, 53.8],
              [-1.6, 53.8],
              [-1.6, 53.9],
            ],
          ],
          [
            [
              [-1.4, 53.7],
              [-1.41, 53.7],
              [-1.41, 53.71],
              [-1.4, 53.7],
            ],
          ],
        ],
      },
    },
    {
      type: "Feature",
      properties: null,
      geometry: {
        type: "GeometryCollection",
        geometries: [
          {
            type: "MultiPoint",
            coordinates: [
              [-1.2, 53.1],
              [500, 900],
            ],
          },
        ],
      },
    },
  ],
});

describe("reading KML", () => {
  it("reads points as places, lines and tracks as lines, polygons as outlines", () => {
    const parsed = readKml(KML);
    expect(parsed.name).toBe("Lakes weekend");
    expect(parsed.description).toBe("Two days round Grasmere");
    expect(parsed.lines).toBe(2);
    expect(parsed.outlines).toBe(1);
    expect(parsed.waypoints).toBe(3);

    const [line, track, outline, carPark] = parsed.collection.features;
    expect(line?.properties.name).toBe("Fairfield horseshoe");
    expect(line?.geometry).toEqual({
      type: "LineString",
      coordinates: [
        [-2.962, 54.432, 100],
        [-2.97, 54.44, 300],
        [-2.98, 54.45, 500],
      ],
    });
    expect(track?.geometry).toEqual({
      type: "LineString",
      coordinates: [
        [-3.01, 54.41, 90],
        [-3.02, 54.42, 95],
      ],
    });
    expect(outline?.properties).toMatchObject({ name: "Access land", _outline: true });
    // Two rings; the inner one left open by its writer is closed.
    expect(outline?.geometry.type).toBe("MultiLineString");
    const rings = (outline!.geometry as { coordinates: number[][][] }).coordinates;
    expect(rings[1]?.at(-1)).toEqual(rings[1]?.[0]);
    expect(carPark?.properties).toEqual({ name: "Car park", desc: "Pay & display\nOpens at 8" });
    expect(carPark?.geometry).toEqual({ type: "Point", coordinates: [-3.0235, 54.4589, 64] });
  });

  it("refuses what is not KML, and declarations", () => {
    expect(() => readKml("<gpx></gpx>")).toThrow(/not KML/);
    expect(() => readKml("<kml><Placemark>")).toThrow(/not well-formed/);
    expect(() => readKml("<kml><Document><name>Empty</name></Document></kml>")).toThrow(/no points, lines or outlines/);
  });

  it("stops at its limits", () => {
    const point = "<Placemark><Point><coordinates>1,2</coordinates></Point></Placemark>";
    expect(() => readKml(`<kml>${point.repeat(MAP_FILE_LIMITS.places + 1)}</kml>`)).toThrow(/more than 20,000 points/);
    const line = "<Placemark><LineString><coordinates>1,2 1,3</coordinates></LineString></Placemark>";
    expect(() => readKml(`<kml>${line.repeat(MAP_FILE_LIMITS.lines + 1)}</kml>`)).toThrow(/more than 10,000 lines/);
  });
});

describe("reading GeoJSON", () => {
  it("reads every kind of geometry, and names from the usual properties", () => {
    const parsed = readGeoJson(GEOJSON);
    expect(parsed).toMatchObject({ name: "Council paths", lines: 1, outlines: 1, waypoints: 2 });
    const [line, outline, bench, other] = parsed.collection.features;
    expect(line?.properties).toEqual({ name: "Riverside path", desc: "Surfaced" });
    expect(outline?.properties).toEqual({ name: "Park", _outline: true });
    expect((outline!.geometry as { coordinates: number[][][] }).coordinates).toHaveLength(2);
    expect(bench?.properties.name).toBe("Bench");
    // The position nowhere on Earth is dropped.
    expect(other?.geometry).toEqual({ type: "Point", coordinates: [-1.2, 53.1] });
  });

  it("leaves outlines out of the distance but not out of the extent", () => {
    const parsed = readGeoJson(GEOJSON);
    const stats = trackStats({
      type: "FeatureCollection",
      features: parsed.collection.features.filter((f) => f.geometry.type !== "Point"),
    });
    const lineOnly = trackStats({ type: "FeatureCollection", features: [parsed.collection.features[0]!] });
    expect(stats.distanceMeters).toBe(lineOnly.distanceMeters);
    expect(stats.bounds).toEqual([-1.6, 53.7, -1.4, 53.9]);
    expect(stats.pointCount).toBe(2 + 4 + 4);
  });

  it("refuses another coordinate system, and positions in metres", () => {
    const grid = { type: "FeatureCollection", crs: { type: "name", properties: { name: "urn:ogc:def:crs:EPSG::27700" } }, features: [] };
    expect(() => readGeoJson(JSON.stringify(grid))).toThrow(/another coordinate system \(urn:ogc:def:crs:EPSG::27700\)/);
    const wgs = { ...grid, crs: { type: "name", properties: { name: "urn:ogc:def:crs:OGC:1.3:CRS84" } }, features: [GEOJSON_POINT] };
    expect(readGeoJson(JSON.stringify(wgs)).waypoints).toBe(1);
    const metres = { type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [430000, 433000] } };
    expect(() => readGeoJson(JSON.stringify(metres))).toThrow(/not longitude and latitude/);
  });

  it("counts brackets before parsing anything", () => {
    expect(() => readGeoJson("[".repeat(MAP_FILE_LIMITS.depth + 1))).toThrow(/nests/);
    expect(() => readGeoJson(`[${"[],".repeat(MAP_FILE_LIMITS.jsonContainers)}[]]`)).toThrow(/more than Outpost reads at once/);
    // Brackets inside strings are text.
    expect(readGeoJson(JSON.stringify({ ...GEOJSON_POINT, properties: { name: "[[[[".repeat(100) } })).waypoints).toBe(1);
    expect(() => readGeoJson("{not json")).toThrow(/not valid JSON/);
    expect(() => readGeoJson('{"type":"Topology"}')).toThrow(/not GeoJSON/);
  });
});

const GEOJSON_POINT = { type: "Feature", properties: { name: "Here" }, geometry: { type: "Point", coordinates: [-1, 52] } };

describe("telling formats apart", () => {
  it("goes by the name, then by the first bytes", () => {
    expect(mapFileFormat("a.KML", Buffer.from(""))).toBe("kml");
    expect(mapFileFormat("a.json", Buffer.from(""))).toBe("geojson");
    expect(mapFileFormat("download", Buffer.from("PK\u0003\u0004"))).toBe("kmz");
    expect(mapFileFormat("download", Buffer.from('﻿  {"type":"Feature"}'))).toBe("geojson");
    expect(mapFileFormat("download", Buffer.from('<?xml version="1.0"?><kml xmlns="x">'))).toBe("kml");
    expect(mapFileFormat("download", Buffer.from("<gpx version='1.1'>"))).toBe("gpx");
    expect(mapFileFormat("notes.txt", Buffer.from("hello"))).toBeUndefined();
  });

  it("makes descriptions plain text", () => {
    expect(plainText("<b>Bold</b>&nbsp;and <i>more</i><br>next")).toBe("Bold and more\nnext");
  });

  it("reads a name of unclosed angle brackets in a moment", () => {
    // A GeoJSON name is not capped before it is made plain; each unclosed "<" once sent
    // the search to the end of the text.
    const started = performance.now();
    plainText("<".repeat(200_000));
    plainText("<br".repeat(100_000));
    expect(performance.now() - started).toBeLessThan(2000);
  });
});

describe("importing map files", () => {
  let app: TestApp;
  beforeEach(async () => {
    app = await createTestApp();
  });
  afterEach(async () => {
    await app.close();
  });

  const send = (url: string, name: string, content: string | Buffer, fields: Record<string, string> = {}) => {
    const { payload, headers } = multipart(fields, [{ name, content }]);
    return app.api<TrackImportResponse & MapFilePreview & { error?: { message: string } }>("POST", url, payload, { headers });
  };

  it("says what a file would make, and saves nothing", async () => {
    const preview = await send("/api/maps/files/preview", "lakes.kml", KML);
    expect(preview.status).toBe(200);
    expect(preview.body).toEqual({ format: "kml", name: "Lakes weekend", points: 3, lines: 2, outlines: 1, linePoints: 3 + 2 + 5 + 4 });
    expect((await app.api("GET", "/api/maps/tracks")).body.tracks).toEqual([]);
    expect((await app.api("GET", "/api/maps/markers")).body.markers).toEqual([]);
  });

  it("imports KML as one new route and new places, beside what is there", async () => {
    const before = await app.api("POST", "/api/maps/markers", { name: "Home", lat: 54, lon: -3 });
    expect(before.status).toBe(200);
    const first = await send("/api/maps/files/import", "lakes.kml", KML, { color: "violet" });
    expect(first.status).toBe(200);
    expect(first.body.track).toMatchObject({
      name: "Lakes weekend",
      description: "Two days round Grasmere",
      color: "violet",
      sourceFilename: "lakes.kml",
    });
    expect(first.body.outlines).toBe(1);
    expect(first.body.markers.map((marker) => marker.name)).toEqual(["Car park", "Two summits", "Two summits"]);
    expect(first.body.markers[0]?.note).toBe("Pay & display\nOpens at 8");

    const track = (await app.api<{ track: TrackWithGeometryDto }>("GET", `/api/maps/tracks/${first.body.track!.id}`)).body.track;
    expect(track.geojson.features).toHaveLength(3);
    // Reshaping the route's line keeps its outline.
    const reshaped = await app.api("PUT", `/api/maps/tracks/${track.id}/points`, {
      points: [
        { lat: 54.43, lon: -2.96 },
        { lat: 54.44, lon: -2.97 },
      ],
    });
    expect(reshaped.status).toBe(200);
    const after = (await app.api<{ track: TrackWithGeometryDto }>("GET", `/api/maps/tracks/${track.id}`)).body.track;
    expect(after.geojson.features.filter((feature) => (feature as { properties: { _outline?: true } }).properties._outline)).toHaveLength(
      1,
    );
    // The same file again makes another of each; nothing is replaced.
    await send("/api/maps/files/import", "lakes.kml", KML);
    expect((await app.api("GET", "/api/maps/tracks")).body.tracks).toHaveLength(2);
    expect((await app.api("GET", "/api/maps/markers")).body.markers).toHaveLength(7);
  });

  it("opens a KMZ and reads its doc.kml", async () => {
    const kmz = await buildZip([
      { name: "files/other.kml", content: "<kml><Placemark><Point><coordinates>9,9</coordinates></Point></Placemark></kml>" },
      { name: "doc.kml", content: KML },
      { name: "files/picture.png", content: Buffer.from([1, 2, 3]) },
    ]);
    const preview = await send("/api/maps/files/preview", "lakes.kmz", kmz);
    expect(preview.body).toMatchObject({ format: "kmz", name: "Lakes weekend", points: 3 });
    const empty = await buildZip([{ name: "readme.txt", content: "no map here" }]);
    const refused = await send("/api/maps/files/preview", "empty.kmz", empty);
    expect(refused.status).toBe(400);
    expect(refused.body.error?.message).toMatch(/holds no KML document/);
    const broken = await send("/api/maps/files/preview", "broken.kmz", Buffer.from("PK not really"));
    expect(broken.status).toBe(400);
  });

  it("refuses a KMZ whose KML unpacks to more than the limit", async () => {
    const big = `<kml><Document><name>${"x".repeat(21 * 1024 * 1024)}</name></Document></kml>`;
    const kmz = await buildZip([{ name: "doc.kml", content: big }]);
    expect(kmz.length).toBeLessThan(1024 * 1024);
    const refused = await send("/api/maps/files/preview", "big.kmz", kmz);
    expect(refused.status).toBe(400);
    expect(refused.body.error?.message).toMatch(/larger than 20 MB once unpacked/);
  });

  it("imports GeoJSON, with a file of points alone making places and no route", async () => {
    const result = await send("/api/maps/files/import", "paths.geojson", GEOJSON);
    expect(result.status).toBe(200);
    expect(result.body.track?.name).toBe("Council paths");
    expect(result.body.markers).toHaveLength(2);
    const points = await send(
      "/api/maps/files/import",
      "benches.json",
      JSON.stringify({ type: "FeatureCollection", features: [GEOJSON_POINT] }),
    );
    expect(points.body.track).toBeNull();
    expect(points.body.markers.map((marker) => marker.name)).toEqual(["Here"]);
  });

  it("keeps a GPX file's waypoints on its route unless asked", async () => {
    const gpx =
      '<gpx xmlns="http://www.topografix.com/GPX/1/1"><wpt lat="54" lon="-3"><name>Top</name></wpt><rte><rtept lat="54" lon="-3"/><rtept lat="54.1" lon="-3"/></rte></gpx>';
    const kept = await send("/api/maps/files/import", "walk.gpx", gpx);
    expect(kept.body.markers).toEqual([]);
    const asPlaces = await send("/api/maps/files/import", "walk.gpx", gpx, { importWaypointsAsMarkers: "1" });
    expect(asPlaces.body.markers.map((marker) => marker.name)).toEqual(["Top"]);
    expect((await send("/api/maps/files/preview", "walk.gpx", gpx)).body).toMatchObject({
      format: "gpx",
      points: 1,
      lines: 1,
      outlines: 0,
    });
  });

  it("refuses files it cannot read, and says why", async () => {
    const other = await send("/api/maps/files/import", "notes.txt", "hello");
    expect(other.status).toBe(400);
    expect(other.body.error?.message).toMatch(/GPX, KML, KMZ or GeoJSON/);
    const doctype = await send("/api/maps/files/import", "bad.kml", '<!DOCTYPE kml [<!ENTITY a "a">]><kml/>');
    expect(doctype.body.error?.message).toMatch(/DOCTYPE/);
    const tooBig = await send("/api/maps/files/import", "huge.geojson", Buffer.alloc(20 * 1024 * 1024 + 1, 0x20));
    expect(tooBig.status).toBe(413);
  });
});
