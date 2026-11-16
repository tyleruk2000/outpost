/**
 * HF coverage maps through the API, with the real engine: every cell is the engine's
 * own answer for that place, a cell it cannot answer holds nothing, the work is a job
 * that can be stopped, the answer is kept, and what a request may ask for is bounded.
 */
import fs from "node:fs";
import path from "node:path";
import {
  ANTENNA_PRESETS,
  type CoverageOverview,
  type CoverageRequest,
  type CoverageResult,
  coverageCellAt,
  coverageCellBox,
  coverageCellCentre,
  coverageClasses,
  coverageClassOf,
  coverageGrid,
  coverageValue,
  type PredictionResult,
} from "@outpost/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { appRoot } from "../src/core/paths.ts";
import { COVERAGE_JOB, COVERAGE_MAX_WAITING } from "../src/modules/propagation/coverage.ts";
import { createTestApp, type TestApp } from "./helpers.ts";

const dipole = ANTENNA_PRESETS.find((preset) => preset.id === "low-dipole")!.spec;

/** The acceptance transmitter, over Britain and Ireland: 16 columns by 16 rows. */
const britain: CoverageRequest = {
  tx: { name: "London", lat: 51.5074, lon: -0.1278 },
  date: "2026-11-16",
  powerWatts: 5,
  txAntenna: dipole,
  rxAntenna: dipole,
  noise: "city",
  frequencyMhz: 7.1,
  mode: "ssb",
  solar: { source: "table" },
  area: { west: -11, south: 49, east: 3, north: 59 },
  resolution: "coarse",
};

/** A strip one cell high: sixteen cells, so that a test which needs many maps stays quick. */
const strip = (south: number): CoverageRequest => ({ ...britain, area: { west: -8, south, east: 8, north: south + 0.5 } });

let app: TestApp;
beforeAll(async () => {
  app = await createTestApp();
});
afterAll(async () => {
  await app.close();
});

/** Asks for a map and waits for the job, as the screen does. */
async function worked(request: CoverageRequest): Promise<CoverageResult> {
  const asked = await app.api("POST", "/api/radio/propagation/coverage", request);
  expect(asked.status).toBe(200);
  if (asked.body.coverage) return asked.body.coverage;
  await app.ctx.jobs.whenIdle();
  const job = (await app.api("GET", `/api/jobs/${asked.body.job.id}`)).body.job;
  expect(job.state).toBe("succeeded");
  return (await app.api("GET", `/api/radio/propagation/coverage/${job.result.key}`)).body.coverage;
}

describe("the grid", () => {
  it("cuts the longer side into the cells of the resolution and keeps cells about square on the ground", () => {
    const grid = coverageGrid(britain.area, "coarse");
    expect([grid.columns, grid.rows]).toEqual([13, 16]);
    expect(grid.cellHeightKm).toBeCloseTo((10 / 16) * 111.195, 3);
    expect(Math.abs(grid.cellWidthKm - grid.cellHeightKm)).toBeLessThan(6);
    expect(coverageGrid(britain.area, "medium").rows).toBe(32);
    expect(coverageGrid(britain.area, "fine").rows).toBe(48);
    // Never more than the finest grid on a square area.
    expect(coverageGrid({ west: 0, south: 0, east: 10, north: 10 }, "fine")).toMatchObject({ columns: 48, rows: 48 });
  });

  it("finds the cell a place is in, and the place a cell is at", () => {
    const grid = coverageGrid(britain.area, "coarse");
    for (const index of [0, 12, 13, 100, grid.columns * grid.rows - 1]) {
      const centre = coverageCellCentre(grid, index);
      expect(coverageCellAt(grid, centre.lat, centre.lon)).toBe(index);
      const [west, south, east, north] = coverageCellBox(grid, index);
      expect(centre.lon).toBeCloseTo((west + east) / 2, 9);
      expect(centre.lat).toBeCloseTo((south + north) / 2, 9);
    }
    expect(coverageCellAt(grid, 48.9, 0)).toBeNull();
    expect(coverageCellAt(grid, 55, 3.1)).toBeNull();
  });

  it("carries an area across the date line without splitting a cell", () => {
    const grid = coverageGrid({ west: 170, south: -45, east: 190, north: -35 }, "coarse");
    const last = grid.columns - 1;
    expect(coverageCellBox(grid, last)[2]).toBe(190);
    const centre = coverageCellCentre(grid, last);
    expect(centre.lon).toBeLessThan(-170);
    expect(coverageCellAt(grid, centre.lat, centre.lon)).toBe(last);
  });

  it("puts a value in the class the legend names", () => {
    const classes = coverageClasses("reliability");
    expect(coverageClassOf(classes, 0.09)).toBe(-1);
    expect(coverageClassOf(classes, 0.1)).toBe(0);
    expect(coverageClassOf(classes, 0.55)).toBe(2);
    expect(coverageClassOf(classes, 1)).toBe(4);
    const cell = { distanceKm: 1, bearingDeg: 0, reliability: [0.5, null], snrDbHz: [47, null], signalDbw: [-103, null] };
    expect(coverageValue(cell, "reliability", 1, 45)).toBe(0.5);
    expect(coverageValue(cell, "snr", 1, 45)).toBe(2);
    expect(coverageValue(cell, "signal", 1, 45)).toBe(-73);
    // An hour with no path, a cell with no answer and a mode with no figure have no value.
    expect(coverageValue(cell, "signal", 2, 45)).toBeNull();
    expect(coverageValue(null, "reliability", 1, 45)).toBeNull();
    expect(coverageValue(cell, "snr", 1, null)).toBeNull();
  });
});

