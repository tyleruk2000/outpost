/**
 * OurAirports: the world's airports, airfields and heliports as one CSV file, public
 * domain, refreshed nightly. The whole file is fetched and the countries or box asked for
 * are kept. Its own `type` is kept as the kind; there is no field that says an airfield is
 * military, and none is guessed from names.
 */
import type { Bbox } from "@outpost/shared";
import { PermanentJobError } from "../../../core/jobs.ts";
import { boxOfCountries } from "../countries.ts";
import { checkDegrees } from "../crs.ts";
import { PROVIDERS } from "../providers.ts";
import type { AdapterDeps, ReferenceAdapter } from "../types.ts";
import { csvRecords } from "./csv.ts";
import { headSize } from "./http.ts";
import { cleanText } from "./osm-tags.ts";

export const OURAIRPORTS_URL = "https://davidmegginson.github.io/ourairports-data/airports.csv";
/** Read by HEAD on 16 November 2026. */
const KNOWN_BYTES = 12_761_443;
const TYPES = new Set(["large_airport", "medium_airport", "small_airport", "heliport", "seaplane_base", "balloonport", "closed"]);
const REQUIRED = ["ident", "type", "name", "latitude_deg", "longitude_deg", "iso_country"];

const provider = PROVIDERS.find((entry) => entry.id === "ourairports")!;

const inBox = (box: Bbox, lon: number, lat: number) =>
  lat >= box[1] && lat <= box[3] && (box[0] <= box[2] ? lon >= box[0] && lon <= box[2] : lon >= box[0] || lon <= box[2]);

export function createOurAirportsAdapter({ client }: AdapterDeps): ReferenceAdapter {
  return {
    provider,
    async estimate(_request, signal) {
      const head = await headSize(client, OURAIRPORTS_URL, signal);
      return {
        items: [
          {
            key: "airports",
            title: "Airports (OurAirports)",
            layers: ["airports"],
            bytes: head.bytes ?? KNOWN_BYTES,
            exact: head.bytes !== null,
            basis:
              head.bytes !== null
                ? "The size the publisher's server gives for today's file."
                : "The size the file had on 16 November 2026.",
            records: null,
            host: new URL(OURAIRPORTS_URL).host,
            replaces: null,
          },
        ],
        notes: [
          "The file lists every airport in the world; only those in the countries or box you chose are kept. The file is kept too, so it can be read again.",
        ],
      };
    },
    download() {
      return {
        url: OURAIRPORTS_URL,
        relPath: `collections/reference/ourairports/airports-${new Date().toISOString().slice(0, 10)}.csv`,
        sizeBytes: KNOWN_BYTES,
        allowedHosts: [new URL(OURAIRPORTS_URL).hostname],
        meta: { sourceUrl: "https://ourairports.com/data/" },
      };
    },
    async read({ filePath, meta, sink, signal, sourceDate }) {
      const countries = new Set(meta.countries.map((code) => code.toUpperCase()));
      const box = meta.bbox;
      let checkedHeader = false;
      const found = new Set<string>();
      for await (const { row, line } of csvRecords(filePath, signal)) {
        if (!checkedHeader) {
          const missing = REQUIRED.filter((column) => !(column in row));
          if (missing.length > 0)
            throw new PermanentJobError(`This is not OurAirports' airports.csv: it has no ${missing.join(", ")} column.`);
          checkedHeader = true;
        }
        const country = (row.iso_country ?? "").toUpperCase();
        if (countries.size > 0 && !countries.has(country)) continue;
        const lat = Number(row.latitude_deg);
        const lon = Number(row.longitude_deg);
        const problem = checkDegrees(lon, lat);
        if (problem) {
          sink.skip(`Line ${line} (${cleanText(row.ident)}): ${problem}.`);
          continue;
        }
        if (box && !inBox(box, lon, lat)) continue;
        const type = row.type ?? "";
        if (!TYPES.has(type)) {
          sink.skip(`Line ${line} (${cleanText(row.ident)}) has a type OurAirports does not document: ${cleanText(type, 40)}.`);
          continue;
        }
        const ident = cleanText(row.ident, 40);
        if (!ident) {
          sink.skip(`Line ${line} has no identifier.`);
          continue;
        }
        found.add(country);
        const props: Record<string, string> = {};
        for (const key of [
          "ident",
          "type",
          "icao_code",
          "iata_code",
          "gps_code",
          "local_code",
          "municipality",
          "iso_region",
          "elevation_ft",
          "scheduled_service",
          "home_link",
          "wikipedia_link",
          "keywords",
        ]) {
          const value = cleanText(row[key], 300);
          if (value) props[key] = value;
        }
        await sink.add({
          sourceId: ident,
          layer: "airports",
          kind: type,
          name: cleanText(row.name) || ident,
          altNames: [row.iata_code, row.icao_code, row.gps_code]
            .map((code) => cleanText(code, 10))
            .filter(Boolean)
            .join(","),
          country: country || null,
          lat,
          lon,
          bbox: null,
          geometry: null,
          props,
          provenance: "public-infrastructure",
          accuracy: "The airport's reference point as OurAirports lists it",
          accuracyMeters: null,
          publisher: provider.publisher,
          license: provider.license,
          sourceUrl: "https://ourairports.com/data/",
          publishedAt: sourceDate,
        });
      }
      if (!checkedHeader) throw new PermanentJobError("The airports file is empty.");
      const kept = countries.size > 0 ? [...countries] : [...found].sort();
      return { version: sourceDate, publishedAt: sourceDate, countries: kept, bbox: box ?? boxOfCountries([...countries]) };
    },
  };
}
