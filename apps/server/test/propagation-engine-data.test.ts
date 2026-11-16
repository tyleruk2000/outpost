/**
 * VOACAP's coefficients, which Outpost does not ship: the planner without them, the
 * download from the suite's own file server, refusing files that are not the ones
 * listed, taking over an earlier installation's copy, and removing them.
 *
 * The download and adoption are tried with small stand-in files under a list of their own
 * (OUTPOST_VOACAP_DATA_MANIFEST), so they run on any computer; the last block downloads
 * the real files from the tests' copy and makes a real prediction, and is reported as
 * skipped when that copy is not here.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import {
  ANTENNA_PRESETS,
  type EngineDataStatus,
  type EngineStatus,
  type ManagedItem,
  type PredictionRequest,
  type PropagationDatasets,
} from "@outpost/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type CoefficientsManifest, coefficientsManifest, workingCopyDir } from "../src/modules/propagation/voacap/coefficients.ts";
import { createTestApp, type TestApp } from "./helpers.ts";
import { describeWithVoacapData, VOACAP_CACHE } from "./voacap-data.ts";

const dipole = ANTENNA_PRESETS.find((preset) => preset.id === "low-dipole")!.spec;
/** The owner's acceptance scenario: London to Birmingham, 40 m, 5 W, low dipoles, urban noise. */
const acceptance: PredictionRequest = {
  tx: { name: "London", lat: 51.5074, lon: -0.1278 },
  rx: { name: "Birmingham", lat: 52.4862, lon: -1.8904 },
  date: "2026-11-16",
  powerWatts: 5,
  txAntenna: dipole,
  rxAntenna: dipole,
  noise: "city",
  frequencyMhz: 7.1,
  mode: "ssb",
  solar: { source: "table" },
};
const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

/** Serves files by path, with ranges, and counts what was asked for. */
function fileServer(files: Map<string, () => Buffer>, asked: string[] = []): http.Server {
  return http.createServer((request, response) => {
    const name = decodeURIComponent(new URL(request.url ?? "/", "http://x").pathname.replace(/^\/+/, ""));
    asked.push(name);
    const read = files.get(name);
    if (!read) {
      response.writeHead(404).end();
      return;
    }
    const bytes = read();
    const range = /^bytes=(\d+)-$/.exec(request.headers.range ?? "");
    const start = range ? Number(range[1]) : 0;
    response.writeHead(range ? 206 : 200, { "content-length": bytes.length - start });
    response.end(bytes.subarray(start));
  });
}

async function listen(server: http.Server): Promise<string> {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}/embedded/`;
}

/** A list of the same shape as engines/voacap/coefficients.json, for stand-in files. */
function standInManifest(baseUrl: string, files: Array<{ path: string; bytes: Buffer }>): CoefficientsManifest {
  const real = coefficientsManifest();
  let offset = 0;
  const whole = createHash("sha256");
  const entries = files.map((file) => {
    const entry = { path: file.path, offset, bytes: file.bytes.length, sha256: sha(file.bytes), holds: "A stand-in" };
    offset += file.bytes.length;
    whole.update(file.bytes);
    return entry;
  });
  return { ...real, source: { ...real.source, baseUrl }, bytes: offset, sha256: whole.digest("hex"), files: entries };
}

const standIn = ["coeffs/coeff01w.bin", "coeffs/fof2CCIR.daw", "antennas/default/swwhip.voa"].map((name, i) => ({
  path: name,
  bytes: Buffer.from(`stand-in ${i} for ${name}, not VOACAP's data\n`.repeat(40 + i)),
}));

const engineStatus = async (app: TestApp) =>
  (await app.api<{ engines: EngineStatus[] }>("GET", "/api/radio/propagation/engines")).body.engines[0]!;
const dataStatus = async (app: TestApp) => (await app.api<EngineDataStatus>("GET", "/api/radio/propagation/engine-data")).body;

