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
 * Nothing here makes an outbound request except, when a person asks, through the
 * download manager: a newer solar cycle table, and VOACAP's coefficients, which Outpost
 * does not ship (`engine-data.ts`).
 */
import {
  type EngineStatus,
  HF_BANDS,
  HF_MAX_MHZ,
  HF_MIN_MHZ,
  notModelledOn,
  type PredictionRequest,
  type RadioKept,
  type SavedPrediction,
} from "@outpost/shared";
import { desc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppContext } from "../../core/context.ts";
import { badRequest, notFound } from "../../core/errors.ts";
import { newId } from "../../core/ids.ts";
import { toJobDto } from "../../core/jobs.ts";
import { propagationSaved } from "../../db/schema.ts";
import { type CoverageService, registerCoverage } from "./coverage.ts";
import { createDatasetsService, type DatasetsService } from "./datasets.ts";
import { EngineUnavailable } from "./engine.ts";
import { type EngineData, registerEngineData } from "./engine-data.ts";
import { createEngineHost } from "./host.ts";
import { type ObservationsService, registerObservations } from "./observations.ts";
import { registerSecondModel } from "./p533/index.ts";
import { type PlansService, registerPlans } from "./plans.ts";
import { createProfilesService, type ProfilesService } from "./profiles.ts";
import { createPropagationService, type PropagationService } from "./service.ts";
import { antenna, checked, modes, power } from "./shapes.ts";
import { coefficientsManifest } from "./voacap/coefficients.ts";
import { readEngineManifest, voacapPaths } from "./voacap/files.ts";

declare module "../../core/context.ts" {
  interface Services {
    propagation: PropagationService & {
      profiles: ProfilesService;
      datasets: DatasetsService;
      engineData: EngineData;
      coverage: CoverageService;
      plans: PlansService;
      observations: ObservationsService;
      /** Everything here that is the person's own: counted for "what is stored", and erased with everything else. */
      kept: { count(): RadioKept; eraseAll(): RadioKept };
    };
  }
}

const range = { minMhz: z.number().min(0.1).max(1000), maxMhz: z.number().min(0.1).max(1000) };
const ordered = (value: { minMhz: number; maxMhz: number }) => value.minMhz <= value.maxMhz;
const radioProfile = z
  .object({
    name: z.string().trim().min(1, "Give the radio a name.").max(80),
    model: z.string().max(120).default(""),
    powerWatts: power,
    ...range,
    modes: z.array(modes).max(5),
    receiver: z.string().max(2000).default(""),
    notes: z.string().max(4000).default(""),
  })
  .refine(ordered, { message: "The lowest frequency is above the highest.", path: ["minMhz"] });
const antennaProfile = z
  .object({ name: z.string().trim().min(1, "Give the antenna a name.").max(80), ...range, notes: z.string().max(4000).default("") })
  .and(antenna)
  .refine(ordered, { message: "The lowest frequency is above the highest.", path: ["minMhz"] });

type IdParams = { Params: { id: string } };

