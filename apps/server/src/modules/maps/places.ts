/**
 * Offline place search (geocoding) from GeoNames.
 *
 * A dataset is one of GeoNames' zipped, tab-separated dumps: every town over 500
 * people in the world, or everything known about one country. Installing one reads it
 * line by line into the `places` table, whose full-text index answers "find me
 * Ambleside" in a millisecond or two with no network. GeoNames data is CC BY 4.0.
 *
 * Not every feature is kept. A country dump lists farms, wells, sections of streams
 * and administrative odds and ends that only add noise to a map search. What stays:
 *
 *   P  populated places, except abandoned and destroyed ones
 *   T  all landforms: mountains, peaks, passes, hills, valleys, capes, islands
 *   H  named water worth finding: lakes, reservoirs, rivers, bays, fjords, falls, glaciers
 *   L  parks, reserves, forests and named regions
 *   S  a short list of landmarks useful outdoors or for orientation: huts and
 *      shelters, stations, airports, castles, lighthouses, ferries, hospitals, …
 *   A  countries and their first two levels of division, so "Scotland" finds Scotland
 *   V  forests
 */

import type { PlaceDto, PlaceSearchResponse, PlacesDataset } from "@outpost/shared";
import {
  haversineMeters,
  isNorthernIrelandPostcode,
  OS_NAMES_DATASET,
  ownValue,
  parseCoordinateReadings,
  parsePostcode,
} from "@outpost/shared";
import { sql } from "drizzle-orm";
import yauzl from "yauzl";
import { z } from "zod";
import type { AppContext } from "../../core/context.ts";
import { AppError, badRequest, conflict } from "../../core/errors.ts";
import { yieldToEventLoop } from "../../core/event-loop.ts";
import { PermanentJobError } from "../../core/jobs.ts";
import { places } from "../../db/schema.ts";
import type { DownloadRow, Installer } from "../downloads/types.ts";
import { isOsCode, isStreetLevel, osKindLabel, osProminence } from "./os-names/convert.ts";
import { ATTRIBUTIONS } from "./source.ts";

export const GEONAMES_BASE_URL = "https://download.geonames.org/export/dump/";

const INSERT_BATCH = 2_000;
const DELETE_BATCH = 5_000;
/** Alternate names are capped: capitals carry thousands of characters of them. */
const MAX_ALT_NAMES_CHARS = 800;

const SKIPPED_PLACES = new Set(["PPLH", "PPLQ", "PPLW", "PPLCH"]);
const KEPT_WATER = new Set([
  "LK",
  "LKS",
  "LKN",
  "LKSN",
  "LKI",
  "RSV",
  "STM",
  "STMS",
  "STMI",
  "CNL",
  "BAY",
  "BAYS",
  "COVE",
  "FJD",
  "FJDS",
  "FLLS",
  "GLCR",
  "GULF",
  "HBR",
  "INLT",
  "LGN",
  "SEA",
  "SD",
  "STRT",
  "CHN",
  "SPNG",
  "OCN",
  "ESTY",
  "RF",
  "MRSH",
  "LCH",
]);
const KEPT_AREAS = new Set([
  "PRK",
  "RESN",
  "RESF",
  "RESW",
  "RESV",
  "RESP",
  "RESH",
  "RGN",
  "RGNH",
  "AREA",
  "CST",
  "PRT",
  "OAS",
  "CONT",
  "AMUS",
  "MILB",
  "LCTY",
]);
const KEPT_LANDMARKS = new Set([
  "HUT",
  "HUTS",
  "RHSE",
  "CMP",
  "CAVE",
  "RSTN",
  "RSTP",
  "MTRO",
  "BUSTN",
  "AIRP",
  "AIRF",
  "AIRH",
  "AIRB",
  "CSTL",
  "FT",
  "PAL",
  "HSP",
  "LTHSE",
  "FY",
  "BDG",
  "DAM",
  "MNMT",
  "RUIN",
  "ANS",
  "HSTS",
  "MSTY",
  "MUS",
  "OBS",
  "TOWR",
  "MAR",
  "PIER",
  "STDM",
  "WALLA",
]);
const KEPT_ADMIN = new Set(["PCLI", "PCLD", "PCLF", "PCLS", "PCLIX", "TERR", "ADM1", "ADM2"]);
const KEPT_VEGETATION = new Set(["FRST", "FRSTF", "HTH", "MOOR"]);

