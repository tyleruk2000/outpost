/**
 * HF propagation: predicting how well a shortwave signal gets from one place to
 * another, hour by hour and band by band, with no connection.
 *
 * Outpost does not model the ionosphere. It runs VOACAP, the program most HF planning
 * rests on, as a WebAssembly module in a worker thread (`voacap/`, `host.ts`), behind
 * an interface another engine could stand behind (`engine.ts`). This module adds what
 * surrounds a prediction: equipment profiles, the data the engine reads and how old it
 * is, keeping answers already worked out, and the routes.
 *
 * Nothing here makes an outbound request except fetching a newer solar cycle table,
 * when a person asks for it, through the download manager.
 */
import { type EngineStatus, HF_MAX_MHZ, HF_MIN_MHZ, type PredictionRequest, type SavedPrediction } from "@outpost/shared";
import { desc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppContext } from "../../core/context.ts";
import { badRequest, notFound } from "../../core/errors.ts";
import { newId } from "../../core/ids.ts";
import { toJobDto } from "../../core/jobs.ts";
import { propagationSaved } from "../../db/schema.ts";
import { createDatasetsService, type DatasetsService } from "./datasets.ts";
import { EngineUnavailable } from "./engine.ts";
import { createEngineHost } from "./host.ts";
import { createProfilesService, type ProfilesService } from "./profiles.ts";
import { createPropagationService, modeLine, type PropagationService } from "./service.ts";
import { readEngineManifest, voacapPaths } from "./voacap/files.ts";

declare module "../../core/context.ts" {
  interface Services {
    propagation: PropagationService & { profiles: ProfilesService; datasets: DatasetsService };
  }
}

// ── What a request may hold ─────────────────────────────────────────────────

const site = z.object({ name: z.string().max(60).default(""), lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180) });
const noise = z.enum(["city", "residential", "rural", "remote"]);
const modes = z.enum(["ssb", "cw", "ft8", "js8", "digital"]);
const power = z.number().min(0.1, "The engine works in tenths of a watt: give at least 0.1 W.").max(500_000);

const antenna = z
  .object({
    kind: z.enum(["isotropic", "horizontal-dipole", "inverted-v", "end-fed-half-wave", "vertical-monopole"]),
    heightM: z.number().min(0).max(200),
    ground: z.enum(["poor", "average", "good", "sea"]),
    broadsideDeg: z.number().min(0).max(360).nullable(),
    gainDb: z.number().min(-40).max(30),
    feedlineLossDb: z.number().min(0).max(40),
  })
  .refine((value) => value.kind === "isotropic" || value.kind === "vertical-monopole" || value.heightM >= 0.5, {
    message: "Give the height of a horizontal antenna above the ground: at least 0.5 m.",
    path: ["heightM"],
  });

const isDate = (value: string) => {
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
};

const prediction = z.object({
  tx: site,
  rx: site,
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Give the date as YYYY-MM-DD.")
    .refine(isDate, "That date does not exist.")
    .refine((value) => value >= "1950-01-01" && value <= "2100-12-31", "Give a date between 1950 and 2100."),
  powerWatts: power,
  txAntenna: antenna,
  rxAntenna: antenna,
  noise,
  frequencyMhz: z
    .number()
    .min(HF_MIN_MHZ, `The engine covers ${HF_MIN_MHZ} to ${HF_MAX_MHZ} MHz. Give a frequency in that range.`)
    .max(HF_MAX_MHZ, `The engine covers ${HF_MIN_MHZ} to ${HF_MAX_MHZ} MHz. Give a frequency in that range.`),
  mode: modes,
  requiredSnrDb: z.number().min(-60).max(99).optional(),
  referenceBandwidthHz: z.number().min(1).max(100_000).optional(),
  solar: z.discriminatedUnion("source", [
    z.object({ source: z.literal("table") }),
    z.object({ source: z.literal("manual"), ssn: z.number().min(0).max(300) }),
    z.object({ source: z.literal("fof2"), fof2Mhz: z.number().min(0.5).max(25), utcHour: z.number().int().min(1).max(24) }),
  ]),
  reply: z.object({ powerWatts: power, noise }).optional(),
});

