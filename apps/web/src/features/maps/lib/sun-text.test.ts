import { describe, expect, it } from "vitest";
import { moonPhase } from "./moon";
import { dayLengthChange, sunDay } from "./sun";
import {
  dateIn,
  formatClock,
  formatDayChange,
  formatDayLength,
  formatOffset,
  hoursFromZone,
  sunRows,
  sunSummary,
  zoneOffsetMinutes,
} from "./sun-text";

const rowsFor = (lat: number, lon: number, date: string, zone: string) => {
  const day = sunDay(lat, lon, date);
  const rows = sunRows(day, dayLengthChange(lat, lon, date), moonPhase(day.noon), zone);
  return Object.fromEntries(rows.map((row) => [row.key, row]));
};

describe("clock times", () => {
  it("are shown on the clock asked for, to the nearest minute, on a 24-hour clock", () => {
    const instant = Date.UTC(2026, 5, 21, 20, 20, 55);
    expect(formatClock(instant, "UTC", "2026-06-21")).toBe("20:21");
    expect(formatClock(instant, "Europe/London", "2026-06-21")).toBe("21:21");
    expect(formatClock(Date.UTC(2026, 5, 21, 0, 0, 20), "UTC", "2026-06-21")).toBe("00:00");
  });

  it("say the day when it is not the date asked about", () => {
    // Suva's sunrise on its 20 March, read on a clock in London, is the evening before.
    expect(formatClock(Date.UTC(2026, 2, 19, 18, 10), "Europe/London", "2026-03-20")).toBe("18:10 on 19 Mar");
    expect(formatClock(Date.UTC(2026, 2, 19, 18, 10), "Pacific/Fiji", "2026-03-20")).toBe("06:10");
  });

  it("know a zone's offset on a date, daylight saving and half hours included", () => {
    expect(zoneOffsetMinutes("Europe/London", Date.UTC(2026, 0, 15))).toBe(0);
    expect(zoneOffsetMinutes("Europe/London", Date.UTC(2026, 6, 15))).toBe(60);
    expect(zoneOffsetMinutes("America/St_Johns", Date.UTC(2026, 0, 15))).toBe(-210);
    expect(zoneOffsetMinutes("Asia/Kolkata", Date.UTC(2026, 0, 15))).toBe(330);
    expect(formatOffset(0)).toBe("UTC+0");
    expect(formatOffset(60)).toBe("UTC+1");
    expect(formatOffset(-210)).toBe("UTC−3:30");
    expect(formatOffset(330)).toBe("UTC+5:30");
  });

  it("know the date in a zone", () => {
    expect(dateIn("Pacific/Fiji", Date.UTC(2026, 10, 16, 13, 0))).toBe("2026-11-17");
    expect(dateIn("America/Adak", Date.UTC(2026, 10, 16, 3, 0))).toBe("2026-11-15");
  });
});

describe("a place far from the device's time zone", () => {
  const june = Date.UTC(2026, 5, 21);

  it("is left alone when the sun's time there is within two hours of the zone's", () => {
    expect(hoursFromZone(-3.2, "Europe/London", june)).toBeNull();
    // Tromsø from London: an hour apart on the clock, and not far enough to be sure of from longitude alone.
    expect(hoursFromZone(18.96, "Europe/London", june)).toBeNull();
    // Spain keeps Berlin's time, and adds daylight saving on top; neither is taken for distance.
    expect(hoursFromZone(-8.5, "Europe/Madrid", june)).toBeNull();
  });

  it("is said to be ahead or behind, in round hours", () => {
    expect(hoursFromZone(178.44, "Europe/London", june)).toEqual({ hours: 12, direction: "ahead" });
    expect(hoursFromZone(-74.01, "Europe/London", june)).toEqual({ hours: 5, direction: "behind" });
    expect(hoursFromZone(0, "Australia/Sydney", june)).toEqual({ hours: 10, direction: "behind" });
  });
});

describe("lengths of time", () => {
  it("are written out", () => {
    expect(formatDayLength(8 * 3_600_000 + 29 * 60_000 + 20_000)).toBe("8 h 29 min");
    expect(formatDayLength(16 * 3_600_000 + 5 * 60_000)).toBe("16 h 5 min");
    expect(formatDayChange(171_000)).toBe("2 min 51 s longer than the day before");
    expect(formatDayChange(-45_400)).toBe("45 s shorter than the day before");
    expect(formatDayChange(0)).toBeUndefined();
    expect(formatDayChange(300)).toBeUndefined();
  });
});

