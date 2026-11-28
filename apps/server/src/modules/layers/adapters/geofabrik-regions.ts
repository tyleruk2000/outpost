/**
 * Geofabrik's list of extracts, as regions a person can choose: each country, and under it
 * the parts Geofabrik publishes it in (the United States' states, Germany's Länder and
 * their Regierungsbezirke, England's counties, Italy's five parts).
 *
 * The list is Geofabrik's own index (`index-v1-nogeom.json`, about 500 kB, documented at
 * https://download.geofabrik.de/technical.html). It is read only when a person presses for
 * it and kept in the data directory with the day it was read; choosing a region afterwards
 * asks nothing. The index gives each file's address but not its size: the size is asked
 * with one HEAD request when the person presses Show the size.
 *
 * How the index is shaped, as read on 17 November 2026: every entry has an `id`, a
 * `parent` (the next larger extract) and `urls.pbf`; a country has `iso3166-1:alpha2`.
 * The United States' states are not children of `us`: their parent is `north-america`,
 * their id `us/<state>` and their name the same (`us/ohio`), with `iso3166-2` (`US-OH`).
 * So a part belongs to a country by its parent, or by the country code its `iso3166-2`
 * begins with, and a name with a slash in it is made from the id's last part.
 */
import fs from "node:fs";
import path from "node:path";
import type { ReferenceRegionDto, ReferenceRegionsResponse } from "@outpost/shared";
import type { AppContext } from "../../../core/context.ts";
import type { HttpClient } from "../../../core/http.ts";
import { countryOfPoint } from "../borders.ts";
import { COUNTRIES } from "../countries.ts";
import { foldName } from "../store.ts";
import { fetchText } from "./http.ts";

export const GEOFABRIK_BASE = "https://download.geofabrik.de";
export const INDEX_PATH = "index-v1-nogeom.json";
/** The index was 512,389 bytes on 17 November 2026; this leaves it room to grow. */
const MAX_INDEX_BYTES = 8 * 1048576;

/** An extract as the server keeps it: with its file's address, which the browser does not need. */
export interface GeofabrikRegion extends ReferenceRegionDto {
  pbf: string;
  /** Its ISO 3166-2 codes, as the index gives them ("US-OH"): a town's division is matched by them. Absent in a list kept before they were. */
  sub?: string[];
}

interface KeptIndex {
  readAt: number;
  source: string;
  regions: GeofabrikRegion[];
}

const SMALL_WORDS = new Set(["of", "and", "the", "de", "du", "des", "la", "le", "di", "del"]);

