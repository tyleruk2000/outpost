/**
 * Tranter's corrections to Naismith's rule: a table that turns a Naismith time into an
 * expected time for a walker of a given fitness. Fitness is the minutes taken to climb
 * 1,000 ft (300 m) over half a mile (800 m) at a steady pace.
 *
 * The figures are the table as Wikipedia gives it ("Naismith's rule", read 2026-11-16),
 * which names no primary source; no other copy was found to check them against. Cells
 * the table leaves empty mean the walk is too much for that fitness.
 */

/** The Naismith times, in hours, that head the table's columns. */
export const TRANTER_HOURS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 14, 16, 18, 20, 22, 24] as const;

/** Each row: the expected hours under each column, as far as the table goes. */
export const TRANTER_TABLE: Record<string, readonly number[]> = {
  "15": [1, 1.5, 2, 2.75, 3.5, 4.5, 5.5, 6.75, 7.75, 10, 12.5, 14.5, 17, 19.5, 22, 24],
  "20": [1.25, 2.25, 3.25, 4.5, 5.5, 6.5, 7.75, 8.75, 10, 12.5, 15, 17.5, 20, 23],
  "25": [1.5, 3, 4.25, 5.5, 7, 8.5, 10, 11.5, 13.25, 15, 17.5],
  "30": [2, 3.5, 5, 6.75, 8.5, 10.5, 12.5, 14.5],
  "40": [2.75, 4.25, 5.75, 7.5, 9.5, 11.5],
  "50": [3.25, 4.75, 6.5, 8.5],
};

export const TRANTER_FITNESS = Object.keys(TRANTER_TABLE).map((minutes) => ({ value: minutes, label: `${minutes} minutes` }));

export type TranterResult = { ok: true; minutes: number } | { ok: false; reason: string };

/**
 * The expected time for a Naismith time (in minutes) at a fitness, read from the table.
 * Between two columns it is read on a straight line between them. The table starts at a
 * 2-hour Naismith time; beyond the last figure in a row it says the walk is too much.
 */
export function tranterMinutes(naismithMinutes: number, fitness: string): TranterResult {
  const row = TRANTER_TABLE[fitness];
  if (!row) return { ok: false, reason: "Choose a fitness from the list." };
  const hours = naismithMinutes / 60;
  if (hours < TRANTER_HOURS[0]) {
    return { ok: false, reason: "Tranter's table starts at a Naismith time of 2 hours. For a shorter walk, use Naismith's time." };
  }
  const last = row.length - 1;
  if (hours > TRANTER_HOURS[last]!) {
    return {
      ok: false,
      reason: `Tranter's table gives no time for this walk at a fitness of ${fitness} minutes: it is more than that level of fitness should attempt.`,
    };
  }
  for (let index = 0; index < last; index += 1) {
    const from = TRANTER_HOURS[index]!;
    const to = TRANTER_HOURS[index + 1]!;
    if (hours >= from && hours <= to) {
      const share = (hours - from) / (to - from);
      return { ok: true, minutes: (row[index]! + share * (row[index + 1]! - row[index]!)) * 60 };
    }
  }
  return { ok: true, minutes: row[last]! * 60 };
}
