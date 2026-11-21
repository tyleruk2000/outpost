/**
 * The bright stars and the constellation figures, and where a star is at an instant.
 *
 * The stars are the Yale Bright Star Catalogue, 5th revised edition (D. Hoffleit and
 * W. H. Warren Jr, 1991, NASA Astronomical Data Center catalogue V/50), every star of
 * magnitude 4.5 or brighter (stars.gen.ts, written by scripts/write-star-catalogue.mjs).
 * From its J2000 place a star is carried on by its proper motion, shifted by aberration,
 * and turned by precession and nutation to the true equator and equinox of the day
 * (astro.ts). The figures are the usual stick figures, drawn for Outpost. Pure.
 */
import { aberrate, multiply, norm360, nutationMatrix, precessionMatrix, toRaDec, ttCenturies, unitVector, type Vec3 } from "./astro.ts";
import { FIGURES, STAR_NAMES, STAR_ROWS } from "./stars.gen.ts";

export interface CatalogueStar {
  /** Harvard Revised (Bright Star Catalogue) number. */
  hr: number;
  /** J2000 right ascension and declination, degrees. */
  ra: number;
  dec: number;
  magnitude: number;
  /** Proper motion, arcseconds a year: in right ascension (times cos dec) and in declination. */
  pmRa: number;
  pmDec: number;
  name: string | null;
  /** The Nautical Almanac's number for one of its 57 navigational stars; 0 for Polaris. */
  navNumber: number | null;
}

const names = new Map(STAR_NAMES.map(([hr, name, number]) => [hr, { name, number }]));

export const STARS: readonly CatalogueStar[] = STAR_ROWS.map(([hr, ra, dec, magnitude, pmRa, pmDec]) => ({
  hr,
  ra,
  dec,
  magnitude,
  pmRa,
  pmDec,
  name: names.get(hr)?.name ?? null,
  navNumber: names.get(hr)?.number ?? null,
}));

const byHr = new Map(STARS.map((star) => [star.hr, star]));
export const starByHr = (hr: number): CatalogueStar | undefined => byHr.get(hr);

/** The 57 navigational stars, in the almanac's order, and Polaris last. */
export const NAVIGATIONAL_STARS: readonly CatalogueStar[] = STARS.filter((s) => s.navNumber !== null).sort(
  (a, b) => (a.navNumber || 99) - (b.navNumber || 99),
);

export const starByName = (name: string): CatalogueStar | undefined => {
  const wanted = name.trim().toLowerCase();
  return STARS.find((s) => s.name?.toLowerCase() === wanted);
};

export interface Figure {
  abbr: string;
  name: string;
  pairs: ReadonlyArray<readonly [number, number]>;
}

export const CONSTELLATION_FIGURES: readonly Figure[] = FIGURES.map(([abbr, name, pairs]) => ({ abbr, name, pairs }));

/**
 * The Earth's velocity in the J2000 equatorial frame, AU a day, for aberration: from the
 * Sun's mean motion (Schlyter's solar elements, carried to J2000 by his precession in
 * longitude, 3.82394e-5° a day). Good to about one per cent, which moves a star by
 * a fifth of a second of arc.
 */
function earthVelocityJ2000(t: number): Vec3 {
  const d = t * 36_525 + 1.5;
  const at = (day: number): Vec3 => {
    const M = (356.047 + 0.9856002585 * day) * (Math.PI / 180);
    const w = 282.9404 + 4.70935e-5 * day;
    const e = 0.016709 - 1.151e-9 * day;
    const E = M + e * Math.sin(M) * (1 + e * Math.cos(M));
    const xv = Math.cos(E) - e;
    const yv = Math.sqrt(1 - e * e) * Math.sin(E);
    const lon = Math.atan2(yv, xv) + (w - 3.82394e-5 * day) * (Math.PI / 180);
    const r = Math.hypot(xv, yv);
    const eps = 23.4392911 * (Math.PI / 180);
    const x = r * Math.cos(lon);
    const y = r * Math.sin(lon);
    return [x, y * Math.cos(eps), y * Math.sin(eps)];
  };
  const a = at(d - 0.5);
  const b = at(d + 0.5);
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

/** A star's apparent right ascension and declination at an instant, true equator and equinox of date, degrees. */
export function starPlaceOfDate(star: Pick<CatalogueStar, "ra" | "dec" | "pmRa" | "pmDec">, ms: number): { ra: number; dec: number } {
  const t = ttCenturies(ms);
  const years = t * 100;
  const cosDec = Math.cos(star.dec * (Math.PI / 180));
  const ra = star.ra + (star.pmRa * years) / 3600 / Math.max(1e-6, cosDec);
  const dec = star.dec + (star.pmDec * years) / 3600;
  const astrometric = unitVector(ra, dec);
  const shifted = aberrate(astrometric, earthVelocityJ2000(t));
  const ofDate = multiply(nutationMatrix(t), multiply(precessionMatrix(t), shifted));
  const place = toRaDec(ofDate);
  return { ra: norm360(place.ra), dec: place.dec };
}
