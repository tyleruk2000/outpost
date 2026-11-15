#!/usr/bin/env node
/**
 * Writes catalog/map-regions.json: the ready-made regions offered on the Maps screen.
 *
 *   node apps/server/src/modules/maps/build-regions.mjs [path/to/ne_110m_admin_0_countries.geojson]
 *
 * The list has two parts. The first is curated by hand below: places people actually
 * ask for (national parks, mountain ranges, the home nations) with boxes checked
 * against the map. The second is every country in Natural Earth's 1:110m data, with a
 * box computed from its outline. Without an argument the Natural Earth file is
 * downloaded from the pinned release. Run this again only when the curated list
 * changes; the output is committed.
 */
import fs from "node:fs";
import path from "node:path";

const NATURAL_EARTH_TAG = "v5.1.2";
const COUNTRIES_URL = `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/${NATURAL_EARTH_TAG}/geojson/ne_110m_admin_0_countries.geojson`;
const OUTPUT = path.resolve(import.meta.dirname, "../../../../../catalog/map-regions.json");

const MAX_LATITUDE = 85.0511;
/** The 1:110m outlines cut corners by several kilometres; pad the boxes so coasts are inside. */
const MARGIN_DEGREES = 0.2;

/** [west, south, east, north]. Checked by hand against OpenStreetMap. */
const CURATED = [
  {
    id: "world",
    name: "World overview",
    group: "World",
    bbox: [-180, -MAX_LATITUDE, 180, MAX_LATITUDE],
    recommendedMaxZoom: 6,
    note: "The whole world down to zoom 6: countries, cities and main roads. A backdrop for the detailed regions you add.",
  },

  { id: "united-kingdom", name: "United Kingdom", group: "Britain and Ireland", bbox: [-8.65, 49.85, 1.77, 60.86], recommendedMaxZoom: 12 },
  { id: "england", name: "England", group: "Britain and Ireland", bbox: [-6.45, 49.85, 1.77, 55.82], recommendedMaxZoom: 12 },
  { id: "scotland", name: "Scotland", group: "Britain and Ireland", bbox: [-8.65, 54.63, -0.72, 60.86], recommendedMaxZoom: 12 },
  { id: "wales", name: "Wales", group: "Britain and Ireland", bbox: [-5.48, 51.37, -2.65, 53.44], recommendedMaxZoom: 13 },
  {
    id: "northern-ireland",
    name: "Northern Ireland",
    group: "Britain and Ireland",
    bbox: [-8.18, 54.02, -5.43, 55.32],
    recommendedMaxZoom: 13,
  },
  {
    id: "ireland",
    name: "Ireland",
    group: "Britain and Ireland",
    bbox: [-10.68, 51.39, -5.99, 55.44],
    recommendedMaxZoom: 12,
    note: "The whole island, so most of Northern Ireland is inside the box too.",
  },
  { id: "lake-district", name: "Lake District", group: "Britain and Ireland", bbox: [-3.55, 54.17, -2.6, 54.78], recommendedMaxZoom: 14 },
  { id: "snowdonia", name: "Snowdonia (Eryri)", group: "Britain and Ireland", bbox: [-4.3, 52.52, -3.43, 53.29], recommendedMaxZoom: 14 },
  {
    id: "scottish-highlands",
    name: "Scottish Highlands",
    group: "Britain and Ireland",
    bbox: [-6.8, 56.0, -2.8, 58.7],
    recommendedMaxZoom: 13,
    note: "The mainland Highlands with Skye and the Cairngorms. The Outer Hebrides, Orkney and Shetland are not included.",
  },
  { id: "peak-district", name: "Peak District", group: "Britain and Ireland", bbox: [-2.1, 53.0, -1.52, 53.6], recommendedMaxZoom: 14 },

  { id: "european-alps", name: "European Alps", group: "Mountain ranges", bbox: [5.0, 43.5, 16.5, 48.3], recommendedMaxZoom: 12 },
  { id: "pyrenees", name: "Pyrenees", group: "Mountain ranges", bbox: [-2.0, 42.0, 3.35, 43.4], recommendedMaxZoom: 13 },

  {
    id: "france",
    iso: "FR",
    name: "France",
    group: "Europe",
    bbox: [-5.15, 41.33, 9.56, 51.09],
    recommendedMaxZoom: 11,
    note: "Mainland France and Corsica. Overseas departments are not included.",
  },
  { id: "switzerland", iso: "CH", name: "Switzerland", group: "Europe", bbox: [5.96, 45.82, 10.49, 47.81], recommendedMaxZoom: 13 },
  { id: "austria", iso: "AT", name: "Austria", group: "Europe", bbox: [9.53, 46.37, 17.16, 49.02], recommendedMaxZoom: 13 },
  { id: "italy", iso: "IT", name: "Italy", group: "Europe", bbox: [6.63, 35.49, 18.52, 47.09], recommendedMaxZoom: 11 },
  {
    id: "spain",
    iso: "ES",
    name: "Spain",
    group: "Europe",
    bbox: [-9.3, 35.95, 4.33, 43.79],
    recommendedMaxZoom: 11,
    note: "Mainland Spain and the Balearic Islands. The Canary Islands are not included.",
  },
  { id: "germany", iso: "DE", name: "Germany", group: "Europe", bbox: [5.87, 47.27, 15.04, 55.06], recommendedMaxZoom: 11 },
  {
    id: "norway",
    iso: "NO",
    name: "Norway",
    group: "Europe",
    bbox: [4.5, 57.96, 31.17, 71.19],
    recommendedMaxZoom: 11,
    note: "Mainland Norway. Svalbard and Jan Mayen are not included.",
  },
  { id: "iceland", iso: "IS", name: "Iceland", group: "Europe", bbox: [-24.55, 63.29, -13.49, 66.57], recommendedMaxZoom: 12 },
];
/** Countries the curated list already covers, under their own ids. */
const CURATED_ISO = new Set(["GB", "IE", ...CURATED.map((region) => region.iso).filter(Boolean)]);

