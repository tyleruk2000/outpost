/**
 * Sunrise, sunset and twilight for a place and a date, worked out on the device.
 *
 * The method is the one behind NOAA's solar calculator: the low-accuracy solar position
 * from Jean Meeus, "Astronomical Algorithms" (chapter 25) and his equation of time
 * (chapter 28), with the sun taken to rise and set when its centre is 0.833° below a
 * flat horizon at sea level (0.567° of standard refraction and 0.267° for its radius).
 * NOAA gives the method as good to about a minute between 72° north and south and to
 * about ten minutes beyond; the tests beside this file hold it to the US Naval
 * Observatory's published times.
 *
 * A date here is the date at the place: the day whose midday falls nearest to when the
 * sun crosses the place's own meridian. No time zone comes into it, so the answers are
 * instants (milliseconds since 1970, as `Date` counts them) and the caller decides what
 * clock to show them on.
 *
 * Pure, so it can be tested without a map.
 */

const DEG = Math.PI / 180;
const MINUTE = 60_000;
const DAY = 86_400_000;

/** The sun's centre at sunrise and sunset, in degrees above the horizon. */
export const SUNRISE_ALTITUDE = -0.833;
export const CIVIL_ALTITUDE = -6;
export const NAUTICAL_ALTITUDE = -12;

const sin = (degrees: number) => Math.sin(degrees * DEG);
const cos = (degrees: number) => Math.cos(degrees * DEG);
const asin = (value: number) => Math.asin(Math.max(-1, Math.min(1, value))) / DEG;
const acos = (value: number) => Math.acos(Math.max(-1, Math.min(1, value))) / DEG;

/** Julian centuries from noon on 1 January 2000, the unit Meeus's series are written in. */
export function julianCenturies(ms: number): number {
  return (ms / DAY + 2_440_587.5 - 2_451_545) / 36_525;
}

export interface SolarPosition {
  /** Degrees north of the celestial equator. */
  declination: number;
  /** Minutes by which a sundial runs ahead of a clock keeping mean time. */
  equationOfTime: number;
}

export function solarPosition(ms: number): SolarPosition {
  const t = julianCenturies(ms);
  const meanLongitude = (((280.46646 + t * (36_000.76983 + t * 0.0003032)) % 360) + 360) % 360;
  const meanAnomaly = 357.52911 + t * (35_999.05029 - 0.0001537 * t);
  const eccentricity = 0.016708634 - t * (0.000042037 + 0.0000001267 * t);
  const centre =
    sin(meanAnomaly) * (1.914602 - t * (0.004817 + 0.000014 * t)) +
    sin(2 * meanAnomaly) * (0.019993 - 0.000101 * t) +
    sin(3 * meanAnomaly) * 0.000289;
  const node = 125.04 - 1934.136 * t;
  const apparentLongitude = meanLongitude + centre - 0.00569 - 0.00478 * sin(node);
  const meanObliquity = 23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60;
  const obliquity = meanObliquity + 0.00256 * cos(node);
  const y = Math.tan((obliquity / 2) * DEG) ** 2;
  const equation =
    y * sin(2 * meanLongitude) -
    2 * eccentricity * sin(meanAnomaly) +
    4 * eccentricity * y * sin(meanAnomaly) * cos(2 * meanLongitude) -
    0.5 * y * y * sin(4 * meanLongitude) -
    1.25 * eccentricity * eccentricity * sin(2 * meanAnomaly);
  return { declination: asin(sin(obliquity) * sin(apparentLongitude)), equationOfTime: (4 * equation) / DEG };
}

/** A calendar date, as `<input type="date">` writes it: "2026-11-16". */
export type IsoDate = string;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Midnight UTC at the start of the date, or NaN for text that is not a real date. */
export function dateToUtc(date: IsoDate): number {
  const match = ISO_DATE.exec(date);
  if (!match) return Number.NaN;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const ms = Date.UTC(year, month - 1, day);
  // Date.UTC rolls 31 February over into March; a date that does not read back as itself is not one.
  return new Date(ms).getUTCDate() === day && new Date(ms).getUTCMonth() === month - 1 ? ms : Number.NaN;
}

export const isIsoDate = (date: string): boolean => Number.isFinite(dateToUtc(date));

