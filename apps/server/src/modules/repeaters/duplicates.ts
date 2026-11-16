/**
 * Telling when two entries are the same repeater, and making one of two.
 *
 * Nothing here touches the database, so all of it can be tested with plain values.
 *
 * Two kinds of match, and they are never confused:
 *
 * - **the same**: the callsigns are the same once case, spaces and punctuation are set
 *   aside, and the output frequencies are within `DUPLICATE_HZ`. This is what an import
 *   and "Merge all" may act on.
 * - **possibly the same**: the callsigns differ, the output frequencies agree, and the
 *   listed positions are closer than they can be told apart (never more than
 *   `POSSIBLE_DUPLICATE_MAX_METERS`). Two repeaters do not share a frequency that close
 *   together, so it is usually one repeater under two spellings; but it is only shown,
 *   and merged only when a person says so of that pair.
 *
 * Making one of two never loses what a person typed. See `fold`.
 */
import {
  DUPLICATE_HZ,
  haversineMeters,
  POSSIBLE_DUPLICATE_MAX_METERS,
  POSSIBLE_DUPLICATE_METERS,
  REPEATER_MODE_IDS,
  type RepeaterFields,
} from "@outpost/shared";

/** A callsign as it is compared: "gb3-ab", "GB3 AB" and "GB3AB" are one. */
export function callsignKey(callsign: string): string {
  return callsign.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** What is needed of an entry to tell whether another is the same repeater. */
export interface Matchable {
  callsign: string;
  outputHz: number;
  lat: number | null;
  lon: number | null;
  positionPrecisionMeters: number | null;
}

export const sameFrequency = (a: number, b: number) => Math.abs(a - b) <= DUPLICATE_HZ;

export function isSame(a: Matchable, b: Matchable): boolean {
  const key = callsignKey(a.callsign);
  return key !== "" && key === callsignKey(b.callsign) && sameFrequency(a.outputHz, b.outputHz);
}

/** Metres between two listed positions, or null when either has none. */
export function metersBetween(a: Matchable, b: Matchable): number | null {
  if (a.lat === null || a.lon === null || b.lat === null || b.lon === null) return null;
  return haversineMeters(a.lat, a.lon, b.lat, b.lon);
}

/** How far apart two entries may be listed and still be offered as one: what their positions cannot tell apart, within limits. */
export function possibleReach(a: Matchable, b: Matchable): number {
  const blur = (a.positionPrecisionMeters ?? 0) + (b.positionPrecisionMeters ?? 0);
  return Math.min(Math.max(POSSIBLE_DUPLICATE_METERS, blur), POSSIBLE_DUPLICATE_MAX_METERS);
}

export function isPossiblySame(a: Matchable, b: Matchable): boolean {
  if (isSame(a, b) || !sameFrequency(a.outputHz, b.outputHz)) return false;
  const meters = metersBetween(a, b);
  return meters !== null && meters <= possibleReach(a, b);
}

/**
 * Entries set out so that those that could match one another are found without
 * comparing every pair: by callsign, and by frequency in steps a little wider than the
 * tolerance, looking in the step either side.
 */
export interface MatchIndex<T extends Matchable> {
  add(item: T): void;
  /** Entries that are the same repeater as this one. */
  same(item: Matchable): T[];
  /** Entries that may be, under another callsign. */
  possible(item: Matchable): T[];
}

const STEP_HZ = DUPLICATE_HZ * 2;

export function createMatchIndex<T extends Matchable>(items: Iterable<T> = []): MatchIndex<T> {
  const byCallsign = new Map<string, T[]>();
  const byStep = new Map<number, T[]>();
  const push = <K>(map: Map<K, T[]>, key: K, item: T) => {
    const list = map.get(key);
    if (list) list.push(item);
    else map.set(key, [item]);
  };
  const index: MatchIndex<T> = {
    add(item) {
      const key = callsignKey(item.callsign);
      if (key) push(byCallsign, key, item);
      if (item.lat !== null && item.lon !== null) push(byStep, Math.floor(item.outputHz / STEP_HZ), item);
    },
    same(item) {
      return (byCallsign.get(callsignKey(item.callsign)) ?? []).filter(
        (other) => other !== item && sameFrequency(other.outputHz, item.outputHz),
      );
    },
    possible(item) {
      if (item.lat === null || item.lon === null) return [];
      const step = Math.floor(item.outputHz / STEP_HZ);
      const found: T[] = [];
      for (const near of [step - 1, step, step + 1]) {
        for (const other of byStep.get(near) ?? []) if (other !== item && isPossiblySame(item, other)) found.push(other);
      }
      return found;
    },
  };
  for (const item of items) index.add(item);
  return index;
}

// ── Making one of two ───────────────────────────────────────────────────────

type FieldName = keyof RepeaterFields;

/** The parts of an entry that are folded one at a time. A position is three of them that go together. */
const SINGLE_FIELDS: FieldName[] = [
  "callsign",
  "outputHz",
  "inputHz",
  "ctcssHz",
  "dcsCode",
  "dmrColourCode",
  "talkgroups",
  "accessNote",
  "channel",
  "place",
  "region",
  "country",
  "locator",
  "antennaMeters",
  "keeper",
];

const isEmpty = (value: unknown) => value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0);

/** One of the entries being made into one. */
export interface Foldable {
  fields: RepeaterFields;
  /**
   * What of it the person typed: every part that has a value, for an entry made by
   * hand; the parts that differ from what its list says, for one they changed; nothing,
   * for an entry that is as its list has it.
   */
  byHand: ReadonlySet<FieldName>;
}

