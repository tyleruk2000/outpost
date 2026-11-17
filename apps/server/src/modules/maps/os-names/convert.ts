/**
 * OS Open Names, as Ordnance Survey publishes it in CSV, turned into rows of the places
 * table that the map's search already reads.
 *
 * The download is one zip: `Doc/OS_Open_Names_Header.csv` names the 34 columns, and
 * `Data/*.csv` holds about three million named places in 20 km squares of the National
 * Grid, with no header line, each file starting with a byte-order mark. Positions are
 * National Grid eastings and northings (OSGB36). They are converted to WGS 84 latitude
 * and longitude with Ordnance Survey's published Helmert transformation (A guide to
 * coordinate systems in Great Britain, v3.6, section 6.6 and annexes C.2 and D), which
 * OS says is good to 3.5 metres (95%); about 5 metres is the figure Outpost states. That
 * is ample for finding a village or a postcode, and needs no grid file (OSTN15, the exact
 * transformation, does).
 *
 * What is kept: settlements, hills and other landforms, water, woods and other land
 * cover, stations, ports and airfields, schools, hospitals and the like, roads by name
 * and number, and postcodes. What is left out: "Section Of Named Road" and "Section Of
 * Numbered Road", which repeat a road once for each settlement it passes through
 * (101,435 and 5,944 rows in the October 2026 edition). From the postcodes Outpost also
 * makes one row for each postcode district ("SY23") and sector ("SY23 3"), at the middle
 * of its postcodes, so that a postcode typed in part finds the area.
 *
 * Rows go in under the same columns as GeoNames' (see places.ts): the feature class is
 * GeoNames' letter for the same kind of thing, so the two rank alike, with R for roads
 * and Z for postcodes; the feature code is `os:` and OS's own local type; `admin1` holds
 * the place's area in words; `geoname_id` is the GeoNames record OS says is the same
 * place, so a place held in both is listed once.
 */
import { fromOsGrid, ownValue } from "@outpost/shared";

/** The columns this reader needs, by the names in OS's header file. */
const NEEDED = [
  "ID",
  "NAME1",
  "NAME2",
  "TYPE",
  "LOCAL_TYPE",
  "GEOMETRY_X",
  "GEOMETRY_Y",
  "POPULATED_PLACE",
  "DISTRICT_BOROUGH",
  "COUNTY_UNITARY",
  "COUNTRY",
  "SAME_AS_GEONAMES",
] as const;
type Column = (typeof NEEDED)[number];
export type ColumnIndex = Record<Column, number>;

/** The header OS has published since 2015, used if the file's own cannot be read. */
export const OS_NAMES_HEADER =
  "ID,NAMES_URI,NAME1,NAME1_LANG,NAME2,NAME2_LANG,TYPE,LOCAL_TYPE,GEOMETRY_X,GEOMETRY_Y,MOST_DETAIL_VIEW_RES,LEAST_DETAIL_VIEW_RES,MBR_XMIN,MBR_YMIN,MBR_XMAX,MBR_YMAX,POSTCODE_DISTRICT,POSTCODE_DISTRICT_URI,POPULATED_PLACE,POPULATED_PLACE_URI,POPULATED_PLACE_TYPE,DISTRICT_BOROUGH,DISTRICT_BOROUGH_URI,DISTRICT_BOROUGH_TYPE,COUNTY_UNITARY,COUNTY_UNITARY_URI,COUNTY_UNITARY_TYPE,REGION,REGION_URI,COUNTRY,COUNTRY_URI,RELATED_SPATIAL_OBJECT,SAME_AS_DBPEDIA,SAME_AS_GEONAMES";

/** Where each needed column is, from the header line; null if one is missing. */
export function columnIndex(header: string): ColumnIndex | null {
  const names = parseCsvLine(header.replace(/^﻿/, "").trim()).map((name) => name.trim().toUpperCase());
  const index = {} as ColumnIndex;
  for (const column of NEEDED) {
    const at = names.indexOf(column);
    if (at < 0) return null;
    index[column] = at;
  }
  return index;
}

