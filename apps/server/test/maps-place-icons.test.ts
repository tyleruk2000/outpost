/**
 * Icons for saved places: the column, the API, and the names GPX files use for them,
 * both ways. The Garmin names asserted here are the ones found in GPSBabel's table of
 * them (see `src/modules/maps/waypoint-symbols.ts` for the source and the date).
 */
import { MARKER_ICONS, type MarkerDto, type MarkerIcon, type TrackImportResponse } from "@outpost/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { escapeXml, parseGpx } from "../src/modules/maps/gpx.ts";
import { iconForSymbol, KNOWN_SYMBOLS, SYMBOL_FOR_ICON, symbolForPlace } from "../src/modules/maps/waypoint-symbols.ts";
import { createTestApp, type TestApp } from "./helpers.ts";

let app: TestApp;
beforeEach(async () => {
  app = await createTestApp();
});
afterEach(async () => {
  await app.close();
});

const listMarkers = async () => (await app.api<{ markers: MarkerDto[] }>("GET", "/api/maps/markers")).body.markers;

async function exportGpx(): Promise<string> {
  const response = await app.app.inject({ method: "GET", url: "/api/maps/export.gpx?markers=1", headers: { host: "localhost" } });
  expect(response.statusCode).toBe(200);
  return response.body;
}

async function importAsPlaces(gpx: string) {
  const boundary = "----outpost-test-boundary";
  const payload = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="importWaypointsAsMarkers"\r\n\r\ntrue\r\n`),
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="places.gpx"\r\nContent-Type: application/gpx+xml\r\n\r\n`,
    ),
    Buffer.from(gpx),
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return app.api<TrackImportResponse & { error?: { message: string } }>("POST", "/api/maps/tracks/import", payload, {
    headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
  });
}

/** The `<sym>` of each waypoint in a GPX file, by the waypoint's name. */
const symbolsIn = (gpx: string): Record<string, string | undefined> =>
  Object.fromEntries(
    parseGpx(gpx)
      .collection.features.filter((feature) => feature.geometry.type === "Point")
      .map((feature) => [feature.properties.name, feature.properties.sym]),
  );

const waypoints = (points: Array<{ name: string; sym?: string }>) =>
  `<?xml version="1.0"?><gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1">${points
    .map((point, index) => `<wpt lat="${54 + index / 100}" lon="-3"><name>${point.name}</name>${point.sym ? `<sym>${escapeXml(point.sym)}</sym>` : ""}</wpt>`)
    .join("")}</gpx>`;

