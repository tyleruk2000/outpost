/**
 * The GPX reader on its own: what it makes of a corpus of files, what it accepts as
 * XML, and where it stops.
 *
 * The corpus and where its recorded results came from are described in
 * `fixtures/maps/gpx-corpus.ts`.
 */
import { describe, expect, it } from "vitest";
import {
  GPX_READS_AT_ONCE,
  GPX_READS_WAITING,
  type GpxWorkerUsage,
  gpxReads,
  parseGpx,
  parseGpxSafely,
  trackStats,
} from "../src/modules/maps/gpx.ts";
import { GPX_LIMITS, readGpx } from "../src/modules/maps/gpx-reader.ts";
import { XML_CLOSE, XML_END, XML_OPEN, XML_TEXT, XmlLimitError, XmlSyntaxError, XmlTokenizer } from "../src/modules/maps/gpx-xml.ts";
import { corpus, READ_DIFFERENTLY, readAsText } from "./fixtures/maps/gpx-corpus.ts";
import { WELL_FORMED_CASES } from "./fixtures/maps/gpx-well-formed.ts";

describe("the GPX corpus", () => {
  const files = corpus();

  it("has a recorded result for every file, and a reason for every file that is read differently now", () => {
    expect(files.length).toBeGreaterThanOrEqual(22);
    expect(
      files
        .map((file) => file.name)
        .filter((name) => name.startsWith("different-"))
        .sort(),
    ).toEqual(Object.keys(READ_DIFFERENTLY).sort());
  });

  for (const file of files) {
    it(`reads ${file.name}.gpx as recorded`, () => {
      expect(readAsText(readGpx, file.source)).toBe(file.expected);
    });
  }

  it("reads what the corpus is there to show", () => {
    const read = (name: string) => readGpx(files.find((file) => file.name === name)!.source);
    const lines = (name: string) => read(name).collection.features.filter((feature) => feature.geometry.type !== "Point");

    // GPX 1.0 keeps the file's name directly under <gpx>.
    expect(read("different-gpx-1.0")).toMatchObject({ name: "West Highland Way", description: "Recorded in 2004", lines: 2, waypoints: 1 });
    expect(read("gpx-1.0-unnamed-file").name).toBe("ACTIVE LOG 002");
    // Every element prefixed: the same file as far as XML is concerned.
    expect(read("different-prefixed")).toMatchObject({ name: "Prefixed throughout", lines: 1, waypoints: 1 });
    expect(read("different-byte-order-mark").name).toBe("Starts with a byte-order mark");
    // Extensions are passed over, however many there are: 400 points, each with five extension elements.
    const [run] = lines("watch-extensions");
    expect(run!.geometry.coordinates).toHaveLength(400);
    expect(run!.properties).toMatchObject({ name: "Morning Run", time: "2026-05-17T06:00:00Z" });
    expect(Object.keys(run!.properties.coordinateProperties!)).toEqual(["times"]);
    expect(read("watch-extensions").name).toBe("Morning Run");
    // Times stay with their own segment.
    expect(lines("different-untimed-segment")[0]!.properties.coordinateProperties!.times).toEqual([
      [null, null],
      ["2026-03-06T11:00:00Z", "2026-03-06T11:01:00Z"],
    ]);
    expect(lines("different-padded-times")[0]!.properties.coordinateProperties!.times).toEqual([
      "2026-03-01T10:00:00Z",
      "2026-03-01T10:00:01Z",
    ]);
    // A name belongs to the element it is directly inside.
    expect(read("different-names-below")).toMatchObject({ name: null, description: null });
    expect(read("different-names-below").collection.features.map((feature) => feature.properties)).toEqual([
      { _gpxType: "trk" },
      { _gpxType: "rte" },
      {},
    ]);
    expect(read("different-stray-elements")).toMatchObject({ lines: 1, waypoints: 0 });
    expect(lines("different-stray-elements")[0]!.geometry.coordinates).toEqual([
      [-3.4, 54.5],
      [-3.3, 54.6],
    ]);
    // CDATA, entities and numbered characters all come out as the text they stand for.
    expect(read("cdata-and-escapes")).toMatchObject({
      name: 'Tom & Ann\'s <"long"> day',
      description: 'Fish & chips <after> the "walk" — it\'s 🚶 time',
    });
    const escaped = read("cdata-and-escapes").collection.features;
    expect(escaped[0]!.properties).toEqual({ name: '<trk> & "co"', desc: "]] > is fine, and so is ]]>", _gpxType: "trk" });
    expect(escaped[1]!.properties).toEqual({ name: "Café <b>bold</b> ]]> end & more", desc: "Zürich, 北京, Ελλάδα, 😀" });
    expect(escaped[3]!.properties.name).toHaveLength(GPX_LIMITS.textLength);
    // Cut at 2,000 characters after trimming: the "z" that came 2,001st is gone, the spaces before it are not.
    expect(escaped[3]!.properties.desc).toBe("y".repeat(1990) + " ".repeat(10));
    expect(escaped[4]!.properties.name).toBe("Marked up inside the name");
  });
});

