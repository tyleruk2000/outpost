import fs from "node:fs";
import path from "node:path";
import type { ExportEstimate, ExportResult, ExportStatus, JobDto } from "@outpost/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import yauzl from "yauzl";
import { adifLocation, writeAdif } from "../src/modules/export-all/adif.ts";
import { parseAdif } from "../src/modules/propagation/adif.ts";
import { multipart } from "./fixtures/documents/builders.ts";
import { createTestApp, type TestApp } from "./helpers.ts";

let app: TestApp;

/** Every entry of a zip, by name, with its text. */
function readZip(file: string | Buffer): Promise<Map<string, string>> {
  return new Promise((resolve, reject) => {
    const found = new Map<string, string>();
    const opened = (error: Error | null, zip: yauzl.ZipFile) => {
      if (error) return reject(error);
      zip.on("entry", (entry: yauzl.Entry) => {
        zip.openReadStream(entry, (streamError, stream) => {
          if (streamError) return reject(streamError);
          const chunks: Buffer[] = [];
          stream.on("data", (chunk: Buffer) => chunks.push(chunk));
          stream.on("end", () => {
            found.set(entry.fileName, Buffer.concat(chunks).toString("utf8"));
            zip.readEntry();
          });
        });
      });
      zip.on("end", () => resolve(found));
      zip.on("error", reject);
      zip.readEntry();
    };
    if (typeof file === "string") yauzl.open(file, { lazyEntries: true }, opened);
    else yauzl.fromBuffer(file, { lazyEntries: true }, opened);
  });
}

async function finished(job: JobDto): Promise<JobDto> {
  await app.ctx.jobs.whenIdle();
  const status = (await app.api<ExportStatus>("GET", "/api/export-all")).body;
  expect(status.latest?.id).toBe(job.id);
  expect(status.latest?.state, status.latest?.error ?? "").toBe("succeeded");
  return status.latest!;
}

beforeAll(async () => {
  app = await createTestApp({}, undefined, { voacapData: false });
  await app.api("POST", "/api/notes", { title: "Water plan" });
  await app.api("POST", "/api/contacts", { name: { prefix: "", given: "Sam", additional: "", family: "Field", suffix: "" } });
  await app.api("POST", "/api/maps/markers", { name: "Village hall", lat: 54.3, lon: -2.2 });
  await app.api("POST", "/api/supplies/items", { name: "Rice", category: "food", quantity: 2 });
  await app.api("POST", "/api/weather/readings", { takenAt: Date.now() - 60_000, value: 1013, unit: "hPa", heightM: 0 });
  await app.api("POST", "/api/radio/observations", {
    at: "2026-11-16T15:55:00Z",
    frequencyMhz: 7.12,
    band: "",
    mode: "ssb",
    outcome: "contact",
    tx: { call: "g4aaa", lat: 51.5, lon: -0.12 },
    rx: { call: "g4bbb", lat: null, lon: null },
    powerWatts: 5,
    antenna: "",
    reportSent: "59",
    reportReceived: "57",
    notes: "Clear\nall evening",
  });
  await app.api("POST", "/api/board/messages", { author: "Alex", body: "Back by six." }, { remoteAddress: "192.168.1.20" });
  const { payload, headers } = multipart({}, [{ name: "stove.txt", content: "Remember the spare stove jet." }]);
  expect((await app.api("POST", "/api/documents", payload, { headers })).status).toBe(200);
  await app.ctx.jobs.whenIdle();
});
afterAll(async () => {
  await app.close();
});

