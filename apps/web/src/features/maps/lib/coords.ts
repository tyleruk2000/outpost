/** The coordinate readout: one position in the format the person chose, at an honest precision. */
import { formatDecimal, formatDms, formatOsGridRef } from "@outpost/shared";
import { metersPerPixel } from "./geo";

export const READOUT_FORMATS = ["decimal", "dms", "osgb"] as const;
export type ReadoutFormat = (typeof READOUT_FORMATS)[number];

export const READOUT_LABELS: Record<ReadoutFormat, string> = {
  decimal: "Decimal degrees",
  dms: "Degrees, minutes, seconds",
  osgb: "British National Grid",
};

export const isReadoutFormat = (value: unknown): value is ReadoutFormat => (READOUT_FORMATS as readonly unknown[]).includes(value);

export interface Readout {
  text: string;
  /** The format actually used: a grid reference falls back to decimal degrees outside Great Britain. */
  format: ReadoutFormat;
}

/** Grid reference figures that match what one pixel covers: no ten-metre claims from a country-wide view. */
export function gridFiguresFor(metersPerPx: number): 4 | 6 | 8 | 10 {
  if (metersPerPx >= 500) return 4;
  if (metersPerPx >= 50) return 6;
  if (metersPerPx >= 5) return 8;
  return 10;
}

export function decimalDigitsFor(metersPerPx: number): number {
  if (metersPerPx >= 500) return 3;
  if (metersPerPx >= 50) return 4;
  return 5;
}

/**
 * A position as text. `zoom` sets the precision; leave it out for a stored position
 * (a saved place), which is shown in full.
 */
export function formatPosition(lat: number, lon: number, format: ReadoutFormat, zoom?: number): Readout {
  const perPixel = zoom === undefined ? 1 : metersPerPixel(lat, zoom);
  if (format === "osgb") {
    const reference = formatOsGridRef(lat, lon, zoom === undefined ? 8 : gridFiguresFor(perPixel));
    if (reference) return { text: reference, format: "osgb" };
  }
  if (format === "dms") return { text: formatDms(lat, lon, perPixel < 5 ? 1 : 0), format: "dms" };
  return { text: formatDecimal(lat, lon, decimalDigitsFor(perPixel)), format: "decimal" };
}
