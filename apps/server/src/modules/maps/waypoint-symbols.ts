/**
 * The names GPX files use for a waypoint's symbol (`<sym>`), and the icons of saved
 * places they stand for.
 *
 * GPX itself fixes no list of symbols: `<sym>` is free text, and each program writes
 * its own names. The names nearest to a common vocabulary are Garmin's, which its own
 * programs and units read and many others accept. Every name below was checked against
 * the table of Garmin symbol names in GPSBabel (`garmin_icon_tables.h`, "based on
 * information provided by Ian Cowley, Sigurd Humerfelt, and Garmin MapSource"), read
 * on 16 November 2026:
 *
 *   https://github.com/GPSBabel/gpsbabel/blob/master/garmin_icon_tables.h
 *
 * Only the names are used, as facts about what Garmin's programs read; nothing of
 * that file is copied. No name is written that was not found there. An icon with no
 * obvious Garmin symbol (the plain pin, a meeting point, a star) is written without a
 * `<sym>`, which every program reads as its own default.
 *
 * What was not tried: opening a file written here in Garmin's own programs or on a
 * Garmin unit.
 */
import type { MarkerIcon } from "@outpost/shared";

/** The symbol written for an icon on export, where Garmin has an obvious one. */
export const SYMBOL_FOR_ICON: Partial<Record<MarkerIcon, string>> = {
  home: "Residence",
  shelter: "Lodge",
  tent: "Campground",
  parking: "Parking Area",
  water: "Drinking Water",
  food: "Restaurant",
  "first-aid": "Medical Facility",
  fuel: "Gas Station",
  summit: "Summit",
  viewpoint: "Scenic Area",
  mast: "Tall Tower",
  danger: "Danger Area",
  flag: "Flag, Blue",
};

/** Symbols read on import, beyond the ones written: other Garmin names for the same kind of place. */
const ALSO_READ: Record<string, MarkerIcon> = {
  Lodging: "shelter",
  "Water Source": "water",
  "Fast Food": "food",
  "Short Tower": "mast",
  "Radio Beacon": "mast",
  "Skull and Crossbones": "danger",
  Flag: "flag",
  "Flag, Red": "flag",
  "Flag, Green": "flag",
};

const key = (symbol: string) => symbol.trim().replace(/\s+/g, " ").toLowerCase();

const ICON_FOR_SYMBOL = new Map<string, MarkerIcon>([
  ...Object.entries(SYMBOL_FOR_ICON).map(([icon, symbol]) => [key(symbol), icon as MarkerIcon] as const),
  ...Object.entries(ALSO_READ).map(([symbol, icon]) => [key(symbol), icon] as const),
]);

/** Every symbol name that is read as an icon, as Garmin writes it. For the documentation and the tests. */
export const KNOWN_SYMBOLS: readonly string[] = [...Object.values(SYMBOL_FOR_ICON), ...Object.keys(ALSO_READ)];

/**
 * The icon a waypoint's symbol stands for. Capitals and spacing are not held against a
 * file; anything not known is the plain pin.
 */
export function iconForSymbol(symbol: string | null | undefined): MarkerIcon {
  return (symbol ? ICON_FOR_SYMBOL.get(key(symbol)) : undefined) ?? "pin";
}

/**
 * The `<sym>` a saved place is exported with.
 *
 * A place that came from a GPX file keeps the symbol it had there, word for word, for
 * as long as its icon is still the one that symbol was read as: "Geocache" stays
 * "Geocache" on a plain pin, and "Lodging" stays "Lodging" rather than becoming
 * "Lodge". Once a person gives the place another icon, the icon speaks: the file says
 * what the map shows.
 */
export function symbolForPlace(icon: MarkerIcon, original: string | null | undefined): string | undefined {
  if (original && iconForSymbol(original) === icon) return original;
  return SYMBOL_FOR_ICON[icon];
}
