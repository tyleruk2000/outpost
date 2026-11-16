/**
 * What a scenario says about the people inside a ring: a count from a named population
 * grid of a stated year, rounded as the server rounds it (two significant figures, the
 * most WorldPop's modelled estimates support), and said so that it cannot be read as a
 * casualty figure. No fatality or injury estimate is ever made from it.
 *
 * A ring the grid cannot speak for gets no count, with the reason: a ring smaller than a
 * few of the grid's cells, a ring mostly outside the installed grid, or no grid at all.
 * A ring partly outside the installed grid gets the count of the part inside, said as
 * such. The fallout plume gets no count: it is an idealised shape for a steady wind,
 * not where fallout would land.
 */
import type { PopulationSumResponse } from "@outpost/shared";

/** The words that follow every count. */
export const NOT_HARM = "This is who lives there, not a prediction of harm.";

/** A ring must cover at least this many of the grid's cells to be counted. */
export const MIN_CELLS = 4;
/** Below this share of the ring covered by installed grids, no count is given. */
export const MIN_COVERED = 0.5;
/** At or above this share, the ring is counted as whole (the server's own threshold for saying it is partial). */
export const WHOLE = 0.99;
/** The population service sums within 300 km at most. */
export const MAX_RADIUS_M = 300_000;

export const FALLOUT_NO_COUNT =
  "No count is given for the fallout pattern. It is an idealised shape for a steady wind, not where fallout would land, so a count of the people under it would say more than the model can.";

const number = (value: number) => value.toLocaleString("en-GB");

/** "WorldPop's 2020 estimate", or for two countries' grids "WorldPop's 2020 estimates for Luxembourg and Belgium". */
export function whoseEstimate(sets: PopulationSumResponse["sets"]): string {
  const years = [...new Set(sets.map((set) => set.year))];
  const year = years.join(" and ");
  if (sets.length <= 1) return `WorldPop's ${year} estimate`;
  return `WorldPop's ${year} estimates for ${sets.map((set) => set.country).join(" and ")}`;
}

export type RingPeople = { kind: "count"; text: string } | { kind: "partial"; text: string } | { kind: "none"; text: string };

/** The sentence for one ring of `radiusM` metres, from the server's answer for that circle. */
export function ringPeople(radiusM: number, answer: PopulationSumResponse): RingPeople {
  if (radiusM > MAX_RADIUS_M)
    return { kind: "none", text: "This ring is wider than the 300 km the population grid is summed over, so it is not counted." };
  if (answer.people === null) return { kind: "none", text: answer.note };
  const areaKm2 = Math.PI * (radiusM / 1000) ** 2;
  if (answer.cellKm2 !== null && areaKm2 < MIN_CELLS * answer.cellKm2) {
    const cell = answer.cellKm2 < 1 ? answer.cellKm2.toFixed(1) : number(Math.round(answer.cellKm2));
    return {
      kind: "none",
      text: `This ring is smaller than a few of the population grid's cells (each about ${cell} km² here), so the grid cannot say who lives inside it.`,
    };
  }
  const who = whoseEstimate(answer.sets);
  if (answer.covered < MIN_COVERED) {
    return {
      kind: "none",
      text: `The installed population grid covers only ${Math.round(answer.covered * 100)}% of this ring, too little to give a count. Install the grid for the rest of the area to count it.`,
    };
  }
  if (answer.covered < WHOLE) {
    const part = Math.round(answer.covered * 100);
    return {
      kind: "partial",
      text:
        answer.people === 0
          ? `${who} counts no one living in the ${part}% of this ring that the installed grid covers; the rest of the ring is not counted. ${NOT_HARM}`
          : `About ${number(answer.people)} ${answer.people === 1 ? "person lives" : "people live"} in the ${part}% of this ring that the installed grid covers, by ${who}; the rest of the ring is not counted. ${NOT_HARM}`,
    };
  }
  return {
    kind: "count",
    text:
      answer.people === 0
        ? `${who} counts no one living inside this ring. ${NOT_HARM}`
        : `About ${number(answer.people)} ${answer.people === 1 ? "person lives" : "people live"} inside this ring, by ${who}. ${NOT_HARM}`,
  };
}

/** Whether an installed grid's box holds a point: the grid is worth asking about rings there. */
export function gridCovers(bbox: [number, number, number, number], at: { lat: number; lon: number }): boolean {
  return at.lon >= bbox[0] && at.lon <= bbox[2] && at.lat >= bbox[1] && at.lat <= bbox[3];
}
