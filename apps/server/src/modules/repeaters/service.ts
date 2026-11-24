/**
 * The repeaters a person holds: lists brought in from files, and entries made by hand.
 *
 * Everything is in two tables of the main database, so it is in every backup and on
 * every portable drive, and all of it is answered with no connection. A list arrives as
 * a file the person obtained, or, for the few publishers whose terms allow it, as a
 * file Outpost fetches once when the person presses a button (`sources.ts`, `fetch.ts`
 * and docs/sources.md). Either way it goes through the same reading and the same
 * preview.
 *
 * Four things here are promises to the person:
 *
 * - **Their changes outlast an update.** An entry they changed keeps `editedAt` and what
 *   the list said then (`sourceRow`); an entry they removed stays as a row marked
 *   `removedAt`. Bringing in a newer copy of the list leaves both alone unless the
 *   person chooses otherwise, having been shown how many there are.
 * - **Nothing is kept until it has been shown.** `preview` reads a file and says what
 *   would happen; `importFile` is the same reading, committed.
 * - **A list's date is the date of its data**, not the day it was imported, and every
 *   answer carries it.
 * - **One repeater is shown once, and nothing is thrown away to do it.** An entry that
 *   is the same repeater as another is set aside, as a row marked `removedAt` that
 *   names the entry shown in its place (`mergedInto`). What the person typed on it is
 *   carried onto that entry first. It comes back when the entries are separated, and
 *   by itself if the entry shown in its place goes with its list.
 */

import { createHash } from "node:crypto";
import {
  APPROXIMATE_POSITION_METERS,
  bandOfHz,
  bearingDegrees,
  formatMHz,
  formatShift,
  haversineMeters,
  isGuessedRepeaterFormat,
  MAX_CHIRP_ROWS,
  modeName,
  parseMaidenhead,
  REPEATER_FORMAT_IDS,
  REPEATER_FORMAT_NAMES,
  REPEATER_MODE_IDS,
  REPEATER_OVERLAY_POINTS,
  type RepeaterBand,
  type RepeaterColumnMap,
  type RepeaterDetailResponse,
  type RepeaterDto,
  type RepeaterDuplicateChoice,
  type RepeaterDuplicateGroup,
  type RepeaterDuplicatePair,
  type RepeaterDuplicateSide,
  type RepeaterDuplicatesResponse,
  type RepeaterEditedChoice,
  type RepeaterExportFormat,
  type RepeaterFetchedFile,
  type RepeaterFetchResponse,
  type RepeaterFields,
  type RepeaterFormatId,
  type RepeaterGoneChoice,
  type RepeaterImportDuplicates,
  type RepeaterImportPreview,
  type RepeaterImportResult,
  type RepeaterListDto,
  type RepeaterListFetch,
  type RepeaterListResponse,
  type RepeaterMergeResult,
  type RepeaterMode,
  type RepeaterOverlayResponse,
  type RepeaterPoint,
  type RepeaterSort,
  type RepeaterSourcesResponse,
  type RepeaterStatus,
  type RepeatersOverview,
  type RepeaterUpdatePlan,
} from "@outpost/shared";
import type { AppContext } from "../../core/context.ts";
import { AppError, badRequest, conflict, notFound } from "../../core/errors.ts";
import { yieldToEventLoop } from "../../core/event-loop.ts";
import { newId } from "../../core/ids.ts";
import type { SearchResult } from "../search/service.ts";
import {
  byHandOf,
  createMatchIndex,
  type Foldable,
  fold,
  groupSame,
  isPossiblySame,
  isSame,
  type Matchable,
  metersBetween,
  pairsPossiblySame,
} from "./duplicates.ts";
import { toChirpCsv, toOutpostCsv } from "./export.ts";
import type { RepeaterFetchClient } from "./fetch.ts";
import {
  cleanMapping,
  createRowReader,
  detectFormat,
  fieldsOf,
  precisionOfLocator,
  type ReadRow,
  readTable,
  sameFields,
  storedFields,
} from "./formats.ts";
import type { LoadedRepeaterSources, RepeaterSource } from "./sources.ts";

/** Rows written per transaction during an import, with a pause between so that requests are answered. */
const WRITE_BATCH = 1000;
/** Where a list is set aside while it is brought up to date. One import runs at a time, so one name is enough. */
const ASIDE = "repeaters_set_aside";
const MAX_PAGE = 200;
const SAMPLE_ROWS = 8;
const SKIPPED_SHOWN = 20;
/** Pairs shown side by side in a preview, and groups of duplicates listed at once. */
const DUPLICATE_EXAMPLES = 12;
const DUPLICATE_GROUPS_SHOWN = 100;
/** No more entries than this are made one in a single merge. */
const MAX_MERGE = 20;
/** How long a fetched file waits, unsaved, for the person to decide; and how many wait at once. */
const FETCHED_KEPT_MS = 30 * 60_000;
const FETCHED_HELD = 3;

interface Row {
  id: string;
  listId: string | null;
  sourceKey: string | null;
  callsign: string;
  outputHz: number;
  inputHz: number | null;
  band: string;
  modes: string;
  ctcssHz: number | null;
  dcsCode: string | null;
  dmrColourCode: number | null;
  talkgroups: string;
  accessNote: string;
  channel: string;
  place: string;
  region: string;
  country: string;
  lat: number | null;
  lon: number | null;
  locator: string;
  positionPrecisionM: number | null;
  antennaM: number | null;
  keeper: string;
  status: string;
  statusText: string;
  notes: string;
  sourceRow: string | null;
  editedAt: number | null;
  removedAt: number | null;
  mergedInto: string | null;
  createdAt: number;
  updatedAt: number;
}

const COLUMNS = `r.id AS id, r.list_id AS listId, r.source_key AS sourceKey, r.callsign AS callsign, r.output_hz AS outputHz,
  r.input_hz AS inputHz, r.band AS band, r.modes AS modes, r.ctcss_hz AS ctcssHz, r.dcs_code AS dcsCode,
  r.dmr_colour_code AS dmrColourCode, r.talkgroups AS talkgroups, r.access_note AS accessNote, r.channel AS channel,
  r.place AS place, r.region AS region, r.country AS country, r.lat AS lat, r.lon AS lon, r.locator AS locator,
  r.position_precision_m AS positionPrecisionM, r.antenna_m AS antennaM, r.keeper AS keeper, r.status AS status,
  r.status_text AS statusText, r.notes AS notes, r.source_row AS sourceRow, r.edited_at AS editedAt,
  r.removed_at AS removedAt, r.merged_into AS mergedInto, r.created_at AS createdAt, r.updated_at AS updatedAt`;

const modesOf = (stored: string): RepeaterMode[] => REPEATER_MODE_IDS.filter((mode) => stored.includes(`,${mode},`));
const storeModes = (modes: RepeaterMode[]): string =>
  `,${REPEATER_MODE_IDS.filter((mode) => modes.includes(mode)).join(",")},`.replace(",,", ",");

