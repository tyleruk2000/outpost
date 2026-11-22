import fs from "node:fs";
import path from "node:path";
import { haversineMeters, type MarkerDto, type TrackDto, type TrackImportResponse, type TrackWithGeometryDto } from "@outpost/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildGpx, escapeXml, parseGpx, splitCollection, trackStats } from "../src/modules/maps/gpx.ts";
import { createTestApp, type TestApp } from "./helpers.ts";
import { threadMs } from "./thread-time.ts";

const FIXTURE = fs.readFileSync(path.join(import.meta.dirname, "fixtures/maps/fairfield.gpx"), "utf8");

/** The fixture's lines, as [lat, lon] lists, to work out the expected length independently. */
const ROUTE: Array<[number, number]> = [
  [54.432, -2.962],
  [54.448, -2.98],
  [54.456, -3.02],
];
const SEGMENT_ONE: Array<[number, number]> = [
  [54.432, -2.962],
  [54.44, -2.97],
  [54.45, -2.98],
  [54.46, -2.985],
  [54.47, -2.99],
  [54.4972, -2.9921],
];
const SEGMENT_TWO: Array<[number, number]> = [
  [54.4972, -2.9921],
  [54.48, -2.96],
  [54.46, -2.95],
  [54.432, -2.962],
];
const lengthOf = (line: Array<[number, number]>) =>
  line.slice(1).reduce((sum, point, index) => sum + haversineMeters(line[index]![0], line[index]![1], point[0], point[1]), 0);
const EXPECTED_DISTANCE = lengthOf(ROUTE) + lengthOf(SEGMENT_ONE) + lengthOf(SEGMENT_TWO);

let app: TestApp;
beforeEach(async () => {
  app = await createTestApp();
});
afterEach(async () => {
  await app.close();
});

/** A multipart/form-data body with one file and some plain fields. */
function multipart(file: { name: string; content: string | Buffer; type?: string } | undefined, fields: Record<string, string> = {}) {
  const boundary = "----outpost-test-boundary";
  const parts: Buffer[] = [];
  for (const [name, value] of Object.entries(fields)) {
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`));
  }
  if (file) {
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${file.name}"\r\nContent-Type: ${file.type ?? "application/gpx+xml"}\r\n\r\n`,
      ),
      Buffer.isBuffer(file.content) ? file.content : Buffer.from(file.content),
      Buffer.from("\r\n"),
    );
  }
  parts.push(Buffer.from(`--${boundary}--\r\n`));
  return { payload: Buffer.concat(parts), headers: { "content-type": `multipart/form-data; boundary=${boundary}` } };
}

async function importGpx(content: string | Buffer, name = "fairfield.gpx", fields: Record<string, string> = {}, query = "") {
  const { payload, headers } = multipart({ name, content }, fields);
  return app.api<TrackImportResponse & { error?: { code: string; message: string } }>("POST", `/api/maps/tracks/import${query}`, payload, {
    headers,
  });
}

async function getText(url: string) {
  const response = await app.app.inject({ method: "GET", url, headers: { host: "localhost" } });
  return { status: response.statusCode, text: response.body, headers: response.headers };
}

