/**
 * National aerial photographs: where each publisher's are found for an area, how its
 * files are named and read, how fine they are, and on what terms.
 *
 * A source is a description plus a small adapter: `search` finds the surveys that cover
 * an area (each becomes one choice beside the Sentinel-2 days), and `filesFor` names the
 * files of a chosen survey that the area needs. Everything else (reading the files by
 * range request, putting them on the map, the size shown before fetching, the job) is
 * shared, in aerial.ts and index.ts. Adding a country is adding an entry here, if its
 * publisher offers Cloud-Optimised GeoTIFFs in a form the reader in cog.ts reads and a
 * projection projection.ts has.
 *
 * Every fact here was read from the publisher's own pages or files on 16 November 2026
 * and is quoted in docs/sources.md.
 */
import type { Bbox, ImagerySourceId, ImagerySourceInfo } from "@outpost/shared";
import { z } from "zod";
import { AppError, classifyNetworkError } from "../../../core/errors.ts";
import type { HttpClient } from "../../../core/http.ts";
import { hostOf } from "../source.ts";
import type { AerialFile, GridProjection } from "./aerial.ts";
import { lonLatToTransverseMercator } from "./projection.ts";
import type { RangeFetcher } from "./ranges.ts";

/** One survey of an area: what a person chooses, beside the Sentinel-2 days. */
export const aerialChoiceSchema = z.object({
  source: z.enum(["linz-aerial", "naip"]),
  key: z.string().min(1).max(400),
  title: z.string().max(300),
  /** "2023", or the first day flown: "2023-01-15". */
  date: z.string().max(40),
  /** "January to April 2023", "25 September 2023". */
  dateText: z.string().max(80),
  resolutionMeters: z.number().positive(),
  coveragePercent: z.number(),
  /** Who holds the rights, where the publisher names someone other than itself. */
  licensor: z.string().max(200).nullable(),
  /** What the source needs to name the files later: a survey's address, or the files themselves. */
  ref: z.object({
    collectionUrl: z.string().optional(),
    files: z.array(z.object({ id: z.string(), url: z.string() })).optional(),
  }),
});
export type AerialChoice = z.infer<typeof aerialChoiceSchema>;

export interface AerialEndpoints {
  /** New Zealand's bucket, "https://nz-imagery.s3.ap-southeast-2.amazonaws.com". */
  linzBase?: string;
  /** The Planetary Computer's STAC search, its token service, and the host of its NAIP files. */
  naipSearchUrl?: string;
  naipTokenUrl?: string;
  naipHost?: string;
}

export interface SourceContext {
  client: HttpClient;
  fetcher: RangeFetcher;
  endpoints: AerialEndpoints;
  signal?: AbortSignal;
}

export interface AerialSourceDef {
  id: "linz-aerial" | "naip";
  info: ImagerySourceInfo;
  /** A short name for lists: "LINZ", "USDA NAIP". */
  short: string;
  /** Roughly where it has photographs; no request is made for an area outside. */
  bounds: Bbox[];
  /** Every host asked, for the allow-list of a download. */
  hosts(endpoints: AerialEndpoints): string[];
  /** Hosts of the files themselves. */
  fileHosts(endpoints: AerialEndpoints): string[];
  /** Shallowest zoom made, and the deepest any area may have (see docs/maps.md, "Aerial photographs"). */
  minZoom: number;
  maxZoomCeiling: number;
  /**
   * Bytes a stored tile position takes, for the size shown before fetching: real builds
   * on 16 November 2026 came to 9.0 kB (1 km² of Christchurch, LINZ 7.5 cm), 7.7 kB
   * (0.3 km² of Boulder, NAIP 30 cm) and 5.5 kB (0.1 km² of Christchurch); rounded up.
   */
  bytesPerTile: number;
  zeroIsNoData: boolean;
  /** Bytes read first from each file for its directory. */
  headerBytes: number;
  projectionOf(epsg: number | null): GridProjection | undefined;
  search(context: SourceContext, bbox: Bbox): Promise<AerialChoice[]>;
  filesFor(context: SourceContext, choice: AerialChoice, bbox: Bbox): Promise<AerialFile[]>;
  /** Signs a file's address, if the publisher asks for a token; undefined when it does not. */
  signer?(context: Pick<SourceContext, "client" | "endpoints">): (url: string) => Promise<string>;
  /** HTML for the map's credits line. */
  attribution(choice: Pick<AerialChoice, "dateText" | "licensor" | "date">): string;
  /** The credit in plain words, for the confirmation. */
  creditText(choice: Pick<AerialChoice, "licensor" | "date">): string;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "January to April 2023", "December 2022 to March 2023", "March 2024". */
export function spanText(start: string, end: string | null): string {
  const [y1, m1] = start.split("-").map(Number) as [number, number];
  if (!end) return `${MONTHS[m1 - 1]} ${y1}`;
  const [y2, m2] = end.split("-").map(Number) as [number, number];
  if (y1 === y2 && m1 === m2) return `${MONTHS[m1 - 1]} ${y1}`;
  if (y1 === y2) return `${MONTHS[m1 - 1]} to ${MONTHS[m2 - 1]} ${y1}`;
  return `${MONTHS[m1 - 1]} ${y1} to ${MONTHS[m2 - 1]} ${y2}`;
}

const intersects = (a: Bbox, b: Bbox) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];

