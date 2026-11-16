/**
 * Saving a track recorded on the map: `PUT /api/maps/recordings/:id`. The device sends
 * GPX it built itself; the server reads it like any other GPX, checks that it is a
 * recording, and keeps it under the id the device chose.
 */
import {
  haversineMeters,
  MAX_RECORDING_POINTS,
  type RecordingSaveResponse,
  type TrackDto,
  type TrackWithGeometryDto,
} from "@outpost/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestApp, type TestApp } from "./helpers.ts";

let app: TestApp;
beforeEach(async () => {
  app = await createTestApp();
});
afterEach(async () => {
  await app.close();
});

const ID = "01jcsz5k9d0000000000000000";
const OTHER_ID = "01jcsz5k9d0000000000000001";

interface Point {
  lat: number;
  lon: number;
  ele?: number;
  time?: string;
}

const trkpt = (point: Point) =>
  `<trkpt lat="${point.lat}" lon="${point.lon}">${point.ele === undefined ? "" : `<ele>${point.ele}</ele>`}${point.time ? `<time>${point.time}</time>` : ""}</trkpt>`;

/** GPX as the map builds it for a recording: one track, one segment for each stretch between pauses. */
function recordingGpx(segments: Point[][], extra = ""): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Outpost" xmlns="http://www.topografix.com/GPX/1/1">\n<metadata><name>From the device</name></metadata>\n${extra}<trk><name>From the device</name>\n${segments
    .map((segment) => `<trkseg>\n${segment.map(trkpt).join("\n")}\n</trkseg>`)
    .join("\n")}\n</trk>\n</gpx>\n`;
}

/**
 * Two stretches with a pause between them. The climb is 100 → 104 → 110 (4 m and 6 m),
 * then 108 → 107 → 111: the fall of 1 m is under the 3 m that counts, so the rise is
 * measured from 108 and is 3 m. 13 m in all.
 */
const FIRST: Point[] = [
  { lat: 54.46, lon: -3.09, ele: 100, time: "2026-11-16T10:00:00Z" },
  { lat: 54.4601, lon: -3.09, ele: 104, time: "2026-11-16T10:00:10Z" },
  { lat: 54.4602, lon: -3.0898, ele: 110, time: "2026-11-16T10:00:20Z" },
];
const SECOND: Point[] = [
  { lat: 54.461, lon: -3.0895, ele: 108, time: "2026-11-16T10:05:00Z" },
  { lat: 54.4611, lon: -3.0895, ele: 107, time: "2026-11-16T10:05:10Z" },
  { lat: 54.4612, lon: -3.0893, ele: 111, time: "2026-11-16T10:05:20Z" },
];
const lengthOf = (line: Point[]) =>
  line.slice(1).reduce((sum, point, index) => sum + haversineMeters(line[index]!.lat, line[index]!.lon, point.lat, point.lon), 0);

function multipart(content: string | Buffer, fields: Record<string, string>) {
  const boundary = "----outpost-test-boundary";
  const parts: Buffer[] = [];
  for (const [name, value] of Object.entries(fields)) {
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`));
  }
  parts.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="recording.gpx"\r\nContent-Type: application/gpx+xml\r\n\r\n`,
    ),
    Buffer.isBuffer(content) ? content : Buffer.from(content),
    Buffer.from(`\r\n--${boundary}--\r\n`),
  );
  return { payload: Buffer.concat(parts), headers: { "content-type": `multipart/form-data; boundary=${boundary}` } };
}

type Answer = RecordingSaveResponse & { error?: { code: string; message: string } };

async function save(id: string, content: string, fields: Record<string, string> = { name: "Evening round" }) {
  const { payload, headers } = multipart(content, fields);
  return app.api<Answer>("PUT", `/api/maps/recordings/${id}`, payload, { headers });
}

const listed = async () => (await app.api<{ tracks: TrackDto[] }>("GET", "/api/maps/tracks")).body.tracks;

describe("saving a recording", () => {
  it("keeps it as a track under the device's id, with its times, and exports it as GPX with those times", async () => {
    const saved = await save(ID, recordingGpx([FIRST, SECOND]), { name: "Evening round", color: "violet" });
    expect(saved.status).toBe(200);
    expect(saved.body.alreadySaved).toBe(false);
    const track = saved.body.track;
    expect(track).toMatchObject({ id: ID, name: "Evening round", color: "violet", sourceFilename: null, pointCount: 6, ascentMeters: 13 });
    // The pause is not walked: the two stretches are added up, the gap between them is not.
    expect(track.distanceMeters).toBeCloseTo(lengthOf(FIRST) + lengthOf(SECOND), 1);
    expect(track.distanceMeters).toBeLessThan(lengthOf([...FIRST, ...SECOND]) - 50);

    const full = (await app.api<{ track: TrackWithGeometryDto }>("GET", `/api/maps/tracks/${ID}`)).body.track;
    expect(full.geojson.features).toHaveLength(1);
    const line = full.geojson.features[0] as {
      properties: Record<string, unknown> & { coordinateProperties: { times: string[][] } };
      geometry: { type: string; coordinates: number[][][] };
    };
    expect(line.geometry.type).toBe("MultiLineString");
    expect(line.geometry.coordinates.map((segment) => segment.length)).toEqual([3, 3]);
    expect(line.properties._recorded).toBe(true);
    // The name the device wrote inside the file is not kept: the track's own name is the one that counts.
    expect(line.properties).not.toHaveProperty("name");
    expect(line.properties.coordinateProperties.times).toEqual([FIRST.map((point) => point.time), SECOND.map((point) => point.time)]);

    const exported = await app.app.inject({ method: "GET", url: `/api/maps/tracks/${ID}/export.gpx`, headers: { host: "localhost" } });
    expect(exported.statusCode).toBe(200);
    expect(exported.body.match(/<trkseg>/g)).toHaveLength(2);
    expect([...exported.body.matchAll(/<time>([^<]+)<\/time>/g)].map((match) => match[1])).toEqual(
      [...FIRST, ...SECOND].map((point) => point.time),
    );
    expect(exported.body).toContain("<trk>\n    <name>Evening round</name>");

    // Renamed, it is exported under the new name.
    await app.api("PATCH", `/api/maps/tracks/${ID}`, { name: "Round by the tarn" });
    const again = await app.app.inject({ method: "GET", url: `/api/maps/tracks/${ID}/export.gpx`, headers: { host: "localhost" } });
    expect(again.body).toContain("<trk>\n    <name>Round by the tarn</name>");
    expect(again.body).not.toContain("From the device");

    // Found by search, like any other track.
    const found = await app.api<{ results: Array<{ kind: string; title: string }> }>("GET", "/api/search?q=tarn");
    expect(found.body.results.some((result) => result.kind === "track" && result.title === "Round by the tarn")).toBe(true);
  });

  it("answers a second save of the same recording with the track that is already there", async () => {
    const first = await save(ID, recordingGpx([FIRST]));
    expect(first.body.alreadySaved).toBe(false);
    // The retry may even carry different points or another name: nothing saved is replaced.
    const second = await save(ID, recordingGpx([FIRST, SECOND]), { name: "Sent again" });
    expect(second.status).toBe(200);
    expect(second.body.alreadySaved).toBe(true);
    expect(second.body.track).toMatchObject({ id: ID, name: "Evening round", pointCount: 3 });
    expect(await listed()).toHaveLength(1);
  });

  it("keeps one track when the same recording arrives twice at the same moment", async () => {
    const [one, two] = await Promise.all([save(ID, recordingGpx([FIRST, SECOND])), save(ID, recordingGpx([FIRST, SECOND]))]);
    expect([one.status, two.status]).toEqual([200, 200]);
    expect([one.body.alreadySaved, two.body.alreadySaved].sort()).toEqual([false, true]);
    expect(await listed()).toHaveLength(1);
  });

  it("refuses what is not a recording, and says why", async () => {
    const refusals: Array<[string, Promise<{ status: number; body: Answer }>, RegExp]> = [
      ["an id that is not one", save("not-an-id", recordingGpx([FIRST])), /not the id of a recording/],
      ["an id with letters ids never have", save("01jcsz5k9d000000000000000u", recordingGpx([FIRST])), /not the id of a recording/],
      ["no name", save(ID, recordingGpx([FIRST]), {}), /Give the recording a name/],
      ["a blank name", save(ID, recordingGpx([FIRST]), { name: "   " }), /Give the recording a name/],
      ["a colour that is not one", save(ID, recordingGpx([FIRST]), { name: "A", color: "puce" }), /./],
      [
        "a waypoint beside the track",
        save(ID, recordingGpx([FIRST], '<wpt lat="54.46" lon="-3.09"><name>Cairn</name></wpt>\n')),
        /holds a track and nothing else/,
      ],
      [
        "a route beside the track",
        save(ID, recordingGpx([FIRST], '<rte><rtept lat="54.46" lon="-3.09"/><rtept lat="54.47" lon="-3.09"/></rte>\n')),
        /holds a track and nothing else/,
      ],
      [
        "points without times",
        save(ID, recordingGpx([FIRST.map(({ time: _time, ...point }) => point)])),
        /Every point of a recording carries the time it was taken/,
      ],
      [
        "one stretch without times",
        save(ID, recordingGpx([FIRST, SECOND.map(({ time: _time, ...point }) => point)])),
        /Every point of a recording carries the time it was taken/,
      ],
      [
        "a time that is not a time",
        save(ID, recordingGpx([[FIRST[0]!, { ...FIRST[1]!, time: "half past ten" }, FIRST[2]!]])),
        /Every point of a recording carries the time it was taken/,
      ],
      ["a file that is not GPX", save(ID, "this is not a recording"), /not well-formed XML/],
      ["a file with a DOCTYPE", save(ID, `<!DOCTYPE gpx>${recordingGpx([FIRST])}`), /DOCTYPE/],
    ];
    for (const [what, request, message] of refusals) {
      const refused = await request;
      expect(refused.status, what).toBe(400);
      expect(refused.body.error?.message, what).toMatch(message);
    }
    expect(await listed()).toEqual([]);
  });

  it("refuses a recording with more points than the map will record", async () => {
    const start = Date.parse("2026-11-16T06:00:00Z");
    const points = Array.from({ length: MAX_RECORDING_POINTS + 1 }, (_, index) => ({
      lat: 54 + index * 0.00001,
      lon: -3,
      time: new Date(start + index * 1000).toISOString(),
    }));
    const refused = await save(ID, recordingGpx([points]));
    expect(refused.status).toBe(400);
    expect(refused.body.error?.message).toBe("That recording has 150,001 points, and one recording can hold at most 150,000.");
    expect(await listed()).toEqual([]);
  });

  it("needs the header every change needs, and is not a way round the size limit", async () => {
    const { payload, headers } = multipart(recordingGpx([FIRST]), { name: "Evening round" });
    const bare = await app.app.inject({
      method: "PUT",
      url: `/api/maps/recordings/${ID}`,
      payload,
      headers: { host: "localhost", ...headers },
    });
    expect(bare.statusCode).toBe(403);

    const filler = `<!-- ${"x".repeat(1_000_000)} -->\n`.repeat(21);
    const tooLarge = await save(OTHER_ID, recordingGpx([FIRST], filler));
    expect(tooLarge.status).toBe(413);
    expect(tooLarge.body.error?.message).toMatch(/larger than 20 MB/);
    expect(await listed()).toEqual([]);
  });

  it("saves a day at one point a second without holding the server up", async () => {
    // 86,400 points with a height and a time each: 24 hours at one a second.
    const start = Date.parse("2026-11-16T00:00:00Z");
    const points = Array.from({ length: 86_400 }, (_, index) => ({
      lat: Number((54 + index * 0.00001).toFixed(6)),
      lon: Number((-3 + Math.sin(index / 500) * 0.01).toFixed(6)),
      ele: Number((300 + Math.sin(index / 900) * 120).toFixed(1)),
      time: new Date(start + index * 1000).toISOString().replace(".000Z", "Z"),
    }));
    const gpx = recordingGpx([points]);
    const { payload, headers } = multipart(gpx, { name: "A whole day" });

    // While it is saved, the server is asked for something else every few milliseconds, and a
    // timer that should fire every 2 ms notes the longest it was kept waiting: that is how long
    // the server's own thread was held by one piece of work.
    let waiting = true;
    let slowest = 0;
    let answered = 0;
    let longestStall = 0;
    let lastTick = performance.now();
    const ticker = setInterval(() => {
      const now = performance.now();
      longestStall = Math.max(longestStall, now - lastTick);
      lastTick = now;
    }, 2);
    const others = (async () => {
      while (waiting) {
        const asked = performance.now();
        const health = await app.app.inject({ method: "GET", url: "/api/health", headers: { host: "localhost" } });
        expect(health.statusCode).toBe(200);
        slowest = Math.max(slowest, performance.now() - asked);
        answered += 1;
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
    })();

    const began = performance.now();
    const saved = await app.api<Answer>("PUT", `/api/maps/recordings/${ID}`, payload, { headers });
    const took = performance.now() - began;
    waiting = false;
    clearInterval(ticker);
    await others;

    expect(saved.status).toBe(200);
    expect(saved.body.track.pointCount).toBe(86_400);
    console.info(
      `recording of 86,400 points (${(gpx.length / 1e6).toFixed(1)} MB): saved in ${Math.round(took)} ms; the server's own thread was held for at most ${Math.round(longestStall)} ms at a time; ${answered} other requests answered meanwhile, the slowest in ${Math.round(slowest)} ms`,
    );
    // Other requests were answered while it was read, and nothing held the thread for as long as a second.
    expect(answered).toBeGreaterThan(1);
    expect(slowest).toBeLessThan(1000);
    expect(longestStall).toBeLessThan(1000);
  }, 60_000);
});
