/**
 * OurAirports' `airport-frequencies.csv`: the radio frequencies contributors have listed
 * for each airport, public domain like the airports file and published beside it. It is
 * fetched with the airports, in the same install, and each kept airport is given its rows
 * in its own fields (`props.frequencies`), so they are stored, counted, backed up and
 * removed with the airport and are never searchable text.
 *
 * ourairports.com's data dictionary could not be read (its certificate had expired), so
 * the columns are the file's own header, as found on 17 November 2026:
 * `"id","airport_ref","airport_ident","type","description","frequency_mhz"`.
 *
 * Fails soft: a file that cannot be fetched, has another header or is far larger than it
 * should be leaves the airports to install without frequencies, and says why.
 */
import type { AirportFrequenciesDto, AirportFrequencyDto } from "@outpost/shared";
import { parse } from "csv-parse/sync";
import { messageOf } from "../../../core/errors.ts";
import type { HttpClient } from "../../../core/http.ts";
import { cleanText } from "./osm-tags.ts";

export const FREQUENCIES_FILE = "airport-frequencies.csv";
/** The file's size, uncompressed, when it was fetched on 17 November 2026 (30,397 rows). */
export const FREQUENCIES_KNOWN_BYTES = 1_302_744;
/** About twelve times the file's size on the day: anything larger is not the file Outpost knows. */
export const FREQUENCIES_MAX_BYTES = 16 * 1024 * 1024;
const COLUMNS = ["airport_ident", "type", "description", "frequency_mhz"];

/** Where the airport's frequencies are kept in its fields: the rows, and the date of the file. */
export const FREQUENCIES_PROP = "frequencies";
export const FREQUENCIES_AS_OF_PROP = "frequencies_as_of";

/** One row as it is kept: type, description, frequency in MHz, each as the file gives it. */
type KeptRow = [type: string, description: string, mhz: string];

export type FrequenciesFetch =
  | { ok: true; byIdent: Map<string, KeptRow[]>; asOf: string; rows: number; leftOut: number }
  | { ok: false; reason: string };

/**
 * Type codes whose meaning is certain: the ICAO abbreviations (Doc 8400) and the plain
 * words some contributors type instead. Anything else is shown as given.
 */
const TYPE_WORDS = new Map<string, string>([
  ["TWR", "Tower"],
  ["TOWER", "Tower"],
  ["GND", "Ground"],
  ["GROUND", "Ground"],
  ["APP", "Approach"],
  ["APPROACH", "Approach"],
  ["DEP", "Departure"],
  ["ARR", "Arrival"],
  ["DEL", "Delivery"],
  ["DELIVERY", "Delivery"],
  ["INFO", "Information"],
  ["INFORMATION", "Information"],
  ["RDO", "Radio"],
  ["RADIO", "Radio"],
  ["RDR", "Radar"],
  ["RADAR", "Radar"],
]);
const TOWER = new Set(["TWR", "TOWER"]);
const INFORMATION = new Set(["ATIS", "D-ATIS", "AFIS", "FIS", "INFO", "INFORMATION"]);

export const typeLabelOf = (type: string): string | null => TYPE_WORDS.get(type.trim().toUpperCase()) ?? null;

/** Tower first, then information services, then the rest in the file's order. */
function rankOf(type: string): number {
  const code = type.trim().toUpperCase();
  if (TOWER.has(code)) return 0;
  if (INFORMATION.has(code)) return 1;
  return 2;
}

const dayOf = (lastModified: string | null, fallback: number) => {
  const parsed = lastModified ? Date.parse(lastModified) : Number.NaN;
  return new Date(Number.isNaN(parsed) ? fallback : parsed).toISOString().slice(0, 10);
};

