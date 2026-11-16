/**
 * The grey line held to the Sun tab's own times and to published ones.
 *
 * The published sunrise, sunset and twilight times are the US Naval Observatory's, as
 * copied into `lib/sun.test.ts` (read from aa.usno.navy.mil on 16 November 2026); see that
 * file for which of its services each came from. Here a place is asked which side of the
 * drawn shapes it is on a little before and a little after each of those times.
 */
import { describe, expect, it } from "vitest";
import { dateToUtc, SUNRISE_ALTITUDE, solarPosition, sunDay } from "../lib/sun";
import { bandAt, bandOf, GREY_LINE_LIMITS, greyLineData, subsolarPoint, sunAltitude } from "./geometry";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

type Ring = number[][];
type Feature = ReturnType<typeof greyLineData>["features"][number];

/** A published "HH:MM" on `date` in a zone `tz` hours ahead of UTC, as an instant. */
const at = (date: string, tz: number, time: string) => {
  const [hours, minutes] = time.split(":").map(Number) as [number, number];
  return dateToUtc(date) + hours * HOUR + minutes * MINUTE - tz * HOUR;
};

/** Whether a point is inside a ring, by counting crossings of a ray. */
function inRing(ring: Ring, lon: number, lat: number): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i] as [number, number];
    const [xj, yj] = ring[j] as [number, number];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

const shades = (ms: number) => greyLineData(ms).features.filter((feature) => feature.properties.kind === "shade");
const edges = (ms: number) => greyLineData(ms).features.filter((feature) => feature.properties.kind === "edge");

/** Which of the four shades (by step, 0 to 3) a place is under. */
function shadedBy(features: Feature[], lat: number, lon: number): number[] {
  return features
    .filter((feature) => (feature.geometry.coordinates as Ring[][]).some((polygon) => inRing(polygon[0]!, lon, lat)))
    .map((feature) => feature.properties.step as number)
    .sort();
}

/** How many shades a place should be under, from the Sun's height there. */
const expectedSteps = (altitude: number) => GREY_LINE_LIMITS.filter((limit) => altitude < limit).length;

/** The band a place is drawn in: how many shades are over it, as the name of that band. */
const drawnBand = (features: Feature[], lat: number, lon: number) =>
  (["day", "civil", "nautical", "astronomical", "night"] as const)[shadedBy(features, lat, lon).length];

// USNO one-day data, as in lib/sun.test.ts: sunrise, sunset and civil twilight, in the zone asked for.
const DAYS = [
  { name: "Greenwich, March equinox", lat: 51.48, lon: 0, date: "2026-03-20", tz: 0, civil: ["05:30", "18:46"], sun: ["06:03", "18:13"] },
  { name: "Greenwich, June solstice", lat: 51.48, lon: 0, date: "2026-06-21", tz: 0, civil: ["02:55", "21:09"], sun: ["03:43", "20:21"] },
  {
    name: "Quito, September equinox",
    lat: -0.18,
    lon: -78.47,
    date: "2026-09-23",
    tz: -5,
    civil: ["05:42", "18:30"],
    sun: ["06:03", "18:09"],
  },
  {
    name: "Sydney, December solstice",
    lat: -33.87,
    lon: 151.21,
    date: "2026-12-21",
    tz: 10,
    civil: ["04:11", "19:35"],
    sun: ["04:41", "19:05"],
  },
  {
    name: "Reykjavik, December solstice",
    lat: 64.15,
    lon: -21.94,
    date: "2026-12-21",
    tz: 0,
    civil: ["10:03", "16:49"],
    sun: ["11:22", "15:29"],
  },
  {
    name: "Suva, by the date line",
    lat: -18.14,
    lon: 178.44,
    date: "2026-03-20",
    tz: 12,
    civil: ["05:48", "18:39"],
    sun: ["06:10", "18:17"],
  },
  {
    name: "Adak, by the date line",
    lat: 51.88,
    lon: -176.66,
    date: "2026-09-23",
    tz: -10,
    civil: ["07:01", "20:15"],
    sun: ["07:35", "19:42"],
  },
] as const;

