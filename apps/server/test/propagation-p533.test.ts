/**
 * The second model, the ITU's P.533, around its engine: the sandbox it runs in, the
 * question as the ITU's program reads it, the report read back, the side-by-side
 * comparison, its cache key, the maps' download, and the routes on a real server with
 * the engine and maps absent and, where they are on this computer, present.
 *
 * Nothing of the ITU's is in the repository. Tests of Outpost's own glue use stand-ins
 * written here; every stand-in figure below is made up for the test and says so. The
 * tests that need the real engine and maps run only when they are on this computer
 * (node scripts/build-p533-engine.mjs --maps) and are reported as skipped otherwise.
 * No test reaches the internet.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import {
  ANTENNA_PRESETS,
  HF_BANDS,
  type PredictionCell,
  type PredictionRequest,
  type PredictionResult,
  type SecondModelComparison,
  type SecondModelStatus,
} from "@outpost/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { appRoot } from "../src/core/paths.ts";
import type { CircuitRequest } from "../src/modules/propagation/engine.ts";
import { buildComparison, comparedFrequencies, comparisonKeyBody } from "../src/modules/propagation/p533/compare.ts";
import { type P533Circuit, questionOf } from "../src/modules/propagation/p533/engine.ts";
import { MapsBundle, type MapsManifest, P533_MANIFEST } from "../src/modules/propagation/p533/files.ts";
import { checkQuestion, figure, inputFile, NOISE_NAMES, parseReport, wattsToDbKw } from "../src/modules/propagation/p533/input.ts";
import { createP533Wasi, normalisePath, ProgramExit } from "../src/modules/propagation/p533/wasi.ts";
import { createTestApp, type TestApp } from "./helpers.ts";
import { tempDir } from "./temp.ts";

const iso = ANTENNA_PRESETS.find((preset) => preset.id === "isotropic")!.spec;
const dipole = ANTENNA_PRESETS.find((preset) => preset.id === "low-dipole")!.spec;

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

const circuit: CircuitRequest = {
  tx: acceptance.tx,
  rx: acceptance.rx,
  year: 2026,
  month: 11,
  ssn: 83,
  powerWatts: 5,
  frequenciesMhz: [7.1],
  requiredSnrDbHz: 45,
  noiseDbwAt3Mhz: -140.4,
  txAntenna: iso,
  rxAntenna: iso,
};

// ── The sandbox ──────────────────────────────────────────────────────────────

describe("the sandbox the ITU's program runs in", () => {
  // The server's TypeScript settings leave out the browser's declarations; the API is Node's.
  const { Memory } = (globalThis as unknown as { WebAssembly: { Memory: new (size: { initial: number }) => { buffer: ArrayBuffer } } })
    .WebAssembly;
  const memory = new Memory({ initial: 1 });
  const view = () => new DataView(memory.buffer);
  const put = (at: number, text: string) => {
    const bytes = new TextEncoder().encode(text);
    new Uint8Array(memory.buffer, at, bytes.length).set(bytes);
    return bytes.length;
  };
  const make = () => {
    const wasi = createP533Wasi({
      args: ["ITURHFProp", "-s", "/outpost/input.txt", "/outpost/report.txt"],
      files: new Map([["Data/ionos11.bin", new Uint8Array([1, 2, 3, 4])]]),
      outputPath: "outpost/report.txt",
      outputLimit: 8,
    });
    wasi.bind(memory);
    return wasi.imports as unknown as Record<string, (...args: unknown[]) => number>;
  };
  const open = (imports: Record<string, (...args: unknown[]) => number>, name: string, flags = 0) => {
    const length = put(1000, name);
    const code = imports.path_open!(3, 0, 1000, length, flags, 0n, 0n, 0, 2000);
    return { code, fd: view().getUint32(2000, true) };
  };

  it("keeps .. at the top of the tree, as a real disk does", () => {
    expect(normalisePath("../Data/ionos11.bin")).toBe("Data/ionos11.bin");
    expect(normalisePath("/a/../../b//./c")).toBe("b/c");
  });

  it("reads the files it was given, and no others", () => {
    const imports = make();
    const found = open(imports, "../Data/ionos11.bin");
    expect(found.code).toBe(0);
    expect(open(imports, "/etc/passwd").code).toBe(44);
    expect(open(imports, "Data").code).toBe(44);
    // Read two bytes from the given file.
    view().setUint32(3000, 3100, true);
    view().setUint32(3004, 2, true);
    expect(imports.fd_read!(found.fd, 3000, 1, 3200)).toBe(0);
    expect(view().getUint32(3200, true)).toBe(2);
    expect([...new Uint8Array(memory.buffer, 3100, 2)]).toEqual([1, 2]);
  });

  it("writes only the report, and only up to its limit", () => {
    const imports = make();
    expect(open(imports, "Data/ionos11.bin", 1 | 8).code).toBe(69);
    expect(open(imports, "elsewhere.txt", 1).code).toBe(69);
    const report = open(imports, "/outpost/report.txt", 1 | 8);
    expect(report.code).toBe(0);
    const write = (text: string) => {
      view().setUint32(3000, 3100, true);
      view().setUint32(3004, put(3100, text), true);
      return imports.fd_write!(report.fd, 3000, 1, 3200);
    };
    expect(write("12345")).toBe(0);
    expect(write("6789")).toBe(22);
  });

  it("ends the program by throwing its exit code", () => {
    expect(() => make().proc_exit!(113)).toThrow(ProgramExit);
  });
});

// ── The question and the report ──────────────────────────────────────────────

describe("the question, as the ITU's program reads it", () => {
  it("is asked with isotropic antennas and the noise curve by name, and no text from the request", () => {
    const question = questionOf({ ...circuit, tx: { ...circuit.tx, name: 'Evil"\nPath.SSN 999' } });
    const text = inputFile(question, [7.1, 14.18]);
    expect(text).toContain('TXAntFilePath "ISOTROPIC"');
    expect(text).toContain('RXAntFilePath "ISOTROPIC"');
    expect(text).toContain("TXGOS 0.0");
    expect(text).toContain('Path.ManMadeNoise "CITY"');
    expect(text).toContain("Path.BW 1.0");
    expect(text).toContain("Path.SNRr 45.00");
    expect(text).toContain("Path.txpower -23.010");
    expect(text).toContain("Path.frequency 7.100,14.180");
    expect(text).toContain("Path.hour 1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24");
    expect(text).not.toContain("Evil");
    expect(text).not.toContain("999");
  });

  it("maps each of Outpost's noise settings to the P.372 curve with the same level at 3 MHz", () => {
    expect(NOISE_NAMES).toEqual({ city: "CITY", residential: "RESIDENTIAL", rural: "RURAL", remote: "QUIETRURAL" });
    // P.372: Fam = c − d·log10(f MHz), dB above kTb; −204 dBW in 1 Hz is kTb at 288 K.
    const at3 = (c: number, d: number) => c - d * Math.log10(3) - 204;
    expect(at3(76.8, 27.7)).toBeCloseTo(-140.4, 1);
    expect(at3(72.5, 27.7)).toBeCloseTo(-144.7, 1);
    expect(at3(67.2, 27.7)).toBeCloseTo(-150.0, 1);
    expect(at3(53.6, 28.6)).toBeCloseTo(-164.0, 1);
  });

  it("refuses any antenna but isotropic 0 dBi, rather than quietly running isotropic", () => {
    expect(() => questionOf({ ...circuit, txAntenna: dipole })).toThrow(/isotropic antennas of 0 dBi/);
    expect(() => questionOf({ ...circuit, rxAntenna: { ...iso, gainDb: 3 } })).toThrow(/isotropic/);
    expect(() => questionOf({ ...circuit, noiseDbwAt3Mhz: -150.5 })).toThrow(/named kinds of place/);
  });

  it("says what to change when the program's limits are passed", () => {
    expect(wattsToDbKw(1)).toBeCloseTo(-30, 6);
    expect(() => checkQuestion({ ...questionOf(circuit), powerWatts: 0.5 })).toThrow(/1 W to 1 GW/);
    expect(() => checkQuestion({ ...questionOf(circuit), ssn: 0 })).toThrow(/1 to 311/);
    expect(() => checkQuestion(questionOf(circuit))).not.toThrow();
  });

  it("reads the report's columns by name, with the program's −307 as no figure", () => {
    // A stand-in report written for this test: the column names are the program's, the numbers are made up.
    const header = "month,hour,frequency,distance,BMUF,MUF50,MUF90,MUF10,OPMUF,Ep,PR,Grw,FamT,SNR,BCR,DMidx,Grw";
    const rows = parseReport(`${header}\n11,1,7.10,162.45,3.9,3.9,3.3,5.1,5.0,1.5,-120.5,0.00,60.0,-307.00,12.5,1F2,9.99\n`);
    expect(rows).toHaveLength(1);
    expect(figure(rows[0]!, "Ep")).toBe(1.5);
    expect(figure(rows[0]!, "SNR")).toBeNull();
    expect(rows[0]!.Grw).toBe("0.00");
    expect(() => parseReport("month,hour\n1,2\n")).toThrow(/no frequency column/);
  });
});

// ── The comparison ───────────────────────────────────────────────────────────

/** Stand-in answers: made-up figures in the shapes the two engines give, for testing the comparison only. */
function standIns(): { voacap: PredictionResult; p533: P533Circuit } {
  const frequencies = comparedFrequencies(7.1).map((item) => item.mhz);
  const cell = (mhz: number, hour: number, offset: number): PredictionCell => ({
    mhz,
    path: "1F2",
    hops: 1,
    layer: "F2",
    takeoffDeg: 75,
    virtualHeightKm: 250,
    mufDays: 0.5,
    fieldDbuV: 10 + offset - mhz,
    signalDbw: -110 + offset - mhz,
    noiseDbwHz: -150,
    snrDbHz: 40 + offset - mhz,
    snrLowDb: 8,
    snrUpDb: 6,
    reliability: hour / 24,
    txGainDbi: 0,
    rxGainDbi: 0,
    lossDb: 120,
  });
  const voacapHours = Array.from({ length: 24 }, (_, i) => {
    const cells = frequencies.map((mhz) => cell(mhz, i + 1, 0));
    return { utc: i + 1, mufMhz: i < 12 ? 6 : 12, asked: cells[0]!, bands: cells.slice(1) };
  });
  const voacap = {
    key: "v".repeat(40),
    request: { ...acceptance, txAntenna: iso, rxAntenna: iso },
    mode: { id: "ssb", label: "SSB", requiredSnrDb: 45, referenceBandwidthHz: 1, requiredSnrDbHz: 45, source: "" },
    basis: { kind: "recent-solar", ssn: 83, summary: "", tableDate: null, tableAgeDays: null, ssnLow: null, ssnHigh: null },
    path: { distanceKm: 162.4 },
    engine: { id: "voacap", sha256: "a".repeat(64) },
    datasets: [{ id: "voacap-coefficients", version: "x" }],
    hours: voacapHours,
  } as unknown as PredictionResult;
  const p533 = {
    distanceKm: 162.45,
    hours: Array.from({ length: 24 }, (_, i) => ({
      utc: i + 1,
      mufMhz: i < 10 ? 6 : 12,
      fotMhz: 0,
      hpfMhz: 0,
      opMufMhz: 14,
      localTime: 0,
      cells: frequencies.map((mhz) => ({
        ...cell(mhz, i + 1, -5),
        p533: { bcrPercent: 50, opMufMhz: 14, snr90DbHz: null, modeProbability: null },
      })),
    })),
  } as unknown as P533Circuit;
  return { voacap, p533 };
}

