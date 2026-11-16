/**
 * The sun's times held to published ones.
 *
 * Every reference value below was read from the US Naval Observatory's Astronomical
 * Applications Department (aa.usno.navy.mil) on 16 November 2026, and is copied as
 * published, to the minute or the tenth of a degree, in the time zone it was asked
 * for. Three of its services were used:
 *
 * - "Complete Sun and Moon Data for One Day", `/api/rstt/oneday?date=…&coords=…&tz=…`:
 *   sunrise, sunset, the sun's upper transit and civil twilight.
 * - "Table of Sunrise/Sunset, Moonrise/Moonset, or Twilight Times for an Entire Year",
 *   `/calculated/rstt/year?…&task=3`: nautical twilight.
 * - "Altitude and Azimuth of the Sun or Moon During One Day", `/calculated/altaz?body=10&…`
 *   at one-minute steps: the sun's azimuth in the minute it rises and sets.
 *
 * The Observatory rounds to the minute. The calculation here is asked to land within
 * a minute of each published time (the largest difference found was 32 seconds), and
 * within two and a half minutes on the days at the edge of the midnight sun, where the
 * sun meets the horizon at a very shallow angle and the same error in height is a
 * longer error in time (the largest found there was 1 minute 54 seconds).
 */
import { describe, expect, it } from "vitest";
import { addDays, type Band, dateToUtc, dayLengthChange, isIsoDate, solarPosition, sunDay, utcToDate } from "./sun";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** A published "HH:MM" on `date` in a zone `tz` hours ahead of UTC, as an instant. */
const at = (date: string, tz: number, time: string) => {
  const [hours, minutes] = time.split(":").map(Number) as [number, number];
  return dateToUtc(date) + hours * HOUR + minutes * MINUTE - tz * HOUR;
};

interface Reference {
  name: string;
  lat: number;
  lon: number;
  date: string;
  /** The zone the Observatory was asked for, in hours ahead of UTC. */
  tz: number;
  civilBegin: string;
  rise: string;
  transit: string;
  set: string;
  civilEnd: string;
}

// USNO one-day data, read 16 November 2026.
const DAYS: Reference[] = [
  // The March equinox, on the Greenwich meridian.
  {
    name: "Greenwich",
    lat: 51.48,
    lon: 0,
    date: "2026-03-20",
    tz: 0,
    civilBegin: "05:30",
    rise: "06:03",
    transit: "12:07",
    set: "18:13",
    civilEnd: "18:46",
  },
  // The June solstice.
  {
    name: "Greenwich",
    lat: 51.48,
    lon: 0,
    date: "2026-06-21",
    tz: 0,
    civilBegin: "02:55",
    rise: "03:43",
    transit: "12:02",
    set: "20:21",
    civilEnd: "21:09",
  },
  // The September equinox, on the equator.
  {
    name: "Quito",
    lat: -0.18,
    lon: -78.47,
    date: "2026-09-23",
    tz: -5,
    civilBegin: "05:42",
    rise: "06:03",
    transit: "12:06",
    set: "18:09",
    civilEnd: "18:30",
  },
  // The December solstice, in the southern summer.
  {
    name: "Sydney",
    lat: -33.87,
    lon: 151.21,
    date: "2026-12-21",
    tz: 10,
    civilBegin: "04:11",
    rise: "04:41",
    transit: "11:53",
    set: "19:05",
    civilEnd: "19:35",
  },
  // A four-hour day just south of the Arctic Circle.
  {
    name: "Reykjavik",
    lat: 64.15,
    lon: -21.94,
    date: "2026-12-21",
    tz: 0,
    civilBegin: "10:03",
    rise: "11:22",
    transit: "13:26",
    set: "15:29",
    civilEnd: "16:49",
  },
  // West of the date line (an east longitude): the local day starts on the UTC day before.
  {
    name: "Suva",
    lat: -18.14,
    lon: 178.44,
    date: "2026-03-20",
    tz: 12,
    civilBegin: "05:48",
    rise: "06:10",
    transit: "12:14",
    set: "18:17",
    civilEnd: "18:39",
  },
  // East of the date line (a west longitude): the local day ends on the UTC day after.
  {
    name: "Adak",
    lat: 51.88,
    lon: -176.66,
    date: "2026-09-23",
    tz: -10,
    civilBegin: "07:01",
    rise: "07:35",
    transit: "13:39",
    set: "19:42",
    civilEnd: "20:15",
  },
  // 29 February in a leap year.
  {
    name: "New York",
    lat: 40.71,
    lon: -74.01,
    date: "2024-02-29",
    tz: -5,
    civilBegin: "06:03",
    rise: "06:31",
    transit: "12:08",
    set: "17:47",
    civilEnd: "18:14",
  },
];