describe("a saved place's icon", () => {
  it("is a plain pin until one is chosen, and is kept when one is", async () => {
    const plain = await app.api<{ marker: MarkerDto }>("POST", "/api/maps/markers", { name: "Cairn", lat: 54.45, lon: -3.21 });
    expect(plain.status).toBe(200);
    expect(plain.body.marker.icon).toBe("pin");

    const hut = await app.api<{ marker: MarkerDto }>("POST", "/api/maps/markers", {
      name: "Mosedale bothy",
      lat: 54.5,
      lon: -3.3,
      color: "green",
      icon: "shelter",
    });
    expect(hut.body.marker).toMatchObject({ icon: "shelter", color: "green" });

    const changed = await app.api<{ marker: MarkerDto }>("PATCH", `/api/maps/markers/${plain.body.marker.id}`, { icon: "summit" });
    expect(changed.body.marker).toMatchObject({ icon: "summit", name: "Cairn", color: "teal" });
    // Changing something else leaves the icon alone.
    const renamed = await app.api<{ marker: MarkerDto }>("PATCH", `/api/maps/markers/${plain.body.marker.id}`, { name: "Great Gable" });
    expect(renamed.body.marker.icon).toBe("summit");

    expect(Object.fromEntries((await listMarkers()).map((marker) => [marker.name, marker.icon]))).toEqual({
      "Great Gable": "summit",
      "Mosedale bothy": "shelter",
    });
  });

  it("can be any of the sixteen, and nothing else", async () => {
    expect(MARKER_ICONS).toHaveLength(16);
    expect(new Set(MARKER_ICONS).size).toBe(16);
    expect(MARKER_ICONS[0]).toBe("pin");
    for (const icon of MARKER_ICONS) {
      const made = await app.api<{ marker: MarkerDto }>("POST", "/api/maps/markers", { name: `A ${icon}`, lat: 54, lon: -3, icon });
      expect(made.body.marker.icon, icon).toBe(icon);
    }
    const refused = await app.api<{ error: { code: string; message: string } }>("POST", "/api/maps/markers", {
      name: "Castle",
      lat: 54,
      lon: -3,
      icon: "castle",
    });
    expect(refused.status).toBe(400);
    expect(refused.body.error.message).toMatch(/Choose one of the place icons: pin, home, shelter, tent/);
    const id = (await listMarkers())[0]!.id;
    expect((await app.api("PATCH", `/api/maps/markers/${id}`, { icon: "<script>" })).status).toBe(400);
    // The symbol a place had in a GPX file is the server's own record: a request cannot set it.
    const sneaky = await app.api<{ marker: MarkerDto }>("POST", "/api/maps/markers", { name: "Sneaky", lat: 54, lon: -3, gpxSym: "Bank" });
    expect(sneaky.status).toBe(200);
    expect(app.ctx.sqlite.prepare("SELECT gpx_sym FROM markers WHERE id = ?").get(sneaky.body.marker.id)).toEqual({ gpx_sym: null });
    expect(sneaky.body.marker).not.toHaveProperty("gpxSym");
  });

  it("reads a name it does not know, as a newer Outpost might have stored, as a plain pin", async () => {
    const made = await app.api<{ marker: MarkerDto }>("POST", "/api/maps/markers", { name: "Lighthouse", lat: 54, lon: -3, icon: "star" });
    app.ctx.sqlite.prepare("UPDATE markers SET icon = 'lighthouse' WHERE id = ?").run(made.body.marker.id);
    expect((await listMarkers())[0]).toMatchObject({ name: "Lighthouse", icon: "pin" });
    expect(symbolsIn(await exportGpx())).toEqual({ Lighthouse: undefined });
  });

  it("stays out of the way of search: a place is found by its name and note as before", async () => {
    await app.api("POST", "/api/maps/markers", { name: "Sprinkling Tarn", note: "Good water", lat: 54.47, lon: -3.19, icon: "water" });
    await app.ctx.jobs.whenIdle();
    const found = await app.api<{ results: Array<{ kind: string; title: string }> }>("GET", "/api/search?q=sprinkling");
    expect(found.body.results.map((result) => [result.kind, result.title])).toEqual([["marker", "Sprinkling Tarn"]]);
  });
});

