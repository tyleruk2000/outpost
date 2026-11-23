/**
 * Streets: building them from kept country files, bringing in a set built elsewhere,
 * removing them, and what the set in use is.
 *
 * Outpost does not build anything itself: it leaves a `request.json` in the folder it
 * shares with the streets service (docker/valhalla/outpost-valhalla.sh documents that
 * contract) and follows the `status.json` the service writes, stage by stage, as the
 * task's progress. The service works in a folder of its own and swaps the new streets in
 * only once they are finished, so a failed or stopped build leaves the streets in use as
 * they were. Nothing is downloaded: the country files are already in storage.
 *
 * Cancelling the task leaves a `cancel` file, which stops the build. Outpost stopping
 * (a restart, an update) does not: the build goes on, and the task follows it again when
 * Outpost is back.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { StreetsBuildState, StreetsCountryFile, StreetsEstimate, StreetsRegion, StreetsTileset } from "@outpost/shared";
import type { AppContext } from "../../core/context.ts";
import { AppError, badRequest, conflict } from "../../core/errors.ts";
import { resolveInside } from "../../core/fs-safe.ts";
import { type JobProgress, PermanentJobError } from "../../core/jobs.ts";
import type { SidecarStatus, StreetsConnection, TilesetFile } from "./connection.ts";

export const STREETS_BUILD_JOB = "streets.build";
/** Outpost's own folder for a build's working files on another storage location. The service deletes it when done. */
export const WORK_FOLDER = "outpost-streets-work";
const FOLLOW_EVERY_MS = 3_000;
/** How long the service has to take a request before Outpost says it is not running. It looks every 5 s. */
const TAKE_WITHIN_MS = 60_000;
const STOP_WITHIN_MS = 60_000;
const LOST_AFTER_MS = 30_000;

// ── What a build costs ──────────────────────────────────────────────────────
//
// Measured on a Raspberry Pi 5 (8 GB, SD card) with two threads, 23 Nov 2026
// (docs/development/street-routes-measurements.md): country file size against build time,
// bytes written and the size of the result. Between the points the figures are read off a
// straight line; beyond Great Britain, along the last stretch, and said to be guesses.
const MB = 1_000_000;
const MEASURED: Array<{ input: number; seconds: number; written: number; result: number }> = [
  { input: 54 * MB, seconds: 59, written: 700 * MB, result: 77 * MB }, // Kent
  { input: 131 * MB, seconds: 142, written: 2_300 * MB, result: 185 * MB }, // Greater London
  { input: 2_210 * MB, seconds: 56 * 60, written: 53_000 * MB, result: 2_730 * MB }, // Great Britain
];
/** Memory the Great Britain build took from what was free; smaller areas were not measured, and take less. */
const GB_MEMORY = 2_300 * MB;
const GB_INPUT = MEASURED.at(-1)!.input;
/** The stages of a Great Britain build, as a share of its time: boundaries 77 s, tiles 53 min, packing 75 s. */
const STAGE_SHARE: Record<string, number> = { merge: 0.03, admins: 0.023, tiles: 0.95, extract: 0.022, swap: 0.005 };

function along(input: number, key: "seconds" | "written" | "result"): number {
  const points = MEASURED;
  if (input <= points[0]!.input) return (points[0]![key] * input) / points[0]!.input;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1]!;
    const b = points[i]!;
    if (input <= b.input || i === points.length - 1) return a[key] + ((b[key] - a[key]) * (input - a.input)) / (b.input - a.input);
  }
  return points.at(-1)![key];
}