describe("the Sun's position", () => {
  it("is overhead at the sub-solar point, and on the equator at an equinox", () => {
    // USNO "Earth's Seasons" for 2026, as in lib/sun.test.ts: 20 March 14:46 UT, 21 June 08:24 UT.
    const equinox = Date.UTC(2026, 2, 20, 14, 46);
    expect(Math.abs(subsolarPoint(equinox).lat)).toBeLessThan(0.01);
    const solstice = Date.UTC(2026, 5, 21, 8, 24);
    expect(subsolarPoint(solstice).lat).toBeCloseTo(23.44, 1);
    for (const ms of [equinox, solstice, Date.UTC(2026, 10, 16, 23, 59)]) {
      const sun = subsolarPoint(ms);
      expect(sunAltitude(sun.lat, sun.lon, ms)).toBeCloseTo(90, 3);
      expect(sunAltitude(-sun.lat, sun.lon + 180, ms)).toBeCloseTo(-90, 3);
    }
  });

  it("crosses the Greenwich meridian at solar noon, the equation of time from 12:00 UTC", () => {
    // Solar noon at Greenwich on 21 June 2026 was 12:02 by the Observatory's table.
    const noon = sunDay(51.48, 0, "2026-06-21").noon;
    expect(Math.abs(subsolarPoint(noon).lon)).toBeLessThan(0.01);
    // At 12:00 UTC exactly the Sun is east of Greenwich by the equation of time, a quarter-degree a minute.
    const eot = solarPosition(Date.UTC(2026, 5, 21, 12)).equationOfTime;
    expect(subsolarPoint(Date.UTC(2026, 5, 21, 12)).lon).toBeCloseTo(-eot / 4, 5);
  });

  it("moves west a quarter-degree a minute", () => {
    const start = Date.UTC(2026, 10, 16, 10);
    const later = subsolarPoint(start + 4 * MINUTE).lon - subsolarPoint(start).lon;
    expect(later).toBeCloseTo(-1, 2);
  });
});

describe("the line against the Sun tab's sunrise and sunset", () => {
  for (const ref of DAYS) {
    it(ref.name, () => {
      const day = sunDay(ref.lat, ref.lon, ref.date);
      if (day.sun.kind !== "crosses" || day.civil.kind !== "crosses") throw new Error("expected a sunrise and a sunset");
      // At the Sun tab's sunrise and sunset, the Sun is at the line's own height there…
      for (const instant of [day.sun.begin, day.sun.end]) {
        expect(Math.abs(sunAltitude(ref.lat, ref.lon, instant as number) - SUNRISE_ALTITUDE)).toBeLessThan(0.02);
      }
      for (const instant of [day.civil.begin, day.civil.end]) {
        expect(Math.abs(sunAltitude(ref.lat, ref.lon, instant as number) + 6)).toBeLessThan(0.02);
      }
      // …and the shapes drawn put the place in night two minutes before sunrise and in day two minutes after.
      const rise = day.sun.begin as number;
      const set = day.sun.end as number;
      expect(drawnBand(shades(rise - 2 * MINUTE), ref.lat, ref.lon)).toBe("civil");
      expect(drawnBand(shades(rise + 2 * MINUTE), ref.lat, ref.lon)).toBe("day");
      expect(drawnBand(shades(set - 2 * MINUTE), ref.lat, ref.lon)).toBe("day");
      expect(drawnBand(shades(set + 2 * MINUTE), ref.lat, ref.lon)).toBe("civil");
    });
  }
});

describe("the shapes against the US Naval Observatory's published times", () => {
  // The Observatory rounds to the minute; a minute and a half either side is outside its rounding and the method's error.
  const off = 1.5 * MINUTE;
  for (const ref of DAYS) {
    it(ref.name, () => {
      const [riseText, setText] = ref.sun;
      const [firstText, lastText] = ref.civil;
      const [rise, set, first, last] = [riseText, setText, firstText, lastText].map((time) => at(ref.date, ref.tz, time)) as [
        number,
        number,
        number,
        number,
      ];
      expect(drawnBand(shades(rise - off), ref.lat, ref.lon), "before sunrise").toBe("civil");
      expect(drawnBand(shades(rise + off), ref.lat, ref.lon), "after sunrise").toBe("day");
      expect(drawnBand(shades(set - off), ref.lat, ref.lon), "before sunset").toBe("day");
      expect(drawnBand(shades(set + off), ref.lat, ref.lon), "after sunset").toBe("civil");
      expect(drawnBand(shades(first - off), ref.lat, ref.lon), "before first light").toBe("nautical");
      expect(drawnBand(shades(first + off), ref.lat, ref.lon), "after first light").toBe("civil");
      expect(drawnBand(shades(last - off), ref.lat, ref.lon), "before last light").toBe("civil");
      expect(drawnBand(shades(last + off), ref.lat, ref.lon), "after last light").toBe("nautical");
    });
  }

  it("Greenwich: nautical twilight at the solstices and equinoxes (USNO year table)", () => {
    const table: Array<[date: string, begin: string, end: string]> = [
      ["2026-03-20", "04:50", "19:26"],
      ["2026-06-21", "01:41", "22:23"],
      ["2026-09-23", "04:35", "19:09"],
      ["2026-12-21", "06:40", "17:16"],
    ];
    for (const [date, begin, end] of table) {
      expect(drawnBand(shades(at(date, 0, begin) - off), 51.48, 0), `${date} before ${begin}`).toBe("astronomical");
      expect(drawnBand(shades(at(date, 0, begin) + off), 51.48, 0), `${date} after ${begin}`).toBe("nautical");
      expect(drawnBand(shades(at(date, 0, end) - off), 51.48, 0), `${date} before ${end}`).toBe("nautical");
      expect(drawnBand(shades(at(date, 0, end) + off), 51.48, 0), `${date} after ${end}`).toBe("astronomical");
    }
  });
});

