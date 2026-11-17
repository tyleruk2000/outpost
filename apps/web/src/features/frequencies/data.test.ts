/**
 * The bundled frequencies are checked here, entry by entry: anything that fails stops
 * the suite. What is checked is what can be checked without the internet: every entry
 * has a source with an address and the day it was read, every frequency has a value in
 * kHz and lies in a band the entry names, every place is a country code or a known
 * region, nothing is listed twice, and dates are real days. Whether the source says what
 * the entry says is checked by reading it (docs/radio-frequencies.md).
 */
import {
  bandById,
  FREQUENCY_KIND_IDS,
  FREQUENCY_MODES,
  type FrequencyEntry,
  formatFrequency,
  isCountryCode,
  isDay,
  regionById,
} from "@outpost/shared";
import { RADIO_FREQUENCIES, RADIO_FREQUENCY_GUIDES } from "@outpost/shared/radio-frequencies-data";
import { describe, expect, it } from "vitest";

/** No entry may be checked after the day this file was last changed by more than a year: a slip in the year. */
const LATEST_PLAUSIBLE = "2027-12-31";
const EARLIEST_PLAUSIBLE = "2026-01-01";

const countryNames = new Intl.DisplayNames(["en"], { type: "region", fallback: "none" });
/** Codes Intl knows that are not ISO 3166-1 countries an entry should use. */
const NOT_COUNTRIES = new Set(["UK", "EU", "UN", "EZ", "QO", "XA", "XB"]);
const validPlace = (code: string) =>
  isCountryCode(code) ? !NOT_COUNTRIES.has(code) && countryNames.of(code) !== undefined : regionById(code) !== undefined;

function problems(entry: FrequencyEntry): string[] {
  const found: string[] = [];
  const say = (text: string) => found.push(`${entry.id}: ${text}`);
  if (!/^[a-z0-9]+(-[a-z0-9.]+)*$/.test(entry.id)) say("id is not lower case with hyphens");
  if (!FREQUENCY_KIND_IDS.includes(entry.kind)) say(`unknown kind ${entry.kind}`);
  if (!entry.name.trim() || !entry.what.trim() || !entry.expect.trim()) say("name, what or expect is empty");
  if (entry.frequencies.length === 0) say("no frequency");
  if (entry.modes.length === 0) say("no mode");
  for (const mode of entry.modes) if (!(mode in FREQUENCY_MODES)) say(`unknown mode ${mode}`);
  if (entry.bands.length === 0) say("no band");
  for (const id of entry.bands) if (!bandById(id)) say(`unknown band ${id}`);
  if (entry.where.length === 0) say("no country or region");
  for (const code of entry.where) if (!validPlace(code)) say(`not a country code or region: ${code}`);
  for (const frequency of entry.frequencies) {
    if (!Number.isFinite(frequency.khz) || frequency.khz <= 0) say(`frequency without a value in kHz: ${JSON.stringify(frequency)}`);
    if (frequency.toKhz !== undefined && !(frequency.toKhz > frequency.khz)) say(`range upside down: ${formatFrequency(frequency)}`);
    const low = frequency.khz;
    const high = frequency.toKhz ?? frequency.khz;
    const inBand = entry.bands.some((id) => {
      const band = bandById(id);
      return band !== undefined && low >= band.fromKhz && high <= band.toKhz;
    });
    if (!inBand) say(`${formatFrequency(frequency)} is outside every band it names (${entry.bands.join(", ")})`);
  }
  for (const id of entry.bands) {
    const band = bandById(id);
    if (!band) continue;
    const used = entry.frequencies.some((frequency) => frequency.khz <= band.toKhz && (frequency.toKhz ?? frequency.khz) >= band.fromKhz);
    if (!used) say(`names the band ${id} and has no frequency in it`);
  }
  // Two frequencies of one entry the same, on the same channel: written twice.
  const keys = entry.frequencies.map(
    (frequency) => `${frequency.khz}/${frequency.toKhz ?? ""}/${frequency.channel ?? ""}/${frequency.note ?? ""}`,
  );
  if (new Set(keys).size !== keys.length) say("the same frequency twice");
  if (entry.sources.length === 0) say("no source");
  for (const source of entry.sources) {
    if (!/^https?:\/\/[^\s/]+\.[^\s]+$/.test(source.url)) say(`source without an address: ${source.url}`);
    if (!source.publisher.trim() || !source.title.trim()) say(`source without a publisher or title: ${source.url}`);
    if (!isDay(source.checked)) say(`source checked on a date that is not a day: ${source.checked}`);
    else if (source.checked < EARLIEST_PLAUSIBLE || source.checked > LATEST_PLAUSIBLE) say(`checked date out of range: ${source.checked}`);
  }
  if (entry.schedule) {
    if (!isDay(entry.schedule.from) || !isDay(entry.schedule.until))
      say(`schedule dates are not YYYY-MM-DD days: ${JSON.stringify(entry.schedule)}`);
    else if (entry.schedule.until < entry.schedule.from) say("schedule ends before it starts");
    if (!entry.schedule.season.trim()) say("schedule without a season");
  }
  if (entry.status === "closed" && !entry.closed) say("closed without the date it closed");
  if (entry.closed && !/^\d{4}-(0[1-9]|1[0-2])(-\d{2})?$/.test(entry.closed)) say(`closed date not YYYY-MM or YYYY-MM-DD: ${entry.closed}`);
  if (entry.closed && entry.closed.length === 10 && !isDay(entry.closed)) say(`closed date is not a day: ${entry.closed}`);
  // Times are given in UTC and say so.
  for (const text of [entry.hours, ...entry.frequencies.map((frequency) => frequency.hours)]) {
    if (text && /\b\d{1,2}[:.]?\d{2}\b/.test(text) && !/UTC|local/i.test(text)) say(`hours without "UTC" (or "local"): ${text}`);
  }
  for (const link of entry.links ?? []) if (!link.to.startsWith("/")) say(`a link that leaves Outpost: ${link.to}`);
  return found;
}

