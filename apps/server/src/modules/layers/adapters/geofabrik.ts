/**
 * OpenStreetMap for a country, or a part of one (a US state, a German Land, an English
 * county), from a Geofabrik extract (`.osm.pbf`), or from such a file the person brings.
 * The file holds everything mapped there; the reference layers' tags are read from it
 * (pbf.ts). Geofabrik publishes an MD5 beside each file, which is fetched with the
 * estimate and checked before the file is read.
 *
 * Regions come from Geofabrik's own list (geofabrik-regions.ts), read on a press and kept.
 * One file serves every layer it is read for, so a household that fetches a state for its
 * shops can have its hospitals from the same download.
 *
 * What is kept afterwards: a country's extract for the five layers is kept, as it always
 * was. For a region, or when food and supplies is read, the default is to keep only the
 * places read out and delete the file (service.ts), since a state's file is hundreds of
 * megabytes of which the places are a few; the person can choose to keep it.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import type { ReferenceEstimateItem } from "@outpost/shared";
import { AppError } from "../../../core/errors.ts";
import { PermanentJobError } from "../../../core/jobs.ts";
import { countryOf } from "../countries.ts";
import { PROVIDERS } from "../providers.ts";
import type { AdapterDeps, EstimatedItem, ReferenceAdapter } from "../types.ts";
import { GEOFABRIK_BASE, INDEX_PATH, type RegionIndex } from "./geofabrik-regions.ts";
import { fetchText, headSize } from "./http.ts";
import { addOsm } from "./osm-read.ts";
import { EXTRACT_LAYERS, OSM_LAYERS, type OsmLayer } from "./osm-tags.ts";
import { readPbf, wantedFor } from "./pbf.ts";

export const GEOFABRIK_INDEX = `${GEOFABRIK_BASE}/${INDEX_PATH}`;
const provider = PROVIDERS.find((entry) => entry.id === "osm-extract")!;

/**
 * Places in a megabyte of extract, at most, for the database's allowance. Worked out from
 * Monaco's extract of 16 November 2026 (708,123 bytes: 84 places of food and supplies, 23
 * of the other five layers), a city state: a region with countryside holds fewer a megabyte.
 */
const FOOD_PER_MB = 120;
const OTHERS_PER_MB = 35;
const DATABASE_BYTES_PER_RECORD = 700;
export const COVERAGE_OSM_ONLY = "OpenStreetMap only: likely to be fuller in towns than in the country.";
export const COVERAGE_UK =
  "OpenStreetMap; in the United Kingdom the Food Standards Agency's list can be added for the area on screen, which holds more of the shops.";

interface IndexEntry {
  id: string;
  name: string;
  alpha2: string[];
  subdivision: boolean;
  pbf: string;
}

export function readGeofabrikIndex(text: string, base = GEOFABRIK_BASE): IndexEntry[] {
  const origin = new URL(base);
  const parsed = JSON.parse(text) as { features?: Array<{ properties?: Record<string, unknown> }> };
  const entries: IndexEntry[] = [];
  for (const feature of parsed.features ?? []) {
    const p = feature.properties ?? {};
    const urls = p.urls as Record<string, unknown> | undefined;
    const alpha2 = p["iso3166-1:alpha2"];
    if (typeof p.id !== "string" || typeof urls?.pbf !== "string" || !Array.isArray(alpha2)) continue;
    let pbf: URL;
    try {
      pbf = new URL(urls.pbf);
    } catch {
      continue;
    }
    if (pbf.protocol !== origin.protocol || pbf.host !== origin.host) continue;
    entries.push({
      id: p.id,
      name: typeof p.name === "string" ? p.name : p.id,
      alpha2: alpha2.filter((code): code is string => typeof code === "string").map((code) => code.toUpperCase()),
      subdivision: Array.isArray(p["iso3166-2"]) && (p["iso3166-2"] as unknown[]).length > 0,
      pbf: pbf.toString(),
    });
  }
  return entries;
}

export async function md5File(filePath: string, signal?: AbortSignal): Promise<string> {
  const hash = crypto.createHash("md5");
  for await (const chunk of fs.createReadStream(filePath, { highWaterMark: 1 << 20, signal })) hash.update(chunk as Buffer);
  return hash.digest("hex");
}

