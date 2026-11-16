/**
 * The credits as they are printed. On screen a credit is a link; paper has no links, so
 * the address each one leads to is written out beside it. For OpenStreetMap this is a
 * condition of use, not a courtesy: the OpenStreetMap Foundation's attribution
 * guidelines say of printed maps that "the URL to openstreetmap.org/copyright must be
 * printed out", and that the credit belongs beside the map
 * (https://osmfoundation.org/wiki/Licence/Attribution_Guidelines, read 16 November 2026).
 *
 * Which credits are due is decided where it is decided for the screen (`creditsFor` in
 * map-footer.tsx); this only writes them down.
 */
import type { MapAttribution } from "@outpost/shared";
import type { Credit } from "../map-footer";

/** An address as it is written on paper: no scheme, no "www.", no trailing slash. */
export function printedAddress(url: string): string {
  return url
    .replace(/^[a-z][a-z0-9+.-]*:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/+$/, "");
}

/**
 * One line for the page from the credits due. Each is its words as shown on screen,
 * then the address to look it up at: the one the server gives for that source (for
 * OpenStreetMap, its copyright page), or failing that the first link in the credit.
 */
export function printedCredits(credits: Credit[], attributions: MapAttribution[]): string {
  return credits
    .map((credit) => {
      const words = credit.parts
        .map((part) => part.text)
        .join("")
        .trim();
      const address =
        attributions.find((attribution) => attribution.name === credit.key)?.url ?? credit.parts.find((part) => part.href)?.href;
      return address ? `${words}, ${printedAddress(address)}` : words;
    })
    .filter(Boolean)
    .join(" · ");
}