const NAME_FIXES = {
  "Republic of Serbia": "Serbia",
  "United Republic of Tanzania": "Tanzania",
  "The Bahamas": "Bahamas",
  "United States of America": "United States",
};
const GROUP_ORDER = [
  "World",
  "Britain and Ireland",
  "Mountain ranges",
  "Europe",
  "Africa",
  "Asia",
  "North America",
  "South America",
  "Oceania",
  "Antarctica and remote islands",
];

/** Outer rings of a Polygon or MultiPolygon. */
function outerRings(geometry) {
  if (geometry.type === "Polygon") return [geometry.coordinates[0]];
  if (geometry.type === "MultiPolygon") return geometry.coordinates.map((polygon) => polygon[0]);
  return [];
}

function boxOf(rings) {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const ring of rings) {
    for (const [lon, lat] of ring) {
      west = Math.min(west, lon);
      east = Math.max(east, lon);
      south = Math.min(south, lat);
      north = Math.max(north, lat);
    }
  }
  return [west, south, east, north];
}

/** Planar area of a ring in square degrees: only used to compare the two sides of a country. */
function ringArea(ring) {
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i += 1) sum += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  return Math.abs(sum / 2);
}

/**
 * The box of a country. A country that straddles the 180° meridian (Russia, Fiji) has
 * pieces at both edges of the map, and one box around them would circle the globe; a
 * download box cannot wrap, so the larger side is kept and a note says what is left out.
 */
function countryBox(geometry) {
  const rings = outerRings(geometry);
  const eastSide = rings.filter((ring) => ring.every(([lon]) => lon >= 0));
  const westSide = rings.filter((ring) => ring.every(([lon]) => lon <= 0));
  const whole = boxOf(rings);
  const straddles =
    whole[2] - whole[0] > 180 && eastSide.length + westSide.length === rings.length && eastSide.length > 0 && westSide.length > 0;
  if (!straddles) return { box: whole };
  const area = (side) => side.reduce((sum, ring) => sum + ringArea(ring), 0);
  const keepEast = area(eastSide) >= area(westSide);
  return {
    box: boxOf(keepEast ? eastSide : westSide),
    note: `This country crosses the 180° meridian. The box covers the part ${keepEast ? "west" : "east"} of it; download the rest as a custom region.`,
  };
}