describe("the names GPX uses for a place's icon", () => {
  // Read in GPSBabel's garmin_icon_tables.h on 16 November 2026. A name is added here only after it has been found there.
  const VERIFIED = [
    "Residence",
    "Lodge",
    "Lodging",
    "Campground",
    "Parking Area",
    "Drinking Water",
    "Water Source",
    "Restaurant",
    "Fast Food",
    "Medical Facility",
    "Gas Station",
    "Summit",
    "Scenic Area",
    "Tall Tower",
    "Short Tower",
    "Radio Beacon",
    "Danger Area",
    "Skull and Crossbones",
    "Flag",
    "Flag, Blue",
    "Flag, Red",
    "Flag, Green",
  ];

  it("are only names that were found in the source they are cited from", () => {
    expect([...KNOWN_SYMBOLS].sort()).toEqual([...VERIFIED].sort());
    for (const symbol of Object.values(SYMBOL_FOR_ICON)) expect(VERIFIED, symbol).toContain(symbol);
  });

  it("give every icon one name or none, and read each name back as the icon it was written for", () => {
    const written: Record<MarkerIcon, string | undefined> = Object.fromEntries(
      MARKER_ICONS.map((icon) => [icon, SYMBOL_FOR_ICON[icon]]),
    ) as Record<MarkerIcon, string | undefined>;
    expect(written).toEqual({
      pin: undefined,
      home: "Residence",
      shelter: "Lodge",
      tent: "Campground",
      parking: "Parking Area",
      water: "Drinking Water",
      food: "Restaurant",
      "first-aid": "Medical Facility",
      fuel: "Gas Station",
      summit: "Summit",
      viewpoint: "Scenic Area",
      mast: "Tall Tower",
      meeting: undefined,
      danger: "Danger Area",
      star: undefined,
      flag: "Flag, Blue",
    });
    for (const [icon, symbol] of Object.entries(SYMBOL_FOR_ICON)) expect(iconForSymbol(symbol), symbol).toBe(icon);
    for (const symbol of KNOWN_SYMBOLS) expect(MARKER_ICONS, symbol).toContain(iconForSymbol(symbol));
  });

  it("read other spellings of a known name, and anything else as the plain pin", () => {
    expect(iconForSymbol("campground")).toBe("tent");
    expect(iconForSymbol("  PARKING   AREA ")).toBe("parking");
    expect(iconForSymbol("Lodging")).toBe("shelter");
    expect(iconForSymbol("Water Source")).toBe("water");
    expect(iconForSymbol("Radio Beacon")).toBe("mast");
    expect(iconForSymbol("Skull and Crossbones")).toBe("danger");
    expect(iconForSymbol("Flag, Red")).toBe("flag");
    for (const unknown of ["Geocache", "Waypoint", "Pin, Blue", "Bank", "tent", "pin", "", "🏕", "Camp ground"]) {
      expect(iconForSymbol(unknown), unknown).toBe("pin");
    }
    expect(iconForSymbol(undefined)).toBe("pin");
    expect(iconForSymbol(null)).toBe("pin");
  });

  it("keep the file's own word for as long as the icon is the one it was read as", () => {
    expect(symbolForPlace("pin", "Geocache")).toBe("Geocache");
    expect(symbolForPlace("shelter", "Lodging")).toBe("Lodging");
    expect(symbolForPlace("tent", "campground")).toBe("campground");
    // Given another icon since, the icon speaks.
    expect(symbolForPlace("tent", "Geocache")).toBe("Campground");
    expect(symbolForPlace("pin", "Lodging")).toBeUndefined();
    expect(symbolForPlace("star", null)).toBeUndefined();
    expect(symbolForPlace("fuel", undefined)).toBe("Gas Station");
  });
});

