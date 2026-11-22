/** The coordinate readout: one position in the format the person chose, at an honest precision. */
import {
  formatDecimal,
  formatDms,
  formatIrishGridRef,
  formatItm,
  formatMgrs,
  formatOsGridRef,
  formatUtm,
  type LocatorLength,
  type MgrsDigits,
  toMaidenhead,
} from "@outpost/shared";
import { metersPerPixel } from "./geo";

export const READOUT_FORMATS = ["decimal", "dms", "osgb", "irish", "itm", "utm", "mgrs", "maidenhead"] as const;
export type ReadoutFormat = (typeof READOUT_FORMATS)[number];

export const READOUT_LABELS: Record<ReadoutFormat, string> = {
  decimal: "Decimal degrees",
  dms: "Degrees, minutes, seconds",
  osgb: "British National Grid",
  irish: "Irish Grid",
  itm: "Irish Transverse Mercator (ITM)",
  utm: "UTM",
  mgrs: "MGRS (US National Grid)",
  maidenhead: "Maidenhead locator",
};

export const isReadoutFormat = (value: unknown): value is ReadoutFormat => (READOUT_FORMATS as readonly unknown[]).includes(value);

export interface Readout {
  text: string;
  /**
   * The format actually used: a British grid reference falls back to decimal degrees outside
   * Great Britain, an Irish one (Irish Grid or ITM) away from Ireland. UTM and MGRS cover the whole Earth, with UPS over the poles.
   */
  format: ReadoutFormat;
}

/** Grid reference figures that match what one pixel covers: no ten-metre claims from a country-wide view. */
export function gridFiguresFor(metersPerPx: number): 4 | 6 | 8 | 10 {
  if (metersPerPx >= 500) return 4;
  if (metersPerPx >= 50) return 6;
  if (metersPerPx >= 5) return 8;
  return 10;
}

/** As many characters of locator as the view can tell apart: a subsquare is 5′ wide, an extended square 30″. */
export function locatorLengthFor(metersPerPx: number): LocatorLength {
  if (metersPerPx >= 600) return 4;
  if (metersPerPx >= 60) return 6;
  return 8;
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
  if (format === "irish") {
    const reference = formatIrishGridRef(lat, lon, zoom === undefined ? 8 : gridFiguresFor(perPixel));
    if (reference) return { text: reference, format: "irish" };
  }
  if (format === "itm") {
    const step = zoom === undefined ? 1 : 10 ** (5 - gridFiguresFor(perPixel) / 2);
    const text = formatItm(lat, lon, step);
    if (text) return { text, format: "itm" };
  }
  if (format === "utm" || format === "mgrs") {
    const figures = zoom === undefined ? 10 : gridFiguresFor(perPixel);
    const text = format === "utm" ? formatUtm(lat, lon, 10 ** (5 - figures / 2)) : formatMgrs(lat, lon, (figures / 2) as MgrsDigits);
    if (text) return { text, format };
  }
  if (format === "maidenhead") {
    const locator = toMaidenhead(lat, lon, zoom === undefined ? 8 : locatorLengthFor(perPixel));
    if (locator) return { text: locator, format: "maidenhead" };
  }
  if (format === "dms") return { text: formatDms(lat, lon, perPixel < 5 ? 1 : 0), format: "dms" };
  return { text: formatDecimal(lat, lon, decimalDigitsFor(perPixel)), format: "decimal" };
}