/** The engine's card takes the requirement as a figure between -30 and 99.9 dB in 1 Hz. */
function checked(body: unknown): PredictionRequest {
  const request = prediction.parse(body) as PredictionRequest;
  const line = modeLine(request.mode, request.requiredSnrDb, request.referenceBandwidthHz);
  if (line.requiredSnrDbHz !== null && (line.requiredSnrDbHz < -30 || line.requiredSnrDbHz > 99.9)) {
    throw badRequest(`That requirement is ${line.requiredSnrDbHz} dB in a 1 Hz bandwidth, which is outside what the engine takes (-30 to 99.9). Check the signal-to-noise ratio and its bandwidth.`);
  }
  return request;
}

const range = { minMhz: z.number().min(0.1).max(1000), maxMhz: z.number().min(0.1).max(1000) };
const ordered = (value: { minMhz: number; maxMhz: number }) => value.minMhz <= value.maxMhz;
const radioProfile = z
  .object({ name: z.string().trim().min(1, "Give the radio a name.").max(80), model: z.string().max(120).default(""), powerWatts: power, ...range, modes: z.array(modes).max(5), receiver: z.string().max(2000).default(""), notes: z.string().max(4000).default("") })
  .refine(ordered, { message: "The lowest frequency is above the highest.", path: ["minMhz"] });
const antennaProfile = z
  .object({ name: z.string().trim().min(1, "Give the antenna a name.").max(80), ...range, notes: z.string().max(4000).default("") })
  .and(antenna)
  .refine(ordered, { message: "The lowest frequency is above the highest.", path: ["minMhz"] });

type IdParams = { Params: { id: string } };