describe("a coverage map", () => {
  let map: CoverageResult;
  beforeAll(async () => {
    map = await worked(britain);
  });

  it("holds the engine's own answer for the centre of every cell", async () => {
    expect(map.grid).toMatchObject({ columns: 13, rows: 16 });
    expect(map.cells).toHaveLength(208);
    expect(map.unanswered).toEqual([]);
    expect(map.tookMs).toBeGreaterThan(0);
    // Three cells, near and far, against the planner's answer for the same path.
    for (const index of [0, 71, 207]) {
      const centre = coverageCellCentre(map.grid, index);
      const point = (
        await app.api<PredictionResult>("POST", "/api/radio/propagation/predict", {
          tx: britain.tx,
          rx: { name: "cell", lat: centre.lat, lon: centre.lon },
          date: britain.date,
          powerWatts: 5,
          txAntenna: dipole,
          rxAntenna: dipole,
          noise: "city",
          frequencyMhz: 7.1,
          mode: "ssb",
          solar: { source: "table" },
        })
      ).body;
      const cell = map.cells[index]!;
      expect(cell.distanceKm).toBe(point.path.distanceKm);
      expect(cell.reliability).toEqual(point.hours.map((hour) => hour.asked.reliability));
      expect(cell.snrDbHz).toEqual(point.hours.map((hour) => hour.asked.snrDbHz));
      expect(cell.signalDbw).toEqual(point.hours.map((hour) => hour.asked.signalDbw));
    }
  });

  it("is not a set of rings: cells the same distance away differ", () => {
    // By distance alone every cell of one ring would hold the same figures. Take pairs
    // of cells within 15 km of the same distance and find some that disagree at noon.
    const cells = map.cells.map((cell, index) => ({ cell: cell!, index })).sort((a, b) => a.cell.distanceKm - b.cell.distanceKm);
    let differing = 0;
    for (let at = 1; at < cells.length; at++) {
      const [a, b] = [cells[at - 1]!.cell, cells[at]!.cell];
      if (b.distanceKm - a.distanceKm < 15 && Math.abs(a.snrDbHz[11]! - b.snrDbHz[11]!) >= 1) differing += 1;
    }
    expect(differing).toBeGreaterThan(10);
  });

  it("says what it rests on and what it leaves out", () => {
    expect(map.engine).toMatchObject({ id: "voacap", name: "VOACAP" });
    expect(map.basis.summary).toContain("Monthly median for November 2026 at smoothed sunspot number 83");
    expect(map.mode).toMatchObject({ id: "ssb", requiredSnrDbHz: 45 });
    expect(map.datasets.map((item) => item.id)).toEqual(["voacap-coefficients", "solar-cycle"]);
    // No bearing was given, so the transmitting dipole was turned to each cell, and the map says so first.
    expect(map.limits[0]).toContain("turned broadside to each cell in turn");
    expect(map.antennas.tx).toContain("broadside turned towards each cell");
    expect(map.antennas.rx).toContain("broadside turned towards the transmitter");
    expect(map.limits.join(" ")).toContain("Nothing between cell centres was worked out");
  });

  it("is kept, and asked for again is answered without a job", async () => {
    const again = await app.api("POST", "/api/radio/propagation/coverage", britain);
    expect(again.body.job).toBeUndefined();
    expect(again.body.coverage).toMatchObject({ key: map.key, cached: true });
    expect(again.body.coverage.cells).toEqual(map.cells);
    // A different question is a different map.
    const other = await worked({ ...britain, frequencyMhz: 3.65 });
    expect(other.key).not.toBe(map.key);
    expect(other.cells[71]!.snrDbHz).not.toEqual(map.cells[71]!.snrDbHz);
  });

  it("shows a fixed antenna's pattern when the antenna is given a bearing", async () => {
    const fixed = await worked({ ...britain, txAntenna: { ...dipole, broadsideDeg: 0 } });
    expect(fixed.limits[0]).not.toContain("turned broadside");
    expect(fixed.antennas.tx).toContain("broadside towards 0°");
    const differs = fixed.cells.filter((cell, index) => cell!.signalDbw[11] !== map.cells[index]!.signalDbw[11]);
    expect(differs.length).toBeGreaterThan(50);
  });

  it("leaves out the cell the transmitter is at the centre of, and says why", async () => {
    // One row of sixteen one-degree cells; the transmitter sits exactly on one centre.
    const centred = await worked({ ...strip(51), tx: { name: "On a centre", lat: 51.25, lon: 0.5 } });
    expect(centred.cells).toHaveLength(16);
    const index = coverageCellAt(centred.grid, 51.25, 0.5)!;
    expect(centred.cells[index]).toBeNull();
    expect(centred.unanswered).toEqual([{ index, reason: expect.stringContaining("The transmitter is at the centre of this cell") }]);
    expect(centred.cells.filter((cell) => cell !== null)).toHaveLength(15);
  });

  it("gives no reliability for a mode with no figure, and still gives the ratios", async () => {
    const digital = await worked({ ...strip(52), mode: "digital" });
    expect(digital.mode.requiredSnrDbHz).toBeNull();
    expect(digital.cells[3]!.reliability).toBeNull();
    expect(digital.cells[3]!.snrDbHz).toHaveLength(24);
    expect(coverageValue(digital.cells[3]!, "reliability", 12, null)).toBeNull();
  });
});

