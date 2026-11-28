/** Answers of GET /api/maps/data as the server gives them, for the Map data tests. */
import type { MapDataCountry, MapDataItem, MapDataKind, MapDataResponse } from "@outpost/shared";

export function item(over: Partial<MapDataItem> = {}): MapDataItem {
  return {
    key: "collection:c1",
    kind: "map",
    title: "United Kingdom",
    state: "ready",
    sizeBytes: 3_000_000_000,
    locationId: "loc1",
    locationName: "Internal storage",
    dataDate: "2026-11-17",
    progress: null,
    reason: null,
    ahead: null,
    count: null,
    layers: [],
    regionId: null,
    collectionId: "c1",
    networkId: null,
    packId: null,
    downloadId: null,
    taskId: null,
    ...over,
  };
}

export function country(code: string, name: string, items: Partial<Record<MapDataKind, MapDataItem[]>> = {}): MapDataCountry {
  return {
    country: code,
    name,
    regionId: code === "GB" ? "united-kingdom" : null,
    rows: (["map", "terrain", "names", "roads", "places", "extract", ...(items.streets ? (["streets"] as const) : [])] as const).map(
      (kind) => ({ kind, items: items[kind] ?? [] }),
    ),
    lastRead: null,
  };
}

export function mapData(over: Partial<MapDataResponse> = {}): MapDataResponse {
  return {
    summary: {
      totalBytes: 3_000_000_000,
      locations: [{ locationId: "loc1", name: "Internal storage", bytes: 3_000_000_000, available: true }],
      active: 0,
    },
    countries: [],
    world: [],
    other: [],
    countryFiles: [],
    onThisPhone: null,
    countryFileChoice: { keep: null, locationId: null },
    regionsListed: true,
    ...over,
  };
}