export function sourceCovers(source: Pick<AerialSourceDef, "bounds">, bbox: Bbox): boolean {
  return source.bounds.some((bounds) => intersects(bounds, bbox));
}

function upstream(name: string, error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (classifyNetworkError(error) === "offline") {
    return new AppError("offline", `Outpost could not reach ${name}. Finding pictures needs an internet connection.`);
  }
  return new AppError("upstream", `${name} could not be read. Try again later.`);
}

/** A whole JSON document (a catalogue or a search answer), refusing anything larger than `limit` bytes. */
async function getJson(
  client: HttpClient,
  url: string,
  name: string,
  options: { signal?: AbortSignal; limit: number; method?: "GET" | "POST"; body?: unknown },
): Promise<unknown> {
  try {
    const { response } = await client.fetch(url, {
      method: options.method ?? "GET",
      ...(options.body
        ? { body: JSON.stringify(options.body), headers: { "content-type": "application/json", accept: "application/json" } }
        : {}),
      allowedHosts: [hostOf(url)],
      everyHop: true,
      signal: options.signal,
    });
    if (response.status === 429 || response.status === 503) {
      await response.body?.cancel().catch(() => undefined);
      throw new AppError("upstream", `${name} is busy. Try again in a minute.`);
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw new AppError("upstream", `${name} answered with an error (HTTP ${response.status}). Try again later.`);
    }
    const chunks: Uint8Array[] = [];
    let received = 0;
    for await (const chunk of response.body ?? []) {
      received += (chunk as Uint8Array).length;
      if (received > options.limit) throw new AppError("upstream", `${name} sent far more than expected. Nothing more was read.`);
      chunks.push(chunk as Uint8Array);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch (error) {
    throw upstream(name, error);
  }
}

/** Percent of a box inside a set of polygons (rings of [lon, lat]), from a 24 × 24 grid of points. */
export function coverageOf(rings: Array<Array<[number, number]>>, bbox: Bbox): number {
  const inRing = (lon: number, lat: number, ring: Array<[number, number]>) => {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i]!;
      const [xj, yj] = ring[j]!;
      if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  };
  const [west, south, east, north] = bbox;
  const steps = 24;
  let hit = 0;
  for (let i = 0; i < steps; i += 1) {
    for (let j = 0; j < steps; j += 1) {
      const lon = west + ((i + 0.5) / steps) * (east - west);
      const lat = south + ((j + 0.5) / steps) * (north - south);
      // An even number of rings round a point is a hole; good enough for capture areas.
      if (rings.filter((ring) => inRing(lon, lat, ring)).length % 2 === 1) hit += 1;
    }
  }
  return Math.round((hit / (steps * steps)) * 100);
}

/** Outer and inner rings of a GeoJSON Polygon or MultiPolygon, or of a FeatureCollection of them. */
function ringsOfGeoJson(value: unknown): Array<Array<[number, number]>> {
  const rings: Array<Array<[number, number]>> = [];
  const visit = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    const object = node as { type?: string; coordinates?: unknown; geometry?: unknown; features?: unknown[] };
    if (object.type === "FeatureCollection" && Array.isArray(object.features)) object.features.forEach(visit);
    else if (object.type === "Feature") visit(object.geometry);
    else if (object.type === "Polygon" && Array.isArray(object.coordinates)) {
      for (const ring of object.coordinates as unknown[]) if (Array.isArray(ring)) rings.push(ring as Array<[number, number]>);
    } else if (object.type === "MultiPolygon" && Array.isArray(object.coordinates)) {
      for (const polygon of object.coordinates as unknown[])
        for (const ring of (polygon as unknown[]) ?? []) if (Array.isArray(ring)) rings.push(ring as Array<[number, number]>);
    }
  };
  visit(value);
  return rings.filter((ring) => ring.length >= 4 && ring.every((point) => Array.isArray(point) && point.length >= 2));
}

