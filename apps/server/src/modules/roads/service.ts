/**
 * Road networks and road routes: installing a country's or region's main roads from a
 * Geofabrik extract (through the download manager, on a press) or from a file already in
 * storage; keeping them as files in the data directory; joining them into one graph
 * when a route is asked for; and saved routes.
 *
 * Nothing here reaches out except the install of a Geofabrik region, which a person
 * presses for: planning a route reads only what is installed.
 */
import fs from "node:fs";
import type {
  RoadBuildingPhase,
  RoadCoverageResponse,
  RoadCrossingDto,
  RoadNetworkBuilding,
  RoadNetworkDto,
  RoadNetworksResponse,
  RoadRouteRequest,
  RoadRouteResult,
  SavedRoadRouteDto,
  SavedRoadRouteSummaryDto,
  SavedRouteResult,
} from "@outpost/shared";
import { desc, eq } from "drizzle-orm";
import type { AppContext } from "../../core/context.ts";
import { badRequest, notFound } from "../../core/errors.ts";
import { resolveInside } from "../../core/fs-safe.ts";
import { createHttpClient } from "../../core/http.ts";
import { newId } from "../../core/ids.ts";
import { PermanentJobError } from "../../core/jobs.ts";
import { markers, roadNetworks, roadRoutes } from "../../db/schema.ts";
import type { DownloadRow, Installer } from "../downloads/types.ts";
import { createRegionIndex } from "../layers/adapters/geofabrik-regions.ts";
import { buildNetwork } from "./build.ts";
import { reachesNorthernIreland } from "./countries.ts";
import { coverageOf } from "./coverage.ts";
import { buildGraph, type Graph } from "./graph.ts";
import { readNetworkFile, writeNetworkFile } from "./network-file.ts";
import { ownName, type PlanPoint, planRoute, roadCredit } from "./plan.ts";
import { releaseWorkspace } from "./route.ts";

export const BUILD_JOB = "roads.build";
/** The graph is let go after this long unused, so a Pi at rest holds no road network in memory. */
const IDLE_RELEASE_MS = 30 * 60_000;

type NetworkRow = typeof roadNetworks.$inferSelect;
type RouteRow = typeof roadRoutes.$inferSelect;

/** What a road-network download carries in its `meta`. */
export interface RoadsDownloadMeta {
  regionId: string;
  name: string;
  country: string | null;
  keepExtract: boolean;
  sourceUrl: string;
}

export const isRoadsDownload = (download: DownloadRow) => typeof (download.meta as { roads?: unknown }).roads === "object";

export interface BuildFromFileInput {
  locationId: string;
  relPath: string;
  name: string;
  country: string | null;
  /** Set when this file replaces the network with this id (an update). */
  replaces?: string | null;
}

/** A country file to build a region's network from (modules/maps/country-files.ts). */
export interface CountryFileBuild {
  filePath: string;
  regionId: string;
  name: string;
  country: string | null;
  sourceUrl: string;
  bytes: number;
  /** Where the file is kept afterwards, or null when it is deleted once read. */
  kept: { locationId: string; relPath: string; collectionId: string | null } | null;
  signal: AbortSignal;
  progress: (current: number, total: number | null, message: string, unit?: string | null) => void;
}

export interface RoadsService {
  list(): RoadNetworksResponse;
  /** Which countries a route needs, and where their roads stand: local, quick, no graph read. */
  coverage(points: Array<{ lat: number; lon: number }>): RoadCoverageResponse;
  /** Reads the region's country file: a kept one if there is one, otherwise downloads it (on a press). */
  installRegion(input: {
    regionId: string;
    keepExtract?: boolean;
    locationId?: string;
  }): Promise<{ downloadId: string | null; jobId: string | null }>;
  /** Builds (or rebuilds) a region's network from its country file, replacing the region's network once built. */
  buildFromCountryFile(input: CountryFileBuild): Promise<{ id: string; dataDate: string | null }>;
  installFile(input: BuildFromFileInput): Promise<{ jobId: string }>;
  update(id: string): Promise<{ downloadId: string | null; jobId: string | null }>;
  remove(id: string): Promise<void>;
  crossings(): Promise<RoadCrossingDto[]>;
  plan(request: RoadRouteRequest): Promise<RoadRouteResult>;
  savedRoutes(): SavedRoadRouteSummaryDto[];
  savedRoute(id: string): SavedRoadRouteDto;
  saveRoute(input: { name: string; route: SavedRouteResult }): SavedRoadRouteDto;
  renameRoute(id: string, name: string): SavedRoadRouteDto;
  deleteRoute(id: string): void;
  /** Every saved route and network, for "erase everything". Returns how many saved routes there were. */
  eraseAll(): Promise<number>;
  installer: Installer;
  runBuildJob(
    input: BuildFromFileInput,
    signal: AbortSignal,
    progress: (current: number, total: number | null, message: string, unit?: string | null) => void,
  ): Promise<Record<string, unknown>>;
  /** For tests and measurements: the graph as loaded now. */
  loadGraph(): Promise<Graph>;
  /** Works out, from each network's own file, whether its roads reach Northern Ireland, for those built before that was recorded. Returns how many. */
  recordNorthernIreland(): Promise<number>;
  close(): void;
}