/** Whether a GeoNames feature is worth having in a map's search box. See the list above. */
export function keepsFeature(featureClass: string, featureCode: string): boolean {
  switch (featureClass) {
    case "P":
      return !SKIPPED_PLACES.has(featureCode);
    case "T":
      return true;
    case "H":
      return KEPT_WATER.has(featureCode);
    case "L":
      return KEPT_AREAS.has(featureCode);
    case "S":
      return KEPT_LANDMARKS.has(featureCode);
    case "A":
      return KEPT_ADMIN.has(featureCode);
    case "V":
      return KEPT_VEGETATION.has(featureCode);
    default:
      return false;
  }
}

const LABELS: Record<string, string> = {
  PPLC: "Capital city",
  PPLX: "Neighbourhood",
  PPLL: "Locality",
  PPLF: "Farm village",
  MT: "Mountain",
  MTS: "Mountains",
  PK: "Peak",
  PKS: "Peaks",
  PASS: "Pass",
  HLL: "Hill",
  HLLS: "Hills",
  VLC: "Volcano",
  RDGE: "Ridge",
  VAL: "Valley",
  GRGE: "Gorge",
  CLF: "Cliff",
  CAPE: "Cape",
  PT: "Point",
  PEN: "Peninsula",
  ISL: "Island",
  ISLS: "Islands",
  BCH: "Beach",
  LK: "Lake",
  LKS: "Lakes",
  RSV: "Reservoir",
  STM: "River",
  STMS: "Rivers",
  CNL: "Canal",
  BAY: "Bay",
  FJD: "Fjord",
  FLLS: "Waterfall",
  GLCR: "Glacier",
  HBR: "Harbour",
  SEA: "Sea",
  STRT: "Strait",
  SPNG: "Spring",
  PRK: "Park",
  RESN: "Nature reserve",
  RESF: "Forest reserve",
  RESW: "Wildlife reserve",
  RGN: "Region",
  FRST: "Forest",
  HUT: "Hut",
  HUTS: "Huts",
  RHSE: "Rest house",
  CMP: "Camp",
  CAVE: "Cave",
  RSTN: "Railway station",
  RSTP: "Railway stop",
  MTRO: "Metro station",
  BUSTN: "Bus station",
  AIRP: "Airport",
  AIRF: "Airfield",
  AIRH: "Heliport",
  CSTL: "Castle",
  FT: "Fort",
  PAL: "Palace",
  HSP: "Hospital",
  LTHSE: "Lighthouse",
  FY: "Ferry",
  BDG: "Bridge",
  DAM: "Dam",
  MNMT: "Monument",
  RUIN: "Ruin",
  ANS: "Ancient site",
  HSTS: "Historic site",
  MSTY: "Monastery",
  MUS: "Museum",
  OBS: "Observatory",
  TOWR: "Tower",
  MAR: "Marina",
  PCLI: "Country",
  ADM1: "Region",
  ADM2: "District",
};
const CLASS_LABELS: Record<string, string> = { P: "Place", T: "Landform", H: "Water", L: "Area", S: "Landmark", A: "Region", V: "Forest" };

export function kindLabelOf(featureClass: string | null, featureCode: string | null, population: number): string {
  const named = featureCode ? ownValue(LABELS, featureCode) : undefined;
  if (named) return named;
  if (featureClass === "P") {
    if (population >= 100_000) return "City";
    if (population >= 10_000) return "Town";
    if (population > 0) return "Village";
    return "Place";
  }
  return (featureClass && ownValue(CLASS_LABELS, featureClass)) || "Place";
}

export const datasetSchema = z
  .object({
    dataset: z.enum(["cities500", "cities15000", "country"]),
    country: z
      .string()
      .trim()
      .regex(/^[A-Za-z]{2}$/, "A country is given by its two-letter code, such as GB or FR.")
      .optional(),
    locationId: z.string().min(1).optional(),
  })
  .refine((value) => value.dataset !== "country" || value.country, {
    message: "Say which country: its two-letter code, such as GB.",
    path: ["country"],
  });

const placesMetaSchema = z.object({
  dataset: z.string().min(1),
  country: z.string().optional(),
  /** An update: the collection this one takes the place of, once it is read in. */
  replaces: z.string().optional(),
});

interface PlaceRow {
  id: number;
  collectionId: string;
  geonameId: number | null;
  name: string;
  asciiName: string;
  altNames: string;
  lat: number;
  lon: number;
  featureClass: string | null;
  featureCode: string | null;
  country: string | null;
  admin1: string | null;
  population: number;
  elevation: number | null;
}

