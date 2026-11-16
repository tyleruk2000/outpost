/**
 * Finding Sentinel-2 scenes of an area, through the publisher's own search service.
 *
 * Element 84's Earth Search is the STAC catalogue of the public Sentinel-2 bucket on AWS.
 * One search is made per press of "Find pictures": the area, a span of dates, and the
 * least cloudy first. Scenes taken by the same satellite on the same day are one pass
 * along one orbit, and are put together, so that an area across the edge of two scenes
 * is still one picture of one moment.
 */
import type { Bbox, SceneOption } from "@outpost/shared";
import { z } from "zod";
import { AppError, classifyNetworkError } from "../../../core/errors.ts";
import type { HttpClient } from "../../../core/http.ts";
import { hostOf } from "../source.ts";
import { SENTINEL_HOST, STAC_COLLECTION, STAC_SEARCH_URL } from "./catalogue.ts";

const band = z.object({ scale: z.number().optional(), offset: z.number().optional(), nodata: z.number().optional() }).passthrough();
const asset = z.object({ href: z.string(), "raster:bands": z.array(band).optional() }).passthrough();

export const sceneSchema = z.object({
  id: z.string().min(1).max(200),
  datetime: z.string(),
  platform: z.string(),
  cloudCover: z.number(),
  epsg: z.number().int(),
  /** Outline of the scene's data, as [lon, lat] rings (the first ring of each polygon). */
  footprint: z.array(z.array(z.tuple([z.number(), z.number()]))),
  bands: z.object({
    red: z.string(),
    green: z.string(),
    blue: z.string(),
    scl: z.string().optional(),
  }),
  /** reflectance = value × scale + offset, as the publisher's metadata gives it. */
  scale: z.number(),
  offset: z.number(),
});
export type Scene = z.infer<typeof sceneSchema>;

const itemSchema = z
  .object({
    id: z.string(),
    geometry: z.object({ type: z.string(), coordinates: z.unknown() }),
    properties: z
      .object({
        datetime: z.string(),
        platform: z.string().optional(),
        "eo:cloud_cover": z.number().optional(),
        "proj:epsg": z.number().optional(),
      })
      .passthrough(),
    assets: z.record(z.string(), asset),
  })
  .passthrough();

const responseSchema = z.object({ features: z.array(z.unknown()) }).passthrough();

/** The first ring of every polygon of a GeoJSON geometry. */
function ringsOf(geometry: { type: string; coordinates: unknown }): Array<Array<[number, number]>> {
  const polygons =
    geometry.type === "Polygon" ? [geometry.coordinates] : geometry.type === "MultiPolygon" ? (geometry.coordinates as unknown[]) : [];
  const rings: Array<Array<[number, number]>> = [];
  for (const polygon of polygons) {
    const outer = (polygon as unknown[])?.[0] as Array<[number, number]> | undefined;
    if (Array.isArray(outer) && outer.length >= 4) rings.push(outer.map(([lon, lat]) => [Number(lon), Number(lat)]));
  }
  return rings;
}

/** A STAC item as a scene Outpost can use, or undefined if it lacks something needed. */
export function sceneOf(raw: unknown, host: string = SENTINEL_HOST): Scene | undefined {
  const parsed = itemSchema.safeParse(raw);
  if (!parsed.success) return undefined;
  const item = parsed.data;
  const red = item.assets.red;
  const green = item.assets.green;
  const blue = item.assets.blue;
  const epsg = item.properties["proj:epsg"];
  if (!red || !green || !blue || epsg === undefined) return undefined;
  const hrefs = [red.href, green.href, blue.href, item.assets.scl?.href].filter((href): href is string => Boolean(href));
  // Only the public bucket is ever read, whatever an answer says.
  // (Plain http only for a stand-in on this computer, in tests.)
  const local = host === "127.0.0.1" || host === "localhost";
  if (!hrefs.every((href) => (href.startsWith("https://") || (local && href.startsWith("http://"))) && hostOf(href) === host))
    return undefined;
  const conversion = red["raster:bands"]?.[0];
  const footprint = ringsOf(item.geometry);
  if (footprint.length === 0) return undefined;
  return {
    id: item.id,
    datetime: item.properties.datetime,
    platform: item.properties.platform ?? "sentinel-2",
    cloudCover: item.properties["eo:cloud_cover"] ?? 100,
    epsg,
    footprint,
    bands: { red: red.href, green: green.href, blue: blue.href, ...(item.assets.scl ? { scl: item.assets.scl.href } : {}) },
    scale: conversion?.scale ?? 0.0001,
    offset: conversion?.offset ?? 0,
  };
}

function inRing(lon: number, lat: number, ring: Array<[number, number]>): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function sceneCovers(scene: Pick<Scene, "footprint">, lon: number, lat: number): boolean {
  return scene.footprint.some((ring) => inRing(lon, lat, ring));
}