describe("saved places in a GPX file", () => {
  it("are written with a symbol a common program knows where there is an obvious one, and none where there is not", async () => {
    for (const icon of MARKER_ICONS) await app.api("POST", "/api/maps/markers", { name: `The ${icon}`, lat: 54, lon: -3, icon });
    const gpx = await exportGpx();
    expect(symbolsIn(gpx)).toEqual({
      "The pin": undefined,
      "The home": "Residence",
      "The shelter": "Lodge",
      "The tent": "Campground",
      "The parking": "Parking Area",
      "The water": "Drinking Water",
      "The food": "Restaurant",
      "The first-aid": "Medical Facility",
      "The fuel": "Gas Station",
      "The summit": "Summit",
      "The viewpoint": "Scenic Area",
      "The mast": "Tall Tower",
      "The meeting": undefined,
      "The danger": "Danger Area",
      "The star": undefined,
      "The flag": "Flag, Blue",
    });
    // In the place the format gives it: after the name and description.
    expect(gpx).toMatch(/<name>The tent<\/name>\s*<sym>Campground<\/sym>/);
    expect(gpx).not.toMatch(/<sym>\s*<\/sym>/);
  });

  it("become places with the icon their symbol stands for, and a plain pin for a symbol Outpost has no icon for", async () => {
    const imported = await importAsPlaces(
      waypoints([
        { name: "Wasdale Head", sym: "Campground" },
        { name: "Styhead box", sym: "Medical Facility" },
        { name: "Black Sail", sym: "Lodging" },
        { name: "Cache 12", sym: "Geocache" },
        { name: "Seathwaite", sym: "parking area" },
        { name: "Unmarked" },
      ]),
    );
    expect(imported.status).toBe(200);
    expect(imported.body.track).toBeNull();
    expect(Object.fromEntries(imported.body.markers.map((marker) => [marker.name, marker.icon]))).toEqual({
      "Wasdale Head": "tent",
      "Styhead box": "first-aid",
      "Black Sail": "shelter",
      "Cache 12": "pin",
      Seathwaite: "parking",
      Unmarked: "pin",
    });
  });

  it("lose nothing on the way round: every symbol comes out as it went in, known to Outpost or not", async () => {
    const original = [
      { name: "Wasdale Head", sym: "Campground" },
      { name: "Black Sail", sym: "Lodging" },
      { name: "Cache 12", sym: "Geocache" },
      { name: "Seathwaite", sym: "parking area" },
      { name: "Odd one", sym: "My own symbol & <more>" },
      { name: "Unmarked" },
    ];
    expect((await importAsPlaces(waypoints(original))).status).toBe(200);
    const out = await exportGpx();
    expect(symbolsIn(out)).toEqual(Object.fromEntries(original.map((point) => [point.name, point.sym])));

    // And round again, from Outpost's own file, into an empty map: the same icons and the same symbols.
    const icons = Object.fromEntries((await listMarkers()).map((marker) => [marker.name, marker.icon]));
    for (const marker of await listMarkers()) await app.api("DELETE", `/api/maps/markers/${marker.id}`);
    expect(await listMarkers()).toEqual([]);
    expect((await importAsPlaces(out)).status).toBe(200);
    expect(Object.fromEntries((await listMarkers()).map((marker) => [marker.name, marker.icon]))).toEqual(icons);
    expect(symbolsIn(await exportGpx())).toEqual(symbolsIn(out));
  });

  it("say what the map shows once a place has been given another icon", async () => {
    const imported = await importAsPlaces(waypoints([{ name: "Cache 12", sym: "Geocache" }]));
    const id = imported.body.markers[0]!.id;
    await app.api("PATCH", `/api/maps/markers/${id}`, { icon: "tent" });
    expect(symbolsIn(await exportGpx())).toEqual({ "Cache 12": "Campground" });
    await app.api("PATCH", `/api/maps/markers/${id}`, { icon: "star" });
    expect(symbolsIn(await exportGpx())).toEqual({ "Cache 12": undefined });
    // Put back to the pin it was read as, it has its own word again.
    await app.api("PATCH", `/api/maps/markers/${id}`, { icon: "pin" });
    expect(symbolsIn(await exportGpx())).toEqual({ "Cache 12": "Geocache" });
  });

  it("keep their icons when chosen in Outpost, exported, and brought into another Outpost", async () => {
    await app.api("POST", "/api/maps/markers", { name: "Esk Hause shelter", note: "Cross walls", lat: 54.461, lon: -3.184, icon: "shelter" });
    await app.api("POST", "/api/maps/markers", { name: "Spring", lat: 54.47, lon: -3.19, icon: "water", color: "blue" });
    await app.api("POST", "/api/maps/markers", { name: "Meet here", lat: 54.48, lon: -3.2, icon: "meeting" });
    const gpx = await exportGpx();

    const other = await createTestApp();
    try {
      const { markers } = await other.ctx.services.maps.annotations.importTrack({ source: gpx, importWaypointsAsMarkers: true });
      expect(Object.fromEntries(markers.map((marker) => [marker.name, marker.icon]))).toEqual({
        "Esk Hause shelter": "shelter",
        Spring: "water",
        // No symbol stands for a meeting point, so the file cannot say: it arrives as a plain pin.
        "Meet here": "pin",
      });
      expect(markers.find((marker) => marker.name === "Esk Hause shelter")).toMatchObject({ note: "Cross walls", lat: 54.461, lon: -3.184 });
    } finally {
      await other.close();
    }
  });

  it("leave a waypoint that stays with its route as it was, symbol and all", async () => {
    const source = `<gpx><wpt lat="54.5" lon="-3.1"><name>Hut</name><sym>Lodge</sym></wpt><trk><trkseg><trkpt lat="54.5" lon="-3.1"/><trkpt lat="54.6" lon="-3.2"/></trkseg></trk></gpx>`;
    const { track, markers } = await app.ctx.services.maps.annotations.importTrack({ source, filename: "walk.gpx" });
    expect(markers).toEqual([]);
    expect(await listMarkers()).toEqual([]);
    expect(symbolsIn(app.ctx.services.maps.annotations.exportTrack(track!.id).gpx)).toEqual({ Hut: "Lodge" });
  });
});