export interface PlacesService {
  startDownload(input: z.infer<typeof datasetSchema>): Promise<DownloadRow>;
  /** Where a GeoNames list comes from ("GB", "cities500"), for a check of its size and date. */
  sourceUrl(dataset: string): string;
  /** Downloads a GeoNames list again; the one held stays, and is searched, until the new one is read in. */
  update(collectionId: string): Promise<DownloadRow>;
  installer: Installer;
  /** `prefer`: countries (two letters) whose places come before others of the same standing: the household's, the map's. */
  search(query: string, options?: { limit?: number; near?: { lat: number; lon: number }; prefer?: string[] }): PlaceSearchResponse;
  datasets(): PlacesDataset[];
  count(): number;
  /** Deletes the rows of one dataset; the full-text index follows through its triggers. */
  removeRows(collectionId: string): Promise<number>;
}

/**
 * Added to the score of a place in a country put first (the household's, the map's): more than
 * the population of a small town gives, less than a capital's, so that Olney in England comes
 * before Olney, Maryland for someone in England, and Paris, France still before a hamlet.
 */
const PREFERRED_COUNTRY = 0.4;

/** Lower case, without accents: how names are compared when ranking. */
function fold(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/** Words of a query as the full-text index sees them. */
export function searchTokens(query: string): string[] {
  return query
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .slice(0, 8);
}

/** Opens the one data file in a GeoNames zip as a stream, with its unpacked size. */
function openDataFile(zipPath: string, preferred: string): Promise<{ stream: NodeJS.ReadableStream; size: number; close(): void }> {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true, autoClose: false }, (openError, zip) => {
      if (openError || !zip) {
        reject(new PermanentJobError("The place names file is not a readable zip archive. Remove the download and try again."));
        return;
      }
      let fallback: yauzl.Entry | undefined;
      const use = (entry: yauzl.Entry) => {
        zip.openReadStream(entry, (streamError, stream) => {
          if (streamError || !stream) {
            zip.close();
            reject(streamError ?? new Error("The place names file could not be opened."));
            return;
          }
          resolve({ stream, size: entry.uncompressedSize, close: () => zip.close() });
        });
      };
      zip.on("entry", (entry: yauzl.Entry) => {
        const name = entry.fileName.toLowerCase();
        if (name === preferred.toLowerCase()) {
          use(entry);
          return;
        }
        // Country zips also carry a readme; the data is the other text file.
        if (name.endsWith(".txt") && !name.includes("readme") && (!fallback || entry.uncompressedSize > fallback.uncompressedSize))
          fallback = entry;
        zip.readEntry();
      });
      zip.on("end", () => {
        if (fallback) use(fallback);
        else {
          zip.close();
          reject(new PermanentJobError("The place names archive has no data file in it."));
        }
      });
      zip.on("error", reject);
      zip.readEntry();
    });
  });
}

