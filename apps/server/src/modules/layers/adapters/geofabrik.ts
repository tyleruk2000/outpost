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
import { databaseAllowance } from "@outpost/shared";
import { AppError } from "../../../core/errors.ts";
import { PermanentJobError } from "../../../core/jobs.ts";
import { countryOf } from "../countries.ts";
import { PROVIDERS } from "../providers.ts";
import type { AdapterDeps, EstimatedItem, ReferenceAdapter } from "../types.ts";
import { resolveGeofabrikFile } from "./geofabrik-file.ts";
import { GEOFABRIK_BASE, INDEX_PATH, type RegionIndex } from "./geofabrik-regions.ts";
import { fetchText } from "./http.ts";
import { addOsm } from "./osm-read.ts";
import { EXTRACT_LAYERS, OSM_LAYERS, type OsmLayer } from "./osm-tags.ts";
import { readPbf, wantedFor } from "./pbf.ts";

export const GEOFABRIK_INDEX = `${GEOFABRIK_BASE}/${INDEX_PATH}`;
const provider = PROVIDERS.find((entry) => entry.id === "osm-extract")!;

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
    // Given as a list (["PS", "IL"]) and as text ("PS,IL", "FR") by Geofabrik over time: take either.
    const given = p["iso3166-1:alpha2"];
    const alpha2 =
      typeof given === "string"
        ? given
            .split(",")
            .map((code) => code.trim())
            .filter(Boolean)
        : given;
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
      subdivision:
        (Array.isArray(p["iso3166-2"]) && (p["iso3166-2"] as unknown[]).length > 0) ||
        (typeof p["iso3166-2"] === "string" && p["iso3166-2"].length > 0),
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

const layerWords = (layers: string[]) => {
  const names: Record<string, string> = {
    food: "food and supplies",
    military: "military sites",
    nuclear: "nuclear facilities",
    hospitals: "hospitals",
    emergency: "police, fire and ambulance",
    shelters: "shelters and assembly points",
    routes: "walking and cycling routes",
    "rights-of-way": "rights of way",
  };
  const words = layers.map((layer) => names[layer] ?? layer);
  return words.length <= 1 ? (words[0] ?? "") : `${words.slice(0, -1).join(", ")} and ${words.at(-1)}`;
};

export function createGeofabrikAdapter({ client, ctx }: AdapterDeps, regions: RegionIndex): ReferenceAdapter {
  const base = regions.base;
  const asked = (layers: string[] | undefined) =>
    (layers?.length ? layers : OSM_LAYERS).filter((layer): layer is OsmLayer => (EXTRACT_LAYERS as string[]).includes(layer));

  async function sized(url: string, name: string, signal?: AbortSignal) {
    let file: Awaited<ReturnType<typeof resolveGeofabrikFile>>;
    try {
      // The dated file the "latest" address leads to (or the newest one there is, when that is not there yet), and its own MD5.
      file = await resolveGeofabrikFile(client, url, name, signal);
    } catch (error) {
      // Geofabrik sends its largest files (Germany's on 17 November 2026) from a mirror on another host.
      if (error instanceof AppError && error.code === "forbidden")
        throw new AppError(
          "bad_request",
          `Geofabrik sends ${name}'s file from another server (a mirror), which Outpost does not download from. Choose its parts instead: each is its own, smaller file.`,
        );
      throw error;
    }
    // The download is held to Geofabrik's host on its first request only: the MD5, asked of that host alone, is what checks the bytes.
    return {
      head: { bytes: file.bytes },
      extra: { url: file.url, md5: file.md5, fileName: file.fileName, ...(file.fallback ? { fallback: file.fallback } : {}) },
    };
  }

  /** A country file kept for this region, which is read again rather than downloaded. */
  const keptFor = (regionId: string) => ctx.services.countryFiles?.kept(regionId) ?? null;
  const keptItem = (kept: NonNullable<ReturnType<typeof keptFor>>) => ({
    bytes: 0,
    exact: true,
    host: "",
    basis: `Read from the country file kept on ${kept.locationName}${kept.dataDate ? `, with data from ${kept.dataDate}` : ""}: nothing is downloaded.`,
    extra: { url: kept.sourceUrl, md5: kept.md5 ?? "", fileName: kept.fileName, kept: kept.collectionId },
  });

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
          const kept = keptFor(region.id);
          const coverage = region.country === "GB" ? COVERAGE_UK : COVERAGE_OSM_ONLY;
          if (kept) {
            const item = keptItem(kept);
            items.push({
              key: `geofabrik:${region.id}:${region.country ?? ""}`,
              title: `${[region.name, ...parents].join(", ")}: nearby places`,
              layers,
              ...item,
              basis: `${item.basis} Read from it: ${layerWords(layers)}. ${coverage}`,
              records: null,
              replaces: null,
              databaseBytes: databaseAllowance(kept.bytes, layers),
              fileKeptByDefault: true,
              extra: { ...item.extra, region: region.id, name: region.name },
            });
            continue;
          }
          const { head, extra } = await sized(region.pbf, region.name, signal);
          const bytes = head.bytes ?? 0;
          items.push({
            key: `geofabrik:${region.id}:${region.country ?? ""}`,
            title: `${[region.name, ...parents].join(", ")}: nearby places`,
            layers,
            bytes,
            exact: head.bytes !== null,
            basis: `The size Geofabrik's server gives for today's file, which holds all of OpenStreetMap for ${region.name}. Read from it: ${layerWords(layers)}. ${coverage}`,
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
          const kept = keptFor(entry.id);
          if (kept) {
            items.push({
              key: `geofabrik:${entry.id}:${code}`,
              title: `${entry.name}: nearby places`,
              layers,
              ...keptItem(kept),
              records: null,
              replaces: null,
              databaseBytes: databaseAllowance(kept.bytes, layers),
              fileKeptByDefault: true,
              extra: { ...keptItem(kept).extra, name: entry.name },
            });
            continue;
          }
          const { head, extra } = await sized(entry.pbf, entry.name, signal);
          const bytes = head.bytes ?? 0;
          items.push({
            key: `geofabrik:${entry.id}:${code}`,
            title: `${entry.name}: nearby places`,
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
            extra: { ...extra, name: entry.name },
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
      const notes = meta.options?.region && layers.has("food") ? [meta.countries[0] === "GB" ? COVERAGE_UK : COVERAGE_OSM_ONLY] : undefined;
      return {
        version: stamp,
        publishedAt: stamp,
        countries: meta.countries,
        bbox: header.bbox ?? meta.bbox ?? (seen[0] <= seen[2] ? seen : null),
        ...(notes ? { notes } : {}),
      };
    },
  };
}