/**
 * One line of CSV as fields. Fields may be quoted ("Further Education,Secondary
 * Education"), with a doubled quote for a quote inside. A record whose quotes run on
 * past the end of the line is joined to the next line first (see `opensQuote`).
 */
export function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]!;
    if (quoted) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i += 1;
        } else quoted = false;
      } else field += char;
    } else if (char === '"' && field === "") quoted = true;
    else if (char === ",") {
      fields.push(field);
      field = "";
    } else field += char;
  }
  fields.push(field);
  return fields;
}

/** Whether a line ends inside a quoted field, so that the record continues on the next. */
export function opensQuote(line: string): boolean {
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]!;
    if (char !== '"') continue;
    if (quoted && line[i + 1] === '"') i += 1;
    else quoted = !quoted;
  }
  return quoted;
}

/** GeoNames' feature classes, which the search's ranking already understands, and two of Outpost's own. */
const CLASS_OF_TYPE: Record<string, string> = {
  populatedPlace: "P",
  landform: "T",
  hydrography: "H",
  landcover: "V",
  transportNetwork: "S",
  other: "S",
};

/** Ordnance Survey's local types in a household's words. Unlisted ones keep OS's own. */
const LABELS: Record<string, string> = {
  City: "City",
  Town: "Town",
  Village: "Village",
  Hamlet: "Hamlet",
  "Suburban Area": "Part of a town",
  "Other Settlement": "Settlement",
  "Hill Or Mountain": "Hill or mountain",
  "Hill Or Mountain Ranges": "Range of hills",
  Valley: "Valley",
  Island: "Island",
  "Group Of Islands": "Islands",
  "Coastal Headland": "Headland",
  "Cliff Or Slope": "Cliff or slope",
  "Cirque Or Hollow": "Corrie or hollow",
  "Spot Height": "Spot height",
  "Other Coastal Landform": "Coastal feature",
  "Other Landform": "Landform",
  "Inland Water": "River or lake",
  Bay: "Bay",
  Channel: "Channel",
  Estuary: "Estuary",
  Sea: "Sea",
  "Tidal Water": "Tidal water",
  Waterfall: "Waterfall",
  "Woodland Or Forest": "Wood or forest",
  Beach: "Beach",
  Wetland: "Marsh or bog",
  "Urban Greenspace": "Park",
  "Other Landcover": "Open land",
  "Named Road": "Street or road",
  "Numbered Road": "Numbered road",
  "Railway Station": "Railway station",
  Railway: "Railway line",
  Tramway: "Tramway",
  Airport: "Airport",
  Airfield: "Airfield",
  Heliport: "Heliport",
  "Helicopter Station": "Heliport",
  "Bus Station": "Bus station",
  "Coach Station": "Coach station",
  "Bus Station,Coach Station": "Bus and coach station",
  Harbour: "Harbour",
  "Port Consisting of Docks and Nautical Berthing": "Port",
  "Passenger Ferry Terminal": "Ferry terminal",
  "Vehicular Ferry Terminal": "Car ferry terminal",
  "Passenger Ferry Terminal,Vehicular Ferry Terminal": "Ferry terminal",
  "Vehicular Rail Terminal": "Car train terminal",
  "Road User Services": "Motorway services",
  Hospital: "Hospital",
  "Hospital,Medical Care Accommodation": "Hospital",
  Hospice: "Hospice",
  "Medical Care Accommodation": "Care home",
  "Higher or University Education": "University",
  "Further Education,Higher or University Education": "College or university",
  "Electricity Production": "Power station",
  "Electricity Distribution": "Electricity substation",
  "Gas Distribution or Storage": "Gas works",
  "Oil Distribution or Storage": "Oil depot",
  "Oil Refining": "Oil refinery",
  "Oil Terminal": "Oil terminal",
  "Chemical Works": "Chemical works",
  Postcode: "Postcode",
  "Postcode district": "Postcode district",
  "Postcode sector": "Postcode sector",
};

const CODE_PREFIX = "os:";

/** True for a row that came from OS Open Names. */
export function isOsCode(featureCode: string | null): boolean {
  return Boolean(featureCode?.startsWith(CODE_PREFIX));
}