export function createPlacesService(ctx: AppContext, options: { baseUrl?: string } = {}): PlacesService {
  const { sqlite, db } = ctx;
  const baseUrl = options.baseUrl ?? ctx.config.geonamesUrl ?? GEONAMES_BASE_URL;

  const insert = sqlite.prepare(
    `INSERT INTO places (collection_id, geoname_id, name, ascii_name, alt_names, lat, lon, feature_class, feature_code, country, admin1, population, elevation)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertBatch = sqlite.transaction((rows: unknown[][]) => {
    for (const row of rows) insert.run(...row);
  });
  const deleteBatch = sqlite.prepare("DELETE FROM places WHERE id IN (SELECT id FROM places WHERE collection_id = ? LIMIT ?)");

  function removeRowsNow(collectionId: string): number {
    let removed = 0;
    for (;;) {
      const { changes } = deleteBatch.run(collectionId, DELETE_BATCH);
      removed += changes;
      if (changes < DELETE_BATCH) return removed;
    }
  }

  async function removeRows(collectionId: string): Promise<number> {
    let removed = 0;
    for (;;) {
      const { changes } = deleteBatch.run(collectionId, DELETE_BATCH);
      removed += changes;
      if (changes < DELETE_BATCH) return removed;
      await yieldToEventLoop();
    }
  }

  /** One line of a GeoNames dump as an insert row, or undefined if it is not kept. */
  function toRow(line: string, collectionId: string, countries: Set<string>): unknown[] | undefined {
    const columns = line.split("\t");
    if (columns.length < 15) return undefined;
    const featureClass = columns[6]!;
    const featureCode = columns[7]!;
    if (!keepsFeature(featureClass, featureCode)) return undefined;
    const name = columns[1]!.trim();
    const lat = Number(columns[4]);
    const lon = Number(columns[5]);
    if (!name || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return undefined;

    const asciiName = columns[2]!.trim();
    let altNames = columns[3]!;
    if (altNames.length > MAX_ALT_NAMES_CHARS) {
      const cut = altNames.lastIndexOf(",", MAX_ALT_NAMES_CHARS);
      altNames = altNames.slice(0, cut > 0 ? cut : MAX_ALT_NAMES_CHARS);
    }
    // The plain-letters spelling goes in with the alternates so "Lodz" finds Łódź: the
    // index strips accents by itself, but ł and ø are letters in their own right.
    if (asciiName && asciiName !== name) altNames = altNames ? `${asciiName},${altNames}` : asciiName;

    const elevation = columns[15] ? Number(columns[15]) : columns[16] && columns[16] !== "-9999" ? Number(columns[16]) : null;
    const country = columns[8] || null;
    if (country) countries.add(country);
    return [
      collectionId,
      Number(columns[0]) || null,
      name,
      asciiName,
      altNames,
      lat,
      lon,
      featureClass,
      featureCode,
      country,
      columns[10] || null,
      Number(columns[14]) || 0,
      elevation !== null && Number.isFinite(elevation) ? Math.round(elevation) : null,
    ];
  }

  /** The list an update replaces, removed once the new one is in: its rows, and its zip where its location is connected. */
  async function retire(oldId: string, newId: string) {
    const old = ctx.services.collections.get(oldId);
    if (!old || old.id === newId || old.kind !== "places") return;
    try {
      await ctx.services.collections.remove(old.id, { deleteFiles: ctx.services.storage.isAvailable(old.locationId) });
    } catch (error) {
      // Both are searched until the old one is removed by hand; nothing is lost.
      ctx.log.warn({ err: error, collection: old.id }, "the place names an update replaced could not be removed");
    }
  }

  const installer: Installer = async ({ download, filePath, sizeBytes, sha256, signal, progress }) => {
    const meta = placesMetaSchema.safeParse(download.meta);
    if (!meta.success) throw new PermanentJobError("This place names download is missing its details. Remove it and start it again.");
    const { dataset } = meta.data;
    // Rows are written under a temporary owner and handed to the collection at the end,
    // so a failed or interrupted import leaves nothing that looks installed.
    const pendingId = `pending:${download.id}`;
    removeRowsNow(pendingId);

    const file = await openDataFile(filePath, `${dataset}.txt`);
    const countries = new Set<string>();
    let count = 0;
    let readBytes = 0;
    try {
      let rest = "";
      let batch: unknown[][] = [];
      const flush = async () => {
        if (batch.length === 0) return;
        insertBatch(batch);
        count += batch.length;
        batch = [];
        progress(readBytes, file.size, `Indexing place names (${count.toLocaleString("en-GB")})`);
        // Each batch is a few milliseconds of database work; let requests in between.
        await yieldToEventLoop();
        signal.throwIfAborted();
      };
      const decoder = new TextDecoder("utf-8");
      for await (const chunk of file.stream) {
        readBytes += (chunk as Buffer).length;
        const lines = (rest + decoder.decode(chunk as Buffer, { stream: true })).split("\n");
        rest = lines.pop() ?? "";
        for (const line of lines) {
          const row = toRow(line, pendingId, countries);
          if (row) batch.push(row);
          if (batch.length >= INSERT_BATCH) await flush();
        }
      }
      const last = toRow(rest + decoder.decode(), pendingId, countries);
      if (last) batch.push(last);
      await flush();
      if (count === 0) throw new PermanentJobError("The place names file had no places Outpost could use.");

      const collection = await ctx.services.collections.create({
        kind: "places",
        title: download.title,
        description: `${count.toLocaleString("en-GB")} places for offline search`,
        category: "Maps",
        publisher: ATTRIBUTIONS.places.name,
        license: ATTRIBUTIONS.places.license,
        attribution: ATTRIBUTIONS.places.html,
        version: new Date().toISOString().slice(0, 10),
        catalogEntryId: download.catalogEntryId,
        locationId: download.locationId,
        relPath: download.relPath,
        sizeBytes,
        sha256,
        meta: { places: { countries: [...countries].sort(), count }, dataset },
      });
      sqlite.prepare("UPDATE places SET collection_id = ? WHERE collection_id = ?").run(collection.id, pendingId);
      // An update: only now, with the new list read in, does the old one go (the person asked for this).
      if (meta.data.replaces) await retire(meta.data.replaces, collection.id);
      ctx.events.publish({ type: "maps.changed" });
      return { collectionId: collection.id };
    } catch (error) {
      await removeRows(pendingId);
      throw error;
    } finally {
      file.close();
    }
  };

  // ── Search ──

  const columns = `p.id AS id, p.collection_id AS collectionId, p.geoname_id AS geonameId, p.name AS name, p.ascii_name AS asciiName, p.alt_names AS altNames,
    p.lat AS lat, p.lon AS lon, p.feature_class AS featureClass, p.feature_code AS featureCode, p.country AS country,
    p.admin1 AS admin1, p.population AS population, p.elevation AS elevation`;
  const from = "FROM places_fts JOIN places p ON p.id = places_fts.rowid WHERE places_fts MATCH ?";
  // Name matches count ten times an alternate-name match, as in the table's column order.
  const byText = sqlite.prepare(`SELECT ${columns} ${from} ORDER BY bm25(places_fts, 10.0, 1.0) LIMIT ?`);
  // OS Open Names gives no population: among its rows, settlements and then other named
  // features come before roads and postcodes, and shorter names (the whole word) first.
  const byPopulation = sqlite.prepare(
    `SELECT ${columns} ${from} ORDER BY p.population DESC, CASE p.feature_class WHEN 'P' THEN 0 WHEN 'R' THEN 2 WHEN 'Z' THEN 2 ELSE 1 END, length(p.name) LIMIT ?`,
  );
  const byDistance = sqlite.prepare(`SELECT ${columns} ${from} ORDER BY (p.lat - ?) * (p.lat - ?) + (p.lon - ?) * (p.lon - ?) * ? LIMIT ?`);

  /**
   * How a row ranks. Three things decide, in this order, so that none can outweigh the
   * one before it: whether the whole name is what was typed (or one of its other names
   * is); whether it is a place, hill or the like rather than a road or postcode, which
   * share their names by the thousand ("Ambleside" is a town and thirty roads); and
   * then a score of how well the text matches, the population, the distance from the
   * middle of the map, the kind of place, and whether it is in a country put first.
   */
  function rankOf(row: PlaceRow, query: string, tokens: string[], near?: { lat: number; lon: number }, prefer?: ReadonlySet<string>) {
    const name = fold(row.name);
    const ascii = fold(row.asciiName);
    const alternates = fold(row.altNames)
      .split(",")
      .map((alternate) => alternate.trim());
    const exact = name === query || ascii === query || alternates.includes(query);
    let text: number;
    if (name === query || ascii === query) text = 1;
    else if (name.startsWith(query) || ascii.startsWith(query)) text = 0.8 + 0.1 * (query.length / Math.max(name.length, 1));
    else {
      const words = `${name} ${ascii}`.split(/[^\p{L}\p{N}]+/u);
      const inName = tokens.every((token) => words.some((word) => word.startsWith(token)));
      if (inName) text = 0.7;
      else if (exact) text = 0.75;
      else text = 0.45;
    }
    // Population on a log scale: ten million people is the top of it.
    const population = Math.min(1, Math.log10(row.population + 1) / 7);
    const distance = near ? 1 / (1 + haversineMeters(near.lat, near.lon, row.lat, row.lon) / 75_000) : 0;
    const prominence = isOsCode(row.featureCode)
      ? osProminence(row.featureCode!)
      : row.featureCode === "PPLC"
        ? 0.1
        : row.featureClass === "P"
          ? 0.05
          : 0;
    return {
      exact,
      street: isOsCode(row.featureCode) && isStreetLevel(row.featureClass),
      score: text + population * 0.6 + distance * 0.8 + prominence + (row.country && prefer?.has(row.country) ? PREFERRED_COUNTRY : 0),
    };
  }

  const toDto = (row: PlaceRow): PlaceDto => ({
    id: row.id,
    source: isOsCode(row.featureCode) ? "os" : "geonames",
    name: row.name,
    country: row.country,
    admin1: row.admin1,
    featureCode: row.featureCode,
    kindLabel: isOsCode(row.featureCode) ? osKindLabel(row.featureCode!) : kindLabelOf(row.featureClass, row.featureCode, row.population),
    lat: row.lat,
    lon: row.lon,
    population: row.population,
    elevation: row.elevation,
  });

  function search(
    query: string,
    searchOptions: { limit?: number; near?: { lat: number; lon: number }; prefer?: string[] } = {},
  ): PlaceSearchResponse {
    const text = query.trim().slice(0, 200);
    // Nearly always one reading or none; a few four-character texts are both a grid reference and a locator.
    const [reading, ...otherReadings] = parseCoordinateReadings(text);
    // A postcode, whole or begun, is looked for as OS writes it ("sy233by" as "SY23 3BY").
    const postcode = parsePostcode(text);
    // Coordinates and grid references are never the name of a place. A locator can be:
    // six characters such as "CB12AB" are also a postcode written without its space, and
    // four such as "IO83" could begin a name. So a locator is offered, and names are
    // looked for as well. So is a postcode district that is also a grid reference: "SY23"
    // is a 10 km square in Dorset and the district of Aberystwyth.
    if (reading && reading.format !== "maidenhead" && !postcode) {
      return { query: text, coordinate: reading, ...(otherReadings.length > 0 ? { otherReadings } : {}), places: [] };
    }
    const coordinate = reading ?? null;
    const others = reading && otherReadings.length > 0 ? { otherReadings } : {};
    const notice = isNorthernIrelandPostcode(postcode)
      ? "Northern Ireland's postcodes (BT) are not in the place names Outpost can download: OS Open Names covers Great Britain only."
      : undefined;
    const sought = postcode ? postcode.canonical : text;
    const tokens = searchTokens(sought).map(fold).filter(Boolean);
    if (tokens.length === 0) return { query: text, coordinate, ...others, places: [] };

    const limit = Math.min(50, Math.max(1, searchOptions.limit ?? 10));
    // Every word must be there; the last may still be being typed, so all match as prefixes.
    const match = tokens.map((token) => `"${token.replaceAll('"', "")}"*`).join(" ");
    const pool = Math.max(60, limit * 6);
    const near = searchOptions.near;
    const prefer = new Set((searchOptions.prefer ?? []).map((code) => code.toUpperCase()));
    // Three views of the matches, because the best answer may be the closest in spelling,
    // the biggest, or the nearest, and no single ordering surfaces all three.
    const found = new Map<number, PlaceRow>();
    const lists: PlaceRow[][] = [byText.all(match, pool) as PlaceRow[], byPopulation.all(match, pool) as PlaceRow[]];
    if (near) {
      const shrink = Math.cos((near.lat * Math.PI) / 180) ** 2;
      lists.push(byDistance.all(match, near.lat, near.lat, near.lon, near.lon, shrink, pool) as PlaceRow[]);
    }
    for (const list of lists) for (const row of list) found.set(row.id, row);

    const folded = fold(sought).replace(/\s+/g, " ");
    const ranked = [...found.values()]
      .map((row) => ({ row, rank: rankOf(row, folded, tokens, near, prefer) }))
      .sort(
        (a, b) =>
          Number(b.rank.exact) - Number(a.rank.exact) || Number(a.rank.street) - Number(b.rank.street) || b.rank.score - a.rank.score,
      );
    // The same place can be in two datasets (a world list and a country); show it once.
    // OS Open Names says which GeoNames record a settlement is, so it is shown once too.
    const seen = new Set<number>();
    const results: PlaceDto[] = [];
    const owners = new Set<string>();
    for (const { row } of ranked) {
      if (row.geonameId !== null) {
        if (seen.has(row.geonameId)) continue;
        seen.add(row.geonameId);
      }
      results.push(toDto(row));
      owners.add(row.collectionId);
      if (results.length === limit) break;
    }
    const credits = [...new Set(datasetsOf().flatMap((dataset) => (owners.has(dataset.id) ? [dataset.credit] : [])))];
    return {
      query: text,
      coordinate,
      ...others,
      places: results,
      ...(credits.length > 0 ? { credits } : {}),
      ...(notice ? { notice } : {}),
    };
  }

  function datasetsOf(): PlacesDataset[] {
    const { storage } = ctx.services;
    const locations = new Map(storage.list().map((location) => [location.id, location.name]));
    return ctx.services.collections.list({ kind: "places" }).map((row) => {
      const os = row.meta.dataset === OS_NAMES_DATASET;
      return {
        id: row.id,
        name: row.title,
        dataset: typeof row.meta.dataset === "string" ? row.meta.dataset : "",
        countries: row.meta.places?.countries ?? [],
        count: row.meta.places?.count ?? 0,
        sizeBytes: row.sizeBytes,
        installedAt: row.installedAt,
        source: os ? "os" : "geonames",
        edition: os && typeof row.meta.edition === "string" ? row.meta.edition : null,
        ...(os ? { roads: row.meta.roads !== false } : {}),
        credit: os ? (row.attribution ?? "Contains OS data © Crown copyright and database right") : "Place names: GeoNames (CC BY 4.0)",
        locationName: locations.get(row.locationId) ?? "Unknown location",
        available: storage.isAvailable(row.locationId),
      };
    });
  }

  // Rows whose dataset is gone (removed while the server was down, or an import that
  // was cut off) would show up in searches for ever; clear them out at start.
  const owners = sqlite.prepare("SELECT DISTINCT collection_id AS id FROM places").all() as Array<{ id: string }>;
  if (owners.length > 0) {
    const known = new Set(ctx.services.collections.list({ kind: "places" }).map((row) => row.id));
    for (const { id } of owners) if (!known.has(id)) removeRowsNow(id);
  }

  return {
    installer,
    search,
    datasets: datasetsOf,
    removeRows,
    sourceUrl: (dataset) => new URL(`${dataset}.zip`, baseUrl).toString(),

    async update(collectionId) {
      const row = ctx.services.collections.get(collectionId);
      if (row?.kind !== "places") throw new AppError("not_found", "Those place names were not found.");
      const dataset = typeof row.meta.dataset === "string" ? row.meta.dataset : "";
      if (dataset === OS_NAMES_DATASET)
        throw badRequest("OS Open Names is brought up to date with “Check for a newer edition”, under Place names.");
      if (!/^([A-Z]{2}|cities500|cities15000)$/.test(dataset)) throw badRequest("Outpost does not know where these place names came from.");
      if (!ctx.services.storage.isAvailable(row.locationId))
        throw new AppError("storage_unavailable", "The storage location holding these place names is not connected. Reconnect it first.", {
          locationId: row.locationId,
        });
      const url = new URL(`${dataset}.zip`, baseUrl);
      const day = new Date().toISOString().slice(0, 10);
      try {
        const download = await ctx.services.downloads.start({
          kind: "places",
          title: row.title,
          url: url.toString(),
          locationId: row.locationId,
          relPath: `collections/places/${dataset}-${day}.zip`,
          allowedHosts: [url.hostname],
          meta: { dataset, ...(/^[A-Z]{2}$/.test(dataset) ? { country: dataset } : {}), replaces: row.id },
        });
        ctx.events.publish({ type: "maps.changed" });
        return download;
      } catch (error) {
        if (error instanceof AppError && error.code === "conflict")
          throw conflict(`These place names were updated today already, or the update is on its way. ${error.message}`);
        throw error;
      }
    },

    count() {
      return db.select({ n: sql<number>`count(*)` }).from(places).get()?.n ?? 0;
    },

    async startDownload(input) {
      const country = input.country?.toUpperCase();
      const name = input.dataset === "country" ? country! : input.dataset;
      if (datasetsOf().some((dataset) => dataset.dataset === name)) {
        throw conflict("Those place names are already installed. Remove them first if you want a fresh copy.");
      }
      const title =
        input.dataset === "cities500"
          ? "Place names: towns and cities of the world"
          : input.dataset === "cities15000"
            ? "Place names: larger towns and cities of the world"
            : `Place names: ${country} in detail`;
      const url = new URL(`${name}.zip`, baseUrl);
      try {
        const download = await ctx.services.downloads.start({
          kind: "places",
          title,
          url: url.toString(),
          locationId: input.locationId,
          relPath: `collections/places/${name}.zip`,
          allowedHosts: [url.hostname],
          meta: { dataset: name, ...(country ? { country } : {}) },
        });
        ctx.events.publish({ type: "maps.changed" });
        return download;
      } catch (error) {
        if (error instanceof AppError && error.code === "conflict") {
          throw conflict(`Those place names are already downloaded or on their way. ${error.message}`);
        }
        throw error;
      }
    },
  };
}