describe("markers", () => {
  it("can be created, changed, listed and removed", async () => {
    const created = await app.api<{ marker: MarkerDto }>("POST", "/api/maps/markers", {
      name: "  Black Sail Hut ",
      note: "Unlocked porch. Water from the beck.",
      lat: 54.4973,
      lon: -3.2466,
      color: "amber",
    });
    expect(created.status).toBe(200);
    const marker = created.body.marker;
    expect(marker).toMatchObject({
      name: "Black Sail Hut",
      note: "Unlocked porch. Water from the beck.",
      lat: 54.4973,
      lon: -3.2466,
      color: "amber",
      isFavorite: false,
      noteId: null,
    });
    expect(marker.id).toMatch(/^[0-9a-z]{26}$/);

    const second = (await app.api<{ marker: MarkerDto }>("POST", "/api/maps/markers", { name: "Trailhead", lat: 54.5, lon: -3.1 })).body
      .marker;
    expect(second).toMatchObject({ color: "teal", note: "" });

    const patched = await app.api<{ marker: MarkerDto }>("PATCH", `/api/maps/markers/${second.id}`, {
      isFavorite: true,
      color: "violet",
      note: "Park on the verge",
      noteId: "note-123",
      lat: 54.51,
    });
    expect(patched.body.marker).toMatchObject({
      name: "Trailhead",
      isFavorite: true,
      color: "violet",
      note: "Park on the verge",
      noteId: "note-123",
      lat: 54.51,
      lon: -3.1,
    });
    expect(patched.body.marker.updatedAt).toBeGreaterThanOrEqual(second.updatedAt);

    // Favourites first.
    const list = await app.api<{ markers: MarkerDto[] }>("GET", "/api/maps/markers");
    expect(list.body.markers.map((entry) => entry.name)).toEqual(["Trailhead", "Black Sail Hut"]);
    expect((await app.api("GET", "/api/maps/overview")).body.counts).toMatchObject({ markers: 2, tracks: 0 });

    expect((await app.api("DELETE", `/api/maps/markers/${marker.id}`)).body).toEqual({ ok: true });
    expect((await app.api("DELETE", `/api/maps/markers/${marker.id}`)).status).toBe(404);
    expect((await app.api("PATCH", "/api/maps/markers/nope", { name: "x" })).status).toBe(404);
    expect((await app.api<{ markers: MarkerDto[] }>("GET", "/api/maps/markers")).body.markers).toHaveLength(1);
  });

  it("refuses positions and colours that cannot be", async () => {
    const cases: Array<[Record<string, unknown>, RegExp]> = [
      [{ name: "x", lat: 91, lon: 0 }, /Latitude must be between -90 and 90/],
      [{ name: "x", lat: 0, lon: -181 }, /Longitude must be between -180 and 180/],
      [{ name: "x", lat: "54", lon: 0 }, /lat/],
      [{ name: "", lat: 1, lon: 1 }, /Give the marker a name/],
      [{ name: "x", lat: 1, lon: 1, color: "pink" }, /teal, amber, red, green, blue, violet, slate/],
      [{ lat: 1, lon: 1 }, /name/],
    ];
    for (const [payload, message] of cases) {
      const { status, body } = await app.api("POST", "/api/maps/markers", payload);
      expect(status, JSON.stringify(payload)).toBe(400);
      expect(body.error.message).toMatch(message);
    }
    const marker = (await app.api("POST", "/api/maps/markers", { name: "ok", lat: 1, lon: 1 })).body.marker;
    expect((await app.api("PATCH", `/api/maps/markers/${marker.id}`, { lat: -100 })).status).toBe(400);
  });

  it("are found by the app-wide search, by name and by note", async () => {
    const marker = (
      await app.api("POST", "/api/maps/markers", {
        name: "Black Sail Hut",
        note: "Unlocked porch and a spring behind the building",
        lat: 54.4973,
        lon: -3.2466,
      })
    ).body.marker;
    const byName = await app.ctx.services.search.search({ q: "black sail" });
    expect(byName.results[0]).toMatchObject({
      kind: "marker",
      entityId: marker.id,
      title: "Black Sail Hut",
      url: `/maps?marker=${marker.id}`,
      subtitle: "54.49730, -3.24660",
    });
    const byNote = await app.ctx.services.search.search({ q: "spring behind", kinds: ["marker"] });
    expect(byNote.results.map((result) => result.entityId)).toEqual([marker.id]);

    await app.api("PATCH", `/api/maps/markers/${marker.id}`, { name: "Ennerdale bothy", note: "" });
    expect((await app.ctx.services.search.search({ q: "black sail" })).results).toEqual([]);
    expect((await app.ctx.services.search.search({ q: "ennerdale" })).results[0]).toMatchObject({ entityId: marker.id });
    await app.api("DELETE", `/api/maps/markers/${marker.id}`);
    expect((await app.ctx.services.search.search({ q: "ennerdale" })).results).toEqual([]);
  });
});

