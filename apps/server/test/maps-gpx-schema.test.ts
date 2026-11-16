/**
 * What Outpost writes as GPX, held to the GPX 1.1 schema without the schema file.
 *
 * The exports were validated against the schema itself with xmllint (docs/maps.md says
 * when and how). These tests keep what that found from coming back, and need neither
 * the schema nor the internet: the order of elements the schema fixes is written out
 * below, and the forms of its values (a latitude, a longitude, a time) are checked
 * directly.
 */
import { afterEach, describe, expect, it } from "vitest";
import { buildGpx, type GpxDocument, gpxLongitude, gpxTime, parseGpx, type TrackCollection } from "../src/modules/maps/gpx.ts";
import { createTestApp, type TestApp } from "./helpers.ts";

/** The children each element may have, in the order the schema's `xsd:sequence` gives them. */
const POINT = [
  "ele",
  "time",
  "magvar",
  "geoidheight",
  "name",
  "cmt",
  "desc",
  "src",
  "link",
  "sym",
  "type",
  "fix",
  "sat",
  "hdop",
  "vdop",
  "pdop",
  "ageofdgpsdata",
  "dgpsid",
  "extensions",
];
const SEQUENCE: Record<string, string[]> = {
  gpx: ["metadata", "wpt", "rte", "trk", "extensions"],
  metadata: ["name", "desc", "author", "copyright", "link", "time", "keywords", "bounds", "extensions"],
  wpt: POINT,
  rtept: POINT,
  trkpt: POINT,
  rte: ["name", "cmt", "desc", "src", "link", "number", "type", "extensions", "rtept"],
  trk: ["name", "cmt", "desc", "src", "link", "number", "type", "extensions", "trkseg"],
  trkseg: ["trkpt", "extensions"],
  copyright: ["year", "license"],
  link: ["text", "type"],
};

/** `xsd:dateTime`: date, "T", time, optional fractions, optional zone. */
const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?$/;
/** `xsd:decimal`: digits and at most one point. No exponent, no "NaN". */
const DECIMAL = /^-?\d+(\.\d+)?$/;

interface Seen {
  elements: number;
  times: string[];
  longitudes: number[];
}

/**
 * Walks a file Outpost wrote and returns everything in it that the schema would
 * refuse. The writer's output has no comments, CDATA or processing instructions past
 * the first line, so tags can be read with one expression.
 */
function faults(xml: string): { faults: string[]; seen: Seen } {
  const found: string[] = [];
  const seen: Seen = { elements: 0, times: [], longitudes: [] };
  const stack: Array<{ tag: string; children: string[]; textFrom: number }> = [];
  const body = xml.slice(Math.max(0, xml.indexOf("<gpx")));
  const close = (index: number) => {
    const done = stack.pop()!;
    const order = SEQUENCE[done.tag];
    if (order) {
      const places = done.children.map((child) => order.indexOf(child));
      done.children.forEach((child, at) => {
        if (places[at] === -1) found.push(`<${done.tag}> may not hold <${child}>`);
        else if (at > 0 && places[at]! < places[at - 1]!) found.push(`in <${done.tag}>, <${child}> comes after <${done.children[at - 1]}>`);
      });
    } else if (done.children.length > 0) {
      found.push(`<${done.tag}> holds elements and should hold only text`);
    }
    const text = body.slice(done.textFrom, index);
    if (done.tag === "time") {
      seen.times.push(text);
      if (!DATE_TIME.test(text) || Number.isNaN(Date.parse(text))) found.push(`time "${text}" is not an xsd:dateTime`);
    }
    if (done.tag === "ele" && !DECIMAL.test(text)) found.push(`height "${text}" is not a plain decimal`);
    if (done.tag === "year" && !/^\d{4}$/.test(text)) found.push(`year "${text}" is not a year`);
  };
  if (
    !xml.startsWith(
      '<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Outpost" xmlns="http://www.topografix.com/GPX/1/1">',
    )
  ) {
    found.push("the file does not open as GPX 1.1 in its namespace, with a version and a creator");
  }
  for (const tag of body.matchAll(/<(\/?)([A-Za-z]+)((?:\s+[a-z]+="[^"<]*")*)\s*(\/?)>/g)) {
    const [, closing, name, attributes, selfClosing] = tag as unknown as [string, string, string, string, string];
    if (closing) {
      if (stack.at(-1)?.tag !== name) found.push(`</${name}> closes <${stack.at(-1)?.tag}>`);
      close(tag.index);
      continue;
    }
    seen.elements += 1;
    stack.at(-1)?.children.push(name);
    if (name === "wpt" || name === "rtept" || name === "trkpt") {
      const lat = /\slat="([^"]*)"/.exec(attributes)?.[1] ?? "";
      const lon = /\slon="([^"]*)"/.exec(attributes)?.[1] ?? "";
      if (!DECIMAL.test(lat) || Number(lat) < -90 || Number(lat) > 90) found.push(`latitude "${lat}" is not between -90 and 90`);
      // The schema's longitude stops short of 180: -180 <= lon < 180.
      if (!DECIMAL.test(lon) || Number(lon) < -180 || Number(lon) >= 180)
        found.push(`longitude "${lon}" is not from -180 up to, not including, 180`);
      seen.longitudes.push(Number(lon));
    }
    if (name === "copyright" && !/\sauthor="[^"]+"/.test(attributes)) found.push("<copyright> has no author");
    if (name === "link" && !/\shref="[^"]+"/.test(attributes)) found.push("<link> has no href");
    stack.push({ tag: name, children: [], textFrom: tag.index + tag[0].length });
    if (selfClosing) close(tag.index + tag[0].length);
  }
  if (stack.length > 0) found.push(`<${stack.at(-1)!.tag}> is never closed`);
  return { faults: found, seen };
}