describe("the XML reader", () => {
  const events = (xml: string): string[] => {
    const reader = new XmlTokenizer(xml);
    const seen: string[] = [];
    for (;;) {
      const event = reader.next();
      if (event === XML_END) return seen;
      if (event === XML_OPEN) seen.push(`open ${reader.depth} {${reader.uri}} lat=${reader.attribute("lat")}`);
      else if (event === XML_CLOSE) seen.push(`close ${reader.depth}`);
      else if (event === XML_TEXT) seen.push(`text ${JSON.stringify(reader.text())}`);
    }
  };

  it("reports elements, their namespaces, attributes and text in order, and keeps nothing", () => {
    expect(
      events(
        '﻿<?xml version="1.0"?>\n<g:gpx xmlns:g="urn:gpx" xmlns="urn:other"><g:wpt lat="&#49;.5&amp;" lon=\'2\'>a &lt; b<![CDATA[ <c> ]]>\r\nd</g:wpt><x/></g:gpx>\n',
      ),
    ).toEqual([
      "open 1 {urn:gpx} lat=undefined",
      "open 2 {urn:gpx} lat=1.5&",
      'text "a < b"',
      'text " <c> "',
      'text "\\nd"',
      "close 1",
      "open 2 {urn:other} lat=undefined",
      "close 1",
      "close 0",
    ]);
    const reader = new XmlTokenizer("<gpx><trk/></gpx>");
    reader.next();
    expect([reader.is("gpx"), reader.is("gp"), reader.is("gpxx")]).toEqual([true, false, false]);
  });

  it("agrees with the rules of XML on what is well-formed", () => {
    const verdict = (xml: string): boolean => {
      try {
        events(xml);
        return true;
      } catch (error) {
        if (error instanceof XmlSyntaxError) return false;
        throw error;
      }
    };
    expect(WELL_FORMED_CASES.length).toBeGreaterThan(80);
    for (const item of WELL_FORMED_CASES) expect(verdict(item.xml), item.what).toBe(item.wellFormed || item.readAnyway === true);
    // The only leniency is the ampersand: nothing well-formed is marked, and each marked case has one.
    for (const item of WELL_FORMED_CASES.filter((each) => each.readAnyway)) {
      expect(item.wellFormed, item.what).toBe(false);
      expect(item.xml, item.what).toContain("&");
    }
  });

  it("reads an ampersand that starts no reference as an ampersand, and still refuses a reference XML does not define", () => {
    expect(events('<gpx><wpt lat="1" lon="2">Fish & chips, R&D &amp; Q&A&</wpt></gpx>')[2]).toBe('text "Fish & chips, R&D & Q&A&"');
    const reader = new XmlTokenizer('<gpx><link href="https://example.org/?a=1&b=2&amp;c=3&"/></gpx>');
    reader.next();
    reader.next();
    expect(reader.attribute("href")).toBe("https://example.org/?a=1&b=2&c=3&");
    // An ampersand does not hide what follows it from the other checks.
    for (const xml of [
      "<gpx>a & b &nbsp; c</gpx>",
      "<gpx>a & &#0;</gpx>",
      "<gpx>a & &#xD800;</gpx>",
      '<gpx a="a & <"/>',
      "<gpx>a & ]]></gpx>",
    ]) {
      expect(() => events(xml), xml).toThrow(XmlSyntaxError);
    }
    // In a file: the name is kept whole.
    const parsed = parseGpx(
      '<gpx><trk><name>Tom & Jerry&apos;s loop</name><trkseg><trkpt lat="1" lon="2"/><trkpt lat="1.1" lon="2"/></trkseg></trk></gpx>',
    );
    expect(parsed.name).toBe("Tom & Jerry's loop");
  });

  it("never reads a DOCTYPE, so nothing can be declared, expanded or fetched", () => {
    for (const xml of [
      '<!DOCTYPE gpx [<!ENTITY a "aaaaaaaaaa"><!ENTITY b "&a;&a;&a;&a;&a;&a;&a;&a;&a;&a;">]><gpx>&b;</gpx>',
      '<!DOCTYPE gpx SYSTEM "file:///etc/passwd"><gpx/>',
      "<!doctype gpx><gpx/>",
    ]) {
      expect(() => events(xml)).toThrow(XmlSyntaxError);
    }
  });

  it("stops at its limits instead of going on", () => {
    const limit = (xml: string): string | undefined => {
      try {
        events(xml);
        return undefined;
      } catch (error) {
        if (error instanceof XmlLimitError) return error.limit;
        throw error;
      }
    };
    const nested = (depth: number) => "<a>".repeat(depth) + "</a>".repeat(depth);
    expect(limit(nested(64))).toBeUndefined();
    expect(limit(nested(65))).toBe("depth");
    // Never closed: stopped on the way down, long before the end of the file is missed.
    expect(limit("<a>".repeat(1_000_000))).toBe("depth");

    const attributes = (count: number) => `<a${Array.from({ length: count }, (_, i) => ` k${i}="v"`).join("")}/>`;
    expect(limit(attributes(64))).toBeUndefined();
    expect(limit(attributes(65))).toBe("attributes");

    const declared = (count: number) =>
      `<a${Array.from({ length: count }, (_, i) => ` xmlns:p${i}="urn:${i}"`).join("")}><b xmlns:q="urn:q"/></a>`;
    expect(limit(declared(63))).toBeUndefined();
    expect(limit(declared(64))).toBe("namespaces");

    for (const [before, after] of [
      ["<a>", "</a>"],
      ["<a><![CDATA[", "]]></a>"],
      ['<a b="', '"/>'],
      ["<a><!--", "--></a>"],
      ["<a><?p ", "?></a>"],
      ["<a/>", ""],
    ] as const) {
      expect(limit(before + " ".repeat(990_000) + after), before).toBeUndefined();
      expect(limit(before + " ".repeat(1_000_001) + after), before).toBe("run");
    }
  });
});