describe("reading GPX", () => {
  it("turns tracks, routes and waypoints into GeoJSON", () => {
    const parsed = parseGpx(FIXTURE);
    expect(parsed).toMatchObject({
      name: "Fairfield Horseshoe",
      description: 'A round from Ambleside & back, with a "short cut" <if needed>',
      lines: 2,
      waypoints: 2,
    });
    const byType = (type: string) => parsed.collection.features.filter((feature) => feature.geometry.type === type);
    const [track] = byType("MultiLineString");
    expect(track!.properties).toMatchObject({ name: "Fairfield Horseshoe", desc: "Recorded on the day", _gpxType: "trk" });
    expect(track!.geometry.coordinates).toHaveLength(2);
    expect((track!.geometry.coordinates as number[][][])[0]![0]).toEqual([-2.962, 54.432, 55]);
    const times = track!.properties.coordinateProperties!.times as string[][];
    expect(times[0]![0]).toBe("2026-06-14T08:05:00Z");
    expect(times[1]).toHaveLength(4);

    const [route] = byType("LineString");
    expect(route!.properties).toEqual({ name: "Low-level alternative", _gpxType: "rte" });
    expect(route!.geometry.coordinates).toEqual([
      [-2.962, 54.432],
      [-2.98, 54.448],
      [-3.02, 54.456],
    ]);

    const waypoints = byType("Point");
    expect(waypoints[0]).toMatchObject({
      properties: { name: "Car park", desc: "Rydal Road, pay & display", sym: "Parking Area", time: "2026-06-14T08:00:00Z" },
      geometry: { coordinates: [-2.962, 54.432, 55] },
    });
    expect(waypoints[1]!.properties).toEqual({ name: "Fairfield summit" });
  });

  it("measures length, climb, points and extent", () => {
    const stats = trackStats(parseGpx(FIXTURE).collection);
    expect(stats.distanceMeters).toBeCloseTo(EXPECTED_DISTANCE, 0);
    expect(stats.distanceMeters).toBeGreaterThan(19_000);
    // 55→180 (+125), 181.5 is noise, →400 (+220), 398 is noise, →873 (+473); then 620→640 (+20).
    expect(stats.ascentMeters).toBe(838);
    expect(stats.pointCount).toBe(13);
    expect(stats.bounds).toEqual([-3.02, 54.432, -2.95, 54.4972]);

    const flat = parseGpx(
      '<gpx xmlns="http://www.topografix.com/GPX/1/1"><trk><trkseg><trkpt lat="1" lon="1"/><trkpt lat="1" lon="1.001"/></trkseg></trk></gpx>',
    );
    expect(trackStats(flat.collection)).toMatchObject({ ascentMeters: null, pointCount: 2 });
    expect(trackStats(flat.collection).distanceMeters).toBeCloseTo(111.2, 0);

    // A receiver standing still wobbles by a metre or two; that is not a climb.
    const jitter = Array.from(
      { length: 200 },
      (_, i) => `<trkpt lat="54.${4000 + i}" lon="-3"><ele>${100 + (i % 2) * 2}</ele></trkpt>`,
    ).join("");
    expect(trackStats(parseGpx(`<gpx><trk><trkseg>${jitter}</trkseg></trk></gpx>`).collection).ascentMeters).toBe(0);
  });

  it("refuses hostile or unusable XML", () => {
    const billionLaughs = `<?xml version="1.0"?>
<!DOCTYPE lolz [
  <!ENTITY lol "lol">
  <!ENTITY lol2 "&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;">
  <!ENTITY lol3 "&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;">
]>
<gpx><trk><name>&lol3;</name><trkseg><trkpt lat="1" lon="1"/><trkpt lat="2" lon="2"/></trkseg></trk></gpx>`;
    expect(() => parseGpx(billionLaughs)).toThrow(/DOCTYPE or entities/);
    const external =
      '<?xml version="1.0"?><!DOCTYPE gpx [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><gpx><wpt lat="1" lon="1"><name>&xxe;</name></wpt></gpx>';
    expect(() => parseGpx(external)).toThrow(/DOCTYPE or entities/);
    expect(() => parseGpx('<!doctype gpx><gpx><wpt lat="1" lon="1"/></gpx>')).toThrow(/DOCTYPE or entities/);

    expect(() => parseGpx("<kml><Placemark><Point><coordinates>1,1</coordinates></Point></Placemark></kml>")).toThrow(/XML but not GPX/);
    expect(() => parseGpx("<html><body>404 Not Found</body></html>")).toThrow(/XML but not GPX/);
    expect(() => parseGpx("<gpx><trk><trkseg><trkpt lat='1' lon='1'>")).toThrow(/not well-formed XML/);
    expect(() => parseGpx("just some notes about a walk")).toThrow(/not well-formed XML|not GPX/);
    expect(() => parseGpx("<gpx></gpx>")).toThrow(/no tracks, routes or waypoints/);
    // A single point is not a line, and impossible positions are dropped rather than stored.
    expect(() => parseGpx('<gpx><trk><trkseg><trkpt lat="1" lon="1"/></trkseg></trk></gpx>')).toThrow(/no tracks, routes or waypoints/);
    expect(() => parseGpx('<gpx><wpt lat="95" lon="1"/><wpt lat="abc" lon="1"/></gpx>')).toThrow(/no tracks, routes or waypoints/);
    expect(() => parseGpx(`<gpx>${" ".repeat(20 * 1024 * 1024 + 1)}</gpx>`)).toThrow(/larger than 20 MB/);
    // An unresolvable entity reference is an error, not text.
    expect(() => parseGpx('<gpx><wpt lat="1" lon="1"><name>&nope;</name></wpt></gpx>')).toThrow(/not well-formed XML/);
  });
});

