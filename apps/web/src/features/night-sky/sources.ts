import type { Source } from "../tools/kit";

/** Where the night sky's and celestial navigation's figures come from, each read on the date given. */
export const SKY_SOURCES = {
  bsc: {
    name: "D. Hoffleit and W. H. Warren Jr, The Bright Star Catalogue, 5th revised edition (Yale University Observatory; NASA Astronomical Data Center catalogue V/50, 1991): the stars, magnitude 4.5 and brighter",
    url: "http://tdc-www.harvard.edu/catalogs/bsc5.html",
    read: "2026-11-21",
  },
  schlyter: {
    name: "P. Schlyter, How to compute planetary positions: the orbits of the Sun, Moon and planets, the Moon's parallax and size, the planets' brightness",
    url: "https://stjarnhimlen.se/comp/ppcomp.html",
    read: "2026-11-21",
  },
  circular179: {
    name: "G. H. Kaplan, The IAU Resolutions on Astronomical Reference Systems, Time Scales, and Earth Rotation Models (USNO Circular 179, 2005): precession and nutation",
    url: "https://aa.usno.navy.mil/downloads/Circular_179.pdf",
    read: "2026-11-21",
  },
  usnoSidereal: {
    name: "US Naval Observatory, Computing Approximate Sidereal Time",
    url: "https://aa.usno.navy.mil/faq/GAST",
    read: "2026-11-17",
  },
  usnoDeltaT: {
    name: "US Naval Observatory, Delta T (TT − UT1), monthly values: 69.2 s on 1 October 2026",
    url: "https://maia.usno.navy.mil/ser7/deltat.data",
    read: "2026-11-21",
  },
  usnoRst: {
    name: "US Naval Observatory, Rise, Set, and Twilight Definitions",
    url: "https://aa.usno.navy.mil/faq/RST_defs",
    read: "2026-11-21",
  },
  usnoCelnav: {
    name: "US Naval Observatory, Celestial Navigation Data for Assumed Position and Time (the almanac the tests are held to)",
    url: "https://aa.usno.navy.mil/data/celnav",
    read: "2026-11-21",
  },
  usnoMoon: {
    name: "US Naval Observatory, Complete Sun and Moon Data for One Day (the moonrise, moonset and phases the tests are held to)",
    url: "https://aa.usno.navy.mil/data/RS_OneDay",
    read: "2026-11-21",
  },
  fm2176: {
    name: "US Army, FM 21-76 Survival, chapter 18, Field-expedient direction finding: using the stars",
    url: "https://www.sjsu.edu/people/michelle.hager/docs/fm_21-76_us_army_survival_manual_2006.pdf",
    read: "2026-11-21",
  },
  bowditch: {
    name: "N. Bowditch, The American Practical Navigator (NGA Pub. 9, 2019), vol. 1, appendix B: dip of the horizon, sight reduction by calculator",
    url: "https://thenauticalalmanac.com/2019_Bowditch-_American_Practical_Navigator/Volume-_1/13-%20Appendices/Appendix%20B-%20Calculations%20and%20Conversions.pdf",
    read: "2026-11-21",
  },
  noaa: {
    name: "NOAA Global Monitoring Laboratory, Solar Calculation Details: the refraction model",
    url: "https://gml.noaa.gov/grad/solcalc/calcdetails.html",
    read: "2026-11-17",
  },
} satisfies Record<string, Source>;

/** How close the almanac worked out here comes to the Observatory's, as the tests hold it (minutes of arc on the sky). */
export const ALMANAC_ACCURACY = {
  stars: 0.5,
  sun: 0.5,
  moon: 2,
  planets: 2,
} as const;