export function utcToDate(ms: number): IsoDate {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(date: IsoDate, days: number): IsoDate {
  return utcToDate(dateToUtc(date) + days * DAY);
}

/**
 * When the sun is above an altitude on one day.
 *
 * - `below`: it never climbs that high, even at midday.
 * - `above`: it never drops that low, even at midnight.
 * - `crosses`: it climbs past the altitude at `begin` and drops past it at `end`. A null
 *   `begin` means it was already above when the day began (it did not drop below the
 *   night before); a null `end` means it stays above through the night that follows.
 *   Both happen for a day or so at the edges of the midnight sun.
 */
export type Band = { kind: "below" } | { kind: "above" } | { kind: "crosses"; begin: number | null; end: number | null };

export interface SunDay {
  date: IsoDate;
  /** The sun crosses the place's meridian: solar noon. */
  noon: number;
  /** How high the centre of the sun is then, in degrees; negative when it is below the horizon. No refraction. */
  noonAltitude: number;
  /** Sunrise to sunset. */
  sun: Band;
  /** First light to last light: the sun less than 6° below the horizon. */
  civil: Band;
  /** The sun less than 12° below the horizon. */
  nautical: Band;
  /** Time between sunrise and sunset, in milliseconds: none in the polar night, 24 hours under the midnight sun. */
  dayLength: number;
  /** True bearings, in degrees clockwise from north, of the points on the horizon where the sun rises and sets. */
  sunriseBearing: number | null;
  sunsetBearing: number | null;
}

/** Geometric altitude of the sun's centre at an hour angle (degrees from the meridian). */
function altitudeAt(lat: number, declination: number, hourAngle: number): number {
  return asin(sin(lat) * sin(declination) + cos(lat) * cos(declination) * cos(hourAngle));
}

/** Hour angle at which the sun stands at `altitude`, clamped to 0…180 where it never does. */
function hourAngleFor(lat: number, declination: number, altitude: number): number {
  return acos((sin(altitude) - sin(lat) * sin(declination)) / (cos(lat) * cos(declination)));
}

/**
 * The sun's day at a place. Latitude and longitude in degrees, north and east positive.
 * A latitude at a pole itself is taken a hair short of it, where the arithmetic still holds.
 */
export function sunDay(latitude: number, longitude: number, date: IsoDate): SunDay {
  const lat = Math.max(-89.99, Math.min(89.99, latitude));
  // Noon mean time on the place's own meridian; apparent noon is the equation of time away from it.
  const meanNoon = dateToUtc(date) + 12 * 60 * MINUTE - longitude * 4 * MINUTE;
  let noon = meanNoon;
  for (let pass = 0; pass < 2; pass += 1) noon = meanNoon - solarPosition(noon).equationOfTime * MINUTE;
  const atNoon = solarPosition(noon);
  const noonAltitude = altitudeAt(lat, atNoon.declination, 0);

  /** One crossing of an altitude: on the way up before noon (side -1) or on the way down after it (side 1). */
  const crossing = (altitude: number, side: -1 | 1): number | null => {
    // The sun is lowest half a day from noon. Still above the altitude then: no crossing on this side.
    const lowest = noon + side * 12 * 60 * MINUTE;
    if (altitudeAt(lat, solarPosition(lowest).declination, 180) > altitude) return null;
    let at = noon;
    for (let pass = 0; pass < 4; pass += 1) {
      const sun = solarPosition(at);
      at = meanNoon - sun.equationOfTime * MINUTE + side * hourAngleFor(lat, sun.declination, altitude) * 4 * MINUTE;
    }
    return at;
  };

  const band = (altitude: number): Band => {
    if (noonAltitude < altitude) return { kind: "below" };
    const begin = crossing(altitude, -1);
    const end = crossing(altitude, 1);
    return begin === null && end === null ? { kind: "above" } : { kind: "crosses", begin, end };
  };

  const sun = band(SUNRISE_ALTITUDE);
  const bearingAt = (at: number | null): number | null => {
    if (at === null) return null;
    const declination = solarPosition(at).declination;
    return acos((sin(declination) - sin(lat) * sin(SUNRISE_ALTITUDE)) / (cos(lat) * cos(SUNRISE_ALTITUDE)));
  };
  const sunriseBearing = sun.kind === "crosses" ? bearingAt(sun.begin) : null;
  const eastOfNorth = sun.kind === "crosses" ? bearingAt(sun.end) : null;

  const dayLength =
    sun.kind === "below" ? 0 : sun.kind === "above" ? DAY : (sun.end ?? noon + 12 * 60 * MINUTE) - (sun.begin ?? noon - 12 * 60 * MINUTE);

  return {
    date,
    noon,
    noonAltitude,
    sun,
    civil: band(CIVIL_ALTITUDE),
    nautical: band(NAUTICAL_ALTITUDE),
    dayLength,
    sunriseBearing,
    sunsetBearing: eastOfNorth === null ? null : 360 - eastOfNorth,
  };
}

/** How much longer (positive) or shorter this day is than the one before it, in milliseconds. */
export function dayLengthChange(latitude: number, longitude: number, date: IsoDate): number {
  return sunDay(latitude, longitude, date).dayLength - sunDay(latitude, longitude, addDays(date, -1)).dayLength;
}