// ── New Zealand: Toitū Te Whenua Land Information New Zealand ────────────────

export const LINZ_BASE = "https://nz-imagery.s3.ap-southeast-2.amazonaws.com";

/** New Zealand Transverse Mercator 2000 (EPSG 2193), on NZGD2000. */
const NZTM = { centralMeridian: 173, scale: 0.9996, falseEasting: 1_600_000, falseNorthing: 10_000_000 };

/**
 * Where each region's surveys lie, from the extents of every colour survey in the
 * bucket on 16 November 2026 (a margin of 0.1° added). Only surveys in the regions an
 * area touches are looked at, so a search reads a few dozen small parts of files, not
 * hundreds.
 */
const LINZ_REGIONS: Record<string, Bbox> = {
  auckland: [173.86, -37.88, 175.69, -35.73],
  "bay-of-plenty": [175.27, -39.14, 178.4, -37.14],
  canterbury: [168.55, -45.76, 174.4, -41.36],
  gisborne: [176.91, -39.22, 178.71, -37.39],
  "hawkes-bay": [175.37, -40.61, 178.13, -38.4],
  "manawatu-whanganui": [174.31, -41.2, 177.06, -38.32],
  marlborough: [172.0, -42.6, 175.41, -40.55],
  nelson: [172.68, -41.6, 173.78, -40.7],
  northland: [172.46, -37.01, 175.0, -34.26],
  otago: [167.67, -46.79, 171.33, -43.78],
  southland: [166.29, -47.43, 170.98, -44.14],
  taranaki: [173.6, -40.03, 175.31, -38.56],
  tasman: [171.78, -42.57, 173.93, -40.36],
  waikato: [173.6, -39.65, 176.95, -35.92],
  wellington: [174.48, -41.77, 176.7, -40.27],
  "west-coast": [167.93, -44.48, 172.55, -40.65],
};

/** Surveys of more than this many years ago are not offered: older ones are mostly scanned film. */
const LINZ_YEARS_BACK = 10;

/**
 * The publisher's grid of sheets. Topo50 sheets are 24 by 36 km, named by a pair of
 * letters for the row (A to Z without I and O, "AS" the first, at the top) and a number
 * for the column; a survey's files cut each sheet into a square grid of 50,000 / scale
 * tiles a side, numbered from 1 at the top left. Worked out from the names and extents
 * of files in the bucket and checked on 16 November 2026 against sheets BW23 (scale
 * 500) and AT24 (scale 5000) to the metre.
 */
const SHEET_LEFT = 988_000;
const SHEET_TOP = 6_234_000;
const SHEET_WIDTH = 24_000;
const SHEET_HEIGHT = 36_000;
const SHEET_LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const FIRST_ROW = SHEET_LETTERS.indexOf("A") * SHEET_LETTERS.length + SHEET_LETTERS.indexOf("S");