describe("what a coverage request may ask for", () => {
  it("is checked before any work is queued", async () => {
    const refused = async (patch: Record<string, unknown>) => {
      const { status, body } = await app.api("POST", "/api/radio/propagation/coverage", { ...britain, ...patch });
      expect(status).toBe(400);
      return JSON.stringify(body.error);
    };
    expect(await refused({ area: { west: 0, south: 50, east: 0.2, north: 51 } })).toContain("too small for a grid");
    expect(await refused({ area: { west: -170, south: 0, east: 200, north: 10 } })).toContain("wider than the whole Earth");
    expect(await refused({ area: { west: 0, south: 50, east: 10, north: 89.5 } })).toContain("north");
    expect(await refused({ frequencyMhz: 1.9 })).toContain("2 to 30 MHz");
    expect(await refused({ resolution: "finest" })).toContain("resolution");
    // A measured foF2 belongs to one path, not to a map.
    expect(await refused({ solar: { source: "fof2", fof2Mhz: 6, utcHour: 12 } })).toContain("solar");
    expect(await refused({ mode: "digital", requiredSnrDb: -60, referenceBandwidthHz: 1 })).toContain("outside what the engine takes");
    expect(app.ctx.jobs.list({ states: ["queued", "running"] })).toEqual([]);
  });

  it("refuses a fourth map while three are waiting, and gives the same job for the same map", async () => {
    const paused = [53, 54, 55].map((south) =>
      app.ctx.jobs.enqueue(
        COVERAGE_JOB,
        { request: strip(south) as never },
        { title: "Waiting", paused: true, subject: `waiting-${south}` },
      ),
    );
    expect(paused).toHaveLength(COVERAGE_MAX_WAITING);
    const fourth = await app.api("POST", "/api/radio/propagation/coverage", strip(56));
    expect(fourth.status).toBe(409);
    expect(fourth.body.error.message).toContain("3 coverage maps are already being worked out or waiting their turn");
    for (const job of paused) app.ctx.jobs.cancel(job.id);
    await app.ctx.jobs.whenIdle();

    // The same map asked for twice while it is being worked out is one job.
    const fine = { ...britain, resolution: "fine" as const, frequencyMhz: 14.18 };
    const [first, second] = await Promise.all([
      app.api("POST", "/api/radio/propagation/coverage", fine),
      app.api("POST", "/api/radio/propagation/coverage", fine),
    ]);
    expect(first.body.job.id).toBeTruthy();
    expect(second.body.job.id).toBe(first.body.job.id);
    await app.ctx.jobs.whenIdle();
  });
});