describe("the two models side by side", () => {
  it("keeps each model's figures under its own name and states the difference", () => {
    const { voacap, p533 } = standIns();
    const result = buildComparison({
      key: "k",
      voacap,
      p533,
      p533Engine: { id: "p533" } as never,
      p533Datasets: [{ id: "p533-maps", version: "y" }],
      noise: { label: "Urban", p533: "CITY" },
    });
    expect(result.hours).toHaveLength(24);
    expect(result.hours[0]!.cells).toHaveLength(1 + HF_BANDS.length);
    const asked = result.hours[11]!.cells[0]!;
    expect(asked.mhz).toBe(7.1);
    // Hour 12: VOACAP's MUF is 6 (shut at 7.1), P.533's is 12 (open).
    expect(asked.voacap.open).toBe(false);
    expect(asked.p533.open).toBe(true);
    expect(asked.agreeOnOpen).toBe(false);
    expect(asked.difference.signalDb).toBe(-5);
    expect(asked.difference.mufMhz).toBe(6);
    expect(asked.voacap.reliability).toBeCloseTo(0.5);
    expect(asked.p533.basicCircuitReliabilityPercent).toBe(50);
    expect(asked.p533).not.toHaveProperty("reliability");
    expect(asked.voacap).not.toHaveProperty("basicCircuitReliabilityPercent");
    const row = result.rows[0]!;
    expect(row).toMatchObject({
      label: "7.10 MHz (asked)",
      hoursAgreeOnOpen: 22,
      hoursOpenInBoth: 12,
      signalDifferenceDb: { min: -5, max: -5 },
    });
    expect(result.antennas).toContain("Isotropic, 0 dBi");
    expect(result.notes.join(" ")).toContain("Neither is the right answer");
    expect(result.datasets.map((item) => item.id)).toEqual(["voacap-coefficients", "p533-maps"]);
  });

  it("gives no reliability of either kind for a mode with no requirement", () => {
    const { voacap, p533 } = standIns();
    const none = { ...voacap, mode: { ...voacap.mode, requiredSnrDbHz: null } } as PredictionResult;
    const result = buildComparison({
      key: "k",
      voacap: none,
      p533,
      p533Engine: {} as never,
      p533Datasets: [],
      noise: { label: "", p533: "" },
    });
    expect(result.hours[0]!.cells[0]!.voacap.reliability).toBeNull();
    expect(result.hours[0]!.cells[0]!.p533.basicCircuitReliabilityPercent).toBeNull();
  });

  it("is kept under a key that holds both engines' checksums and data versions", () => {
    const hash = (body: unknown) => createHash("sha256").update(JSON.stringify(body)).digest("hex");
    const base = comparisonKeyBody("v".repeat(40), { sha256: "a" }, [{ id: "p533-maps", version: "1" }]);
    expect(hash(base)).toBe(hash(comparisonKeyBody("v".repeat(40), { sha256: "a" }, [{ id: "p533-maps", version: "1" }])));
    expect(hash(base)).not.toBe(hash(comparisonKeyBody("w".repeat(40), { sha256: "a" }, [{ id: "p533-maps", version: "1" }])));
    expect(hash(base)).not.toBe(hash(comparisonKeyBody("v".repeat(40), { sha256: "b" }, [{ id: "p533-maps", version: "1" }])));
    expect(hash(base)).not.toBe(hash(comparisonKeyBody("v".repeat(40), { sha256: "a" }, [{ id: "p533-maps", version: "2" }])));
  });
});