/** Names of the tiles of a survey at `scale` (500, 1000, 5000…) that a box in NZTM touches. */
export function linzTileNames(box: [number, number, number, number], scale: number, digits: number): string[] {
  const perSheet = Math.round(50_000 / scale);
  const tileWidth = SHEET_WIDTH / perSheet;
  const tileHeight = SHEET_HEIGHT / perSheet;
  const [minX, minY, maxX, maxY] = box;
  const names: string[] = [];
  const col0 = Math.floor((minX - SHEET_LEFT) / tileWidth);
  const col1 = Math.floor((maxX - SHEET_LEFT) / tileWidth);
  const row0 = Math.floor((SHEET_TOP - maxY) / tileHeight);
  const row1 = Math.floor((SHEET_TOP - minY) / tileHeight);
  for (let row = row0; row <= row1; row += 1) {
    for (let col = col0; col <= col1; col += 1) {
      const sheetRow = Math.floor(row / perSheet) + FIRST_ROW;
      const sheetCol = Math.floor(col / perSheet);
      if (sheetRow < 0 || sheetCol < 0 || sheetCol > 99) continue;
      const letters = SHEET_LETTERS[Math.floor(sheetRow / SHEET_LETTERS.length)]! + SHEET_LETTERS[sheetRow % SHEET_LETTERS.length]!;
      const pad = (value: number) => String(value).padStart(digits, "0");
      names.push(`${letters}${String(sheetCol).padStart(2, "0")}_${scale}_${pad((row % perSheet) + 1)}${pad((col % perSheet) + 1)}`);
    }
  }
  return names;
}

function nztmBox(bbox: Bbox): [number, number, number, number] {
  const corners = [
    [bbox[0], bbox[1]],
    [bbox[0], bbox[3]],
    [bbox[2], bbox[1]],
    [bbox[2], bbox[3]],
    [(bbox[0] + bbox[2]) / 2, bbox[1]],
    [(bbox[0] + bbox[2]) / 2, bbox[3]],
  ].map(([lon, lat]) => lonLatToTransverseMercator(lon!, lat!, NZTM));
  return [
    Math.min(...corners.map((c) => c[0])),
    Math.min(...corners.map((c) => c[1])),
    Math.max(...corners.map((c) => c[0])),
    Math.max(...corners.map((c) => c[1])),
  ];
}

const linzCatalogSchema = z.object({
  links: z.array(
    z.object({ rel: z.string(), href: z.string(), title: z.string().optional(), "file:size": z.number().optional() }).passthrough(),
  ),
});
const linzTailSchema = z
  .object({
    providers: z.array(z.object({ name: z.string(), roles: z.array(z.string()).optional() })).optional(),
    extent: z.object({
      spatial: z.object({ bbox: z.array(z.array(z.number()).min(4)) }),
      temporal: z.object({ interval: z.array(z.array(z.string().nullable())) }),
    }),
    gsd: z.number().positive(),
    "linz:geospatial_category": z.string().optional(),
    assets: z.record(z.string(), z.object({ href: z.string(), "file:size": z.number().optional() }).passthrough()).optional(),
  })
  .passthrough();

const LINZ_INFO: ImagerySourceInfo = {
  id: "linz-aerial",
  name: "New Zealand aerial photographs",
  publisher: "Toitū Te Whenua Land Information New Zealand (LINZ), with the councils and agencies that commissioned each survey",
  resolutionMeters: 0.075,
  licence: "Creative Commons Attribution 4.0 International (CC BY 4.0)",
  licenceUrl: "https://creativecommons.org/licenses/by/4.0/",
  credit: "Licensed by [the licensor] for re-use under CC-BY-4.0",
  cost: "Free. The files are in a public AWS bucket that needs no account and is not requester-pays: nobody is billed.",
};