describe("what a GPX file may hold", () => {
  const gpx = (inner: string) => `<gpx>${inner}</gpx>`;
  const message = (source: string): string | undefined => {
    try {
      readGpx(source);
      return undefined;
    } catch (error) {
      return (error as Error).message;
    }
  };
  const POINT = '<trkpt lat="1" lon="1"/>';
  const TWO = POINT + POINT;

  it("states its limits", () => {
    expect(GPX_LIMITS).toEqual({
      linePoints: 1_000_000,
      waypoints: 20_000,
      lines: 10_000,
      segments: 100_000,
      textLength: 2000,
      depth: 64,
      attributes: 64,
      namespaces: 64,
      run: 1_000_000,
    });
  });

  it("reads a file at each limit and refuses one over it, saying which", () => {
    const waypoints = (count: number) => gpx('<wpt lat="1" lon="1"/>'.repeat(count));
    expect(readGpx(waypoints(20_000)).waypoints).toBe(20_000);
    expect(message(waypoints(20_001))).toBe(
      "That GPX file has more than 20,000 waypoints. Split it into smaller files and import them one at a time.",
    );

    const tracks = (count: number) => gpx(`<trk><trkseg>${TWO}</trkseg></trk>`.repeat(count));
    expect(readGpx(tracks(10_000)).lines).toBe(10_000);
    expect(message(tracks(10_001))).toBe(
      "That GPX file has more than 10,000 tracks and routes. Split it into smaller files and import them one at a time.",
    );
    // Routes count with tracks, and so do tracks with nothing in them.
    expect(message(gpx(`<rte/>${"<trk/>".repeat(10_000)}`))).toMatch(/more than 10,000 tracks and routes/);

    const segments = (count: number) => gpx(`<trk>${`<trkseg>${TWO}</trkseg>`.repeat(count)}</trk>`);
    const most = readGpx(segments(100_000));
    expect(most.collection.features[0]!.geometry.coordinates).toHaveLength(100_000);
    // The arithmetic that follows copes with that many segments too.
    expect(trackStats(most.collection)).toMatchObject({ pointCount: 200_000, distanceMeters: 0 });
    expect(message(segments(100_001))).toBe(
      "That GPX file has more than 100,000 track segments. Split it into smaller files and import them one at a time.",
    );

    // A million points do not fit in 20 MB, so only the count is tested here: these have no position.
    const points = (inTrack: number, inRoute: number) =>
      gpx(`<trk><trkseg>${"<trkpt/>".repeat(inTrack)}${TWO}</trkseg></trk><rte>${"<rtept/>".repeat(inRoute)}</rte>`);
    expect(readGpx(points(999_990, 8)).lines).toBe(1);
    expect(message(points(999_990, 9))).toBe(
      "That GPX file has more than 1,000,000 track and route points. Split it into smaller files and import them one at a time.",
    );

    expect(message(gpx(`<trk><trkseg>${TWO}${"<a>".repeat(61)}${"</a>".repeat(61)}</trkseg></trk>`))).toBeUndefined();
    expect(message(gpx(`<trk><trkseg>${"<a>".repeat(62)}`))).toBe(
      "That GPX file has elements nested more than 64 deep, which GPX never needs, so Outpost will not read it.",
    );
    expect(message(gpx(`<trk${Array.from({ length: 65 }, (_, i) => ` a${i}=""`).join("")}/>`))).toBe(
      "That GPX file has an element with more than 64 attributes, which GPX never needs, so Outpost will not read it.",
    );
    const declarations = (prefix: string) => Array.from({ length: 40 }, (_, i) => ` xmlns:${prefix}${i}="urn:${i}"`).join("");
    expect(message(gpx(`<trk${declarations("a")}><trkseg${declarations("b")}/></trk>`))).toBe(
      "That GPX file declares more than 64 XML namespaces in one place, which GPX never needs, so Outpost will not read it.",
    );
    expect(message(gpx(`<trk><name>${"x".repeat(1_000_001)}</name></trk>`))).toBe(
      "That GPX file has a single piece of text longer than 1,000,000 characters, which GPX never needs, so Outpost will not read it.",
    );
  });

  it("cuts a long name rather than refusing the file, however the name is written", () => {
    const named = (name: string) => readGpx(gpx(`<wpt lat="1" lon="1"><name>${name}</name></wpt>`)).collection.features[0]!.properties.name;
    expect(named("n".repeat(5000))).toBe("n".repeat(2000));
    expect(named(`  ${"n".repeat(1999)}   `)).toBe("n".repeat(1999));
    // Cut after trimming, exactly as before: white space that falls inside the first 2,000 characters stays.
    expect(named(`${"n".repeat(1990)}${" ".repeat(20)}tail`)).toBe(`${"n".repeat(1990)}${" ".repeat(10)}`);
    expect(named(`${"n".repeat(1990)}${" ".repeat(20)}`)).toBe("n".repeat(1990));
    // In many pieces: 3,000 one-letter pieces with a comment between each.
    expect(named("n<!---->".repeat(3000))).toBe("n".repeat(2000));
    expect(named(`${"<![CDATA[ab]]>".repeat(1500)}&amp;`)).toBe("ab".repeat(1000));
    // 900,000 characters of name are read past, not kept.
    expect(named(`short${" ".repeat(900_000)}`)).toBe("short");
  });

  it("does not take a long string for a time or a height", () => {
    const point = (inner: string) =>
      readGpx(gpx(`<trk><trkseg><trkpt lat="1" lon="1">${inner}</trkpt><trkpt lat="2" lon="2">${inner}</trkpt></trkseg></trk>`)).collection
        .features[0]!;
    // Node reads "2000 (anything at all)" as a date; a megabyte of it on every point is not a time.
    expect(point(`<time>2000 (${"a".repeat(50)})</time>`).properties.coordinateProperties).toEqual({
      times: Array(2).fill(`2000 (${"a".repeat(50)})`),
    });
    expect(point(`<time>2000 (${"a".repeat(200)})</time>`).properties).toEqual({ _gpxType: "trk" });
    expect(point(`<ele>${" ".repeat(500)}12.34${" ".repeat(500)}</ele>`).geometry.coordinates).toEqual([
      [1, 1, 12.3],
      [2, 2, 12.3],
    ]);
  });

  it("tells a file that is not GPX that it is not GPX, even when it is over a limit", () => {
    const notGpx = "That file is XML but not GPX. Export the route as GPX and try again.";
    expect(message(`<kml><coordinates>${"1,1 ".repeat(300_000)}</coordinates></kml>`)).toBe(notGpx);
    expect(message(`<html>${"<div>".repeat(100)}`)).toBe(notGpx);
    expect(message("<kml><Placemark/></kml>")).toBe(notGpx);
    // Still XML that is not well-formed, when that is what it is.
    expect(message("<html><body><br></body></html>")).toBe("That file is not well-formed XML, so it cannot be read as GPX.");
  });
});

