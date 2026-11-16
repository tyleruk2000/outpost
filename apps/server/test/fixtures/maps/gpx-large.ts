/**
 * Test-only: GPX files that are large, hostile or both, made on demand.
 *
 * Each is a file somebody could upload: under the 20 MB limit, and well-formed where it
 * matters. `security.test.ts` gives each one to a worker held to a small heap, in a
 * process of its own (`gpx-large.child.ts`), and then to the server.
 */

const OPEN = '<?xml version="1.0"?><gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1">';
const inTrack = (inner: string) => `${OPEN}<trk><trkseg>${inner}</trkseg></trk></gpx>`;

/** Where the long track goes: due north, one point a second, climbing and descending in turn. */
export const LONG_TRACK = {
  points: 150_000,
  /** Degrees of latitude between points: a little over a metre. */
  step: 0.00001,
  startLat: 10,
  lon: 20,
  /** A thousand points up, a thousand down, 4 m a point: every step up counts as climbing. */
  rise: 4,
  startTime: Date.UTC(2026, 5, 1, 4, 0, 0),
  ele(index: number): number {
    const inCycle = index % 2000;
    return 500 + this.rise * (inCycle <= 1000 ? inCycle : 2000 - inCycle);
  },
  time(index: number): string {
    return new Date(this.startTime + index * 1000).toISOString().replace(".000Z", "Z");
  },
} as const;

function longTrack(): string {
  const parts: string[] = [];
  for (let i = 0; i < LONG_TRACK.points; i += 1) {
    const lat = (LONG_TRACK.startLat + i * LONG_TRACK.step).toFixed(5);
    parts.push(`<trkpt lat="${lat}" lon="${LONG_TRACK.lon}"><ele>${LONG_TRACK.ele(i)}</ele><time>${LONG_TRACK.time(i)}</time></trkpt>\n`);
  }
  return `${OPEN}<metadata><name>A long day</name></metadata><trk><name>A long day</name><trkseg>${parts.join("")}</trkseg></trk></gpx>`;
}

function manyAttributes(): string {
  const parts: string[] = [];
  let length = 0;
  for (let i = 0; length < 19_800_000; i += 1) {
    const attribute = ` a${i}=""`;
    parts.push(attribute);
    length += attribute.length;
  }
  return `${OPEN}<trk${parts.join("")}/></gpx>`;
}

export interface LargeGpx {
  /** What the file is, in a few words. */
  title: string;
  build(): string;
  /** What Outpost says about it, or `null` when it is imported. */
  refusal: RegExp | null;
  /** Megabytes of heap its worker is held to when proving it is harmless. Outpost's own limit is 384. */
  heapMb: number;
}

export const LARGE_GPX: Record<string, LargeGpx> = {
  emptyElements: {
    title: "900,000 empty elements",
    build: () => inTrack('<a b="1"/>'.repeat(900_000)),
    refusal: /no tracks, routes or waypoints/,
    heapMb: 64,
  },
  attributesOnOneElement: {
    title: "20 MB of attributes on one element",
    build: manyAttributes,
    refusal: /more than 64 attributes/,
    heapMb: 64,
  },
  attributesOnEveryPoint: {
    title: "20 MB of points with sixty attributes each",
    build: () => {
      const extra = Array.from({ length: 60 }, (_, i) => ` x${i}="${i}"`).join("");
      return inTrack(`<trkpt lat="1" lon="1"${extra}/>`.repeat(38_000));
    },
    refusal: null,
    heapMb: 64,
  },
  deeplyNested: {
    title: "six million elements, each inside the last",
    build: () => OPEN + "<a>".repeat(6_000_000),
    refusal: /nested more than 64 deep/,
    heapMb: 64,
  },
  oneHugeText: {
    title: "one piece of text of 19 MB",
    build: () => `${OPEN}<trk><name>${"x".repeat(19_900_000)}</name></trk></gpx>`,
    refusal: /single piece of text longer than 1,000,000 characters/,
    heapMb: 64,
  },
  hugeExtensions: {
    title: "19 MB of extensions inside one point",
    build: () =>
      inTrack(
        `<trkpt lat="1" lon="1"><extensions>${"<gpxtpx:hr xmlns:gpxtpx='urn:x'>120</gpxtpx:hr>".repeat(420_000)}</extensions></trkpt><trkpt lat="2" lon="2"/>`,
      ),
    refusal: null,
    heapMb: 64,
  },
  tinyWaypoints: {
    title: "900,000 waypoints, as many as 20 MB holds",
    build: () => `${OPEN}${'<wpt lat="1" lon="1"/>'.repeat(900_000)}</gpx>`,
    refusal: /more than 20,000 waypoints/,
    heapMb: 64,
  },
  tinyTracks: {
    title: "250,000 tracks of two points",
    build: () => `${OPEN}${'<trk><trkseg><trkpt lat="1" lon="1"/><trkpt lat="1" lon="1"/></trkseg></trk>'.repeat(250_000)}</gpx>`,
    refusal: /more than 10,000 tracks and routes/,
    heapMb: 64,
  },
  longTrack: {
    title: "a day's recording: 150,000 points with height and time",
    build: longTrack,
    refusal: null,
    heapMb: 64,
  },
};
