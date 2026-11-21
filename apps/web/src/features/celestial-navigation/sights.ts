/**
 * The sights a person has typed, worked into lines of position and a fix with the
 * functions in `@outpost/shared/sky`. Pure apart from nothing: the screen keeps the typed
 * text, this turns it into answers, and the tests hold a known case to a known answer.
 */
import {
  almanacFor,
  BODY_NAMES,
  type BodyId,
  type CorrectionStep,
  correctSight,
  type Fix,
  fixFrom,
  type Limb,
  type LineOfPosition,
  lineOfPosition,
  NAVIGATIONAL_STARS,
  type Reduction,
  reduce,
  type SightBody,
  type SightInput,
  starByHr,
} from "@outpost/shared/sky";

export type Horizon = SightInput["horizon"];

/** One sight as typed: every figure is the text in its box, so a half-typed figure is kept as it is. */
export interface SightRecord {
  id: string;
  /** "sun", "moon", a planet's id, or "hr:<number>" for a star. */
  body: string;
  limb: Limb;
  /** Universal Time: "2026-11-21" and "15:04:30". */
  date: string;
  time: string;
  /** Sextant altitude: "34 12.5", "34°12.5′" or "34.208". */
  hs: string;
  /** Index error in minutes, + when the sextant reads high (on the arc). */
  indexError: string;
  heightOfEye: string;
  horizon: Horizon;
}

export interface Run {
  /** Course made good, degrees true, and speed, knots, between the sights. Empty for a fix with no run. */
  course: string;
  speed: string;
}

export const BODY_OPTIONS: Array<{ value: string; label: string }> = [
  ...(["sun", "moon", "venus", "mars", "jupiter", "saturn"] as BodyId[]).map((id) => ({ value: id, label: BODY_NAMES[id] })),
  ...NAVIGATIONAL_STARS.map((star) => ({
    value: `hr:${star.hr}`,
    label: star.navNumber ? `${star.name} (${star.navNumber})` : star.name!,
  })),
];

export function bodyOf(value: string): SightBody | null {
  if (value.startsWith("hr:")) {
    const star = starByHr(Number(value.slice(3)));
    return star ? { kind: "star", star } : null;
  }
  return value in BODY_NAMES ? { kind: "body", id: value as BodyId } : null;
}

export const bodyName = (value: string): string => {
  const body = bodyOf(value);
  return !body ? value : body.kind === "star" ? body.star.name! : BODY_NAMES[body.id];
};

/** Whether a limb is asked for: the Sun and the Moon have a disc; planets and stars are points. */
export const hasLimb = (value: string) => value === "sun" || value === "moon";

/** An angle typed as degrees and minutes ("34 12.5", "34°12.5′", "34° 12.5'") or decimal degrees ("34.208"). Null if it is not one. */
export function readAngle(text: string): number | null {
  const t = text.trim().replace(/,/g, ".");
  const dm = /^(-?\d{1,3})(?:\s*°\s*|\s+)(\d{1,2}(?:\.\d+)?)\s*['′]?$/.exec(t);
  if (dm) {
    const minutes = Number(dm[2]);
    if (minutes >= 60) return null;
    const degrees = Number(dm[1]);
    return degrees < 0 || dm[1]!.startsWith("-") ? degrees - minutes / 60 : degrees + minutes / 60;
  }
  if (/^-?\d{1,3}(\.\d+)?\s*°?$/.test(t)) return Number(t.replace("°", ""));
  return null;
}

/** "34° 12.5′", to a tenth of a minute, with a minus sign where it is negative. */
export function formatAngle(degrees: number): string {
  const sign = degrees < 0 ? "−" : "";
  let whole = Math.floor(Math.abs(degrees));
  let minutes = Math.round((Math.abs(degrees) - whole) * 600) / 10;
  if (minutes >= 60) {
    whole += 1;
    minutes -= 60;
  }
  return `${sign}${whole}° ${minutes.toFixed(1)}′`;
}

/** "50° 12.3′ N", "4° 05.0′ W". */
export function formatLatLon(value: number, axis: "lat" | "lon"): string {
  const side = axis === "lat" ? (value >= 0 ? "N" : "S") : value >= 0 ? "E" : "W";
  const a = Math.abs(value);
  let whole = Math.floor(a);
  let minutes = Math.round((a - whole) * 600) / 10;
  if (minutes >= 60) {
    whole += 1;
    minutes -= 60;
  }
  return `${whole}° ${minutes.toFixed(1).padStart(4, "0")}′ ${side}`;
}

const readNumberText = (text: string): number | null => {
  const t = text.trim().replace(",", ".");
  if (t === "") return 0;
  return /^[-+−]?\d+(\.\d+)?$/.test(t) ? Number(t.replace("−", "-")) : null;
};

/** The moment of a sight in UT milliseconds, or null. Seconds may be left off. */
export function sightInstant(date: string, time: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}(?:\.\d+)?))?$/.exec(time.trim());
  if (!m) return null;
  const [h, mi, s] = [Number(m[1]), Number(m[2]), Number(m[3] ?? 0)];
  if (h > 23 || mi > 59 || s >= 60) return null;
  const ms = Date.parse(`${date}T00:00:00Z`) + ((h * 60 + mi) * 60 + s) * 1000;
  return Number.isFinite(ms) ? ms : null;
}

