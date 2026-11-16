/**
 * The second model, the ITU's P.533: whether it can be offered, fetching its maps, and
 * the side-by-side comparison with VOACAP.
 *
 * It is offered only when the engine has been built on this computer and the maps have
 * been downloaded, and both match their recorded checksums. Until then the status says,
 * in one line, what is missing and how large it is, and nothing is fetched until a
 * person presses for it.
 *
 * The comparison runs both models for the same path, month, sunspot number,
 * frequencies, power, noise and requirement, with isotropic antennas of 0 dBi at both
 * ends: P.533 has no antenna models and Outpost computes no patterns. The VOACAP side
 * is an ordinary prediction with those antennas, so it is kept and found again like any
 * other; the person's own prediction is not touched.
 */
import fs from "node:fs";
import { ANTENNA_PRESETS, noiseSetting, type PredictionRequest, type SecondModelComparison, type SecondModelStatus } from "@outpost/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppContext } from "../../../core/context.ts";
import { AppError, badRequest } from "../../../core/errors.ts";
import type { DownloadRow, Installer } from "../../downloads/types.ts";
import { EngineUnavailable } from "../engine.ts";
import { EngineRefused } from "../host.ts";
import type { PropagationService } from "../service.ts";
import { checked } from "../shapes.ts";
import { buildComparison, comparedFrequencies, comparisonKeyBody } from "./compare.ts";
import type { P533EngineOptions } from "./engine.ts";
import { BUILD_HINT, findEngine, mapsManifest, P533_MANIFEST, sha256 } from "./files.ts";
import { createP533Host, type P533Host } from "./host.ts";
import { NOISE_NAMES } from "./input.ts";
import {
  createMapsFetcher,
  createMapsInstaller,
  installedMaps,
  isMapsDownload,
  MAPS_FETCHER,
  P533_MAPS,
  startMapsDownload,
} from "./maps.ts";

const ISOTROPIC = ANTENNA_PRESETS.find((preset) => preset.id === "isotropic")!.spec;
const megabytes = (bytes: number) => `${Math.round(bytes / 1_000_000)} MB`;

export interface SecondModel {
  status(): SecondModelStatus;
  compare(request: PredictionRequest, signal?: AbortSignal): Promise<SecondModelComparison>;
  /** For the "dataset" downloads installer: true when this download is the P.533 maps. */
  owns(download: DownloadRow): boolean;
  installer: Installer;
  host: P533Host;
}

function problem(error: unknown): never {
  if (error instanceof EngineUnavailable) throw new AppError("unsupported", error.message, { reason: "second-model-unavailable" });
  if (error instanceof EngineRefused) throw badRequest(`P.533 could not work this out: ${error.message}`);
  throw error;
}