/** The most the database is likely to hold for a file of this size read for these layers. */
export function databaseAllowance(bytes: number, layers: string[]): number {
  const mb = bytes / 1048576;
  const others = layers.some((layer) => layer !== "food");
  const records = mb * ((layers.includes("food") ? FOOD_PER_MB : 0) + (others ? OTHERS_PER_MB : 0));
  return Math.round(records * DATABASE_BYTES_PER_RECORD);
}

const layerWords = (layers: string[]) => {
  const names: Record<string, string> = {
    food: "food and supplies",
    military: "military sites",
    nuclear: "nuclear facilities",
    hospitals: "hospitals",
    emergency: "police, fire and ambulance",
    shelters: "shelters and assembly points",
  };
  const words = layers.map((layer) => names[layer] ?? layer);
  return words.length <= 1 ? (words[0] ?? "") : `${words.slice(0, -1).join(", ")} and ${words.at(-1)}`;
};

export function createGeofabrikAdapter({ client }: AdapterDeps, regions: RegionIndex): ReferenceAdapter {
  const base = regions.base;
  const asked = (layers: string[] | undefined) =>
    (layers?.length ? layers : OSM_LAYERS).filter((layer): layer is OsmLayer => (EXTRACT_LAYERS as string[]).includes(layer));

  async function sized(url: string, signal?: AbortSignal) {
    const head = await headSize(client, url, signal);
    // The MD5 of the dated file the size is for, not of whatever "latest" is a moment later.
    const md5 = /^([0-9a-f]{32})\b/i.exec((await fetchText(client, `${head.finalUrl}.md5`, { max: 4096, signal })).trim())?.[1];
    // The dated address the "latest" one leads to, so that resuming fetches the same file, and its MD5.
    return { head, extra: { url: head.finalUrl, ...(md5 ? { md5: md5.toLowerCase() } : {}) } };
  }

  return {
    provider,
    async estimate(request, signal) {
      const layers = asked(request.layers);
      const ids = request.scope.regions ?? [];
      const items: EstimatedItem[] = [];
      const notes: string[] = [];
      if (ids.length > 0) {
        if (ids.length > 3) throw new AppError("bad_request", "Choose at most three regions at a time: each is a separate file.");
        if (!regions.kept()) throw new AppError("bad_request", "Read Geofabrik's list of regions first: press “Read the list of regions”.");
        for (const id of ids) {
          const region = regions.find(id);
          if (!region) {
            notes.push(`“${id}” is not in Geofabrik's list as read on this device. Read the list again.`);
            continue;
          }
          const parents: string[] = [];
          for (let at = region.parent ? regions.find(region.parent) : undefined; at; at = at.parent ? regions.find(at.parent) : undefined)
            parents.push(at.name);
          const { head, extra } = await sized(region.pbf, signal);
          const bytes = head.bytes ?? 0;
          items.push({
            key: `geofabrik:${region.id}:${region.country ?? ""}`,
            title: `OpenStreetMap: ${[region.name, ...parents].join(", ")} (Geofabrik)`,
            layers,
            bytes,
            exact: head.bytes !== null,
            basis: `The size Geofabrik's server gives for today's file, which holds all of OpenStreetMap for ${region.name}. Read from it: ${layerWords(layers)}. ${region.country === "GB" ? COVERAGE_UK : COVERAGE_OSM_ONLY}`,
            records: null,
            host: new URL(region.pbf).host,
            replaces: null,
            databaseBytes: databaseAllowance(bytes, layers),
            fileKeptByDefault: false,
            extra: { ...extra, region: region.id, name: region.name },
          });
        }
      } else {
        const countries = request.scope.countries ?? [];
        if (countries.length === 0) throw new AppError("bad_request", "Geofabrik's extracts are by country or region: choose one.");
        if (countries.length > 3) throw new AppError("bad_request", "Choose at most three countries at a time: each is a separate file.");
        const index = readGeofabrikIndex(await fetchText(client, `${base}/${INDEX_PATH}`, { max: 8 * 1048576, signal }), base);
        for (const code of countries) {
          const entry = index.find((candidate) => candidate.alpha2.includes(code) && !candidate.subdivision);
          if (!entry) {
            notes.push(`Geofabrik has no extract for ${countryOf(code)?.name ?? code} on its own.`);
            continue;
          }
          const { head, extra } = await sized(entry.pbf, signal);
          const bytes = head.bytes ?? 0;
          items.push({
            key: `geofabrik:${entry.id}:${code}`,
            title: `OpenStreetMap extract: ${entry.name} (Geofabrik)`,
            layers,
            bytes,
            exact: head.bytes !== null,
            basis:
              "The size Geofabrik's server gives for today's file. The whole of OpenStreetMap for the country is downloaded; only the chosen layers are read from it.",
            records: null,
            host: new URL(entry.pbf).host,
            replaces: null,
            databaseBytes: databaseAllowance(bytes, layers),
            // As before for the five layers; a country's shops make the file's other contents no more useful to keep.
            fileKeptByDefault: !layers.includes("food"),
            extra,
          });
        }
      }
      if (items.length > 0)
        notes.push(
          "Geofabrik asks that its files be downloaded responsibly: each is fetched once, on your press, never again by itself, and its MD5 checked before it is read.",
        );
      return { items, notes };
    },
    download(request, item) {
      const [, id, code] = item.key.split(":");
      const extra = (item as EstimatedItem).extra;
      const url = extra?.url;
      const md5 = extra?.md5;
      if (!id || !url) throw new AppError("bad_request", "Estimate again before downloading.");
      const region = extra?.region;
      const layers = asked(request.layers);
      return {
        url,
        // To the second, so that fetching a region again the same day does not meet the last file.
        relPath: `collections/reference/osm-extract/${id.replace(/[^a-z0-9-]/gi, "-")}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.osm.pbf`,
        sizeBytes: item.bytes || undefined,
        allowedHosts: [new URL(url).hostname],
        meta: {
          sourceUrl: url,
          ...(md5 ? { md5 } : {}),
          countries: code ? [code] : [],
          // A region's box comes from the file's own header when it is read.
          bbox: region ? null : (countryOf(code ?? "")?.bbox ?? null),
          layers,
          // Each pack updates on its own: its request names only its own region or country.
          request: { ...request, layers, scope: region ? { regions: [region] } : { countries: code ? [code] : [] } },
          ...(region ? { options: { region, regionName: extra?.name ?? region } } : {}),
        },
      };
    },
    async read({ filePath, meta, sink, signal, progress }) {
      if (meta.md5) {
        progress(0, null, "Checking the file against Geofabrik's MD5");
        const actual = await md5File(filePath, signal);
        if (actual !== meta.md5.toLowerCase()) {
          throw new PermanentJobError(
            "The file does not match the MD5 Geofabrik published for it: it was changed or damaged on the way. Remove the download and fetch it again.",
          );
        }
      }
      const layers = new Set(meta.layers.filter((layer): layer is OsmLayer => (EXTRACT_LAYERS as string[]).includes(layer)));
      const country = meta.countries.length === 1 ? meta.countries[0]! : null;
      let stamp: string | null = null;
      // The box of what was read, for a file whose header gives none.
      const seen: [number, number, number, number] = [180, 90, -180, -90];
      const { header } = await readPbf(filePath, {
        signal,
        onHeader: (found) => {
          stamp = found.timestamp?.slice(0, 10) ?? null;
        },
        wanted: wantedFor(layers),
        onSkip: (reason) => sink.skip(reason),
        onObject: async (object) => {
          if (await addOsm(sink, object, { layers, country, publishedAt: stamp ? `Map data as of ${stamp}` : null })) {
            seen[0] = Math.min(seen[0], object.lon);
            seen[1] = Math.min(seen[1], object.lat);
            seen[2] = Math.max(seen[2], object.lon);
            seen[3] = Math.max(seen[3], object.lat);
          }
        },
        progress: (pass, passes, bytes, total) =>
          progress(bytes, total, `Reading the extract, pass ${pass} of ${passes}: ${sink.count.toLocaleString("en-GB")} places so far`),
      });
      const notes =
        meta.options?.region && layers.has("food") ? [meta.countries[0] === "GB" ? COVERAGE_UK : COVERAGE_OSM_ONLY] : undefined;
      return { version: stamp, publishedAt: stamp, countries: meta.countries, bbox: header.bbox ?? meta.bbox ?? (seen[0] <= seen[2] ? seen : null), ...(notes ? { notes } : {}) };
    },
  };
}
