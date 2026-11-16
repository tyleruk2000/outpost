/**
 * Where satellite imagery comes from, on what terms, and how it must be credited.
 *
 * Every fact here was read from the publisher's own pages on 16 November 2026 and is
 * quoted in docs/sources.md. Nothing is bundled with Outpost: each picture is fetched
 * from its publisher when a person asks for it, and made into map tiles on their
 * computer.
 */
import type { ImagerySourceInfo } from "@outpost/shared";

// ── NASA Blue Marble: Next Generation ────────────────────────────────────────

export const NASA_HOST = "assets.science.nasa.gov";
const BMNG_BASE = `https://${NASA_HOST}/content/dam/science/esd/eo/images/bmng/bmng-topography-bathymetry/july/world.topo.bathy.200407`;

export interface WorldFile {
  url: string;
  /** Bytes, as NASA's server reported them (Content-Length) on 16 November 2026. */
  bytes: number;
  /** Degrees covered: west, south, east, north. */
  bounds: [number, number, number, number];
}

export interface WorldEntry {
  id: string;
  name: string;
  description: string;
  resolutionMeters: number;
  maxZoom: number;
  files: WorldFile[];
  /** Bytes per tile, for the size shown before downloading (docs/maps.md, "The world"). */
  bytesPerTile: number;
}

/** The eight 90° squares of the 500 m picture, as NASA names them. */
const SQUARES: Array<[string, [number, number, number, number], number]> = [
  ["A1", [-180, 0, -90, 90], 408_317_067],
  ["B1", [-90, 0, 0, 90], 430_146_456],
  ["C1", [0, 0, 90, 90], 725_455_444],
  ["D1", [90, 0, 180, 90], 517_464_535],
  ["A2", [-180, -90, -90, 0], 147_796_545],
  ["B2", [-90, -90, 0, 0], 348_534_612],
  ["C2", [0, -90, 90, 0], 327_243_167],
  ["D2", [90, -90, 180, 0], 354_933_173],
];

export const WORLD_ENTRIES: WorldEntry[] = [
  {
    id: "blue-marble-2km",
    name: "The world, 2 km a pixel",
    description:
      "NASA's Blue Marble: Next Generation for July 2004, land and sea floor, cloud-free. Enough to see coasts, mountains, deserts and forests; zoom 0 to 6.",
    resolutionMeters: 2000,
    maxZoom: 6,
    files: [{ url: `${BMNG_BASE}.3x21600x10800_geo.tif`, bytes: 255_799_706, bounds: [-180, -90, 180, 90] }],
    bytesPerTile: 2_900,
  },
  {
    id: "blue-marble-500m",
    name: "The world, 500 m a pixel",
    description: "The same picture at NASA's full resolution, in eight files. Large towns, lakes and valleys can be made out; zoom 0 to 8.",
    resolutionMeters: 500,
    maxZoom: 8,
    files: SQUARES.map(([name, bounds, bytes]) => ({ url: `${BMNG_BASE}.3x21600x21600.${name}_geo.tif`, bytes, bounds })),
    // Not measured: the 500 m build was not run (docs/maps.md); taken as a little over the 2 km one's.
    bytesPerTile: 4_000,
  },
];

export const BLUE_MARBLE: ImagerySourceInfo = {
  id: "blue-marble",
  name: "Blue Marble: Next Generation",
  publisher: "NASA Earth Observatory",
  resolutionMeters: 500,
  licence: "NASA media, generally not subject to copyright in the United States; NASA asks to be credited",
  licenceUrl: "https://www.nasa.gov/nasa-brand-center/images-and-media/",
  credit: "NASA Earth Observatory",
  cost: "Free. NASA charges nothing, and no account is needed.",
};

export const BLUE_MARBLE_ATTRIBUTION =
  'Imagery July 2004: <a href="https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/">NASA Earth Observatory</a> (Blue Marble: Next Generation)';

// ── Copernicus Sentinel-2, Level-2A, as Cloud-Optimised GeoTIFFs on AWS ──────

/** The STAC search service that lists the scenes: Element 84's Earth Search. */
export const STAC_HOST = "earth-search.aws.element84.com";
export const STAC_SEARCH_URL = `https://${STAC_HOST}/v1/search`;
/**
 * Collection 1, the reprocessed archive. Not "sentinel-2-l2a": in that collection the
 * scale and offset the metadata gives do not match the values in many files (Earth
 * Search issue 71, open on 16 November 2026), and a picture made by the metadata comes
 * out black. Collection 1's values were checked against its metadata on a real scene.
 */
export const STAC_COLLECTION = "sentinel-2-c1-l2a";
/** The public bucket Collection 1's files are in: "No AWS account required", not requester-pays. */
export const SENTINEL_HOST = "e84-earth-search-sentinel-data.s3.us-west-2.amazonaws.com";

export const SENTINEL_2: ImagerySourceInfo = {
  id: "sentinel-2",
  name: "Sentinel-2, Level-2A, one scene",
  publisher: "European Union Copernicus programme (ESA), files on AWS Open Data, listed by Element 84 Earth Search",
  resolutionMeters: 10,
  licence: "Copernicus Sentinel data: free, full and open access",
  licenceUrl: "https://sentinels.copernicus.eu/documents/247904/690755/Sentinel_Data_Legal_Notice",
  credit: "Contains modified Copernicus Sentinel data [Year]",
  cost: "Free. The files are in a public AWS bucket that needs no account and is not requester-pays: nobody is billed.",
};

/** The credit the Copernicus legal notice asks for when its data has been modified, for the year of the picture. */
export function sentinelCredit(year: string): string {
  return `Contains modified Copernicus Sentinel data ${year}`;
}

export function sentinelAttribution(dateText: string, year: string): string {
  return `Imagery ${dateText}: <a href="${SENTINEL_2.licenceUrl}">${sentinelCredit(year)}</a>`;
}

export const SOURCES: ImagerySourceInfo[] = [BLUE_MARBLE, SENTINEL_2];

/**
 * Area thresholds for a Sentinel-2 build, in km². Chosen from the measured cost of a
 * real build (docs/maps.md, "How big an area"): below `notice` nothing is said; above
 * it the figures are spelled out; above `warn` the better way is named; above `max` it
 * is refused, because the job would be too long and too heavy on a free public service.
 */
export const AREA_LIMITS = { noticeKm2: 400, warnKm2: 2_500, maxKm2: 10_000 };

/**
 * Warnings for an aerial photograph, by bytes and tiles rather than area: a 10 cm
 * photograph of one square kilometre is more data than 10 m of a hundred. Above
 * `noticeBytes` the figures are spelled out; above `warnBytes` or `warnTiles` the person
 * must tick that they have read it; above `maxBytes` or `maxTiles` it is refused (a town
 * centre, not a county). Measured: a square kilometre of Christchurch at 7.5 cm is 512
 * tiles, 11.8 MB to fetch and 4.6 MB kept; 0.3 km² of NAIP at 30 cm, 19.8 MB to fetch.
 * So 10,000 tiles is about 20 km², and 40,000 about 80 km². See docs/maps.md,
 * "Aerial photographs".
 */
export const AERIAL_LIMITS = {
  noticeBytes: 50_000_000,
  warnBytes: 300_000_000,
  maxBytes: 1_500_000_000,
  warnTiles: 10_000,
  maxTiles: 40_000,
};
