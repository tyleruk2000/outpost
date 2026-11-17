/**
 * Where a tool is asked about, from the words a model gives: "Northampton", "home",
 * "52.24,-0.90", "SP 75 60", a postcode, or the name of a saved place or a record on the
 * map. Read in the order a person would expect, and the answer says which it was:
 *
 *  1. a latitude and longitude written as two numbers;
 *  2. the household's saved places (and "home", the one with the home icon);
 *  3. the map's own place search (`ctx.services.maps.places.search`): grid references,
 *     locators and postcodes, then the place names installed (GeoNames, and Ordnance
 *     Survey's OS Open Names for Great Britain);
 *  4. a record of that name in any reference layer held.
 *
 * Nothing is asked of anyone: every step reads what is on this computer.
 */
import { bearingDegrees, compassPoint, countryAt, haversineMeters, homePlaceOf, isValidLatLon, placeName } from "@outpost/shared";
import type { AppContext } from "../../core/context.ts";
import { COUNTRIES } from "../layers/countries.ts";
import { foldName, sameName } from "../layers/store.ts";

export interface Where {
  lat: number;
  lon: number;
  /** As the answer names it: "Northampton", "Home (saved place)". */
  name: string;
  /** How the words were read, for the model to pass on: "a saved place", "the map's place names (OS Open Names)". */
  how: string;
  /** ISO country code where the source says, or the smallest Natural Earth box round the point. */
  country: string | null;
  /** A saved place's id, for a link to it on the map. */
  markerId?: string;
}

const LAT_LON = /^\s*(-?\d{1,2}(?:\.\d+)?)\s*[, ]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/;

/** A position to four decimal places (about 11 m), as every answer gives it. */
export const at4 = (lat: number, lon: number) => `${lat.toFixed(4)}, ${lon.toFixed(4)}`;

/** "1.2 km NE", from one place to another. */
export function distanceFrom(from: { lat: number; lon: number }, to: { lat: number; lon: number }): { meters: number; words: string } {
  const meters = haversineMeters(from.lat, from.lon, to.lat, to.lon);
  const km = meters / 1000;
  const distance = km < 1 ? `${Math.round(meters / 10) * 10} m` : `${km < 10 ? km.toFixed(1) : Math.round(km)} km`;
  return { meters, words: `${distance} ${compassPoint(bearingDegrees(from.lat, from.lon, to.lat, to.lon))}` };
}

const countryOfPoint = (lat: number, lon: number) => countryAt({ lat, lon }, COUNTRIES);

/** The saved place with the home icon, as every screen takes it (`homePlaceOf`). */
export function homePlace(ctx: AppContext): Where | null {
  const home = homePlaceOf(ctx.services.maps.annotations.listMarkers());
  if (!home) return null;
  return {
    lat: home.lat,
    lon: home.lon,
    name: home.name || "Home",
    how: "the saved place with the home icon",
    country: countryOfPoint(home.lat, home.lon),
    markerId: home.id,
  };
}

/** Where the words point, or null when nothing on this computer knows them. */
export function resolveNear(ctx: AppContext, text: string): Where | null {
  const words = text.trim().slice(0, 200);
  if (!words) return null;

  const numbers = LAT_LON.exec(words);
  if (numbers) {
    const lat = Number(numbers[1]);
    const lon = Number(numbers[2]);
    if (isValidLatLon(lat, lon))
      return { lat, lon, name: at4(lat, lon), how: "the latitude and longitude given", country: countryOfPoint(lat, lon) };
  }

  const folded = foldName(words);
  if (folded === "home" || folded === "my home" || folded === "my house" || folded === "here") {
    const home = homePlace(ctx);
    if (home) return home;
  }
  const markers = ctx.services.maps.annotations.listMarkers();
  const marker = markers.find((entry) => foldName(entry.name) === folded) ?? markers.find((entry) => sameName(entry.name, words));
  if (marker) {
    return {
      lat: marker.lat,
      lon: marker.lon,
      name: marker.name,
      how: "a saved place",
      country: countryOfPoint(marker.lat, marker.lon),
      markerId: marker.id,
    };
  }

  const found = ctx.services.maps.places.search(words, { limit: 1 });
  if (found.coordinate) {
    const { lat, lon, format } = found.coordinate;
    const as = format === "osgb" ? "an Ordnance Survey grid reference" : format === "maidenhead" ? "a Maidenhead locator" : "a position";
    return { lat, lon, name: at4(lat, lon), how: `read as ${as}`, country: countryOfPoint(lat, lon) };
  }
  const place = found.places[0];
  if (place) {
    const area = place.source === "os" ? place.admin1 : place.country ? placeName(place.country) : null;
    return {
      lat: place.lat,
      lon: place.lon,
      name: [place.name, area].filter(Boolean).join(", "),
      how: `the map's place names (${place.source === "os" ? "OS Open Names" : "GeoNames"}), a ${place.kindLabel.toLowerCase()}`,
      country: place.source === "os" ? "GB" : (place.country ?? countryOfPoint(place.lat, place.lon)),
    };
  }

  const record = ctx.services.layers.store.search(words, {}, 5).find((hit) => hit.lat !== null && hit.lon !== null);
  if (record) {
    return {
      lat: record.lat as number,
      lon: record.lon as number,
      name: record.name,
      how: `a record in the reference layers (${record.kindLabel})`,
      country: record.country ?? countryOfPoint(record.lat as number, record.lon as number),
    };
  }
  return null;
}

/** What to say when the words name nowhere Outpost knows. */
export const unknownPlace = (text: string) =>
  `"${text.slice(0, 80)}" is not a place Outpost knows: it is not a saved place, not in the map's place names, and not a record in any layer held. Ask for it as latitude,longitude, or add place names on the Maps screen.`;
