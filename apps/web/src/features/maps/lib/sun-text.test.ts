import { describe, expect, it } from "vitest";
import { moonPhase } from "./moon";
import { dayLengthChange, sunDay } from "./sun";
import {
  clockPartsText,
  dateIn,
  formatClock,
  formatDayChange,
  formatDayLength,
  formatOffset,
  hoursFromZone,
  sunGlance,
  sunLayout,
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

  it("are written on the 12-hour clock when that is asked for, midnight and noon the right way round", () => {
    const twelve = { style: "12" } as const;
    const instant = Date.UTC(2026, 5, 21, 20, 20, 55);
    expect(formatClock(instant, "UTC", "2026-06-21", twelve)).toBe("8:21 pm");
    expect(formatClock(instant, "Europe/London", "2026-06-21", twelve)).toBe("9:21 pm");
    expect(formatClock(Date.UTC(2026, 5, 21, 6, 42), "UTC", "2026-06-21", twelve)).toBe("6:42 am");
    // Seven minutes past midnight is 12:07 am; seven past noon is 12:07 pm.
    expect(formatClock(Date.UTC(2026, 5, 21, 0, 7), "UTC", "2026-06-21", twelve)).toBe("12:07 am");
    expect(formatClock(Date.UTC(2026, 5, 21, 12, 7), "UTC", "2026-06-21", twelve)).toBe("12:07 pm");
    // Rounded to the minute first: 23:59:40 is midnight of the next day, said as such.
    expect(formatClock(Date.UTC(2026, 5, 21, 23, 59, 40), "UTC", "2026-06-21", twelve)).toBe("12:00 am on 22 Jun");
    expect(formatClock(Date.UTC(2026, 5, 21, 11, 59, 40), "UTC", "2026-06-21", twelve)).toBe("12:00 pm");
  });

  it("say the day across the date line on the 12-hour clock too", () => {
    const twelve = { style: "12" } as const;
    expect(formatClock(Date.UTC(2026, 2, 19, 18, 10), "Europe/London", "2026-03-20", twelve)).toBe("6:10 pm on 19 Mar");
    expect(formatClock(Date.UTC(2026, 2, 19, 18, 10), "Pacific/Fiji", "2026-03-20", twelve)).toBe("6:10 am");
    // Adak, the other side of the line: its afternoon is already tomorrow in Fiji.
    expect(formatClock(Date.UTC(2026, 2, 21, 0, 30), "America/Adak", "2026-03-20", twelve)).toBe("3:30 pm");
    expect(formatClock(Date.UTC(2026, 2, 21, 0, 30), "Pacific/Fiji", "2026-03-20", twelve)).toBe("12:30 pm on 21 Mar");
  });

  it("are marked when they are UTC, as a radio log writes them", () => {
    const utc = { style: "24", mark: "UTC" } as const;
    expect(formatClock(Date.UTC(2026, 5, 21, 3, 43), "UTC", "2026-06-21", utc)).toBe("03:43 UTC");
    expect(formatClock(Date.UTC(2026, 5, 21, 0, 7), "UTC", "2026-06-21", utc)).toBe("00:07 UTC");
    expect(formatClock(Date.UTC(2026, 4, 17, 22, 53), "UTC", "2026-05-18", utc)).toBe("22:53 UTC on 17 May");
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

  it("give the same day on the 12-hour clock, and in UTC as a radio log writes it", () => {
    const day = sunDay(51.48, 0, "2026-06-21");
    const change = dayLengthChange(51.48, 0, "2026-06-21");
    const twelve = Object.fromEntries(
      sunRows(day, change, moonPhase(day.noon), "Europe/London", { style: "12" }).map((row) => [row.key, row]),
    );
    expect(twelve["first-light"]?.value).toBe("3:55 am");
    expect(twelve.sunrise).toMatchObject({ value: "4:43 am", detail: "49° NE" });
    expect(twelve.noon).toMatchObject({ value: "1:02 pm", detail: "sun 62° up" });
    expect(twelve.sunset).toMatchObject({ value: "9:21 pm", detail: "311° NW" });
    expect(twelve["last-light"]?.value).toBe("10:09 pm");
    expect(twelve.nautical?.value).toBe("2:41 am to 11:23 pm");
    // Lengths of time are not clock times.
    expect(twelve["day-length"]?.value).toBe("16 h 38 min");
    expect(sunSummary(day, "Europe/London", { style: "12" })).toBe("Sunrise 4:43 am, sunset 9:21 pm");

    const utc = Object.fromEntries(
      sunRows(day, change, moonPhase(day.noon), "UTC", { style: "24", mark: "UTC" }).map((row) => [row.key, row]),
    );
    expect(utc.sunrise).toMatchObject({ value: "03:43 UTC", detail: "49° NE" });
    expect(utc.noon?.value).toBe("12:02 UTC");
    expect(utc.nautical?.value).toBe("01:41 UTC to 22:23 UTC");
    // One mark is enough in the line that is read at a glance.
    expect(sunSummary(day, "UTC", { style: "24", mark: "UTC" })).toBe("Sunrise 03:43, sunset 20:21 UTC");
    expect(sunSummary(sunDay(69.65, 18.96, "2026-06-21"), "UTC", { style: "24", mark: "UTC" })).toBe("The sun does not set");
  });

  it("keep the polar wording on the 12-hour clock", () => {
    const rows = (lat: number, lon: number, date: string, zone: string) => {
      const day = sunDay(lat, lon, date);
      return Object.fromEntries(
        sunRows(day, dayLengthChange(lat, lon, date), moonPhase(day.noon), zone, { style: "12" }).map((row) => [row.key, row]),
      );
    };
    // Midnight sun and polar night are words either way; the times that remain change style.
    const midsummer = rows(69.65, 18.96, "2026-06-21", "UTC");
    expect(midsummer.sun?.value).toBe("Does not set on this date (midnight sun)");
    expect(midsummer.noon?.value).toBe("10:46 am");
    const midwinter = rows(69.65, 18.96, "2026-12-21", "UTC");
    expect(midwinter.sun?.value).toBe("Does not rise on this date (polar night)");
    expect(midwinter["first-light"]?.value).toBe("8:31 am");
    expect(midwinter["last-light"]?.value).toBe("12:53 pm");
    // Longyearbyen in the polar night: a couple of hours of nautical twilight before solar noon by the UTC clock.
    expect(rows(78.22, 15.63, "2026-12-21", "UTC").nautical?.value).toMatch(/^\d{1,2}:\d\d am to \d{1,2}:\d\d [ap]m$/);
    // The edge of the midnight sun, where a sunrise falls just before midnight on the day before.
    const first = rows(69.65, 18.96, "2026-05-18", "Etc/GMT-1");
    expect(first.sunrise?.value).toMatch(/^11:5\d pm on 17 May$/);
    expect(first.sunset?.value).toBe("Does not set tonight");
    const last = rows(69.65, 18.96, "2026-07-25", "Etc/GMT-1");
    expect(last.sunrise?.value).toBe("Already up: it did not set the night before");
    expect(last.sunset?.value).toMatch(/^11:3\d pm$/);
    expect(sunSummary(sunDay(69.65, 18.96, "2026-07-25"), "Etc/GMT-1", { style: "12" })).toMatch(/^Sunset 11:3\d pm$/);
    // Trondheim at midsummer: the sun rises a little after one in the morning, and twilight never ends.
    const trondheim = rows(63.43, 10.39, "2026-06-21", "UTC");
    expect(trondheim.light?.value).toBe("Twilight lasts all night");
    expect(trondheim.sunrise?.value).toBe("1:02 am");
    expect(trondheim.sunset?.value).toBe("9:38 pm");
  });

  it("never print a blank or an invalid time on the 12-hour clock either, and never an hour nought or thirteen", () => {
    for (const lat of [-90, -66.6, 0, 66.6, 70, 90]) {
      for (const lon of [-180, 0, 180]) {
        for (let day = 0; day < 366; day += 13) {
          const date = new Date(Date.UTC(2028, 0, 1 + day)).toISOString().slice(0, 10);
          const sun = sunDay(lat, lon, date);
          const text = [
            sunSummary(sun, "Pacific/Fiji", { style: "12" }),
            ...sunRows(sun, dayLengthChange(lat, lon, date), moonPhase(sun.noon), "Pacific/Fiji", { style: "12" }).map((row) => row.value),
          ].join(" | ");
          expect(text, `${lat}, ${lon} on ${date}`).not.toMatch(/NaN|Invalid|undefined|null|Infinity/);
          // Every clock time in it is 1 to 12, two-digit minutes, then am or pm.
          for (const time of text.match(/\d{1,2}:\d\d(?: [ap]m)?/g) ?? []) {
            expect(time, `${text}`).toMatch(/^(1[0-2]|[1-9]):[0-5]\d [ap]m$/);
          }
        }
      }
    }
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

describe("the times laid out to be read at arm's length", () => {
  const layoutOf = (lat: number, lon: number, date: string, zone: string, writing?: Parameters<typeof sunRows>[4]) => {
    const day = sunDay(lat, lon, date);
    return sunLayout(sunRows(day, dayLengthChange(lat, lon, date), moonPhase(day.noon), zone, writing));
  };

  it("puts sunrise and sunset first, first and last light next, and everything else in the list after", () => {
    const layout = layoutOf(51.48, 0, "2026-06-21", "Europe/London");
    expect(layout.main.map((row) => [row.label, row.value])).toEqual([
      ["Sunrise", "04:43"],
      ["Sunset", "21:21"],
    ]);
    expect(layout.light.map((row) => [row.label, row.value])).toEqual([
      ["First light (civil dawn)", "03:55"],
      ["Last light (civil dusk)", "22:09"],
    ]);
    expect(layout.rest.map((row) => row.label)).toEqual([
      "Solar noon",
      "Sunrise bearing",
      "Sunset bearing",
      "Day length",
      "Nautical twilight",
      "Moon",
    ]);
  });

  it("moves the bearings out of the two large times into rows of their own, losing nothing", () => {
    const layout = layoutOf(51.48, 0, "2026-06-21", "Europe/London");
    expect(layout.main.every((row) => row.detail === undefined)).toBe(true);
    const rest = Object.fromEntries(layout.rest.map((row) => [row.key, row]));
    expect(rest["sunrise-bearing"]?.value).toBe("49° NE");
    expect(rest["sunset-bearing"]?.value).toBe("311° NW");
    expect(rest.noon).toMatchObject({ value: "13:02", detail: "sun 62° up" });
    expect(rest["day-length"]).toMatchObject({ value: "16 h 38 min", detailBelow: true });
  });

  it("gives each single time in pieces, so the figures can be set large and the rest small", () => {
    const [sunrise] = layoutOf(51.48, 0, "2026-06-21", "Europe/London", { style: "12" }).main;
    expect(sunrise?.clock).toEqual({ time: "4:43 am" });
    const [utc] = layoutOf(51.48, 0, "2026-06-21", "UTC", { style: "24", mark: "UTC" }).main;
    expect(utc?.clock).toEqual({ time: "03:43", mark: "UTC" });
    // Suva's sunrise on its 20 March is the evening of the 19th in London.
    const [suva] = layoutOf(-18.14, 178.44, "2026-03-20", "Europe/London").main;
    expect(suva?.clock).toEqual({ time: "18:10", day: "19 Mar" });
    expect(suva?.value).toBe("18:10 on 19 Mar");
    expect(clockPartsText({ time: "03:43", mark: "UTC", day: "19 Mar" })).toBe("03:43 UTC on 19 Mar");
  });

  it("has no pieces for a value that is words or two times, which are never set as one large figure", () => {
    const summer = layoutOf(69.65, 18.96, "2026-06-21", "UTC");
    expect(summer.main).toEqual([{ key: "sun", label: "Sun", value: "Does not set on this date (midnight sun)" }]);
    expect(summer.light).toEqual([]);
    expect(summer.rest.map((row) => row.key)).toEqual(["noon", "day-length", "moon"]);
    const winter = layoutOf(69.65, 18.96, "2026-12-21", "UTC");
    expect(winter.main.map((row) => row.clock)).toEqual([undefined]);
    expect(winter.light.map((row) => row.key)).toEqual(["first-light", "last-light"]);
    const greenwich = layoutOf(51.48, 0, "2026-06-21", "UTC");
    expect(greenwich.rest.find((row) => row.key === "nautical")?.clock).toBeUndefined();
  });

  it("keeps every row of the section, whatever the day, anywhere on Earth", () => {
    for (const lat of [-90, -66.6, 0, 51.48, 66.6, 69.65, 90]) {
      for (let step = 0; step < 366; step += 13) {
        const date = new Date(Date.UTC(2028, 0, 1 + step)).toISOString().slice(0, 10);
        const day = sunDay(lat, 18.96, date);
        const rows = sunRows(day, dayLengthChange(lat, 18.96, date), moonPhase(day.noon), "UTC");
        const layout = sunLayout(rows);
        const bearings = rows.filter((row) => ["sunrise", "sunset"].includes(row.key) && row.detail).length;
        expect(layout.main.length + layout.light.length + layout.rest.length, `${lat} on ${date}`).toBe(rows.length + bearings);
        expect(layout.main.length, `${lat} on ${date}`).toBeGreaterThanOrEqual(1);
      }
    }
  });
});

describe("the line that is always on the screen", () => {
  it("gives sunrise and sunset as two short pieces, in the clock asked for", () => {
    const day = sunDay(51.48, 0, "2026-06-21");
    expect(sunGlance(day, "Europe/London")).toEqual(["Sunrise 04:43", "Sunset 21:21"]);
    expect(sunGlance(day, "Europe/London", { style: "12" })).toEqual(["Sunrise 4:43 am", "Sunset 9:21 pm"]);
  });

  it("says in words when there is no sunrise or sunset to give", () => {
    expect(sunGlance(sunDay(69.65, 18.96, "2026-06-21"), "UTC")).toEqual(["The sun does not set"]);
    expect(sunGlance(sunDay(69.65, 18.96, "2026-12-21"), "UTC")).toEqual(["The sun does not rise"]);
    // The last day before the midnight sun: it rises, and does not set.
    const edge = sunGlance(sunDay(69.65, 18.96, "2026-07-25"), "Etc/GMT-1");
    expect(edge).toHaveLength(2);
    expect(edge.join(" ")).not.toMatch(/NaN|null|undefined/);
  });
});
