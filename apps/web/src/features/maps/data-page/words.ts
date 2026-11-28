/**
 * The words of the Map data screen, in one place: what each kind of map data is called and
 * is for, how a row says where it stands, and the choice about a country file. Kept apart
 * from the components so that the tests can read them and the screen says one thing one way.
 */
import {
  type CountryFileRead,
  formatBytes,
  type MapDataBundle,
  type MapDataBundleKind,
  type MapDataItem,
  type MapDataKind,
  type MapDataPlace,
  type MapDataResponse,
  mapPlacesOf,
  REFERENCE_LAYER_INFO,
} from "@outpost/shared";
import { formatDate, plural } from "@/lib/utils";

/** What each kind is called, as a person would. */
export const KIND_NAMES: Record<MapDataKind, string> = {
  map: "Map",
  terrain: "Hills and heights",
  names: "Place names",
  roads: "Routes",
  places: "Nearby places",
  extract: "Source file",
  imagery: "Satellite pictures",
  streets: "Walking and cycling",
};

/** What a row says when there is nothing of its kind yet: that, and what it is needed for. */
export const NOT_ADDED: Record<Exclude<MapDataKind, "extract" | "imagery">, string> = {
  map: "Not added. Needed to see streets, paths and buildings.",
  terrain: "Not added. Needed for hill shading, contour lines and heights.",
  names: "Not added. Needed to find towns and hills by name.",
  roads: "Not added. Needed to plan a drive.",
  places: "Not added. Needed to find hospitals, shelters and food nearby.",
  streets: "Not added. Needed for door-to-door, walking and cycling routes, and reachable areas.",
};

/** What still works while the storage location holding something is not connected. */
export const WHILE_AWAY: Record<MapDataKind, string> = {
  map: "Outlines are drawn here until it is back.",
  terrain: "Hill shading and heights wait until it is back.",
  names: "Search still finds coordinates and your own places.",
  roads: "Routes wait until it is back.",
  places: "Its places are not shown until it is back.",
  extract: "Routes and nearby places made from it keep working; rebuilding waits.",
  imagery: "The map is drawn without the pictures until it is back.",
  streets: "Drives still plan on the main roads; door to door, walking and cycling wait until it is back.",
};

/** "17 Nov 2026" from "2026-11-17". */
export function dayText(date: string | null | undefined): string | null {
  if (!date) return null;
  const time = Date.parse(`${date.slice(0, 10)}T12:00:00Z`);
  return Number.isFinite(time) ? formatDate(time) : null;
}

const YEAR_MS = 365.25 * 24 * 3600 * 1000;

/** Over twelve months old, by the day its data is from. */
export function overAYearOld(date: string | null | undefined, now = Date.now()): boolean {
  if (!date) return false;
  const time = Date.parse(`${date.slice(0, 10)}T12:00:00Z`);
  return Number.isFinite(time) && now - time > YEAR_MS;
}

