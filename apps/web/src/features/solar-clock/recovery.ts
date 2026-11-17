/**
 * Clock recovery: the time worked out from something measured about the sun, a typed
 * date and a place, with nothing taken from the device's own clock.
 *
 * Every method returns the instant it points to and the instants at either end of what
 * the measurement allows, worked out by putting the stated measurement error through the
 * same arithmetic (not by a rule of thumb), and one sentence on where the range comes
 * from. The sun itself is placed by `sunAt`, `sunDay` and `altitudeCrossing`
 * (features/maps/lib/sun.ts: NOAA's equations after Meeus, held to the US Naval
 * Observatory to well under a minute), so the range is almost all measurement.
 *
 * Two allowances here are Outpost's own judgement and are said to be wherever they are
 * used: half the sun's width (0.25°) for the blurred end of a shadow when its length is
 * read as a height of the sun, and 0.3° for how far the air's refraction at the horizon
 * can stray from its average. Pure.
 */
import { addDays, altitudeCrossing, geometricFromApparent, type IsoDate, refraction, sunAt, sunDay } from "@/features/maps/lib/sun";

const MINUTE = 60_000;
const DAY = 86_400_000;
const DEG = Math.PI / 180;

export interface Place {
  lat: number;
  lon: number;
}

export interface Estimate {
  /** The instant the measurement points to. */
  at: number;
  /** The earliest and latest instants it allows. */
  low: number;
  high: number;
  /** One sentence on what the range comes from. */
  because: string;
  /** Things the person should know about this answer, in plain sentences. */
  warnings: string[];
}

export type Outcome = { ok: true; estimate: Estimate } | { ok: false; reason: string };

/** Half the width of the range, in minutes. */
export const halfWidth = (estimate: Estimate) => (estimate.high - estimate.low) / 2 / MINUTE;

/** The least a range is ever given as: the place typed and the date's own arithmetic are good to well under a minute, but not to nothing. */
const FLOOR_MINUTES = 1;

/** The blurred end of a shadow, as an error in the sun's height: half its width. Outpost's allowance. */
export const SHADOW_BLUR_DEGREES = 0.25;

/** How far refraction at the horizon can stray from its average, for the sunrise method. Outpost's allowance. */
export const HORIZON_REFRACTION_DEGREES = 0.3;

const round = (value: number, places = 0) => {
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
};
const minutesText = (minutes: number) => {
  const whole = Math.max(1, Math.round(minutes));
  return `${whole} ${whole === 1 ? "minute" : "minutes"}`;
};
const mm = (metres: number) => `${round(metres * 1000)} mm`;

function widen(at: number, low: number, high: number): { low: number; high: number } {
  return { low: Math.min(low, at - FLOOR_MINUTES * MINUTE), high: Math.max(high, at + FLOOR_MINUTES * MINUTE) };
}

/** The length of a stick's shadow on level ground when the sun is at an apparent height; Infinity at or below the horizon. */
export function shadowLength(stick: number, apparentAltitude: number): number {
  return apparentAltitude <= 0 ? Number.POSITIVE_INFINITY : stick / Math.tan(apparentAltitude * DEG);
}

/** The first `t` in (0, limit] where `f(t)` reaches `target`, `f` rising from below it; null if it never does. */
function solveRising(f: (t: number) => number, target: number, limit: number): number | null {
  if (f(limit) < target) return null;
  let lo = 0;
  let hi = limit;
  for (let pass = 0; pass < 50; pass += 1) {
    const mid = (lo + hi) / 2;
    if (f(mid) < target) lo = mid;
    else hi = mid;
  }
  return hi;
}

// ── 1. Noon from the shortest shadow, or from two equal shadows ─────────────

/** The sun must be at least this high at noon for a shadow worth measuring. */
const LOWEST_USEFUL_NOON = 3;

function noonDay(place: Place, date: IsoDate): { noon: number; refusal: string | null } {
  const day = sunDay(place.lat, place.lon, date);
  if (day.noonAltitude < LOWEST_USEFUL_NOON) {
    return {
      noon: day.noon,
      refusal:
        day.noonAltitude < -0.833
          ? "The sun does not rise at this place on this date (it is the polar night), so there is no shadow to measure."
          : `The sun is no more than ${round(Math.max(0, day.noonAltitude), 1)}° high at midday on this date, too low for a shadow worth measuring.`,
    };
  }
  return { noon: day.noon, refusal: null };
}

