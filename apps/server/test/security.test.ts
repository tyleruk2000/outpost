/**
 * Regression tests for defects found by security review. Each one describes the
 * attack it guards against.
 */
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { ZipArchive } from "archiver";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { scanConstructs } from "../src/modules/imports/convert.ts";
import { markdownToDoc } from "../src/modules/notes/content/index.ts";
import { LARGE_GPX, LONG_TRACK } from "./fixtures/maps/gpx-large.ts";
import { createTestApp, type TestApp } from "./helpers.ts";
import { tempDir } from "./temp.ts";

let app: TestApp | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

const raw = (method: string, url: string, headers: Record<string, string> = {}, payload?: unknown) =>
  app!.app.inject({ method: method as "GET", url, headers: { host: "localhost", ...headers }, payload: payload as never });

describe("the request rules cannot be sidestepped by disguising the address", () => {
  it("applies the cross-site checks to disguised addresses too", async () => {
    app = await createTestApp();
    for (const prefix of ["/%61pi", "/a%70i"]) {
      const forged = await raw(
        "PATCH",
        `${prefix}/settings`,
        { origin: "https://evil.example", "sec-fetch-site": "cross-site", "content-type": "application/json" },
        { "downloads.concurrency": 7 },
      );
      expect(forged.statusCode).toBe(403);
      const noHeader = await raw("PATCH", `${prefix}/settings`, { "content-type": "application/json" }, { "downloads.concurrency": 7 });
      expect(noHeader.statusCode).toBe(403);
    }
    expect((await app.api("GET", "/api/settings")).body.settings["downloads.concurrency"]).toBe(2);
  });
});

describe("smaller hardening", () => {
  it("never lists an unbounded number of jobs", async () => {
    app = await createTestApp();
    for (const limit of ["-1", "0", "abc", "999999"]) {
      const response = await app.api("GET", `/api/jobs?limit=${limit}`);
      expect(response.status).toBe(200);
    }
  });
});

describe("large uploads", () => {
  it("are refused before the body is read unless they are the right kind of file", async () => {
    app = await createTestApp();
    const big = Buffer.alloc(2 * 1024 * 1024, 65);
    for (const url of ["/api/backup/restore", "/api/semantic/import"]) {
      // A type the server would otherwise buffer whole.
      const wrongType = await raw("POST", url, { "x-outpost-request": "1", "content-type": "text/plain" }, big);
      expect(wrongType.statusCode, url).toBe(415);
      // And never from another site, whatever the type.
      const crossSite = await raw("POST", url, { "content-type": "application/zip", origin: "https://evil.example" }, big);
      expect(crossSite.statusCode, url).toBe(403);
    }
  });
});

