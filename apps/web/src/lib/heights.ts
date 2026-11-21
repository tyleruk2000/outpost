/**
 * How a height is written, everywhere on the map screens: in metres or in feet. The
 * height of the ground, a climb, a clearance over a hill: all of them go through
 * `formatHeight`, so one screen never shows both. The choice is kept in this browser
 * only, like the theme and the clock, and is metres until someone chooses
 * (feet on a device set to the United States, where maps give heights in feet).
 *
 * How finely a height is written follows from how well it is known:
 *
 * - The ground (and a climb, which is ground heights added up) to the nearest metre, or
 *   the nearest 5 feet. Terrain is a grid of cells tens of metres wide whose heights are
 *   good to a few metres at best; a metre is already finer than that, and 5 feet (1.5 m)
 *   is the nearest round step in feet that does not claim more.
 * - A height above the ground that a person typed or that was worked out from one (an
 *   aerial, a clearance under a ray, the Earth's bulge): to a tenth of a metre under
 *   10 m and whole metres above, or to the foot. These are as exact as what was typed.
 *
 * Distances are not heights: they are written in kilometres with miles beside them, as
 * before. Where a person types a height (an aerial's), the field stays in metres and
 * says so.
 */
import { useSyncExternalStore } from "react";
import { likelyHeightUnit } from "./region";
import { formatNumber } from "./utils";

export type HeightUnit = "m" | "ft";
/** How well the height is known: the ground from terrain, or a height above it that was typed. */
export type HeightPrecision = "ground" | "fine";

export const HEIGHT_UNITS: readonly HeightUnit[] = ["m", "ft"];
export const FEET_PER_METRE = 1 / 0.3048;
const KEY = "outpost.heights";

/** Never "-0 m": a height that rounds to nothing is nothing. */
const plain = (value: number) => (Object.is(value, -0) ? 0 : value);

/** A height in metres written in the unit given: "312 m", "1,025 ft", "4.5 m", "15 ft". */
export function heightText(meters: number, unit: HeightUnit, precision: HeightPrecision = "ground"): string {
  if (unit === "ft") {
    const feet = meters * FEET_PER_METRE;
    const shown = precision === "ground" ? Math.round(feet / 5) * 5 : Math.round(feet);
    return `${formatNumber(plain(shown))} ft`;
  }
  const shown = precision === "fine" && Math.abs(meters) < 9.95 ? Number(meters.toFixed(1)) : Math.round(meters);
  return `${formatNumber(plain(shown))} m`;
}

function readUnit(): HeightUnit {
  try {
    const stored = localStorage.getItem(KEY);
    return stored === "ft" || stored === "m" ? stored : likelyHeightUnit();
  } catch {
    // No storage here (a private window): the device's usual unit.
    return likelyHeightUnit();
  }
}

let unit: HeightUnit = readUnit();
const listeners = new Set<() => void>();
const changed = () => {
  for (const listener of listeners) listener();
};

export const heightUnit = (): HeightUnit => unit;

export function setHeightUnit(next: HeightUnit): void {
  unit = next;
  try {
    localStorage.setItem(KEY, next);
  } catch {
    // Storage refused: the choice then lasts for this visit only.
  }
  changed();
}

// Another tab of this browser changed the choice.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key !== KEY && event.key !== null) return;
    unit = readUnit();
    changed();
  });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The unit in force, for a component that must be drawn again when it changes. */
export function useHeightUnit(): HeightUnit {
  return useSyncExternalStore(subscribe, heightUnit);
}

/** The choice and the way to change it, for the place where it is made. */
export function useHeightChoice(): [HeightUnit, (next: HeightUnit) => void] {
  return [useHeightUnit(), setHeightUnit];
}

/** A height in metres, written in the unit chosen on this device. */
export function formatHeight(meters: number, precision: HeightPrecision = "ground"): string {
  return heightText(meters, unit, precision);
}