const gb = (bytes: number) => `${(bytes / 1e9).toLocaleString("en-GB", { maximumFractionDigits: bytes < 10e9 ? 1 : 0 })} GB`;
function minutesWords(minutes: number): string {
  if (minutes < 50) return `about ${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = Math.round((minutes / 60) * 2) / 2;
  return hours === 1 ? "about an hour" : `about ${hours.toLocaleString("en-GB")} hours`;
}

export function estimateBuild(regions: StreetsRegion[], inputBytes: number, joined: boolean, totalMemory = os.totalmem()): StreetsEstimate {
  const minutes = Math.max(1, Math.ceil(along(inputBytes, "seconds") / 60) + (joined ? Math.ceil(inputBytes / (500 * MB)) : 0));
  const writtenBytes = Math.round(along(inputBytes, "written"));
  const resultBytes = Math.round(along(inputBytes, "result"));
  const memoryBytes = inputBytes <= GB_INPUT ? GB_MEMORY : Math.round((GB_MEMORY * inputBytes) / GB_INPUT);
  const freeSpaceBytes = inputBytes * (joined ? 4 : 3);
  const measured = inputBytes <= GB_INPUT * 1.05;
  const warnings: string[] = [
    `This takes ${minutesWords(minutes)} on a Raspberry Pi 5, which is slower for everything else while it builds. The streets in use keep working until the new ones are ready.`,
    `It writes about ${gb(writtenBytes)} to the disk it works on. An SD card wears with writes: build again only when the roads have changed, or work on a USB SSD.`,
    `It needs ${gb(freeSpaceBytes)} free to work in, and the streets take about ${gb(resultBytes)} afterwards.`,
    inputBytes <= GB_INPUT
      ? `It takes up to ${gb(memoryBytes)} of memory (measured for Great Britain; smaller areas take less).`
      : `It may take ${gb(memoryBytes)} of memory or more.`,
  ];
  if (!measured)
    warnings.push(
      "This is larger than anything built on a Raspberry Pi so far (Great Britain, 2.2 GB): the figures are guesses. Expect several hours, and choose a smaller area if this computer has 4 GB of memory.",
    );
  else if (totalMemory < 6e9 && inputBytes > 500 * MB)
    warnings.push(
      `This computer has ${gb(totalMemory)} of memory. Great Britain took 2.3 GB on top of everything else running: a smaller area (a county, a city) is the safer choice.`,
    );
  if (joined) warnings.push("Several country files are joined into one first, which takes longer and needs more room.");
  return { regions, inputBytes, joined, minutes, memoryBytes, writtenBytes, freeSpaceBytes, resultBytes, measured, warnings };
}

// ── The task ────────────────────────────────────────────────────────────────

interface FileRef {
  locationId: string;
  relPath: string;
}

export interface StreetsBuildPayload {
  [key: string]: unknown;
  name: string;
  /** Build: the country files, joined in this order. */
  files?: FileRef[];
  regions?: StreetsRegion[];
  /** Where the working files go, when not in the streets' own volume. */
  workLocationId?: string | null;
  /** Import: a tiles file built elsewhere. */
  import?: FileRef;
  expectedMs?: number | null;
}

const STAGES: Record<string, string> = {
  merge: "Joining the country files",
  admins: "Reading boundaries",
  tiles: "Building streets (the long part)",
  extract: "Packing the streets",
  import: "Copying the streets",
  swap: "Starting the new streets",
  remove: "Removing the streets",
};

function stagesOf(payload: StreetsBuildPayload): string[] {
  if (payload.import) return ["import", "swap"];
  return [...((payload.files?.length ?? 0) > 1 ? ["merge"] : []), "admins", "tiles", "extract", "swap"];
}

export function tilesetOf(file: TilesetFile | null | undefined): StreetsTileset | null {
  if (!file) return null;
  const regions: StreetsRegion[] = file.regions ?? [];
  const countries = [
    ...new Set(
      regions
        .map((r) => r.country)
        .filter((c): c is string => Boolean(c))
        .map((c) => c.toUpperCase()),
    ),
  ];
  const dates = regions
    .map((r) => r.dataDate)
    .filter((d): d is string => Boolean(d))
    .sort();
  return {
    name: file.name,
    regions,
    countries,
    extracts: file.extracts,
    builtAt: file.builtAt,
    sizeBytes: file.tarBytes,
    valhalla: file.valhalla,
    dataDate: dates.at(-1) ?? null,
  };
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });

export interface StreetsTiles {
  countryFiles(): StreetsCountryFile[];
  estimate(regionIds: string[]): StreetsEstimate;
  build(input: { regions: string[]; workLocationId?: string }): { jobId: string; estimate: StreetsEstimate };
  importFile(input: { locationId: string; relPath: string; name?: string }): { jobId: string };
  remove(): Promise<void>;
  tileset(): StreetsTileset | null;
  /** A build under way or waiting, or the last one that failed (until a newer one starts). */
  buildState(): StreetsBuildState | null;
  runJob(input: {
    jobId: string;
    payload: StreetsBuildPayload;
    signal: AbortSignal;
    progress: (update: JobProgress) => void;
  }): Promise<Record<string, unknown>>;
}

export function createStreetsTiles(ctx: AppContext, connection: StreetsConnection): StreetsTiles {
  const dir = connection.dir;
  const file = (name: string) => resolveInside(dir, name);

  function countryFiles(): StreetsCountryFile[] {
    const { storage } = ctx.services;
    const locations = new Map(storage.list().map((l) => [l.id, l]));
    const best = new Map<string, StreetsCountryFile>();
    for (const { row, meta } of ctx.services.countryFiles.keptFiles()) {
      if (row.status !== "installed" || !storage.isAvailable(row.locationId)) continue;
      const entry: StreetsCountryFile = {
        regionId: meta.regionId,
        name: meta.name,
        country: meta.country,
        dataDate: meta.dataDate,
        bytes: row.sizeBytes,
        locationId: row.locationId,
        locationName: locations.get(row.locationId)?.name ?? "Unknown location",
        collectionId: row.id,
      };
      const had = best.get(meta.regionId);
      if (!had || (entry.dataDate ?? "") > (had.dataDate ?? "")) best.set(meta.regionId, entry);
    }
    return [...best.values()].sort((a, b) => a.name.localeCompare(b.name, "en"));
  }

  function chosen(regionIds: string[]) {
    if (regionIds.length === 0) throw badRequest("Choose at least one country file to build streets from.");
    const files = countryFiles();
    return [...new Set(regionIds)].map((id) => {
      const found = files.find((f) => f.regionId === id);
      if (!found)
        throw badRequest(
          `There is no kept country file for “${id}” on a connected storage location. Add the country file (and keep it) from Map data first.`,
        );
      return found;
    });
  }

  function estimate(regionIds: string[]) {
    const files = chosen(regionIds);
    return estimateBuild(
      files.map((f) => ({ regionId: f.regionId, name: f.name, country: f.country, dataDate: f.dataDate })),
      files.reduce((sum, f) => sum + f.bytes, 0),
      files.length > 1,
    );
  }

  function activeJobs() {
    return ctx.jobs.list({ states: ["queued", "running", "paused"], types: [STREETS_BUILD_JOB] });
  }

  function assertCanStart() {
    if (!connection.installed())
      throw badRequest(
        "Streets for routes are not installed. They are an optional add-on: with Docker, set COMPOSE_PROFILES=routes and start Outpost again.",
      );
    if (activeJobs().length > 0) throw conflict("Streets are already being built. Wait for that to finish, or stop it.");
    const said = connection.status();
    if (said?.state === "building") throw conflict("The streets service is already building. Wait for it to finish.");
  }

  const listWords = (words: string[]) => (words.length <= 1 ? (words[0] ?? "") : `${words.slice(0, -1).join(", ")} and ${words.at(-1)}`);

  function build(input: { regions: string[]; workLocationId?: string }) {
    assertCanStart();
    const files = chosen(input.regions);
    if (input.workLocationId) {
      const location = ctx.services.storage.list().find((l) => l.id === input.workLocationId);
      if (!location) throw badRequest("That storage location is not known.");
      if (!ctx.services.storage.isAvailable(location.id)) throw badRequest(`“${location.name}” is not connected.`);
    }
    const est = estimate(input.regions);
    const name = listWords(files.map((f) => f.name));
    const payload: StreetsBuildPayload = {
      name,
      files: files.map((f) => {
        const row = ctx.services.collections.get(f.collectionId)!;
        return { locationId: row.locationId, relPath: row.relPath };
      }),
      regions: est.regions,
      workLocationId: input.workLocationId ?? null,
      expectedMs: est.minutes * 60_000,
    };
    const job = ctx.jobs.enqueue(STREETS_BUILD_JOB, payload, {
      title: `Building streets for routes: ${name}`,
      // While it is read, the (first) country file is not moved or removed.
      subject: `collection:${files[0]!.collectionId}`,
      maxAttempts: 1,
    });
    ctx.events.publish({ type: "streets.changed" });
    ctx.events.publish({ type: "maps.changed" });
    return { jobId: job.id, estimate: est };
  }

  function importFile(input: { locationId: string; relPath: string; name?: string }) {
    assertCanStart();
    const resolved = ctx.services.storage.resolve(input.locationId, input.relPath);
    if (!resolved.endsWith(".tar")) throw badRequest("Choose a streets file: a .tar made by deploy/valhalla/build-tiles.sh.");
    if (!fs.existsSync(resolved)) throw badRequest("That file is not there.");
    const name = input.name?.trim() || path.basename(resolved, ".tar");
    const job = ctx.jobs.enqueue(
      STREETS_BUILD_JOB,
      { name, import: { locationId: input.locationId, relPath: input.relPath }, expectedMs: null } satisfies StreetsBuildPayload,
      { title: `Bringing in streets for routes: ${name}`, maxAttempts: 1 },
    );
    ctx.events.publish({ type: "streets.changed" });
    return { jobId: job.id };
  }

  /** Leaves a request for the service, written whole and renamed into place, so it never reads half of one. */
  function ask(request: Record<string, unknown>) {
    const tmp = file("request.json.part");
    fs.writeFileSync(tmp, JSON.stringify(request));
    fs.renameSync(tmp, file("request.json"));
  }

  async function waitFor(
    test: (status: SidecarStatus | null) => boolean,
    withinMs: number,
    signal?: AbortSignal,
  ): Promise<SidecarStatus | null> {
    const until = Date.now() + withinMs;
    for (;;) {
      const status = connection.status();
      if (test(status)) return status;
      if (Date.now() > until || signal?.aborted) return status;
      await sleep(Math.min(FOLLOW_EVERY_MS, 1000), signal);
    }
  }

  async function runJob({ jobId, payload, signal, progress }: Parameters<StreetsTiles["runJob"]>[0]) {
    const stages = stagesOf(payload);
    const started = connection.status();
    const ours = (s: SidecarStatus | null) => s?.id === jobId;

    if (!ours(started)) {
      if (!connection.installed()) throw new PermanentJobError("Streets for routes are not installed, so nothing can build them.");
      if (started?.state === "building") throw new PermanentJobError("The streets service is busy with another build.");
      const request: Record<string, unknown> = { id: jobId, name: payload.name };
      if (payload.import) {
        request.import = ctx.services.storage.resolve(payload.import.locationId, payload.import.relPath);
      } else {
        const files = payload.files ?? [];
        for (const f of files) {
          if (!ctx.services.storage.isAvailable(f.locationId)) {
            const name = ctx.services.storage.list().find((l) => l.id === f.locationId)?.name ?? "A storage location";
            throw new PermanentJobError(`“${name}”, where a country file is kept, is not connected. Connect it and try again.`);
          }
        }
        request.extracts = files.map((f) => ctx.services.storage.resolve(f.locationId, f.relPath));
        request.regions = payload.regions ?? [];
        if (payload.workLocationId) {
          const work = ctx.services.storage.resolve(payload.workLocationId, WORK_FOLDER);
          fs.mkdirSync(work, { recursive: true });
          request.work = work;
        }
      }
      fs.rmSync(file("cancel"), { force: true });
      ask(request);
      progress({ current: 0, total: stages.length, message: "Waiting for the streets service", stage: "Waiting for the streets service" });
      const taken = await waitFor((s) => ours(s) || !fs.existsSync(file("request.json")), TAKE_WITHIN_MS, signal);
      if (signal.aborted) return stopped(signal);
      if (!ours(taken) && fs.existsSync(file("request.json"))) {
        fs.rmSync(file("request.json"), { force: true });
        throw new PermanentJobError(
          "The streets service did not take the build. Check that it is running (with Docker: COMPOSE_PROFILES=routes, then “docker compose up -d”).",
        );
      }
    }

    // Follow it, stage by stage.
    let lastStage = "";
    let lostSince: number | null = null;
    for (;;) {
      const status = connection.status();
      if (ours(status) && status!.state === "ready") break;
      if (ours(status) && status!.state === "failed") {
        connection.forget();
        ctx.events.publish({ type: "streets.changed" });
        throw new PermanentJobError(status!.message ?? "The streets could not be built. The streets in use are as they were.");
      }
      // The service takes the request a moment before it says so: only a long silence means it lost it.
      if (status && !ours(status) && status.state !== "building" && !fs.existsSync(file("request.json"))) {
        lostSince ??= Date.now();
        if (Date.now() - lostSince > LOST_AFTER_MS)
          throw new PermanentJobError("The streets service lost track of this build (it may have restarted). Start it again.");
      } else lostSince = null;
      const stage = status?.stage ?? "";
      if (ours(status) && stage) {
        const at = Math.max(0, stages.indexOf(stage));
        const words = STAGES[stage] ?? status!.message ?? stage;
        let message = words;
        if (payload.expectedMs && status!.startedAt) {
          // What the stages after this one take, at least; or what is left of the whole by the clock, if more.
          const after = stages.slice(at + 1).reduce((sum, s) => sum + (STAGE_SHARE[s] ?? 0), 0);
          const total = stages.reduce((sum, s) => sum + (STAGE_SHARE[s] ?? 0), 0) || 1;
          const byClock = payload.expectedMs - (Date.now() - status!.startedAt);
          const left = Math.max(1, Math.round(Math.max((payload.expectedMs * after) / total, byClock) / 60_000));
          message = `${words}: about ${left} minute${left === 1 ? "" : "s"} left of the build`;
        }
        progress({ current: at, total: stages.length, message, ...(stage !== lastStage ? { stage: words } : {}) });
        if (stage !== lastStage) ctx.events.publish({ type: "streets.changed" });
        lastStage = stage;
      }
      await sleep(FOLLOW_EVERY_MS, signal);
      if (signal.aborted) return stopped(signal);
    }
    connection.forget();
    progress({ current: stages.length, total: stages.length, message: "Ready" });
    ctx.events.publish({ type: "streets.changed" });
    ctx.events.publish({ type: "maps.changed" });
    const tileset = tilesetOf(connection.status()?.current);
    return { name: tileset?.name ?? payload.name, sizeBytes: tileset?.sizeBytes ?? null };
  }

  /** Cancelled: stop the build (the streets in use stay). Paused or shutting down: leave it building, to be followed again. */
  async function stopped(signal: AbortSignal): Promise<never> {
    if (signal.reason === "cancelled") {
      fs.rmSync(file("request.json"), { force: true });
      fs.writeFileSync(file("cancel"), "");
      await waitFor((s) => s?.state !== "building", STOP_WITHIN_MS);
      ctx.events.publish({ type: "streets.changed" });
    }
    throw new DOMException("Stopped.", "AbortError");
  }

  return {
    countryFiles,
    estimate,
    build,
    importFile,
    async remove() {
      if (!connection.installed()) throw badRequest("Streets for routes are not installed.");
      if (activeJobs().length > 0 || connection.status()?.state === "building")
        throw conflict("Streets are being built. Stop that first, or wait for it to finish.");
      if (!connection.status()?.current) return;
      const id = `remove-${Date.now()}`;
      ask({ id, name: "Remove", remove: true });
      const done = await waitFor((s) => s?.id === id && s.state !== "building", 30_000);
      connection.forget();
      ctx.events.publish({ type: "streets.changed" });
      ctx.events.publish({ type: "maps.changed" });
      if (done?.id !== id || done.current) {
        if (fs.existsSync(file("request.json"))) fs.rmSync(file("request.json"), { force: true });
        throw new AppError("upstream", "The streets service did not remove the streets. Check that it is running, and try again.");
      }
    },
    tileset: () => tilesetOf(connection.status()?.current),
    buildState() {
      const job = activeJobs()[0];
      const said = connection.status();
      if (job) {
        const payload = job.payload as StreetsBuildPayload;
        const stages = stagesOf(payload);
        const ours = said?.id === job.id && said.state === "building";
        const stage = ours ? (said.stage ?? null) : null;
        return {
          jobId: job.id,
          state: ours ? "building" : "waiting",
          stage,
          stageLabel: stage ? (STAGES[stage] ?? stage) : null,
          step: stage ? { at: Math.max(0, stages.indexOf(stage)) + 1, of: stages.length } : null,
          message: job.progressMessage ?? null,
          startedAt: ours ? (said.startedAt ?? null) : null,
          expectedMs: payload.expectedMs ?? null,
        };
      }
      if (said?.state === "failed" && said.id && !said.id.startsWith("remove-"))
        return {
          jobId: ctx.jobs.get(said.id) ? said.id : null,
          state: "failed",
          stage: null,
          stageLabel: null,
          step: null,
          message: said.message,
          startedAt: said.startedAt,
          expectedMs: null,
        };
      return null;
    },
    runJob,
  };
}