describe("restoring a backup someone else made", () => {
  it("does not bring their queued work, their network shares or their download hosts", async () => {
    // Someone else's Outpost: a queued job and a manifest of their choosing.
    const theirs = await createTestApp();
    fs.mkdirSync(path.join(theirs.ctx.config.dataDir, "catalog"), { recursive: true });
    fs.writeFileSync(
      path.join(theirs.ctx.config.dataDir, "catalog", "evil.json"),
      JSON.stringify({
        schemaVersion: 1,
        id: "evil",
        name: "Evil",
        description: "x",
        maintainers: [],
        downloadHosts: ["evil.example"],
        entries: [],
      }),
    );
    theirs.ctx.sqlite
      .prepare(
        "INSERT INTO jobs (id, type, queue, state, title, payload, created_at, updated_at) VALUES ('j1', 'documents.move', 'transfer', 'queued', 'Planted', '{}', 1, 1)",
      )
      .run();
    // And a network share that their machine reconnects to by itself.
    theirs.ctx.sqlite
      .prepare(
        "INSERT INTO network_shares (id, server, port, share, user_name, password_in_keychain, auto_connect, created_at, updated_at) VALUES ('s1', 'their-nas.local', 445, 'private', 'mallory', 1, 1, 1, 1)",
      )
      .run();
    const backup = (await theirs.app.inject({ method: "GET", url: "/api/backup/download", headers: { host: "localhost" } })).rawPayload;
    await theirs.close();

    // It is restored here.
    const dir = tempDir("outpost-restore-sec-");
    let mine = await createTestApp({}, dir);
    const staged = await mine.app.inject({
      method: "POST",
      url: "/api/backup/restore",
      headers: { host: "localhost", "x-outpost-request": "1", "content-type": "application/zip" },
      payload: backup,
    });
    expect(staged.statusCode).toBe(200);
    await mine.close();
    mine = await createTestApp({}, dir);
    app = mine;

    expect(mine.ctx.sqlite.prepare("SELECT count(*) AS n FROM jobs WHERE id = 'j1'").get()).toEqual({ n: 0 });
    // This machine must not start trying to connect to a file server named in someone else's backup.
    expect(mine.ctx.sqlite.prepare("SELECT count(*) AS n FROM network_shares").get()).toEqual({ n: 0 });
    expect(fs.existsSync(path.join(mine.ctx.config.dataDir, "catalog", "evil.json"))).toBe(false);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("refuses an archive that expands far beyond its size", async () => {
    app = await createTestApp();
    const file = path.join(tempDir("outpost-bomb-"), "bomb.zip");
    const archive = new ZipArchive({ zlib: { level: 9 } });
    const done = new Promise<void>((resolve, reject) => {
      const out = fs.createWriteStream(file);
      out.on("close", () => resolve());
      archive.on("error", reject);
      archive.pipe(out);
    });
    archive.append(
      JSON.stringify({ format: "outpost-backup", version: 1, appVersion: "0.1.0", createdAt: "2026-01-01T00:00:00Z", migrations: 1 }),
      { name: "manifest.json" },
    );
    archive.append(Buffer.alloc(300 * 1024 * 1024), { name: "attachments/zeros.bin" });
    await archive.finalize();
    await done;
    const payload = fs.readFileSync(file);
    expect(payload.length).toBeLessThan(1024 * 1024);
    const response = await app.app.inject({
      method: "POST",
      url: "/api/backup/restore",
      headers: { host: "localhost", "x-outpost-request": "1", "content-type": "application/zip" },
      payload,
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.message).toMatch(/expands far more/);
    expect(fs.existsSync(path.join(app.ctx.config.dataDir, "restore-pending"))).toBe(false);
  });
});

describe("hostile files cannot freeze or exhaust the server", () => {
  it("scans Markdown made of unclosed code fences in linear time", () => {
    const hostile = "```x\n".repeat(60_000);
    const started = performance.now();
    scanConstructs("markdown", hostile);
    // The old pattern took about nine seconds on a file this size.
    expect(performance.now() - started).toBeLessThan(500);
  });

  it("converts Markdown full of unclosed <summary> tags in linear time", () => {
    const hostile = `<details>${"<summary>".repeat(60_000)}\n\ntext\n\n</details>`;
    const started = performance.now();
    const { doc } = markdownToDoc(hostile);
    expect(doc.type).toBe("doc");
    expect(performance.now() - started).toBeLessThan(1500);
  });

  it("still reads fenced code and summaries correctly", () => {
    expect(scanConstructs("markdown", "text\n```\n$$ not maths $$\n```\nmore")).toEqual(scanConstructs("markdown", "text\nmore"));
    const { doc } = markdownToDoc("<details>\n<summary>Kit <b>list</b></summary>\n\nStove and gas.\n\n</details>");
    expect(JSON.stringify(doc)).toContain("detailsSummary");
    expect(JSON.stringify(doc)).toContain("Stove and gas.");
  });
});

/**
 * A GPX file used to be read into a tree that cost hundreds of bytes for every element,
 * inside a worker whose heap limit was meant to contain it. It did not: on Node 24 a
 * worker that reaches its limit sometimes takes the whole process with it, and an
 * ordinary long recording was enough to reach it.
 *
 * The reader now keeps only what is stored, and counts what a file holds. Each file
 * below is first read in a process of its own, by a worker held to a sixth of the heap
 * Outpost allows (64 MB against 384 MB; the hostile files need 32 MB, most of which is
 * the 20 MB of text itself, and the day's recording 40 MB). Only when that has gone
 * well is the same file given to the server in this process, which has to keep
 * answering while it reads. So if the reader is ever made hungry again, it is the other
 * process that dies and this test that fails.
 */
describe("a GPX file cannot take the server down, whatever is in it", () => {
  const CHILD = path.join(import.meta.dirname, "fixtures/maps/gpx-large.child.ts");
  const MB = 1024 * 1024;

  interface ChildReport {
    megabytes: number;
    imported: boolean;
    message?: string;
    lines?: number;
    waypoints?: number;
    stats?: { distanceMeters: number; ascentMeters: number | null; pointCount: number };
    usage?: { heapBytes: number; milliseconds: number };
    peakProcessBytes: number;
  }

  /** Reads one of the files in a process of its own. Never throws: a crash there is a result here. */
  const readElsewhere = (name: string) =>
    new Promise<{ code: number | string | null; signal: string | null; report: ChildReport | undefined; stderr: string }>((resolve) => {
      execFile(process.execPath, [CHILD, name], { timeout: 60_000 }, (error, stdout, stderr) => {
        let report: ChildReport | undefined;
        try {
          report = JSON.parse(stdout);
        } catch {
          // No report: the process died before it could write one.
        }
        resolve({ code: error ? (error.code ?? null) : 0, signal: error?.signal ?? null, report, stderr });
      });
    });

  let server: TestApp;
  beforeAll(async () => {
    server = await createTestApp();
  });
  afterAll(async () => {
    await server.close();
  });

  /** Uploads a file and asks after the server's health, over and over, until the upload is answered. */
  async function importWhileAsking(source: string) {
    const form = new FormData();
    form.set("file", new Blob([source], { type: "application/gpx+xml" }), "large.gpx");
    const encoded = new Response(form);
    let answered = false;
    const pending = server.app
      .inject({
        method: "POST",
        url: "/api/maps/tracks/import",
        headers: { host: "localhost", "x-outpost-request": "1", "content-type": encoded.headers.get("content-type")! },
        payload: Buffer.from(await encoded.arrayBuffer()),
      })
      .finally(() => {
        answered = true;
      });
    let slowest = 0;
    let asked = 0;
    do {
      const started = performance.now();
      expect((await server.api("GET", "/api/health")).status).toBe(200);
      slowest = Math.max(slowest, performance.now() - started);
      asked += 1;
      await new Promise((resolve) => setTimeout(resolve, 5));
    } while (!answered);
    return { response: await pending, slowest, asked };
  }

  for (const [name, file] of Object.entries(LARGE_GPX)) {
    it(`${file.refusal ? "refuses" : "imports"} ${file.title}, in a worker held to ${file.heapMb} MB, and keeps answering`, async () => {
      // First where it can do no harm.
      const elsewhere = await readElsewhere(name);
      expect(elsewhere.signal, elsewhere.stderr).toBeNull();
      expect(elsewhere.code, elsewhere.stderr).toBe(0);
      const report = elsewhere.report!;
      expect(report.megabytes).toBeLessThan(21);
      // The worker reached an answer of its own: its heap limit was never what stopped it.
      expect(report.message ?? "").not.toMatch(/too complex/);
      expect(report.usage!.heapBytes).toBeGreaterThan(MB);
      // All it had claimed when it finished, working room included: still a fraction of what Outpost allows.
      expect(report.usage!.heapBytes).toBeLessThan(2 * file.heapMb * MB);
      expect(report.usage!.milliseconds).toBeLessThan(10_000);
      if (file.refusal) {
        expect(report.imported).toBe(false);
        expect(report.message).toMatch(file.refusal);
      } else {
        expect(report.imported).toBe(true);
      }

      // Then here, through the server.
      const { response, slowest, asked } = await importWhileAsking(file.build());
      expect(asked).toBeGreaterThan(0);
      expect(slowest).toBeLessThan(1000);
      if (file.refusal) {
        expect(response.statusCode).toBe(400);
        expect(response.json().error.message).toMatch(file.refusal);
        expect((await server.api("GET", "/api/maps/tracks")).body.tracks).toEqual([]);
        return;
      }
      expect(response.statusCode).toBe(200);
      const track = response.json().track;
      expect(track.pointCount).toBe(report.stats!.pointCount);
      expect(track.distanceMeters).toBe(report.stats!.distanceMeters);
      if (name === "longTrack") await expectTheWholeLongTrack(track);
      expect((await server.api("DELETE", `/api/maps/tracks/${track.id}`)).status).toBe(200);
    }, 120_000);
  }

  /** The long recording is all there, and measured right. */
  async function expectTheWholeLongTrack(track: {
    id: string;
    name: string;
    distanceMeters: number;
    ascentMeters: number;
    pointCount: number;
    bounds: number[];
  }) {
    const last = LONG_TRACK.points - 1;
    // Due north along a meridian, so the length is the arc between the first latitude and the last.
    const expectedLength = 6_371_008.8 * ((last * LONG_TRACK.step * Math.PI) / 180);
    // A thousand steps up of 4 m, then a thousand down, 75 times over.
    const expectedClimb = (LONG_TRACK.points / 2000) * 1000 * LONG_TRACK.rise;
    expect(expectedClimb).toBe(300_000);
    expect(track).toMatchObject({ name: "A long day", pointCount: 150_000, ascentMeters: expectedClimb });
    expect(Math.abs(track.distanceMeters - expectedLength)).toBeLessThan(1);
    expect(track.bounds).toEqual([LONG_TRACK.lon, LONG_TRACK.startLat, LONG_TRACK.lon, 11.49999]);

    const stored = (await server.api("GET", `/api/maps/tracks/${track.id}`)).body.track.geojson.features;
    expect(stored).toHaveLength(1);
    const [line] = stored;
    expect(line.geometry.type).toBe("LineString");
    expect(line.geometry.coordinates).toHaveLength(150_000);
    expect(line.geometry.coordinates[0]).toEqual([20, 10, 500]);
    expect(line.geometry.coordinates[1000]).toEqual([20, 10.01, 4500]);
    expect(line.geometry.coordinates[last]).toEqual([20, 11.49999, LONG_TRACK.ele(last)]);
    expect(line.properties.coordinateProperties.times).toHaveLength(150_000);
    expect(line.properties.coordinateProperties.times[0]).toBe("2026-06-01T04:00:00Z");
    expect(line.properties.coordinateProperties.times[last]).toBe(LONG_TRACK.time(last));
    expect(line.properties.time).toBe("2026-06-01T04:00:00Z");
  }
});
