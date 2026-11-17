/**
 * Place names for Great Britain from Ordnance Survey's OS Open Names, and British
 * postcodes as people type them.
 *
 * A postcode is an outward code (the area and district, "SY23") and an inward code (the
 * sector digit and the unit's two letters, "3BY"). People type it with or without the
 * space, in any case, and often only the first part. `parsePostcode` reads all of those
 * into the form Ordnance Survey writes ("SY23 3BY"), so a search can look for exactly
 * that. Royal Mail's format, as Ordnance Survey's data uses it: the outward code is one
 * or two letters, a digit, and an optional letter or digit; the inward code is a digit
 * and two letters.
 */

export type PostcodePart = "unit" | "partial-unit" | "sector" | "district";

export interface ParsedPostcode {
  /** As Ordnance Survey writes it: "SY23 3BY", "SY23 3B", "SY23 3", "SY23". */
  canonical: string;
  part: PostcodePart;
  /** The letters at the start: "SY", "BT", "E". */
  area: string;
}

const OUTWARD = "([A-Z]{1,2}[0-9][A-Z0-9]?)";

/**
 * The postcode areas of the United Kingdom and the Crown Dependencies, so that a road
 * number such as "A487" is not read as the start of a postcode: the 120 areas of the
 * postcodes in OS Open Names (October 2026 edition, counted from the file), and BT
 * (Northern Ireland), GY, IM and JE, which it does not cover.
 */
const AREAS = new Set(
  (
    "AB AL B BA BB BD BH BL BN BR BS BT CA CB CF CH CM CO CR CT CV CW DA DD DE DG DH DL DN DT DY E EC EH EN EX FK FY G GL GU GY " +
    "HA HD HG HP HR HS HU HX IG IM IP IV JE KA KT KW KY L LA LD LE LL LN LS LU M ME MK ML N NE NG NN NP NR NW OL OX PA PE PH PL " +
    "PO PR RG RH RM S SA SE SG SK SL SM SN SO SP SR SS ST SW SY TA TD TF TN TQ TR TS TW UB W WA WC WD WF WN WR WS WV YO ZE"
  ).split(" "),
);

/**
 * Reads typed text as a postcode or the start of one. Returns null for anything that
 * is not shaped like one; a district ("SY23") is also the shape of a grid reference,
 * and the caller decides what to offer.
 */
export function parsePostcode(input: string): ParsedPostcode | null {
  const text = input.trim().toUpperCase().replace(/\s+/g, " ");
  if (text.length < 2 || text.length > 9) return null;
  const area = (outward: string) => /^[A-Z]+/.exec(outward)![0];
  const known = (outward: string) => AREAS.has(area(outward));

  // With the space: the inward code may be whole or begun.
  let match = new RegExp(`^${OUTWARD} ([0-9])([A-Z]{0,2})$`).exec(text);
  if (match && known(match[1]!)) {
    const [, outward, sector, unit] = match as unknown as [string, string, string, string];
    const part: PostcodePart = unit.length === 2 ? "unit" : unit.length === 1 ? "partial-unit" : "sector";
    return { canonical: `${outward} ${sector}${unit}`, part, area: area(outward) };
  }
  if (text.includes(" ")) return null;

  // Without it: the inward code is always the last three characters when it is all there.
  match = new RegExp(`^${OUTWARD}([0-9])([A-Z]{1,2})$`).exec(text);
  if (match && known(match[1]!)) {
    const [, outward, sector, unit] = match as unknown as [string, string, string, string];
    return { canonical: `${outward} ${sector}${unit}`, part: unit.length === 2 ? "unit" : "partial-unit", area: area(outward) };
  }
  match = new RegExp(`^${OUTWARD}$`).exec(text);
  if (match && known(match[1]!)) return { canonical: match[1]!, part: "district", area: area(match[1]!) };
  // "SY233": a district followed by the sector's digit, read only where the district
  // alone would not be a whole postcode district (four characters at most).
  match = /^([A-Z]{1,2}[0-9][A-Z0-9])([0-9])$/.exec(text);
  if (match && known(match[1]!)) return { canonical: `${match[1]} ${match[2]}`, part: "sector", area: area(match[1]!) };
  return null;
}

/** Northern Ireland's postcodes all begin BT. OS Open Names covers Great Britain only. */
export function isNorthernIrelandPostcode(postcode: ParsedPostcode | null): boolean {
  return postcode?.area === "BT";
}

/** OS Open Names as Ordnance Survey's Downloads API describes it, with what Outpost holds. */
export interface OsNamesCheck {
  /** The edition OS offers now, as it names it: "2026-10". */
  edition: string;
  /** "October 2026". */
  editionLabel: string;
  sizeBytes: number;
  md5: string;
  fileName: string;
  /** Where the file comes from, named for the person before they press Download. */
  host: string;
  /** The edition held here, if any. */
  installed: { id: string; edition: string; editionLabel: string } | null;
  /** True when what is held is older than what OS offers. */
  updateAvailable: boolean;
  /** When the check was made (ms since the epoch). */
  checkedAt: number;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "2026-10" as "October 2026"; anything else as it is. */
export function osEditionLabel(edition: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(edition);
  const month = match ? MONTHS[Number(match[2]) - 1] : undefined;
  return match && month ? `${month} ${match[1]}` : edition;
}

/** The dataset name OS Open Names is recorded under among the places datasets. */
export const OS_NAMES_DATASET = "os-open-names";