/** How far out one sight is likely to be, minutes of arc: the sextant and the almanac together. */
export function sightSigma(record: SightRecord, body: SightBody): number {
  const instrument = record.horizon === "plumb" ? 30 : 1;
  const almanac = body.kind === "star" ? 0.1 : body.id === "sun" ? 0.3 : 1.5;
  return Math.hypot(instrument, almanac);
}

export interface WorkedSight {
  record: SightRecord;
  at: number;
  name: string;
  almanac: ReturnType<typeof almanacFor>;
  steps: CorrectionStep[];
  ho: number;
  reduction: Reduction;
  line: LineOfPosition;
  /** The run from this sight to the time of the fix, nautical miles east and north. */
  advance: { east: number; north: number } | undefined;
  sigma: number;
}

export type SightProblem = { id: string; problem: string };

/** Works every complete sight; says what is missing from the others. */
export function workSights(
  records: SightRecord[],
  dr: { lat: number; lon: number },
  run: Run,
): { worked: WorkedSight[]; problems: SightProblem[]; fix: Fix | null; fixAt: number | null } {
  const problems: SightProblem[] = [];
  const ready: Array<{ record: SightRecord; at: number; body: SightBody; input: SightInput }> = [];
  for (const record of records) {
    const body = bodyOf(record.body);
    const at = sightInstant(record.date, record.time);
    const hs = readAngle(record.hs);
    const ie = readNumberText(record.indexError);
    const hoe = readNumberText(record.heightOfEye);
    const problem = !body
      ? "Choose what was observed."
      : at === null
        ? "Give the date and the time of the sight in UT, as 15:04:30."
        : hs === null || hs <= 0 || hs >= (record.horizon === "artificial" ? 180 : 90)
          ? "Give the sextant altitude as degrees and minutes, as 34 12.5."
          : ie === null || Math.abs(ie) > 30
            ? "Give the index error in minutes, + if the sextant reads high."
            : hoe === null || hoe < 0 || hoe > 500
              ? "Give the height of eye in metres."
              : null;
    if (problem) {
      problems.push({ id: record.id, problem });
      continue;
    }
    ready.push({
      record,
      at: at!,
      body: body!,
      input: {
        body: body!,
        at: at!,
        hs: hs!,
        indexError: ie!,
        heightOfEye: hoe!,
        horizon: record.horizon,
        limb: hasLimb(record.body) ? record.limb : "centre",
      },
    });
  }
  const fixAt = ready.length ? Math.max(...ready.map((r) => r.at)) : null;
  const course = readNumberText(run.course);
  const speed = readNumberText(run.speed);
  const moving = course !== null && speed !== null && speed > 0;
  const worked: WorkedSight[] = ready.map(({ record, at, body, input }) => {
    const almanac = almanacFor(body, at);
    const { steps, ho } = correctSight(input, almanac);
    const reduction = reduce(almanac, ho, dr);
    const hours = fixAt !== null ? (fixAt - at) / 3_600_000 : 0;
    const advance =
      moving && hours > 0
        ? { east: speed! * hours * Math.sin((course! * Math.PI) / 180), north: speed! * hours * Math.cos((course! * Math.PI) / 180) }
        : undefined;
    return {
      record,
      at,
      name: bodyName(record.body),
      almanac,
      steps,
      ho,
      reduction,
      line: lineOfPosition(reduction, 30, advance),
      advance,
      sigma: sightSigma(record, body),
    };
  });
  const fix = fixFrom(
    worked.map((w) => ({ almanac: w.almanac, ho: w.ho, sigma: w.sigma, advance: w.advance })),
    dr,
  );
  return { worked, problems, fix, fixAt };
}

/** What the map draws: the lines, the fix and its ellipse, and the position worked from. Kept on this device for the map to read. */
export interface CelnavPlot {
  made: number;
  dr: { lat: number; lon: number };
  lines: Array<{ label: string; ends: [{ lat: number; lon: number }, { lat: number; lon: number }] }>;
  fix: { lat: number; lon: number; major: number; minor: number; bearing: number } | null;
}

export const PLOT_KEY = "celnav.plot";

/** The one-standard-deviation ellipse grown to hold the position nineteen times in twenty (the 95% point of a chi-squared with two degrees of freedom, √5.991). */
export const ELLIPSE_95 = 2.4477;

export function plotOf(worked: WorkedSight[], fix: Fix | null, dr: { lat: number; lon: number }, made: number): CelnavPlot {
  return {
    made,
    dr,
    lines: worked.map((w) => ({ label: w.name, ends: w.line.ends })),
    fix: fix
      ? { ...fix.position, major: fix.ellipse.major * ELLIPSE_95, minor: fix.ellipse.minor * ELLIPSE_95, bearing: fix.ellipse.bearing }
      : null,
  };
}

export function readPlot(text: string | null): CelnavPlot | null {
  if (!text) return null;
  try {
    const plot = JSON.parse(text) as CelnavPlot;
    return typeof plot.made === "number" && Array.isArray(plot.lines) && plot.dr ? plot : null;
  } catch {
    return null;
  }
}
