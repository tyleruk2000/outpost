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
  RoadCrossingDto,
  RoadNetworkDto,
  RoadNetworksResponse,
  RoadRouteRequest,
  RoadRouteResult,
  SavedRoadRouteDto,
  SavedRoadRouteSummaryDto,
} from "@outpost/shared";
import { desc, eq } from "drizzle-orm";
import type { AppContext } from "../../core/context.ts";
import { AppError, badRequest, notFound } from "../../core/errors.ts";
import { resolveInside } from "../../core/fs-safe.ts";
import type { HttpClient } from "../../core/http.ts";
import { newId } from "../../core/ids.ts";
import { PermanentJobError } from "../../core/jobs.ts";
import { markers, roadNetworks, roadRoutes } from "../../db/schema.ts";
import type { DownloadRow, Installer } from "../downloads/types.ts";
import { createRegionIndex } from "../layers/adapters/geofabrik-regions.ts";
import { fetchText, headSize } from "../layers/adapters/http.ts";
import { buildNetwork } from "./build.ts";
import { buildGraph, type Graph } from "./graph.ts";
import { readNetworkFile, writeNetworkFile } from "./network-file.ts";
import { type PlanPoint, planRoute, roadCredit } from "./plan.ts";
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

export interface RoadsService {
  list(): RoadNetworksResponse;
  installRegion(input: { regionId: string; keepExtract?: boolean; locationId?: string }): Promise<{ downloadId: string }>;
  installFile(input: BuildFromFileInput): { jobId: string };
  update(id: string): Promise<{ downloadId: string | null; jobId: string | null }>;
  remove(id: string): Promise<void>;
  crossings(): Promise<RoadCrossingDto[]>;
  plan(request: RoadRouteRequest): Promise<RoadRouteResult>;
  savedRoutes(): SavedRoadRouteSummaryDto[];
  savedRoute(id: string): SavedRoadRouteDto;
  saveRoute(input: { name: string; route: RoadRouteResult }): SavedRoadRouteDto;
  renameRoute(id: string, name: string): SavedRoadRouteDto;
  deleteRoute(id: string): void;
  /** Every saved route and network, for "erase everything". Returns how many saved routes there were. */
  eraseAll(): Promise<number>;
  installer: Installer;
  runBuildJob(
    input: BuildFromFileInput,
    signal: AbortSignal,
    progress: (current: number, total: number | null, message: string) => void,
  ): Promise<Record<string, unknown>>;
  /** For tests and measurements: the graph as loaded now. */
  loadGraph(): Promise<Graph>;
  close(): void;
}

export function toNetworkDto(row: NetworkRow, available: boolean): RoadNetworkDto {
  return {
    id: row.id,
    regionId: row.regionId,
    name: row.name,
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
    available,
  };
}