/** "Hospitals, shelters, food and 3 more", from a pack's layers. */
export function layersText(layers: string[], shown = 3): string {
  const names = layers.map((layer) => {
    const label = (REFERENCE_LAYER_INFO as Record<string, { label: string } | undefined>)[layer]?.label ?? layer;
    return label.toLowerCase();
  });
  if (names.length === 0) return "";
  const first = names.slice(0, shown);
  const rest = names.length - first.length;
  const text =
    rest > 0
      ? `${first.join(", ")} and ${rest} more`
      : first.length === 1
        ? first[0]!
        : `${first.slice(0, -1).join(", ")} and ${first.at(-1)}`;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** The facts of something that is here: what it holds, how big, where, and the day its data is from. */
export function readyFacts(item: MapDataItem, detail?: string | null): string[] {
  const facts: string[] = [];
  if (detail) facts.push(detail);
  if (item.kind === "places" && item.layers.length > 0) facts.push(layersText(item.layers));
  if (item.count !== null && item.count > 0) {
    if (item.kind === "names") facts.push(plural(item.count, "name"));
    else if (item.kind === "places") facts.push(plural(item.count, "place"));
  }
  if (item.sizeBytes !== null) facts.push(formatBytes(item.sizeBytes));
  if (item.locationName) facts.push(item.locationName);
  const day = dayText(item.dataDate);
  if (day) facts.push(item.kind === "roads" ? `roads from ${day}` : `from ${day}`);
  else if (item.undated) facts.push(item.undated);
  return facts;
}

/** One line for something under way, or stopped, in the person's words. */
export function stateLine(item: MapDataItem): string | null {
  switch (item.state) {
    case "waiting":
      if (item.ahead) return `Waiting behind ${plural(item.ahead, "download")}`;
      // What it waits for, where the server says (walking and cycling waiting for the build under way).
      return item.progress?.message ?? "Waiting to start";
    case "processing": {
      const what = item.progress?.message ?? (item.kind === "roads" ? "Reading the main roads" : "Reading the file");
      const step = item.progress?.step && item.progress.step.of > 1 ? ` (step ${item.progress.step.at} of ${item.progress.step.of})` : "";
      return `${what}${step}. You can leave this screen.`;
    }
    case "failed":
      return item.reason ?? "The download stopped.";
    case "missing":
    case "damaged":
      return item.reason ?? "Its file is missing. Download it again.";
    case "moving": {
      const total = item.progress?.total;
      const percent = total ? ` ${Math.round((item.progress!.current / total) * 100)}%` : "";
      return `Being moved${percent ? `,${percent}` : ""}`;
    }
    default:
      return null;
  }
}

/** The country file row when none is kept. */
export function notKeptLine(lastRead: CountryFileRead | null): string {
  if (lastRead && !lastRead.kept) return `Not kept: read and deleted ${formatDate(lastRead.readAt)} (${formatBytes(lastRead.bytes)})`;
  return "Not kept. Routes and nearby places are read from it.";
}

/** The status sentence at the top of the screen. */
export function statusSentence(summary: {
  totalBytes: number;
  locations: Array<{ name: string; bytes: number; available: boolean }>;
}): string {
  if (summary.totalBytes === 0) return "No map data yet.";
  const places = summary.locations.filter((location) => location.bytes > 0);
  const where =
    places.length === 1
      ? `all on ${places[0]!.name}`
      : `on ${places.map((location) => `${location.name} (${formatBytes(location.bytes)})`).join(places.length === 2 ? " and " : ", ")}`;
  return `${formatBytes(summary.totalBytes)} of map data, ${where}.`;
}

export function activeLine(active: number): string {
  return active === 0 ? "Nothing is downloading." : `${plural(active, "download")} running`;
}

// ── The country file choice ──

export const FILE_EXPLAINER = (size: string | null) =>
  `The map you look at is a drawing: Outpost can show it but cannot ask it which road joins which. Routes and lists of places are read from the country's full record, a separate file${size ? ` of ${size}` : ""}.`;

export const DELETE_TITLE = "Read it, then delete it.";
export const KEEP_TITLE = "Keep it.";

export function deleteDetail(size: string | null): string {
  const of = size ?? "its size";
  return `Needs ${of} free only while it is read. Every update, and anything else made from it, downloads ${of} again and needs a connection.`;
}

export const KEEP_DETAIL =
  "Rebuild roads and refresh hospitals and shops with no download. Outpost may use it for more later (walking routes, stops along a route, trails); today it serves these two. It ages like the rest.";

export const AWAY_LINE = "Roads keep working when this is off; rebuilding waits.";

export function keptFileLine(dataDate: string | null): string {
  const day = dayText(dataDate);
  return `Read from the kept file${day ? ` (${day})` : ""}. No download.`;
}

/** Who "Check sizes" asks, said before it is pressed: "The map source and Geofabrik are asked how large each is." */
export function askedLine(hosts: Array<string | null>): string {
  const named = hosts.filter((host): host is string => Boolean(host));
  if (named.length === 0) return "Nothing is downloaded until you press Download.";
  const list = named.length === 1 ? named[0]! : `${named.slice(0, -1).join(", ")} and ${named.at(-1)}`;
  const verb = named.length === 1 ? "is asked how large it is" : "are asked how large each is";
  return `${list.charAt(0).toUpperCase()}${list.slice(1)} ${verb}. Nothing is downloaded until you press Download.`;
}

// ── Age, updates and the older of two country files ──

/** Every piece of map data in the answer, once (a kept country file is listed under its country and among the country files). */
export function allItems(data: MapDataResponse): MapDataItem[] {
  const seen = new Map<string, MapDataItem>();
  const every = [
    ...data.countries.flatMap((country) => country.rows.flatMap((row) => row.items)),
    ...data.world,
    ...data.other,
    ...data.countryFiles,
  ];
  for (const item of every) if (!seen.has(item.key)) seen.set(item.key, item);
  return [...seen.values()];
}

const UNDER_WAY: MapDataItem["state"][] = ["waiting", "downloading", "paused", "processing", "moving"];

/** Here, not on its way: something on a storage location or in Outpost's own data. */
export function isHere(item: MapDataItem): boolean {
  if (item.downloadId || UNDER_WAY.includes(item.state) || item.state === "failed") return false;
  return item.collectionId !== null || item.networkId !== null || item.packId !== null;
}

/** What is over a year old, oldest first. */
export function staleItems(data: MapDataResponse, now = Date.now()): MapDataItem[] {
  return allItems(data)
    .filter((item) => isHere(item) && !item.ageless && overAYearOld(item.dataDate, now))
    .sort((a, b) => (a.dataDate ?? "").localeCompare(b.dataDate ?? ""));
}

export function staleLine(count: number): string {
  return count === 1 ? "1 thing is over a year old." : `${count} things are over a year old.`;
}

/** The kept country file for a region, the newest if there are two: what roads and places are read from with no download. */
export function keptFileFor(data: MapDataResponse | undefined, regionId: string | null): MapDataItem | null {
  if (!data || !regionId) return null;
  return (
    data.countryFiles
      .filter((file) => file.regionId === regionId && file.state === "ready")
      .sort((a, b) => (b.dataDate ?? "").localeCompare(a.dataDate ?? ""))[0] ?? null
  );
}

/** Each kept country file that has a newer one for the same region, with that newer one. */
export function olderFiles(files: MapDataItem[]): Map<string, MapDataItem> {
  const older = new Map<string, MapDataItem>();
  const byRegion = new Map<string, MapDataItem[]>();
  for (const file of files) {
    if (!file.regionId || !file.collectionId) continue;
    byRegion.set(file.regionId, [...(byRegion.get(file.regionId) ?? []), file]);
  }
  for (const group of byRegion.values()) {
    const sorted = [...group].sort((a, b) => (b.dataDate ?? "").localeCompare(a.dataDate ?? ""));
    const newest = sorted[0]!;
    for (const file of sorted.slice(1)) if ((file.dataDate ?? "") < (newest.dataDate ?? "")) older.set(file.key, newest);
  }
  return older;
}

/** "build.protomaps.com", "a and b": who is asked or downloaded from. */
export function hostsText(hosts: string[]): string {
  if (hosts.length === 0) return "its source";
  return hosts.length === 1 ? hosts[0]! : `${hosts.slice(0, -1).join(", ")} and ${hosts.at(-1)}`;
}

// ── By place: the one pattern every kind of map data follows ──

/** What a place's bundles are called: on a phone's line, in the details, in a dialog. */
export const BUNDLE_NAMES: Record<MapDataBundleKind, string> = {
  map: "Map",
  routes: "Routes",
  nearby: "Nearby places",
  walk: "Walking and cycling",
  imagery: "Satellite pictures",
};

/** The columns of the wide table: short. */
export const BUNDLE_COLUMNS: Record<MapDataBundleKind, string> = {
  map: "Map",
  routes: "Routes",
  nearby: "Nearby",
  walk: "Walk/cycle",
  imagery: "Satellite",
};

/** What each bundle is for, said wherever it is chosen. */
export const BUNDLE_DETAILS: Record<MapDataBundleKind, string> = {
  map: "Roads, paths, hills, and towns by name",
  routes: "Plan a drive",
  nearby: "Hospitals, shelters, food",
  walk: "Walking, cycling and door-to-door routes",
  imagery: "Pictures from above, under the map",
};

/** What stops working when a bundle is removed. */
export const BUNDLE_STOPS: Record<MapDataBundleKind, string> = {
  map: "The map shows only outlines there, and search no longer finds its towns by name.",
  routes: "Drives can no longer be planned there. Saved routes keep their directions.",
  nearby: "Its hospitals, shelters and food leave the map and the lists of what is nearest.",
  walk: "Walking, cycling and door-to-door routes stop. Drives still plan on the main roads.",
  imagery: "The satellite pictures are no longer drawn under the map there.",
};

/** "19 min", "1 h 5 min", "under a minute". */
export function timeLeftText(seconds: number | null | undefined): string | null {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return null;
  if (seconds < 60) return "under a minute";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

/** "1.0 of 2.3 GB": both in the larger's unit, so they read as one figure. */
export function ofText(current: number, total: number): string {
  const units = ["bytes", "kB", "MB", "GB", "TB"];
  let unit = 0;
  for (let size = total; size >= 1000 && unit < units.length - 1; size /= 1000) unit += 1;
  const scale = 1000 ** unit;
  const digits = unit === 0 ? 0 : 1;
  return `${(current / scale).toFixed(digits)} of ${(total / scale).toFixed(digits)} ${units[unit]}`;
}

/** The figures of a download that a bundle's words need. */
export interface DownloadFigures {
  receivedBytes: number;
  totalBytes: number | null;
  etaSeconds: number | null;
}

/**
 * Where a bundle stands, in the words every kind uses: Not added · Waiting · Downloading 1.0 of
 * 2.3 GB, 19 min left · Building · Ready, from 17 Nov 2026 · Over a year old · Failed: what to do ·
 * Storage not connected · Moving.
 */
export function bundleStateText(bundle: MapDataBundle, download?: DownloadFigures | null, now = Date.now()): string {
  const percent = bundle.fraction !== null ? ` ${Math.round(bundle.fraction * 100)}%` : "";
  switch (bundle.state) {
    case "none":
      return "Not added";
    case "waiting":
      return "Waiting";
    case "downloading": {
      if (download?.totalBytes) {
        const left = timeLeftText(download.etaSeconds);
        return `Downloading ${ofText(download.receivedBytes, download.totalBytes)}${left ? `, ${left} left` : ""}`;
      }
      return `Downloading${percent}`;
    }
    case "paused":
      return `Paused${percent}`;
    case "building":
      return `Building${percent}`;
    case "moving":
      return `Moving${percent}`;
    case "failed":
      return `Failed: ${bundle.reason ?? "try again"}`;
    case "location-offline":
      return "Storage not connected";
    case "ready": {
      const day = dayText(bundle.dataDate);
      if (bundle.dataDate && overAYearOld(bundle.dataDate, now)) return `Over a year old, from ${day}`;
      return day ? `Ready, from ${day}` : "Ready";
    }
  }
}

/** The short mark of a bundle in a row: "Ready", "43%", "Add". */
export function bundleMark(bundle: MapDataBundle, now = Date.now()): string {
  const percent = bundle.fraction !== null ? `${Math.round(bundle.fraction * 100)}%` : "";
  switch (bundle.state) {
    case "none":
      return "Add";
    case "ready":
      return bundle.dataDate && overAYearOld(bundle.dataDate, now) ? "Over a year old" : "Ready";
    case "downloading":
      return percent || "Downloading";
    case "waiting":
      return "Waiting";
    case "paused":
      return `Paused${percent ? ` ${percent}` : ""}`;
    case "building":
      return `Building${percent ? ` ${percent}` : ""}`;
    case "moving":
      return "Moving";
    case "failed":
      return "Failed";
    case "location-offline":
      return "Storage not connected";
  }
}

/** "2 places are over a year old." */
export function stalePlacesLine(count: number): string {
  return count === 1 ? "1 place is over a year old." : `${count} places are over a year old.`;
}

/** The places of an answer: the server's, or made here from the rows (an older server). */
export function placesIn(data: MapDataResponse): MapDataPlace[] {
  return data.places ?? mapPlacesOf(data, { streets: data.streetsInstalled ?? false });
}

/** "7.9 GB on Internal storage", "7.9 GB on Internal storage and NAS". */
export function offlineSummary(summary: MapDataResponse["summary"]): string {
  if (summary.totalBytes === 0) return "Maps, routes and nearby places added here work with no connection.";
  const where = summary.locations.filter((location) => location.bytes > 0).map((location) => location.name);
  const list = where.length <= 1 ? (where[0] ?? "") : `${where.slice(0, -1).join(", ")} and ${where.at(-1)}`;
  return `${formatBytes(summary.totalBytes)} on ${list}`;
}

/** "France", "France and Switzerland", "France, Italy and Switzerland". */
export function namesText(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}