describe("the planner without VOACAP's data", () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await createTestApp({}, undefined, { voacapData: false });
  });
  afterAll(() => app.close());

  it("says in one line what is missing, how big it is and why it is not shipped", async () => {
    const data = await dataStatus(app);
    expect(data).toMatchObject({ installed: false, downloading: false, files: 15, bytes: 559_336, how: null, collectionId: null });
    expect(data.line).toBe("VOACAP's ionospheric and noise maps are not on this computer yet (15 files, 559 kB).");
    expect(data.why).toContain("CCIR Reports 340 and 322");
    expect(data.why).toContain("the ITU has not given Outpost permission to pass them on");
    expect(data.source).toBe("https://github.com/jonathanmcsweet/hfcast-engine at bf34e8f9f375, embedded/");
    const engine = await engineStatus(app);
    expect(engine).toMatchObject({ id: "voacap", ready: false, problem: data.line, data: { installed: false } });
    // What is known about the engine is still said.
    expect(engine.model).toMatch(/^VOACAP Version/);
  });

  it("refuses every question cleanly, with a reason the screens recognise", async () => {
    const predict = await app.api("POST", "/api/radio/propagation/predict", acceptance);
    expect(predict.status).toBe(415);
    expect(predict.body.error).toMatchObject({ code: "unsupported", details: { reason: "engine-data-missing" } });
    expect(predict.body.error.message).toContain("not on this computer yet");
    const listing = await app.api("POST", "/api/radio/propagation/listing", acceptance);
    expect(listing.status).toBe(415);
    const compare = await app.api("POST", "/api/radio/propagation/compare", { base: acceptance, what: "power" });
    expect(compare.status).toBe(415);
    // No answer was kept, and no worker was started to say so.
    expect(app.ctx.services.propagation.internals.host.loaded).toBe(false);
  });

  it("lists the data as not downloaded, and as something to download", async () => {
    const { body } = await app.api<PropagationDatasets>("GET", "/api/radio/propagation/datasets");
    expect(body.datasets[0]).toMatchObject({ id: "voacap-coefficients", installed: false, downloadable: true, where: "Not downloaded" });
    expect(body.datasets[0]!.description).toContain("Not shipped with Outpost");
  });

  it("has nothing to remove", async () => {
    const { status, body } = await app.api<EngineDataStatus>("DELETE", "/api/radio/propagation/engine-data");
    expect(status).toBe(200);
    expect(body.installed).toBe(false);
  });
});