const crossing = (band: Band): { begin: number | null; end: number | null } => {
  if (band.kind !== "crosses") throw new Error(`expected the sun to cross this altitude, but it stays ${band.kind}`);
  return band;
};

describe("sunrise, sunset, solar noon and civil twilight against the US Naval Observatory", () => {
  for (const ref of DAYS) {
    it(`${ref.name}, ${ref.date}`, () => {
      const day = sunDay(ref.lat, ref.lon, ref.date);
      const sun = crossing(day.sun);
      const civil = crossing(day.civil);
      const found = { civilBegin: civil.begin, rise: sun.begin, transit: day.noon, set: sun.end, civilEnd: civil.end };
      for (const key of ["civilBegin", "rise", "transit", "set", "civilEnd"] as const) {
        const published = at(ref.date, ref.tz, ref[key]);
        const off = Math.abs((found[key] as number) - published);
        expect(off, `${key}: ${Math.round(off / 1000)} s from the published ${ref[key]}`).toBeLessThanOrEqual(MINUTE);
      }
    });
  }

  it("puts a place either side of the date line on its own calendar day", () => {
    // Suva's 20 March sunrise is still 19 March in UTC; Adak's 23 September sunset is already the 24th.
    expect(utcToDate(crossing(sunDay(-18.14, 178.44, "2026-03-20").sun).begin as number)).toBe("2026-03-19");
    expect(utcToDate(crossing(sunDay(51.88, -176.66, "2026-09-23").sun).end as number)).toBe("2026-09-24");
    // Two places a few kilometres apart across the 180° meridian, asked about the same date,
    // get days a whole day apart: the date is the date at the place.
    const west = sunDay(0, 179.99, "2026-01-01").noon;
    const east = sunDay(0, -179.99, "2026-01-01").noon;
    expect((east - west) / HOUR).toBeCloseTo(24, 1);
  });
});

describe("nautical twilight against the US Naval Observatory", () => {
  // USNO year table of nautical twilight for 51°29'N 0°00', Universal Time, read 16 November 2026.
  const greenwich: Array<[date: string, begin: string, end: string]> = [
    ["2026-03-20", "04:50", "19:26"],
    ["2026-06-21", "01:41", "22:23"],
    ["2026-09-23", "04:35", "19:09"],
    ["2026-12-21", "06:40", "17:16"],
  ];
  for (const [date, begin, end] of greenwich) {
    it(`Greenwich, ${date}`, () => {
      const nautical = crossing(sunDay(51.48, 0, date).nautical);
      expect(Math.abs((nautical.begin as number) - at(date, 0, begin))).toBeLessThanOrEqual(MINUTE);
      expect(Math.abs((nautical.end as number) - at(date, 0, end))).toBeLessThanOrEqual(MINUTE);
    });
  }
});