/** What an OS Open Names row is, in plain words: "Village", "Hill or mountain", "Postcode". */
export function osKindLabel(featureCode: string): string {
  const localType = featureCode.slice(CODE_PREFIX.length);
  const named = ownValue(LABELS, localType);
  if (named) return named;
  if (/Further Education/.test(localType)) return "College";
  if (/Education/.test(localType)) return "School";
  return localType || "Place";
}

/**
 * How much a kind of place should rise in the list over others that match as well.
 * Settlements first, by size; then the hills, water and land a walker looks for; then
 * the rest. Roads and postcodes rank on their own after these (see places.ts).
 */
export function osProminence(featureCode: string): number {
  switch (featureCode.slice(CODE_PREFIX.length)) {
    case "City":
      return 0.35;
    case "Town":
      return 0.3;
    case "Village":
      return 0.22;
    case "Hamlet":
    case "Suburban Area":
      return 0.15;
    case "Other Settlement":
      return 0.1;
    case "Hill Or Mountain":
    case "Hill Or Mountain Ranges":
    case "Inland Water":
    case "Island":
    case "Valley":
      return 0.12;
    case "Postcode district":
    case "Postcode sector":
      return 0.2;
    default:
      return 0.05;
  }
}

/** Roads and postcode units: many share a name, so they come after places that match as well. */
export function isStreetLevel(featureClass: string | null): boolean {
  return featureClass === "R" || featureClass === "Z";
}

/**
 * "Sir Ceredigion - Ceredigion" is OS's way of giving a Welsh and an English name; the
 * English is kept for the line under a result, which has room for one.
 */
export function englishArea(value: string): string {
  const parts = value.split(" - ");
  return (parts.length === 2 ? parts[1]! : value).trim();
}

/** "Aberystwyth, Ceredigion, Wales": the settlement (for a road or postcode), district, county and nation. */
function areaOf(row: string[], index: ColumnIndex, withSettlement: boolean): string | null {
  const parts = [
    withSettlement ? row[index.POPULATED_PLACE] : "",
    row[index.DISTRICT_BOROUGH],
    row[index.COUNTY_UNITARY],
    row[index.COUNTRY],
  ]
    .map((part) => englishArea(part ?? ""))
    .filter(Boolean);
  const unique = parts.filter((part, at) => parts.indexOf(part) === at);
  return unique.length > 0 ? unique.join(", ") : null;
}

/** The columns of an insert into `places`, in places.ts's order after the collection id. */
export type PlaceValues = [
  geonameId: number | null,
  name: string,
  asciiName: string,
  altNames: string,
  lat: number,
  lon: number,
  featureClass: string,
  featureCode: string,
  country: string,
  admin1: string | null,
  population: number,
  elevation: number | null,
];