describe("downloading VOACAP's data, from the suite's own file server", () => {
  let app: TestApp;
  let server: http.Server;
  const asked: string[] = [];
  const served = new Map(standIn.map((file) => [`embedded/${file.path}`, () => file.bytes]));
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "outpost-voacap-data-"));

  beforeAll(async () => {
    server = fileServer(served, asked);
    const base = await listen(server);
    fs.writeFileSync(path.join(scratch, "list.json"), JSON.stringify(standInManifest(base, standIn)));
    app = await createTestApp({ OUTPOST_VOACAP_DATA_MANIFEST: path.join(scratch, "list.json") }, undefined, { voacapData: false });
  });
  afterAll(async () => {
    await app.close();
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(scratch, { recursive: true, force: true });
  });

  it("asks for nothing until Download is pressed", async () => {
    await dataStatus(app);
    await engineStatus(app);
    expect(asked).toEqual([]);
  });

  it("fetches the files on a press, checks them, and keeps the engine's copy in the data directory", async () => {
    const started = await app.api("POST", "/api/radio/propagation/engine-data/download", {});
    expect(started.status).toBe(200);
    expect(started.body.download).toMatchObject({ kind: "dataset", title: "VOACAP ionospheric and noise coefficients" });
    await app.ctx.jobs.whenIdle();
    expect(app.ctx.services.downloads.get(started.body.download.id)!.state).toBe("completed");
    expect(asked).toEqual(standIn.map((file) => `embedded/${file.path}`));

    const data = await dataStatus(app);
    expect(data).toMatchObject({ installed: true, line: null, how: "downloaded", files: 3 });
    expect(data.at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    const copy = workingCopyDir(app.ctx.config.dataDir);
    expect(fs.readFileSync(path.join(copy, "coeffs/fof2CCIR.daw"))).toEqual(standIn[1]!.bytes);

    // One collection, listed under "Manage and clean up" with what removing it does.
    const collections = app.ctx.services.collections.list({ kind: "dataset" });
    expect(collections).toHaveLength(1);
    expect(data.collectionId).toBe(collections[0]!.id);
    const items = (await app.api<{ items: ManagedItem[] }>("GET", "/api/manage/items")).body.items;
    const item = items.find((entry) => entry.id === collections[0]!.id)!;
    expect(item).toMatchObject({ title: "VOACAP ionospheric and noise coefficients", origin: "downloaded" });
    expect(item.warning).toContain("HF propagation planner");

    const { body } = await app.api<PropagationDatasets>("GET", "/api/radio/propagation/datasets");
    expect(body.datasets[0]).toMatchObject({ installed: true, verified: true, downloadable: false });
    expect(body.datasets[0]!.where).toMatch(/^Downloaded on \d{4}-\d{2}-\d{2}; kept in the data directory$/);
  });

  it("does not fetch a second copy", async () => {
    const again = await app.api("POST", "/api/radio/propagation/engine-data/download", {});
    expect(again.status).toBe(409);
  });

  it("puts the engine's copy back from the downloaded file if it goes, without fetching", async () => {
    fs.rmSync(workingCopyDir(app.ctx.config.dataDir), { recursive: true });
    expect((await dataStatus(app)).installed).toBe(false);
    const before = asked.length;
    const put = await app.api("POST", "/api/radio/propagation/engine-data/download", {});
    expect(put.status).toBe(200);
    expect(put.body.download).toBeNull();
    expect(put.body.status).toMatchObject({ installed: true, how: "downloaded" });
    expect(asked.length).toBe(before);
  });

  it("removes them under Manage and clean up, and the planner says so again", async () => {
    const [collection] = app.ctx.services.collections.list({ kind: "dataset" });
    const plan = await app.api("POST", "/api/manage/remove", {
      keys: [`collection:${collection!.id}`],
      files: "delete",
      disconnected: "leave",
    });
    expect(plan.status).toBe(200);
    await app.ctx.jobs.whenIdle();
    expect(app.ctx.services.collections.list({ kind: "dataset" })).toHaveLength(0);
    expect(fs.existsSync(workingCopyDir(app.ctx.config.dataDir))).toBe(false);
    const data = await dataStatus(app);
    expect(data).toMatchObject({ installed: false, collectionId: null });
    expect(data.line).toContain("not on this computer yet (3 files");
    expect((await app.api("POST", "/api/radio/propagation/predict", acceptance)).status).toBe(415);
  });

  it("removes them from the Engine and data tab too, collection and all", async () => {
    await app.api("POST", "/api/radio/propagation/engine-data/download", {});
    await app.ctx.jobs.whenIdle();
    expect((await dataStatus(app)).installed).toBe(true);
    const removed = await app.api<EngineDataStatus>("DELETE", "/api/radio/propagation/engine-data");
    expect(removed.status).toBe(200);
    expect(removed.body.installed).toBe(false);
    expect(app.ctx.services.collections.list({ kind: "dataset" })).toHaveLength(0);
    expect(fs.existsSync(workingCopyDir(app.ctx.config.dataDir))).toBe(false);
  });

  it("refuses files that are not the ones listed, and installs nothing", async () => {
    served.set(`embedded/${standIn[2]!.path}`, () => Buffer.from(`${standIn[2]!.bytes.toString().slice(0, -2)}!\n`));
    try {
      const started = await app.api("POST", "/api/radio/propagation/engine-data/download", {});
      await app.ctx.jobs.whenIdle();
      const download = app.ctx.services.downloads.get(started.body.download.id)!;
      expect(download.state).toBe("failed");
      expect(app.ctx.services.collections.list({ kind: "dataset" })).toHaveLength(0);
      expect(fs.existsSync(workingCopyDir(app.ctx.config.dataDir))).toBe(false);
      expect((await dataStatus(app)).installed).toBe(false);
    } finally {
      served.set(`embedded/${standIn[2]!.path}`, () => standIn[2]!.bytes);
    }
  });

  it("refuses a copy in the data directory that has been altered, and names the file", async () => {
    await app.api("DELETE", "/api/radio/propagation/engine-data");
    for (const row of app.ctx.services.downloads.list()) await app.ctx.services.downloads.remove(row.id);
    await app.api("POST", "/api/radio/propagation/engine-data/download", {});
    await app.ctx.jobs.whenIdle();
    expect((await dataStatus(app)).installed).toBe(true);
    const file = path.join(workingCopyDir(app.ctx.config.dataDir), "coeffs/coeff01w.bin");
    fs.writeFileSync(file, "altered");
    const data = await dataStatus(app);
    expect(data.installed).toBe(false);
    expect(data.line).toBe(
      "VOACAP's data on this computer is damaged: coeffs/coeff01w.bin does not match its checksum, so nothing is predicted from it.",
    );
    const predict = await app.api("POST", "/api/radio/propagation/predict", acceptance);
    expect(predict.status).toBe(415);
    expect(predict.body.error.details).toMatchObject({ reason: "engine-data-missing" });
  });
});