/**
 * Noon is the moment the shadow of a vertical stick is shortest. The range is how long
 * the shadow stays within the marking error of its shortest either side of noon: near
 * noon the sun's height barely changes, so the shadow does too.
 */
export function noonByShortestShadow(place: Place, date: IsoDate, stick: number, markError: number): Outcome {
  if (!(stick > 0) || !(markError > 0))
    return { ok: false, reason: "The stick's height and the marking error must both be more than nothing." };
  const { noon, refusal } = noonDay(place, date);
  if (refusal) return { ok: false, reason: refusal };
  const lengthAt = (t: number) => shadowLength(stick, sunAt(noon + t, place.lat, place.lon).apparentAltitude);
  const shortest = lengthAt(0);
  const side = (sign: -1 | 1) => solveRising((t) => lengthAt(sign * t) - shortest, markError, 6 * 60 * MINUTE) ?? 6 * 60 * MINUTE;
  const either = (side(-1) + side(1)) / 2;
  const { low, high } = widen(noon, noon - either, noon + either);
  return {
    ok: true,
    estimate: {
      at: noon,
      low,
      high,
      because: `Near noon the shadow hardly changes: with a ${round(stick, 2)} m stick it stays within ${mm(markError)} of its shortest for about ${minutesText(either / MINUTE)} either side of noon, so the shortest moment cannot be picked closer than that.`,
      warnings: [],
    },
  };
}

/**
 * Noon is halfway between the two moments, one before noon and one after, when the tip of
 * the shadow touches the same circle round the stick. The halfway moment is worked out
 * exactly (the sun's declination changes a little between the two, which moves it by
 * seconds), and the range is how much a marking error moves each moment, where the
 * shadow is changing fast.
 */
export function noonByEqualShadows(place: Place, date: IsoDate, stick: number, radius: number, markError: number): Outcome {
  if (!(stick > 0) || !(radius > 0) || !(markError > 0))
    return { ok: false, reason: "The stick's height, the circle and the marking error must all be more than nothing." };
  const { noon, refusal } = noonDay(place, date);
  if (refusal) return { ok: false, reason: refusal };
  const shortest = shadowLength(stick, sunAt(noon, place.lat, place.lon).apparentAltitude);
  if (radius <= shortest + markError) {
    return {
      ok: false,
      reason: `The circle must be wider than the shortest shadow of the day, which is about ${round(shortest, 2)} m with this stick. Draw it at about ${round(Math.max(shortest * 1.5, shortest + 0.1), 1)} m or more.`,
    };
  }
  const apparent = Math.atan(stick / radius) / DEG;
  if (apparent < 3)
    return {
      ok: false,
      reason:
        "A circle that wide is only reached with the sun near the horizon, where the shadow is too faint and too long. Draw a smaller one.",
    };
  const height = geometricFromApparent(apparent);
  const before = altitudeCrossing(place.lat, place.lon, date, height, -1);
  const after = altitudeCrossing(place.lat, place.lon, date, height, 1);
  if (before === null || after === null) {
    return { ok: false, reason: "The shadow is never that long on this date here (the sun stays high all day). Draw a smaller circle." };
  }
  const halfway = (before + after) / 2;
  const rate = (at: number) => {
    const step = MINUTE;
    const a = shadowLength(stick, sunAt(at - step, place.lat, place.lon).apparentAltitude);
    const b = shadowLength(stick, sunAt(at + step, place.lat, place.lon).apparentAltitude);
    return Math.abs(b - a) / 2; // metres a minute
  };
  const timing = (at: number) => markError / Math.max(rate(at), 1e-9); // minutes
  const either = Math.hypot(timing(before), timing(after)) / 2;
  const { low, high } = widen(halfway, halfway - either * MINUTE, halfway + either * MINUTE);
  const warnings: string[] = [];
  const apart = (after - before) / MINUTE;
  if (apart < 90)
    warnings.push(
      `The two marks are only about ${minutesText(apart)} apart, close to noon, where the shadow changes slowly. A wider circle, reached earlier and later, gives a better answer.`,
    );
  return {
    ok: true,
    estimate: {
      at: halfway,
      low,
      high,
      because: `At the two marks, about ${minutesText(apart / 2)} either side of noon, the shadow's tip moves about ${mm(rate(before))} a minute, so a marking error of ${mm(markError)} at each is worth about ${minutesText(either)} in the halfway moment.`,
      warnings,
    },
  };
}

