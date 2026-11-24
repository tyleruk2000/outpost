/**
 * How the Satellites screen says times, frequencies and passes. Times are given in UTC,
 * as the engine works and as satellite operators publish, and on this device's own
 * clock beside it, in the 12- or 24-hour style chosen ("14:32 UTC (15:32 here)").
 */
import { compassPoint, elementsAge, elementsAgeWarning, sunAt } from "@outpost/shared";
import { clockText, formatTimeOfDay } from "@/lib/clock";
import { formatDate } from "@/lib/utils";
import { LOW_PASS_BELOW_DEG, type SatellitePass } from "./engine";

/** "14:32" in UTC, always on the 24-hour clock. */
export const utcTime = (at: Date | number) => {
  const date = new Date(at);
  return clockText(date.getUTCHours(), date.getUTCMinutes(), "24");
};

/** "14:32 UTC (15:32 here)", or "14:32 UTC" where the device's clock is UTC. */
export function bothTimes(at: Date | number): string {
  const date = new Date(at);
  const here = formatTimeOfDay(date);
  return date.getTimezoneOffset() === 0 && here === utcTime(date) ? `${utcTime(date)} UTC` : `${utcTime(date)} UTC (${here} here)`;
}

/** "in 12 min", "in 3 h 05 min", "now". */
export function countdown(at: Date, now: Date): string {
  const minutes = Math.round((at.getTime() - now.getTime()) / 60_000);
  if (minutes <= 0) return "now";
  if (minutes < 60) return `in ${minutes} min`;
  return `in ${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")} min`;
}

/** The day a pass is on, on this device: "Today", "Tomorrow", "21 Nov 2026". */
export function dayWords(at: Date, now: Date): string {
  const key = (date: Date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
  if (key(at) === key(now)) return "Today";
  if (key(at) === key(new Date(now.getTime() + 86_400_000))) return "Tomorrow";
  return formatDate(at.getTime());
}

/** "Always up here: point 25° up, to the SSE (166°)", for a satellite that stays in view (a geostationary one). */
export function alwaysUpWords(pass: SatellitePass): string {
  return `Always up here: point ${Math.round(pass.maxElevationDeg)}° up, to the ${compassPoint(pass.tcaAzimuthDeg)} (${Math.round(pass.tcaAzimuthDeg)}°)`;
}

/** "Rises in the NNW, highest 47° in the ENE, sets in the SE." */
export function pathWords(pass: SatellitePass): string {
  if (pass.alwaysUp) return alwaysUpWords(pass);
  return `Rises in the ${compassPoint(pass.aosAzimuthDeg)}, highest ${Math.round(pass.maxElevationDeg)}° in the ${compassPoint(pass.tcaAzimuthDeg)}, sets in the ${compassPoint(pass.losAzimuthDeg)}`;
}

/**
 * "145.800 MHz", "145.8125 MHz", "10.489550 GHz": always to the kHz, and to 100 Hz below
 * 1 GHz where the figure has it. Above 1 GHz the kHz still counts: QO-100's narrowband
 * transponder runs from 10.489550 to 10.489800 GHz, which four places of GHz made one figure.
 */
export function frequencyWords(hz: number): string {
  if (hz >= 1e9) return `${(Math.round(hz / 1000) / 1e6).toFixed(6)} GHz`;
  return `${(hz / 1e6).toFixed(hz % 1000 === 0 ? 3 : 4)} MHz`;
}

/** "+3,210 Hz", "−880 Hz". */
export function shiftWords(hz: number): string {
  const rounded = Math.round(hz);
  return `${rounded >= 0 ? "+" : "−"}${Math.abs(rounded).toLocaleString("en-GB")} Hz`;
}

/**
 * A pass in words by its highest point: high from 45°, good from 20°, fair from 10°, and
 * low below `LOW_PASS_BELOW_DEG`, the one line Passes, Weather satellites and the PDF draw.
 */
export function geometryWords(maxElevationDeg: number): string {
  if (maxElevationDeg >= 45) return "High pass";
  if (maxElevationDeg >= 20) return "Good pass";
  if (maxElevationDeg >= LOW_PASS_BELOW_DEG) return "Fair pass";
  return "Low pass";
}

/** Daylight, twilight (sun up to 12° below) or night at a place and moment, as LogBook73's weather planner gave it. */
export function lightAt(lat: number, lon: number, at: Date): "daylight" | "twilight" | "night" {
  const altitude = sunAt(at.getTime(), lat, lon).altitude;
  if (altitude >= 0) return "daylight";
  if (altitude >= -12) return "twilight";
  return "night";
}

export { elementsAge, elementsAgeWarning };