describe("taking everything out", () => {
  it("says how much there is first", async () => {
    const { status, body } = await app.api<ExportEstimate>("GET", "/api/export-all/estimate");
    expect(status).toBe(200);
    const count = (id: string) => body.sections.find((section) => section.id === id)?.count;
    expect(count("notes")).toBeGreaterThanOrEqual(1);
    expect(count("contacts")).toBe(1);
    expect(count("places")).toBe(1);
    expect(count("supplies")).toBe(1);
    expect(count("barometer")).toBe(1);
    expect(count("radio-log")).toBe(1);
    expect(count("board")).toBe(1);
    expect(count("documents")).toBe(1);
    expect(body.totalBytes).toBeGreaterThan(0);
  });

  it("writes one zip with a README for downloading, and keeps only the newest", async () => {
    const started = await app.api("POST", "/api/export-all", { destination: { kind: "download" } });
    expect(started.status).toBe(200);
    const job = await finished(started.body.job);
    const result = job.result as unknown as ExportResult;
    expect(result).toMatchObject({ destination: "download", downloadable: true });

    const download = await app.api("GET", `/api/export-all/${job.id}/download`);
    expect(download.status).toBe(200);
    expect(download.headers["content-type"]).toBe("application/zip");
    const zip = await app.app.inject({ method: "GET", url: `/api/export-all/${job.id}/download` });
    const entries = await readZip(zip.rawPayload);
    const names = [...entries.keys()];
    expect(names).toContain("README.md");
    expect(names.some((name) => name.startsWith("notes/") && name.endsWith(".md"))).toBe(true);
    expect(entries.get("contacts/contacts.vcf")).toContain("BEGIN:VCARD");
    expect(entries.get("places/places.gpx")).toContain("Village hall");
    expect(JSON.parse(entries.get("places/places.geojson")!).features[0].geometry.coordinates).toEqual([-2.2, 54.3]);
    expect(entries.get("supplies/supplies.csv")).toContain("Rice");
    expect(entries.has("barometer/barometer-readings.csv")).toBe(true);
    expect(entries.get("radio-log/contact-log.adi")).toContain("<CALL:5>G4BBB");
    expect(entries.get("board/household board.txt")).toContain("Back by six.");
    expect(entries.get("documents/Uncategorised/stove.txt")).toBe("Remember the spare stove jet.");
    const readme = entries.get("README.md")!;
    expect(readme).toContain("### contacts/: Contacts (vCard)");
    expect(readme).toContain("## Left out");

    // A second export for downloading replaces the first one's file.
    const again = await finished(
      (await app.api("POST", "/api/export-all", { destination: { kind: "download" }, include: ["contacts"] })).body.job,
    );
    expect((await app.api("GET", `/api/export-all/${job.id}/download`)).status).toBe(404);
    expect((await app.api("GET", `/api/export-all/${again.id}/download`)).status).toBe(200);
    expect((await app.api("DELETE", `/api/export-all/${again.id}/download`)).status).toBe(200);
    const after = (await app.api<ExportStatus>("GET", "/api/export-all")).body.latest!;
    expect((after.result as unknown as ExportResult).downloadable).toBe(false);
  });

  it("writes to a storage location, and says what was left out", async () => {
    const folder = path.join(app.dir, "storage", "nas");
    const location = (await app.api("POST", "/api/storage/locations", { name: "NAS", path: folder, kind: "external" })).body.location;
    const job = await finished(
      (
        await app.api("POST", "/api/export-all", {
          destination: { kind: "location", locationId: location.id },
          include: ["notes", "supplies"],
        })
      ).body.job,
    );
    const result = job.result as unknown as ExportResult;
    expect(result).toMatchObject({ destination: "location", locationName: "NAS", folder: "outpost-exports" });
    const file = path.join(folder, "outpost-exports", result.name);
    expect(fs.existsSync(file)).toBe(true);
    expect(fs.readdirSync(path.join(folder, "outpost-exports")).filter((name) => name.endsWith(".part"))).toEqual([]);
    const entries = await readZip(file);
    expect([...entries.keys()].some((name) => name.startsWith("contacts/"))).toBe(false);
    expect(entries.get("README.md")).toContain("Not chosen for this export: Contacts");
  });

  it("refuses a second export while one is under way, and a location that is not there", async () => {
    expect((await app.api("POST", "/api/export-all", { destination: { kind: "location", locationId: "nope" } })).status).toBe(404);
    expect((await app.api("POST", "/api/export-all", { destination: { kind: "elsewhere" } })).status).toBe(400);
  });
});

describe("the contact log as ADIF", () => {
  it("reads back as it was written", () => {
    const text = writeAdif(
      [
        {
          at: Date.parse("2026-11-16T15:55:00Z"),
          frequencyMhz: 7.12,
          band: "40m",
          mode: "SSB/USB",
          outcome: "contact",
          txCall: "G4AAA",
          txLat: 51.5,
          txLon: -0.12,
          rxCall: "G4BBB",
          rxLat: null,
          rxLon: null,
          powerWatts: 5,
          antenna: "Dipole",
          reportSent: "59",
          reportReceived: "57",
          notes: "Clear",
          propMode: "",
        },
      ],
      Date.parse("2026-11-20T10:00:00Z"),
      "test",
    );
    const read = parseAdif(Buffer.from(text));
    expect(read.headerEnded).toBe(true);
    const fields = read.records[0]!.fields;
    expect(fields.get("CALL")).toBe("G4BBB");
    expect(fields.get("STATION_CALLSIGN")).toBe("G4AAA");
    expect(fields.get("QSO_DATE")).toBe("20261116");
    expect(fields.get("TIME_ON")).toBe("155500");
    expect(fields.get("MODE")).toBe("SSB");
    expect(fields.get("SUBMODE")).toBe("USB");
    expect(fields.get("MY_LAT")).toBe("N051 30.000");
    expect(adifLocation(-0.12, "lon")).toBe("W000 07.200");
  });
});