function toDto(row: Row): RepeaterDto {
  return {
    id: row.id,
    listId: row.listId,
    callsign: row.callsign,
    outputHz: row.outputHz,
    inputHz: row.inputHz,
    band: row.band as RepeaterBand,
    modes: modesOf(row.modes),
    ctcssHz: row.ctcssHz,
    dcsCode: row.dcsCode,
    dmrColourCode: row.dmrColourCode,
    talkgroups: row.talkgroups,
    accessNote: row.accessNote,
    channel: row.channel,
    place: row.place,
    region: row.region,
    country: row.country,
    lat: row.lat,
    lon: row.lon,
    locator: row.locator,
    positionPrecisionMeters: row.lat === null ? null : row.positionPrecisionM,
    antennaMeters: row.antennaM,
    keeper: row.keeper,
    status: row.status as RepeaterStatus,
    statusText: row.statusText,
    notes: row.notes,
    edited: row.editedAt !== null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** The words an entry is found by when typing, lower case. */
function searchTextOf(fields: RepeaterFields): string {
  return [fields.callsign, fields.place, fields.region, fields.country, fields.keeper, fields.channel, fields.locator]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export interface RepeaterFilter {
  q?: string;
  band?: RepeaterBand;
  mode?: RepeaterMode;
  /** Leave out the ones their list says are not operational. */
  hideOffAir?: boolean;
  /** A list's id, or "own" for entries made by hand. */
  list?: string;
}

export interface RepeaterQuery extends RepeaterFilter {
  near?: { lat: number; lon: number };
  /** With `near`: only those within this many kilometres. */
  withinKm?: number;
  /** Nearest first (with `near`, and the default then), by callsign (the default without), or by the frequency to listen on. */
  sort?: RepeaterSort;
  limit?: number;
  offset?: number;
}

export interface RepeaterUpload {
  text: string;
  fileName: string | null;
  sizeBytes: number;
}

export interface ImportOptions {
  /** How the columns are read, when the person has corrected it. */
  mapping?: unknown;
  /** The list this file is a newer copy of. Without it, a new list is made. */
  listId?: string;
  name?: string;
  source?: string;
  sourceUrl?: string | null;
  /** The day the data is from. */
  dataDate?: number;
  edited?: RepeaterEditedChoice;
  gone?: RepeaterGoneChoice;
  /** What to do with rows that are the same repeater as one already held or as an earlier row. Without it, both are kept. */
  duplicates?: RepeaterDuplicateChoice;
}

/** What only the service may say of an import: that Outpost fetched the file, and where from. */
interface Provenance {
  fetched?: RepeaterListFetch;
}

export interface RepeaterInput {
  callsign: string;
  outputHz: number;
  inputHz?: number | null;
  modes?: RepeaterMode[];
  ctcssHz?: number | null;
  dcsCode?: string | null;
  dmrColourCode?: number | null;
  talkgroups?: string;
  accessNote?: string;
  channel?: string;
  place?: string;
  region?: string;
  country?: string;
  lat?: number | null;
  lon?: number | null;
  locator?: string;
  /**
   * How closely `lat` and `lon` are known, in metres, when they are not exact: a grid
   * reference for a 10 km square gives 10,000. Left out, coordinates given are exact.
   */
  positionPrecisionMeters?: number | null;
  antennaMeters?: number | null;
  keeper?: string;
  status?: RepeaterStatus;
  notes?: string;
}

export interface RepeatersService {
  overview(): RepeatersOverview;
  list(query: RepeaterQuery): RepeaterListResponse;
  get(id: string): RepeaterDetailResponse;
  create(input: RepeaterInput): RepeaterDto;
  update(id: string, patch: Partial<RepeaterInput>): RepeaterDto;
  /** Puts an entry the person changed back to what its list says. */
  revert(id: string): RepeaterDto;
  remove(id: string): void;
  /** Entries held that are the same repeater, and pairs that may be. Nothing is changed by asking. */
  duplicates(): RepeaterDuplicatesResponse;
  /** Makes one entry of several: `keepId` stays, with what the person typed on the others carried onto it; the others are set aside. */
  merge(input: { keepId: string; mergeIds: string[] }): RepeaterMergeResult;
  /** Merges every group whose callsign and frequency agree, keeping in each the entry with the newest data. */
  mergeAll(): Promise<RepeaterMergeResult>;
  /** Brings back the entries that were merged into this one. */
  separate(id: string): { separated: number };
  /** The declared sources, each with the list held from it, if any. Contacts nobody. */
  sources(): RepeaterSourcesResponse;
  /** Fetches a source's file once, holds it unsaved, and says what it would bring in. */
  fetchSource(sourceId: string, signal?: AbortSignal): Promise<RepeaterFetchResponse>;
  /** The same held file read again, with the columns matched differently or another choice about duplicates. */
  previewFetched(token: string, options: ImportOptions): Promise<RepeaterImportPreview>;
  importFetched(token: string, options: ImportOptions): Promise<RepeaterImportResult>;
  /** Forgets a held file the person decided against. */
  discardFetched(token: string): void;
  /** With `near` and `withinKm`, only those within that distance of it: the map then shows what the list does. */
  overlay(
    query: { bbox: [number, number, number, number]; near?: { lat: number; lon: number }; withinKm?: number } & RepeaterFilter,
  ): RepeaterOverlayResponse;
  preview(upload: RepeaterUpload, options: ImportOptions): Promise<RepeaterImportPreview>;
  importFile(upload: RepeaterUpload, options: ImportOptions): Promise<RepeaterImportResult>;
  updateList(id: string, patch: { name?: string; source?: string; sourceUrl?: string | null; dataDate?: number }): RepeaterListDto;
  removeList(id: string): { removed: number };
  /** Brings back the entries of a list that the person removed. */
  restoreRemoved(listId: string): { restored: number };
  exportFile(query: RepeaterQuery & { format: RepeaterExportFormat }): { filename: string; body: string; count: number };
  /** For the search across everything. */
  search(q: string, limit: number): SearchResult[];
  /** How many entries there are to see, a list's and the person's own, and how many lists. */
  count(): { repeaters: number; lists: number };
  /** Removes every list and every entry, the person's own included. Only "erase everything" calls it. */
  eraseAll(): Promise<{ repeaters: number; lists: number }>;
}

/** One word of what was typed: a frequency to match by range, or text to find in an entry's words. */
type Token = { kind: "frequency"; fromHz: number; toHz: number; text?: string } | { kind: "text"; text: string };

export function tokensOf(q: string): Token[] {
  const tokens: Token[] = [];
  for (const word of q.trim().toLowerCase().split(/\s+/).filter(Boolean).slice(0, 6)) {
    // "145", "145.7", "433,2": megahertz, matching every frequency that starts that way.
    const number = /^(\d{1,6})(?:[.,](\d{0,6}))?(?:mhz)?$/.exec(word);
    if (number && Number(number[1]) >= 1) {
      const decimals = number[2] ?? "";
      const fromHz = Number(number[1]) * 1_000_000 + Number(decimals.padEnd(6, "0"));
      // A whole number may also be part of a name ("Hut 12"): it is looked for both ways.
      tokens.push({
        kind: "frequency",
        fromHz,
        toHz: fromHz + 10 ** (6 - decimals.length),
        ...(number[2] === undefined ? { text: number[1]! } : {}),
      });
    } else {
      tokens.push({ kind: "text", text: word.replace(/mhz$/, "") || word });
    }
  }
  return tokens;
}

const likeEscape = (text: string) => text.replace(/[\\%_]/g, (mark) => `\\${mark}`);

export interface RepeaterServiceDeps {
  sources: LoadedRepeaterSources;
  fetcher: RepeaterFetchClient;
}

export function createRepeatersService(ctx: AppContext, deps: RepeaterServiceDeps): RepeatersService {
  const { sqlite } = ctx;
  // The distance the list measures, for the map's "within" ring to agree with it to the metre.
  sqlite.function("repeater_meters", { deterministic: true }, (lat1, lon1, lat2, lon2) =>
    haversineMeters(Number(lat1), Number(lon1), Number(lat2), Number(lon2)),
  );
  const changed = () => ctx.events.publish({ type: "repeaters.changed" });
  let importing = false;

  // ── Lists ──

  interface ListRow {
    id: string;
    name: string;
    source: string;
    sourceUrl: string | null;
    format: string;
    mapping: string | null;
    fileName: string | null;
    dataDate: number;
    createdAt: number;
    updatedAt: number;
    count: number;
    editedCount: number;
    setAsideCount: number;
    fetched: string | null;
  }

  const LIST_COLUMNS = `l.id AS id, l.name AS name, l.source AS source, l.source_url AS sourceUrl, l.format AS format,
    l.mapping AS mapping, l.file_name AS fileName, l.data_date AS dataDate, l.fetched AS fetched,
    l.created_at AS createdAt, l.updated_at AS updatedAt,
    (SELECT count(*) FROM repeaters r WHERE r.list_id = l.id AND r.removed_at IS NULL) AS count,
    (SELECT count(*) FROM repeaters r WHERE r.list_id = l.id AND r.removed_at IS NULL AND r.edited_at IS NOT NULL) AS editedCount,
    (SELECT count(*) FROM repeaters r WHERE r.list_id = l.id AND r.merged_into IS NOT NULL) AS setAsideCount`;

  /** What was recorded when Outpost fetched a list, if it is whole. */
  const fetchOf = (text: string | null): RepeaterListFetch | null => {
    if (!text) return null;
    try {
      const value = JSON.parse(text) as Partial<RepeaterListFetch> | null;
      if (!value || typeof value.sourceId !== "string" || typeof value.url !== "string" || typeof value.fetchedAt !== "number") return null;
      return {
        sourceId: value.sourceId,
        url: value.url,
        fetchedAt: value.fetchedAt,
        sizeBytes: typeof value.sizeBytes === "number" ? value.sizeBytes : 0,
        publisher: String(value.publisher ?? ""),
        termsUrl: String(value.termsUrl ?? ""),
        termsNote: String(value.termsNote ?? ""),
        termsRead: String(value.termsRead ?? ""),
        attribution: String(value.attribution ?? ""),
      };
    } catch {
      return null;
    }
  };

  const toListDto = (row: ListRow): RepeaterListDto => {
    const format = ((REPEATER_FORMAT_IDS as readonly string[]).includes(row.format) ? row.format : "csv") as RepeaterFormatId;
    return {
      id: row.id,
      name: row.name,
      source: row.source,
      sourceUrl: row.sourceUrl,
      format,
      formatName: REPEATER_FORMAT_NAMES[format],
      fileName: row.fileName,
      dataDate: row.dataDate,
      importedAt: row.createdAt,
      updatedAt: row.updatedAt,
      count: row.count,
      editedCount: row.editedCount,
      setAsideCount: row.setAsideCount,
      fetched: fetchOf(row.fetched),
    };
  };

  const listRows = () => sqlite.prepare(`SELECT ${LIST_COLUMNS} FROM repeater_lists l ORDER BY l.name COLLATE NOCASE`).all() as ListRow[];

  /**
   * Sets a list and its entries aside, exactly as they are, so that an update that
   * cannot be finished can be undone. `putBack` restores them in one step; `discard`
   * forgets the copy. The copy does not outlast the server: if the process is stopped
   * part-way through an update, what was written by then stays, and bringing the same
   * file in again completes it.
   */
  function setAside(listId: string): { putBack(): void; discard(): void } {
    sqlite.exec(`DROP TABLE IF EXISTS temp.${ASIDE}`);
    sqlite.prepare(`CREATE TEMP TABLE ${ASIDE} AS SELECT * FROM repeaters WHERE list_id = ?`).run(listId);
    const list = sqlite.prepare("SELECT * FROM repeater_lists WHERE id = ?").get(listId) as Record<string, unknown>;
    const columns = Object.keys(list).filter((column) => column !== "id");
    return {
      putBack: sqlite.transaction(() => {
        sqlite.prepare("DELETE FROM repeaters WHERE list_id = ?").run(listId);
        sqlite.prepare(`INSERT INTO repeaters SELECT * FROM temp.${ASIDE}`).run();
        // Changed where it stands: replacing the row would take its entries with it.
        sqlite
          .prepare(`UPDATE repeater_lists SET ${columns.map((column) => `"${column}" = @${column}`).join(", ")} WHERE id = @id`)
          .run(list);
      }),
      discard: () => sqlite.exec(`DROP TABLE IF EXISTS temp.${ASIDE}`),
    };
  }

  function listRow(id: string): ListRow {
    const row = sqlite.prepare(`SELECT ${LIST_COLUMNS} FROM repeater_lists l WHERE l.id = ?`).get(id) as ListRow | undefined;
    if (!row) throw notFound("That list of repeaters");
    return row;
  }

  // ── Finding ──

  function whereOf(filter: RepeaterFilter): { sql: string; args: Array<string | number> } {
    const parts = ["r.removed_at IS NULL"];
    const args: Array<string | number> = [];
    if (filter.band) {
      parts.push("r.band = ?");
      args.push(filter.band);
    }
    if (filter.mode) {
      parts.push("r.modes LIKE ?");
      args.push(`%,${filter.mode},%`);
    }
    if (filter.hideOffAir) parts.push("r.status != 'off-air'");
    if (filter.list === "own") parts.push("r.list_id IS NULL");
    else if (filter.list) {
      parts.push("r.list_id = ?");
      args.push(filter.list);
    }
    // What was typed is looked for in an index that holds only the words and the two frequencies
    // (repeaters_search_idx), so that finding reads that and not every row. Words are kept in
    // lower case, so a plain look for the letters is enough.
    const typed: string[] = [];
    for (const token of tokensOf(filter.q ?? "")) {
      if (token.kind === "frequency") {
        const named = token.text === undefined ? "" : " OR instr(s.search_text, ?) > 0";
        typed.push(`((s.output_hz >= ? AND s.output_hz < ?) OR (s.input_hz >= ? AND s.input_hz < ?)${named})`);
        args.push(token.fromHz, token.toHz, token.fromHz, token.toHz);
        if (token.text !== undefined) args.push(token.text);
      } else {
        typed.push("instr(s.search_text, ?) > 0");
        args.push(token.text);
      }
    }
    if (typed.length > 0) {
      parts.push(
        `r.id IN (SELECT s.id FROM repeaters s INDEXED BY repeaters_search_idx WHERE s.removed_at IS NULL AND ${typed.join(" AND ")})`,
      );
    }
    return { sql: parts.join(" AND "), args };
  }

  function rowsByIds(ids: string[]): Row[] {
    if (ids.length === 0) return [];
    const found = new Map<string, Row>();
    for (let start = 0; start < ids.length; start += 500) {
      const slice = ids.slice(start, start + 500);
      const rows = sqlite
        .prepare(`SELECT ${COLUMNS} FROM repeaters r WHERE r.id IN (${slice.map(() => "?").join(",")})`)
        .all(...slice) as Row[];
      for (const row of rows) found.set(row.id, row);
    }
    return ids.map((id) => found.get(id)).filter((row): row is Row => row !== undefined);
  }

  /** A page of what matches, by callsign: one typed in full first, then those that start with what was typed. */
  function inCallsignOrder(
    filter: RepeaterFilter,
    where: { sql: string; args: Array<string | number> },
    limit: number,
    offset: number,
  ): Row[] {
    const first = tokensOf(filter.q ?? "").find((token) => token.kind === "text");
    const order = first ? "(r.callsign = ? COLLATE NOCASE) DESC, (r.callsign LIKE ? ESCAPE '\\') DESC, " : "";
    const orderArgs = first && first.kind === "text" ? [first.text, `${likeEscape(first.text)}%`] : [];
    return sqlite
      .prepare(
        `SELECT ${COLUMNS} FROM repeaters r WHERE ${where.sql} ORDER BY ${order}r.callsign COLLATE NOCASE, r.output_hz, r.id LIMIT ? OFFSET ?`,
      )
      .all(...where.args, ...orderArgs, limit, offset) as Row[];
  }

  /**
   * The entries a query asks for, in order, with the count of all that match. With
   * `near`, every match that has a position is measured exactly and sorted by distance;
   * those with none follow in callsign order, unless a distance limit rules them out.
   */
  function select(query: RepeaterQuery, maxLimit: number): RepeaterListResponse {
    const limit = Math.min(Math.max(query.limit ?? 50, 1), maxLimit);
    const offset = Math.max(query.offset ?? 0, 0);
    const where = whereOf(query);
    const near = query.near;

    if (!near) {
      const counts = sqlite
        .prepare(`SELECT count(*) AS total, coalesce(sum(r.lat IS NULL), 0) AS unplaced FROM repeaters r WHERE ${where.sql}`)
        .get(...where.args) as { total: number; unplaced: number };
      const rows =
        query.sort === "frequency"
          ? (sqlite
              .prepare(
                `SELECT ${COLUMNS} FROM repeaters r WHERE ${where.sql} ORDER BY r.output_hz, r.callsign COLLATE NOCASE, r.id LIMIT ? OFFSET ?`,
              )
              .all(...where.args, limit, offset) as Row[])
          : inCallsignOrder(query, where, limit, offset);
      return { total: counts.total, withoutPosition: counts.unplaced, repeaters: rows.map(toDto) };
    }

    // A box round the place first, so a distance limit does not measure the whole world.
    let box = "";
    const boxArgs: number[] = [];
    const within = query.withinKm;
    if (within !== undefined) {
      const dLat = within / 111.195 + 0.01;
      box += " AND r.lat >= ? AND r.lat <= ?";
      boxArgs.push(near.lat - dLat, near.lat + dLat);
      const shrink = Math.cos((Math.min(89.9, Math.abs(near.lat) + dLat) * Math.PI) / 180);
      const dLon = dLat / Math.max(shrink, 0.001);
      // A box that reaches the 180° meridian or a pole is left unbounded east to west; the exact sum below still decides.
      if (dLon < 180 && near.lon - dLon >= -180 && near.lon + dLon <= 180) {
        box += " AND r.lon >= ? AND r.lon <= ?";
        boxArgs.push(near.lon - dLon, near.lon + dLon);
      }
    }
    const placed = sqlite
      .prepare(
        `SELECT r.id AS id, r.lat AS lat, r.lon AS lon, r.callsign AS callsign, r.output_hz AS hz FROM repeaters r WHERE ${where.sql} AND r.lat IS NOT NULL${box}`,
      )
      .raw()
      .all(...where.args, ...boxArgs) as Array<[string, number, number, string, number]>;
    let measured = placed.map(([id, lat, lon, callsign, hz]) => ({
      id,
      meters: haversineMeters(near.lat, near.lon, lat, lon),
      callsign,
      hz,
    }));
    if (within !== undefined) measured = measured.filter((item) => item.meters <= within * 1000);
    const byId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    const byCallsign = (a: { callsign: string; hz: number; id: string }, b: { callsign: string; hz: number; id: string }) =>
      a.callsign.localeCompare(b.callsign, "en", { sensitivity: "base" }) || a.hz - b.hz || byId(a, b);
    if (query.sort === "callsign") measured.sort(byCallsign);
    else if (query.sort === "frequency") measured.sort((a, b) => a.hz - b.hz || byCallsign(a, b));
    else measured.sort((a, b) => a.meters - b.meters || byId(a, b));

    const withoutPosition =
      within === undefined
        ? (sqlite.prepare(`SELECT count(*) AS n FROM repeaters r WHERE ${where.sql} AND r.lat IS NULL`).get(...where.args) as { n: number })
            .n
        : 0;
    const page = measured.slice(offset, offset + limit);
    const distances = new Map(page.map((item) => [item.id, item.meters]));
    const repeaters: RepeaterDto[] = rowsByIds(page.map((item) => item.id)).map((row) => ({
      ...toDto(row),
      distanceMeters: distances.get(row.id)!,
      bearingDegrees: bearingDegrees(near.lat, near.lon, row.lat!, row.lon!),
    }));
    // Past the last one with a position, carry on into those without.
    if (repeaters.length < limit && withoutPosition > 0) {
      const skip = Math.max(0, offset - measured.length);
      const rest = sqlite
        .prepare(
          `SELECT ${COLUMNS} FROM repeaters r WHERE ${where.sql} AND r.lat IS NULL ORDER BY r.callsign COLLATE NOCASE, r.output_hz, r.id LIMIT ? OFFSET ?`,
        )
        .all(...where.args, limit - repeaters.length, skip) as Row[];
      repeaters.push(...rest.map(toDto));
    }
    return { total: measured.length + withoutPosition, withoutPosition, repeaters };
  }

  function rowOf(id: string): Row {
    const row = sqlite.prepare(`SELECT ${COLUMNS} FROM repeaters r WHERE r.id = ? AND r.removed_at IS NULL`).get(id) as Row | undefined;
    if (!row) throw notFound("That repeater");
    return row;
  }

  // ── Writing ──

  const insert = sqlite.prepare(
    `INSERT INTO repeaters (id, list_id, source_key, callsign, output_hz, input_hz, band, modes, ctcss_hz, dcs_code, dmr_colour_code,
       talkgroups, access_note, channel, place, region, country, lat, lon, locator, position_precision_m, antenna_m, keeper, status,
       status_text, notes, search_text, source_row, edited_at, removed_at, merged_into, created_at, updated_at)
     VALUES (@id, @listId, @sourceKey, @callsign, @outputHz, @inputHz, @band, @modes, @ctcssHz, @dcsCode, @dmrColourCode,
       @talkgroups, @accessNote, @channel, @place, @region, @country, @lat, @lon, @locator, @positionPrecisionM, @antennaM, @keeper,
       @status, @statusText, @notes, @searchText, @sourceRow, @editedAt, @removedAt, @mergedInto, @now, @now)`,
  );
  /** An entry that is shown: not removed, and not set aside for another. */
  const SHOWN = { removedAt: null, mergedInto: null };
  const setAsideRow = sqlite.prepare("UPDATE repeaters SET removed_at = @now, merged_into = @into, updated_at = @now WHERE id = @id");
  const repoint = sqlite.prepare("UPDATE repeaters SET merged_into = @into WHERE merged_into = @from");

  /**
   * Entries set aside for one that is no longer there come back. This is what makes
   * removing a list safe after a merge: a repeater that was also in another list is
   * shown from that list again.
   */
  function releaseOrphans(): number {
    return sqlite
      .prepare(
        `UPDATE repeaters SET removed_at = NULL, merged_into = NULL, updated_at = ?
         WHERE merged_into IS NOT NULL AND merged_into NOT IN (SELECT id FROM repeaters)`,
      )
      .run(Date.now()).changes;
  }
  const overwrite = sqlite.prepare(
    `UPDATE repeaters SET callsign = @callsign, output_hz = @outputHz, input_hz = @inputHz, band = @band, modes = @modes,
       ctcss_hz = @ctcssHz, dcs_code = @dcsCode, dmr_colour_code = @dmrColourCode, talkgroups = @talkgroups, access_note = @accessNote,
       channel = @channel, place = @place, region = @region, country = @country, lat = @lat, lon = @lon, locator = @locator,
       position_precision_m = @positionPrecisionM, antenna_m = @antennaM, keeper = @keeper, status = @status, status_text = @statusText,
       notes = @notes, search_text = @searchText, source_row = @sourceRow, edited_at = @editedAt, updated_at = @now
     WHERE id = @id`,
  );
  const setSourceRow = sqlite.prepare("UPDATE repeaters SET source_row = ? WHERE id = ?");

  /** The columns of a row for the statements above, from the fields of an entry. */
  function values(fields: RepeaterFields, band: RepeaterBand) {
    return {
      callsign: fields.callsign,
      outputHz: fields.outputHz,
      inputHz: fields.inputHz,
      band,
      modes: storeModes(fields.modes),
      ctcssHz: fields.ctcssHz,
      dcsCode: fields.dcsCode,
      dmrColourCode: fields.dmrColourCode,
      talkgroups: fields.talkgroups,
      accessNote: fields.accessNote,
      channel: fields.channel,
      place: fields.place,
      region: fields.region,
      country: fields.country,
      lat: fields.lat,
      lon: fields.lon,
      locator: fields.locator,
      positionPrecisionM: fields.lat === null ? null : fields.positionPrecisionMeters,
      antennaM: fields.antennaMeters,
      keeper: fields.keeper,
      status: fields.status,
      statusText: fields.statusText,
      notes: fields.notes,
      searchText: searchTextOf(fields),
    };
  }

  /** What a person typed for an entry, laid over what was there, as a whole set of fields. */
  function merge(current: RepeaterFields, patch: Partial<RepeaterInput>): RepeaterFields {
    const next: RepeaterFields = { ...current };
    const text = (value: string | undefined, fallback: string) => (value === undefined ? fallback : value.trim());
    if (patch.callsign !== undefined) next.callsign = patch.callsign.trim().replace(/\s+/g, " ");
    if (patch.outputHz !== undefined) next.outputHz = patch.outputHz;
    if (patch.inputHz !== undefined) next.inputHz = patch.inputHz;
    if (patch.modes !== undefined) next.modes = REPEATER_MODE_IDS.filter((mode) => patch.modes!.includes(mode));
    if (patch.ctcssHz !== undefined) next.ctcssHz = patch.ctcssHz;
    if (patch.dcsCode !== undefined) next.dcsCode = patch.dcsCode;
    if (patch.dmrColourCode !== undefined) next.dmrColourCode = patch.dmrColourCode;
    next.talkgroups = text(patch.talkgroups, current.talkgroups);
    next.accessNote = text(patch.accessNote, current.accessNote);
    next.channel = text(patch.channel, current.channel);
    next.place = text(patch.place, current.place);
    next.region = text(patch.region, current.region);
    next.country = text(patch.country, current.country);
    next.keeper = text(patch.keeper, current.keeper);
    next.notes = text(patch.notes, current.notes);
    if (patch.antennaMeters !== undefined) next.antennaMeters = patch.antennaMeters;
    if (patch.status !== undefined && patch.status !== current.status) {
      next.status = patch.status;
      // The words were the list's; the status is now the person's.
      next.statusText = "";
    }

    // Position: coordinates the person gives are taken as exact; a locator alone places it at the middle of its square.
    const locator = patch.locator === undefined ? undefined : patch.locator.trim().toUpperCase().replace(/\s+/g, "");
    const square = locator ? parseMaidenhead(locator) : null;
    if (locator !== undefined) {
      if (locator && !square) throw badRequest(`“${locator}” is not a Maidenhead locator. One looks like IO83 or IO83QM.`);
      next.locator = square?.locator ?? "";
    }
    const givesPosition = patch.lat !== undefined || patch.lon !== undefined;
    if (givesPosition) {
      const lat = patch.lat === undefined ? current.lat : patch.lat;
      const lon = patch.lon === undefined ? current.lon : patch.lon;
      if ((lat === null) !== (lon === null)) throw badRequest("Give both a latitude and a longitude, or neither.");
      const moved = lat !== current.lat || lon !== current.lon;
      next.lat = lat;
      next.lon = lon;
      if (lat === null) next.positionPrecisionMeters = null;
      else if (moved) next.positionPrecisionMeters = Math.max(0, Math.round(patch.positionPrecisionMeters ?? 0));
    }
    // A new locator with no coordinates beside it is the person saying where it is.
    if (square && !givesPosition && square.locator !== current.locator) next.lat = null;
    if (next.lat === null && square) {
      next.lat = Number(square.lat.toFixed(6));
      next.lon = Number(square.lon.toFixed(6));
      next.positionPrecisionMeters = precisionOfLocator(square);
    }
    if (!next.callsign) throw badRequest("Give the repeater a callsign or a name.");
    return next;
  }

  const fieldsOfRow = (row: Row): RepeaterFields => fieldsOf(toDto(row));

  // ── Reading a file ──

  interface Reading {
    format: RepeaterFormatId;
    columns: string[];
    mapping: RepeaterColumnMap;
    rows: ReadRow[];
    total: number;
    skipped: RepeaterImportPreview["skipped"];
    skippedCount: number;
    problem: string | null;
  }

  async function read(upload: RepeaterUpload, options: ImportOptions, list: ListRow | null): Promise<Reading> {
    const table = await readTable(upload.text);
    const detected = detectFormat(table.columns, table.kind);
    let mapping = detected.mapping;
    if (options.mapping !== undefined) mapping = cleanMapping(options.mapping, table.columns);
    else if (list?.mapping && isGuessedRepeaterFormat(detected.format)) {
      // A newer copy of a list whose columns the person matched by hand: read it the same way.
      try {
        const remembered = cleanMapping(JSON.parse(list.mapping), table.columns);
        if (remembered.callsign && remembered.output) mapping = remembered;
      } catch {
        // Not readable: fall back to matching by name.
      }
    }
    const reader = createRowReader(table.columns, mapping, detected.format);
    const reading: Reading = {
      format: detected.format,
      columns: table.columns,
      mapping,
      rows: [],
      total: table.rows.length,
      skipped: [],
      skippedCount: 0,
      problem: reader.problem,
    };
    if (reader.problem) return reading;
    for (const [index, row] of table.rows.entries()) {
      const outcome = reader.read(row);
      if (outcome.ok) reading.rows.push(outcome.row);
      else if ("ignored" in outcome) reading.total -= 1;
      else {
        reading.skippedCount += 1;
        if (reading.skipped.length < SKIPPED_SHOWN)
          reading.skipped.push({ line: outcome.line, reason: outcome.reason, text: outcome.text });
      }
      if (index % 2000 === 1999) await yieldToEventLoop();
    }
    return reading;
  }

  interface Existing {
    id: string;
    sourceKey: string | null;
    sourceRow: string | null;
    editedAt: number | null;
    removedAt: number | null;
    mergedInto: string | null;
    callsign: string;
    outputHz: number;
  }

  const existingOf = (listId: string) =>
    sqlite
      .prepare(
        `SELECT id, source_key AS sourceKey, source_row AS sourceRow, edited_at AS editedAt, removed_at AS removedAt,
                merged_into AS mergedInto, callsign, output_hz AS outputHz
         FROM repeaters WHERE list_id = ?`,
      )
      .all(listId) as Existing[];

  const parseSource = (text: string | null): RepeaterFields | null => {
    if (!text) return null;
    try {
      return storedFields(JSON.parse(text));
    } catch {
      return null;
    }
  };

  /** What each row of the file is to the list as it stands. */
  type Step =
    | { kind: "add"; row: ReadRow; id: string }
    | { kind: "change"; row: ReadRow; id: string }
    | { kind: "same"; row: ReadRow; id: string }
    | { kind: "edited-same"; row: ReadRow; id: string }
    | { kind: "edited-differs"; row: ReadRow; existing: Existing }
    | { kind: "removed"; row: ReadRow; id: string; setAside: boolean };

  function stepsOf(rows: ReadRow[], existing: Existing[]): { steps: Step[]; gone: Existing[] } {
    const byKey = new Map(existing.filter((item) => item.sourceKey !== null).map((item) => [item.sourceKey!, item]));
    const met = new Set<string>();
    const steps: Step[] = [];
    for (const row of rows) {
      const current = byKey.get(row.key);
      if (!current) {
        // Named now, so that a later row of the same file can be set aside for this one.
        steps.push({ kind: "add", row, id: newId() });
        continue;
      }
      met.add(current.id);
      const before = parseSource(current.sourceRow);
      const same = before !== null && sameFields(before, row);
      if (current.removedAt !== null) steps.push({ kind: "removed", row, id: current.id, setAside: current.mergedInto !== null });
      else if (current.editedAt !== null) {
        steps.push(same ? { kind: "edited-same", row, id: current.id } : { kind: "edited-differs", row, existing: current });
      } else steps.push(same ? { kind: "same", row, id: current.id } : { kind: "change", row, id: current.id });
    }
    return { steps, gone: existing.filter((item) => !met.has(item.id)) };
  }

  function planOf(list: ListRow, steps: Step[], gone: Existing[]): RepeaterUpdatePlan {
    const count = (kind: Step["kind"]) => steps.filter((step) => step.kind === kind).length;
    const setAside = steps.filter((step) => step.kind === "removed" && step.setAside).length;
    const differing = steps.filter((step): step is Extract<Step, { kind: "edited-differs" }> => step.kind === "edited-differs");
    return {
      listId: list.id,
      listName: list.name,
      added: count("add"),
      changed: count("change"),
      unchanged: count("same"),
      gone: gone.filter((item) => item.removedAt === null && item.editedAt === null).length,
      editedSame: count("edited-same"),
      editedDiffering: differing.length,
      editedExamples: differing.slice(0, 5).map((step) => ({ callsign: step.existing.callsign, outputHz: step.existing.outputHz })),
      removedByYou: count("removed") - setAside,
      editedGone: gone.filter((item) => item.removedAt === null && item.editedAt !== null).length,
      setAside,
    };
  }

  // ── The same repeater twice ──

  /** An entry that is held and shown, as much of it as telling duplicates apart needs. */
  interface Held extends Matchable {
    id: string;
    listId: string | null;
    editedAt: number | null;
    updatedAt: number;
  }

  /** Every entry that is shown, but for those of one list: a list is never compared with itself here. */
  function heldEntries(exceptListId: string | null): Held[] {
    const rows = sqlite
      .prepare(
        `SELECT id, list_id, callsign, output_hz, lat, lon, position_precision_m, edited_at, updated_at
         FROM repeaters WHERE removed_at IS NULL AND (? IS NULL OR list_id IS NULL OR list_id != ?)`,
      )
      .raw()
      .all(exceptListId, exceptListId) as Array<
      [string, string | null, string, number, number | null, number | null, number | null, number | null, number]
    >;
    return rows.map(([id, listId, callsign, outputHz, lat, lon, positionPrecisionMeters, editedAt, updatedAt]) => ({
      id,
      listId,
      callsign,
      outputHz,
      lat,
      lon,
      positionPrecisionMeters,
      editedAt,
      updatedAt,
    }));
  }

  const listDates = () =>
    new Map(
      (
        sqlite.prepare("SELECT id, name, source, data_date AS dataDate FROM repeater_lists").all() as Array<{
          id: string;
          name: string;
          source: string;
          dataDate: number;
        }>
      ).map((row) => [row.id, row]),
    );

  /** An entry that is held, as one side of a pair. */
  function sideOf(row: Row, lists: ReturnType<typeof listDates>): RepeaterDuplicateSide {
    const list = row.listId ? lists.get(row.listId) : undefined;
    return {
      ...fieldsOfRow(row),
      id: row.id,
      band: row.band as RepeaterBand,
      line: null,
      listName: list?.name ?? null,
      dataDate: list?.dataDate ?? null,
      byHand: !row.listId || row.editedAt !== null,
    };
  }

  const sideOfRow = (row: ReadRow, dataDate: number): RepeaterDuplicateSide => ({
    ...fieldsOf(row),
    id: null,
    band: row.band,
    line: row.line,
    listName: null,
    dataDate,
    byHand: false,
  });

  /** What a held entry brings to a merge: its fields, and which of them the person typed. */
  function foldable(row: Row): Foldable {
    const fields = fieldsOfRow(row);
    const listed = row.listId ? parseSource(row.sourceRow) : null;
    // An entry of a list whose first reading has been lost is treated as the person's own, so that nothing of it can be overwritten.
    return {
      fields,
      byHand: byHandOf(fields, row.listId ? (listed ?? null) : null, row.listId ? row.editedAt !== null || listed === null : true),
    };
  }

  /** What is to be done with one new row of a file because of what it matches. */
  interface Match {
    /** The earlier row of the same file that it repeats: the id that row has or will have. */
    earlier?: { id: string; row: ReadRow | null };
    /** Entries held elsewhere that are the same repeater, the one to prefer first. */
    held: Held[];
    /** An entry held elsewhere that may be the same under another callsign. */
    possible?: Held;
  }

  /**
   * Looks at each row that would be added and says what it matches: an earlier row of
   * the file, entries held in other lists or made by hand, or (failing both) an entry
   * that may be the same under another spelling.
   */
  function matchesOf(steps: Step[], exceptListId: string | null): Map<string, Match> {
    const held = heldEntries(exceptListId);
    const index = createMatchIndex(held);
    const lists = listDates();
    const dateOf = (item: Held) => (item.listId ? (lists.get(item.listId)?.dataDate ?? 0) : Number.POSITIVE_INFINITY);
    // The person's own first, then the newest data.
    const preferred = (a: Held, b: Held) =>
      Number(b.listId === null || b.editedAt !== null) - Number(a.listId === null || a.editedAt !== null) || dateOf(b) - dateOf(a);
    /**
     * Rows of the file a new row may repeat, each with the id of its entry. First every row
     * that is an entry of the list already and is shown, changed in this copy or not:
     * `heldEntries` leaves the list being brought up to date out, so this is the only place
     * they are seen, and they are there wherever in the file the new row comes. Then the
     * new rows read so far.
     */
    const inFile = createMatchIndex<Matchable & { id: string; row: ReadRow | null }>();
    for (const step of steps) {
      if (step.kind === "add" || step.kind === "removed") continue;
      inFile.add({ ...matchable(step.row), id: step.kind === "edited-differs" ? step.existing.id : step.id, row: step.row });
    }
    const matches = new Map<string, Match>();
    for (const step of steps) {
      if (step.kind !== "add") continue;
      const earlier = inFile.same(step.row)[0];
      const same = index.same(step.row).sort(preferred);
      const possible = !earlier && same.length === 0 ? index.possible(step.row)[0] : undefined;
      if (earlier || same.length > 0 || possible) {
        matches.set(step.id, { earlier: earlier ? { id: earlier.id, row: earlier.row } : undefined, held: same, possible });
      }
      inFile.add({ ...matchable(step.row), id: step.id, row: step.row });
    }
    return matches;
  }

  const matchable = (row: Matchable): Matchable => ({
    callsign: row.callsign,
    outputHz: row.outputHz,
    lat: row.lat,
    lon: row.lon,
    positionPrecisionMeters: row.positionPrecisionMeters,
  });

  function duplicatesOf(steps: Step[], matches: Map<string, Match>, dataDate: number): RepeaterImportDuplicates {
    const summary: RepeaterImportDuplicates = { held: 0, heldByHand: 0, withinFile: 0, possible: 0, examples: [] };
    const lists = listDates();
    /** A few of each kind, so that one kind does not crowd out the others. */
    const shown = { held: 0, file: 0, possible: 0 };
    const each = Math.floor(DUPLICATE_EXAMPLES / 3);
    const wanted: Array<{
      pair: Omit<RepeaterDuplicatePair, "existing">;
      existingId?: string;
      existingRow?: ReadRow;
      kind: keyof typeof shown;
    }> = [];
    for (const step of steps) {
      if (step.kind !== "add") continue;
      const match = matches.get(step.id);
      if (!match) continue;
      const incoming = sideOfRow(step.row, dataDate);
      if (match.earlier) {
        summary.withinFile += 1;
        if (shown.file < each && match.earlier.row) {
          shown.file += 1;
          wanted.push({
            kind: "file",
            existingRow: match.earlier.row,
            pair: { strength: "same", against: "file", incoming, distanceMeters: metersBetween(step.row, match.earlier.row) },
          });
        }
      }
      if (match.held.length > 0) {
        summary.held += 1;
        if (match.held.some((item) => item.listId === null || item.editedAt !== null)) summary.heldByHand += 1;
        if (shown.held < each) {
          shown.held += 1;
          wanted.push({
            kind: "held",
            existingId: match.held[0]!.id,
            pair: { strength: "same", against: "held", incoming, distanceMeters: metersBetween(step.row, match.held[0]!) },
          });
        }
      }
      if (match.possible) {
        summary.possible += 1;
        if (shown.possible < each) {
          shown.possible += 1;
          wanted.push({
            kind: "possible",
            existingId: match.possible.id,
            pair: { strength: "possible", against: "held", incoming, distanceMeters: metersBetween(step.row, match.possible) },
          });
        }
      }
    }
    const rows = new Map(rowsByIds(wanted.flatMap((item) => (item.existingId ? [item.existingId] : []))).map((row) => [row.id, row]));
    for (const item of wanted) {
      const existing = item.existingRow
        ? { ...sideOfRow(item.existingRow, dataDate) }
        : item.existingId && rows.has(item.existingId)
          ? sideOf(rows.get(item.existingId)!, lists)
          : null;
      if (existing) summary.examples.push({ ...item.pair, existing });
    }
    return summary;
  }

  /** The entry of a group that is kept unless the person says otherwise: of a list before by hand, the newest data first. */
  function keepOf(rows: Row[], lists: ReturnType<typeof listDates>): Row {
    const dateOf = (row: Row) => (row.listId ? (lists.get(row.listId)?.dataDate ?? 0) : -1);
    return [...rows].sort((a, b) => dateOf(b) - dateOf(a) || b.updatedAt - a.updatedAt || (a.id < b.id ? -1 : 1))[0]!;
  }

  /** Makes one entry of several, inside a transaction the caller opens. Returns how many were set aside. */
  function mergeRows(kept: Row, others: Row[], now: number): number {
    const before = fieldsOfRow(kept);
    const after = fold(foldable(kept), others.map(foldable));
    if (!sameFields(before, after)) {
      overwrite.run({
        id: kept.id,
        ...values(after, bandOfHz(after.outputHz)),
        sourceRow: kept.sourceRow,
        // An entry of a list that now holds something its list does not say is the person's, as if they had typed it.
        editedAt: kept.listId ? (kept.editedAt ?? now) : null,
        now,
      });
    }
    for (const other of others) {
      repoint.run({ into: kept.id, from: other.id });
      setAsideRow.run({ id: other.id, into: kept.id, now });
    }
    return others.length;
  }

  function warningsOf(reading: Reading): string[] {
    const warnings: string[] = [];
    const rows = reading.rows;
    if (rows.length === 0) return warnings;
    const placed = rows.filter((row) => row.lat !== null).length;
    if (placed === 0) {
      warnings.push(
        reading.format === "chirp"
          ? "CHIRP files hold no positions, so these will be in the list but not on the map, and have no distance. A locator or a position can be added to an entry by hand."
          : "No positions were found, so these will be in the list but not on the map, and have no distance.",
      );
    } else if (placed < rows.length) {
      warnings.push(`${(rows.length - placed).toLocaleString("en-GB")} of these have no position, and will not be on the map.`);
    }
    const rough = rows.filter((row) => (row.positionPrecisionMeters ?? 0) >= APPROXIMATE_POSITION_METERS).length;
    if (rough > 0) {
      warnings.push(
        `${rough.toLocaleString("en-GB")} of the positions are written to the nearest few kilometres or more (a short locator, or one decimal place). Lists do this on purpose for private sites. Outpost marks them as approximate.`,
      );
    }
    if (rows.every((row) => row.inputHz === null)) {
      warnings.push("No input frequencies or shifts were found, so only the frequency to listen on is known for these.");
    }
    if (rows.every((row) => row.modes.length === 0)) warnings.push("No modes were found. These cannot be filtered by mode.");
    return warnings;
  }

  // ── Fetched files, waiting for a decision ──

  interface FetchedFile {
    sourceId: string;
    text: string;
    url: string;
    fetchedAt: number;
    dataDate: number;
    sizeBytes: number;
    fileName: string;
    until: number;
  }
  /** Held in memory only: a file nobody has agreed to keep is not written anywhere. */
  const fetchedFiles = new Map<string, FetchedFile>();

  function fetchedFile(token: string): FetchedFile {
    const file = fetchedFiles.get(token);
    if (!file || file.until < Date.now()) {
      fetchedFiles.delete(token);
      throw new AppError("not_found", "That fetched list is no longer waiting: it is kept for half an hour. Press “Get the list” again.");
    }
    return file;
  }

  const uploadOf = (file: FetchedFile): RepeaterUpload => ({ text: file.text, fileName: file.fileName, sizeBytes: file.sizeBytes });

  const describeFetched = (token: string, file: FetchedFile, listId: string | null): RepeaterFetchedFile => ({
    token,
    sourceId: file.sourceId,
    url: file.url,
    fetchedAt: file.fetchedAt,
    dataDate: file.dataDate,
    sizeBytes: file.sizeBytes,
    fileName: file.fileName,
    listId,
    keptForMs: FETCHED_KEPT_MS,
  });

  function sourceOf(id: string): RepeaterSource {
    const source = deps.sources.sources.find((item) => item.id === id);
    if (!source) throw notFound("That source of repeater lists");
    return source;
  }

  /** The list Outpost holds from a source: the one most lately brought up to date, if there are several. */
  const heldFrom = (sourceId: string, lists: RepeaterListDto[]) =>
    lists.filter((list) => list.fetched?.sourceId === sourceId).sort((a, b) => b.updatedAt - a.updatedAt)[0];

  // ── Bringing a file in ──

  async function bringIn(upload: RepeaterUpload, options: ImportOptions, provenance: Provenance): Promise<RepeaterImportResult> {
    if (importing) throw conflict("Another list of repeaters is being brought in. Wait for it to finish, then try again.");
    importing = true;
    try {
      const existingList = options.listId ? listRow(options.listId) : null;
      const reading = await read(upload, options, existingList);
      if (reading.problem) throw badRequest(reading.problem);
      if (reading.rows.length === 0) {
        throw badRequest("None of the rows in that file could be kept as a repeater, so nothing was imported. The preview says why.");
      }
      const now = Date.now();
      const result = {
        added: 0,
        updated: 0,
        unchanged: 0,
        removed: 0,
        keptEdits: 0,
        replacedEdits: 0,
        duplicatesSetAside: 0,
        heldSetAside: 0,
        carriedEdits: 0,
      };
      const listId = existingList?.id ?? newId();
      const mappingText = JSON.stringify(reading.mapping);
      const dataDate = options.dataDate ?? now;
      const fetchedText = provenance.fetched ? JSON.stringify(provenance.fetched) : null;

      // An update is written a thousand rows at a time, so that a long list does not hold
      // up everything else the server is doing. If it cannot be finished, a list half
      // old and half new under the new date would be worse than either. So the list as
      // it is now is set aside first, in a table that lasts only as long as this
      // connection, and put back whole if anything below fails.
      const before = existingList ? setAside(listId) : null;

      if (existingList) {
        sqlite
          .prepare(
            `UPDATE repeater_lists SET name = ?, source = ?, source_url = ?, format = ?, mapping = ?, file_name = ?, data_date = ?,
               fetched = coalesce(?, fetched), updated_at = ?
             WHERE id = ?`,
          )
          .run(
            options.name?.trim() || existingList.name,
            options.source === undefined ? existingList.source : options.source.trim(),
            options.sourceUrl === undefined ? existingList.sourceUrl : options.sourceUrl,
            reading.format,
            mappingText,
            upload.fileName,
            dataDate,
            // A list brought up to date from a file keeps the record of the last time Outpost fetched it.
            fetchedText,
            now,
            listId,
          );
      } else {
        sqlite
          .prepare(
            `INSERT INTO repeater_lists (id, name, source, source_url, format, mapping, file_name, data_date, fetched, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            listId,
            options.name?.trim() || upload.fileName?.replace(/\.[a-z0-9]{1,5}$/i, "") || "Imported repeaters",
            options.source?.trim() ?? "",
            options.sourceUrl ?? null,
            reading.format,
            mappingText,
            upload.fileName,
            dataDate,
            fetchedText,
            now,
            now,
          );
      }

      try {
        const { steps, gone } = stepsOf(reading.rows, existingList ? existingOf(listId) : []);

        // What each new row is the same repeater as, and so how it goes in. Worked out before anything is written.
        const choice = options.duplicates ?? "keep-both";
        const matches = choice === "keep-both" ? new Map<string, Match>() : matchesOf(steps, existingList?.id ?? null);
        const lists = listDates();
        /** For a new row that is set aside: the entry shown in its place. */
        const into = new Map<string, string>();
        /** For a new row that takes the place of entries held elsewhere: those entries, to be set aside at the end. */
        const displaces = new Map<string, Row[]>();
        for (const step of steps) {
          if (step.kind !== "add") continue;
          const match = matches.get(step.id);
          if (!match) continue;
          if (match.earlier) {
            // The earlier row may itself have been set aside for something held: this one goes the same way.
            into.set(step.id, into.get(match.earlier.id) ?? match.earlier.id);
            continue;
          }
          if (match.held.length === 0) continue;
          const held = rowsByIds(match.held.map((item) => item.id)).filter((row) => row.removedAt === null);
          if (held.length === 0) continue;
          if (choice === "skip") {
            into.set(step.id, held[0]!.id);
            continue;
          }
          // The newer data is shown. A held entry of a list with later data than this file stays, and this row is set aside for it.
          const newer = held
            .filter((row) => row.listId && (lists.get(row.listId)?.dataDate ?? 0) > dataDate)
            .sort((a, b) => (lists.get(b.listId!)?.dataDate ?? 0) - (lists.get(a.listId!)?.dataDate ?? 0))[0];
          if (newer) into.set(step.id, newer.id);
          else displaces.set(step.id, held);
        }

        const apply = sqlite.transaction((batch: Step[]) => {
          for (const step of batch) {
            if (step.kind === "same") result.unchanged += 1;
            else if (step.kind === "edited-same") result.keptEdits += 1;
            else if (step.kind === "add") {
              const target = into.get(step.id);
              const held = displaces.get(step.id);
              // Only what the person typed is carried over: a new row is not filled in from another list's.
              const mine = held?.map(foldable).filter((item) => item.byHand.size > 0) ?? [];
              const fields =
                mine.length > 0 ? fold({ fields: fieldsOf(step.row), byHand: new Set() }, mine, { fillGaps: false }) : step.row;
              const carried = mine.length > 0 && !sameFields(fieldsOf(step.row), fields);
              insert.run({
                id: step.id,
                listId,
                sourceKey: step.row.key,
                ...values(fields, carried ? bandOfHz(fields.outputHz) : step.row.band),
                sourceRow: JSON.stringify(fieldsOf(step.row)),
                editedAt: carried ? now : null,
                removedAt: target ? now : null,
                mergedInto: target ?? null,
                now,
              });
              if (target) result.duplicatesSetAside += 1;
              else result.added += 1;
              if (carried) result.carriedEdits += 1;
            } else if (step.kind === "change") {
              overwrite.run({
                id: step.id,
                ...values(step.row, step.row.band),
                sourceRow: JSON.stringify(fieldsOf(step.row)),
                editedAt: null,
                now,
              });
              result.updated += 1;
            } else if (step.kind === "removed") {
              // Still removed or set aside; what the list says now is remembered in case it is brought back.
              overwrite.run({
                id: step.id,
                ...values(step.row, step.row.band),
                sourceRow: JSON.stringify(fieldsOf(step.row)),
                editedAt: null,
                now,
              });
            } else if (options.edited === "replace") {
              overwrite.run({
                id: step.existing.id,
                ...values(step.row, step.row.band),
                sourceRow: JSON.stringify(fieldsOf(step.row)),
                editedAt: null,
                now,
              });
              result.replacedEdits += 1;
            } else {
              // The person's version stays; what the list now says is kept beside it.
              setSourceRow.run(JSON.stringify(fieldsOf(step.row)), step.existing.id);
              result.keptEdits += 1;
            }
          }
        });
        for (let start = 0; start < steps.length; start += WRITE_BATCH) {
          apply(steps.slice(start, start + WRITE_BATCH));
          await yieldToEventLoop();
        }

        // No longer in the file: marks of removal have nothing left to guard, entries the person
        // changed are theirs and stay, and the rest go unless the person asked to keep them.
        const drop = gone.filter((item) => item.removedAt !== null || (item.editedAt === null && options.gone !== "keep"));
        result.removed = drop.filter((item) => item.removedAt === null).length;
        result.keptEdits += gone.filter((item) => item.removedAt === null && item.editedAt !== null).length;
        const remove = sqlite.prepare("DELETE FROM repeaters WHERE id = ?");
        const removeBatch = sqlite.transaction((ids: string[]) => {
          for (const id of ids) remove.run(id);
        });
        for (let start = 0; start < drop.length; start += WRITE_BATCH) {
          removeBatch(drop.slice(start, start + WRITE_BATCH).map((item) => item.id));
          await yieldToEventLoop();
        }

        // Last, and in one step, the only writes to entries of other lists: those this list's newer rows are
        // shown in place of are set aside. Everything above touched this list alone, which is what is put back
        // on failure; done here, a failure before this point leaves the other lists exactly as they were.
        if (displaces.size > 0) {
          result.heldSetAside = sqlite.transaction(() => {
            let count = 0;
            for (const [id, held] of displaces) {
              for (const row of held) {
                repoint.run({ into: id, from: row.id });
                count += setAsideRow.run({ id: row.id, into: id, now }).changes;
              }
            }
            return count;
          })();
        }
      } catch (error) {
        // A new list that could not be written whole is not left half there, and one
        // that was being brought up to date is put back as it was, its date included.
        if (before) before.putBack();
        else sqlite.prepare("DELETE FROM repeater_lists WHERE id = ?").run(listId);
        throw error;
      } finally {
        before?.discard();
      }
      // An entry that was shown in place of others may have left the list: those others are shown again.
      releaseOrphans();
      changed();
      return { list: toListDto(listRow(listId)), ...result, skipped: reading.skippedCount };
    } finally {
      importing = false;
    }
  }

  const service: RepeatersService = {
    overview() {
      const lists = listRows().map(toListDto);
      const live = "removed_at IS NULL";
      const one = (sql: string) => (sqlite.prepare(sql).get() as { n: number }).n;
      const bands: RepeatersOverview["bands"] = {};
      for (const row of sqlite.prepare(`SELECT band, count(*) AS n FROM repeaters WHERE ${live} GROUP BY band`).all() as Array<{
        band: RepeaterBand;
        n: number;
      }>) {
        bands[row.band] = row.n;
      }
      const modes: RepeatersOverview["modes"] = {};
      for (const mode of REPEATER_MODE_IDS) {
        const n = (sqlite.prepare(`SELECT count(*) AS n FROM repeaters WHERE ${live} AND modes LIKE ?`).get(`%,${mode},%`) as { n: number })
          .n;
        if (n > 0) modes[mode] = n;
      }
      return {
        lists,
        ownCount: one(`SELECT count(*) AS n FROM repeaters WHERE ${live} AND list_id IS NULL`),
        total: one(`SELECT count(*) AS n FROM repeaters WHERE ${live}`),
        withPosition: one(`SELECT count(*) AS n FROM repeaters WHERE ${live} AND lat IS NOT NULL`),
        bands,
        modes,
      };
    },

    list(query) {
      return select(query, MAX_PAGE);
    },

    get(id) {
      const row = rowOf(id);
      const asListed = row.editedAt !== null ? parseSource(row.sourceRow) : null;
      const merged = sqlite
        .prepare(
          `SELECT r.id AS id, r.callsign AS callsign, r.output_hz AS outputHz, l.name AS listName, l.data_date AS dataDate
           FROM repeaters r LEFT JOIN repeater_lists l ON l.id = r.list_id WHERE r.merged_into = ? ORDER BY r.callsign, r.id`,
        )
        .all(id) as RepeaterDetailResponse["merged"];
      return { repeater: toDto(row), list: row.listId ? toListDto(listRow(row.listId)) : null, asListed, merged };
    },

    create(input) {
      const blank: RepeaterFields = {
        callsign: "",
        outputHz: input.outputHz,
        inputHz: null,
        modes: [],
        ctcssHz: null,
        dcsCode: null,
        dmrColourCode: null,
        talkgroups: "",
        accessNote: "",
        channel: "",
        place: "",
        region: "",
        country: "",
        lat: null,
        lon: null,
        locator: "",
        positionPrecisionMeters: null,
        antennaMeters: null,
        keeper: "",
        status: "unknown",
        statusText: "",
        notes: "",
      };
      const fields = merge(blank, input);
      const id = newId();
      insert.run({
        id,
        listId: null,
        sourceKey: null,
        ...values(fields, bandOfHz(fields.outputHz)),
        sourceRow: null,
        editedAt: null,
        ...SHOWN,
        now: Date.now(),
      });
      changed();
      return toDto(rowOf(id));
    },

    update(id, patch) {
      const row = rowOf(id);
      const current = fieldsOfRow(row);
      const next = merge(current, patch);
      if (sameFields(current, next)) return toDto(row);
      overwrite.run({
        id,
        ...values(next, bandOfHz(next.outputHz)),
        sourceRow: row.sourceRow,
        // An entry from a list is now the person's: an update of the list will leave it alone.
        editedAt: row.listId ? Date.now() : null,
        now: Date.now(),
      });
      changed();
      return toDto(rowOf(id));
    },

    revert(id) {
      const row = rowOf(id);
      const listed = parseSource(row.sourceRow);
      if (!row.listId || row.editedAt === null || !listed) {
        throw badRequest("This entry has nothing to go back to: it was entered by hand, or it is as its list has it.");
      }
      overwrite.run({ id, ...values(listed, bandOfHz(listed.outputHz)), sourceRow: row.sourceRow, editedAt: null, now: Date.now() });
      changed();
      return toDto(rowOf(id));
    },

    remove(id) {
      const row = rowOf(id);
      // An entry of a list is kept as a mark, so the next update of the list does not bring it back.
      if (row.listId) sqlite.prepare("UPDATE repeaters SET removed_at = ?, updated_at = ? WHERE id = ?").run(Date.now(), Date.now(), id);
      else {
        sqlite.transaction(() => {
          // Removing a repeater removes it, not one of its listings: what was set aside for it stays out of sight.
          // Those of a list stay as marks, as if removed by hand; those made by hand have nothing left to guard.
          sqlite.prepare("UPDATE repeaters SET merged_into = NULL WHERE merged_into = ? AND list_id IS NOT NULL").run(id);
          sqlite.prepare("DELETE FROM repeaters WHERE merged_into = ? AND list_id IS NULL").run(id);
          sqlite.prepare("DELETE FROM repeaters WHERE id = ?").run(id);
        })();
      }
      changed();
    },

    duplicates() {
      const held = heldEntries(null);
      const groups = groupSame(held);
      const groupOf = new Map(groups.flatMap((group, index) => group.map((item) => [item.id, index] as const)));
      // A pair is not offered as possibly one when the two are already in one group: they are the same,
      // and are listed as that. Two entries of different groups may still be one repeater under two callsigns.
      const pairs = pairsPossiblySame(held).filter(([a, b]) => groupOf.get(a.id) === undefined || groupOf.get(a.id) !== groupOf.get(b.id));
      const lists = listDates();
      const order = (a: Held[], b: Held[]) => a[0]!.callsign.localeCompare(b[0]!.callsign) || a[0]!.outputHz - b[0]!.outputHz;
      const build = (sets: Held[][], strength: RepeaterDuplicateGroup["strength"]): RepeaterDuplicateGroup[] => {
        const shown = [...sets].sort(order).slice(0, DUPLICATE_GROUPS_SHOWN);
        const rows = new Map(rowsByIds(shown.flat().map((item) => item.id)).map((row) => [row.id, row]));
        return shown.flatMap((set) => {
          const members = set.map((item) => rows.get(item.id)).filter((row): row is Row => row !== undefined);
          if (members.length < 2) return [];
          let spread: number | null = null;
          for (const a of members) {
            for (const b of members) {
              const meters = a.id < b.id ? metersBetween(matchable(toDto(a)), matchable(toDto(b))) : null;
              if (meters !== null) spread = Math.max(spread ?? 0, meters);
            }
          }
          return [
            {
              key: members
                .map((row) => row.id)
                .sort()
                .join("+"),
              strength,
              entries: members.map((row) => sideOf(row, lists)),
              keepId: keepOf(members, lists).id,
              spreadMeters: spread === null ? null : Math.round(spread),
            },
          ];
        });
      };
      return {
        same: build(groups, "same"),
        sameTotal: groups.length,
        possible: build(
          pairs.map(([a, b]) => [a, b]),
          "possible",
        ),
        possibleTotal: pairs.length,
      };
    },

    merge({ keepId, mergeIds }) {
      const ids = [...new Set(mergeIds)].filter((id) => id !== keepId);
      if (ids.length === 0) throw badRequest("Choose at least two entries to make into one.");
      if (ids.length >= MAX_MERGE) throw badRequest(`No more than ${MAX_MERGE} entries are merged at once.`);
      const kept = rowOf(keepId);
      const others = ids.map((id) => rowOf(id));
      const base = matchable(toDto(kept));
      for (const other of others) {
        const candidate = matchable(toDto(other));
        if (!isSame(base, candidate) && !isPossiblySame(base, candidate)) {
          throw badRequest(
            `${other.callsign} on ${formatMHz(other.outputHz)} MHz and ${kept.callsign} on ${formatMHz(kept.outputHz)} MHz are not on one frequency at one place, so Outpost will not make one entry of them.`,
          );
        }
      }
      const setAside = sqlite.transaction(() => mergeRows(kept, others, Date.now()))();
      changed();
      return { merged: 1, setAside, kept: [keepId] };
    },

    async mergeAll() {
      if (importing) throw conflict("A list of repeaters is being brought in. Wait for it to finish, then try again.");
      importing = true;
      try {
        const lists = listDates();
        const groups = groupSame(heldEntries(null));
        const result: RepeaterMergeResult = { merged: 0, setAside: 0, kept: [] };
        const now = Date.now();
        const apply = sqlite.transaction((batch: Held[][]) => {
          for (const set of batch) {
            // Read again here: an earlier group of this run, or a person, may have changed them since they were gathered.
            const rows = rowsByIds(set.map((item) => item.id)).filter((row) => row.removedAt === null);
            if (rows.length < 2) continue;
            const kept = keepOf(rows, lists);
            result.setAside += mergeRows(
              kept,
              rows.filter((row) => row.id !== kept.id),
              now,
            );
            result.merged += 1;
            if (result.kept.length < 200) result.kept.push(kept.id);
          }
        });
        for (let start = 0; start < groups.length; start += 200) {
          apply(groups.slice(start, start + 200));
          await yieldToEventLoop();
        }
        if (result.merged > 0) changed();
        return result;
      } finally {
        importing = false;
      }
    },

    separate(id) {
      rowOf(id);
      const { changes } = sqlite
        .prepare("UPDATE repeaters SET removed_at = NULL, merged_into = NULL, updated_at = ? WHERE merged_into = ?")
        .run(Date.now(), id);
      if (changes > 0) changed();
      return { separated: changes };
    },

    overlay({ bbox, near, withinKm, ...filter }) {
      const [west, south, east, north] = bbox;
      const where = whereOf(filter);
      // A view that spans the 180° meridian has its west edge east of its east edge.
      const box = west <= east ? "r.lon >= ? AND r.lon <= ?" : "(r.lon >= ? OR r.lon <= ?)";
      // Within a distance of a place, as the list has it: measured exactly, after the cheaper box.
      const ring = near && withinKm !== undefined ? " AND repeater_meters(?, ?, r.lat, r.lon) <= ?" : "";
      const sql = `${where.sql} AND r.lat >= ? AND r.lat <= ? AND ${box}${ring}`;
      const args = [
        ...where.args,
        south,
        north,
        west,
        east,
        ...(near && withinKm !== undefined ? [near.lat, near.lon, withinKm * 1000] : []),
      ];
      const total = (sqlite.prepare(`SELECT count(*) AS n FROM repeaters r WHERE ${sql}`).get(...args) as { n: number }).n;
      const pointColumns =
        "r.id AS id, r.callsign AS callsign, r.lat AS lat, r.lon AS lon, r.output_hz AS outputHz, r.band AS band, r.status AS status";
      if (total <= REPEATER_OVERLAY_POINTS) {
        const points = sqlite.prepare(`SELECT ${pointColumns} FROM repeaters r WHERE ${sql} ORDER BY r.id`).all(...args) as RepeaterPoint[];
        return { total, points, cells: [] };
      }
      // Too many to tell apart: count them by patch. Patches are a power of two of a degree
      // on a fixed grid, about eight to the height of the view, so they do not shift as the map is dragged.
      const height = Math.max(north - south, 1e-6);
      const latSize = 2 ** Math.round(Math.log2(height / 8));
      const middle = Math.min(85, Math.abs((south + north) / 2));
      const lonSize = 2 ** Math.round(Math.log2(latSize / Math.cos((middle * Math.PI) / 180)));
      const patches = sqlite
        .prepare(
          `SELECT count(*) AS count, avg(r.lat) AS lat, avg(r.lon) AS lon, min(r.id) AS id
           FROM repeaters r WHERE ${sql}
           GROUP BY CAST((r.lat + 90) / ? AS INTEGER), CAST((r.lon + 180) / ? AS INTEGER)`,
        )
        .all(...args, latSize, lonSize) as Array<{ count: number; lat: number; lon: number; id: string }>;
      // A patch with one repeater in it is that repeater.
      const alone = patches.filter((patch) => patch.count === 1).map((patch) => patch.id);
      const points =
        alone.length === 0
          ? []
          : (sqlite
              .prepare(`SELECT ${pointColumns} FROM repeaters r WHERE r.id IN (${alone.map(() => "?").join(",")})`)
              .all(...alone) as RepeaterPoint[]);
      return {
        total,
        points,
        cells: patches
          .filter((patch) => patch.count > 1)
          .map((patch) => ({ lat: Number(patch.lat.toFixed(5)), lon: Number(patch.lon.toFixed(5)), count: patch.count })),
      };
    },

    async preview(upload, options) {
      const list = options.listId ? listRow(options.listId) : null;
      const reading = await read(upload, options, list);
      const bands: RepeaterImportPreview["bands"] = {};
      for (const row of reading.rows) bands[row.band] = (bands[row.band] ?? 0) + 1;
      const warnings = warningsOf(reading);
      if (reading.problem) warnings.unshift(reading.problem);
      return {
        fileName: upload.fileName,
        sizeBytes: upload.sizeBytes,
        format: reading.format,
        formatName: REPEATER_FORMAT_NAMES[reading.format],
        columns: reading.columns,
        mapping: reading.mapping,
        rows: reading.total,
        usable: reading.rows.length,
        skippedCount: reading.skippedCount,
        skipped: reading.skipped,
        sample: reading.rows.slice(0, SAMPLE_ROWS).map(({ key: _key, ...row }) => row),
        withPosition: reading.rows.filter((row) => row.lat !== null).length,
        approximatePositions: reading.rows.filter((row) => (row.positionPrecisionMeters ?? 0) >= APPROXIMATE_POSITION_METERS).length,
        bands,
        warnings,
        ...(() => {
          if (reading.problem) return { update: null, duplicates: { held: 0, heldByHand: 0, withinFile: 0, possible: 0, examples: [] } };
          const { steps, gone } = stepsOf(reading.rows, list ? existingOf(list.id) : []);
          return {
            update: list ? planOf(list, steps, gone) : null,
            duplicates: duplicatesOf(steps, matchesOf(steps, list?.id ?? null), options.dataDate ?? Date.now()),
          };
        })(),
      };
    },

    importFile(upload, options) {
      return bringIn(upload, options, {});
    },

    sources() {
      const lists = listRows().map(toListDto);
      return {
        regions: deps.sources.regions,
        problems: deps.sources.problems,
        sources: deps.sources.sources.map(({ allowHost: _allowHost, ...source }) => {
          const held = heldFrom(source.id, lists);
          return {
            ...source,
            held: held?.fetched
              ? { listId: held.id, name: held.name, dataDate: held.dataDate, fetchedAt: held.fetched.fetchedAt, count: held.count }
              : null,
          };
        }),
      };
    },

    async fetchSource(sourceId, signal) {
      const source = sourceOf(sourceId);
      const got = await deps.fetcher.get(source, { signal });
      const now = Date.now();
      for (const [token, file] of fetchedFiles) if (file.sourceId === sourceId || file.until < now) fetchedFiles.delete(token);
      while (fetchedFiles.size >= FETCHED_HELD) fetchedFiles.delete(fetchedFiles.keys().next().value!);
      // Not guessable from outside, and not a secret either: it names a file every screen of this server may read.
      const token = createHash("sha256").update(`${newId()}|${now}|${got.sizeBytes}`).digest("hex").slice(0, 32);
      const file: FetchedFile = {
        sourceId,
        text: got.text,
        url: got.url,
        fetchedAt: now,
        // The publisher's own date for the file where it gives one; otherwise the file was made when it was asked for.
        dataDate: got.lastModified ?? now,
        sizeBytes: got.sizeBytes,
        fileName: got.fileName,
        until: now + FETCHED_KEPT_MS,
      };
      fetchedFiles.set(token, file);
      const listId = heldFrom(sourceId, listRows().map(toListDto))?.id ?? null;
      let preview: RepeaterImportPreview;
      try {
        preview = await service.preview(uploadOf(file), { listId: listId ?? undefined, dataDate: file.dataDate });
      } catch (error) {
        fetchedFiles.delete(token);
        if (error instanceof AppError) {
          throw new AppError(
            "upstream",
            `${source.fetch?.host ?? "The source"} sent a file, but it is not the list Outpost expected: ${error.message} Nothing was kept.`,
          );
        }
        throw error;
      }
      return { fetched: describeFetched(token, file, listId), preview };
    },

    previewFetched(token, options) {
      const file = fetchedFile(token);
      return service.preview(uploadOf(file), { ...options, dataDate: options.dataDate ?? file.dataDate });
    },

    async importFetched(token, options) {
      const file = fetchedFile(token);
      const source = sourceOf(file.sourceId);
      const result = await bringIn(
        uploadOf(file),
        {
          ...options,
          name: options.name?.trim() || source.name,
          source: options.source?.trim() || source.publisher,
          sourceUrl: source.pageUrl,
          dataDate: options.dataDate ?? file.dataDate,
        },
        {
          fetched: {
            sourceId: source.id,
            url: file.url,
            fetchedAt: file.fetchedAt,
            sizeBytes: file.sizeBytes,
            publisher: source.publisher,
            termsUrl: source.termsUrl,
            termsNote: source.termsNote,
            termsRead: source.termsRead,
            attribution: source.attribution,
          },
        },
      );
      fetchedFiles.delete(token);
      return result;
    },

    discardFetched(token) {
      fetchedFiles.delete(token);
    },

    updateList(id, patch) {
      const row = listRow(id);
      const name = patch.name === undefined ? row.name : patch.name.trim();
      if (!name) throw badRequest("Give the list a name.");
      sqlite
        .prepare("UPDATE repeater_lists SET name = ?, source = ?, source_url = ?, data_date = ?, updated_at = ? WHERE id = ?")
        .run(
          name,
          patch.source === undefined ? row.source : patch.source.trim(),
          patch.sourceUrl === undefined ? row.sourceUrl : patch.sourceUrl,
          patch.dataDate ?? row.dataDate,
          Date.now(),
          id,
        );
      changed();
      return toListDto(listRow(id));
    },

    removeList(id) {
      const row = listRow(id);
      // The rows go with the list (the foreign key says so), the person's changes to them included.
      sqlite.prepare("DELETE FROM repeater_lists WHERE id = ?").run(id);
      // A repeater this list was shown for, that another list or the person also has, is shown from there again.
      releaseOrphans();
      changed();
      return { removed: row.count };
    },

    restoreRemoved(listId) {
      listRow(listId);
      const { changes } = sqlite
        // Not those set aside as duplicates: they were not removed, and come back by being separated.
        .prepare(
          "UPDATE repeaters SET removed_at = NULL, updated_at = ? WHERE list_id = ? AND removed_at IS NOT NULL AND merged_into IS NULL",
        )
        .run(Date.now(), listId);
      if (changes > 0) changed();
      return { restored: changes };
    },

    exportFile({ format, ...query }) {
      const lists = new Map(listRows().map((row) => [row.id, toListDto(row)]));
      const cap = format === "chirp" ? MAX_CHIRP_ROWS : 100_000;
      const { repeaters } = select({ ...query, limit: Math.min(query.limit ?? cap, cap), offset: 0 }, cap);
      if (repeaters.length === 0) throw new AppError("not_found", "No repeaters match, so there is nothing to export.");
      const day = new Date().toISOString().slice(0, 10);
      return format === "chirp"
        ? { filename: `repeaters-chirp-${day}.csv`, body: toChirpCsv(repeaters, { lists }), count: repeaters.length }
        : { filename: `repeaters-outpost-${day}.csv`, body: toOutpostCsv(repeaters, { lists }), count: repeaters.length };
    },

    search(q, limit) {
      const tokens = tokensOf(q);
      if (tokens.length === 0) return [];
      // Asked on every search of the library, so it counts nothing: one look for the best few.
      const repeaters = inCallsignOrder({ q }, whereOf({ q }), Math.min(limit, 50), 0).map(toDto);
      if (repeaters.length === 0) return [];
      const lists = new Map(
        (
          sqlite.prepare("SELECT id, name, source, data_date AS dataDate FROM repeater_lists").all() as Array<{
            id: string;
            name: string;
            source: string;
            dataDate: number;
          }>
        ).map((row) => [row.id, row]),
      );
      const words = tokens.filter((token) => token.kind === "text").map((token) => token.text);
      return repeaters.map((repeater, index) => {
        const list = repeater.listId ? lists.get(repeater.listId) : undefined;
        const from = list
          ? `From ${list.source || list.name}, data of ${new Date(list.dataDate).toISOString().slice(0, 10)}.`
          : "Entered by hand.";
        const access = [
          repeater.modes.map(modeName).join(", "),
          `shift ${formatShift(repeater.outputHz, repeater.inputHz)}`,
          repeater.ctcssHz !== null ? `CTCSS ${repeater.ctcssHz.toFixed(1)} Hz` : "",
          repeater.dmrColourCode !== null ? `colour code ${repeater.dmrColourCode}` : "",
        ]
          .filter(Boolean)
          .join(", ");
        return {
          kind: "repeater",
          entityId: repeater.id,
          title: repeater.callsign,
          titleSegments: [{ text: repeater.callsign, hit: words.some((word) => repeater.callsign.toLowerCase().includes(word)) }],
          subtitle: [`${formatMHz(repeater.outputHz)} MHz`, repeater.place].filter(Boolean).join(", "),
          collection: "Repeaters",
          url: `/radio/repeaters/${repeater.id}`,
          tags: [],
          score: 1 - index / Math.max(repeaters.length, 1),
          passages: [{ chunkId: null, segments: [{ text: `${access}. ${from}`, hit: false }], page: null, heading: null }],
          sources: ["keyword"],
        } satisfies SearchResult;
      });
    },

    count() {
      const one = (sql: string) => (sqlite.prepare(sql).get() as { n: number }).n;
      return {
        repeaters: one("SELECT count(*) AS n FROM repeaters WHERE removed_at IS NULL"),
        lists: one("SELECT count(*) AS n FROM repeater_lists"),
      };
    },

    async eraseAll() {
      // A file being brought in is let finish first, so that it does not write into a list that has gone.
      for (let waited = 0; importing && waited < 600; waited += 1) await new Promise((resolve) => setTimeout(resolve, 100));
      const erased = service.count();
      sqlite.transaction(() => {
        // Marks of removal go too: they are rows of the same table.
        sqlite.prepare("DELETE FROM repeaters").run();
        sqlite.prepare("DELETE FROM repeater_lists").run();
      })();
      changed();
      return erased;
    },
  };

  return service;
}