const line = (
  type: "trk" | "rte",
  coordinates: number[][] | number[][][],
  properties: Record<string, unknown> = {},
): GpxDocument["lines"][number] =>
  ({
    type: "Feature",
    properties: { _gpxType: type, ...properties },
    geometry: Array.isArray(coordinates[0]?.[0])
      ? { type: "MultiLineString", coordinates: coordinates as number[][][] }
      : { type: "LineString", coordinates: coordinates as number[][] },
  }) as GpxDocument["lines"][number];

describe("the checker these tests lean on", () => {
  const wrap = (inner: string) =>
    `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Outpost" xmlns="http://www.topografix.com/GPX/1/1">\n${inner}</gpx>\n`;

  it("passes a file in the schema's order and names each thing the schema would refuse", () => {
    expect(
      faults(wrap('<wpt lat="1" lon="2"><ele>3</ele><time>2026-01-02T03:04:05Z</time><name>a</name><sym>b</sym></wpt>')).faults,
    ).toEqual([]);
    // The usual fault: a name before the height and the time.
    expect(faults(wrap('<wpt lat="1" lon="2"><name>a</name><ele>3</ele></wpt>')).faults).toEqual(["in <wpt>, <ele> comes after <name>"]);
    expect(faults(wrap('<wpt lat="1" lon="2"><sym>b</sym><desc>c</desc></wpt>')).faults).toEqual(["in <wpt>, <desc> comes after <sym>"]);
    expect(faults(wrap('<trk><trkseg/></trk><wpt lat="1" lon="2"/>')).faults).toEqual(["in <gpx>, <wpt> comes after <trk>"]);
    expect(faults(wrap("<trk><trkseg/><name>late</name></trk>")).faults).toEqual(["in <trk>, <name> comes after <trkseg>"]);
    expect(faults(wrap('<rte><rtept lat="1" lon="2"><speed>4</speed></rtept></rte>')).faults).toEqual(["<rtept> may not hold <speed>"]);
    expect(faults(wrap('<wpt lat="1" lon="180"/>')).faults).toEqual(['longitude "180" is not from -180 up to, not including, 180']);
    expect(faults(wrap('<wpt lat="90.5" lon="5e-8"/>')).faults).toEqual([
      'latitude "90.5" is not between -90 and 90',
      'longitude "5e-8" is not from -180 up to, not including, 180',
    ]);
    expect(faults(wrap('<wpt lat="1" lon="2"><time>2026-01-02 03:04:05</time></wpt>')).faults).toEqual([
      'time "2026-01-02 03:04:05" is not an xsd:dateTime',
    ]);
    expect(faults(wrap('<wpt lat="1" lon="2"><ele>1e3</ele></wpt>')).faults).toEqual(['height "1e3" is not a plain decimal']);
    expect(faults('<gpx><wpt lat="1" lon="2"/></gpx>').faults).toEqual([
      "the file does not open as GPX 1.1 in its namespace, with a version and a creator",
    ]);
  });
});