// ── On a real server ─────────────────────────────────────────────────────────

/** A file server for the maps: paths as in the ITU's repository, with Range requests. */
function fileServer(files: Map<string, () => Buffer>): http.Server {
  return http.createServer((request, response) => {
    const name = decodeURIComponent(new URL(request.url ?? "/", "http://x").pathname.replace(/^\/+/, ""));
    const read = files.get(name);
    if (!read) {
      response.writeHead(404).end();
      return;
    }
    const bytes = read();
    const range = /^bytes=(\d+)-$/.exec(request.headers.range ?? "");
    const start = range ? Number(range[1]) : 0;
    response.writeHead(range ? 206 : 200, {
      "content-length": bytes.length - start,
      ...(range ? { "content-range": `bytes ${start}-${bytes.length - 1}/${bytes.length}` } : {}),
    });
    response.end(bytes.subarray(start));
  });
}

async function listen(server: http.Server): Promise<string> {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
}

/** A manifest for stand-in files, in the same shape as the ITU's list. */
function standInManifest(baseUrl: string, files: Array<{ name: string; bytes: Buffer }>): MapsManifest {
  let offset = 0;
  const whole = createHash("sha256");
  const entries = files.map((file) => {
    const entry = {
      name: file.name,
      path: `P372/Data/${file.name}`,
      offset,
      bytes: file.bytes.length,
      sha256: createHash("sha256").update(file.bytes).digest("hex"),
    };
    offset += file.bytes.length;
    whole.update(file.bytes);
    return entry;
  });
  return { baseUrl, bytes: offset, sha256: whole.digest("hex"), files: entries };
}