export const LINZ: AerialSourceDef = {
  id: "linz-aerial",
  info: LINZ_INFO,
  short: "LINZ",
  bounds: Object.values(LINZ_REGIONS),
  hosts: (endpoints) => [hostOf(endpoints.linzBase ?? LINZ_BASE)],
  fileHosts: (endpoints) => [hostOf(endpoints.linzBase ?? LINZ_BASE)],
  minZoom: 10,
  maxZoomCeiling: 19,
  bytesPerTile: 10_000,
  zeroIsNoData: false,
  // A file is one tile of the sheet grid, a few megabytes; its directory is well under 32 kB.
  headerBytes: 32_768,
  projectionOf: (epsg) => (epsg === 2193 ? (lon, lat) => lonLatToTransverseMercator(lon, lat, NZTM) : undefined),

  async search(context, bbox) {
    const base = context.endpoints.linzBase ?? LINZ_BASE;
    const regions = Object.entries(LINZ_REGIONS)
      .filter(([, bounds]) => intersects(bounds, bbox))
      .map(([name]) => name);
    if (regions.length === 0) return [];
    const catalog = linzCatalogSchema.safeParse(
      await getJson(context.client, `${base}/catalog.json`, "New Zealand's imagery catalogue", {
        signal: context.signal,
        limit: 4_000_000,
      }),
    );
    if (!catalog.success) throw new AppError("upstream", "New Zealand's imagery catalogue is in a form Outpost does not understand.");
    const thisYear = new Date().getUTCFullYear();
    const candidates = catalog.data.links.filter((link) => {
      if (link.rel !== "child" || !link.title || !link["file:size"]) return false;
      const match = /^\.\/([a-z-]+)\/[a-z0-9._-]+\/rgb\/2193\/collection\.json$/.exec(link.href);
      const kind = /(Urban|Rural) Aerial Photos \((\d{4})(?:-\d{4})?\)$/.exec(link.title);
      return Boolean(match && kind && regions.includes(match[1]!) && Number(kind[2]) >= thisYear - LINZ_YEARS_BACK);
    });
    const choices: AerialChoice[] = [];
    await Promise.all(
      candidates.map(async (link) => {
        const url = `${base}/${link.href.slice(2)}`;
        const size = link["file:size"]!;
        // A survey's extent, dates and licensor are at the end of its description; its list of files, before them, can run to megabytes.
        const tailLength = Math.min(size, 12_288);
        const bytes = await context.fetcher.read(url, size - tailLength, tailLength);
        const text = Buffer.from(bytes).toString("utf8");
        const at = text.lastIndexOf('"providers"');
        if (at < 0) return;
        let tail: z.infer<typeof linzTailSchema>;
        try {
          const parsed = linzTailSchema.safeParse(JSON.parse(`{${text.slice(at)}`));
          if (!parsed.success) return;
          tail = parsed.data;
        } catch {
          return;
        }
        const extent = tail.extent.spatial.bbox[0]!;
        if (!intersects([extent[0]!, extent[1]!, extent[2]!, extent[3]!], bbox)) return;
        const capture = tail.assets?.capture_area;
        let coverage = 100;
        if (capture && (capture["file:size"] ?? 0) <= 3_000_000) {
          const area = await getJson(context.client, new URL(capture.href, url).href, "New Zealand's imagery catalogue", {
            signal: context.signal,
            limit: 3_000_000,
          });
          coverage = coverageOf(ringsOfGeoJson(area), bbox);
        }
        if (coverage === 0) return;
        const [start, end] = tail.extent.temporal.interval[0] ?? [];
        if (!start) return;
        const licensor = tail.providers?.find((provider) => provider.roles?.includes("licensor"))?.name ?? null;
        choices.push({
          source: "linz-aerial",
          key: `linz:${link.href}`,
          title: link.title!,
          date: start.slice(0, 10),
          dateText: spanText(start.slice(0, 10), end ? end.slice(0, 10) : null),
          resolutionMeters: tail.gsd,
          coveragePercent: coverage,
          licensor,
          ref: { collectionUrl: url },
        });
      }),
    );
    return choices;
  },

  async filesFor(context, choice, bbox) {
    const url = choice.ref.collectionUrl;
    if (!url || hostOf(url) !== hostOf(context.endpoints.linzBase ?? LINZ_BASE))
      throw new AppError("bad_request", "That survey is not one Outpost found.");
    // The first file named in the survey's description says the scale of its grid.
    const head = Buffer.from(await context.fetcher.read(url, 0, 8192)).toString("utf8");
    const first = /"\.\/([A-Z]{2}\d{2})_(\d+)_(\d+)\.json"/.exec(head);
    if (!first) throw new AppError("upstream", "The survey's list of files is not in the form Outpost expects.");
    const scale = Number(first[2]);
    const digits = first[3]!.length / 2;
    const folder = url.slice(0, url.lastIndexOf("/") + 1);
    return linzTileNames(nztmBox(bbox), scale, digits).map((name) => ({ id: name, url: `${folder}${name}.tiff`, mayBeAbsent: true }));
  },

  attribution(choice) {
    return `Imagery ${choice.dateText}: <a href="https://registry.opendata.aws/nz-imagery/">${escapeHtml(this.creditText(choice))}</a>`;
  },
  creditText(choice) {
    return `Licensed by ${choice.licensor ?? "Toitū Te Whenua Land Information New Zealand"} for re-use under CC-BY-4.0`;
  },
};