describe("where the sun rises and sets, and how high it stands at noon", () => {
  // USNO altitude and azimuth tables at one-minute steps, read 16 November 2026: the
  // azimuth (east of north) in the minute of sunrise and of sunset, and the altitude at transit.
  it("Greenwich at the June solstice: 49.0° and 311.1°, 62.0° up at noon", () => {
    const day = sunDay(51.48, 0, "2026-06-21");
    expect(Math.abs((day.sunriseBearing as number) - 49.0)).toBeLessThan(0.25);
    expect(Math.abs((day.sunsetBearing as number) - 311.1)).toBeLessThan(0.25);
    expect(Math.abs(day.noonAltitude - 62.0)).toBeLessThan(0.1);
  });

  it("Sydney at the December solstice: 119.2° and 240.8°", () => {
    const day = sunDay(-33.87, 151.21, "2026-12-21");
    expect(Math.abs((day.sunriseBearing as number) - 119.2)).toBeLessThan(0.25);
    expect(Math.abs((day.sunsetBearing as number) - 240.8)).toBeLessThan(0.25);
  });

  it("rises due east and sets due west at an equinox, to within a degree or so", () => {
    const day = sunDay(51.48, 0, "2026-03-20");
    expect(Math.abs((day.sunriseBearing as number) - 90)).toBeLessThan(1.5);
    expect(Math.abs((day.sunsetBearing as number) - 270)).toBeLessThan(1.5);
  });
});

describe("the far north and south", () => {
  // USNO one-day data, read 16 November 2026. Where the Observatory gives no time it says
  // "Object continuously above the Horizon", "…below the Horizon", "…above the Twilight
  // Limit" or "…below the Twilight Limit"; those are quoted beside each case.

  it("Tromsø at the June solstice: the sun does not set (continuously above the horizon)", () => {
    const day = sunDay(69.65, 18.96, "2026-06-21");
    expect(day.sun).toEqual({ kind: "above" });
    expect(day.civil).toEqual({ kind: "above" });
    expect(day.dayLength).toBe(24 * HOUR);
    expect(day.sunriseBearing).toBeNull();
    // Upper transit published as 11:46 at UTC+1.
    expect(Math.abs(day.noon - at("2026-06-21", 1, "11:46"))).toBeLessThanOrEqual(MINUTE);
  });

  it("Tromsø at the December solstice: the sun does not rise, but there is civil twilight from 09:31 to 13:53", () => {
    const day = sunDay(69.65, 18.96, "2026-12-21");
    expect(day.sun).toEqual({ kind: "below" });
    expect(day.dayLength).toBe(0);
    expect(day.noonAltitude).toBeLessThan(0);
    const civil = crossing(day.civil);
    expect(Math.abs((civil.begin as number) - at("2026-12-21", 1, "09:31"))).toBeLessThanOrEqual(MINUTE);
    expect(Math.abs((civil.end as number) - at("2026-12-21", 1, "13:53"))).toBeLessThanOrEqual(MINUTE);
  });

  it("Longyearbyen at the December solstice: no sun and no civil twilight (continuously below the twilight limit)", () => {
    const day = sunDay(78.22, 15.63, "2026-12-21");
    expect(day.sun).toEqual({ kind: "below" });
    expect(day.civil).toEqual({ kind: "below" });
  });

  it("McMurdo at the June solstice: the southern polar night (continuously below the horizon and the twilight limit)", () => {
    const day = sunDay(-77.85, 166.67, "2026-06-21");
    expect(day.sun).toEqual({ kind: "below" });
    expect(day.civil).toEqual({ kind: "below" });
  });

  it("Trondheim at the June solstice: the sun sets (02:02 to 22:38) but twilight lasts all night", () => {
    const day = sunDay(63.43, 10.39, "2026-06-21");
    const sun = crossing(day.sun);
    expect(Math.abs((sun.begin as number) - at("2026-06-21", 1, "02:02"))).toBeLessThanOrEqual(MINUTE);
    expect(Math.abs((sun.end as number) - at("2026-06-21", 1, "22:38"))).toBeLessThanOrEqual(MINUTE);
    expect(day.civil).toEqual({ kind: "above" });
  });

  describe("the days at the edge of Tromsø's midnight sun", () => {
    const GRAZING = 2.5 * MINUTE;
    const near = (found: number | null, date: string, time: string) =>
      expect(Math.abs((found as number) - at(date, 1, time)), `${time} on ${date}`).toBeLessThanOrEqual(GRAZING);

    it("17 May, the last day with a night: rises 00:18, sets 23:28", () => {
      const sun = crossing(sunDay(69.65, 18.96, "2026-05-17").sun);
      near(sun.begin, "2026-05-17", "00:18");
      near(sun.end, "2026-05-17", "23:28");
    });

    it("18 May: the sun rises late on the 17th (23:53) and then does not set", () => {
      const sun = crossing(sunDay(69.65, 18.96, "2026-05-18").sun);
      near(sun.begin, "2026-05-17", "23:53");
      expect(sun.end).toBeNull();
      expect(sunDay(69.65, 18.96, "2026-05-19").sun).toEqual({ kind: "above" });
    });

    it("25 July: still up from the night before, and sets at 23:36 for the first time", () => {
      expect(sunDay(69.65, 18.96, "2026-07-24").sun).toEqual({ kind: "above" });
      const sun = crossing(sunDay(69.65, 18.96, "2026-07-25").sun);
      expect(sun.begin).toBeNull();
      near(sun.end, "2026-07-25", "23:36");
    });

    it("26 July: rises 00:06, sets 23:13", () => {
      const sun = crossing(sunDay(69.65, 18.96, "2026-07-26").sun);
      near(sun.begin, "2026-07-26", "00:06");
      near(sun.end, "2026-07-26", "23:13");
    });

    it("counts a day that runs into the midnight sun up to the sun's lowest point", () => {
      const lengths = ["2026-05-16", "2026-05-17", "2026-05-18", "2026-05-19"].map((date) => sunDay(69.65, 18.96, date).dayLength);
      expect([...lengths].sort((a, b) => a - b)).toEqual(lengths);
      expect(lengths[3]).toBe(24 * HOUR);
      expect(dayLengthChange(69.65, 18.96, "2026-06-21")).toBe(0);
    });
  });

  it("gives an answer at the poles themselves instead of dividing by nothing", () => {
    expect(sunDay(90, 0, "2026-06-21").sun).toEqual({ kind: "above" });
    expect(sunDay(-90, 0, "2026-06-21").sun).toEqual({ kind: "below" });
    expect(Number.isFinite(sunDay(90, 0, "2026-03-20").noon)).toBe(true);
  });
});