/** The two readings of a clock that runs but shows the wrong time, as minutes past midnight, and their halfway point. */
export function halfwayReading(first: number, second: number): number {
  const later = second < first ? second + 1440 : second;
  return ((first + later) / 2) % 1440;
}

/** How far a clock is wrong: what it should have read less what it did, in minutes, between −12 and +12 hours. */
export function clockError(shouldRead: number, didRead: number): number {
  const difference = (((shouldRead - didRead) % 1440) + 1440) % 1440;
  return difference > 720 ? difference - 1440 : difference;
}

// ── 2. The time from the sun's height (the shadow's length) ────────────────

export type HalfDay = "morning" | "afternoon";

/**
 * The sun's apparent height is the angle whose tangent is the stick over its shadow. The
 * time is when the sun stands at that height on that side of noon. The range takes the
 * stated error off and on both lengths, and half the sun's width for the blurred end of
 * the shadow; where the sun's height changes slowly (near noon) that is a long time.
 */
export function timeFromShadowLength(
  place: Place,
  date: IsoDate,
  stick: number,
  shadow: number,
  half: HalfDay,
  markError: number,
): Outcome {
  if (!(stick > 0) || !(shadow > 0) || !(markError >= 0))
    return { ok: false, reason: "The stick and its shadow must both be longer than nothing." };
  if (markError >= stick || markError >= shadow)
    return { ok: false, reason: "The marking error must be smaller than the stick and the shadow." };
  const side = half === "morning" ? -1 : 1;
  const day = sunDay(place.lat, place.lon, date);
  const highestApparent = day.noonAltitude + refraction(day.noonAltitude);
  const apparent = Math.atan(stick / shadow) / DEG;
  const apparentHigh = Math.atan((stick + markError) / (shadow - markError)) / DEG + SHADOW_BLUR_DEGREES;
  const apparentLow = Math.atan((stick - markError) / (shadow + markError)) / DEG - SHADOW_BLUR_DEGREES;
  if (apparentLow > highestApparent) {
    return {
      ok: false,
      reason: `That shadow is shorter than any the sun casts here on this date: the sun climbs no higher than ${round(highestApparent, 1)}°, which with this stick makes a shadow of at least ${round(shadowLength(stick, highestApparent), 2)} m. Check the date, that the stick is upright and the ground level, or use the noon method.`,
    };
  }
  if (apparent < 3) {
    return {
      ok: false,
      reason:
        "The sun is less than 3° high for a shadow that long. So near the horizon the shadow is faint, the air bends the light by an uncertain amount, and the answer would be no use. Measure when the sun is higher.",
    };
  }
  const when = (seen: number): number | null => {
    if (seen >= highestApparent) return day.noon;
    return altitudeCrossing(place.lat, place.lon, date, geometricFromApparent(seen), side);
  };
  const at = when(apparent);
  const early = when(side === -1 ? Math.max(apparentLow, 0.5) : Math.min(apparentHigh, highestApparent));
  const late = when(side === -1 ? Math.min(apparentHigh, highestApparent) : Math.max(apparentLow, 0.5));
  if (at === null || early === null || late === null) {
    return {
      ok: false,
      reason:
        "The sun does not stand at that height on this side of noon on this date here. Check the date and whether it was morning or afternoon.",
    };
  }
  const { low, high } = widen(at, Math.min(early, late), Math.max(early, late));
  const range = (high - low) / 2 / MINUTE;
  const climb = Math.abs(sunAt(at + MINUTE, place.lat, place.lon).altitude - sunAt(at - MINUTE, place.lat, place.lon).altitude) / 2;
  const warnings: string[] = [];
  if (range > 45 || Math.abs(at - day.noon) < 75 * MINUTE)
    warnings.push(
      "This is too near noon for this method: the sun's height hardly changes then, so the shadow's length says little about the time. Use the noon method instead, or measure two hours or more from noon.",
    );
  return {
    ok: true,
    estimate: {
      at,
      low,
      high,
      because: `A ${mm(markError)} error in the stick and the shadow, and the shadow's blurred end (half the sun's width, ${SHADOW_BLUR_DEGREES}°), make the sun's height good to about ±${round((apparentHigh - apparentLow) / 2, 2)}°; then the sun is ${half === "morning" ? "climbing" : "sinking"} about ${round(climb * 60, 1)}° an hour, so the time is good to about ${minutesText(range)}.`,
      warnings,
    },
  };
}

