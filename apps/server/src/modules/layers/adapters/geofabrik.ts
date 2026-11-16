/**
 * OpenStreetMap for one country from a Geofabrik extract (`.osm.pbf`), or from such a
 * file the person brings. The file holds everything mapped in the country; the reference
 * layers' tags are read from it (pbf.ts). Geofabrik publishes an MD5 beside each file,
 * which is fetched with the estimate and checked before the file is read.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import type { ReferenceEstimateItem } from "@outpost/shared";
import { AppError } from "../../../core/errors.ts";
import { PermanentJobError } from "../../../core/jobs.ts";
import { countryOf } from "../countries.ts";
import { PROVIDERS } from "../providers.ts";
import type { AdapterDeps, EstimatedItem, ReferenceAdapter } from "../types.ts";
import { fetchText, headSize } from "./http.ts";
import { addOsm } from "./osm-read.ts";
import { OSM_LAYERS, type OsmLayer } from "./osm-tags.ts";
import { readPbf, wantedForLayers } from "./pbf.ts";

export const GEOFABRIK_INDEX = "https://download.geofabrik.de/index-v1-nogeom.json";
const provider = PROVIDERS.find((entry) => entry.id === "osm-extract")!;

interface IndexEntry {
  id: string;
  name: string;
  alpha2: string[];
  subdivision: boolean;
  pbf: string;
}

export function readGeofabrikIndex(text: string): IndexEntry[] {
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
    if (pbf.protocol !== "https:" || pbf.hostname !== "download.geofabrik.de") continue;
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

export function createGeofabrikAdapter({ client }: AdapterDeps): ReferenceAdapter {
  return {
    provider,
    async estimate(request, signal) {
      const countries = request.scope.countries ?? [];
      if (countries.length === 0) throw new AppError("bad_request", "Geofabrik's extracts are by country: choose one.");
      if (countries.length > 3) throw new AppError("bad_request", "Choose at most three countries at a time: each is a separate file.");
      const index = readGeofabrikIndex(await fetchText(client, GEOFABRIK_INDEX, { max: 4 * 1048576, signal }));
      const items: ReferenceEstimateItem[] = [];
      const notes: string[] = [];
      const layers = (request.layers?.length ? request.layers : OSM_LAYERS).filter((layer) => (OSM_LAYERS as string[]).includes(layer));
      for (const code of countries) {
        const entry = index.find((candidate) => candidate.alpha2.includes(code) && !candidate.subdivision);
        if (!entry) {
          notes.push(`Geofabrik has no extract for ${countryOf(code)?.name ?? code} on its own.`);
          continue;
        }
        const head = await headSize(client, entry.pbf, signal);
        items.push({
          key: `geofabrik:${entry.id}:${code}`,
          title: `OpenStreetMap extract: ${entry.name} (Geofabrik)`,
          layers,
          bytes: head.bytes ?? 0,
          exact: head.bytes !== null,
          basis:
            "The size Geofabrik's server gives for today's file. The whole of OpenStreetMap for the country is downloaded and kept; only the chosen layers are read from it.",
          records: null,
          host: new URL(entry.pbf).host,
          replaces: null,
        });
        const md5 = /^([0-9a-f]{32})\b/i.exec((await fetchText(client, `${entry.pbf}.md5`, { max: 4096, signal })).trim())?.[1];
        // The dated address the "latest" one leads to, so that resuming fetches the same file, and its MD5.
        (items.at(-1) as EstimatedItem).extra = { url: head.finalUrl, ...(md5 ? { md5: md5.toLowerCase() } : {}) };
      }
      if (items.length > 0)
        notes.push("Geofabrik asks that its files be downloaded responsibly: each is fetched once, on your press, and its MD5 checked.");
      return { items, notes };
    },
    download(request, item) {
      const [, id, code] = item.key.split(":");
      const url = (item as EstimatedItem).extra?.url;
      const md5 = (item as EstimatedItem).extra?.md5;
      if (!id || !code || !url) throw new AppError("bad_request", "Estimate again before downloading.");
      return {
        url,
        relPath: `collections/reference/osm-extract/${id.replace(/[^a-z0-9-]/gi, "-")}-${new Date().toISOString().slice(0, 10)}.osm.pbf`,
        sizeBytes: item.bytes || undefined,
        allowedHosts: [new URL(url).hostname],
        meta: {
          sourceUrl: url,
          ...(md5 ? { md5 } : {}),
          countries: [code],
          bbox: countryOf(code)?.bbox ?? null,
          layers: request.layers?.length ? request.layers : OSM_LAYERS,
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
      const layers = new Set(meta.layers.filter((layer): layer is OsmLayer => (OSM_LAYERS as string[]).includes(layer)));
      const country = meta.countries.length === 1 ? meta.countries[0]! : null;
      let stamp: string | null = null;
      const { header } = await readPbf(filePath, {
        signal,
        onHeader: (found) => {
          stamp = found.timestamp?.slice(0, 10) ?? null;
        },
        wanted: wantedForLayers,
        onSkip: (reason) => sink.skip(reason),
        onObject: async (object) => {
          await addOsm(sink, object, { layers, country, publishedAt: stamp ? `Map data as of ${stamp}` : null });
        },
        progress: (pass, passes, bytes, total) => progress(bytes, total, `Reading the extract, pass ${pass} of ${passes}`),
      });
      return { version: stamp, publishedAt: stamp, countries: meta.countries, bbox: header.bbox ?? meta.bbox };
    },
  };
}
