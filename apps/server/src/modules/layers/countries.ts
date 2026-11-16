/** Countries for choosing reference data, from Natural Earth (see countries.json). */
import type { Bbox } from "@outpost/shared";
import table from "./countries.json" with { type: "json" };

export interface Country {
  code: string;
  iso3: string;
  name: string;
  bbox: Bbox;
}

export const COUNTRIES: Country[] = (table as unknown as { countries: Country[] }).countries;
const BY_CODE = new Map(COUNTRIES.map((country) => [country.code, country]));

export function countryOf(code: string): Country | undefined {
  return BY_CODE.get(code.toUpperCase());
}

/** The box round several countries; a country that crosses the 180th meridian makes it the world's width. */
export function boxOfCountries(codes: string[]): Bbox | null {
  const boxes = codes.map((code) => countryOf(code)?.bbox).filter((box): box is Bbox => Boolean(box));
  if (boxes.length === 0) return null;
  return [
    Math.min(...boxes.map((box) => box[0])),
    Math.min(...boxes.map((box) => box[1])),
    Math.max(...boxes.map((box) => box[2])),
    Math.max(...boxes.map((box) => box[3])),
  ];
}