describe("the forms GPX 1.1 fixes", () => {
  it("writes a time the schema reads, whatever form it was kept in", () => {
    // Already in the schema's form: written as it is, with its zone and its fractions.
    for (const kept of [
      "2026-03-01T12:30:00Z",
      "2026-03-01T12:30:00.250Z",
      "2026-03-01T12:30:00+01:00",
      "2026-03-01T12:30:00.5-09:30",
      "2026-03-01T12:30:00",
    ]) {
      expect(gpxTime(kept)).toBe(kept);
    }
    // Forms the reader accepts from a file and the schema does not: the same moment, in UTC.
    expect(gpxTime("Sun, 01 Mar 2026 12:30:00 GMT")).toBe("2026-03-01T12:30:00.000Z");
    expect(gpxTime("March 1, 2026 12:31:00 UTC")).toBe("2026-03-01T12:31:00.000Z");
    expect(gpxTime("2026-03-01T12:30Z")).toBe("2026-03-01T12:30:00.000Z");
    expect(gpxTime("2026-03-01T13:30+01:00")).toBe("2026-03-01T12:30:00.000Z");
    expect(gpxTime("2026-03-01")).toBe("2026-03-01T00:00:00.000Z");
    // No zone, and not in GPX's form: the local time of this computer, as JavaScript reads it.
    expect(gpxTime("2026-03-01 12:30:00")).toBe(new Date(2026, 2, 1, 12, 30, 0).toISOString());
    expect(gpxTime("2026/03/01 12:30:00")).toBe(new Date(2026, 2, 1, 12, 30, 0).toISOString());
    // Not a time at all, or one the schema has no way to write: left out, not written wrong.
    for (const none of [undefined, null, "", "yesterday", "2026-13-45T99:99:99Z", "+012026-03-01T12:30:00Z"])
      expect(gpxTime(none)).toBeUndefined();
    for (const written of ["Sun, 01 Mar 2026 12:30:00 GMT", "2026-03-01 12:30:00", "2026-03-01"])
      expect(gpxTime(written)).toMatch(DATE_TIME);
  });

  it("writes 180 degrees east as 180 degrees west, which the schema allows and is the same meridian", () => {
    expect(gpxLongitude(180)).toBe("-180");
    // Rounds to 180 at seven places, so it is caught after rounding.
    expect(gpxLongitude(179.99999996)).toBe("-180");
    expect(gpxLongitude(179.9999999)).toBe("179.9999999");
    expect(gpxLongitude(-180)).toBe("-180");
    expect(gpxLongitude(-179.99999996)).toBe("-180");
    expect(gpxLongitude(0)).toBe("0");
    expect(gpxLongitude(-0.00000001)).toBe("0");
    expect(gpxLongitude(5e-7)).toBe("0.0000005");
    expect(gpxLongitude(-3.2116)).toBe("-3.2116");
  });

  it("puts every element where the schema's sequence has it, in a file that uses all of them", () => {
    const xml = buildGpx({
      name: "Everything",
      description: "All the elements Outpost writes",
      copyright: { author: "OpenStreetMap contributors", year: "2026", license: "https://opendatacommons.org/licenses/odbl/1-0/" },
      link: { href: "https://www.openstreetmap.org/copyright", text: "© OpenStreetMap contributors" },
      waypoints: [
        { name: "Summit", description: "Cairn", lat: 54.4542, lon: -3.2116, elevation: 978, time: "2026-06-01 10:00:00", sym: "Summit" },
        { name: "", lat: 90, lon: 180, sym: "Flag, Blue" },
        { name: "Sea level", lat: -90, lon: -180, elevation: 0 },
      ],
      lines: [
        line(
          "trk",
          [
            [
              [-3.2, 54.4, 100.123, 0],
              [-3.21, 54.41, 5e-8],
            ],
            [
              [179.99999996, -16.5],
              [-179.9, -16.6],
            ],
          ],
          {
            name: "Track",
            desc: "Two segments",
            src: "From OpenStreetMap",
            link: { href: "https://www.openstreetmap.org/relation/1", text: "OpenStreetMap relation 1" },
            coordinateProperties: {
              times: [
                ["2026-06-01T10:00:00Z", "Sun, 01 Mar 2026 12:30:00 GMT"],
                [null, "not a time"],
              ],
            },
          },
        ),
        line(
          "rte",
          [
            [-3.2, 54.4, 12],
            [-3.3, 54.5],
          ],
          { name: "Route", desc: "Planned", coordinateProperties: { times: ["2026-06-01T10:00:00+01:00", null] } },
        ),
        line("trk", [
          [1, 2],
          [3, 4],
        ]),
      ],
    });
    const checked = faults(xml);
    expect(checked.faults).toEqual([]);
    expect(checked.seen.elements).toBeGreaterThan(40);
    expect(checked.seen.times).toEqual([
      new Date(2026, 5, 1, 10, 0, 0).toISOString(),
      "2026-06-01T10:00:00+01:00",
      "2026-06-01T10:00:00Z",
      "2026-03-01T12:30:00.000Z",
    ]);
    expect(checked.seen.longitudes).toEqual([-3.2116, -180, -180, -3.2, -3.3, -3.2, -3.21, -180, -179.9, 1, 3]);

    // The order itself, said outright for the places it most often goes wrong.
    const order = (within: string, ...tags: string[]) => tags.map((tag) => within.indexOf(`<${tag}`));
    const ascending = (places: number[]) => places.every((place, index) => place >= 0 && (index === 0 || place > places[index - 1]!));
    const wpt = xml.slice(xml.indexOf("<wpt"), xml.indexOf("</wpt>"));
    expect(ascending(order(wpt, "ele>", "time>", "name>", "desc>", "sym>"))).toBe(true);
    const metadata = xml.slice(xml.indexOf("<metadata>"), xml.indexOf("</metadata>"));
    expect(ascending(order(metadata, "name>", "desc>", "copyright ", "year>", "license>", "link ", "text>"))).toBe(true);
    const trk = xml.slice(xml.indexOf("<trk>"), xml.indexOf("</trk>"));
    expect(ascending(order(trk, "name>", "desc>", "src>", "link ", "trkseg>", "trkpt ", "ele>", "time>"))).toBe(true);
    const rte = xml.slice(xml.indexOf("<rte>"), xml.indexOf("</rte>"));
    expect(ascending(order(rte, "name>", "desc>", "rtept ", "ele>", "time>"))).toBe(true);
    expect(ascending(order(xml, "metadata>", "wpt ", "rte>", "trk>"))).toBe(true);
    // A point with nothing to say is one empty element; a height of nearly nothing is not written with an exponent.
    expect(xml).toContain('<trkpt lat="2" lon="1"/>');
    expect(xml).toContain("<ele>0</ele>");
    expect(xml).not.toMatch(/\de-\d/);
    // A name that is empty, and a time that is not one, are left out; they are not written empty.
    expect(xml).not.toMatch(/<name>\s*<\/name>|<time>\s*<\/time>|<name\/>|<time\/>/);
    expect(xml).not.toContain("not a time");
  });

  it("writes a file with nothing in it but its name, and one with no name at all", () => {
    expect(faults(buildGpx({ name: "Empty", waypoints: [], lines: [] })).faults).toEqual([]);
    const nameless = buildGpx({
      name: "",
      waypoints: [{ name: "", lat: 1, lon: 2 }],
      lines: [
        line("rte", [
          [1, 2],
          [3, 4],
        ]),
        line("trk", []),
      ],
    });
    expect(faults(nameless).faults).toEqual([]);
    expect(nameless).not.toContain("<name>");
  });
});