// ── 3. The time from the sun's bearing (the shadow's compass bearing) ──────

const angleDiff = (a: number, b: number) => ((a - b + 540) % 360) - 180;

/** The instant in daylight on a date when the sun stands at a true bearing; null if it never does then. */
export function whenSunBears(place: Place, date: IsoDate, bearing: number): number | null {
  const day = sunDay(place.lat, place.lon, date);
  if (day.sun.kind === "below") return null;
  const start = day.sun.kind === "crosses" && day.sun.begin !== null ? day.sun.begin : day.noon - 12 * 60 * MINUTE;
  const end = day.sun.kind === "crosses" && day.sun.end !== null ? day.sun.end : day.noon + 12 * 60 * MINUTE;
  const step = 2 * MINUTE;
  const off = (at: number) => angleDiff(sunAt(at, place.lat, place.lon).azimuth, bearing);
  let previous = off(start);
  for (let at = start + step; at <= end; at += step) {
    const now = off(at);
    // A change of sign that is a crossing, not the jump on the far side of the circle.
    if (Math.sign(now) !== Math.sign(previous) && Math.abs(now - previous) < 90) {
      let lo = at - step;
      let hi = at;
      for (let pass = 0; pass < 30; pass += 1) {
        const mid = (lo + hi) / 2;
        if (Math.sign(off(mid)) === Math.sign(off(lo))) lo = mid;
        else hi = mid;
      }
      return (lo + hi) / 2;
    }
    if (now === 0) return at;
    previous = now;
  }
  return null;
}

/**
 * The sun's true bearing is the shadow's bearing turned half round, plus the magnetic
 * declination (east positive) where the bearing was read on a compass. The time is when
 * the sun stands at that bearing. The range is the compass's reading error put through
 * the same; a declination not known is said to put the answer out by an unknown amount.
 */
export function timeFromShadowBearing(
  place: Place,
  date: IsoDate,
  shadowBearing: number,
  declination: number | null,
  compassError: number,
): Outcome {
  if (!Number.isFinite(shadowBearing) || !(compassError >= 0))
    return { ok: false, reason: "Type the shadow's bearing in degrees, 0 to 360." };
  const sunBearing = (((shadowBearing + 180 + (declination ?? 0)) % 360) + 360) % 360;
  const at = whenSunBears(place, date, sunBearing);
  if (at === null) {
    return {
      ok: false,
      reason: `The sun is not on a bearing of ${round(sunBearing)}° at any time between sunrise and sunset on this date here, so the shadow cannot point to ${round(shadowBearing)}°. Check the bearing (the shadow's, from the stick's foot to its tip), the declination and the date.`,
    };
  }
  const near = (bearing: number) => whenSunBears(place, date, bearing) ?? at;
  const a = near(sunBearing - compassError);
  const b = near(sunBearing + compassError);
  const { low, high } = widen(at, Math.min(a, b, at), Math.max(a, b, at));
  const perDegree = Math.abs(near(sunBearing + 1) - at) / MINUTE;
  const warnings: string[] = [];
  if (declination === null)
    warnings.push(
      `No magnetic declination was given, so the answer is off by an unknown amount: here and now each degree of declination moves it by about ${minutesText(perDegree)}. The World Magnetic Model's figure for the place and date is offered in the field, as is a recent map's margin.`,
    );
  if (sunAt(at, place.lat, place.lon).apparentAltitude > 70)
    warnings.push("The sun is very high then, so the shadow is short and its bearing hard to read: give the compass error generously.");
  return {
    ok: true,
    estimate: {
      at,
      low,
      high,
      because: `A compass read to ±${round(compassError, 1)}°, while the sun's bearing changes by about ${round(1 / Math.max(perDegree, 1e-9), 2)}° a minute then, makes the time good to about ${minutesText((high - low) / 2 / MINUTE)}${declination === null ? ", before the unknown declination" : ", plus whatever error the declination typed has"}.`,
      warnings,
    },
  };
}