// ── United States: the USDA's National Agriculture Imagery Program ───────────

export const NAIP_SEARCH_URL = "https://planetarycomputer.microsoft.com/api/stac/v1/search";
export const NAIP_TOKEN_URL = "https://planetarycomputer.microsoft.com/api/sas/v1/token/naip";
export const NAIP_HOST = "naipeuwest.blob.core.windows.net";

/** NAD83 / UTM zones 10 to 19 north (EPSG 26910 to 26919), the lower 48 states. NAD83 is taken as WGS 84 (docs/maps.md). */
function naipProjection(epsg: number | null): GridProjection | undefined {
  if (epsg === null || epsg < 26901 || epsg > 26923) return undefined;
  const zone = epsg - 26900;
  const grid = { centralMeridian: (zone - 1) * 6 - 180 + 3, scale: 0.9996, falseEasting: 500_000, falseNorthing: 0 };
  return (lon, lat) => lonLatToTransverseMercator(lon, lat, grid);
}

const naipItemSchema = z
  .object({
    id: z.string().max(200),
    geometry: z.object({ type: z.string(), coordinates: z.unknown() }),
    properties: z
      .object({
        datetime: z.string(),
        gsd: z.number().positive(),
        "naip:year": z.union([z.string(), z.number()]),
        "naip:state": z.string(),
      })
      .passthrough(),
    assets: z.object({ image: z.object({ href: z.string() }).passthrough() }).passthrough(),
  })
  .passthrough();

const NAIP_INFO: ImagerySourceInfo = {
  id: "naip",
  name: "United States aerial photographs (NAIP)",
  publisher: "USDA Farm Service Agency, files on Microsoft's Planetary Computer",
  resolutionMeters: 0.3,
  licence: "Public domain",
  licenceUrl: "https://planetarycomputer.microsoft.com/dataset/naip",
  credit: "NAIP imagery provided by USDA Farm Service Agency",
  cost: "Free. Microsoft hosts the files and gives a token to anyone who asks, with no account: nobody is billed.",
};

/** A token for the Planetary Computer's NAIP files, fetched when first needed and kept until shortly before it lapses. */
function naipSigner(context: Pick<SourceContext, "client" | "endpoints">): (url: string) => Promise<string> {
  let token: { value: string; until: number } | undefined;
  const tokenUrl = context.endpoints.naipTokenUrl ?? NAIP_TOKEN_URL;
  return async (url) => {
    if (!token || Date.now() > token.until) {
      const answer = z
        .object({ token: z.string().min(1).max(4000), "msft:expiry": z.string().optional() })
        .safeParse(await getJson(context.client, tokenUrl, "The Planetary Computer's token service", { limit: 100_000 }));
      if (!answer.success)
        throw new AppError("upstream", "The Planetary Computer's token service answered in a form Outpost does not understand.");
      const expiry = answer.data["msft:expiry"] ? Date.parse(answer.data["msft:expiry"]) : Number.NaN;
      token = { value: answer.data.token, until: Number.isFinite(expiry) ? expiry - 5 * 60_000 : Date.now() + 30 * 60_000 };
    }
    return `${url}${url.includes("?") ? "&" : "?"}${token.value}`;
  };
}