export function registerSecondModel(app: FastifyInstance, ctx: AppContext, service: PropagationService): SecondModel {
  const maps = () => mapsManifest(ctx.config.p533MapsManifest);
  const host = createP533Host();
  ctx.onClose.push(() => host.close());
  ctx.services.downloads.registerFetcher(MAPS_FETCHER, createMapsFetcher(ctx, maps));
  const installer = createMapsInstaller(ctx, maps);
  ctx.services.collections.onRemoved((row) => {
    if ((row.meta as Record<string, unknown> | null)?.dataset === P533_MAPS) ctx.events.publish({ type: "propagation.changed" });
  });

  /** The engine file, and whether it is the one recorded: read once per distinct file and size. */
  const engineChecks = new Map<string, string | null>();
  function engineState(): { file: string | null; problem: string | null } {
    const found = findEngine(ctx.config.dataDir);
    if (!found) return { file: null, problem: `The P.533 engine is not built on this computer. ${BUILD_HINT}` };
    let stat: fs.Stats;
    try {
      stat = fs.statSync(found.file);
    } catch {
      return { file: found.file, problem: `The P.533 engine at ${found.file} cannot be read.` };
    }
    const at = `${found.file} ${stat.size} ${stat.mtimeMs}`;
    if (!engineChecks.has(at)) {
      const ok = sha256(new Uint8Array(fs.readFileSync(found.file))) === P533_MANIFEST.wasm.sha256;
      engineChecks.set(
        at,
        ok
          ? null
          : `The P.533 engine at ${found.file} is not the file Outpost expects (its checksum differs). Build it again with node scripts/build-p533-engine.mjs.`,
      );
    }
    return { file: found.file, problem: engineChecks.get(at) ?? null };
  }

  function where(): P533EngineOptions | null {
    const installed = installedMaps(ctx);
    return installed ? { dataDir: ctx.config.dataDir, mapsFile: installed.file, maps: maps() } : null;
  }

  function status(): SecondModelStatus {
    const manifest = maps();
    const engine = engineState();
    const installed = installedMaps(ctx);
    const downloading = ctx.services.downloads
      .list()
      .some((row) => isMapsDownload(row) && ["queued", "downloading", "verifying", "installing", "paused"].includes(row.state));
    const missing: string[] = [];
    if (engine.problem)
      missing.push(
        engine.file
          ? engine.problem
          : "build the P.533 engine on this computer (node scripts/build-p533-engine.mjs, which needs Docker and the internet once)",
      );
    if (!installed) missing.push(`download the ITU's P.533 maps (${megabytes(manifest.bytes)})`);
    const line =
      missing.length === 0
        ? null
        : engine.file && engine.problem
          ? engine.problem
          : `The second model (ITU P.533) is not set up here. To use it, ${missing.join(" and ")}.`;
    return {
      offered: missing.length === 0,
      line,
      engine: {
        built: engine.file !== null && engine.problem === null,
        file: engine.file,
        problem: engine.problem,
        sha256: P533_MANIFEST.wasm.sha256,
        repository: P533_MANIFEST.source.repository,
        commit: P533_MANIFEST.source.commit,
        howToBuild: BUILD_HINT,
      },
      maps: {
        installed: installed !== null,
        bytes: manifest.bytes,
        files: manifest.files.length,
        collectionId: installed?.collection.id ?? null,
        where: installed?.file ?? null,
        downloading,
        problem: null,
        source: `${P533_MANIFEST.source.repository}, P372/Data at ${P533_MANIFEST.source.commit.slice(0, 12)}`,
      },
      terms:
        "The ITU's own terms, not an open-source licence: free from copyright assertions for implementers of the Recommendation, with headers that reserve all rights. Nothing of the ITU's ships with Outpost; see engines/p533/NOTICE.txt.",
    };
  }

  async function compare(asked: PredictionRequest, signal?: AbortSignal): Promise<SecondModelComparison> {
    const state = status();
    if (!state.offered)
      throw new AppError("unsupported", state.line ?? "The second model is not available.", { reason: "second-model-unavailable" });
    const place = where()!;
    // Like for like: isotropic at both ends, one way only.
    const request: PredictionRequest = { ...asked, txAntenna: ISOTROPIC, rxAntenna: ISOTROPIC, reply: undefined };
    const voacap = await service.predict(request, signal);
    try {
      const described = await host.describe(place);
      const required = voacap.mode.requiredSnrDbHz;
      const key = service.internals.keyOf("compare", comparisonKeyBody(voacap.key, described.description, described.datasets));
      const found = service.internals.kept<SecondModelComparison>(key);
      if (found) return { ...found, basis: voacap.basis, cached: true };
      const circuit = await host.circuit(
        place,
        {
          tx: voacap.request.tx,
          rx: voacap.request.rx,
          year: Number(voacap.request.date.slice(0, 4)),
          month: Number(voacap.request.date.slice(5, 7)),
          ssn: voacap.basis.ssn,
          powerWatts: voacap.request.powerWatts,
          frequenciesMhz: comparedFrequencies(voacap.request.frequencyMhz).map((item) => item.mhz),
          requiredSnrDbHz: required ?? 0,
          noiseDbwAt3Mhz: noiseSetting(voacap.request.noise).dbwAt3Mhz,
          txAntenna: ISOTROPIC,
          rxAntenna: ISOTROPIC,
        },
        signal,
      );
      const result = buildComparison({
        key,
        voacap,
        p533: circuit,
        p533Engine: described.description,
        p533Datasets: described.datasets,
        noise: { label: noiseSetting(voacap.request.noise).label, p533: NOISE_NAMES[voacap.request.noise] },
      });
      const comparison: SecondModelComparison = { ...result, cached: false };
      service.internals.keep(key, "compare", described.description, { second: "p533", request: voacap.request }, comparison);
      return comparison;
    } catch (error) {
      problem(error);
    }
  }

  app.get("/api/radio/propagation/second-model", async () => status());

  app.post("/api/radio/propagation/second-model/maps/download", async (request) => {
    const body = z.object({ locationId: z.string().min(1).max(64).optional() }).parse(request.body ?? {});
    const download = await startMapsDownload(ctx, maps(), body.locationId);
    ctx.events.publish({ type: "propagation.changed" });
    return { download: ctx.services.downloads.toDto(download) };
  });

  app.post("/api/radio/propagation/second-model/compare", async (request) => compare(checked(request.body)));

  return { status, compare, owns: isMapsDownload, installer, host };
}
