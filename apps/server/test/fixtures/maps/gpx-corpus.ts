/**
 * Test-only: the corpus of GPX files, and what each is read as.
 *
 * The files are `fairfield.gpx` and everything in `gpx/`. What each reads as is beside
 * them in `gpx/expected/`, statistics included. Those answers were written by the
 * reader before this one (a tree built with `@xmldom/xmldom`, converted by
 * `@tmcw/togeojson`) for every file the two read alike, and the two were compared file
 * by file in the commit that added the corpus; so the corpus holds the new reader to
 * the old one's results, down to the order of properties. The files named
 * `different-…` are the ones the old reader got wrong or refused. Their recorded
 * results are the new reader's, and `READ_DIFFERENTLY` says what the old one did.
 */
import fs from "node:fs";
import path from "node:path";
import type { ParsedGpx } from "../../../src/modules/maps/gpx.ts";
import { trackStats } from "../../../src/modules/maps/gpx.ts";

const MAPS = import.meta.dirname;
const CORPUS = path.join(MAPS, "gpx");

/** Every GPX file among the fixtures, by the name its expected result is filed under. */
export const corpus = (): Array<{ name: string; source: string; expected: string }> =>
  [
    path.join(MAPS, "fairfield.gpx"),
    ...fs
      .readdirSync(CORPUS)
      .filter((file) => file.endsWith(".gpx"))
      .sort()
      .map((file) => path.join(CORPUS, file)),
  ].map((file) => {
    const name = path.basename(file, ".gpx");
    const expected = JSON.parse(fs.readFileSync(path.join(CORPUS, "expected", `${name}.json`), "utf8"));
    return { name, source: fs.readFileSync(file, "utf8"), expected: JSON.stringify(expected) };
  });

/** A file as read, with its statistics, as text: the order of properties counts, because it is what gets stored. */
export const readAsText = (read: (source: string) => ParsedGpx, source: string): string => {
  const parsed = read(source);
  return JSON.stringify({ ...parsed, stats: trackStats(parsed.collection) });
};

/** What the reader before this one did with the files that are now read differently. */
export const READ_DIFFERENTLY: Record<string, string> = {
  "different-byte-order-mark": "Refused as not well-formed XML: a byte-order mark, which Windows programs often write, was not expected.",
  "different-prefixed": "Refused as having no tracks: elements were found by their written name, so <gpx:trk> was not a track.",
  "different-gpx-1.0":
    "Named after its first track: the file's own <name> and <desc>, which GPX 1.0 keeps directly under <gpx>, were not read.",
  "different-padded-times":
    "Lost every point's time: a time with white space around it was not recognised as a time. (The track's own time, read another way, was kept.)",
  "different-untimed-segment": "Gave the second segment's times to the first segment, and none to the second.",
  "different-names-below":
    "Took a name, description, height or time from anywhere below: a route was named after its first point, a track after a track point, a waypoint after its extensions.",
  "different-stray-elements":
    "Read tracks, waypoints, points, heights and times wherever they appeared, including inside <extensions>, where they are another program's private data.",
};
