/** Where the map is looking, as it travels through the address bar and this browser's storage. */
import { isValidLatLon } from "@outpost/shared";

export interface CameraView {
  lat: number;
  lon: number;
  zoom: number;
}

/** Britain and Ireland, where a first-time map opens: wide enough to recognise at a glance. */
export const DEFAULT_VIEW: CameraView = { lat: 54.6, lon: -3.6, zoom: 4.6 };

const MAX_ZOOM = 20;

/** The view named by `?lat=…&lon=…&z=…`, or null when the address does not carry a whole one. */
export function parseView(params: URLSearchParams): CameraView | null {
  const [latText, lonText, zoomText] = [params.get("lat"), params.get("lon"), params.get("z")];
  if (!latText || !lonText) return null;
  const lat = Number(latText);
  const lon = Number(lonText);
  const zoom = zoomText === null || zoomText === "" ? 12 : Number(zoomText);
  if (!isValidLatLon(lat, lon) || !Number.isFinite(zoom) || zoom < 0 || zoom > MAX_ZOOM) return null;
  return { lat, lon, zoom };
}

/** Digits worth keeping at a zoom: about a pixel's worth, so links stay short. */
export function coordinateDigits(zoom: number): number {
  return Math.max(2, Math.min(6, Math.floor(zoom / 3) + 1));
}

/** Writes the view into a copy of the given parameters, leaving any others in place. */
export function withView(params: URLSearchParams, view: CameraView): URLSearchParams {
  const next = new URLSearchParams(params);
  const digits = coordinateDigits(view.zoom);
  next.set("lat", view.lat.toFixed(digits));
  next.set("lon", view.lon.toFixed(digits));
  next.set("z", String(Number(view.zoom.toFixed(2))));
  return next;
}

export function isCameraView(value: unknown): value is CameraView {
  if (!value || typeof value !== "object") return false;
  const view = value as Partial<CameraView>;
  return (
    typeof view.lat === "number" &&
    typeof view.lon === "number" &&
    typeof view.zoom === "number" &&
    isValidLatLon(view.lat, view.lon) &&
    view.zoom >= 0 &&
    view.zoom <= MAX_ZOOM
  );
}

/** Reads a JSON value kept in this browser. Anything missing, malformed or refused gives the fallback. */
export function readStored<T>(key: string, isValid: (value: unknown) => value is T, fallback: T): T {
  try {
    const text = localStorage.getItem(key);
    if (text === null) return fallback;
    const value: unknown = JSON.parse(text);
    return isValid(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

export function writeStored(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private windows may refuse storage; the choice then lasts for this visit only.
  }
}

export const STORAGE_KEYS = {
  view: "outpost.maps.view",
  coordinateFormat: "outpost.maps.coordinates",
  hiddenTracks: "outpost.maps.hiddenTracks",
  hillshade: "outpost.maps.hillshade",
  contours: "outpost.maps.contours",
  panel: "outpost.maps.panel",
  firstUseDismissed: "outpost.maps.firstUseDismissed",
  /** The storage location the last map download went to. */
  downloadLocation: "outpost.maps.downloadLocation",
} as const;

/** Kept for this tab only: a route that was being drawn when the screen was left or reloaded. */
export const ROUTE_DRAFT_KEY = "outpost.maps.routeDraft";