export { ownName };

/**
 * Whether a network's roads reach Northern Ireland, by its own junctions, never by its
 * region's name (Geofabrik's United Kingdom holds Northern Ireland, its Great Britain does
 * not): as recorded at its build, or worked out once from its file for one built before
 * (`recordNorthernIreland`). Until then, whether its box reaches there.
 */
export function networkReachesNorthernIreland(row: Pick<NetworkRow, "bbox" | "stats">): boolean {
  const found = row.stats?.northernIreland;
  if (typeof found === "boolean") return found;
  const box = row.bbox;
  return Boolean(box && box[0] < -5.43 && box[2] > -8.18 && box[1] < 55.25 && box[3] > 54.03);
}

/** "Great Britain" for a United Kingdom network whose roads stop short of Northern Ireland; else its own name. */
export function networkName(row: Pick<NetworkRow, "name" | "country" | "bbox" | "stats">): string {
  return row.country === "GB" && row.name === "United Kingdom" && !networkReachesNorthernIreland(row) ? "Great Britain" : row.name;
}

export function toNetworkDto(row: NetworkRow, available: boolean): RoadNetworkDto {
  return {
    id: row.id,
    regionId: row.regionId,
    name: networkName(row),
    country: row.country,
    dataDate: row.dataDate,
    builtAt: row.builtAt,
    sizeBytes: row.sizeBytes,
    nodes: row.nodes,
    edges: row.edges,
    crossings: row.crossings,
    extract: row.extract,
    source: row.source,
    bbox: row.bbox ?? null,
    northernIreland: networkReachesNorthernIreland(row),
    available,
  };
}