/** A name from an id's last part: `new-york` is "New York", `us-virgin-islands` "US Virgin Islands". */
export function nameFromId(id: string): string {
  const last = id.split("/").at(-1) ?? id;
  return last
    .split("-")
    .filter(Boolean)
    .map((word, index) => (word === "us" ? "US" : index > 0 && SMALL_WORDS.has(word) ? word : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(" ");
}

/** The address a stand-in base gives a file, for tests; Geofabrik's own otherwise. */
function allowedFile(url: unknown, base: URL): string | null {
  if (typeof url !== "string") return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== base.protocol || parsed.host !== base.host) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

/**
 * Countries and their parts from the index's text. A country is an entry with a country
 * code and no subdivision code; its parts are found by parent and by subdivision code, and
 * theirs by parent. Entries that belong to no country (continents, "US Midwest", "Great
 * Britain", which the United Kingdom's entry covers) are left out.
 */
export function readRegions(text: string, base = GEOFABRIK_BASE): GeofabrikRegion[] {
  const origin = new URL(base);
  const parsed = JSON.parse(text) as { features?: Array<{ properties?: Record<string, unknown> }> };
  type Entry = { id: string; name: string; parent: string | null; alpha2: string[]; sub: string[]; pbf: string };
  const entries: Entry[] = [];
  for (const feature of parsed.features ?? []) {
    const p = feature.properties ?? {};
    const pbf = allowedFile((p.urls as Record<string, unknown> | undefined)?.pbf, origin);
    if (typeof p.id !== "string" || !/^[a-z0-9/-]{1,80}$/.test(p.id) || !pbf) continue;
    // Geofabrik has given these codes as a list (["PS", "IL"]) and as text ("PS,IL", "FR"): take either.
    const codes = (value: unknown) =>
      (typeof value === "string" ? value.split(",") : Array.isArray(value) ? value : [])
        .map((code) => (typeof code === "string" ? code.trim() : code))
        .filter((code): code is string => typeof code === "string" && code.length > 0)
        .map((code) => code.toUpperCase());
    const given = typeof p.name === "string" ? p.name.trim().slice(0, 120) : "";
    entries.push({
      id: p.id,
      name: !given || given.includes("/") ? nameFromId(p.id) : given,
      parent: typeof p.parent === "string" ? p.parent : null,
      alpha2: codes(p["iso3166-1:alpha2"]),
      sub: codes(p["iso3166-2"]),
      pbf,
    });
  }
  const children = new Map<string, Entry[]>();
  for (const entry of entries) if (entry.parent) children.set(entry.parent, [...(children.get(entry.parent) ?? []), entry]);
  const countries = entries.filter((entry) => entry.alpha2.length > 0 && entry.sub.length === 0);
  const countryNames = new Map(COUNTRIES.map((country) => [country.code, country.name]));
  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, "en");
  const out: GeofabrikRegion[] = [];
  const seen = new Set<string>();
  const add = (entry: Entry, country: string, parent: string | null, depth: number) => {
    if (seen.has(entry.id) || depth > 3) return;
    seen.add(entry.id);
    out.push({
      id: entry.id,
      name: entry.name,
      country,
      parent,
      depth,
      pbf: entry.pbf,
      ...(entry.sub.length > 0 ? { sub: entry.sub } : {}),
    });
    for (const child of [...(children.get(entry.id) ?? [])].sort(byName)) add(child, country, entry.id, depth + 1);
  };
  const named = countries.map((entry) => ({
    ...entry,
    // One country code: Natural Earth's English name; several (Israel and Palestine): Geofabrik's.
    name: entry.alpha2.length === 1 ? (countryNames.get(entry.alpha2[0]!) ?? entry.name) : entry.name,
  }));
  for (const country of named.sort(byName)) {
    const code = country.alpha2[0]!;
    seen.add(country.id);
    out.push({ id: country.id, name: country.name, country: code, parent: null, depth: 0, pbf: country.pbf });
    const parts = [
      ...(children.get(country.id) ?? []),
      // The United States' states: under north-america in the index, US-.. by their codes.
      ...entries.filter((entry) => entry.parent !== country.id && entry.sub.some((sub) => sub.startsWith(`${code}-`))),
    ].sort(byName);
    for (const part of parts) add(part, code, country.id, 1);
  }
  return out;
}

const keptFile = (ctx: AppContext) => path.join(ctx.config.dataDir, "reference", "geofabrik-index.json");

export interface RegionIndex {
  /** The list as kept, or null before a person has asked for it. */
  kept(): KeptIndex | null;
  /** Reads the list from Geofabrik (one request, on a press) and keeps it. */
  refresh(signal?: AbortSignal): Promise<KeptIndex>;
  find(id: string): GeofabrikRegion | undefined;
  response(suggested: ReferenceRegionsResponse["suggested"]): ReferenceRegionsResponse;
  base: string;
}

export function createRegionIndex(ctx: AppContext, client: HttpClient): RegionIndex {
  const base = (ctx.config.geofabrikUrl ?? GEOFABRIK_BASE).replace(/\/$/, "");
  let cache: KeptIndex | null | undefined;
  const kept = (): KeptIndex | null => {
    if (cache !== undefined) return cache;
    try {
      const data = JSON.parse(fs.readFileSync(keptFile(ctx), "utf8")) as KeptIndex;
      cache = Array.isArray(data.regions) && typeof data.readAt === "number" ? data : null;
    } catch {
      cache = null;
    }
    return cache;
  };
  return {
    base,
    kept,
    async refresh(signal) {
      const source = `${base}/${INDEX_PATH}`;
      const regions = readRegions(await fetchText(client, source, { max: MAX_INDEX_BYTES, signal }), base);
      if (regions.length === 0) throw new Error("Geofabrik's list held no extracts Outpost could use.");
      const data: KeptIndex = { readAt: Date.now(), source, regions };
      const file = keptFile(ctx);
      await fs.promises.mkdir(path.dirname(file), { recursive: true });
      await fs.promises.writeFile(`${file}.tmp`, JSON.stringify(data));
      await fs.promises.rename(`${file}.tmp`, file);
      cache = data;
      return data;
    },
    find(id) {
      return kept()?.regions.find((region) => region.id === id);
    },
    response(suggested) {
      const data = kept();
      return {
        held: data !== null,
        readAt: data?.readAt ?? null,
        source: data?.source ?? `${base}/${INDEX_PATH}`,
        regions: (data?.regions ?? []).map(({ pbf: _pbf, sub: _sub, ...region }) => region),
        suggested,
      };
    },
  };
}

/** The country whose outline holds a point (`layers/borders.ts`): the country a home place is in. */
export function countryAt(lat: number, lon: number): string | null {
  return countryOfPoint(lat, lon);
}

/** A region of a country whose name is one of `names` (as Natural Earth's regions layer gives them), folded. */
export function regionNamed(regions: ReferenceRegionDto[], country: string, names: string[]): ReferenceRegionDto | undefined {
  const wanted = new Set(names.map(foldName).filter(Boolean));
  return regions.find((region) => region.country === country && region.depth > 0 && wanted.has(foldName(region.name)));
}
