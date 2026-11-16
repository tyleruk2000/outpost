import type { Source } from "../kit";

/** Where the outdoors calculators' formulas and figures come from. Read 2026-11-16 unless said. */
export const OUTDOOR_SOURCES = {
  naismith: {
    name: "The Adventure Activities Licensing Regulations 2004, regulation 2 (5 km an hour and one minute for every 10 m climbed); W. W. Naismith, Scottish Mountaineering Club Journal, 1892",
    url: "https://www.legislation.gov.uk/uksi/2004/1309/regulation/2/made",
    read: "2026-11-16",
  },
  langmuir: {
    name: "E. Langmuir, Mountaincraft and Leadership (4th edition, 2013), pp. 38–39, as cited by Wikipedia, “Naismith's rule”",
    url: "https://en.wikipedia.org/wiki/Naismith%27s_rule",
    read: "2026-11-16",
  },
  tranter: {
    name: "Tranter's corrections, as tabled by Wikipedia, “Naismith's rule”, which gives no primary source for the table",
    url: "https://en.wikipedia.org/wiki/Naismith%27s_rule#Tranter's_corrections",
    read: "2026-11-16",
  },
  geometry: { name: "Trigonometry: no published constant is used" },
  haversine: { name: "The haversine formula on a sphere of the Earth's mean radius, 6,371.0088 km (as the map measures)" },
  osgb: {
    name: "Ordnance Survey, A guide to coordinate systems in Great Britain (the transformation Outpost's map uses)",
    url: "https://www.ordnancesurvey.co.uk/documents/resources/guide-coordinate-systems-great-britain.pdf",
  },
  maidenhead: { name: "The Maidenhead locator system, as Outpost's radio tools read it" },
  noaaSun: {
    name: "NOAA Global Monitoring Laboratory, Solar calculator, after J. Meeus, Astronomical Algorithms (as Outpost's map uses)",
    url: "https://gml.noaa.gov/grad/solcalc/calcdetails.html",
  },
  nwsWindChill: {
    name: "US National Weather Service, “Understanding wind chill”",
    url: "https://www.weather.gov/safety/cold-wind-chill-chart",
    read: "2026-11-16",
  },
  eccWindChill: {
    name: "Environment and Climate Change Canada, “Wind chill and the Wind Chill Index” (page dated 16 December 2025), and its wind chill calculator",
    url: "https://www.canada.ca/en/services/environment/weather/severeweather/wind-chill-index.html",
    read: "2026-11-16",
  },
  nwsHeatIndex: {
    name: "US National Weather Service, Weather Prediction Center, “The heat index equation” (page modified 12 May 2022)",
    url: "https://www.wpc.ncep.noaa.gov/html/heatindex_equation.shtml",
    read: "2026-11-16",
  },
  nwsHeatChart: {
    name: "US National Weather Service, “Heat index” (categories, and full sun adding up to 15 °F)",
    url: "https://www.weather.gov/safety/heat-index",
    read: "2026-11-16",
  },
  modHydration: {
    name: "UK Ministry of Defence, JSP 375 volume 1 chapter 41, annex F, Hydration guidance (version 1.2, June 2024), table 1",
    url: "https://assets.publishing.service.gov.uk/media/66606e4a0c8f88e868d3361c/Annex_F_-_hydration_guidance.pdf",
    read: "2026-11-16",
  },
  npsGrandCanyon: {
    name: "US National Park Service, Grand Canyon, “Hike smart” (last updated 26 June 2026)",
    url: "https://www.nps.gov/grca/planyourvisit/hike-smart.htm",
    read: "2026-11-16",
  },
  compendium: {
    name: "2024 Adult Compendium of Physical Activities, Walking (codes 17010 to 17082)",
    url: "https://pacompendium.com/walking/",
    read: "2026-11-16",
  },
} satisfies Record<string, Source>;

/**
 * What Environment and Climate Change Canada says of each band of its wind chill index,
 * quoted, for a wind chill in °C rounded as ECCC rounds it. Null above 0.
 */
export function windChillRisk(value: number): string | null {
  const rounded = Math.round(value);
  if (rounded > 0) return null;
  if (rounded <= -55) return "exposed skin can freeze in less than 2 minutes … DANGER! outdoor conditions are hazardous";
  if (rounded <= -48) return "exposed skin can freeze in 2 to 5 minutes";
  if (rounded <= -40) return "any exposed skin can freeze in 5 to 10 minutes";
  if (rounded <= -28) return "any exposed skin can freeze in 10 to 30 minutes";
  if (rounded <= -10) return "risk of hypothermia and frostbite if outdoors for long periods";
  return "slight increase in physical discomfort";
}