// ── 4. Sunrise or sunset on a sea horizon ───────────────────────────────────

/** The dip of a sea horizon below level, in degrees, for an eye so many metres above the water: 1.76′ √h (Bowditch, appendix B). */
export const horizonDip = (eyeHeight: number) => (1.76 * Math.sqrt(Math.max(0, eyeHeight))) / 60;

/**
 * The moment the sun's upper edge meets a true sea horizon. Sunrise is reckoned with the
 * sun's centre 0.833° below a level line (refraction and half its width), and a sea
 * horizon lies lower than level by the dip for the eye's height. A rough check only:
 * the air's refraction at the horizon strays from its average, and the sun moves slowly
 * upwards then, so a little error in height is a long one in time.
 */
export function timeFromSeaHorizon(place: Place, date: IsoDate, event: "rise" | "set", eyeHeight: number): Outcome {
  if (!(eyeHeight >= 0) || eyeHeight > 1000)
    return { ok: false, reason: "Give the height of your eye above the sea in metres, 0 to 1,000." };
  const side = event === "rise" ? -1 : 1;
  const height = -0.833 - horizonDip(eyeHeight);
  const at = altitudeCrossing(place.lat, place.lon, date, height, side);
  if (at === null) {
    const day = sunDay(place.lat, place.lon, date);
    return {
      ok: false,
      reason:
        day.noonAltitude < height
          ? "The sun does not rise above a sea horizon at this place on this date (the polar night)."
          : "The sun does not set below a sea horizon at this place on this date (the midnight sun).",
    };
  }
  const a = altitudeCrossing(place.lat, place.lon, date, height - HORIZON_REFRACTION_DEGREES, side) ?? at;
  const b = altitudeCrossing(place.lat, place.lon, date, height + HORIZON_REFRACTION_DEGREES, side) ?? at;
  const { low, high } = widen(at, Math.min(a, b, at), Math.max(a, b, at));
  return {
    ok: true,
    estimate: {
      at,
      low,
      high,
      because: `The air bends light most at the horizon and by an amount that changes with its temperature; allowing ±${HORIZON_REFRACTION_DEGREES}° for that (Outpost's own allowance, not a published figure) is about ${minutesText((high - low) / 2 / MINUTE)} here, where the sun ${event === "rise" ? "climbs" : "sinks"} slowly.`,
      warnings: [
        "A rough check only. Land, haze or a cloud bank on the horizon makes the sun appear later and vanish sooner, by more than this range allows.",
      ],
    },
  };
}

// ── 5. A date not known exactly ─────────────────────────────────────────────

/**
 * How far the answer moves if the date is wrong by a few days: the time of day the same
 * measurement gives on each date either side, compared with this date's. Through the
 * equation of time it is a few seconds a day at most for noon; through the declination it
 * can be much more for the methods that read the sun's height or bearing.
 */
export function dateShift(
  compute: (date: IsoDate) => Outcome,
  date: IsoDate,
  days: readonly number[] = [1, 3, 7],
): Array<{ days: number; minutes: number | null }> {
  const base = compute(date);
  if (!base.ok) return days.map((each) => ({ days: each, minutes: null }));
  return days.map((each) => {
    const shifts = [-each, each].map((offset) => {
      const other = compute(addDays(date, offset));
      return other.ok ? Math.abs(other.estimate.at - base.estimate.at - offset * DAY) / MINUTE : null;
    });
    return { days: each, minutes: shifts.some((shift) => shift === null) ? null : Math.max(...(shifts as number[])) };
  });
}
