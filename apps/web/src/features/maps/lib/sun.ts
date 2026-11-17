/**
 * Sunrise, sunset and twilight for a place and a date, and where the sun is at an
 * instant. The arithmetic lives in `@outpost/shared` (sun.ts), so that the server's
 * tools answer from the same functions as the map; the tests beside this file hold it to
 * the US Naval Observatory's published times. Re-exported here so that the screens'
 * imports stay as they were.
 */

export type { Band, IsoDate, SolarPosition, SunAt, SunDay } from "@outpost/shared";
export {
  addDays,
  altitudeCrossing,
  apparentSolarHours,
  CIVIL_ALTITUDE,
  dateToUtc,
  dayLengthChange,
  geometricFromApparent,
  isIsoDate,
  julianCenturies,
  NAUTICAL_ALTITUDE,
  refraction,
  SUNRISE_ALTITUDE,
  solarPosition,
  sunAt,
  sunDay,
  utcToDate,
} from "@outpost/shared";