describe("every place on the globe is drawn in the band the Sun's height puts it in", () => {
  // The solstices, the equinoxes (when no shade holds a pole), and ordinary moments either side of midnight UTC.
  const instants = [
    Date.UTC(2026, 2, 20, 14, 46),
    Date.UTC(2026, 5, 21, 0, 0),
    Date.UTC(2026, 5, 21, 12, 0),
    Date.UTC(2026, 8, 23, 6, 0),
    Date.UTC(2026, 11, 21, 18, 0),
    Date.UTC(2026, 10, 16, 23, 59),
    Date.UTC(2027, 0, 3, 11, 37),
  ];
  for (const ms of instants) {
    it(new Date(ms).toISOString(), () => {
      const features = shades(ms);
      let checked = 0;
      for (let lat = -89; lat <= 89; lat += 2) {
        for (let lon = -179.75; lon <= 180; lon += 5) {
          const altitude = sunAltitude(lat, lon, ms);
          // Right on a boundary, a straight piece of the ring and the true curve may disagree by a hair.
          if (GREY_LINE_LIMITS.some((limit) => Math.abs(altitude - limit) < 0.05)) continue;
          expect(shadedBy(features, lat, lon).length, `${lat}, ${lon} at ${altitude.toFixed(2)}°`).toBe(expectedSteps(altitude));
          checked += 1;
        }
      }
      expect(checked).toBeGreaterThan(6000);
    });
  }
});

describe("across the 180° meridian", () => {
  const ms = Date.UTC(2026, 5, 21, 6, 0);

  it("keeps every point between −180° and 180°", () => {
    for (const feature of greyLineData(ms).features) {
      const flat = JSON.stringify(feature.geometry.coordinates)
        .match(/-?\d+(\.\d+)?/g)!
        .map(Number);
      for (let index = 0; index < flat.length; index += 2) {
        expect(Math.abs(flat[index]!)).toBeLessThanOrEqual(180);
        expect(Math.abs(flat[index + 1]!)).toBeLessThanOrEqual(90);
      }
    }
  });

  it("draws the same either side of it, so nothing tears or flips at the date line", () => {
    for (const instant of [ms, Date.UTC(2026, 11, 21, 18, 0), Date.UTC(2026, 2, 20, 0, 0)]) {
      const features = shades(instant);
      for (let lat = -85; lat <= 85; lat += 1) {
        expect(shadedBy(features, lat, 179.999), `${lat}`).toEqual(shadedBy(features, lat, -179.999));
      }
    }
  });

  it("ends each piece of the line at 180° where another starts at −180°", () => {
    for (const edge of edges(ms)) {
      const ends = (edge.geometry.coordinates as number[][][]).flatMap((line) => [line[0]!, line.at(-1)!]);
      const east = ends.filter(([lon]) => lon === 180).map(([, lat]) => lat);
      const west = ends.filter(([lon]) => lon === -180).map(([, lat]) => lat);
      expect(east.sort()).toEqual(west.sort());
    }
  });

  it("puts a place just either side of it in the same band, at Suva and Adak", () => {
    for (const instant of [at("2026-03-20", 12, "06:09"), at("2026-03-20", 12, "06:11"), at("2026-09-23", -10, "19:42")]) {
      for (const lat of [-18.14, 51.88]) {
        expect(bandAt(lat, 179.99, instant)).toBe(bandAt(lat, -179.99, instant));
        expect(drawnBand(shades(instant), lat, 179.99)).toBe(bandAt(lat, 179.99, instant));
        expect(drawnBand(shades(instant), lat, -179.99)).toBe(bandAt(lat, -179.99, instant));
      }
    }
  });
});