export const NAIP: AerialSourceDef = {
  id: "naip",
  info: NAIP_INFO,
  short: "USDA NAIP",
  // The lower 48 states.
  bounds: [[-125, 24.4, -66.8, 49.5]],
  hosts: (endpoints) => [
    hostOf(endpoints.naipSearchUrl ?? NAIP_SEARCH_URL),
    hostOf(endpoints.naipTokenUrl ?? NAIP_TOKEN_URL),
    endpoints.naipHost ?? NAIP_HOST,
  ],
  fileHosts: (endpoints) => [endpoints.naipHost ?? NAIP_HOST],
  minZoom: 10,
  maxZoomCeiling: 19,
  bytesPerTile: 10_000,
  // The corners of each file, outside its quarter of a map sheet, are black.
  zeroIsNoData: true,
  // A file is a quarter of a 7.5-minute map sheet, up to 2 GB; its directory is BigTIFF and longer.
  headerBytes: 65_536,
  projectionOf: naipProjection,
  signer: naipSigner,

  async search(context, bbox) {
    const host = context.endpoints.naipHost ?? NAIP_HOST;
    const answer = await getJson(context.client, context.endpoints.naipSearchUrl ?? NAIP_SEARCH_URL, "The Planetary Computer's catalogue", {
      method: "POST",
      body: { collections: ["naip"], bbox, limit: 200, sortby: [{ field: "properties.datetime", direction: "desc" }] },
      signal: context.signal,
      limit: 8_000_000,
    });
    const features = z.object({ features: z.array(z.unknown()) }).safeParse(answer);
    if (!features.success)
      throw new AppError("upstream", "The Planetary Computer's catalogue answered in a form Outpost does not understand.");
    const local = host === "127.0.0.1" || host === "localhost";
    // One choice per state and year: the files of one survey.
    const groups = new Map<string, Array<z.infer<typeof naipItemSchema>>>();
    for (const raw of features.data.features) {
      const parsed = naipItemSchema.safeParse(raw);
      if (!parsed.success) continue;
      const item = parsed.data;
      const href = item.assets.image.href;
      if (hostOf(href) !== host || !(href.startsWith("https://") || (local && href.startsWith("http://")))) continue;
      const key = `${item.properties["naip:state"]}|${item.properties["naip:year"]}|${item.properties.gsd}`;
      groups.set(key, [...(groups.get(key) ?? []), item]);
    }
    const choices: AerialChoice[] = [];
    for (const [key, items] of groups) {
      if (items.length > 24) continue;
      const rings = items.flatMap((item) => ringsOfGeoJson(item.geometry));
      const coverage = coverageOf(rings, bbox);
      if (coverage === 0) continue;
      const days = items.map((item) => item.properties.datetime.slice(0, 10)).sort();
      const first = days[0]!;
      const last = days.at(-1)!;
      const state = String(items[0]!.properties["naip:state"]).toUpperCase();
      const year = String(items[0]!.properties["naip:year"]);
      choices.push({
        source: "naip",
        key: `naip:${key}:${items.map((item) => item.id).join(",")}`.slice(0, 400),
        title: `NAIP ${year}, ${state}`,
        date: first,
        dateText: first === last ? dayText(first) : spanText(first, last),
        resolutionMeters: items[0]!.properties.gsd,
        coveragePercent: coverage,
        licensor: null,
        ref: { files: items.map((item) => ({ id: item.id, url: item.assets.image.href })) },
      });
    }
    return choices;
  },

  async filesFor(context, choice) {
    const host = context.endpoints.naipHost ?? NAIP_HOST;
    const files = choice.ref.files ?? [];
    if (files.length === 0 || files.some((file) => hostOf(file.url) !== host))
      throw new AppError("bad_request", "That survey is not one Outpost found.");
    return files.map((file) => ({ id: file.id, url: file.url }));
  },

  attribution(choice) {
    return `Imagery ${choice.dateText}: <a href="https://planetarycomputer.microsoft.com/dataset/naip">${escapeHtml(this.creditText(choice))}</a>`;
  },
  creditText: () => "NAIP imagery provided by USDA Farm Service Agency",
};

function dayText(date: string): string {
  const [year, month, day] = date.split("-").map(Number) as [number, number, number];
  return `${day} ${MONTHS[month - 1]} ${year}`;
}

function escapeHtml(text: string): string {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

export const AERIAL_SOURCES: AerialSourceDef[] = [LINZ, NAIP];

export function aerialSource(id: ImagerySourceId): AerialSourceDef | undefined {
  return AERIAL_SOURCES.find((source) => source.id === id);
}