describe("a data directory without its copy, beside a downloaded bundle", () => {
  it("is put back from the bundle on start, with no request (a portable drive's, say)", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "outpost-voacap-restore-"));
    const asked: string[] = [];
    const server = fileServer(new Map(standIn.map((file) => [`embedded/${file.path}`, () => file.bytes])), asked);
    try {
      fs.writeFileSync(path.join(dir, "list.json"), JSON.stringify(standInManifest(await listen(server), standIn)));
      const env = { OUTPOST_VOACAP_DATA_MANIFEST: path.join(dir, "list.json") };
      const first = await createTestApp(env, dir, { voacapData: false });
      await first.api("POST", "/api/radio/propagation/engine-data/download", {});
      await first.ctx.jobs.whenIdle();
      await first.close();
      fs.rmSync(workingCopyDir(path.join(dir, "data")), { recursive: true });
      const fetched = asked.length;
      const again = await createTestApp(env, dir, { voacapData: false });
      try {
        expect(await dataStatus(again)).toMatchObject({ installed: true, how: "downloaded" });
        expect(asked.length).toBe(fetched);
      } finally {
        await again.close();
      }
    } finally {
      await new Promise((resolve) => server.close(resolve));
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("an installation from before the data left the repository", () => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "outpost-voacap-adopt-"));
  afterAll(() => fs.rmSync(scratch, { recursive: true, force: true }));

  const withOldCopy = (name: string, alter?: (dir: string) => void) => {
    const dir = path.join(scratch, name);
    // Where an earlier Outpost looked for a copy of its own, laid out as the app folder's was.
    const old = path.join(dir, "data/propagation/voacap-data/itshfbc");
    for (const file of standIn) {
      fs.mkdirSync(path.dirname(path.join(old, file.path)), { recursive: true });
      fs.writeFileSync(path.join(old, file.path), file.bytes);
    }
    alter?.(old);
    fs.writeFileSync(path.join(dir, "list.json"), JSON.stringify(standInManifest("http://127.0.0.1:9/embedded/", standIn)));
    return { dir, old, env: { OUTPOST_VOACAP_DATA_MANIFEST: path.join(dir, "list.json") } };
  };

  it("is taken over on first start, with no download, and the old copy is left alone", async () => {
    const { dir, old, env } = withOldCopy("adopt");
    const app = await createTestApp(env, dir, { voacapData: false });
    try {
      const data = await dataStatus(app);
      expect(data).toMatchObject({ installed: true, how: "adopted", from: old, collectionId: null });
      expect(app.ctx.services.downloads.list()).toHaveLength(0);
      expect(fs.existsSync(path.join(old, "coeffs/coeff01w.bin"))).toBe(true);
      const { body } = await app.api<PropagationDatasets>("GET", "/api/radio/propagation/datasets");
      expect(body.datasets[0]!.where).toMatch(/^Taken over from the app folder of an earlier Outpost on \d{4}-\d{2}-\d{2}/);
    } finally {
      await app.close();
    }
  });

  it("is not taken over when a file does not match", async () => {
    const { dir, env } = withOldCopy("altered", (old) => fs.writeFileSync(path.join(old, "coeffs/fof2CCIR.daw"), "altered"));
    const app = await createTestApp(env, dir, { voacapData: false });
    try {
      expect((await dataStatus(app)).installed).toBe(false);
      expect(fs.existsSync(workingCopyDir(app.ctx.config.dataDir))).toBe(false);
    } finally {
      await app.close();
    }
  });
});

describeWithVoacapData("downloading the real files, then predicting", () => {
  let app: TestApp;
  let server: http.Server;
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "outpost-voacap-real-"));

  beforeAll(async () => {
    const real = coefficientsManifest();
    server = fileServer(
      new Map(real.files.map((file) => [`embedded/${file.path}`, () => fs.readFileSync(path.join(VOACAP_CACHE, file.path))])),
    );
    const base = await listen(server);
    // Outpost's own list, checksums and all; only the address is the local server's.
    fs.writeFileSync(path.join(scratch, "list.json"), JSON.stringify({ ...real, source: { ...real.source, baseUrl: base } }));
    app = await createTestApp({ OUTPOST_VOACAP_DATA_MANIFEST: path.join(scratch, "list.json") }, undefined, { voacapData: false });
  });
  afterAll(async () => {
    await app.close();
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(scratch, { recursive: true, force: true });
  });

  it("predicts once the download is done, with no restart", async () => {
    expect((await app.api("POST", "/api/radio/propagation/predict", acceptance)).status).toBe(415);
    await app.api("POST", "/api/radio/propagation/engine-data/download", {});
    await app.ctx.jobs.whenIdle();
    expect(await engineStatus(app)).toMatchObject({ ready: true, problem: null, data: { installed: true, how: "downloaded" } });
    const { status, body } = await app.api("POST", "/api/radio/propagation/predict", acceptance);
    expect(status).toBe(200);
    expect(body.hours).toHaveLength(24);
    expect(body.datasets).toContainEqual({ id: "voacap-coefficients", version: "hfcast-bf34e8f9f375" });
  });

  it("stops at once when they are removed, even with the engine loaded", async () => {
    expect(app.ctx.services.propagation.internals.host.loaded).toBe(true);
    await app.api("DELETE", "/api/radio/propagation/engine-data");
    expect(app.ctx.services.propagation.internals.host.loaded).toBe(false);
    const asked = await app.api("POST", "/api/radio/propagation/predict", { ...acceptance, powerWatts: 50 });
    expect(asked.status).toBe(415);
  });
});
