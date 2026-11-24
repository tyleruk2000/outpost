/**
 * What Frequencies to listen to puts first: what to tune to in an emergency where home is,
 * and the live entries before the closed ones. Pure, so that it can be checked by hand.
 */
import { type FrequencyEntry, filterFrequencies } from "@outpost/shared";

/** Emergency broadcasting entries listed at most in the block at the top. */
const MOST = 3;

/**
 * "In an emergency, tune to": the emergency broadcasting entries for a place that are on the
 * air (never a closed station), what names the place itself before what names its region.
 */
export function emergencyFirst(entries: readonly FrequencyEntry[], place: string | null): FrequencyEntry[] {
  if (!place) return [];
  return filterFrequencies(entries, { kind: "emergency", place })
    .filter((entry) => entry.status === "on-air" || entry.status === "occasional")
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => Number(!a.entry.where.includes(place)) - Number(!b.entry.where.includes(place)) || a.index - b.index)
    .slice(0, MOST)
    .map(({ entry }) => entry);
}

/** The distress and calling entries that apply to a place: a count for the link under the block. */
export function distressCount(entries: readonly FrequencyEntry[], place: string | null): number {
  if (!place) return 0;
  return filterFrequencies(entries, { kind: "distress", place }).filter((entry) => entry.status !== "closed").length;
}

/** The list cut in two: what can be heard, and what has closed (kept so that nobody hunts for it). */
export function splitClosed(entries: readonly FrequencyEntry[]): { live: FrequencyEntry[]; closed: FrequencyEntry[] } {
  const live: FrequencyEntry[] = [];
  const closed: FrequencyEntry[] = [];
  for (const entry of entries) (entry.status === "closed" ? closed : live).push(entry);
  return { live, closed };
}
