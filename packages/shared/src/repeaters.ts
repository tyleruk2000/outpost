/**
 * Repeaters: amateur radio stations that receive on one frequency and send what they
 * hear on another. Outpost keeps the ones a person has imported from a file or entered
 * by hand, in its own database, and uses them with no connection.
 *
 * Two words are used the same way everywhere, because lists disagree about them:
 *
 * - the **output** is the frequency the repeater transmits on, which is the one a
 *   person listens on;
 * - the **input** is the frequency the repeater listens on, which is the one a person
 *   transmits on.
 *
 * Frequencies are whole hertz, so that two readings of the same list compare equal.
 */

// ── Bands ───────────────────────────────────────────────────────────────────

/**
 * Names for stretches of spectrum, used to group and filter entries. A band here is a
 * label for a frequency, taken from the widest of the United Kingdom, United States and
 * international ranges in the bundled band sheets. It says nothing about who may
 * transmit where: that is in the sheets, and in the licence.
 *
 * The importer also leans on this table to read a number that comes with no unit (see
 * `readFrequency` in the server's repeaters module): no number may be in a band both as
 * megahertz and as kilohertz, or as kilohertz and as hertz. A test holds that true.
 */
export const REPEATER_BANDS = [
  { id: "10m", name: "10 m", fromMHz: 28, toMHz: 29.7 },
  { id: "6m", name: "6 m", fromMHz: 50, toMHz: 54 },
  { id: "4m", name: "4 m", fromMHz: 70, toMHz: 70.5 },
  { id: "2m", name: "2 m", fromMHz: 144, toMHz: 148 },
  { id: "1.25m", name: "1.25 m", fromMHz: 219, toMHz: 225 },
  { id: "70cm", name: "70 cm", fromMHz: 420, toMHz: 450 },
  { id: "33cm", name: "33 cm", fromMHz: 902, toMHz: 928 },
  { id: "23cm", name: "23 cm", fromMHz: 1240, toMHz: 1325 },
  { id: "13cm", name: "13 cm", fromMHz: 2300, toMHz: 2450 },
  { id: "9cm", name: "9 cm", fromMHz: 3300, toMHz: 3500 },
  { id: "5cm", name: "5 cm", fromMHz: 5650, toMHz: 5925 },
  { id: "3cm", name: "3 cm", fromMHz: 10_000, toMHz: 10_500 },
  { id: "1.2cm", name: "1.2 cm", fromMHz: 24_000, toMHz: 24_250 },
  { id: "6mm", name: "6 mm", fromMHz: 47_000, toMHz: 47_200 },
  { id: "4mm", name: "4 mm", fromMHz: 75_500, toMHz: 81_000 },
  { id: "2.5mm", name: "2.5 mm", fromMHz: 122_250, toMHz: 123_000 },
  { id: "2mm", name: "2 mm", fromMHz: 134_000, toMHz: 141_000 },
  { id: "1mm", name: "1 mm", fromMHz: 241_000, toMHz: 250_000 },
] as const;

export type RepeaterBand = (typeof REPEATER_BANDS)[number]["id"] | "other";

export const REPEATER_BAND_IDS: readonly RepeaterBand[] = [...REPEATER_BANDS.map((band) => band.id), "other"];

/** The band a frequency falls in, or "other" when it is in none of them. */
export function bandOfHz(hz: number): RepeaterBand {
  const mhz = hz / 1e6;
  return REPEATER_BANDS.find((band) => mhz >= band.fromMHz && mhz <= band.toMHz)?.id ?? "other";
}

export function bandName(band: RepeaterBand): string {
  return REPEATER_BANDS.find((item) => item.id === band)?.name ?? "Other bands";
}

/** A band as lists write it ("70CM", "2 m", "23cm"), or null when it is not one of ours. */
export function parseBand(text: string): RepeaterBand | null {
  const tidy = text
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/metres?|meters?/, "m");
  if (tidy === "6cm") return "5cm";
  return REPEATER_BANDS.find((band) => band.id === tidy)?.id ?? null;
}

// ── Modes ───────────────────────────────────────────────────────────────────

