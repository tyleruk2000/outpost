/**
 * Where map data comes from, and what must be said about it.
 *
 * Vector tiles are cut from the Protomaps daily planet build, which is made from
 * OpenStreetMap. Builds are published once a day and kept for about a week, so the
 * address is never fixed in code: the newest build is looked up when a person asks for
 * an estimate or a download. An administrator can point Outpost at another archive
 * (their own mirror, say) with the `maps.tileSource` setting.
 */
import type { MapAttribution, MapTileType } from "@outpost/shared";
import { z } from "zod";
import { AppError, badRequest, classifyNetworkError } from "../../core/errors.ts";
import type { HttpClient } from "../../core/http.ts";

export const BUILDS_URL = "https://build-metadata.protomaps.dev/builds.json";
export const BUILD_BASE_URL = "https://build.protomaps.com/";

export const ATTRIBUTIONS = {
  basemap: {
    name: "Protomaps, OpenStreetMap",
    html: '<a href="https://protomaps.com">Protomaps</a> © <a href="https://openstreetmap.org">OpenStreetMap</a>',
    license: "ODbL 1.0",
    url: "https://www.openstreetmap.org/copyright",
  },
  terrain: {
    name: "Mapterhorn",
    html: '© <a href="https://mapterhorn.com/attribution">Mapterhorn</a>',
    license: "Various open licences; see mapterhorn.com/attribution",
    url: "https://mapterhorn.com/attribution",
  },
  places: {
    name: "GeoNames",
    html: 'Place names: <a href="https://www.geonames.org">GeoNames</a> (CC BY 4.0)',
    license: "CC BY 4.0",
    url: "https://www.geonames.org",
  },
} as const satisfies Record<string, MapAttribution>;

export function attributionFor(tileType: MapTileType): MapAttribution {
  return tileType === "terrain" ? ATTRIBUTIONS.terrain : ATTRIBUTIONS.basemap;
}

export interface TileSource {
  url: string;
  /** Day of the build, "YYYYMMDD", when the address tells us. */
  build: string | null;
  /** True when the address is the newest daily build rather than one an administrator set. */
  followsNewest: boolean;
  /** Host the first request goes to. */
  host: string;
}

const buildsSchema = z.array(z.object({ key: z.string(), uploaded: z.string().optional() }).passthrough());
const BUILD_KEY = /^(\d{8})\.pmtiles$/;

/** The build day in an archive's address, e.g. "20261115" from ".../20261115.pmtiles". */
export function buildOfUrl(url: string): string | null {
  try {
    return /(?:^|[/_.-])(\d{8})\.pmtiles$/.exec(new URL(url).pathname)?.[1] ?? null;
  } catch {
    return null;
  }
}

/** Host name of an address in the form the HTTP client's allow-list compares against. */
export function hostOf(url: string): string {
  return new URL(url).hostname.replace(/^\[|\]$/g, "").toLowerCase();
}

function describe(url: string, followsNewest: boolean): TileSource {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw badRequest("The map source address in Settings is not a valid URL.");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw badRequest("The map source address in Settings must start with http:// or https://.");
  }
  return { url: parsed.toString(), build: buildOfUrl(url), followsNewest, host: hostOf(parsed.toString()) };
}

/** Looks up the list of daily builds and returns the address of the newest one. */
export async function fetchNewestBuild(
  client: HttpClient,
  options: { buildsUrl?: string; baseUrl?: string; signal?: AbortSignal } = {},
): Promise<TileSource> {
  const buildsUrl = options.buildsUrl ?? BUILDS_URL;
  let body: unknown;
  try {
    const { response } = await client.fetch(buildsUrl, {
      signal: options.signal,
      allowedHosts: [hostOf(buildsUrl)],
      headers: { accept: "application/json" },
    });
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw new AppError("upstream", `The list of map builds could not be read (HTTP ${response.status}). Try again in a little while.`);
    }
    body = await response.json();
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (classifyNetworkError(error) === "offline") {
      throw new AppError("offline", "Outpost could not reach the map source. Downloading a map region needs an internet connection.");
    }
    throw new AppError("upstream", "The list of map builds could not be read. Try again in a little while.");
  }
  const parsed = buildsSchema.safeParse(body);
  const newest = (parsed.success ? parsed.data : [])
    .map((build) => build.key)
    .filter((key) => BUILD_KEY.test(key))
    .sort()
    .at(-1);
  if (!newest) throw new AppError("upstream", "The list of map builds was empty or not in the expected form. Try again later.");
  return describe(new URL(newest, options.baseUrl ?? BUILD_BASE_URL).toString(), true);
}

export interface SourceResolver {
  /** The archive regions of this kind are cut from, right now. */
  resolve(tileType: MapTileType, signal?: AbortSignal): Promise<TileSource>;
}

export interface SourceResolverOptions {
  client: HttpClient;
  /** Reads the `maps.tileSource` and `maps.terrainSource` settings. */
  setting(key: "maps.tileSource" | "maps.terrainSource"): string;
  buildsUrl?: string;
  baseUrl?: string;
  /** How long the newest build is remembered before the list is read again. */
  cacheMs?: number;
}

export function createSourceResolver(options: SourceResolverOptions): SourceResolver {
  let newest: { source: TileSource; at: number } | undefined;
  const cacheMs = options.cacheMs ?? 10 * 60_000;

  return {
    async resolve(tileType, signal) {
      if (tileType === "terrain") {
        const url = options.setting("maps.terrainSource").trim();
        if (!url) throw badRequest("No terrain source is set. Add one under Settings, Maps.");
        return describe(url, false);
      }
      const override = options.setting("maps.tileSource").trim();
      if (override) return describe(override, false);
      if (!newest || Date.now() - newest.at > cacheMs) {
        newest = {
          source: await fetchNewestBuild(options.client, { buildsUrl: options.buildsUrl, baseUrl: options.baseUrl, signal }),
          at: Date.now(),
        };
      }
      return newest.source;
    },
  };
}

/** Today as "YYYYMMDD" (UTC), for naming files whose source has no build day. */
export function todayStamp(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10).replaceAll("-", "");
}