describe("reading a GPX file as the server does", () => {
  const WAYPOINT = '<gpx><wpt lat="1" lon="2"><name>Here</name></wpt></gpx>';

  it("reads a file that starts with a byte-order mark, as bytes and as text", () => {
    const bytes = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>\n${WAYPOINT}`)]);
    expect(parseGpx(bytes.toString("utf8")).collection.features[0]!.properties.name).toBe("Here");
    // Only at the very start: anywhere else it is a character like any other.
    expect(() => parseGpx(`\uFEFF\uFEFF${WAYPOINT}`)).toThrow(/not well-formed XML/);
    expect(() => parseGpx(` \uFEFF${WAYPOINT}`)).toThrow(/not well-formed XML/);
  });

  it("says so when a file is saved as UTF-16, which it cannot read", () => {
    for (const encoded of [
      Buffer.from(`\uFEFF<?xml version="1.0" encoding="UTF-16"?>${WAYPOINT}`, "utf16le"),
      Buffer.from(WAYPOINT, "utf16le"),
      Buffer.from(`\uFEFF${WAYPOINT}`, "utf16le").swap16(),
      Buffer.from(WAYPOINT, "utf16le").swap16(),
    ]) {
      expect(() => parseGpx(encoded.toString("utf8"))).toThrow(
        "That file is saved as UTF-16 text, which Outpost cannot read. Save or export it as UTF-8 and try again.",
      );
    }
  });

  it("refuses a DOCTYPE wherever and however it is written, before reading anything", () => {
    for (const source of [
      `<!DOCTYPE gpx>${WAYPOINT}`,
      `<?xml version="1.0"?>\n<!doctype gpx [<!ENTITY a "b">]>${WAYPOINT}`,
      `<gpx><!ENTITY a "b"><wpt lat="1" lon="2"/></gpx>`,
      // Even inside a comment or CDATA, where it would do nothing: no GPX file needs the words.
      `<gpx><!-- <!DOCTYPE gpx> --><wpt lat="1" lon="2"/></gpx>`,
    ]) {
      expect(() => parseGpx(source)).toThrow(/DOCTYPE or entities/);
    }
  });

  it("reads two files at a time, lets six wait their turn, and turns away the one after that", async () => {
    const file = '<gpx><wpt lat="1" lon="2"><name>Spring</name></wpt></gpx>';
    const line = GPX_READS_AT_ONCE + GPX_READS_WAITING;
    expect(gpxReads()).toEqual({ reading: 0, waiting: 0 });
    const burst = Array.from({ length: line + 1 }, () => parseGpxSafely(file));
    expect(gpxReads()).toEqual({ reading: GPX_READS_AT_ONCE, waiting: GPX_READS_WAITING });
    const settled = await Promise.allSettled(burst);
    expect(settled.map((result) => result.status)).toEqual([...Array(line).fill("fulfilled"), "rejected"]);
    expect((settled.at(-1) as PromiseRejectedResult).reason).toMatchObject({
      code: "conflict",
      message: expect.stringMatching(/already reading several GPX files/),
    });
    expect(gpxReads()).toEqual({ reading: 0, waiting: 0 });

    // A file the reader refuses gives its place back as a file it reads does.
    const refused = Array.from({ length: line }, () => parseGpxSafely("<gpx></gpx>"));
    expect(gpxReads()).toEqual({ reading: GPX_READS_AT_ONCE, waiting: GPX_READS_WAITING });
    expect((await Promise.allSettled(refused)).every((result) => result.status === "rejected")).toBe(true);
    expect(gpxReads()).toEqual({ reading: 0, waiting: 0 });
    await expect(parseGpxSafely(file)).resolves.toMatchObject({ waypoints: 1 });
  });

  it("gives the same answer from the worker as from the reader, and says what it cost", async () => {
    for (const file of corpus()) {
      let usage: GpxWorkerUsage | undefined;
      const parsed = await parseGpxSafely(file.source, {
        onUsage: (told) => {
          usage = told;
        },
      });
      expect(JSON.stringify({ ...parsed, stats: trackStats(parsed.collection) }), file.name).toBe(file.expected);
      expect(usage!.heapBytes).toBeGreaterThan(1_000_000);
      expect(usage!.heapBytes).toBeLessThan(64 * 1024 * 1024);
      expect(usage!.milliseconds).toBeLessThan(5000);
    }
    await expect(parseGpxSafely("<gpx></gpx>")).rejects.toMatchObject({
      code: "bad_request",
      message: "That GPX file has no tracks, routes or waypoints in it.",
    });
    await expect(parseGpxSafely(`<gpx>${"<a>".repeat(100)}`)).rejects.toMatchObject({
      code: "bad_request",
      message: expect.stringMatching(/nested more than 64 deep/),
    });
  });
});
