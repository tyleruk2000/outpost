/**
 * A horizontal sundial for a latitude, and how to read clock time from it.
 *
 * Hour lines: tan θ = sin φ × tan(15° × hours from noon), θ measured on the dial from the
 * noon line (the North American Sundial Society's "Calculating Dial Lines"). Written here
 * with atan2 so that hours more than six from noon, whose lines run back past the
 * east–west line, fall on the right side by themselves. The gnomon's edge rises at the
 * latitude and points to the true pole.
 *
 * Clock time from sundial time: clock = sundial − equation of time + (zone offset −
 * 4 minutes × longitude east), the zone offset in minutes and the equation of time in
 * NOAA's sense (sundial ahead of the clock when positive). The same as the British
 * Sundial Society's "Setting up a sundial" in words and NASS's "Civil = Sundial + EoT +
 * dLon", whose EoT has the opposite sign. Pure.
 */
import { dateToUtc, type IsoDate, solarPosition } from "@/features/maps/lib/sun";

const DEG = Math.PI / 180;

/** Degrees from the noon line on the dial to an hour line; positive on the afternoon side. */
export function hourLineAngle(latitude: number, hoursFromNoon: number): number {
  const h = hoursFromNoon * 15 * DEG;
  return Math.atan2(Math.sin(Math.abs(latitude) * DEG) * Math.sin(h), Math.cos(h)) / DEG;
}

/** The obliquity of the ecliptic, to the degree's hundredth, for the longest day. */
const OBLIQUITY = 23.44;

/**
 * Hours either side of noon the sun can be up at this latitude on the longest day, so
 * many lines the dial needs: never more than eight (4 am to 8 pm), the most a page can
 * hold sensibly, and at least six (the lines to 6 am and 6 pm).
 */
export function dialHalfSpan(latitude: number): number {
  const lat = Math.min(89.99, Math.abs(latitude));
  const cosine = -Math.tan(lat * DEG) * Math.tan(OBLIQUITY * DEG);
  const hours = cosine <= -1 ? 12 : Math.acos(Math.max(-1, Math.min(1, cosine))) / DEG / 15;
  return Math.max(6, Math.min(8, Math.floor(hours)));
}

export interface HourLine {
  /** Hours from noon: −3 is 9 am. */
  fromNoon: number;
  /** On a 24-hour clock: 9, 12, 15. */
  hour: number;
  angle: number;
}

export function hourLines(latitude: number): HourLine[] {
  const span = dialHalfSpan(latitude);
  const lines: HourLine[] = [];
  for (let fromNoon = -span; fromNoon <= span; fromNoon += 1)
    lines.push({ fromNoon, hour: 12 + fromNoon, angle: hourLineAngle(latitude, fromNoon) });
  return lines;
}

export type DialFit = "none" | "poor" | "good" | "polar";

/**
 * Where a horizontal dial is practical. On the equator every hour line falls on the noon
 * line; below about 20° the lines between 9 am and 3 pm are squeezed within about 19° of
 * it (at 20° the 3 pm line is 18.9° from noon) and the dial is hard to read, so an
 * equatorial dial is better there. Beyond the polar circles the dial works, but the sun
 * is gone for part of the winter. These bounds are Outpost's judgement from the angles,
 * not a published rule.
 */
export function dialFit(latitude: number): DialFit {
  const lat = Math.abs(latitude);
  if (lat < 1) return "none";
  if (lat < 20) return "poor";
  if (lat > 66.56) return "polar";
  return "good";
}

// ── The dial plate, as drawn ────────────────────────────────────────────────

export interface DialBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface DialDrawing {
  /** Where the hour lines meet: the gnomon's low corner. */
  root: [number, number];
  /** Each hour line from the root to `end`, its figure centred on `label`; `paper` is its angle on the page, clockwise from up. */
  hours: Array<HourLine & { paper: number; end: [number, number]; label: [number, number] }>;
  /** The half-hour marks: the outer quarter of each line between the hours. */
  halves: Array<{ from: [number, number]; to: [number, number] }>;
}

/** A point at a distance and an angle clockwise from straight up, on a page whose y grows downwards. */
const along = (x: number, y: number, r: number, degrees: number): [number, number] => [
  x + r * Math.sin(degrees * DEG),
  y - r * Math.cos(degrees * DEG),
];

/** How far a ray from (x, y) at an angle (clockwise from up) runs before it leaves a box. */
function toEdge(x: number, y: number, degrees: number, box: DialBox): number {
  const dx = Math.sin(degrees * DEG);
  const dy = -Math.cos(degrees * DEG);
  const reach: number[] = [];
  if (dx > 1e-9) reach.push((box.right - x) / dx);
  if (dx < -1e-9) reach.push((box.left - x) / dx);
  if (dy > 1e-9) reach.push((box.bottom - y) / dy);
  if (dy < -1e-9) reach.push((box.top - y) / dy);
  return Math.min(...reach);
}

/**
 * The dial plate laid out in a box, with the pole at the top: the printed template and the
 * screen's picture of it are both drawn from this, so they cannot differ. The lines meet
 * two thirds of the way down; each runs to `inset` short of the edge, with its figure
 * `gap` beyond. Afternoon lines are on the east side: to the right with north up, to the
 * left with south up (south of the equator the dial is drawn with south at the top).
 */
export function dialDrawing(latitude: number, box: DialBox, inset: number, gap: number): DialDrawing {
  const north = latitude >= 0;
  const root: [number, number] = [(box.left + box.right) / 2, box.top + (box.bottom - box.top) * 0.66];
  const toPaper = (angle: number) => (north ? angle : -angle);
  const lines = hourLines(latitude);
  const last = lines.at(-1)!.fromNoon;
  const hours: DialDrawing["hours"] = [];
  const halves: DialDrawing["halves"] = [];
  for (const line of lines) {
    const paper = toPaper(line.angle);
    const reach = toEdge(root[0], root[1], paper, box) - inset;
    hours.push({
      ...line,
      paper,
      end: along(root[0], root[1], reach, paper),
      label: along(root[0], root[1], reach + gap, paper),
    });
    if (line.fromNoon < last) {
      const half = toPaper(hourLineAngle(latitude, line.fromNoon + 0.5));
      const halfReach = toEdge(root[0], root[1], half, box) - inset;
      halves.push({ from: along(root[0], root[1], halfReach * 0.75, half), to: along(root[0], root[1], halfReach, half) });
    }
  }
  return { root, hours, halves };
}

/** Minutes to add to a sundial's reading for clock time without summer time, on a date. */
export function sundialToClock(date: IsoDate, longitude: number, standardOffsetMinutes: number): number {
  const noonUtc = dateToUtc(date) + 12 * 3_600_000 - longitude * 4 * 60_000;
  return -solarPosition(noonUtc).equationOfTime + standardOffsetMinutes - 4 * longitude;
}

/** The days a correction table is given for: the 1st and the 15th of each month. */
export function tableDates(year: number): IsoDate[] {
  const dates: IsoDate[] = [];
  for (let month = 1; month <= 12; month += 1) {
    for (const day of [1, 15]) dates.push(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
  }
  return dates;
}

/** "+4 min", "−14 min", "0 min": minutes said to the whole minute, as a table on paper can be read. */
export function signedMinutes(minutes: number): string {
  const whole = Math.round(minutes);
  return whole === 0 ? "0 min" : `${whole > 0 ? "+" : "−"}${Math.abs(whole)} min`;
}