export const REPEATER_MODES = [
  { id: "fm", name: "FM" },
  { id: "dmr", name: "DMR" },
  { id: "dstar", name: "D-STAR" },
  { id: "fusion", name: "Fusion" },
  { id: "nxdn", name: "NXDN" },
  { id: "p25", name: "P25" },
  { id: "m17", name: "M17" },
  { id: "tetra", name: "TETRA" },
] as const;

export type RepeaterMode = (typeof REPEATER_MODES)[number]["id"];

export const REPEATER_MODE_IDS: readonly RepeaterMode[] = REPEATER_MODES.map((mode) => mode.id);

export function modeName(mode: RepeaterMode): string {
  return REPEATER_MODES.find((item) => item.id === mode)?.name ?? mode;
}

// ── Status ──────────────────────────────────────────────────────────────────

/**
 * What the list said about the repeater on the list's date. It is never what is on the
 * air now: Outpost has no way to know that.
 */
export const REPEATER_STATUSES = ["operational", "reduced", "off-air", "unknown"] as const;
export type RepeaterStatus = (typeof REPEATER_STATUSES)[number];

export const REPEATER_STATUS_NAMES: Record<RepeaterStatus, string> = {
  operational: "Listed as operational",
  reduced: "Listed as on reduced output",
  "off-air": "Listed as not operational",
  unknown: "No status in the list",
};

// ── What is held ────────────────────────────────────────────────────────────

export interface RepeaterDto {
  id: string;
  /** The imported list it came from; null for an entry made by hand. */
  listId: string | null;
  callsign: string;
  /** The frequency the repeater transmits on, in hertz: the one to listen on. */
  outputHz: number;
  /** The frequency it listens on: the one to transmit on. Equal to the output for a simplex station; null when not known. */
  inputHz: number | null;
  band: RepeaterBand;
  modes: RepeaterMode[];
  /** The sub-audible tone to send, in hertz. */
  ctcssHz: number | null;
  /** The digital squelch code to send, as three digits ("023"). */
  dcsCode: string | null;
  dmrColourCode: number | null;
  /** DMR talkgroups, as the list or the person wrote them. */
  talkgroups: string;
  /** Anything else needed to get in: a tone burst, a D-STAR module, a Fusion group. */
  accessNote: string;
  /** The channel's name in the band plan, where the list gives one ("RV53"). */
  channel: string;
  /** The town or site, as listed. */
  place: string;
  region: string;
  country: string;
  lat: number | null;
  lon: number | null;
  /** The Maidenhead locator as listed. Empty when the list gives none. */
  locator: string;
  /**
   * How far the real site may be from the listed position, in metres, judged from how
   * the list wrote it: half the last decimal place of its coordinates, or half the
   * width of its locator square. Lists blur the positions of private sites on purpose.
   * Null when there is no position.
   */
  positionPrecisionMeters: number | null;
  /** Height of the aerial above the ground, in metres, where the list gives it. */
  antennaMeters: number | null;
  keeper: string;
  status: RepeaterStatus;
  /** The status in the list's own words. */
  statusText: string;
  notes: string;
  /** Changed by the person since it came from its list. An update of the list leaves it alone unless told otherwise. */
  edited: boolean;
  createdAt: number;
  updatedAt: number;
  /** From the place the list was asked about, when one was given and this entry has a position. */
  distanceMeters?: number;
  /** Compass bearing from that place to the repeater, in degrees. */
  bearingDegrees?: number;
}

/** A list of repeaters brought in from a file. */
export interface RepeaterListDto {
  id: string;
  name: string;
  /** Who publishes the list, as the person wrote it when importing. */
  source: string;
  sourceUrl: string | null;
  /** The layout the file was read as: see `RepeaterFormatId`. */
  format: RepeaterFormatId;
  formatName: string;
  fileName: string | null;
  /** The day the data is from, as milliseconds: the date on the list, not the day it was imported. */
  dataDate: number;
  importedAt: number;
  updatedAt: number;
  /** Entries in use: those the person removed are not counted. */
  count: number;
  /** Entries the person has changed. */
  editedCount: number;
  /** Entries set aside because each is the same repeater as an entry held elsewhere. They are not shown or counted. */
  setAsideCount: number;
  /** Where Outpost fetched the list from, when it did. Null for a list that came from a file the person chose. */
  fetched: RepeaterListFetch | null;
}

