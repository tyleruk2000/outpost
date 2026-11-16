/**
 * Bringing a large log in: it is a job, written a batch at a time so that the server
 * goes on answering, with all of the file in the log at the end or none of it.
 */
import type { JobDto, ObservationImport, ObservationList } from "@outpost/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { adifReader, parseAdif } from "../src/modules/propagation/adif.ts";
import { ADIF_DIRECT_BYTES, ADIF_IMPORT_JOB } from "../src/modules/propagation/observations.ts";
import { multipart } from "./fixtures/documents/builders.ts";
import { createTestApp, type TestApp } from "./helpers.ts";

const f = (name: string, value: string) => `<${name}:${Buffer.byteLength(value)}>${value}`;
const HEADER = `Exported for the tests\n${f("ADIF_VER", "3.1.8")} ${f("PROGRAMID", "TestLog")} <EOH>\n`;
/** Contact `n` of a log: each a different minute, about 250 bytes, as a logging program writes one. */
function contact(n: number, extra = ""): string {
  const at = new Date(Date.UTC(2015, 0, 1) + n * 120_000).toISOString();
  return `${[
    f("CALL", `G${n % 10}${String.fromCharCode(65 + (n % 26))}${String.fromCharCode(65 + ((n >> 4) % 26))}X`),
    f("QSO_DATE", at.slice(0, 10).replaceAll("-", "")),
    f("TIME_ON", at.slice(11, 16).replace(":", "")),
    f("FREQ", (7 + (n % 200) / 1000).toFixed(3)),
    f("BAND", "40m"),
    f("MODE", n % 3 === 0 ? "SSB" : "FT8"),
    f("RST_SENT", "59"),
    f("RST_RCVD", "57"),
    f("STATION_CALLSIGN", "G4AAA"),
    f("MY_GRIDSQUARE", "IO91WM"),
    f("GRIDSQUARE", "IO92BL"),
    f("TX_PWR", "50"),
    f("COMMENT", `Contact number ${n}`),
  ].join(" ")}${extra} <EOR>\n`;
}
const log = (count: number, from = 0) => HEADER + Array.from({ length: count }, (_, n) => contact(from + n)).join("");

let app: TestApp;
afterEach(async () => {
  await app?.close();
});

const send = async (name: string, content: string) => {
  const { payload, headers } = multipart({}, [{ name, content, type: "text/plain" }]);
  return (await app.api("POST", "/api/radio/observations/import", payload, { headers })) as {
    status: number;
    body: { import?: ObservationImport; job?: JobDto; error?: { message: string; details?: { reason?: string } } };
  };
};
const list = async () => (await app.api<ObservationList>("GET", "/api/radio/observations?limit=5")).body;
const rowsOf = (importId: string) =>
  (app.ctx.sqlite.prepare("SELECT count(*) AS n FROM radio_observations WHERE import_id = ?").get(importId) as { n: number }).n;