// ── Real exports, from a real server ────────────────────────────────────────

const apps: TestApp[] = [];
afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
});

const gpxFile = (inner: string) =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1">${inner}</gpx>`;

function form(gpx: string, fields: Record<string, string> = {}) {
  const boundary = "----gpxboundary7MA4YWxkTrZu0gW";
  const parts = Object.entries(fields).map(
    ([name, value]) => `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
  );
  parts.push(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="in.gpx"\r\nContent-Type: application/gpx+xml\r\n\r\n${gpx}\r\n--${boundary}--\r\n`,
  );
  return { payload: Buffer.from(parts.join(""), "utf8"), headers: { "content-type": `multipart/form-data; boundary=${boundary}` } };
}

type Features = TrackCollection["features"];

/** What differs between what is stored and what the exported file reads back as, apart from what the export adds on purpose. */
function lost(stored: Features, back: Features): string[] {
  const out: string[] = [];
  const kind = (feature: Features[number]) => (feature.geometry.type === "Point" ? "wpt" : (feature.properties._gpxType ?? "trk"));
  const instant = (time: string | null | undefined) => (time ? Date.parse(time) : null);
  const segmentsOf = (feature: Features[number]): number[][][] =>
    feature.geometry.type === "Point"
      ? [[feature.geometry.coordinates]]
      : feature.geometry.type === "LineString"
        ? [feature.geometry.coordinates]
        : feature.geometry.coordinates;
  const timesOf = (feature: Features[number]): Array<Array<string | null> | undefined> => {
    const times = feature.properties.coordinateProperties?.times;
    if (!times) return [];
    return feature.geometry.type === "LineString" ? [times as Array<string | null>] : (times as Array<Array<string | null>>);
  };
  // The file holds waypoints, then routes, then tracks; within each kind the order is kept.
  for (const which of ["wpt", "rte", "trk"]) {
    const a = stored.filter((feature) => kind(feature) === which);
    const b = back.filter((feature) => kind(feature) === which);
    if (a.length !== b.length) {
      out.push(`${which}: ${a.length} stored, ${b.length} read back`);
      continue;
    }
    a.forEach((feature, index) => {
      const other = b[index]!;
      for (const key of ["name", "desc", "sym"] as const) {
        // A name the export gives to something that had none is an addition, not a loss.
        if (feature.properties[key] !== undefined && feature.properties[key] !== other.properties[key]) {
          out.push(`${which} ${index} ${key}: ${JSON.stringify(feature.properties[key])} became ${JSON.stringify(other.properties[key])}`);
        }
      }
      if (which === "wpt" && instant(feature.properties.time) !== instant(other.properties.time)) out.push(`${which} ${index} time`);
      const [mine, theirs] = [segmentsOf(feature), segmentsOf(other)];
      if (mine.length !== theirs.length) {
        out.push(`${which} ${index}: ${mine.length} segments became ${theirs.length}`);
        return;
      }
      mine.forEach((segment, at) => {
        if (segment.length !== theirs[at]!.length) {
          out.push(`${which} ${index}.${at}: ${segment.length} points became ${theirs[at]!.length}`);
          return;
        }
        segment.forEach((point, n) => {
          const read = theirs[at]![n]!;
          const sameMeridian = point[0] === read[0] || (Math.abs(point[0]!) === 180 && Math.abs(read[0]!) === 180);
          if (!sameMeridian || point[1] !== read[1]) out.push(`${which} ${index}.${at}.${n}: ${point} became ${read}`);
          // Heights are written to the centimetre.
          if ((point[2] === undefined) !== (read[2] === undefined) || Math.abs((point[2] ?? 0) - (read[2] ?? 0)) > 0.005) {
            out.push(`${which} ${index}.${at}.${n} height: ${point[2]} became ${read[2]}`);
          }
          if (instant(timesOf(feature)[at]?.[n]) !== instant(timesOf(other)[at]?.[n])) out.push(`${which} ${index}.${at}.${n} time`);
        });
      });
    });
  }
  return out;
}