function summaryOf(row: RouteRow): SavedRoadRouteSummaryDto {
  const route = row.route as { mode?: unknown; plannedAt?: unknown };
  const mode = route.mode === "drive-door" || route.mode === "walk" || route.mode === "cycle" ? route.mode : "drive";
  return {
    id: row.id,
    name: row.name,
    mode,
    plannedAt: typeof route.plannedAt === "number" ? route.plannedAt : row.createdAt,
    fromTo: row.fromTo,
    distanceM: row.distanceM,
    durationS: row.durationS,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function createRoadsService(ctx: AppContext): RoadsService {
  const roadsDir = () => resolveInside(ctx.config.dataDir, "roads");
  const rows = () => ctx.db.select().from(roadNetworks).orderBy(roadNetworks.name).all();
  const changed = () => ctx.events.publish({ type: "roads.changed" });

  // ── The graph ──────────────────────────────────────────────────────────────
  let graph: Promise<Graph> | null = null;
  /** The networks the graph was built from: rows changed behind the service (erasing, a restore) build it again. */
  let graphOf = "";
  let idle: NodeJS.Timeout | null = null;
  const forget = () => {
    graph = null;
    releaseWorkspace();
  };
  const touch = () => {
    if (idle) clearTimeout(idle);
    idle = setTimeout(forget, IDLE_RELEASE_MS);
    idle.unref();
  };
  async function loadGraph(): Promise<Graph> {
    touch();
    const signature = rows()
      .map((row) => `${row.id}:${row.builtAt}`)
      .join(",");
    if (signature !== graphOf) forget();
    graphOf = signature;
    if (!graph) {
      graph = (async () => {
        const sources = [];
        for (const row of rows()) {
          const file = resolveInside(ctx.config.dataDir, row.relPath);
          try {
            sources.push({
              network: { id: row.id, name: networkName(row), country: row.country, dataDate: row.dataDate },
              data: await readNetworkFile(file),
            });
          } catch (error) {
            ctx.log.warn({ err: error, network: row.id }, "A road network could not be read");
          }
        }
        return buildGraph(sources);
      })();
      graph.catch(() => {
        graph = null;
      });
    }
    return graph;
  }

  // ── Building ───────────────────────────────────────────────────────────────
  /** One build at a time: each holds a country's roads in memory while it reads. */
  let building: Promise<unknown> = Promise.resolve();
  const oneAtATime = <T>(work: () => Promise<T>): Promise<T> => {
    const next = building.then(work, work);
    building = next.catch(() => undefined);
    return next;
  };

  async function build(input: {
    filePath: string;
    regionId: string | null;
    name: string;
    country: string | null;
    source: string;
    extract: NetworkRow["extract"];
    replaces: string[];
    signal: AbortSignal;
    progress: (current: number, total: number | null, message: string, unit?: string | null) => void;
  }): Promise<NetworkRow> {
    return oneAtATime(async () => {
      const data = await buildNetwork(input.filePath, {
        signal: input.signal,
        progress: (message, done, total, unit) => input.progress(done, total, message, unit),
      });
      if (data.nodeId.length === 0) throw new PermanentJobError("The file holds no main roads Outpost could read: no network was made.");
      input.progress(1, 1, "Saving the roads for routes", null);
      const id = newId();
      const relPath = `roads/${id}.roads`;
      await fs.promises.mkdir(roadsDir(), { recursive: true });
      const file = resolveInside(ctx.config.dataDir, relPath);
      const sizeBytes = await writeNetworkFile(file, data, { country: input.country, name: input.name });
      let west = 180;
      let south = 90;
      let east = -180;
      let north = -90;
      for (let i = 0; i < data.nodeLat.length; i += 1) {
        const lat = data.nodeLat[i]! * 1e-7;
        const lon = data.nodeLon[i]! * 1e-7;
        if (lat < south) south = lat;
        if (lat > north) north = lat;
        if (lon < west) west = lon;
        if (lon > east) east = lon;
      }
      const now = Date.now();
      const row: NetworkRow = {
        id,
        regionId: input.regionId,
        name: input.name,
        country: input.country,
        dataDate: data.header.timestamp?.slice(0, 10) ?? null,
        relPath,
        sizeBytes,
        nodes: data.nodeId.length,
        edges: data.edgeFrom.length,
        crossings: data.crossings.length,
        source: input.source,
        bbox: [west, south, east, north].map((v) => Math.round(v * 1e5) / 1e5) as [number, number, number, number],
        extract: input.extract,
        stats: { ...data.stats, northernIreland: reachesNorthernIreland(data.nodeLat, data.nodeLon) },
        builtAt: now,
        createdAt: now,
        updatedAt: now,
      };
      const old = rows().filter((r) => input.replaces.includes(r.id));
      ctx.sqlite.transaction(() => {
        ctx.db.insert(roadNetworks).values(row).run();
        for (const r of old) ctx.db.delete(roadNetworks).where(eq(roadNetworks.id, r.id)).run();
      })();
      for (const r of old) await fs.promises.rm(resolveInside(ctx.config.dataDir, r.relPath), { force: true });
      forget();
      changed();
      return row;
    });
  }

  const installer: Installer = async ({ download, filePath, sizeBytes, signal, progress }) => {
    const meta = (download.meta as { roads?: RoadsDownloadMeta }).roads;
    if (!meta) throw new PermanentJobError("Outpost does not know which routes this download is for.");
    const replaces = rows()
      .filter((r) => r.regionId === meta.regionId)
      .map((r) => r.id);
    let fileBytes = sizeBytes;
    const row = await build({
      filePath,
      regionId: meta.regionId,
      name: meta.name,
      country: meta.country,
      source: meta.sourceUrl,
      extract: meta.keepExtract
        ? { kept: true, locationId: download.locationId, relPath: download.relPath, bytes: sizeBytes }
        : { kept: false, locationId: null, relPath: null, bytes: sizeBytes },
      replaces,
      signal,
      // A download counts bytes: while the junctions are sorted (counted in ways) the file has been read to its end.
      progress: (current, total, message, unit) => {
        if (unit === "ways") progress(fileBytes, fileBytes, message);
        else {
          if (unit === "bytes" && total) fileBytes = total;
          progress(current, total, message);
        }
      },
    });
    // The extract was fetched for this network alone: unless asked to keep it, it goes once read.
    if (!meta.keepExtract) await fs.promises.rm(filePath, { force: true });
    return { meta: { roadNetworkId: row.id } };
  };

  async function installRegion(input: { regionId: string; keepExtract?: boolean; locationId?: string }) {
    // One country file serves the roads and the places: a kept one is read again, otherwise it is downloaded once.
    const added = await ctx.services.countryFiles.add({
      regionId: input.regionId,
      roads: true,
      layers: [],
      keep: input.keepExtract === true,
      ...(input.locationId ? { locationId: input.locationId } : {}),
    });
    return { downloadId: added.downloadId, jobId: added.taskId };
  }

  async function buildFromCountryFile(input: CountryFileBuild) {
    const replaces = rows()
      .filter((r) => r.regionId === input.regionId)
      .map((r) => r.id);
    const row = await build({
      filePath: input.filePath,
      regionId: input.regionId,
      name: input.name,
      country: input.country,
      source: input.sourceUrl,
      extract: input.kept
        ? {
            kept: true,
            locationId: input.kept.locationId,
            relPath: input.kept.relPath,
            bytes: input.bytes,
            collectionId: input.kept.collectionId,
          }
        : { kept: false, locationId: null, relPath: null, bytes: input.bytes },
      replaces,
      signal: input.signal,
      progress: input.progress,
    });
    return { id: row.id, dataDate: row.dataDate };
  }

  /** A person's own file in a storage location: inside it, and through a link only to another location or the storage roots. */
  async function ownFile(input: Pick<BuildFromFileInput, "locationId" | "relPath">): Promise<string> {
    const file = await ctx.services.storage.resolveFollowingLinks(input.locationId, input.relPath);
    const stat = await fs.promises.stat(file).catch(() => null);
    if (!stat) throw notFound("That file");
    if (!stat.isFile()) throw badRequest("That is a folder: give the path of the .osm.pbf file in it.");
    return file;
  }

  async function installFile(input: BuildFromFileInput) {
    // Resolving now says at once if the path is wrong; the job resolves it again.
    await ownFile(input);
    const job = ctx.jobs.enqueue(BUILD_JOB, input as unknown as Record<string, unknown>, {
      title: `${input.name}: routes`,
      maxAttempts: 1,
    });
    return { jobId: job.id };
  }

  async function runBuildJob(
    input: BuildFromFileInput,
    signal: AbortSignal,
    progress: (current: number, total: number | null, message: string, unit?: string | null) => void,
  ) {
    const filePath = await ownFile(input);
    const bytes = (await fs.promises.stat(filePath)).size;
    const row = await build({
      filePath,
      regionId: null,
      name: input.name,
      country: input.country,
      source: "Your file",
      // A file the person brought is theirs: it is never deleted.
      extract: { kept: true, locationId: input.locationId, relPath: input.relPath, bytes },
      replaces: input.replaces ? [input.replaces] : [],
      signal,
      progress,
    });
    return { roadNetworkId: row.id, nodes: row.nodes, edges: row.edges };
  }

  // ── What is on its way ─────────────────────────────────────────────────────
  /** Geofabrik's id for a whole country, from its list as kept on this device (read on a person's press); null before. */
  const regions = createRegionIndex(ctx, createHttpClient({ allowPrivate: ctx.config.allowPrivateDownloads }));
  const regionOf = (code: string) => regions.kept()?.regions.find((r) => r.country === code && r.depth === 0)?.id ?? null;

  const phaseOf = (state: string, downloading: boolean): RoadBuildingPhase =>
    state === "failed" ? "failed" : state === "queued" || state === "paused" ? "waiting" : downloading ? "downloading" : "building";

  /** Once, for networks built before their build recorded it: read each one's file and keep the answer in its stats. */
  async function recordNorthernIreland(): Promise<number> {
    let done = 0;
    for (const row of rows()) {
      if (typeof row.stats?.northernIreland === "boolean") continue;
      let reaches: boolean;
      try {
        const data = await readNetworkFile(resolveInside(ctx.config.dataDir, row.relPath));
        reaches = reachesNorthernIreland(data.nodeLat, data.nodeLon);
      } catch (error) {
        ctx.log.warn({ err: error, network: row.id }, "A road network could not be read to see whether it reaches Northern Ireland");
        continue;
      }
      ctx.db
        .update(roadNetworks)
        .set({ stats: { ...(row.stats ?? {}), northernIreland: reaches } })
        .where(eq(roadNetworks.id, row.id))
        .run();
      done += 1;
    }
    if (done > 0) changed();
    return done;
  }
  // Soon after start, in the background: a file read per older network, once.
  let recording: NodeJS.Timeout | null = setTimeout(() => {
    recording = null;
    void recordNorthernIreland().catch((error) =>
      ctx.log.warn({ err: error }, "Road networks could not be looked at for Northern Ireland"),
    );
  }, 5_000);
  recording.unref();

  function list(): RoadNetworksResponse {
    const jobs = ctx.jobs.list({ states: ["queued", "running", "paused"], types: [BUILD_JOB] });
    const downloads = ctx.services.downloads.unfinished().filter(isRoadsDownload);
    const fromCountryFiles = ctx.services.countryFiles.pending().filter((entry) => entry.roads);
    const credit = roadCredit(rows().map((r) => ({ id: r.id, name: networkName(r), country: r.country, dataDate: r.dataDate })));
    const progressOf = (id: string) => {
      const row = ctx.services.downloads.get(id);
      if (!row) return { receivedBytes: null, totalBytes: null, etaSeconds: null };
      const dto = ctx.services.downloads.toDto(row);
      return { receivedBytes: dto.receivedBytes, totalBytes: dto.totalBytes, etaSeconds: dto.etaSeconds };
    };
    const all: RoadNetworkBuilding[] = [
      ...jobs.map((job) => {
        const payload = job.payload as { name?: string; country?: string | null };
        return {
          jobId: job.id,
          name: payload.name ?? job.title,
          state: job.state,
          message: job.progressMessage ?? null,
          country: payload.country ?? null,
          regionId: null,
          phase: phaseOf(job.state, false),
          error: null,
        };
      }),
      ...downloads.map((d) => {
        const meta = (d.meta as { roads: RoadsDownloadMeta }).roads;
        return {
          jobId: d.id,
          name: meta.name,
          state: d.state,
          message: null,
          country: meta.country,
          regionId: meta.regionId,
          phase: phaseOf(d.state, d.state === "running" || d.state === "verifying"),
          ...progressOf(d.id),
          error: d.error ?? null,
        };
      }),
      ...fromCountryFiles.map((entry) => ({
        jobId: entry.downloadId ?? entry.taskId ?? "",
        name: entry.name,
        state: entry.state,
        message: entry.message,
        country: entry.country,
        regionId: entry.regionId,
        phase: phaseOf(entry.state, entry.downloadId !== null && entry.state !== "queued"),
        ...(entry.downloadId ? progressOf(entry.downloadId) : {}),
        error: entry.error,
      })),
    ];
    // One entry a region: a download and the read after it, or a failed try beside a new one, are one thing on its way.
    const building: RoadNetworkBuilding[] = [];
    for (const entry of all) {
      const key = entry.regionId ?? entry.jobId;
      const at = building.findIndex((other) => (other.regionId ?? other.jobId) === key);
      if (at < 0) building.push(entry);
      else if (building[at]!.phase === "failed" && entry.phase !== "failed") building[at] = entry;
    }
    return {
      networks: rows().map((row) => toNetworkDto(row, fs.existsSync(resolveInside(ctx.config.dataDir, row.relPath)))),
      building,
      credit,
    };
  }

  // ── Planning ───────────────────────────────────────────────────────────────
  async function resolvePoints(request: RoadRouteRequest): Promise<PlanPoint[]> {
    return request.points.map((point, index) => {
      if ("placeId" in point) {
        const marker = ctx.db.select().from(markers).where(eq(markers.id, point.placeId)).get();
        if (!marker) throw badRequest(`Point ${index + 1} is a saved place that is no longer there.`);
        return { lat: marker.lat, lon: marker.lon, name: ownName(point.name) ?? marker.name };
      }
      return { lat: point.lat, lon: point.lon, name: ownName(point.name) };
    });
  }

  function savedRow(id: string): RouteRow {
    const row = ctx.db.select().from(roadRoutes).where(eq(roadRoutes.id, id)).get();
    if (!row) throw notFound("That road route");
    return row;
  }
  const savedDto = (row: RouteRow): SavedRoadRouteDto => ({ ...summaryOf(row), route: row.route as unknown as SavedRouteResult });

  return {
    installer,
    runBuildJob,
    loadGraph,
    list,
    coverage(points) {
      const { networks, building } = list();
      return coverageOf(points, networks, building, regionOf);
    },
    installRegion,
    buildFromCountryFile,
    installFile,
    async update(id) {
      const row = rows().find((r) => r.id === id);
      if (!row) throw notFound("That road network");
      if (row.regionId)
        return installRegion({
          regionId: row.regionId,
          keepExtract: row.extract.kept,
          ...(row.extract.locationId ? { locationId: row.extract.locationId } : {}),
        });
      if (!row.extract.locationId || !row.extract.relPath)
        throw badRequest("Outpost no longer knows which file this network was built from: install it again.");
      return {
        downloadId: null,
        ...(await installFile({
          locationId: row.extract.locationId,
          relPath: row.extract.relPath,
          name: row.name,
          country: row.country,
          replaces: row.id,
        })),
      };
    },
    async remove(id) {
      const row = rows().find((r) => r.id === id);
      if (!row) throw notFound("That road network");
      ctx.db.delete(roadNetworks).where(eq(roadNetworks.id, id)).run();
      await fs.promises.rm(resolveInside(ctx.config.dataDir, row.relPath), { force: true });
      forget();
      changed();
    },
    async crossings() {
      const g = await loadGraph();
      const out: RoadCrossingDto[] = [];
      const seen = new Set<string>();
      for (const c of g.crossings) {
        if (!c.sea || seen.has(c.key)) continue;
        seen.add(c.key);
        const ends = c.ends.slice(0, 2).map((node) => [g.lon[node]!, g.lat[node]!] as [number, number]);
        out.push({
          id: c.key,
          kind: c.kind,
          name: c.kind === "shuttle" ? "Eurotunnel Le Shuttle (Folkestone – Calais)" : c.name,
          operator: c.operator,
          durationS: c.durationS ?? Math.round(c.lengthM / (28 / 3.6)),
          durationSource: c.durationS !== null ? "tagged" : "assumed",
          lengthM: c.lengthM,
          ends: (ends.length === 2 ? ends : [ends[0] ?? [0, 0], ends[0] ?? [0, 0]]) as [[number, number], [number, number]],
          joined: g.crossings.filter((other) => other.key === c.key).some((other) => other.joined),
        });
      }
      return out.sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name, "en") : a.kind === "shuttle" ? -1 : 1));
    },
    async plan(request) {
      const points = await resolvePoints(request);
      const g = await loadGraph();
      const result = planRoute(g, points, { crossing: request.crossing ?? "any", units: request.units ?? "km", request, regionOf });
      touch();
      return result;
    },
    savedRoutes() {
      return ctx.db.select().from(roadRoutes).orderBy(desc(roadRoutes.updatedAt)).all().map(summaryOf);
    },
    savedRoute(id) {
      return savedDto(savedRow(id));
    },
    saveRoute({ name, route }) {
      const now = Date.now();
      const names = "mode" in route ? route.request.points.map((p) => p.name) : route.snapped.map((p) => p.input.name);
      const first = names[0]?.trim();
      const last = names.at(-1)?.trim();
      const row: RouteRow = {
        id: newId(),
        name,
        fromTo: first && last ? `${first} to ${last}` : "",
        distanceM: route.summary.distanceM,
        durationS: route.summary.durationS,
        route: route as unknown as Record<string, unknown>,
        createdAt: now,
        updatedAt: now,
      };
      ctx.db.insert(roadRoutes).values(row).run();
      changed();
      return savedDto(row);
    },
    renameRoute(id, name) {
      savedRow(id);
      ctx.db.update(roadRoutes).set({ name, updatedAt: Date.now() }).where(eq(roadRoutes.id, id)).run();
      changed();
      return savedDto(savedRow(id));
    },
    deleteRoute(id) {
      savedRow(id);
      ctx.db.delete(roadRoutes).where(eq(roadRoutes.id, id)).run();
      changed();
    },
    async eraseAll() {
      const saved = ctx.db.select().from(roadRoutes).all().length;
      const networks = rows();
      ctx.db.delete(roadRoutes).run();
      ctx.db.delete(roadNetworks).run();
      for (const row of networks) await fs.promises.rm(resolveInside(ctx.config.dataDir, row.relPath), { force: true });
      forget();
      changed();
      return saved;
    },
    recordNorthernIreland,
    close() {
      if (idle) clearTimeout(idle);
      if (recording) clearTimeout(recording);
      forget();
    },
  };
}