describe("the job", () => {
  it("reports each cell, and can be stopped without losing the engine", async () => {
    const fine = { ...britain, resolution: "fine" as const, frequencyMhz: 10.12 };
    const asked = await app.api("POST", "/api/radio/propagation/coverage", fine);
    const id = asked.body.job.id;
    expect(asked.body.job.title).toBe("HF coverage from London, 10.12 MHz, 1872 cells");
    // Let it get somewhere, then stop it.
    let seen = 0;
    for (let tries = 0; tries < 400 && seen === 0; tries++) {
      await new Promise((resolve) => setTimeout(resolve, 25));
      seen = app.ctx.jobs.get(id)?.progressCurrent ?? 0;
    }
    expect(seen).toBeGreaterThan(0);
    expect(app.ctx.jobs.get(id)?.progressTotal).toBe(1872);
    expect((await app.api("POST", `/api/jobs/${id}/cancel`)).status).toBe(200);
    await app.ctx.jobs.whenIdle();
    expect(app.ctx.jobs.get(id)?.state).toBe("cancelled");
    // Nothing of a half-finished grid is kept.
    const { key } = await app.ctx.services.propagation.coverage.find(fine);
    expect((await app.api("GET", `/api/radio/propagation/coverage/${key}`)).status).toBe(404);
    // The engine was not ended with it: a prediction is answered straight away.
    expect(app.ctx.services.propagation.internals.host.loaded).toBe(true);
    const point = await app.api("POST", "/api/radio/propagation/predict", {
      ...britain,
      rx: { name: "Birmingham", lat: 52.4862, lon: -1.8904 },
      area: undefined,
      resolution: undefined,
    });
    expect(point.status).toBe(200);
  });

  it("starts again from the first cell when it is put back in the queue, as after a restart", async () => {
    const request = strip(57);
    const job = app.ctx.jobs.enqueue(COVERAGE_JOB, { request: request as never }, { title: "Paused", paused: true });
    expect(app.ctx.jobs.get(job.id)?.state).toBe("paused");
    app.ctx.jobs.resume(job.id);
    await app.ctx.jobs.whenIdle();
    const done = app.ctx.jobs.get(job.id)!;
    expect(done.state).toBe("succeeded");
    expect(done.result).toMatchObject({ kind: "coverage", cells: 16, unanswered: 0 });
  });

  it("fails in words when the engine's data is damaged, and keeps nothing", async () => {
    const broken = await createTestApp();
    try {
      const copy = path.join(broken.ctx.config.dataDir, "propagation/voacap-data");
      fs.cpSync(path.join(appRoot, "engines/voacap/data"), copy, { recursive: true });
      fs.writeFileSync(path.join(copy, "itshfbc/coeffs/coeff11w.bin"), "not the coefficients");
      const { status, body } = await broken.api("POST", "/api/radio/propagation/coverage", britain);
      expect(status).toBe(415);
      expect(body.error.message).toContain("A propagation data file is damaged");
      expect(body.coverage).toBeUndefined();
    } finally {
      await broken.close();
    }
  });
});

