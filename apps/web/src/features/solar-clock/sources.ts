import type { Source } from "../tools/kit";

/** Where the solar clock's formulas and figures come from. Each was read on the date given; Meeus was not (see docs/tools-solar-clock.md). */
export const SOLAR_SOURCES = {
  noaa: {
    name: "NOAA Global Monitoring Laboratory, Solar Calculation Details (equations after J. Meeus, Astronomical Algorithms; refraction model)",
    url: "https://gml.noaa.gov/grad/solcalc/calcdetails.html",
    read: "2026-11-17",
  },
  usnoCelnav: {
    name: "US Naval Observatory, Celestial Navigation Data for Assumed Position and Time (the values the tests are held to)",
    url: "https://aa.usno.navy.mil/data/celnav",
    read: "2026-11-17",
  },
  usnoSidereal: {
    name: "US Naval Observatory, Computing Approximate Sidereal Time",
    url: "https://aa.usno.navy.mil/faq/GAST",
    read: "2026-11-17",
  },
  bowditch: {
    name: "N. Bowditch, The American Practical Navigator (NGA Pub. 9, 2019), vol. 1, appendix B: dip of the horizon, altitude and azimuth formulas",
    url: "https://thenauticalalmanac.com/2019_Bowditch-_American_Practical_Navigator/Volume-_1/13-%20Appendices/Appendix%20B-%20Calculations%20and%20Conversions.pdf",
    read: "2026-11-17",
  },
  nass: {
    name: "North American Sundial Society, Sundial Math: Calculating Dial Lines",
    url: "https://sundials.org/education/sundial-math",
    read: "2026-11-17",
  },
  schoolphysics: {
    name: "K. Gibbs, schoolphysics, Making a horizontal sundial (the table of hour-line angles the tests are held to)",
    url: "https://www.schoolphysics.co.uk/age14-16/Astronomy/text/Sundial_/index.html",
    read: "2026-11-17",
  },
  bss: {
    name: "British Sundial Society, Setting up a sundial (true north, the equation of time and the longitude correction)",
    url: "https://sundialsoc.org.uk/all-about-sundials/setting-up-a-sundial/",
    read: "2026-11-17",
  },
  ypop: {
    name: "Yohkoh Public Outreach Project (Montana State University), Finding Geographic North (the shortest shadow)",
    url: "https://solar.physics.montana.edu/ypop/Classroom/Lessons/Sundials/north.html",
    read: "2026-11-17",
  },
  rmg: {
    name: "L. Devoy, Royal Museums Greenwich, What is a nocturnal? (30 October 2023)",
    url: "https://www.rmg.co.uk/stories/blog/astronomy/what-nocturnal",
    read: "2026-11-17",
  },
} satisfies Record<string, Source>;