/** `FREQ_KIND=weather` checks one kind only, for whoever is working on that kind. */
const only = typeof process !== "undefined" ? process.env.FREQ_KIND : undefined;
/** `FREQ_PREFIX=bc-nat-` checks only the entries and guides whose ids start so. */
const prefix = typeof process !== "undefined" ? process.env.FREQ_PREFIX : undefined;
const chosen = <T extends { id: string; kind: string }>(items: readonly T[]) =>
  items.filter((item) => (!only || item.kind === only) && (!prefix || item.id.startsWith(prefix)));
const ENTRIES = chosen(RADIO_FREQUENCIES);
const GUIDES = chosen(RADIO_FREQUENCY_GUIDES);

describe("the bundled frequencies", () => {
  it("has entries", () => {
    expect(ENTRIES.length).toBeGreaterThan(0);
  });

  it("every entry has a source, a date, a unit, a known place and a frequency inside its band", () => {
    expect(ENTRIES.flatMap(problems)).toEqual([]);
  });

  it("lists nothing twice: ids are unique, and no two entries of a kind have the same frequencies for the same places", () => {
    const ids = RADIO_FREQUENCIES.map((entry) => entry.id);
    expect(ids.filter((id, index) => ids.indexOf(id) !== index)).toEqual([]);
    const key = (entry: FrequencyEntry) =>
      [
        entry.kind,
        [...entry.where].sort().join(","),
        entry.frequencies
          .map((frequency) => `${frequency.khz}-${frequency.toKhz ?? ""}`)
          .sort()
          .join(","),
        [...entry.modes].sort().join(","),
      ].join("|");
    const seen = new Map<string, string>();
    const twice: string[] = [];
    for (const entry of RADIO_FREQUENCIES) {
      const before = seen.get(key(entry));
      if (before) twice.push(`${before} and ${entry.id}`);
      else seen.set(key(entry), entry.id);
    }
    expect(twice).toEqual([]);
  });

  it("every guide has a kind, words and a dated source", () => {
    const ids = GUIDES.map((guide) => guide.id);
    expect(ids.filter((id, index) => ids.indexOf(id) !== index)).toEqual([]);
    for (const guide of GUIDES) {
      expect(FREQUENCY_KIND_IDS, guide.id).toContain(guide.kind);
      expect(guide.paragraphs.length, guide.id).toBeGreaterThan(0);
      expect(guide.sources.length, guide.id).toBeGreaterThan(0);
      for (const source of guide.sources) {
        expect(source.url, guide.id).toMatch(/^https?:\/\/[^\s/]+\.[^\s]+$/);
        expect(isDay(source.checked), `${guide.id} ${source.checked}`).toBe(true);
      }
    }
  });

  it("finds what is wrong with a bad entry (the checks above can fail)", () => {
    const bad: FrequencyEntry = {
      id: "Bad Entry",
      kind: "weather",
      name: "A made-up station",
      what: "Nothing.",
      expect: "Nothing.",
      frequencies: [{ khz: 9000 }, { khz: 9000 }],
      modes: ["AM"],
      bands: ["sw-31m"],
      where: ["UK", "atlantis"],
      hours: "Daily at 12:00",
      schedule: { season: "A26", from: "2026-03-29", until: "2026-13-01" },
      status: "closed",
      sources: [{ publisher: "Nobody", title: "No page", url: "not an address", checked: "2026-02-30" }],
    };
    const found = problems(bad).join("\n");
    for (const expected of [
      "lower case",
      "outside every band",
      "the same frequency twice",
      "not a country code or region: UK",
      "not a country code or region: atlantis",
      "source without an address",
      "not a day: 2026-02-30",
      "schedule dates",
      "closed without the date",
      'hours without "UTC"',
    ])
      expect(found).toContain(expected);
  });
});