export async function registerPropagation(app: FastifyInstance, ctx: AppContext): Promise<void> {
  const paths = voacapPaths(ctx.config.dataDir);
  const host = createEngineHost(paths);
  ctx.onClose.push(() => host.close());

  const profiles = createProfilesService(ctx);
  const datasets = createDatasetsService(ctx, paths);
  const service = createPropagationService(ctx, host);
  ctx.services.propagation = { ...service, profiles, datasets };
  ctx.services.downloads.registerInstaller("dataset", datasets.installer);

  // A day on one path is a twentieth of a second and is answered directly. Anything
  // that is many paths (a coverage grid, a plan across several places) is a job: it
  // shows on the Downloads screen's list of work, can be cancelled, and leaves its
  // answer under a key to be fetched.
  ctx.jobs.register<{ kind: "point" | "compare"; request: Record<string, unknown> }>("propagation.predict", {
    queue: "propagation",
    async run({ payload, signal, progress }) {
      progress({ current: 0, total: 1, message: "Working out the prediction" });
      if (payload.kind === "compare") {
        const body = payload.request as { base: unknown; what: never };
        await service.compare({ base: checked(body.base), what: body.what }, signal);
        progress({ current: 1, total: 1 });
        return { kind: "compare" };
      }
      const result = await service.predict(checked(payload.request), signal);
      progress({ current: 1, total: 1 });
      return { kind: "point", key: result.key };
    },
  });

  // ── Engines and data ──────────────────────────────────────────────────────

  app.get("/api/radio/propagation/engines", async () => {
    let status: EngineStatus;
    try {
      const { description } = await host.describe();
      status = { ...description, ready: true, problem: null, selected: true };
    } catch (error) {
      // Say what is known about the engine even when it cannot run.
      let known: { name: string; model: string; implementation: string; licence: string; sha256: string } = { name: "VOACAP", model: "", implementation: "", licence: "", sha256: "" };
      try {
        const manifest = readEngineManifest(paths);
        known = { name: manifest.name, model: manifest.model, implementation: `${manifest.implementation.name} ${manifest.implementation.version}`, licence: manifest.implementation.licence, sha256: manifest.wasm.sha256 };
      } catch {
        // Not even its description is there.
      }
      status = {
        id: "voacap",
        ...known,
        gives: { reliability: true, luf: true, ionosphere: true, measuredFoF2: false, coverage: false },
        minMhz: HF_MIN_MHZ,
        maxMhz: HF_MAX_MHZ,
        ready: false,
        problem: error instanceof EngineUnavailable ? error.message : `The propagation engine could not be started: ${error instanceof Error ? error.message : String(error)}`,
        selected: true,
      };
    }
    return { engines: [status] };
  });

  app.get("/api/radio/propagation/datasets", async () => datasets.list());

  app.post("/api/radio/propagation/datasets/solar-cycle/download", async (request) => {
    const body = z.object({ locationId: z.string().min(1).max(64).optional() }).parse(request.body ?? {});
    return { download: ctx.services.downloads.toDto(await datasets.downloadSolar(body.locationId)) };
  });

  // ── Predictions ───────────────────────────────────────────────────────────

  app.post("/api/radio/propagation/predict", async (request) => {
    const { background } = z.object({ background: z.enum(["true", "false"]).default("false") }).parse(request.query);
    const body = checked(request.body);
    if (background === "true") {
      return { job: toJobDto(ctx.jobs.enqueue("propagation.predict", { kind: "point", request: body as unknown as Record<string, unknown> }, { title: `HF propagation: ${body.tx.name || "transmitter"} to ${body.rx.name || "receiver"}` })) };
    }
    return service.predict(body);
  });

  const compareBody = z.object({ what: z.enum(["seasons", "sunspots", "power", "antennas", "noise"]) });
  app.post("/api/radio/propagation/compare", async (request) => {
    const { what } = compareBody.parse(request.body);
    return service.compare({ base: checked((request.body as { base?: unknown }).base), what });
  });

  /** The page VOACAP itself would print for this question: what the engine is checked against. */
  app.post("/api/radio/propagation/listing", async (request) => ({ listing: await service.listing(checked(request.body)) }));

  app.get<{ Params: { key: string } }>("/api/radio/propagation/results/:key", async (request) => {
    const { key } = z.object({ key: z.string().regex(/^[0-9a-f]{40}$/) }).parse(request.params);
    const result = service.result(key);
    if (!result) throw notFound("That prediction (it may have been cleared to make room; ask for it again)");
    return result;
  });

  // ── Saved predictions ─────────────────────────────────────────────────────

  const saved = (row: typeof propagationSaved.$inferSelect): SavedPrediction => ({
    id: row.id,
    name: row.name,
    request: row.request as unknown as PredictionRequest,
    key: row.resultKey ?? "",
    noteId: row.noteId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });

  app.get("/api/radio/propagation/saved", async () => ({
    saved: ctx.db.select().from(propagationSaved).where(eq(propagationSaved.kind, "point")).orderBy(desc(propagationSaved.updatedAt)).all().map(saved),
  }));

  app.post("/api/radio/propagation/saved", async (request) => {
    const body = z.object({ name: z.string().trim().min(1, "Give the prediction a name.").max(120), key: z.string().max(64).optional() }).parse(request.body);
    const kept = checked((request.body as { request?: unknown }).request);
    const now = Date.now();
    const id = newId();
    ctx.db.insert(propagationSaved).values({ id, name: body.name, kind: "point", request: kept as unknown as Record<string, unknown>, resultKey: body.key ?? null, createdAt: now, updatedAt: now }).run();
    ctx.events.publish({ type: "propagation.changed" });
    return { saved: saved(ctx.db.select().from(propagationSaved).where(eq(propagationSaved.id, id)).get()!) };
  });

  app.delete<IdParams>("/api/radio/propagation/saved/:id", async (request) => {
    const row = ctx.db.select().from(propagationSaved).where(eq(propagationSaved.id, request.params.id)).get();
    if (!row) throw notFound("The saved prediction");
    ctx.db.delete(propagationSaved).where(eq(propagationSaved.id, row.id)).run();
    ctx.events.publish({ type: "propagation.changed" });
    return { ok: true };
  });

  // ── Equipment ─────────────────────────────────────────────────────────────

  app.get("/api/radio/profiles", async () => ({ radios: profiles.radios(), antennas: profiles.antennas() }));
  app.post("/api/radio/profiles/radios", async (request) => ({ radio: profiles.createRadio(radioProfile.parse(request.body)) }));
  app.patch<IdParams>("/api/radio/profiles/radios/:id", async (request) => ({ radio: profiles.updateRadio(request.params.id, radioProfile.parse(request.body)) }));
  app.delete<IdParams>("/api/radio/profiles/radios/:id", async (request) => {
    profiles.removeRadio(request.params.id);
    return { ok: true };
  });
  app.post("/api/radio/profiles/antennas", async (request) => ({ antenna: profiles.createAntenna(antennaProfile.parse(request.body)) }));
  app.patch<IdParams>("/api/radio/profiles/antennas/:id", async (request) => ({ antenna: profiles.updateAntenna(request.params.id, antennaProfile.parse(request.body)) }));
  app.delete<IdParams>("/api/radio/profiles/antennas/:id", async (request) => {
    profiles.removeAntenna(request.params.id);
    return { ok: true };
  });
}