/** What is recorded when Outpost fetches a list: where from, when, and the publisher's terms as they were read. */
export interface RepeaterListFetch {
  /** The id of the declared source: see `RepeaterSourceDto`. */
  sourceId: string;
  /** The address the file was fetched from, after any redirect. */
  url: string;
  /** When it was fetched, as milliseconds. */
  fetchedAt: number;
  sizeBytes: number;
  publisher: string;
  /** The page the terms were read on, what they say in short, and the day they were read. */
  termsUrl: string;
  termsNote: string;
  termsRead: string;
  /** What the publisher asks to be said about its data, if anything. */
  attribution: string;
}

export interface RepeatersOverview {
  lists: RepeaterListDto[];
  /** Entries made by hand. */
  ownCount: number;
  total: number;
  withPosition: number;
  bands: Partial<Record<RepeaterBand, number>>;
  modes: Partial<Record<RepeaterMode, number>>;
}

export interface RepeaterListResponse {
  total: number;
  repeaters: RepeaterDto[];
  /** How many of `total` have no position, and so no distance. They come last when sorted by distance. */
  withoutPosition: number;
}

export interface RepeaterDetailResponse {
  repeater: RepeaterDto;
  list: RepeaterListDto | null;
  /** What the list said, when the person has changed the entry: for showing the difference and for putting it back. */
  asListed: RepeaterFields | null;
  /** Entries that were merged into this one, and are set aside. `separate` brings them back. */
  merged: RepeaterMergedEntry[];
}

/** An entry set aside because it is the same repeater as another. */
export interface RepeaterMergedEntry {
  id: string;
  callsign: string;
  outputHz: number;
  /** The list it is in; null for an entry made by hand. */
  listName: string | null;
  dataDate: number | null;
}

/** The parts of an entry a person or a list can set. */
export interface RepeaterFields {
  callsign: string;
  outputHz: number;
  inputHz: number | null;
  modes: RepeaterMode[];
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
  positionPrecisionMeters: number | null;
  antennaMeters: number | null;
  keeper: string;
  status: RepeaterStatus;
  statusText: string;
  notes: string;
}

// ── On the map ──────────────────────────────────────────────────────────────

export interface RepeaterPoint {
  id: string;
  callsign: string;
  lat: number;
  lon: number;
  outputHz: number;
  band: RepeaterBand;
  status: RepeaterStatus;
}

/** A patch of the map with too many repeaters to draw one by one: how many, and where their middle is. */
export interface RepeaterCell {
  lat: number;
  lon: number;
  count: number;
}

/**
 * `GET /api/repeaters/overlay`: what to draw in a box of the map. Each repeater when
 * there are few enough to tell apart, otherwise counts by patch.
 */
export interface RepeaterOverlayResponse {
  total: number;
  points: RepeaterPoint[];
  cells: RepeaterCell[];
}

/** No more repeaters than this are drawn one by one in a view; beyond it they are counted by patch. */
export const REPEATER_OVERLAY_POINTS = 400;

// ── Bringing a file in ──────────────────────────────────────────────────────

/**
 * The layouts a file can be read as.
 *
 * - `etcc-status`, `etcc-voice`, `etcc-all`: three of the CSV files the RSGB's ETCC
 *   offers on ukrepeater.net, recognised by their headings.
 * - `chirp`: the CSV that CHIRP, the radio programming software, reads and writes.
 * - `outpost`: Outpost's own export, which carries every field.
 * - `hearham`: the JSON list hearham.com offers to applications.
 * - `wia`: the CSV of the Wireless Institute of Australia's repeater directory.
 * - `csv`: any other CSV with a row of headings; its columns are matched by name and
 *   the person can correct the matching.
 * - `json`: any other JSON file that is a list of records; its field names are matched
 *   the same way.
 */
export const REPEATER_FORMAT_IDS = ["etcc-status", "etcc-voice", "etcc-all", "chirp", "outpost", "hearham", "wia", "csv", "json"] as const;
export type RepeaterFormatId = (typeof REPEATER_FORMAT_IDS)[number];

export const REPEATER_FORMAT_NAMES: Record<RepeaterFormatId, string> = {
  "etcc-status": "RSGB ETCC list: voice repeaters and gateways, with status",
  "etcc-voice": "RSGB ETCC list: voice repeaters",
  "etcc-all": "RSGB ETCC list: all modes",
  chirp: "CHIRP CSV",
  outpost: "Outpost repeater export",
  hearham: "Hearham repeater list (JSON)",
  wia: "WIA repeater directory (CSV)",
  csv: "CSV with headings",
  json: "JSON list of records",
};