/** Plain letters, for the `ascii_name` the ranking compares with. */
function plain(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function position(easting: number, northing: number): { lat: number; lon: number } | null {
  if (!Number.isFinite(easting) || !Number.isFinite(northing)) return null;
  const found = fromOsGrid(easting, northing);
  if (!found) return null;
  // Six decimal places is about 0.1 m, the resolution OS gives its coordinates to.
  return { lat: Math.round(found.lat * 1e6) / 1e6, lon: Math.round(found.lon * 1e6) / 1e6 };
}

interface AreaTally {
  easting: number;
  northing: number;
  count: number;
  /** How often each "settlement, county, nation" line came up, so the area can be named by its commonest. */
  areas: Map<string, number>;
}

/**
 * Reads rows one at a time and gathers the postcode districts and sectors as it goes.
 * `rows()` at the end gives one row for each district and sector.
 */
export class OsNamesConverter {
  readonly counts = { kept: 0, skipped: 0, postcodes: 0, roads: 0 };
  private readonly districts = new Map<string, AreaTally>();
  private readonly sectors = new Map<string, AreaTally>();

  private readonly index: ColumnIndex;

  constructor(index: ColumnIndex) {
    this.index = index;
  }

  /** One record of a data file as the values of a places row, or null if it is not kept. */
  convert(fields: string[]): PlaceValues | null {
    const { index } = this;
    const type = fields[index.TYPE] ?? "";
    const localType = fields[index.LOCAL_TYPE] ?? "";
    const name = (fields[index.NAME1] ?? "").trim();
    if (!name || localType.startsWith("Section Of ") || !ownValue(CLASS_OF_TYPE, type)) {
      this.counts.skipped += 1;
      return null;
    }
    const easting = Number(fields[index.GEOMETRY_X]);
    const northing = Number(fields[index.GEOMETRY_Y]);
    const at = position(easting, northing);
    if (!at) {
      this.counts.skipped += 1;
      return null;
    }
    const isPostcode = localType === "Postcode";
    const isRoad = localType === "Named Road" || localType === "Numbered Road";
    const featureClass = isPostcode ? "Z" : isRoad ? "R" : CLASS_OF_TYPE[type]!;
    const area = areaOf(fields, index, isPostcode || isRoad || featureClass === "S");

    const alternates: string[] = [];
    const other = (fields[index.NAME2] ?? "").trim();
    if (other && other !== name) alternates.push(other);
    if (isPostcode) {
      // "SY233BY" as typed without the space; the index does not join words by itself.
      alternates.push(name.replace(/\s+/g, ""));
      this.tally(name, easting, northing, area);
      this.counts.postcodes += 1;
    }
    if (isRoad) this.counts.roads += 1;
    const ascii = plain(name);
    if (ascii !== name) alternates.unshift(ascii);
    const geonames = /geonames\.org\/(\d+)/.exec(fields[index.SAME_AS_GEONAMES] ?? "");

    this.counts.kept += 1;
    return [
      geonames ? Number(geonames[1]) : null,
      name,
      ascii,
      alternates.join(","),
      at.lat,
      at.lon,
      featureClass,
      `${CODE_PREFIX}${localType}`,
      "GB",
      area,
      0,
      null,
    ];
  }

  private tally(postcode: string, easting: number, northing: number, area: string | null) {
    const [outward, inward] = postcode.split(" ");
    if (!outward || !inward) return;
    const add = (map: Map<string, AreaTally>, key: string, line: string) => {
      let tally = map.get(key);
      if (!tally) {
        tally = { easting: 0, northing: 0, count: 0, areas: new Map() };
        map.set(key, tally);
      }
      tally.easting += easting;
      tally.northing += northing;
      tally.count += 1;
      if (line) tally.areas.set(line, (tally.areas.get(line) ?? 0) + 1);
    };
    add(this.districts, outward, area ?? "");
    add(this.sectors, `${outward} ${inward[0]}`, area ?? "");
  }

  /** The postcode districts and sectors, each at the middle of its postcodes. */
  areaRows(): PlaceValues[] {
    const rows: PlaceValues[] = [];
    const emit = (map: Map<string, AreaTally>, kind: "Postcode district" | "Postcode sector") => {
      for (const [name, tally] of map) {
        const at = position(tally.easting / tally.count, tally.northing / tally.count);
        if (!at) continue;
        const commonest = [...tally.areas].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
        const alternates = kind === "Postcode sector" ? name.replace(" ", "") : "";
        rows.push([null, name, name, alternates, at.lat, at.lon, "Z", `${CODE_PREFIX}${kind}`, "GB", commonest, 0, null]);
      }
    };
    emit(this.districts, "Postcode district");
    emit(this.sectors, "Postcode sector");
    return rows;
  }
}

/**
 * The attribution statement in the download's own `Doc/licence.txt` ("Contains OS data
 * © Crown Copyright and database rights 2026."), or null if it does not have the shape
 * OS gives. The file is in Windows-1252, so the © arrives as one byte.
 */
export function statementFromLicence(text: string): string | null {
  const line = text
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .find((entry) => /^Contains OS data\b/i.test(entry));
  if (!line) return null;
  const tidy = line.replace(/\s+/g, " ").replace(/\.$/, "");
  return /^Contains OS data © Crown copyright and database rights? \d{4}$/i.test(tidy) ? tidy : null;
}

/** The statement OS asks for on its OpenData page, with the year of the edition. */
export function standardStatement(year: number): string {
  return `Contains OS data © Crown copyright and database right ${year}`;
}