describe("saved coverage maps", () => {
  it("are listed, reopened with the figures they were saved with, and deleted", async () => {
    const map = await worked(britain);
    const saved = await app.api("POST", "/api/radio/propagation/coverage/saved", { name: "Britain on 40 m", key: map.key });
    expect(saved.status).toBe(200);
    expect(saved.body.saved).toMatchObject({ name: "Britain on 40 m", key: map.key, ssn: 83, cells: 208 });
    // Saving the same map again renames it; it is not listed twice.
    await app.api("POST", "/api/radio/propagation/coverage/saved", { name: "Britain, 40 m, November", key: map.key });
    let overview = (await app.api<CoverageOverview>("GET", "/api/radio/propagation/coverage")).body;
    expect(overview.saved.map((item) => item.name)).toEqual(["Britain, 40 m, November"]);
    expect(overview.limits).toEqual({ maxCells: 2304, maxWaiting: 3 });

    // Ten more maps push unsaved ones out of what is kept; the saved one stays.
    const others: string[] = [];
    for (let n = 0; n < 10; n++) others.push((await worked(strip(30 + n))).key);
    expect((await app.api("GET", `/api/radio/propagation/coverage/${others[0]}`)).status).toBe(404);
    expect((await app.api("GET", `/api/radio/propagation/coverage/${others[9]}`)).status).toBe(200);
    const reopened = await app.api("GET", `/api/radio/propagation/coverage/${map.key}`);
    expect(reopened.status).toBe(200);
    expect(reopened.body.coverage.cells).toEqual(map.cells);
    expect(reopened.body.coverage.computedAt).toBe(map.computedAt);
    // The saved predictions of the planner are another list.
    expect((await app.api("GET", "/api/radio/propagation/saved")).body.saved).toEqual([]);

    const removed = await app.api("DELETE", `/api/radio/propagation/coverage/saved/${overview.saved[0]!.id}`);
    expect(removed.status).toBe(200);
    overview = (await app.api<CoverageOverview>("GET", "/api/radio/propagation/coverage")).body;
    expect(overview.saved).toEqual([]);
    expect((await app.api("DELETE", "/api/radio/propagation/coverage/saved/nothing")).status).toBe(404);
    expect((await app.api("POST", "/api/radio/propagation/coverage/saved", { name: "Gone", key: "0".repeat(40) })).status).toBe(404);
  });
});