/** The layouts whose columns are matched by what their names usually mean, and so may need correcting. */
export const isGuessedRepeaterFormat = (format: RepeaterFormatId): boolean => format === "csv" || format === "json";

/** What a column of a file can be read as. */
export const REPEATER_COLUMN_FIELDS = [
  "id",
  "callsign",
  "output",
  "input",
  "offset",
  "duplex",
  "band",
  "modes",
  "ctcss",
  "toneMode",
  "dcs",
  "colourCode",
  "toneOrColourCode",
  "talkgroups",
  "accessNote",
  "channel",
  "place",
  "region",
  "country",
  "lat",
  "lon",
  "locator",
  "antenna",
  "keeper",
  "status",
  "notes",
] as const;
export type RepeaterColumnField = (typeof REPEATER_COLUMN_FIELDS)[number];

export const REPEATER_COLUMN_FIELD_NAMES: Record<RepeaterColumnField, string> = {
  id: "The list's own number for the entry",
  callsign: "Callsign",
  output: "Output frequency (the repeater transmits)",
  input: "Input frequency (the repeater listens)",
  offset: "Shift from output to input",
  duplex: "Direction of the shift (+, - or split)",
  band: "Band",
  modes: "Modes",
  ctcss: "CTCSS tone",
  toneMode: "Which tone is used (CHIRP's Tone column)",
  dcs: "DCS code",
  colourCode: "DMR colour code",
  toneOrColourCode: "CTCSS tone or DMR colour code, in one column",
  talkgroups: "DMR talkgroups",
  accessNote: "Other access details",
  channel: "Channel name",
  place: "Town or site",
  region: "Region",
  country: "Country",
  lat: "Latitude",
  lon: "Longitude",
  locator: "Maidenhead locator",
  antenna: "Aerial height above ground, metres",
  keeper: "Keeper",
  status: "Status",
  notes: "Notes",
};

/** Which column of the file each field is read from, by the column's heading. */
export type RepeaterColumnMap = Partial<Record<RepeaterColumnField, string>>;

/** One row of the file as Outpost would keep it. */
export interface RepeaterPreviewRow extends RepeaterFields {
  /** The line of the file it was read from, counting the headings as line 1. */
  line: number;
  band: RepeaterBand;
}

export interface RepeaterSkippedRow {
  line: number;
  /** Why the row cannot be kept, in words. */
  reason: string;
  /** The start of the row as it is in the file. */
  text: string;
}

/** What an update of an existing list would do. Nothing is changed by asking. */
export interface RepeaterUpdatePlan {
  listId: string;
  listName: string;
  /** In the file and not in the list. */
  added: number;
  /** In both, and the file says something different. */
  changed: number;
  unchanged: number;
  /** In the list and no longer in the file. */
  gone: number;
  /** Entries the person changed, where the file still says what it said before. They are left as the person has them. */
  editedSame: number;
  /** Entries the person changed, where the file now says something different from before. The person decides. */
  editedDiffering: number;
  /** A few of those, to show what is being decided. */
  editedExamples: Array<{ callsign: string; outputHz: number }>;
  /** Entries the person removed that are still in the file. They stay removed. */
  removedByYou: number;
  /** Entries the person changed that are no longer in the file. They are kept. */
  editedGone: number;
  /** Entries set aside as duplicates that are still in the file. They stay set aside. */
  setAside: number;
}

// ── The same repeater twice ─────────────────────────────────────────────────

/**
 * Two entries are taken to be the same repeater when their callsigns are the same
 * (whatever the case, spaces or hyphens) and their output frequencies are within this
 * many hertz. Lists round a frequency to the kilohertz or to two places of a megahertz;
 * the narrowest channels in use are 6.25 kHz apart, so 3 kHz never joins neighbours.
 */
export const DUPLICATE_HZ = 3000;

/**
 * Two entries with different callsigns on the same frequency may still be one repeater
 * under two spellings when they are this close, in metres, or closer than their listed
 * positions can be told apart. That is shown to the person and never acted on unasked.
 */