export async function registerPropagation(app: FastifyInstance, ctx: AppContext): Promise<void> {
  const coefficients = coefficientsManifest(ctx.config.voacapDataManifest);
  const paths = voacapPaths(ctx.config.dataDir, { coefficients });
  // The coefficients are looked at before a worker is started: without them it is not.
  const engineData = registerEngineData(
    app,
    ctx,
    () => host,
    () => coefficients,
  );
  const host = createEngineHost(paths, { ready: () => engineData.ready() });
  ctx.onClose.push(() => host.close());

  const profiles = createProfilesService(ctx);
  const datasets = createDatasetsService(ctx, engineData);
  const service = createPropagationService(ctx, host);
  const coverage = registerCoverage(app, ctx, service);
  const plans = registerPlans(app, ctx, service);
  const observations = await registerObservations(app, ctx, service);
  const kept = {
    count(): RadioKept {
      const n = (table: string) => (ctx.sqlite.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n;
      return {
        plans: plans.count(),
        observations: observations.count(),
        equipment: n("radio_profiles") + n("antenna_profiles"),
        saved: n("propagation_saved"),
      };
    },
    /** Plans, the log, profiles, saved predictions and maps, and every answer worked out (an answer holds the places it was asked about). */
    eraseAll(): RadioKept {
      const had = kept.count();
      plans.eraseAll();
      observations.eraseAll();
      ctx.sqlite.transaction(() => {
        for (const table of ["propagation_saved", "propagation_results", "radio_profiles", "antenna_profiles"])
          ctx.sqlite.prepare(`DELETE FROM ${table}`).run();
      })();
      ctx.events.publish({ type: "propagation.changed" });
      return had;
    },
  };
  ctx.services.propagation = { ...service, profiles, datasets, engineData, coverage, plans, observations, kept };
  const secondModel = registerSecondModel(app, ctx, service);
  ctx.services.downloads.registerInstaller("dataset", (job) =>
    engineData.owns(job.download)
      ? engineData.installer(job)
      : secondModel.owns(job.download)
        ? secondModel.installer(job)
        : datasets.installer(job),
  );

  // A day on one path is a twentieth of a second and is answered directly. Anything
  // that is thousands of paths (a coverage grid, in coverage.ts) is a job: it shows on
  // the Downloads screen's list of work, can be cancelled, and leaves its answer under a
  // key to be fetched. A plan (plans.ts) is at most 56 paths and is answered directly.
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
    const data = engineData.status();
    try {
      const { description } = await host.describe();
      status = { ...description, ready: true, problem: null, selected: true, data };
    } catch (error) {
      // Say what is known about the engine even when it cannot run.
      let known: { name: string; model: string; implementation: string; licence: string; sha256: string } = {
        name: "VOACAP",
        model: "",
        implementation: "",
        licence: "",
        sha256: "",
      };
      try {
        const manifest = readEngineManifest(paths);
        known = {
          name: manifest.name,
          model: manifest.model,
          implementation: `${manifest.implementation.name} ${manifest.implementation.version}`,
          licence: manifest.implementation.licence,
          sha256: manifest.wasm.sha256,
        };
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
        problem:
          error instanceof EngineUnavailable
            ? error.message
            : `The propagation engine could not be started: ${error instanceof Error ? error.message : String(error)}`,
        selected: true,
        data,
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
      return {
        job: toJobDto(
          ctx.jobs.enqueue(
            "propagation.predict",
            { kind: "point", request: body as unknown as Record<string, unknown> },
            { title: `HF propagation: ${body.tx.name || "transmitter"} to ${body.rx.name || "receiver"}` },
          ),
        ),
      };
    }
    return service.predict(body);
  });

  const compareBody = z.object({ what: z.enum(["seasons", "sunspots", "power", "antennas", "noise"]) });
  app.post("/api/radio/propagation/compare", async (request) => {
    const { what } = compareBody.parse(request.body);
    return service.compare({ base: checked((request.body as { base?: unknown }).base), what });
  });

  /** The page VOACAP itself would print for this question: what the engine is checked against. */
  app.post("/api/radio/propagation/listing", async (request) => {
    const body = checked(request.body);
    // A frequency on which an antenna is not modelled is left off the page; with none left there is no page.
    if (
      [body.frequencyMhz, ...HF_BANDS.map((band) => band.mhz)].every((mhz) => notModelledOn(body.txAntenna, body.rxAntenna, mhz) !== null)
    )
      throw badRequest(
        "There is no page to print: on the frequency asked about and on every band, one of the antennas is a wire the engine's model does not describe.",
        { reason: "antenna-not-modelled" },
      );
    return { listing: await service.listing(body) };
  });

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
    saved: ctx.db
      .select()
      .from(propagationSaved)
      .where(eq(propagationSaved.kind, "point"))
      .orderBy(desc(propagationSaved.updatedAt))
      .all()
      .map(saved),
  }));

  app.post("/api/radio/propagation/saved", async (request) => {
    const body = z
      .object({ name: z.string().trim().min(1, "Give the prediction a name.").max(120), key: z.string().max(64).optional() })
      .parse(request.body);
    const kept = checked((request.body as { request?: unknown }).request);
    const now = Date.now();
    const id = newId();
    ctx.db
      .insert(propagationSaved)
      .values({
        id,
        name: body.name,
        kind: "point",
        request: kept as unknown as Record<string, unknown>,
        resultKey: body.key ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .run();
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
  app.patch<IdParams>("/api/radio/profiles/radios/:id", async (request) => ({
    radio: profiles.updateRadio(request.params.id, radioProfile.parse(request.body)),
  }));
  app.delete<IdParams>("/api/radio/profiles/radios/:id", async (request) => {
    profiles.removeRadio(request.params.id);
    return { ok: true };
  });
  app.post("/api/radio/profiles/antennas", async (request) => ({ antenna: profiles.createAntenna(antennaProfile.parse(request.body)) }));
  app.patch<IdParams>("/api/radio/profiles/antennas/:id", async (request) => ({
    antenna: profiles.updateAntenna(request.params.id, antennaProfile.parse(request.body)),
  }));
  app.delete<IdParams>("/api/radio/profiles/antennas/:id", async (request) => {
    profiles.removeAntenna(request.params.id);
    return { ok: true };
  });
}
