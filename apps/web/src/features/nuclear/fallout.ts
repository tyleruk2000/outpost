/**
 * The fallout wind as the form shows it: compass points to degrees and back, said with
 * "from" (where the wind blows from) and "towards" (where the pattern runs), since
 * mixing the two is the classic mistake; the one-line state under the field (drawn, or
 * why not); and the area to fit the map to so that the pattern can be seen.
 */
import type { Bbox, EffectsResult } from "@outpost/shared";
import type { ScenarioForm } from "./form";
import { destination, plumePolygon } from "./geometry";
import { compass } from "./words";

/** The eight points offered as buttons, with the bearing each wind blows from. */
export const COMPASS_POINTS = [
  { label: "N", name: "north", degrees: 0 },
  { label: "NE", name: "north-east", degrees: 45 },
  { label: "E", name: "east", degrees: 90 },
  { label: "SE", name: "south-east", degrees: 135 },
  { label: "S", name: "south", degrees: 180 },
  { label: "SW", name: "south-west", degrees: 225 },
  { label: "W", name: "west", degrees: 270 },
  { label: "NW", name: "north-west", degrees: 315 },
] as const;

/** The point a wind blowing from `degrees` is named by, when it is one of the eight; null between them. */
export function pointOf(degrees: number): (typeof COMPASS_POINTS)[number] | null {
  const normal = ((degrees % 360) + 360) % 360;
  return COMPASS_POINTS.find((point) => point.degrees === normal) ?? null;
}

/** "from the west, so the pattern runs east". */
export function fromTowards(fromDegrees: number): string {
  return `from the ${compass(fromDegrees)}, so the pattern runs ${compass(fromDegrees + 180)}`;
}

export type FalloutState = { drawn: boolean; text: string };

/** What the field says under itself, for one scenario: drawn, or the one reason it is not. */
export function falloutState(form: ScenarioForm, result: EffectsResult | null, refused: string[]): FalloutState {
  const from = form.windFrom.trim();
  const speed = form.windSpeed.trim();
  const unit = form.windUnit === "mph" ? "mph" : "km/h";
  const windRefusal = refused.find((reason) => /wind/i.test(reason));
  if (form.burst !== "surface")
    return {
      drawn: false,
      text: "No fallout pattern is drawn: the burst is at a height, and the model draws fallout only for a burst on the surface. A wind typed here is kept for when it is.",
    };
  if (!from && !speed) return { drawn: false, text: "No fallout pattern is drawn: give the direction the wind blows from and its speed." };
  if (!from) return { drawn: false, text: "No fallout pattern is drawn: give the direction the wind blows from as well as its speed." };
  if (!speed) return { drawn: false, text: `No fallout pattern is drawn: give the wind's speed, in ${unit}, as well as its direction.` };
  const fromNumber = Number(from.replace(/,/g, ""));
  const speedNumber = Number(speed.replace(/,/g, ""));
  if (!Number.isFinite(fromNumber) || !Number.isFinite(speedNumber))
    return { drawn: false, text: "No fallout pattern is drawn: give the direction in degrees and the speed as numbers." };
  if (windRefusal) return { drawn: false, text: `No fallout pattern is drawn. ${windRefusal}` };
  if (result?.fallout.drawn)
    return { drawn: true, text: `Drawn: wind ${fromTowards(result.fallout.fromDegrees)}, at ${Math.round(speedNumber)} ${unit}.` };
  return {
    drawn: false,
    text:
      result && !result.fallout.drawn
        ? `No fallout pattern is drawn. ${result.fallout.why}`
        : "No fallout pattern is drawn until the scenario can be worked out.",
  };
}

/**
 * The area that shows a scenario: its rings, and its fallout pattern out to the contour
 * of `upToRate` rads per hour (the whole drawn pattern for 1; the 100 contour when it is
 * first drawn, so that the rings are not shrunk to nothing by a pattern tens of
 * kilometres long). A tenth again is left round it.
 */
export function fitArea(result: EffectsResult, at: { lat: number; lon: number }, upToRate: number): Bbox {
  const points: Array<[number, number]> = [];
  const reach = Math.max(1, ...result.rings.map((ring) => ring.metres ?? 0)) * 1.1;
  for (const bearing of [0, 90, 180, 270]) {
    const point = destination(at, bearing, reach);
    points.push([point.lon, point.lat]);
  }
  if (result.fallout.drawn) {
    const contours = result.fallout.contours.filter((contour) => contour.rate >= upToRate);
    const widest = contours.reduce<(typeof contours)[number] | null>(
      (best, contour) => (!best || contour.downwindM > best.downwindM ? contour : best),
      null,
    );
    if (widest) points.push(...plumePolygon(at, widest, result.fallout.fromDegrees, 48));
  }
  let [west, south, east, north] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [lon, lat] of points) {
    west = Math.min(west, lon);
    east = Math.max(east, lon);
    south = Math.min(south, lat);
    north = Math.max(north, lat);
  }
  const padLon = (east - west) * 0.05;
  const padLat = (north - south) * 0.05;
  return [west - padLon, south - padLat, east + padLon, north + padLat];
}