export const POSSIBLE_DUPLICATE_METERS = 2000;
/** However roughly two positions are listed, entries further apart than this are not offered as one. */
export const POSSIBLE_DUPLICATE_MAX_METERS = 15_000;

/**
 * What to do, in one import, with rows that are the same repeater as an entry already
 * held in another list or made by hand, or as an earlier row of the same file.
 *
 * - `keep-both`: bring every row in. Nothing held is touched and nothing is left out.
 * - `skip`: bring the row in set aside, so that what is held stays as it is and the
 *   repeater is shown once.
 * - `prefer-newer`: show whichever has the newer data, and set the other aside. What
 *   the person typed or changed by hand is carried onto the one that is shown.
 */
export const REPEATER_DUPLICATE_CHOICES = ["keep-both", "skip", "prefer-newer"] as const;
export type RepeaterDuplicateChoice = (typeof REPEATER_DUPLICATE_CHOICES)[number];

/** One side of a pair shown side by side. */
export interface RepeaterDuplicateSide extends RepeaterFields {
  /** Null for a row of a file that has not been brought in. */
  id: string | null;
  band: RepeaterBand;
  /** For a row of the file being brought in: its line. Null for an entry that is held. */
  line: number | null;
  /** The list a held entry is in; null for a row of a file and for an entry made by hand. */
  listName: string | null;
  /** The date of its data; null for an entry made by hand. */
  dataDate: number | null;
  /** Typed or changed by the person: an entry made by hand, or one of a list that they changed. */
  byHand: boolean;
}

/** A row of the file and the entry it matches. */
export interface RepeaterDuplicatePair {
  /** `same`: callsign and frequency agree. `possible`: frequency and place agree, the callsign does not. */
  strength: "same" | "possible";
  /** Where the match is: an entry already held, or an earlier row of the same file. */
  against: "held" | "file";
  incoming: RepeaterDuplicateSide;
  existing: RepeaterDuplicateSide;
  /** Metres between the two listed positions, when both have one. */
  distanceMeters: number | null;
}

/** What an import found about duplicates. Counts are of rows of the file. */
export interface RepeaterImportDuplicates {
  /** Rows that are the same repeater as an entry held in another list or made by hand. */
  held: number;
  /** Of those, how many match an entry the person made or changed by hand. */
  heldByHand: number;
  /** Rows that repeat an earlier row of the same file. */
  withinFile: number;
  /** Rows that may be an entry already held under another spelling of its callsign. Never acted on. */
  possible: number;
  /** The first of each kind, to look at side by side. */
  examples: RepeaterDuplicatePair[];
}

/** Entries already held that are the same repeater. */
export interface RepeaterDuplicateGroup {
  /** Stable for a set of entries: their ids, sorted and joined. */
  key: string;
  strength: "same" | "possible";
  entries: RepeaterDuplicateSide[];
  /** The entry Outpost would keep: the one with the newest data, or the one made by hand when no list is newer. */
  keepId: string;
  /** Metres between the two furthest apart that have a position. */
  spreadMeters: number | null;
}

/** `GET /api/repeaters/duplicates` */
export interface RepeaterDuplicatesResponse {
  /** Groups whose callsign and frequency agree. */
  same: RepeaterDuplicateGroup[];
  sameTotal: number;
  /** Pairs on one frequency at nearly one place with different callsigns. */
  possible: RepeaterDuplicateGroup[];
  possibleTotal: number;
}

/** `POST /api/repeaters/duplicates/merge` and `/merge-all` */
export interface RepeaterMergeResult {
  /** Groups merged. */
  merged: number;
  /** Entries set aside. */
  setAside: number;
  /** The entries that are now shown, one per group. */
  kept: string[];
}

// ── Where lists can be had ──────────────────────────────────────────────────

/**
 * What Outpost can do with a publisher's list.
 *
 * - `fetch`: the publisher offers a data file and nothing in its terms or `robots.txt`
 *   forbids an application fetching it when a person asks. Outpost fetches it once.
 * - `link`: the publisher offers files, but an application may not fetch them or its
 *   terms could not be established. The person downloads the file and imports it.
 * - `none`: nothing usable. Said so that nobody looks twice.
 */
export const REPEATER_SOURCE_KINDS = ["fetch", "link", "none"] as const;
export type RepeaterSourceKind = (typeof REPEATER_SOURCE_KINDS)[number];