/** What a person typed of an entry: see `Foldable.byHand`. `listed` is what its list says, or null for an entry made by hand. */
export function byHandOf(fields: RepeaterFields, listed: RepeaterFields | null, edited: boolean): Set<FieldName> {
  const names = new Set<FieldName>();
  const all: FieldName[] = [...SINGLE_FIELDS, "modes", "lat", "lon", "positionPrecisionMeters", "status", "statusText", "notes"];
  if (listed === null) {
    for (const name of all) {
      if (name === "status" ? fields.status !== "unknown" : !isEmpty(fields[name])) names.add(name);
    }
    return names;
  }
  if (!edited) return names;
  for (const name of all) {
    const now = fields[name];
    const then = listed[name];
    const same = Array.isArray(now) && Array.isArray(then) ? now.join(",") === then.join(",") : (now ?? null) === (then ?? null);
    if (!same) names.add(name);
  }
  return names;
}

/**
 * The entry that is kept, with the others folded into it.
 *
 * - What the person typed on the kept entry stays.
 * - What the person typed on another entry is carried over, unless the kept entry has
 *   its own typed value for the same part.
 * - A part the kept entry leaves empty is filled from another that has it.
 * - Modes are joined: one list saying FM and another saying FM and DMR is a repeater
 *   with both, unless the person set the modes of the kept entry themselves.
 * - Notes the person wrote are never replaced: where they wrote notes on both, the two
 *   are joined, the kept entry's first. Their notes do take the place of notes that are
 *   only a list's.
 *
 * A position is its latitude, longitude and how exact they are, and moves as one.
 */
export function fold(kept: Foldable, others: Foldable[], options: { fillGaps?: boolean } = {}): RepeaterFields {
  const result: RepeaterFields = { ...kept.fields, modes: [...kept.fields.modes] };
  const typed = new Set<FieldName>(kept.byHand);
  const set = <K extends FieldName>(name: K, value: RepeaterFields[K]) => {
    result[name] = value;
  };
  const takePosition = (from: RepeaterFields) => {
    result.lat = from.lat;
    result.lon = from.lon;
    result.positionPrecisionMeters = from.positionPrecisionMeters;
  };

  // What the person typed on the others comes first, so that a gap is not filled from a list when the person had a value for it.
  for (const other of others) {
    for (const name of SINGLE_FIELDS) {
      if (!other.byHand.has(name) || typed.has(name) || isEmpty(other.fields[name])) continue;
      set(name, other.fields[name]);
      typed.add(name);
    }
    if (other.byHand.has("lat") && !typed.has("lat") && other.fields.lat !== null) {
      takePosition(other.fields);
      typed.add("lat");
    }
    if (other.byHand.has("status") && !typed.has("status") && other.fields.status !== "unknown") {
      result.status = other.fields.status;
      result.statusText = other.fields.statusText;
      typed.add("status");
    }
    if (other.byHand.has("modes") && !typed.has("modes") && other.fields.modes.length > 0) {
      result.modes = [...other.fields.modes];
      typed.add("modes");
    }
    if (other.byHand.has("notes") && other.fields.notes.trim()) {
      const theirs = other.fields.notes.trim();
      // Beside notes the person wrote on the kept entry; in place of notes that are only a list's, which stay to be seen as "what the list says".
      const mine = typed.has("notes") ? result.notes.trim() : "";
      if (!mine) result.notes = theirs;
      else if (!mine.includes(theirs)) result.notes = `${mine}\n${theirs}`.slice(0, 2000);
      typed.add("notes");
    }
  }

  // An import carries over what the person typed and nothing else: a new row is not filled in from another list's.
  for (const other of options.fillGaps === false ? [] : others) {
    for (const name of SINGLE_FIELDS) {
      if (isEmpty(result[name]) && !isEmpty(other.fields[name])) set(name, other.fields[name]);
    }
    if (result.lat === null && other.fields.lat !== null) takePosition(other.fields);
    if (result.status === "unknown" && other.fields.status !== "unknown") {
      result.status = other.fields.status;
      result.statusText = other.fields.statusText;
    }
    if (!typed.has("modes")) {
      const joined = new Set([...result.modes, ...other.fields.modes]);
      result.modes = REPEATER_MODE_IDS.filter((mode) => joined.has(mode));
    }
    if (!result.notes.trim() && other.fields.notes.trim()) result.notes = other.fields.notes.trim();
  }
  if (result.lat === null) result.positionPrecisionMeters = null;
  return result;
}

/**
 * Entries gathered into groups that are the same repeater. Each entry is in at most
 * one group; a group is two or more.
 */
export function groupSame<T extends Matchable>(items: T[]): T[][] {
  const byCallsign = new Map<string, T[]>();
  for (const item of items) {
    const key = callsignKey(item.callsign);
    if (!key) continue;
    const list = byCallsign.get(key);
    if (list) list.push(item);
    else byCallsign.set(key, [item]);
  }
  const groups: T[][] = [];
  for (const list of byCallsign.values()) {
    if (list.length < 2) continue;
    const sorted = [...list].sort((a, b) => a.outputHz - b.outputHz);
    let run: T[] = [sorted[0]!];
    for (const item of sorted.slice(1)) {
      // Against the first of the run, so that a chain of near neighbours cannot stretch across a channel.
      if (sameFrequency(item.outputHz, run[0]!.outputHz)) run.push(item);
      else {
        if (run.length > 1) groups.push(run);
        run = [item];
      }
    }
    if (run.length > 1) groups.push(run);
  }
  return groups;
}

/** Pairs that may be one repeater under two callsigns. Each pair once. */
export function pairsPossiblySame<T extends Matchable & { id: string }>(items: T[]): Array<[T, T]> {
  const index = createMatchIndex(items);
  const pairs: Array<[T, T]> = [];
  for (const item of items) {
    for (const other of index.possible(item)) if (item.id < other.id) pairs.push([item, other]);
  }
  return pairs;
}