/** Reads the file's text into rows by airport, or says why it cannot be used. */
export function readFrequencies(text: string, asOf: string): FrequenciesFetch {
  let records: string[][];
  try {
    records = parse(text, { bom: true, relax_column_count: true, skip_empty_lines: true, trim: true }) as string[][];
  } catch (error) {
    return { ok: false, reason: `the frequencies file could not be read as CSV (${messageOf(error)})` };
  }
  const header = (records[0] ?? []).map((name) => name.trim().toLowerCase());
  const missing = COLUMNS.filter((column) => !header.includes(column));
  if (records.length === 0 || missing.length > 0)
    return { ok: false, reason: `the frequencies file is not the shape Outpost knows: it has no ${missing.join(", ")} column` };
  const at = Object.fromEntries(COLUMNS.map((column) => [column, header.indexOf(column)])) as Record<string, number>;
  const byIdent = new Map<string, KeptRow[]>();
  let rows = 0;
  let leftOut = 0;
  for (const record of records.slice(1)) {
    const ident = cleanText(record[at.airport_ident!], 40);
    const mhz = cleanText(record[at.frequency_mhz!], 20);
    const value = Number(mhz);
    // A row with no frequency (OurAirports has some with 0) says nothing to listen to.
    if (!ident || !mhz || !Number.isFinite(value) || value <= 0) {
      leftOut += 1;
      continue;
    }
    const row: KeptRow = [cleanText(record[at.type!], 40), cleanText(record[at.description!], 120), mhz];
    const list = byIdent.get(ident);
    if (list) list.push(row);
    else byIdent.set(ident, [row]);
    rows += 1;
  }
  for (const list of byIdent.values()) {
    const ranked = list.map((row, index) => ({ row, index, rank: rankOf(row[0]) }));
    ranked.sort((a, b) => a.rank - b.rank || a.index - b.index);
    list.splice(0, list.length, ...ranked.map(({ row }) => row));
  }
  return { ok: true, byIdent, asOf, rows, leftOut };
}

/** Fetches the file once, held to its host, and reads it. Never throws: a failure is a reason. */
export async function fetchFrequencies(client: HttpClient, url: string, signal: AbortSignal): Promise<FrequenciesFetch> {
  const host = new URL(url).hostname;
  try {
    const { response } = await client.fetch(url, { allowedHosts: [host], everyHop: true, signal });
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      return { ok: false, reason: `${host} answered HTTP ${response.status} for ${FREQUENCIES_FILE}` };
    }
    const declared = Number(response.headers.get("content-length"));
    if (!response.headers.get("content-encoding") && Number.isFinite(declared) && declared > FREQUENCIES_MAX_BYTES) {
      await response.body?.cancel().catch(() => undefined);
      return { ok: false, reason: `${FREQUENCIES_FILE} is far larger than it should be (${declared.toLocaleString("en-GB")} bytes)` };
    }
    const chunks: Uint8Array[] = [];
    let size = 0;
    for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
      size += chunk.byteLength;
      if (size > FREQUENCIES_MAX_BYTES) {
        return {
          ok: false,
          reason: `${FREQUENCIES_FILE} is far larger than it should be (more than ${FREQUENCIES_MAX_BYTES / 1024 / 1024} MB)`,
        };
      }
      chunks.push(chunk);
    }
    return readFrequencies(Buffer.concat(chunks).toString("utf8"), dayOf(response.headers.get("last-modified"), Date.now()));
  } catch (error) {
    signal.throwIfAborted();
    return { ok: false, reason: `${host} could not be reached for ${FREQUENCIES_FILE} (${messageOf(error)})` };
  }
}

/** The fields an airport is given: its rows (an empty list when the file has none) and the file's date. */
export function frequencyProps(fetched: FrequenciesFetch | null, ident: string): Record<string, string> {
  if (!fetched?.ok) return {};
  return { [FREQUENCIES_PROP]: JSON.stringify(fetched.byIdent.get(ident) ?? []), [FREQUENCIES_AS_OF_PROP]: fetched.asOf };
}

/** For a record's card: its frequencies taken out of its fields, and the fields without them. */
export function splitFrequencies(
  provider: string,
  layer: string,
  props: Record<string, string>,
): { props: Record<string, string>; airportFrequencies?: AirportFrequenciesDto } {
  if (provider !== "ourairports" || layer !== "airports") return { props };
  const { [FREQUENCIES_PROP]: kept, [FREQUENCIES_AS_OF_PROP]: asOf, ...rest } = props;
  let rows: KeptRow[] | null = null;
  try {
    const parsed = kept === undefined ? null : (JSON.parse(kept) as unknown);
    if (Array.isArray(parsed)) rows = parsed.filter((row): row is KeptRow => Array.isArray(row) && row.length === 3);
  } catch {
    rows = null;
  }
  if (!rows) return { props: rest, airportFrequencies: { held: false, asOf: null, list: [] } };
  const list: AirportFrequencyDto[] = rows.map(([type, description, mhz]) => ({
    type: String(type),
    typeLabel: typeLabelOf(String(type)),
    description: String(description),
    mhz: String(mhz),
  }));
  return { props: rest, airportFrequencies: { held: true, asOf: asOf ?? null, list } };
}