describe("on a real server, without the engine or the maps", () => {
  let app: TestApp;
  let server: http.Server;
  const scratch = tempDir("outpost-p533-");
  // Stand-in files, a few bytes each, under the ITU's names.
  const standIn = ["ionos11.bin", "COEFF11W.txt", "P1239-3 Decile Factors.txt"].map((name, i) => ({
    name,
    bytes: Buffer.from(`stand-in ${i} for ${name}, not the ITU's data\n`.repeat(50 + i)),
  }));

  beforeAll(async () => {
    server = fileServer(new Map(standIn.map((file) => [`P372/Data/${file.name}`, () => file.bytes])));
    const base = await listen(server);
    fs.writeFileSync(path.join(scratch, "maps.json"), JSON.stringify(standInManifest(base, standIn)));
    app = await createTestApp({ OUTPOST_P533_MAPS_MANIFEST: path.join(scratch, "maps.json") });
  });

  afterAll(async () => {
    await app.close();
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(scratch, { recursive: true, force: true });
  });

  it("is not offered, and says in one line what to get and how big it is", async () => {
    const { status, body } = await app.api<SecondModelStatus>("GET", "/api/radio/propagation/second-model");
    expect(status).toBe(200);
    expect(body.offered).toBe(false);
    expect(body.maps).toMatchObject({ installed: false, downloading: false, files: 3 });
    expect(body.line).toContain("download the ITU's P.533 maps");
    if (!body.engine.built) expect(body.line).toMatch(/press Build the P\.533 engine|node scripts\/build-p533-engine\.mjs/);
    expect(body.engine.sha256).toBe(P533_MANIFEST.wasm.sha256);
    expect(body.terms).toContain("not an open-source licence");
  });

  it("refuses to compare, saying the same", async () => {
    const { status, body } = await app.api("POST", "/api/radio/propagation/second-model/compare", acceptance);
    expect(status).toBe(415);
    expect(body.error.message).toContain("P.533");
    expect(body.error.details?.reason ?? body.error.reason).toBeDefined();
  });

  it("downloads the maps through the download manager into one collection, and removes them again", async () => {
    const started = await app.api("POST", "/api/radio/propagation/second-model/maps/download", {});
    expect(started.status).toBe(200);
    expect(started.body.download).toMatchObject({ kind: "dataset", title: "ITU-R P.533 ionospheric and noise maps" });
    await app.ctx.jobs.whenIdle();
    const download = app.ctx.services.downloads.get(started.body.download.id)!;
    expect(download.state).toBe("completed");
    const collections = app.ctx.services.collections.list({ kind: "dataset" });
    expect(collections).toHaveLength(1);
    expect(collections[0]).toMatchObject({ publisher: "ITU-R Study Group 3", category: "Radio" });
    const bundle = new MapsBundle(app.ctx.services.collections.absolutePath(collections[0]!.id), standInManifest("x", standIn));
    expect(Buffer.from(bundle.read("COEFF11W.txt")).toString()).toContain("stand-in 1");
    const after = (await app.api<SecondModelStatus>("GET", "/api/radio/propagation/second-model")).body;
    expect(after.maps.installed).toBe(true);
    // A second copy is refused, not duplicated.
    expect((await app.api("POST", "/api/radio/propagation/second-model/maps/download", {})).status).toBe(409);
    await app.ctx.services.collections.remove(collections[0]!.id, { deleteFiles: true });
    expect((await app.api<SecondModelStatus>("GET", "/api/radio/propagation/second-model")).body.maps.installed).toBe(false);
  });

  it("refuses maps that are not the files listed, and installs nothing", async () => {
    standIn[1]!.bytes = Buffer.from("changed on the server\n");
    const started = await app.api("POST", "/api/radio/propagation/second-model/maps/download", {});
    await app.ctx.jobs.whenIdle();
    const download = app.ctx.services.downloads.get(started.body.download.id)!;
    expect(download.state).toBe("failed");
    expect(app.ctx.services.collections.list({ kind: "dataset" })).toHaveLength(0);
  });
});

