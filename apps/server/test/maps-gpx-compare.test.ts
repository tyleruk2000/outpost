/**
 * The reader that builds a tree (`parseGpx`, as it stands in this commit) and the
 * streaming reader that is about to replace it (`readGpx`), side by side.
 *
 * This file exists for one commit: it is the evidence that the two read GPX alike, and
 * the list of where they do not. The next commit removes the old reader and this file
 * with it; the corpus and its recorded results stay, in `maps-gpx-reader.test.ts`.
 */
import { describe, expect, it } from "vitest";
import { parseGpx as readWithTree } from "../src/modules/maps/gpx.ts";
import { readGpx } from "../src/modules/maps/gpx-reader.ts";
import { corpus, READ_DIFFERENTLY, readAsText } from "./fixtures/maps/gpx-corpus.ts";
import { WELL_FORMED_CASES } from "./fixtures/maps/gpx-well-formed.ts";

const outcome = (read: typeof readGpx, source: string): string => {
  try {
    return readAsText(read, source);
  } catch (error) {
    return `refused: ${(error as Error).message}`;
  }
};

describe("the tree-building reader and the streaming reader", () => {
  const files = corpus();
  const alike = files.filter((file) => !(file.name in READ_DIFFERENTLY));
  const different = files.filter((file) => file.name in READ_DIFFERENTLY);

  it("read every file of the corpus alike, to the letter, but for the seven with a stated reason", () => {
    expect(alike.length).toBeGreaterThanOrEqual(15);
    expect(different).toHaveLength(7);
    for (const file of alike) {
      const before = outcome(readWithTree, file.source);
      expect(outcome(readGpx, file.source), file.name).toBe(before);
      // The recorded result is the old reader's own.
      expect(file.expected, file.name).toBe(before);
    }
    for (const file of different) {
      expect(outcome(readGpx, file.source), file.name).not.toBe(outcome(readWithTree, file.source));
      expect(outcome(readGpx, file.source), file.name).toBe(file.expected);
    }
  });

  it("differ on those seven in the way stated", () => {
    const treeRead = (name: string) =>
      JSON.parse(
        outcome(readWithTree, different.find((file) => file.name === name)!.source).replace(/^refused: (.*)$/s, '{"refused":"$1"}'),
      );
    expect(treeRead("different-byte-order-mark").refused).toMatch(/not well-formed XML/);
    expect(treeRead("different-prefixed").refused).toMatch(/no tracks, routes or waypoints/);
    expect(treeRead("different-gpx-1.0")).toMatchObject({ name: "ACTIVE LOG 001", description: null });
    expect(treeRead("different-padded-times").collection.features[0].properties).toEqual({
      name: "Times with space around them",
      time: "2026-03-01T10:00:00Z",
      _gpxType: "trk",
    });
    expect(treeRead("different-untimed-segment").collection.features[0].properties.coordinateProperties.times).toEqual([
      ["2026-03-06T11:00:00Z", "2026-03-06T11:01:00Z"],
      [null, null],
    ]);
    expect(treeRead("different-names-below").collection.features.map((feature: { properties: unknown }) => feature.properties)).toEqual([
      { name: "A named track point", desc: "With a comment", _gpxType: "trk" },
      { name: "St Bees", desc: "Start here", _gpxType: "rte" },
      { name: "A name inside extensions", time: "2020-01-01T00:00:00Z" },
    ]);
    expect(treeRead("different-names-below").collection.features[2].geometry.coordinates).toEqual([-3.2, 54.7, 999]);
    expect(treeRead("different-stray-elements")).toMatchObject({
      lines: 2,
      waypoints: 1,
      name: "A track inside extensions is not a track of this file",
    });
    expect(treeRead("different-stray-elements").collection.features[1].geometry.coordinates).toEqual([
      [-3.4, 54.5, 5000],
      [-3.3, 54.6],
      [9, 9],
    ]);
  });

  it("agree on what is XML wherever the table says the old reader was right", () => {
    let readNow = 0;
    let refusedNow = 0;
    for (const item of WELL_FORMED_CASES) {
      const wasRead = !/not well-formed XML/.test(outcome(readWithTree, item.xml));
      expect(wasRead ? "read" : "refused", item.what).toBe(item.before);
      const isRead = !/not well-formed XML/.test(outcome(readGpx, item.xml));
      expect(isRead, item.what).toBe(item.wellFormed);
      if (isRead && !wasRead) readNow += 1;
      if (!isRead && wasRead) refusedNow += 1;
    }
    // A byte-order mark, with and without an XML declaration after it.
    expect(readNow).toBe(2);
    // Twenty documents that are not XML and were read all the same.
    expect(refusedNow).toBe(20);
  });

  it("read two thousand generated files alike", () => {
    // A small generator with a fixed seed: tracks, segments, routes and waypoints in any
    // order, with and without heights, times, names, comments and extensions.
    let seed = 20261116;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 2 ** 32;
    };
    const chance = (p: number) => random() < p;
    const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)]!;
    const number = () =>
      pick(["54.5", "-3.25", "0", "91", "-181", "1e1", " 12.5 ", "abc", "", "7,5", "+8", "45.1234567", "-0.0000004", "90", "180"]);
    const text = () =>
      pick([
        "Plain",
        "  padded  ",
        "A &amp; B",
        "<![CDATA[<raw> & ]]>",
        "",
        "   ",
        "Zürich 山 😀",
        "line\none",
        "&#65;&#x42;",
        "x".repeat(2100),
      ]);
    const time = () => pick(["2026-06-14T08:05:00Z", "2026-06-14T08:05:00.5+02:00", "2026-06-14", "not a time", "14 June 2026"]);
    const extensions = () =>
      chance(0.3)
        ? `<extensions><x:TrackPointExtension xmlns:x="urn:x"><x:hr>${Math.floor(random() * 200)}</x:hr></x:TrackPointExtension><power>250</power></extensions>`
        : "";
    const field = (tag: string, p: number, value: () => string = text) => (chance(p) ? `<${tag}>${value()}</${tag}>` : "");
    const point = (tag: string, timed: boolean) =>
      `<${tag} lat="${number()}" lon="${number()}">${field("ele", 0.6, () => pick(["100", "101.26", "-5", "abc", "", " 7 ", "1e2"]))}${
        timed && chance(0.95) ? `<time>${time()}</time>` : ""
      }${extensions()}</${tag}>`;
    const describeIt = () => field("name", 0.8) + field("cmt", 0.3) + field("desc", 0.4) + field("type", 0.2);
    const track = () => {
      // Either every segment has times or none has: the old reader mixed segments up otherwise.
      const timed = chance(0.6);
      const segments = Array.from({ length: Math.floor(random() * 4) }, () => {
        const points = Array.from({ length: Math.floor(random() * 6) }, () => point("trkpt", timed));
        // A timed segment keeps at least one time, for the same reason.
        if (timed && points.length > 0) points[0] = `<trkpt lat="1" lon="2"><time>2026-01-01T00:00:00Z</time></trkpt>`;
        return `<trkseg>${points.join("")}</trkseg>`;
      });
      // Named always: the old reader would otherwise borrow a name from below.
      return `<trk><name>${text() || "t"}</name>${field("cmt", 0.3)}${field("desc", 0.4)}${segments.join("")}</trk>`;
    };
    const route = () =>
      `<rte><name>${text() || "r"}</name>${field("cmt", 0.3)}<desc>d</desc>${Array.from({ length: Math.floor(random() * 5) }, () => point("rtept", chance(0.5))).join("")}</rte>`;
    const waypoint = () =>
      `<wpt lat="${number()}" lon="${number()}">${field("ele", 0.5, () => pick(["12", "x", "3.33"]))}${field("time", 0.5, time)}${describeIt()}${field("sym", 0.4)}</wpt>`;
    const file = () => {
      const parts = Array.from({ length: Math.floor(random() * 7) }, () => pick([track, track, route, waypoint])());
      const metadata = chance(0.5)
        ? `<metadata>${field("name", 0.7)}${field("desc", 0.5)}<time>2026-01-01T00:00:00Z</time></metadata>`
        : "";
      const namespace = chance(0.7) ? ' xmlns="http://www.topografix.com/GPX/1/1"' : "";
      return `${chance(0.5) ? '<?xml version="1.0" encoding="UTF-8"?>\n' : ""}<gpx version="1.1"${namespace}>${metadata}${parts.join("\n")}</gpx>`;
    };

    let read = 0;
    for (let i = 0; i < 2000; i += 1) {
      const source = file();
      const before = outcome(readWithTree, source);
      expect(outcome(readGpx, source), source).toBe(before);
      if (!before.startsWith("refused")) read += 1;
    }
    // Most of them are files with something in them, not refusals that agree trivially.
    expect(read).toBeGreaterThan(1200);
  });
});