describe("writing GPX", () => {
  it("escapes everything that could break out of the markup", () => {
    expect(escapeXml(`Tom & Jerry's <"best"> route\u0000\u0007`)).toBe("Tom &amp; Jerry&apos;s &lt;&quot;best&quot;&gt; route");
    const xml = buildGpx({
      name: 'A & B </name><script>alert("x")</script>',
      waypoints: [{ name: "<wpt> & co", description: "]]> it's", lat: 54.5, lon: -3.1, elevation: 120 }],
      lines: [
        {
          type: "Feature",
          properties: { name: 'evil"/><x', _gpxType: "trk" },
          geometry: {
            type: "LineString",
            coordinates: [
              [-3.1, 54.5],
              [-3.2, 54.6],
            ],
          },
        },
      ],
    });
    expect(xml).not.toContain("<script>");
    expect(xml).toContain("<name>A &amp; B &lt;/name&gt;&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;</name>");
    const back = parseGpx(xml);
    expect(back.name).toBe('A & B </name><script>alert("x")</script>');
    expect(back.collection.features.map((feature) => feature.properties.name)).toEqual(expect.arrayContaining(["<wpt> & co", 'evil"/><x']));
    expect(back.collection.features.find((feature) => feature.geometry.type === "Point")!.properties.desc).toBe("]]> it's");
  });

  it("round-trips a file: export of an import parses to the same thing", () => {
    const first = parseGpx(FIXTURE);
    const xml = buildGpx({ name: first.name!, description: first.description ?? undefined, ...splitCollection(first.collection) });
    expect(
      xml.startsWith(
        '<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Outpost" xmlns="http://www.topografix.com/GPX/1/1">',
      ),
    ).toBe(true);
    // Schema order: metadata, waypoints, routes, tracks.
    expect(xml.indexOf("<wpt")).toBeLessThan(xml.indexOf("<rte>"));
    expect(xml.indexOf("<rte>")).toBeLessThan(xml.indexOf("<trk>"));
    expect(xml.match(/<trkseg>/g)).toHaveLength(2);
    expect(xml).toContain(
      '<trkpt lat="54.432" lon="-2.962">\n        <ele>55</ele>\n        <time>2026-06-14T08:05:00Z</time>\n      </trkpt>',
    );
    expect(xml).toContain('<rtept lat="54.448" lon="-2.98"/>');

    const second = parseGpx(xml);
    expect(second.name).toBe(first.name);
    expect(second.description).toBe(first.description);
    const sorted = (collection: typeof first.collection) =>
      [...collection.features].sort((a, b) => JSON.stringify(a.geometry).localeCompare(JSON.stringify(b.geometry)));
    expect(sorted(second.collection)).toEqual(sorted(first.collection));
    expect(trackStats(second.collection)).toEqual(trackStats(first.collection));
  });
});