// ── With the real engine and maps, when this computer has them ───────────────

const home = path.join(appRoot, "engines/p533");
const mapsDir = process.env.OUTPOST_P533_MAPS_DIR ?? path.join(home, ".cache/maps");
const realAbsent = !fs.existsSync(path.join(home, "engine", P533_MANIFEST.wasm.file))
  ? "the P.533 engine is not built here (node scripts/build-p533-engine.mjs)"
  : P533_MANIFEST.maps.files.some((file) => !fs.existsSync(path.join(mapsDir, file.name)))
    ? `the ITU's maps are not in ${mapsDir} (node scripts/build-p533-engine.mjs --maps)`
    : null;
if (realAbsent) console.warn(`[p533 with real data] skipped: ${realAbsent}`);

describe.skipIf(realAbsent !== null)("on a real server, with the ITU's engine and maps", () => {
  let app: TestApp;
  let server: http.Server;
  const scratch = tempDir("outpost-p533-real-");

  beforeAll(async () => {
    server = fileServer(new Map(P533_MANIFEST.maps.files.map((file) => [file.path, () => fs.readFileSync(path.join(mapsDir, file.name))])));
    const base = await listen(server);
    // The ITU's own list, checksums and all; only the address is the local server's.
    fs.writeFileSync(path.join(scratch, "maps.json"), JSON.stringify({ ...P533_MANIFEST.maps, baseUrl: base }));
    app = await createTestApp({ OUTPOST_P533_MAPS_MANIFEST: path.join(scratch, "maps.json") });
    await app.api("POST", "/api/radio/propagation/second-model/maps/download", {});
    await app.ctx.jobs.whenIdle();
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(scratch, { recursive: true, force: true });
  });

  it("is offered once the maps are downloaded and match the ITU's checksums", async () => {
    const { body } = await app.api<SecondModelStatus>("GET", "/api/radio/propagation/second-model");
    expect(body).toMatchObject({ offered: true, line: null, engine: { built: true }, maps: { installed: true, files: 25 } });
  });

  it("runs both models on the same path, isotropic, and keeps the answer", async () => {
    const { status, body } = await app.api<SecondModelComparison>("POST", "/api/radio/propagation/second-model/compare", acceptance);
    expect(status).toBe(200);
    expect(body.cached).toBe(false);
    expect(body.hours).toHaveLength(24);
    expect(body.rows).toHaveLength(1 + HF_BANDS.length);
    expect(body.engines.p533).toMatchObject({ id: "p533", sha256: P533_MANIFEST.wasm.sha256 });
    expect(body.engines.voacap.id).toBe("voacap");
    expect(body.noise).toEqual({ label: "Urban (city, industrial)", p533: "CITY" });
    expect(body.distanceKm).toBeGreaterThan(160);
    expect(body.distanceKm).toBeLessThan(165);
    // The first sitting's comparison of this path: both put 7.1 MHz above the MUF at
    // night and below it by day, and P.533's signal is weaker while it is open.
    const asked = body.rows[0]!;
    expect(asked.hoursAgreeOnOpen).toBeGreaterThanOrEqual(20);
    expect(asked.hoursOpenInBoth).toBeGreaterThan(0);
    expect(asked.signalDifferenceDb!.max).toBeLessThan(0);
    const again = await app.api<SecondModelComparison>("POST", "/api/radio/propagation/second-model/compare", acceptance);
    expect(again.body.cached).toBe(true);
    expect(again.body.key).toBe(body.key);
    // The person's own antennas do not change the like-for-like comparison.
    const other = await app.api<SecondModelComparison>("POST", "/api/radio/propagation/second-model/compare", {
      ...acceptance,
      txAntenna: ANTENNA_PRESETS.find((preset) => preset.id === "vertical")!.spec,
    });
    expect(other.body.key).toBe(body.key);
  }, 60_000);

  it("answers a long path, where P.533 uses its own method beyond 9000 km", async () => {
    const { status, body } = await app.api<SecondModelComparison>("POST", "/api/radio/propagation/second-model/compare", {
      ...acceptance,
      rx: { name: "Sydney", lat: -33.87, lon: 151.21 },
      frequencyMhz: 14.18,
    });
    expect(status).toBe(200);
    expect(body.distanceKm).toBeGreaterThan(16_000);
    expect(body.hours).toHaveLength(24);
  }, 60_000);

  it("refuses what the ITU's program refuses, with what to change", async () => {
    const { status, body } = await app.api("POST", "/api/radio/propagation/second-model/compare", { ...acceptance, powerWatts: 0.5 });
    expect(status).toBe(400);
    expect(body.error.message).toContain("1 W to 1 GW");
  });
});