/** A country or wider area that sources are grouped under. */
export interface RepeaterSourceRegion {
  id: string;
  name: string;
  /** A rough box round it, [west, south, east, north], for putting the person's own region first. Null for the whole world. */
  bbox: [number, number, number, number] | null;
}

/** A declared source of repeater lists: see `catalog/repeater-sources.json`. */
export interface RepeaterSourceDto {
  id: string;
  region: string;
  publisher: string;
  /** The name of the list. */
  name: string;
  /** What it covers, in a sentence. */
  covers: string;
  /** The publisher's page for people. */
  pageUrl: string;
  kind: RepeaterSourceKind;
  /** Why it is that kind, in a sentence or two. */
  why: string;
  /** What the publisher's terms say, in short, where they were read and on which day. */
  termsUrl: string;
  termsNote: string;
  termsRead: string;
  /** For `fetch`: the host the file comes from and the address of the file. */
  fetch: { host: string; url: string; waitSeconds: number } | null;
  /** For `link`: what to do, step by step. */
  steps: string[];
  /** What the publisher asks to be said about its data, if anything. */
  attribution: string;
  /** The list held from this source, if Outpost fetched one. */
  held: { listId: string; name: string; dataDate: number; fetchedAt: number; count: number } | null;
}

/** `GET /api/repeaters/sources` */
export interface RepeaterSourcesResponse {
  regions: RepeaterSourceRegion[];
  sources: RepeaterSourceDto[];
  /** What was wrong with a source file that could not be read. */
  problems: string[];
}

/** A list fetched from a source and held, unsaved, until the person has seen it. */
export interface RepeaterFetchedFile {
  /** Names the held file in the requests that follow. */
  token: string;
  sourceId: string;
  /** The address it came from, after any redirect. */
  url: string;
  fetchedAt: number;
  /** The day the data is from: the publisher's own date for the file where it gives one, otherwise when it was fetched. */
  dataDate: number;
  sizeBytes: number;
  fileName: string;
  /** The list this would bring up to date, when one from the same source is held. */
  listId: string | null;
  /** How long Outpost keeps the file waiting for a decision, in milliseconds. */
  keptForMs: number;
}

/** `POST /api/repeaters/sources/:id/fetch` */
export interface RepeaterFetchResponse {
  fetched: RepeaterFetchedFile;
  preview: RepeaterImportPreview;
}

export interface RepeaterImportPreview {
  fileName: string | null;
  sizeBytes: number;
  format: RepeaterFormatId;
  formatName: string;
  /** The headings of the file, in order. */
  columns: string[];
  mapping: RepeaterColumnMap;
  /** Rows of data in the file. */
  rows: number;
  /** Rows that can be kept. */
  usable: number;
  skippedCount: number;
  /** The first rows that cannot be kept, with the reason for each. */
  skipped: RepeaterSkippedRow[];
  /** The first rows as they would be kept. */
  sample: RepeaterPreviewRow[];
  withPosition: number;
  /** Positions that are no closer than a kilometre to the real site, by how they are written. */
  approximatePositions: number;
  bands: Partial<Record<RepeaterBand, number>>;
  /** Things about the file a person should know before committing it. */
  warnings: string[];
  update: RepeaterUpdatePlan | null;
  /** Rows that are the same repeater as one already held or as an earlier row. */
  duplicates: RepeaterImportDuplicates;
}

/** What to do with entries the person changed when the list now says something different. */
export type RepeaterEditedChoice = "keep" | "replace";
/** What to do with entries that are no longer in the file. */
export type RepeaterGoneChoice = "remove" | "keep";

export interface RepeaterImportResult {
  list: RepeaterListDto;
  added: number;
  updated: number;
  unchanged: number;
  removed: number;
  /** Entries the person had changed that were left as they were. */
  keptEdits: number;
  /** Entries the person had changed that were replaced with the list's, because they asked. */
  replacedEdits: number;
  skipped: number;
  /** Rows brought in set aside, as duplicates of what is held or of an earlier row. */
  duplicatesSetAside: number;
  /** Entries already held that were set aside in favour of this list's newer data. */
  heldSetAside: number;
  /** Of the rows added, how many carry values the person had typed or changed on the entry they replace. */
  carriedEdits: number;
}