describe("the length of the day", () => {
  it("is sunset less sunrise, and compares with the day before", () => {
    const day = sunDay(51.48, 0, "2026-03-20");
    const sun = crossing(day.sun);
    expect(day.dayLength).toBe((sun.end as number) - (sun.begin as number));
    // Published sunrise and sunset for 19 and 20 March at Greenwich (USNO one-day data, read
    // 16 November 2026) are 06:05 to 18:11 and 06:03 to 18:13: about four minutes longer.
    const change = dayLengthChange(51.48, 0, "2026-03-20");
    expect(change / MINUTE).toBeGreaterThan(3);
    expect(change / MINUTE).toBeLessThan(5);
    expect(dayLengthChange(-33.87, 151.21, "2026-03-20")).toBeLessThan(0);
  });
});

describe("the sun's position", () => {
  it("is on the equator at an equinox and 23.4° from it at a solstice", () => {
    // Equinox and solstice instants for 2026 from the USNO "Earth's Seasons" data (`/api/seasons?year=2026`),
    // read 16 November 2026: 20 March 14:46 UT, 21 June 08:24 UT, 23 September 00:05 UT.
    expect(Math.abs(solarPosition(Date.UTC(2026, 2, 20, 14, 46)).declination)).toBeLessThan(0.01);
    expect(Math.abs(solarPosition(Date.UTC(2026, 8, 23, 0, 5)).declination)).toBeLessThan(0.01);
    expect(solarPosition(Date.UTC(2026, 5, 21, 8, 24)).declination).toBeCloseTo(23.44, 1);
  });
});

describe("dates", () => {
  it("steps across months and years, and knows a real date from a wrong one", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2024-03-01", -1)).toBe("2024-02-29");
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("2026-2-3")).toBe(false);
    expect(isIsoDate("")).toBe(false);
    expect(isIsoDate("2026-11-16")).toBe(true);
  });
});