/** Percent of the box covered by any of the scenes, from a 24 × 24 grid of points. */
export function coveragePercent(scenes: Array<Pick<Scene, "footprint">>, bbox: Bbox): number {
  const [west, south, east, north] = bbox;
  const steps = 24;
  let hit = 0;
  for (let i = 0; i < steps; i += 1) {
    for (let j = 0; j < steps; j += 1) {
      const lon = west + ((i + 0.5) / steps) * (east - west);
      const lat = south + ((j + 0.5) / steps) * (north - south);
      if (scenes.some((scene) => sceneCovers(scene, lon, lat))) hit += 1;
    }
  }
  return Math.round((hit / (steps * steps)) * 100);
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "12 July 2026" from "2026-07-12". */
export function dayText(date: string): string {
  const [year, month, day] = date.split("-").map(Number) as [number, number, number];
  return `${day} ${MONTHS[month - 1]} ${year}`;
}

/** Scenes grouped into passes: one satellite, one day. The least cloudy first, the ones that cover the area before the rest. */
export function passesOf(scenes: Scene[], bbox: Bbox): Array<SceneOption & { scenes: Scene[] }> {
  const groups = new Map<string, Scene[]>();
  for (const scene of scenes) {
    const key = `${scene.datetime.slice(0, 10)}|${scene.platform}`;
    groups.set(key, [...(groups.get(key) ?? []), scene]);
  }
  const options = [...groups.values()].map((group) => {
    // Least cloudy first: where scenes overlap, the less cloudy one is used.
    group.sort((a, b) => a.cloudCover - b.cloudCover || a.id.localeCompare(b.id));
    const date = group[0]!.datetime.slice(0, 10);
    // Scenes of the pass that touch the area; one that adds nothing is left out.
    const used: Scene[] = [];
    for (const scene of group) {
      if (coveragePercent([...used, scene], bbox) > coveragePercent(used, bbox)) used.push(scene);
    }
    const chosen = used.length > 0 ? used : group.slice(0, 1);
    return {
      key: chosen.map((scene) => scene.id).join(","),
      date,
      dateText: dayText(date),
      platform: chosen[0]!.platform,
      sceneIds: chosen.map((scene) => scene.id),
      sceneCloudPercent: Math.round(Math.max(...chosen.map((scene) => scene.cloudCover)) * 10) / 10,
      coveragePercent: coveragePercent(chosen, bbox),
      scenes: chosen,
    };
  });
  options.sort(
    (a, b) =>
      Number(b.coveragePercent >= 99) - Number(a.coveragePercent >= 99) ||
      a.sceneCloudPercent - b.sceneCloudPercent ||
      b.date.localeCompare(a.date),
  );
  return options;
}

export interface StacSearch {
  bbox: Bbox;
  from: string;
  to: string;
  /** Scenes more cloudy than this, over the whole scene, are not asked for. */
  maxCloud: number;
  limit: number;
}

/** One search of the catalogue. */
export async function searchScenes(
  client: HttpClient,
  search: StacSearch,
  options: { url?: string; host?: string; signal?: AbortSignal } = {},
): Promise<Scene[]> {
  const url = options.url ?? STAC_SEARCH_URL;
  const body = {
    collections: [STAC_COLLECTION],
    bbox: search.bbox,
    datetime: `${search.from}T00:00:00Z/${search.to}T23:59:59Z`,
    query: { "eo:cloud_cover": { lte: search.maxCloud } },
    sortby: [{ field: "properties.eo:cloud_cover", direction: "asc" }],
    limit: search.limit,
  };
  let json: unknown;
  try {
    const { response } = await client.fetch(url, {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json", accept: "application/geo+json, application/json" },
      allowedHosts: [hostOf(url)],
      signal: options.signal,
    });
    if (response.status === 429 || response.status === 503) {
      await response.body?.cancel().catch(() => undefined);
      throw new AppError("upstream", "The Sentinel-2 search service is busy. Try again in a minute.");
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw new AppError("upstream", `The Sentinel-2 search service answered with an error (HTTP ${response.status}). Try again later.`);
    }
    json = await response.json();
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (classifyNetworkError(error) === "offline") {
      throw new AppError(
        "offline",
        "Outpost could not reach the Sentinel-2 search service. Finding pictures needs an internet connection.",
      );
    }
    throw new AppError("upstream", "The Sentinel-2 search service could not be read. Try again later.");
  }
  const parsed = responseSchema.safeParse(json);
  if (!parsed.success) throw new AppError("upstream", "The Sentinel-2 search service answered in a form Outpost does not understand.");
  return parsed.data.features.map((feature) => sceneOf(feature, options.host)).filter((scene): scene is Scene => Boolean(scene));
}