/** No more rows than this are read from one file. */
export const MAX_REPEATER_ROWS = 100_000;
/** The largest file read. */
export const MAX_REPEATER_FILE_BYTES = 16 * 1024 * 1024;

// ── Taking a set out ────────────────────────────────────────────────────────

export const REPEATER_EXPORT_FORMATS = ["chirp", "outpost"] as const;
export type RepeaterExportFormat = (typeof REPEATER_EXPORT_FORMATS)[number];

/** No more channels than this go in one CHIRP file: more than any radio CHIRP programs can hold. */
export const MAX_CHIRP_ROWS = 2000;

// ── Small sums and words ────────────────────────────────────────────────────

/** "145.7750", "433.2000", "1297.3500": megahertz to four places, and to six when the frequency needs them. */
export function formatMHz(hz: number): string {
  const places = hz % 100 === 0 ? 4 : 6;
  return (hz / 1e6).toFixed(places);
}

/**
 * The shift from the output to the input in words: "-0.6 MHz", "+7.6 MHz", "simplex",
 * or "not listed" when the input is not known.
 */
export function formatShift(outputHz: number, inputHz: number | null): string {
  if (inputHz === null) return "not listed";
  const shift = inputHz - outputHz;
  if (shift === 0) return "simplex";
  const mhz = Math.abs(shift) / 1e6;
  const text = Number.isInteger(mhz * 10) ? mhz.toFixed(1) : String(Number(mhz.toFixed(6)));
  return `${shift > 0 ? "+" : "-"}${text} MHz`;
}

/** "94.8 Hz" */
export function formatTone(hz: number): string {
  return `${hz.toFixed(1)} Hz`;
}

/** Compass bearing in degrees (0 to 360) to set out on from the first point towards the second. */
export function bearingDegrees(fromLat: number, fromLon: number, toLat: number, toLon: number): number {
  const rad = Math.PI / 180;
  const dLon = (toLon - fromLon) * rad;
  const y = Math.sin(dLon) * Math.cos(toLat * rad);
  const x = Math.cos(fromLat * rad) * Math.sin(toLat * rad) - Math.sin(fromLat * rad) * Math.cos(toLat * rad) * Math.cos(dLon);
  return (Math.atan2(y, x) / rad + 360) % 360;
}

/**
 * How old a list is, for saying so. Repeaters change keeper, tone and frequency, and
 * close; a list a few months old is usually right, one over a year old often is not.
 */
export type RepeaterDataAge = "current" | "old" | "very-old";

export const REPEATER_OLD_DAYS = 183;
export const REPEATER_VERY_OLD_DAYS = 365;

export function repeaterDataAge(dataDate: number, now: number): { days: number; age: RepeaterDataAge } {
  const days = Math.max(0, Math.floor((now - dataDate) / 86_400_000));
  return { days, age: days >= REPEATER_VERY_OLD_DAYS ? "very-old" : days >= REPEATER_OLD_DAYS ? "old" : "current" };
}

/** "today", "12 days", "7 months", "2 years": how long ago, in the largest unit that fits. */
export function formatAge(days: number): string {
  if (days <= 0) return "today";
  if (days === 1) return "1 day";
  if (days < 60) return `${days} days`;
  if (days < 365) return `${Math.floor(days / 30.44)} months`;
  const years = Math.floor(days / 365.25);
  return years <= 1 ? "1 year" : `${years} years`;
}

/** A listed position this far or further from certain is worth a warning wherever an exact place matters. */
export const APPROXIMATE_POSITION_METERS = 1000;

/**
 * The line shown wherever a repeater's access details are: who may use one. From the
 * UK amateur radio licence conditions (a repeater "may be operated ... by other radio
 * amateurs", and its keeper "takes all reasonable steps to ensure that the Repeater is
 * only used by an Amateur") and Ofcom's guidance for licensees, section 4.5.3 (a keeper
 * may be "restricting access to the station to certain licensees"). See docs/radio.md.
 */
export const REPEATER_LICENCE_LINE =
  "Transmitting through a repeater needs an amateur radio licence that covers the band, and its keeper may restrict who uses it.";

/** The line shown wherever a status is. */
export const REPEATER_STATUS_LINE = "Status is what the list said on its date, not what is on the air now.";
