/**
 * Satellite imagery on the offline map: what is installed, what can be got, and the
 * figures shown before anything is fetched. See docs/maps.md, "Satellite imagery".
 */
import type { Bbox } from "./maps.ts";

export type ImagerySourceId = "blue-marble" | "sentinel-2";

/** A source of imagery as the map credits it. */
export interface ImagerySourceInfo {
  id: ImagerySourceId;
  name: string;
  publisher: string;
  /** Metres on the ground of one pixel of the source. */
  resolutionMeters: number;
  licence: string;
  licenceUrl: string;
  /** The credit the publisher asks for, word for word. */
  credit: string;
  /** What it costs and whom: always free here, said in a sentence. */
  cost: string;
}

/** One installed set of imagery: the world, or an area someone chose. */
export interface ImagerySet {
  /** Collection id. Remove or move it through the collections API, as a map region. */
  id: string;
  name: string;
  source: ImagerySourceId;
  bounds: Bbox;
  minZoom: number;
  maxZoom: number;
  /** When the picture was taken: "2004-07" for Blue Marble's July, "2026-07-12" for a scene. */
  imageDate: string;
  /** The day or month in words, for the map: "12 July 2026", "July 2004". */
  imageDateText: string;
  /** The publisher's cloud figure for each scene used, in percent of the whole scene. */
  sceneCloudPercent: number | null;
  /** Cloud and cloud shadow over the chosen area, from the scene's own classification, in percent. */
  areaCloudPercent: number | null;
  scenes: string[];
  resolutionMeters: number;
  sizeBytes: number;
  /** Bytes fetched from the publisher to make it. */
  transferredBytes: number | null;
  installedAt: number;
  locationId: string;
  locationName: string;
  available: boolean;
  status: "installed" | "missing" | "moving" | "damaged";
  /** HTML for the attribution control: the credit and the date of the picture. */
  attribution: string;
}

/** A ready-made world entry that can be downloaded. */
export interface ImageryWorldOption {
  id: string;
  name: string;
  description: string;
  resolutionMeters: number;
  maxZoom: number;
  /** Bytes fetched from NASA, exactly, from the sizes NASA's server gave on the day the list was made. */
  transferBytes: number;
  /** Bytes it will take on disk once built, estimated from a measured build. */
  estimatedSizeBytes: number;
  /** Room needed while it is made: the source files are kept beside it until it is installed. */
  workingBytes: number;
  installed: boolean;
  downloadId: string | null;
}

export interface ImageryOverview {
  sets: ImagerySet[];
  world: ImageryWorldOption[];
  sources: ImagerySourceInfo[];
  /** Area warnings, in square kilometres, and the hard ceiling (see docs/maps.md). */
  limits: { noticeKm2: number; warnKm2: number; maxKm2: number };
}

/** A pass of the satellite over the area: the scenes taken that day by one satellite. */
export interface SceneOption {
  /** Stable key for choosing it: the scene ids joined. */
  key: string;
  date: string;
  dateText: string;
  platform: string;
  sceneIds: string[];
  /** The publisher's whole-scene cloud figure, the highest of the scenes used. */
  sceneCloudPercent: number;
  /** How much of the area the scenes of this pass cover, in percent. */
  coveragePercent: number;
}

export interface SceneSearchResponse {
  bbox: Bbox;
  areaKm2: number;
  options: SceneOption[];
  /** How far back was searched. */
  from: string;
  to: string;
  searchedAt: number;
}

export type AreaWarningLevel = "none" | "notice" | "warn" | "refuse";

export interface ImageryEstimate {
  bbox: Bbox;
  areaKm2: number;
  source: ImagerySourceInfo;
  scene: SceneOption;
  minZoom: number;
  maxZoom: number;
  /** Bytes to fetch, exactly: the parts of the publisher's files the area needs, and their headers. */
  transferBytes: number;
  requests: number;
  /** Bytes on disk once built, estimated from the number of tiles and a measured size per tile. */
  estimatedSizeBytes: number;
  tileCount: number;
  /** Seconds, as a range: at 10 and at 50 megabits a second, plus the time to build measured on a small computer. */
  estimatedSeconds: { low: number; high: number };
  /** Cloud and cloud shadow over the area, from the scene classification, in percent; null if it could not be read. */
  areaCloudPercent: number | null;
  warning: { level: AreaWarningLevel; message: string | null };
  /** Free bytes on the storage location the set would go to. */
  freeBytes: number | null;
  locationId: string;
  locationName: string;
}
