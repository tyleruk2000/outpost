/**
 * The moon's phase at an instant: how much of its face is lit, and what that is called.
 *
 * From Jean Meeus, "Astronomical Algorithms", chapter 48: the phase angle from the mean
 * elongation and the mean anomalies of the sun and the moon, with his six largest
 * corrections. Good to a fraction of a percentage point of the lit face, which is all a
 * phase needs. Moonrise and moonset are a harder sum (the moon's distance and the place
 * both matter) and are not attempted here.
 */
import { julianCenturies } from "./sun";

const DEG = Math.PI / 180;
const sin = (degrees: number) => Math.sin(degrees * DEG);

export type MoonPhaseName =
  | "New moon"
  | "Waxing crescent"
  | "First quarter"
  | "Waxing gibbous"
  | "Full moon"
  | "Waning gibbous"
  | "Last quarter"
  | "Waning crescent";

export interface MoonPhase {
  /** The part of the face that is lit, 0 to 1. */
  illuminated: number;
  /** How far round its month the moon is, in degrees: 0 new, 90 first quarter, 180 full, 270 last quarter. */
  age: number;
  name: MoonPhaseName;
}

/** The moon gains about 12° on the sun in a day (between 11° and 14°), so a phase that falls within about half a day is within this. */
const HALF_A_DAY = 6.1;

export function moonPhase(ms: number): MoonPhase {
  const t = julianCenturies(ms);
  const elongation = 297.8501921 + t * (445_267.1114034 + t * (-0.0018819 + t / 545_868));
  const sunAnomaly = 357.5291092 + t * (35_999.0502909 - t * 0.0001536);
  const moonAnomaly = 134.9633964 + t * (477_198.8675055 + t * (0.0087414 + t / 69_699));
  const phaseAngle =
    180 -
    elongation -
    6.289 * sin(moonAnomaly) +
    2.1 * sin(sunAnomaly) -
    1.274 * sin(2 * elongation - moonAnomaly) -
    0.658 * sin(2 * elongation) -
    0.214 * sin(2 * moonAnomaly) -
    0.11 * sin(elongation);
  const age = (((180 - phaseAngle) % 360) + 360) % 360;
  const illuminated = (1 + Math.cos(phaseAngle * DEG)) / 2;

  const near = (target: number) => Math.abs(((age - target + 540) % 360) - 180) <= HALF_A_DAY;
  const name: MoonPhaseName = near(0)
    ? "New moon"
    : near(90)
      ? "First quarter"
      : near(180)
        ? "Full moon"
        : near(270)
          ? "Last quarter"
          : age < 90
            ? "Waxing crescent"
            : age < 180
              ? "Waxing gibbous"
              : age < 270
                ? "Waning gibbous"
                : "Waning crescent";
  return { illuminated, age, name };
}