describe("the rows of the Sun section", () => {
  it("give an ordinary day in order, with bearings and the sun's height at noon", () => {
    // Greenwich on 21 June 2026, on a London clock (UTC+1): the published Universal Times plus an hour.
    const day = sunDay(51.48, 0, "2026-06-21");
    const rows = sunRows(day, dayLengthChange(51.48, 0, "2026-06-21"), moonPhase(day.noon), "Europe/London");
    expect(rows.map((row) => row.key)).toEqual([
      "first-light",
      "sunrise",
      "noon",
      "sunset",
      "last-light",
      "day-length",
      "nautical",
      "moon",
    ]);
    const by = Object.fromEntries(rows.map((row) => [row.key, row]));
    expect(by["first-light"]).toMatchObject({ label: "First light (civil dawn)", value: "03:55" });
    expect(by.sunrise).toMatchObject({ value: "04:43", detail: "49° NE" });
    expect(by.noon).toMatchObject({ value: "13:02", detail: "sun 62° up" });
    expect(by.sunset).toMatchObject({ value: "21:21", detail: "311° NW" });
    expect(by["last-light"]).toMatchObject({ value: "22:09" });
    expect(by["day-length"]?.value).toBe("16 h 38 min");
    expect(by["day-length"]?.detail).toMatch(/^\d+ s (longer|shorter) than the day before$/);
    expect(by.nautical?.value).toBe("02:41 to 23:23");
    expect(by.moon?.value).toBe("First quarter, 46% lit");
    expect(sunSummary(day, "Europe/London")).toBe("Sunrise 04:43, sunset 21:21");
    expect(sunSummary(day, "UTC")).toBe("Sunrise 03:43, sunset 20:21");
  });

  it("say in words that the sun does not set", () => {
    const rows = rowsFor(69.65, 18.96, "2026-06-21", "UTC");
    expect(rows.sun?.value).toBe("Does not set on this date (midnight sun)");
    expect(rows["day-length"]).toMatchObject({ value: "24 hours", detail: undefined });
    expect(rows.sunrise).toBeUndefined();
    expect(rows["first-light"]).toBeUndefined();
    expect(rows.nautical).toBeUndefined();
    expect(rows.noon).toMatchObject({ value: "10:46", detail: "sun 44° up" });
    expect(sunSummary(sunDay(69.65, 18.96, "2026-06-21"), "UTC")).toBe("The sun does not set");
  });

  it("say in words that the sun does not rise, and still give the twilight there is", () => {
    const rows = rowsFor(69.65, 18.96, "2026-12-21", "UTC");
    expect(rows.sun?.value).toBe("Does not rise on this date (polar night)");
    expect(rows["first-light"]?.value).toBe("08:31");
    expect(rows["last-light"]?.value).toBe("12:53");
    expect(rows.noon?.detail).toBe("sun 3° below the horizon");
    expect(rows["day-length"]?.value).toBe("No daylight");
    expect(sunSummary(sunDay(69.65, 18.96, "2026-12-21"), "UTC")).toBe("The sun does not rise");
  });

  it("say when there is no twilight either", () => {
    const rows = rowsFor(78.22, 15.63, "2026-12-21", "UTC");
    expect(rows.sun?.value).toBe("Does not rise on this date (polar night)");
    expect(rows.light?.value).toBe("None: the sun stays more than 6° below the horizon");
    expect(rows.nautical?.value).toMatch(/^\d\d:\d\d to \d\d:\d\d$/);
  });

  it("say when twilight lasts all night", () => {
    const rows = rowsFor(63.43, 10.39, "2026-06-21", "UTC");
    expect(rows.light?.value).toBe("Twilight lasts all night");
    expect(rows.sunrise?.value).toBe("01:02");
    expect(rows.sunset?.value).toBe("21:38");
    expect(rows.nautical).toBeUndefined();
  });

  it("say which side of the day is missing at the edge of the midnight sun", () => {
    // Tromsø on a clock an hour ahead of UTC, as the published times in sun.test.ts are.
    const first = rowsFor(69.65, 18.96, "2026-05-18", "Etc/GMT-1");
    expect(first.sunrise?.value).toMatch(/^23:5\d on 17 May$/);
    expect(first.sunset?.value).toBe("Does not set tonight");
    const last = rowsFor(69.65, 18.96, "2026-07-25", "Etc/GMT-1");
    expect(last.sunrise?.value).toBe("Already up: it did not set the night before");
    expect(last.sunset?.value).toMatch(/^23:3\d$/);
    expect(sunSummary(sunDay(69.65, 18.96, "2026-07-25"), "Etc/GMT-1")).toMatch(/^Sunset 23:3\d$/);
  });

  it("never print a blank or an invalid time, anywhere on Earth, on any day of the year", () => {
    for (const lat of [-90, -78, -66.6, -45, 0, 45, 66.6, 70, 85.05, 90]) {
      for (const lon of [-180, -75, 0, 100, 180]) {
        for (let day = 0; day < 366; day += 7) {
          const date = new Date(Date.UTC(2028, 0, 1 + day)).toISOString().slice(0, 10);
          const sun = sunDay(lat, lon, date);
          const text = [
            sunSummary(sun, "UTC"),
            ...sunRows(sun, dayLengthChange(lat, lon, date), moonPhase(sun.noon), "UTC").flatMap((row) => [row.value, row.detail ?? "-"]),
          ].join(" | ");
          expect(text, `${lat}, ${lon} on ${date}`).not.toMatch(/NaN|Invalid|undefined|null|Infinity/);
          expect(text).not.toMatch(/\|\s*\|/);
        }
      }
    }
  });
});
