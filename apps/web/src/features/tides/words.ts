/** How tide times write heights, distances and days. Pure. */
import { dateToUtc, type IsoDate } from "@outpost/shared";
import { offsetAt, type ZoneChoice } from "../solar-clock/zone";

/** "1.26 m", "−0.43 m": to the centimetre, which is as fine as the constants deserve. */
export function formatHeight(metres: number): string {
  const rounded = Math.round(metres * 100) / 100;
  const text = Math.abs(rounded).toFixed(2);
  return `${rounded < 0 ? "−" : ""}${text} m`;
}

/** "1.2 km", "140 km": to a tenth under ten kilometres. */
export function formatKm(km: number): string {
  return km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km).toLocaleString("en-GB")} km`;
}

/** The instant the chosen clock reads midnight at the start of a date. */
export function midnightOn(date: IsoDate, zone: ZoneChoice): number {
  const utcMidnight = dateToUtc(date);
  // The offset an hour or two either side can differ on the night the clocks change: take it at the guess, then once more.
  const guess = utcMidnight - offsetAt(zone, utcMidnight) * 60_000;
  return utcMidnight - offsetAt(zone, guess) * 60_000;
}

/** Beyond this, the screen says the station is far and the tide here may differ. */
export const FAR_KM = 50;
