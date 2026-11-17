/**
 * OurAirports: the world's airports, airfields and heliports as one CSV file, public
 * domain, refreshed nightly. The whole file is fetched and the countries or box asked for
 * are kept. Its own `type` is kept as the kind; there is no field that says an airfield is
 * military, and none is guessed from names. The airports' radio frequencies are fetched
 * from the same repository in the same install (`ourairports-frequencies.ts`).
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
import {
  FREQUENCIES_FILE,
  FREQUENCIES_KNOWN_BYTES,
  type FrequenciesFetch,
  fetchFrequencies,
  frequencyProps,
} from "./ourairports-frequencies.ts";

/** The data repository's folder; both files are in it. */
export const OURAIRPORTS_BASE = "https://davidmegginson.github.io/ourairports-data/";
export const OURAIRPORTS_URL = `${OURAIRPORTS_BASE}airports.csv`;
/** Read by HEAD on 16 November 2026. */
const KNOWN_BYTES = 12_761_443;
const TYPES = new Set(["large_airport", "medium_airport", "small_airport", "heliport", "seaplane_base", "balloonport", "closed"]);
const REQUIRED = ["ident", "type", "name", "latitude_deg", "longitude_deg", "iso_country"];

const provider = PROVIDERS.find((entry) => entry.id === "ourairports")!;

const inBox = (box: Bbox, lon: number, lat: number) =>
  lat >= box[1] && lat <= box[3] && (box[0] <= box[2] ? lon >= box[0] && lon <= box[2] : lon >= box[0] || lon <= box[2]);

const mb = (bytes: number) => `${(bytes / 1_000_000).toLocaleString("en-GB", { maximumFractionDigits: 1 })} MB`;

export function createOurAirportsAdapter({ ctx, client }: AdapterDeps): ReferenceAdapter {
  // A test puts a local folder in the repository's place (OUTPOST_OURAIRPORTS_URL).
  const base = ctx.config.ourAirportsUrl ?? OURAIRPORTS_BASE;
  const airportsUrl = new URL("airports.csv", base).href;
  const frequenciesUrl = new URL(FREQUENCIES_FILE, base).href;
  return {
    provider,
    async estimate(_request, signal) {
      const head = await headSize(client, airportsUrl, signal);
      // Asked too, so that the size shown is both files'; the airports do not wait on it.
      const frequencies = await headSize(client, frequenciesUrl, signal).catch(() => ({ bytes: null }));
      const frequencyBytes = frequencies.bytes ?? FREQUENCIES_KNOWN_BYTES;
      const airportBytes = head.bytes ?? KNOWN_BYTES;
      return {
        items: [
          {
            key: "airports",
            title: "Airports (OurAirports)",
            layers: ["airports"],
            bytes: airportBytes + frequencyBytes,
            exact: head.bytes !== null && frequencies.bytes !== null,
            basis: `airports.csv ${mb(airportBytes)} and ${FREQUENCIES_FILE} ${mb(frequencyBytes)}: ${
              head.bytes !== null && frequencies.bytes !== null
                ? "the sizes the publisher's server gives for today's files."
                : "where the publisher's server gave no size, the size the file had when Outpost last looked (16 and 17 November 2026)."
            }`,
            records: null,
            host: new URL(airportsUrl).host,
            replaces: null,
          },
        ],
        notes: [
          "The file lists every airport in the world; only those in the countries or box you chose are kept. The file is kept too, so it can be read again.",
          `The airports' radio frequencies come from a second file, ${FREQUENCIES_FILE} (${mb(frequencyBytes)}), fetched from the same place when the airports are installed. Only the kept airports' rows are stored, with each airport; the file itself is not kept. If it cannot be fetched, the airports are installed without them.`,
        ],
      };
    },
    download() {
      return {
        url: airportsUrl,
        // With the time, so that an update on the day of the last download (to get the frequencies, say) is not refused.
        relPath: `collections/reference/ourairports/airports-${new Date().toISOString().slice(0, 23).replace("T", "-").replace(/[:.]/g, "")}.csv`,
        sizeBytes: KNOWN_BYTES,
        allowedHosts: [new URL(airportsUrl).hostname],
        meta: { sourceUrl: "https://ourairports.com/data/", options: { frequenciesUrl } },
      };
    },
    async read({ filePath, meta, sink, signal, sourceDate, progress }) {
      // Fetched as part of the install the person pressed for. A pack downloaded before
      // frequencies were fetched has no address for them and is read as it always was.
      let frequencies: FrequenciesFetch | null = null;
      const notes: string[] = [];
      if (meta.origin === "download" && meta.options?.frequenciesUrl) {
        progress(0, null, "Fetching the airports' radio frequencies");
        frequencies = await fetchFrequencies(client, meta.options.frequenciesUrl, signal);
        if (!frequencies.ok)
          notes.push(
            `Radio frequencies were not included: ${frequencies.reason}. The airports are installed without them; update this pack to try again.`,
          );
      }
      const countries = new Set(meta.countries.map((code) => code.toUpperCase()));
      const box = meta.bbox;
      let checkedHeader = false;
      const found = new Set<string>();
      let withFrequencies = 0;
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
        if (frequencies?.ok && frequencies.byIdent.has(ident)) withFrequencies += 1;
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
          props: { ...props, ...frequencyProps(frequencies, ident) },
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
      if (frequencies?.ok) {
        notes.push(
          `Radio frequencies included, from ${FREQUENCIES_FILE} of ${frequencies.asOf}, for ${withFrequencies.toLocaleString("en-GB")} of the ${sink.count.toLocaleString("en-GB")} airports kept.${
            frequencies.leftOut === 1
              ? " 1 row of the file with no usable frequency was left out."
              : frequencies.leftOut > 1
                ? ` ${frequencies.leftOut.toLocaleString("en-GB")} rows of the file with no usable frequency were left out.`
                : ""
          }`,
        );
      }
      return {
        version: sourceDate,
        publishedAt: sourceDate,
        countries: kept,
        bbox: box ?? boxOfCountries([...countries]),
        ...(notes.length > 0 ? { notes } : {}),
      };
    },
  };
}