describe("tracks", () => {
  it("imports an uploaded GPX file with its statistics", async () => {
    const imported = await importGpx(FIXTURE, "fairfield-horseshoe.gpx", { color: "red" });
    expect(imported.status).toBe(200);
    expect(imported.body.markers).toEqual([]);
    const track = imported.body.track!;
    expect(track).toMatchObject({
      name: "Fairfield Horseshoe",
      description: 'A round from Ambleside & back, with a "short cut" <if needed>',
      color: "red",
      sourceFilename: "fairfield-horseshoe.gpx",
      ascentMeters: 838,
      pointCount: 13,
      bounds: [-3.02, 54.432, -2.95, 54.4972],
    });
    expect(track.distanceMeters).toBeCloseTo(EXPECTED_DISTANCE, 0);
    expect(track).not.toHaveProperty("geojson");

    // The list is light; the single track carries the geometry.
    const list = await app.api<{ tracks: TrackDto[] }>("GET", "/api/maps/tracks");
    expect(list.body.tracks).toEqual([track]);
    expect(JSON.stringify(list.body)).not.toContain("coordinates");
    const full = await app.api<{ track: TrackWithGeometryDto }>("GET", `/api/maps/tracks/${track.id}`);
    expect(full.body.track).toMatchObject(track);
    expect(full.body.track.geojson.type).toBe("FeatureCollection");
    // Waypoints stay with the track unless asked otherwise.
    expect(full.body.track.geojson.features).toHaveLength(4);
    expect((await app.api("GET", "/api/maps/tracks/missing")).status).toBe(404);
    expect((await app.api("GET", "/api/maps/overview")).body.counts).toMatchObject({ markers: 0, tracks: 1 });

    const renamed = await app.api<{ track: TrackDto }>("PATCH", `/api/maps/tracks/${track.id}`, {
      name: "Fairfield, clockwise",
      description: "Windy on top",
      color: "blue",
    });
    expect(renamed.body.track).toMatchObject({ name: "Fairfield, clockwise", description: "Windy on top", color: "blue", pointCount: 13 });
    expect((await app.api("PATCH", `/api/maps/tracks/${track.id}`, { color: "magenta" })).status).toBe(400);
    expect((await app.api("PATCH", `/api/maps/tracks/${track.id}`, { name: " " })).status).toBe(400);

    expect((await app.api("DELETE", `/api/maps/tracks/${track.id}`)).body).toEqual({ ok: true });
    expect((await app.api("DELETE", `/api/maps/tracks/${track.id}`)).status).toBe(404);
    expect((await app.api<{ tracks: TrackDto[] }>("GET", "/api/maps/tracks")).body.tracks).toEqual([]);
  });

  const waypointsFile = (count: number, extra = "") =>
    `<gpx>${Array.from({ length: count }, (_, i) => `<wpt lat="${(50 + i / 10000).toFixed(4)}" lon="-3"><name>P${i}</name></wpt>`).join("")}${extra}</gpx>`;

  it("turns thousands of waypoints into markers a batch at a time, without holding the server up", async () => {
    // One file used to be held to 5,000, because all of them were written in one go: about
    // 1.2 seconds on this thread for 5,000 and 4.4 for 20,000. A batch is about a fortieth of a second.
    const many = waypointsFile(6000);
    // Measured as this thread's working time between ticks, not by the clock: on a busy
    // machine the clock runs on while the process waits its turn, and that is no hold.
    let longest = 0;
    let last = threadMs();
    const tick = setInterval(() => {
      const now = threadMs();
      longest = Math.max(longest, now - last);
      last = now;
    }, 5);
    const imported = await importGpx(many, "points.gpx", { importWaypointsAsMarkers: "true" });
    // Timers that were held up fire now, so that a hold would be seen.
    await new Promise((resolve) => setTimeout(resolve, 30));
    clearInterval(tick);
    expect(imported.status).toBe(200);
    expect(imported.body.track).toBeNull();
    expect(imported.body.markers).toHaveLength(6000);
    expect(imported.body.markers.at(-1)).toMatchObject({ name: "P5999", lon: -3 });
    // About 60 ms here, most of it receiving the file from the reader; 1,400 ms when written in one go.
    expect(longest).toBeLessThan(700);
    expect((await app.api("GET", "/api/maps/overview")).body.counts).toMatchObject({ markers: 6000, tracks: 0 });
    // Each is findable, as a marker made by hand is.
    const found = await app.api("GET", "/api/search?q=P5999");
    expect(found.body.results.map((result: { title: string }) => result.title)).toContain("P5999");

    // Kept with their route, the same waypoints are one track.
    const kept = await importGpx(many, "points.gpx");
    expect(kept.status).toBe(200);
    expect(kept.body.markers).toEqual([]);
    const full = await app.api<{ track: TrackWithGeometryDto }>("GET", `/api/maps/tracks/${kept.body.track!.id}`);
    expect(full.body.track.geojson.features).toHaveLength(6000);
  }, 60_000);

  it("leaves nothing behind when an import of waypoints as markers fails part of the way", async () => {
    const search = app.ctx.services.search;
    const upsert = search.upsert.bind(search);
    const markerCount = async () => (await app.api<{ markers: MarkerDto[] }>("GET", "/api/maps/markers")).body.markers.length;
    const findable = async (q: string) => (await app.api("GET", `/api/search?q=${q}`)).body.results.length;

    // A marker made by hand beforehand is not part of the import and stays.
    await app.api("POST", "/api/maps/markers", { name: "Bothy", lat: 57, lon: -5 });

    // The 251st marker cannot be written: two batches are already in, and come out again.
    const later = vi.spyOn(search, "upsert").mockImplementation((entry) => {
      if (entry.kind === "marker" && entry.title === "P250") throw new Error("the disk is full");
      return upsert(entry);
    });
    const first = await importGpx(waypointsFile(600), "points.gpx", { importWaypointsAsMarkers: "true" });
    later.mockRestore();
    expect(first.status).toBe(500);
    expect(await markerCount()).toBe(1);
    expect(await findable("P0")).toBe(0);
    expect(await findable("P249")).toBe(0);

    // Every marker is written, and then the track cannot be stored.
    const last = vi.spyOn(search, "upsert").mockImplementation((entry) => {
      if (entry.kind === "track") throw new Error("the disk is full");
      return upsert(entry);
    });
    const line = '<trk><name>Ridge</name><trkseg><trkpt lat="50" lon="-3"/><trkpt lat="50.1" lon="-3"/></trkseg></trk>';
    const second = await importGpx(waypointsFile(300, line), "ridge.gpx", { importWaypointsAsMarkers: "true" });
    last.mockRestore();
    expect(second.status).toBe(500);
    expect(await markerCount()).toBe(1);
    expect(await findable("P299")).toBe(0);
    expect((await app.api<{ tracks: TrackDto[] }>("GET", "/api/maps/tracks")).body.tracks).toEqual([]);
    expect(await findable("Bothy")).toBe(1);

    // And the same file goes in whole once the trouble is over.
    const third = await importGpx(waypointsFile(300, line), "ridge.gpx", { importWaypointsAsMarkers: "true" });
    expect(third.status).toBe(200);
    expect(third.body.markers).toHaveLength(300);
    expect(third.body.track).toMatchObject({ name: "Ridge" });
    expect(await markerCount()).toBe(301);
  });

  it("is refused by the reader, not half imported, when a file has more waypoints than a file may", async () => {
    const refused = await importGpx(waypointsFile(20_001), "points.gpx", { importWaypointsAsMarkers: "true" });
    expect(refused.status).toBe(400);
    expect(refused.body.error?.message).toMatch(/^That GPX file has more than 20,000 waypoints\./);
    expect((await app.api<{ markers: MarkerDto[] }>("GET", "/api/maps/markers")).body.markers).toEqual([]);
  });

  it("can turn the file's waypoints into markers instead", async () => {
    const imported = await importGpx(FIXTURE, "fairfield.gpx", { importWaypointsAsMarkers: "true", name: "Sunday walk" });
    expect(imported.status).toBe(200);
    expect(imported.body.track).toMatchObject({ name: "Sunday walk", pointCount: 13 });
    expect(imported.body.markers.map((marker) => marker.name)).toEqual(["Car park", "Fairfield summit"]);
    expect(imported.body.markers[0]).toMatchObject({ note: "Rydal Road, pay & display", lat: 54.432, lon: -2.962, color: "teal" });
    const full = await app.api<{ track: TrackWithGeometryDto }>("GET", `/api/maps/tracks/${imported.body.track!.id}`);
    expect(full.body.track.geojson.features).toHaveLength(2);
    expect((await app.api<{ markers: MarkerDto[] }>("GET", "/api/maps/markers")).body.markers).toHaveLength(2);

    // The option may also be given in the address; a file of waypoints alone makes markers and no track.
    const onlyWaypoints = '<gpx><wpt lat="54.5" lon="-3.1"><name>Spring</name></wpt></gpx>';
    const points = await importGpx(onlyWaypoints, "points.gpx", {}, "?importWaypointsAsMarkers=1");
    expect(points.body.track).toBeNull();
    expect(points.body.markers.map((marker) => marker.name)).toEqual(["Spring"]);
    // Without the option the waypoints become a track of points, named after the file.
    const kept = await importGpx(onlyWaypoints, "Water sources.gpx");
    expect(kept.body.track).toMatchObject({
      name: "Water sources",
      distanceMeters: 0,
      pointCount: 0,
      ascentMeters: null,
      bounds: [-3.1, 54.5, -3.1, 54.5],
    });
  });

  it("refuses uploads that are not acceptable GPX, in plain words", async () => {
    const doctype = await importGpx(
      '<?xml version="1.0"?><!DOCTYPE gpx [<!ENTITY a "b">]><gpx><wpt lat="1" lon="1"><name>&a;</name></wpt></gpx>',
    );
    expect(doctype.status).toBe(400);
    expect(doctype.body.error!.message).toMatch(/DOCTYPE or entities/);

    const kml = await importGpx("<kml></kml>", "route.kml");
    expect(kml.status).toBe(400);
    expect(kml.body.error!.message).toMatch(/XML but not GPX/);

    const huge = await importGpx(Buffer.alloc(20 * 1024 * 1024 + 10, 0x20), "huge.gpx");
    expect(huge.status).toBe(413);
    expect(huge.body.error!.message).toMatch(/larger than 20 MB/);

    const { payload, headers } = multipart(undefined, { name: "nothing" });
    const empty = await app.api("POST", "/api/maps/tracks/import", payload, { headers });
    expect(empty.status).toBe(400);
    expect(empty.body.error.message).toMatch(/No file was sent/);

    const json = await app.api("POST", "/api/maps/tracks/import", { gpx: FIXTURE });
    expect(json.status).toBe(400);
    expect(json.body.error.message).toMatch(/multipart/);

    const badColour = await importGpx(FIXTURE, "fairfield.gpx", { color: "pink" });
    expect(badColour.status).toBe(400);
    expect((await app.api<{ tracks: TrackDto[] }>("GET", "/api/maps/tracks")).body.tracks).toEqual([]);
    expect((await app.api<{ markers: MarkerDto[] }>("GET", "/api/maps/markers")).body.markers).toEqual([]);
  });

  it("are found by the app-wide search", async () => {
    const track = (await importGpx(FIXTURE)).body.track!;
    const found = await app.ctx.services.search.search({ q: "fairfield horseshoe", kinds: ["track"] });
    expect(found.results[0]).toMatchObject({
      kind: "track",
      entityId: track.id,
      url: `/maps?track=${track.id}`,
      title: "Fairfield Horseshoe",
    });
    expect(found.results[0]!.subtitle).toMatch(/^\d+\.\d km, 838 m of ascent$/);
    // Names inside the file are searchable too.
    expect((await app.ctx.services.search.search({ q: "low-level alternative" })).results[0]).toMatchObject({ entityId: track.id });
    await app.api("DELETE", `/api/maps/tracks/${track.id}`);
    expect((await app.ctx.services.search.search({ q: "fairfield" })).results).toEqual([]);
  });

  it("exports a track as GPX that imports back to the same track", async () => {
    const track = (await importGpx(FIXTURE)).body.track!;
    const exported = await getText(`/api/maps/tracks/${track.id}/export.gpx`);
    expect(exported.status).toBe(200);
    expect(exported.headers["content-type"]).toBe("application/gpx+xml; charset=utf-8");
    expect(exported.headers["content-disposition"]).toBe(
      `attachment; filename="Fairfield Horseshoe.gpx"; filename*=UTF-8''Fairfield%20Horseshoe.gpx`,
    );
    expect(exported.headers["content-security-policy"]).toBe("sandbox; default-src 'none'");

    const again = (await importGpx(exported.text, "again.gpx")).body.track!;
    expect(again).toMatchObject({
      name: track.name,
      description: track.description,
      distanceMeters: track.distanceMeters,
      ascentMeters: track.ascentMeters,
      pointCount: track.pointCount,
      bounds: track.bounds,
    });
    const geometry = async (id: string) =>
      (await app.api<{ track: TrackWithGeometryDto }>("GET", `/api/maps/tracks/${id}`)).body.track.geojson.features;
    const sorted = (features: unknown[]) => features.map((feature) => JSON.stringify(feature)).sort();
    expect(sorted(await geometry(again.id))).toEqual(sorted(await geometry(track.id)));
    expect((await getText("/api/maps/tracks/missing/export.gpx")).status).toBe(404);
  });

  it("exports markers and chosen tracks together", async () => {
    const track = (await importGpx(FIXTURE)).body.track!;
    const other = (
      await importGpx(
        '<gpx><trk><trkseg><trkpt lat="57.1" lon="-3.6"/><trkpt lat="57.2" lon="-3.7"/></trkseg></trk></gpx>',
        "Cairngorm plateau.gpx",
      )
    ).body.track!;
    await app.api("POST", "/api/maps/markers", { name: "Bothy & <spring>", note: 'Says "no fires"', lat: 57.05, lon: -3.65 });

    const both = await getText(`/api/maps/export.gpx?markers=1&tracks=${track.id},${other.id}`);
    expect(both.status).toBe(200);
    expect(both.headers["content-disposition"]).toContain('filename="outpost-map-export.gpx"');
    const parsed = parseGpx(both.text);
    expect(parsed.lines).toBe(3);
    expect(parsed.waypoints).toBe(3);
    const names = parsed.collection.features.map((feature) => feature.properties.name);
    // An unnamed line takes its track's name; marker text survives escaping.
    expect(names).toEqual(
      expect.arrayContaining([
        "Bothy & <spring>",
        "Car park",
        "Fairfield summit",
        "Low-level alternative",
        "Fairfield Horseshoe",
        "Cairngorm plateau",
      ]),
    );
    expect(parsed.collection.features.find((feature) => feature.properties.name === "Bothy & <spring>")).toMatchObject({
      properties: { desc: 'Says "no fires"' },
      geometry: { type: "Point", coordinates: [-3.65, 57.05] },
    });

    const markersOnly = parseGpx((await getText("/api/maps/export.gpx?markers=1")).text);
    expect(markersOnly).toMatchObject({ lines: 0, waypoints: 1 });
    const oneTrack = await getText(`/api/maps/export.gpx?tracks=${other.id}`);
    expect(oneTrack.headers["content-disposition"]).toContain('filename="Cairngorm plateau.gpx"');
    expect(parseGpx(oneTrack.text)).toMatchObject({ lines: 1, waypoints: 0 });

    expect((await getText("/api/maps/export.gpx")).status).toBe(400);
    expect((await getText("/api/maps/export.gpx?markers=0")).status).toBe(400);
    expect((await getText(`/api/maps/export.gpx?tracks=${track.id},missing`)).status).toBe(404);
  });

  it("tells the browser when something changes", async () => {
    const seen: string[] = [];
    const unsubscribe = app.ctx.events.subscribe((event) => event.type === "maps.changed" && seen.push(event.type));
    const marker = (await app.api("POST", "/api/maps/markers", { name: "x", lat: 1, lon: 1 })).body.marker;
    await app.api("PATCH", `/api/maps/markers/${marker.id}`, { name: "y" });
    await app.api("DELETE", `/api/maps/markers/${marker.id}`);
    const track = (await importGpx(FIXTURE)).body.track!;
    await app.api("PATCH", `/api/maps/tracks/${track.id}`, { name: "z" });
    await app.api("DELETE", `/api/maps/tracks/${track.id}`);
    unsubscribe();
    expect(seen).toHaveLength(6);
  });
});