describe("GPX exported by a server", () => {
  it("is in the schema's order and forms, and reads back as what is stored, for every kind of thing Outpost keeps", async () => {
    const app = await createTestApp();
    apps.push(app);
    const importGpx = async (gpx: string, fields: Record<string, string> = {}) => {
      const response = await app.api("POST", "/api/maps/tracks/import", undefined, form(gpx, fields));
      expect(response.status, JSON.stringify(response.body)).toBe(200);
      return response.body.track.id as string;
    };
    const draw = async (name: string, points: Array<{ lat: number; lon: number }>) =>
      (await app.api("POST", "/api/maps/tracks", { name, description: "Drawn on the map.", points })).body.track.id as string;
    const ids: Record<string, string> = {};

    ids.route = await draw("Glen Feshie round", [
      { lat: 57.05, lon: -3.9 },
      { lat: 57.06, lon: -3.88 },
      { lat: 57.08, lon: -3.87 },
    ]);

    // Recorded on the map: every point with its time and its height.
    const recorded = gpxFile(
      `<trk><trkseg>${Array.from(
        { length: 12 },
        (_, index) =>
          `<trkpt lat="${(57.1 + index * 0.0003).toFixed(6)}" lon="${(-3.7 - index * 0.0002).toFixed(6)}"><ele>${(412.5 + index * 1.25).toFixed(2)}</ele><time>${new Date(Date.UTC(2026, 10, 14, 9, 0, index * 7, 250)).toISOString()}</time></trkpt>`,
      ).join("")}</trkseg></trk>`,
    );
    ids.recorded = "01jcabcdefghjkmnpqrstvwxyz";
    expect((await app.api("PUT", `/api/maps/recordings/${ids.recorded}`, undefined, form(recorded, { name: "Morning walk" }))).status).toBe(
      200,
    );

    ids.waypoints = await importGpx(
      gpxFile(`
        <wpt lat="54.4542" lon="-3.2116"><ele>978</ele><time>2026-06-01T10:00:00Z</time><name>Scafell Pike</name><desc>Highest ground in England</desc><sym>Summit</sym></wpt>
        <wpt lat="54.46" lon="-3.19"><name>Spring</name><sym>Drinking Water</sym></wpt>
        <wpt lat="54.47" lon="-3.18"><sym>Campground</sym></wpt>
        <trk><name>Corridor Route</name><trkseg><trkpt lat="54.47" lon="-3.18"><ele>240</ele></trkpt><trkpt lat="54.4542" lon="-3.2116"><ele>978</ele></trkpt></trkseg></trk>`),
      { name: "Scafell day" },
    );

    const odd = `Tom & Jerry's <"best"> route 🏔️ — Беинн Нибхеис / 富士山`;
    ids.special = await importGpx(
      gpxFile(`
        <wpt lat="56.7969" lon="-5.0036"><name>Summit &amp; cairn &lt;1345 m&gt; "top" 'here' 🏔️</name><desc>Ορειβασία &amp; πεζοπορία</desc><sym>Summit</sym></wpt>
        <trk><name>Беинн Нибхеис &amp; back &lt;fast&gt;</name><desc>富士山 "quoted" &amp; 'single' 🚶‍♀️</desc><trkseg><trkpt lat="56.80" lon="-5.07"/><trkpt lat="56.7969" lon="-5.0036"/></trkseg></trk>`),
      { name: odd },
    );
    await app.api("PATCH", `/api/maps/tracks/${ids.special}`, { description: `a < b && c > d; "x" 'y'; עברית; العربية; 🧭` });

    ids.unnamed = await importGpx(
      gpxFile(
        `<wpt lat="50.1" lon="-5.5"/><trk><trkseg><trkpt lat="50.1" lon="-5.5"/><trkpt lat="50.2" lon="-5.4"/></trkseg></trk><rte><rtept lat="50.3" lon="-5.3"/><rtept lat="50.4" lon="-5.2"/></rte>`,
      ),
    );

    ids.segments = await importGpx(
      gpxFile(`
        <trk><name>Ferry and far side</name>
          <trkseg><trkpt lat="57.2" lon="-5.9"><ele>3</ele><time>2026-07-04T08:00:00Z</time></trkpt><trkpt lat="57.21" lon="-5.91"><ele>4</ele><time>2026-07-04T08:05:00Z</time></trkpt></trkseg>
          <trkseg><trkpt lat="57.25" lon="-6.0"><time>2026-07-04T09:30:00+01:00</time></trkpt><trkpt lat="57.26" lon="-6.02"><time>2026-07-04T09:40:00.5+01:00</time></trkpt></trkseg>
          <trkseg><trkpt lat="57.3" lon="-6.1"/><trkpt lat="57.31" lon="-6.12"/></trkseg>
        </trk>
        <trk><name>Evening</name><trkseg><trkpt lat="57.31" lon="-6.12"><ele>-2.5</ele></trkpt><trkpt lat="57.32" lon="-6.13"><ele>0.004</ele></trkpt></trkseg></trk>`),
      { name: "Skye, three legs" },
    );

    // Times a file may give that the reader accepts and the schema does not.
    ids.loose = await importGpx(
      gpxFile(`
        <wpt lat="51.5" lon="-0.12"><time>Sun, 01 Mar 2026 12:30:00 GMT</time><name>Written out</name></wpt>
        <wpt lat="51.52" lon="-0.14"><time>2026-03-01</time><name>A date alone</name></wpt>
        <wpt lat="51.53" lon="-0.15"><time>2026-03-01 12:30:00</time><name>A space, and no zone</name></wpt>
        <trk><name>Loose times</name><trkseg><trkpt lat="51.5" lon="-0.12"><time>2026-03-01T12:30Z</time></trkpt><trkpt lat="51.51" lon="-0.13"><time>March 1, 2026 12:31:00 UTC</time></trkpt></trkseg></trk>`),
      { name: "Loose times" },
    );

    // The date line, which the schema's longitude stops just short of, on a route and on markers.
    ids.dateLine = await draw("Across the date line", [
      { lat: -16.4, lon: 179.9 },
      { lat: -16.5, lon: 180 },
      { lat: -16.6, lon: -179.9 },
    ]);
    for (const marker of [
      { name: "Date line, east", lat: 0, lon: 180 },
      { name: "Date line, west", lat: -16.5, lon: -180 },
      { name: "North Pole", lat: 90, lon: 0 },
      { name: "South Pole", lat: -90, lon: 135.123456789 },
      { name: "Just short of the line", lat: 10, lon: 179.99999996 },
      { name: 'Hut "A" & <B>', lat: 46.5, lon: 8, note: "Key under the mat; 2 < 3 & so on ☕" },
    ]) {
      expect((await app.api("POST", "/api/maps/markers", marker)).status).toBe(200);
    }

    const text = async (url: string) => {
      const response = await app.app.inject({ method: "GET", url, headers: { host: "localhost" } });
      expect(response.statusCode, url).toBe(200);
      return response.body;
    };
    for (const [name, id] of Object.entries(ids)) {
      const xml = await text(`/api/maps/tracks/${id}/export.gpx`);
      expect(faults(xml).faults, name).toEqual([]);
      const stored = (await app.api("GET", `/api/maps/tracks/${id}`)).body.track.geojson.features as Features;
      expect(lost(stored, parseGpx(xml).collection.features), name).toEqual([]);
    }

    // What the fixes changed, seen in the files themselves.
    const loose = await text(`/api/maps/tracks/${ids.loose}/export.gpx`);
    expect([...loose.matchAll(/<time>([^<]*)<\/time>/g)].map((match) => match[1])).toEqual([
      "2026-03-01T12:30:00.000Z",
      "2026-03-01T00:00:00.000Z",
      new Date(2026, 2, 1, 12, 30, 0).toISOString(),
      "2026-03-01T12:30:00.000Z",
      "2026-03-01T12:31:00.000Z",
    ]);
    expect(await text(`/api/maps/tracks/${ids.dateLine}/export.gpx`)).toContain('<trkpt lat="-16.5" lon="-180"/>');
    // Times that were in the schema's form are written exactly as the file gave them.
    const segments = await text(`/api/maps/tracks/${ids.segments}/export.gpx`);
    expect(segments).toContain("<time>2026-07-04T09:40:00.5+01:00</time>");
    expect(segments.match(/<trkseg>/g)).toHaveLength(4);
    // The special characters arrive whole, escaped where XML needs it.
    const special = parseGpx(await text(`/api/maps/tracks/${ids.special}/export.gpx`));
    expect(special.name).toBe(odd);
    expect(special.description).toBe(`a < b && c > d; "x" 'y'; עברית; العربية; 🧭`);
    expect(special.collection.features.map((feature) => feature.properties.name)).toEqual([
      "Беинн Нибхеис & back <fast>",
      `Summit & cairn <1345 m> "top" 'here' 🏔️`,
    ]);
    // Waypoints keep their symbols, and the one with nothing but a symbol keeps that.
    const waypoints = parseGpx(await text(`/api/maps/tracks/${ids.waypoints}/export.gpx`)).collection.features;
    expect(waypoints.filter((feature) => feature.geometry.type === "Point").map((feature) => feature.properties.sym)).toEqual([
      "Summit",
      "Drinking Water",
      "Campground",
    ]);

    // Markers alone, and everything together in one file.
    const markers = await text("/api/maps/export.gpx?markers=1");
    const checked = faults(markers);
    expect(checked.faults).toEqual([]);
    expect(checked.seen.longitudes).toEqual([-180, -180, 0, 135.1234568, -180, 8]);
    expect(parseGpx(markers).waypoints).toBe(6);
    const everything = await text(`/api/maps/export.gpx?markers=1&tracks=${Object.values(ids).join(",")}`);
    expect(faults(everything).faults).toEqual([]);
    const back = parseGpx(everything);
    expect(back.waypoints).toBe(6 + 3 + 1 + 1 + 3);
    // One line each, but for the file with a track and a route and the one with two tracks.
    expect(back.lines).toBe(10);
  });
});