function summaryOf(row: RouteRow): SavedRoadRouteSummaryDto {
  return {
    id: row.id,
    name: row.name,
    fromTo: row.fromTo,
    distanceM: row.distanceM,
    durationS: row.durationS,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function createRoadsService(ctx: AppContext, client: HttpClient): RoadsService {
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
              network: { id: row.id, name: row.name, country: row.country, dataDate: row.dataDate },
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
    progress: (current: number, total: number | null, message: string) => void;
  }): Promise<NetworkRow> {
    return oneAtATime(async () => {
      const data = await buildNetwork(input.filePath, {
        signal: input.signal,
        progress: (message, bytes, total) => input.progress(bytes, total, message),
      });
      if (data.nodeId.length === 0) throw new PermanentJobError("The file holds no main roads Outpost could read: no network was made.");
      input.progress(1, 1, "Writing the network");
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
        stats: { ...data.stats },
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
    if (!meta) throw new PermanentJobError("Outpost does not know which road network this download is for.");
    const replaces = rows()
      .filter((r) => r.regionId === meta.regionId)
      .map((r) => r.id);
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
      progress: (current, total, message) => progress(current, total, message),
    });
    // The extract was fetched for this network alone: unless asked to keep it, it goes once read.
    if (!meta.keepExtract) await fs.promises.rm(filePath, { force: true });
    return { meta: { roadNetworkId: row.id } };
  };

  async function installRegion(input: { regionId: string; keepExtract?: boolean; locationId?: string }) {
    // Read afresh each press: the list is read (and kept) from the reference layers' screen, after this service started.
    const regions = createRegionIndex(ctx, client);
    if (!regions.kept()) throw badRequest("Read Geofabrik's list of regions first (Reference layers: “Read the list of regions”).");
    const region = regions.find(input.regionId);
    if (!region) throw badRequest(`“${input.regionId}” is not in Geofabrik's list as read on this device. Read the list again.`);
    let head: Awaited<ReturnType<typeof headSize>>;
    try {
      head = await headSize(client, region.pbf);
    } catch (error) {
      if (error instanceof AppError && error.code === "forbidden")
        throw badRequest(
          `Geofabrik sends ${region.name}'s file from another server (a mirror), which Outpost does not download from. Choose its parts instead: each is its own, smaller file, and neighbouring parts join.`,
        );
      throw error;
    }
    const md5 = /^([0-9a-f]{32})\b/i.exec((await fetchText(client, `${head.finalUrl}.md5`, { max: 4096 })).trim())?.[1];
    if (!md5)
      throw new AppError("upstream", `Geofabrik did not give an MD5 for ${region.name}'s file, so it was not downloaded. Try again later.`);
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    const row = await ctx.services.downloads.start({
      kind: "dataset",
      title: `Road network: ${region.name} (Geofabrik)`,
      url: head.finalUrl,
      relPath: `roads/extracts/${region.id.replace(/[^a-z0-9-]/gi, "-")}-${stamp}.osm.pbf`,
      ...(input.locationId ? { locationId: input.locationId } : {}),
      sizeBytes: head.bytes ?? undefined,
      md5: md5.toLowerCase(),
      allowedHosts: [new URL(head.finalUrl).hostname],
      meta: {
        roads: {
          regionId: region.id,
          name: region.name,
          country: region.country ?? null,
          keepExtract: input.keepExtract === true,
          sourceUrl: head.finalUrl,
        } satisfies RoadsDownloadMeta,
      },
    });
    return { downloadId: row.id };
  }

  function installFile(input: BuildFromFileInput) {
    // Resolving now says at once if the path is wrong; the job resolves it again.
    const file = ctx.services.storage.resolve(input.locationId, input.relPath);
    if (!fs.existsSync(file)) throw notFound("That file");
    const job = ctx.jobs.enqueue(BUILD_JOB, input as unknown as Record<string, unknown>, {
      title: `Building the road network: ${input.name}`,
      maxAttempts: 1,
    });
    return { jobId: job.id };
  }

  async function runBuildJob(
    input: BuildFromFileInput,
    signal: AbortSignal,
    progress: (current: number, total: number | null, message: string) => void,
  ) {
    const filePath = ctx.services.storage.resolve(input.locationId, input.relPath);
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

  // ── Planning ───────────────────────────────────────────────────────────────
  async function resolvePoints(request: RoadRouteRequest): Promise<PlanPoint[]> {
    return request.points.map((point, index) => {
      if ("placeId" in point) {
        const marker = ctx.db.select().from(markers).where(eq(markers.id, point.placeId)).get();
        if (!marker) throw badRequest(`Point ${index + 1} is a saved place that is no longer there.`);
        return { lat: marker.lat, lon: marker.lon, name: point.name ?? marker.name };
      }
      return { lat: point.lat, lon: point.lon, name: point.name?.trim() || null };
    });
  }

  function savedRow(id: string): RouteRow {
    const row = ctx.db.select().from(roadRoutes).where(eq(roadRoutes.id, id)).get();
    if (!row) throw notFound("That road route");
    return row;
  }
  const savedDto = (row: RouteRow): SavedRoadRouteDto => ({ ...summaryOf(row), route: row.route as unknown as RoadRouteResult });

  return {
    installer,
    runBuildJob,
    loadGraph,
    list() {
      const jobs = ctx.jobs.list({ states: ["queued", "running", "paused"], types: [BUILD_JOB] });
      const downloads = ctx.services.downloads.unfinished().filter(isRoadsDownload);
      const credit = roadCredit(rows().map((r) => ({ id: r.id, name: r.name, country: r.country, dataDate: r.dataDate })));
      return {
        networks: rows().map((row) => toNetworkDto(row, fs.existsSync(resolveInside(ctx.config.dataDir, row.relPath)))),
        building: [
          ...jobs.map((job) => ({
            jobId: job.id,
            name: (job.payload as { name?: string }).name ?? job.title,
            state: job.state,
            message: job.progressMessage ?? null,
          })),
          ...downloads.map((d) => ({
            jobId: d.id,
            name: (d.meta as { roads: RoadsDownloadMeta }).roads.name,
            state: d.state,
            message: null,
          })),
        ],
        credit,
      };
    },
    installRegion,
    installFile,
    async update(id) {
      const row = rows().find((r) => r.id === id);
      if (!row) throw notFound("That road network");
      if (row.regionId)
        return {
          ...(await installRegion({
            regionId: row.regionId,
            keepExtract: row.extract.kept,
            ...(row.extract.locationId ? { locationId: row.extract.locationId } : {}),
          })),
          jobId: null,
        };
      if (!row.extract.locationId || !row.extract.relPath)
        throw badRequest("Outpost no longer knows which file this network was built from: install it again.");
      return {
        downloadId: null,
        ...installFile({
          locationId: row.extract.locationId,
          relPath: row.extract.relPath,
          name: row.name,
          country: row.country,
          replaces: row.id,
        }),
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
      if (g.networks.length === 0)
        throw badRequest("No road network is installed. Install the countries or regions you will drive through from Road networks.");
      const result = planRoute(g, points, { crossing: request.crossing ?? "any", units: request.units ?? "km", request });
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
      const first = route.snapped[0]?.input.name;
      const last = route.snapped.at(-1)?.input.name;
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
    close() {
      if (idle) clearTimeout(idle);
      forget();
    },
  };
}