describe("what is kept of maps and plans", () => {
  let own: TestApp;
  const pause = () => new Promise((resolve) => setTimeout(resolve, 5));
  const used = () =>
    own.ctx.sqlite.prepare("SELECT key, last_used_at AS at FROM propagation_results ORDER BY key").all() as Array<{
      key: string;
      at: number;
    }>;
  const point = (lat: number) => ({
    ...britain,
    rx: { name: "Somewhere", lat, lon: -1.89 },
    area: undefined,
    resolution: undefined,
  });

  beforeAll(async () => {
    own = await createTestApp();
    const map = async (request: CoverageRequest): Promise<CoverageResult> => {
      const asked = await own.api("POST", "/api/radio/propagation/coverage", request);
      expect(asked.status).toBe(200);
      await own.ctx.jobs.whenIdle();
      return (await own.api("GET", `/api/radio/propagation/coverage/${own.ctx.jobs.get(asked.body.job.id)!.subject}`)).body.coverage;
    };
    // Six maps saved by name and two plans worked out: eight large answers a person has pinned.
    for (let n = 0; n < 6; n++) {
      const saved = await own.api("POST", "/api/radio/propagation/coverage/saved", {
        name: `Strip ${n}`,
        key: (await map(strip(40 + n))).key,
      });
      expect(saved.status).toBe(200);
    }
    for (const name of ["North net", "South net"]) {
      const station = (id: string, lat: number) => ({
        id,
        name: id,
        lat,
        lon: name === "North net" ? -3.1 : -0.1,
        powerWatts: 5,
        antenna: dipole,
        antennaName: "Low horizontal dipole, 5 m",
        noise: "residential",
      });
      const { body } = await own.api("POST", "/api/radio/communication-plans", {
        name,
        notes: "",
        stations: [station("a", 51.5), station("b", 54.4)],
        date: "2026-11-16",
        fromUtc: 8,
        toUtc: 17,
        bands: ["40m"],
        mode: "ssb",
        requiredSnrDb: null,
        referenceBandwidthHz: null,
        solar: { source: "table" },
        links: [],
      });
      expect((await own.api("POST", `/api/radio/communication-plans/${body.plan.id}/matrix`)).status).toBe(200);
    }
    (own as TestApp & { map?: typeof map }).map = map;
  });
  afterAll(async () => {
    await own.close();
  });

  it("is not reordered by the lists that only say what there is", async () => {
    const before = used();
    expect(before).toHaveLength(8);
    await pause();
    const overview = (await own.api<CoverageOverview>("GET", "/api/radio/propagation/coverage")).body;
    expect(overview.saved).toHaveLength(6);
    expect(overview.saved[0]).toMatchObject({ name: "Strip 5", cells: 16, ssn: 83 });
    const plans = (await own.api("GET", "/api/radio/communication-plans")).body.plans;
    expect(plans.map((plan: { workedOut: boolean }) => plan.workedOut)).toEqual([true, true]);
    expect((await own.api("GET", `/api/radio/communication-plans/${plans[0].id}`)).body.plan.workedOut).toBe(true);
    expect(used()).toEqual(before);
  });

  it("keeps a new map that is not saved yet, however many saved maps and plans there are", async () => {
    const { map } = own as TestApp & { map: (request: CoverageRequest) => Promise<CoverageResult> };
    const fresh = await map(strip(50));
    await pause();
    // The screen fetches its lists again when the map's job ends.
    await own.api("GET", "/api/radio/propagation/coverage");
    await own.api("GET", "/api/radio/communication-plans");
    await pause();
    // Anything else worked out and kept, a single path here, trims what is kept.
    expect((await own.api("POST", "/api/radio/propagation/predict", point(52.49))).status).toBe(200);
    const saved = await own.api("POST", "/api/radio/propagation/coverage/saved", { name: "The new one", key: fresh.key });
    expect(saved.status).toBe(200);
    expect(saved.body.saved).toMatchObject({ name: "The new one", key: fresh.key, cells: 16 });
  });

  it("drops the least recently used of the unsaved ones past eight, and only those", async () => {
    const { map } = own as TestApp & { map: (request: CoverageRequest) => Promise<CoverageResult> };
    const keys: string[] = [];
    for (let n = 0; n < 10; n++) {
      keys.push((await map(strip(60 + n))).key);
      await pause();
    }
    const status = async (key: string) => (await own.api("GET", `/api/radio/propagation/coverage/${key}`)).status;
    expect(await status(keys[0]!)).toBe(404);
    expect(await status(keys[1]!)).toBe(404);
    for (const key of keys.slice(2)) expect(await status(key)).toBe(200);
    // Seven saved maps (the six, and the new one) and two plans are all still there.
    expect((await own.api<CoverageOverview>("GET", "/api/radio/propagation/coverage")).body.saved).toHaveLength(7);
    const plans = (await own.api("GET", "/api/radio/communication-plans")).body.plans;
    expect(plans.map((plan: { workedOut: boolean }) => plan.workedOut)).toEqual([true, true]);
    const count = own.ctx.sqlite.prepare("SELECT count(*) AS n FROM propagation_results WHERE kind IN ('coverage', 'plan')").get() as {
      n: number;
    };
    expect(count.n).toBe(9 + 8);
  });

  it("lists a saved map with the figures of the result it has now, and not at all when it has none", async () => {
    const { map } = own as TestApp & { map: (request: CoverageRequest) => Promise<CoverageResult> };
    const listed = async () => (await own.api<CoverageOverview>("GET", "/api/radio/propagation/coverage")).body.saved;
    const first = (await listed()).find((item) => item.name === "Strip 0")!;
    const stored = (await own.api("GET", `/api/radio/propagation/coverage/${first.key}`)).body.coverage as CoverageResult;
    expect(first).toMatchObject({
      computedAt: stored.computedAt,
      ssn: stored.basis.ssn,
      cells: stored.cells.length,
      request: stored.request,
    });
    // The result goes (as "erase" would take it, or a fault), and the map cannot be shown.
    own.ctx.sqlite.prepare("DELETE FROM propagation_results WHERE key = ?").run(first.key);
    expect((await listed()).map((item) => item.name)).not.toContain("Strip 0");
    // Worked out again it is the same question under the same key, with figures of its own.
    await pause();
    const again = await map(strip(40));
    expect(again.key).toBe(first.key);
    expect(again.computedAt).toBeGreaterThan(first.computedAt);
    expect((await listed()).find((item) => item.name === "Strip 0")).toMatchObject({ key: first.key, computedAt: again.computedAt });
  });
});