const importIdOf = (job: JobDto) => job.subject!.replace("adif-import:", "");
async function settled(id: string): Promise<JobDto> {
  for (let tries = 0; tries < 3000; tries++) {
    const job = (await app.api("GET", `/api/jobs/${id}`)).body.job as JobDto;
    if (["succeeded", "failed", "cancelled"].includes(job.state)) return job;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("the import did not finish");
}
/** Waits until the job has written something, so that what follows happens part of the way through. */
async function underWay(job: JobDto): Promise<void> {
  for (let tries = 0; tries < 5000 && rowsOf(importIdOf(job)) === 0; tries++) await new Promise((resolve) => setImmediate(resolve));
  expect(rowsOf(importIdOf(job))).toBeGreaterThan(0);
  expect(app.ctx.jobs.get(job.id)?.state).toBe("running");
}

describe("reading a file a few records at a time", () => {
  it("gives the same records as reading it whole, however few are asked for at once", () => {
    const bytes = Buffer.from(`${log(57)}<CALL:5>G0EEE<QSO_DATE:8>2026`);
    const whole = parseAdif(bytes);
    for (const size of [1, 7, 1000]) {
      const reader = adifReader(bytes);
      const records = [];
      let calls = 0;
      while (!reader.done) {
        const batch = reader.read(size);
        expect(batch.length).toBeLessThanOrEqual(size);
        records.push(...batch);
        calls += 1;
      }
      expect(records.map((record) => Object.fromEntries(record.fields))).toEqual(
        whole.records.map((record) => Object.fromEntries(record.fields)),
      );
      expect(reader).toMatchObject({ count: 57, truncated: 1, headerEnded: true, headerNeverEnds: false, position: bytes.length });
      expect(Object.fromEntries(reader.header)).toEqual({ ADIF_VER: "3.1.8", PROGRAMID: "TestLog" });
      expect(calls).toBeGreaterThanOrEqual(Math.floor(57 / size));
    }
  });

  it("hands back after a fixed number of tags even when no record ever ends", () => {
    const reader = adifReader(Buffer.from(`<A:1>x`.repeat(50_000)));
    let calls = 0;
    while (!reader.done) {
      expect(reader.read(100)).toEqual([]);
      calls += 1;
    }
    expect(calls).toBeGreaterThan(2);
    expect(reader).toMatchObject({ count: 0, truncated: 1 });
  });
});

describe("a large log", () => {
  it("is brought in by a job that says how far it has read, and is in the log whole at the end", async () => {
    app = await createTestApp();
    const file = log(3_000) + contact(5) + contact(3_000, f("LAT", "nowhere") + f("LON", "nowhere")).replace(f("MODE", "SSB"), "");
    expect(Buffer.byteLength(file)).toBeGreaterThan(ADIF_DIRECT_BYTES);
    const asked = await send("big log.adi", file);
    expect(asked.status).toBe(200);
    expect(asked.body.import).toBeUndefined();
    expect(asked.body.job).toMatchObject({ type: ADIF_IMPORT_JOB, queue: "import", title: "Contact log from big log.adi" });

    const job = await settled(asked.body.job!.id);
    expect(job.state).toBe("succeeded");
    expect(job.progress).toMatchObject({ current: Buffer.byteLength(file), total: Buffer.byteLength(file) });
    const done = (job.result as { kind: string; import: ObservationImport }).import;
    expect(done).toMatchObject({
      id: importIdOf(job),
      fileName: "big log.adi",
      adifVersion: "3.1.8",
      program: "TestLog",
      records: 3_002,
      imported: 3_000,
      duplicates: 1,
      skipped: [{ reason: "No mode (MODE)", count: 1 }],
    });
    const after = await list();
    expect(after.total).toBe(3_000);
    expect(after.imports).toEqual([done]);

    // The same file again is all duplicates: an import of nothing new, recorded as that.
    const again = await settled((await send("again.adi", log(3_000))).body.job!.id);
    expect((again.result as { import: ObservationImport }).import).toMatchObject({ records: 3_000, imported: 0, duplicates: 3_000 });

    // It can be taken back like any other, and only what it brought in goes.
    const typed = await app.api("POST", "/api/radio/observations", {
      at: "2026-11-16T15:55:00Z",
      frequencyMhz: 7.12,
      band: "",
      mode: "ssb",
      outcome: "failed",
      tx: { call: "g4aaa", lat: null, lon: null },
      rx: { call: "", lat: null, lon: null },
      powerWatts: 5,
      antenna: "",
      reportSent: "",
      reportReceived: "",
      notes: "",
    });
    expect(typed.status).toBe(200);
    expect((await app.api("DELETE", `/api/radio/observations/imports/${done.id}`)).body).toEqual({ removed: 3_000 });
    expect((await list()).total).toBe(1);
  }, 60_000);

  it("leaves the server answering while it is read, and shows none of it until all of it is in", async () => {
    app = await createTestApp();
    const small = await send("small.adi", HEADER + contact(900_000));
    expect(small.body.import).toMatchObject({ imported: 1 });

    // The longest the server went without turning, by a timer due every millisecond.
    let longest = 0;
    let last = performance.now();
    const probe = setInterval(() => {
      const now = performance.now();
      longest = Math.max(longest, now - last);
      last = now;
    }, 1);
    try {
      const file = log(20_000);
      await new Promise((resolve) => setTimeout(resolve, 20));
      longest = 0;
      last = performance.now();
      const asked = await send("years.adi", file);
      const job = asked.body.job!;
      await underWay(job);

      // Part of the way through: the log is as it was before, the import is not listed, and it cannot be taken back.
      const during = await list();
      expect(during.total).toBe(1);
      expect(during.imports.map((item) => item.fileName)).toEqual(["small.adi"]);
      expect(during.observations).toHaveLength(1);
      expect(during.importing).toMatchObject({ id: job.id, state: "running" });
      expect(app.ctx.services.propagation.kept.count().observations).toBe(1);
      expect((await app.api("DELETE", `/api/radio/observations/imports/${importIdOf(job)}`)).status).toBe(404);
      // One file at a time: another, large or small, is turned away in words.
      for (const other of [log(2_000, 50_000), HEADER + contact(800_000)]) {
        const second = await send("second.adi", other);
        expect(second.status).toBe(409);
        expect(second.body.error).toMatchObject({ details: { reason: "import-busy" } });
        expect(second.body.error!.message).toContain("Another log is being brought in");
      }

      expect((await settled(job.id)).state).toBe("succeeded");
      await new Promise((resolve) => setTimeout(resolve, 20));
      // 3.1 seconds in one piece before this was a job; here the longest step is a batch of 200 contacts.
      expect(longest).toBeLessThan(400);
      expect(await list()).toMatchObject({ total: 20_001, importing: null });
    } finally {
      clearInterval(probe);
    }
  }, 120_000);

  it("leaves nothing behind when it is stopped part of the way through", async () => {
    app = await createTestApp();
    const asked = await send("years.adi", log(20_000));
    const job = asked.body.job!;
    await underWay(job);
    expect((await app.api("POST", `/api/jobs/${job.id}/cancel`)).status).toBe(200);
    expect((await settled(job.id)).state).toBe("cancelled");
    expect(rowsOf(importIdOf(job))).toBe(0);
    expect((app.ctx.sqlite.prepare("SELECT count(*) AS n FROM observation_imports").get() as { n: number }).n).toBe(0);
    expect(await list()).toMatchObject({ total: 0, imports: [], observations: [] });
    // And the next import is not turned away.
    const next = await settled((await send("next.adi", log(600))).body.job!.id);
    expect(next.state).toBe("succeeded");
    expect((await list()).total).toBe(600);
  }, 120_000);

  it("fails in words, with nothing brought in, when the file turns out to have nothing to read or too much", async () => {
    app = await createTestApp();
    // A header a megabyte long and nothing after it.
    const empty = await settled((await send("empty.adi", `${"Notes about this export. ".repeat(50_000)}\n${HEADER}`)).body.job!.id);
    expect(empty.state).toBe("failed");
    expect(empty.error).toContain("has a header and no contacts after it. Nothing was brought in.");

    // More contacts than are taken. They are written as they are read, so those written have to come out again.
    // (The limit is 200,000; the importer is asked for 2,000 here, which takes the same way out in a hundredth of the time.)
    let read = 0;
    const refused = await app.ctx.services.propagation.observations
      .importAdif("lifetime.adi", Buffer.from(log(2_500)), { mostRecords: 2_000, progress: (bytes) => (read = bytes) })
      .then(
        () => null,
        (error: Error) => error,
      );
    expect(refused?.message).toBe("That file holds more than 2,000 contacts. Export it in parts and import each.");
    expect(read).toBeGreaterThan(0);
    expect(await list()).toMatchObject({ total: 0, imports: [] });
    expect((app.ctx.sqlite.prepare("SELECT count(*) AS n FROM radio_observations").get() as { n: number }).n).toBe(0);
    expect((app.ctx.sqlite.prepare("SELECT count(*) AS n FROM observation_imports").get() as { n: number }).n).toBe(0);
    // Something that is not a log is refused in the answer; no job is made for it.
    const csv = await send("log.csv", "callsign,date\nG4BBB,2026-11-16\n".repeat(10_000));
    expect(csv.status).toBe(400);
    expect(csv.body.error!.message).toContain("That is not an ADIF file Outpost can read");
  }, 180_000);

  it("does not outlast the server: started again, its job clears what was written and says so", async () => {
    app = await createTestApp();
    // As a server stopped part of the way through leaves things: an import still marked as under way, some of its entries, and its job.
    const sqlite = app.ctx.sqlite;
    const part = (id: string) => {
      sqlite
        .prepare(
          "INSERT INTO observation_imports (id, file_name, records, imported, duplicates, skipped, created_at) VALUES (?, 'years.adi', 0, 0, 0, '{\"pending\":true}', 1)",
        )
        .run(id);
      const insert = sqlite.prepare(
        "INSERT INTO radio_observations (id, at, outcome, source, import_id, same_as, created_at, updated_at) VALUES (?, ?, 'contact', 'adif', ?, ?, 1, 1)",
      );
      for (let n = 0; n < 2_500; n++) insert.run(`${id}-${n}`, n * 60_000, id, `${id}-${n}`);
    };
    part("half-done");
    expect(await list()).toMatchObject({ total: 0, imports: [] });
    const job = app.ctx.jobs.enqueue(
      ADIF_IMPORT_JOB,
      { importId: "half-done", fileName: "years.adi" },
      { title: "Contact log from years.adi" },
    );
    const ended = await settled(job.id);
    expect(ended.state).toBe("failed");
    expect(ended.error).toContain("Outpost was restarted before this log had been brought in");
    expect(rowsOf("half-done")).toBe(0);

    // And one whose job has gone altogether is cleared when the server starts.
    part("orphan");
    const dir = app.dir;
    await app.app.close();
    app = await createTestApp({}, dir);
    // The entries go a batch at a time and the import's own row last, so the row going is the sign it has finished.
    // (Waiting for the entries alone raced the last step: on a busy machine the row was still there when they had gone.)
    const imports = () => (app.ctx.sqlite.prepare("SELECT count(*) AS n FROM observation_imports").get() as { n: number }).n;
    await vi.waitFor(() => expect(imports()).toBe(0), { timeout: 30_000, interval: 10 });
    expect(rowsOf("orphan")).toBe(0);
    const { rmSync } = await import("node:fs");
    const close = app.close.bind(app);
    app.close = async () => {
      await close();
      rmSync(dir, { recursive: true, force: true });
    };
  }, 60_000);
});