function pad([west, south, east, north]) {
  const round = (value, direction) => (direction < 0 ? Math.floor(value * 100) / 100 : Math.ceil(value * 100) / 100);
  return [
    round(Math.max(-180, west - MARGIN_DEGREES), -1),
    Math.max(-MAX_LATITUDE, round(south - MARGIN_DEGREES, -1)),
    round(Math.min(180, east + MARGIN_DEGREES), 1),
    Math.min(MAX_LATITUDE, round(north + MARGIN_DEGREES, 1)),
  ];
}

/** Rough ground area of a box, to choose a default zoom that keeps the download sensible. */
function areaKm2([west, south, east, north]) {
  const midLat = ((south + north) / 2) * (Math.PI / 180);
  return (east - west) * 111.32 * Math.cos(midLat) * (north - south) * 110.57;
}

function recommendedZoom(bbox) {
  const area = areaKm2(bbox);
  if (area > 3_000_000) return 9;
  if (area > 1_000_000) return 10;
  if (area > 300_000) return 11;
  if (area > 100_000) return 12;
  if (area > 30_000) return 13;
  return 14;
}

async function loadCountries(file) {
  if (file) return JSON.parse(fs.readFileSync(file, "utf8"));
  const response = await fetch(COUNTRIES_URL);
  if (!response.ok) throw new Error(`Natural Earth download failed: HTTP ${response.status}`);
  return response.json();
}

const countries = await loadCountries(process.argv[2]);
const generated = [];
for (const feature of countries.features) {
  const properties = feature.properties;
  const iso = properties.ISO_A2_EH !== "-99" ? properties.ISO_A2_EH : null;
  if (iso && CURATED_ISO.has(iso)) continue;
  const { box, note } = countryBox(feature.geometry);
  const bbox = pad(box);
  const continent = properties.CONTINENT;
  generated.push({
    id: `country-${(iso ?? properties.ADM0_A3).toLowerCase()}`,
    name: NAME_FIXES[properties.ADMIN] ?? properties.ADMIN,
    group: continent === "Antarctica" || continent.startsWith("Seven seas") ? "Antarctica and remote islands" : continent,
    bbox,
    recommendedMaxZoom: recommendedZoom(bbox),
    ...(note ? { note } : {}),
  });
}

const order = (region) => GROUP_ORDER.indexOf(region.group);
const curated = CURATED.map(({ iso: _iso, ...region }) => region);
// Hand-picked regions keep the order they were written in; countries follow alphabetically.
const regions = [
  ...curated.filter((region) => region.group !== "Europe"),
  ...[...curated.filter((region) => region.group === "Europe"), ...generated].sort(
    (a, b) => order(a) - order(b) || a.name.localeCompare(b.name, "en"),
  ),
];

const ids = new Set();
for (const region of regions) {
  const [west, south, east, north] = region.bbox;
  if (ids.has(region.id)) throw new Error(`Duplicate region id ${region.id}`);
  ids.add(region.id);
  if (!(west < east && south < north && west >= -180 && east <= 180 && south >= -90 && north <= 90) || order(region) === -1) {
    throw new Error(`Region ${region.id} has an impossible box or an unknown group: ${JSON.stringify(region)}`);
  }
}

const output = {
  description:
    "Ready-made map regions. Generated by apps/server/src/modules/maps/build-regions.mjs; edit the curated list there, not this file.",
  countriesSource: `Natural Earth 1:110m Admin 0 Countries (${NATURAL_EARTH_TAG}), public domain`,
  regions,
};
fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
fs.writeFileSync(
  OUTPUT,
  `${JSON.stringify(output, null, 2).replace(/\[\s+(-?[\d.]+),\s+(-?[\d.]+),\s+(-?[\d.]+),\s+(-?[\d.]+)\s+\]/g, "[$1, $2, $3, $4]")}\n`,
);
console.log(`Wrote ${regions.length} regions (${curated.length} curated, ${generated.length} countries) to ${OUTPUT}`);