describe("the poles and the far north and south", () => {
  it("the June solstice: day at the North Pole, night at the South", () => {
    const ms = Date.UTC(2026, 5, 21, 8, 24);
    const features = shades(ms);
    for (const lon of [-180, -90, 0, 45, 179.9]) {
      expect(drawnBand(features, 89.9, lon)).toBe("day");
      expect(drawnBand(features, -89.9, lon)).toBe("night");
    }
  });

  it("the December solstice: the other way round", () => {
    const features = shades(Date.UTC(2026, 11, 21, 20, 50));
    for (const lon of [-180, -90, 0, 45, 179.9]) {
      expect(drawnBand(features, 89.9, lon)).toBe("night");
      expect(drawnBand(features, -89.9, lon)).toBe("day");
    }
  });

  it("an equinox: no shade reaches over a pole, and the poles have the Sun on their horizon", () => {
    const ms = Date.UTC(2026, 2, 20, 14, 46);
    const features = shades(ms);
    expect(drawnBand(features, 89.9, 0)).toBe(bandAt(89.9, 0, ms));
    expect(drawnBand(features, -89.9, 0)).toBe(bandAt(-89.9, 0, ms));
    expect(Math.abs(sunAltitude(90, 0, ms))).toBeLessThan(0.5);
  });

  it("Tromsø: still day at midnight in June, and civil twilight at noon in December", () => {
    // The Sun tab has the June sun continuously above the horizon there, and December's civil twilight from 09:31 to 13:53.
    expect(sunDay(69.65, 18.96, "2026-06-21").sun).toEqual({ kind: "above" });
    expect(drawnBand(shades(at("2026-06-21", 1, "23:59")), 69.65, 18.96)).toBe("day");
    expect(drawnBand(shades(at("2026-06-22", 1, "00:30")), 69.65, 18.96)).toBe("day");
    const noon = sunDay(69.65, 18.96, "2026-12-21").noon;
    expect(drawnBand(shades(noon), 69.65, 18.96)).toBe("civil");
    expect(drawnBand(shades(at("2026-12-21", 1, "09:29")), 69.65, 18.96)).toBe("nautical");
    expect(drawnBand(shades(at("2026-12-21", 1, "09:33")), 69.65, 18.96)).toBe("civil");
  });

  it("Longyearbyen at the December solstice: deeper than civil twilight even at noon", () => {
    const noon = sunDay(78.22, 15.63, "2026-12-21").noon;
    expect(["nautical", "astronomical"]).toContain(drawnBand(shades(noon), 78.22, 15.63));
  });

  it("McMurdo at the June solstice: no sunrise, and only nautical twilight at noon (the Sun 11.3° down)", () => {
    const noon = sunDay(-77.85, 166.67, "2026-06-21").noon;
    expect(sunDay(-77.85, 166.67, "2026-06-21").sun).toEqual({ kind: "below" });
    expect(sunAltitude(-77.85, 166.67, noon)).toBeCloseTo(-11.3, 1);
    expect(drawnBand(shades(noon), -77.85, 166.67)).toBe("nautical");
    expect(drawnBand(shades(noon + 12 * HOUR), -77.85, 166.67)).toBe("night");
  });
});

describe("places known to be in day, night and each twilight", () => {
  it("at noon UTC at the June solstice", () => {
    const features = shades(Date.UTC(2026, 5, 21, 12, 0));
    expect(drawnBand(features, 51.5, -0.12)).toBe("day"); // London
    expect(drawnBand(features, -33.87, 151.21)).toBe("night"); // Sydney, 22:00 in winter
    expect(drawnBand(features, 21.31, -157.86)).toBe("night"); // Honolulu, 02:00
  });

  it("at midnight UTC at the December solstice", () => {
    const features = shades(Date.UTC(2026, 11, 21, 0, 0));
    expect(drawnBand(features, 51.5, -0.12)).toBe("night"); // London
    expect(drawnBand(features, -33.87, 151.21)).toBe("day"); // Sydney, 11:00
    expect(drawnBand(features, 40.71, -74.01)).toBe("night"); // New York, 19:00, an hour after astronomical dusk
  });

  it("each twilight in turn at Greenwich on the evening of the December solstice", () => {
    // Nautical twilight ends at 17:16 by the Observatory's table; the times either side are well clear of each limit.
    const evening = (time: string) => drawnBand(shades(at("2026-12-21", 0, time)), 51.48, 0);
    expect(evening("15:40")).toBe("day");
    expect(evening("16:10")).toBe("civil");
    expect(evening("16:50")).toBe("nautical");
    expect(evening("17:35")).toBe("astronomical");
    expect(evening("18:30")).toBe("night");
    expect(bandOf(-5.9)).toBe("civil");
    expect(bandOf(-18.1)).toBe("night");
  });

  it("marks where the Sun is overhead", () => {
    const ms = Date.UTC(2026, 5, 21, 12, 0);
    const sun = greyLineData(ms).features.find((feature) => feature.properties.kind === "sun")!;
    const [lon, lat] = sun.geometry.coordinates as [number, number];
    expect(lat).toBeCloseTo(23.44, 1);
    expect(lon).toBeCloseTo(subsolarPoint(ms).lon, 3);
    expect(sun.properties.label).toBe("Sun overhead");
  });
});
