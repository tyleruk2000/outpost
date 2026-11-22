/** Sun times on paper: the same times as the Sun section, to the minute, and what the page says about them. */
import { describe, expect, it } from "vitest";
import { moonPhase } from "./moon";
import { dayLengthChange, sunDay } from "./sun";
import { dayCells, type SunSheetInput, spanDays, spanWords, sunTitle } from "./sun-document";
import { type ClockWriting, sunRows } from "./sun-text";

const london: SunSheetInput = {
  place: { lat: 51.5074, lon: -0.1278, coordinates: "51°30′27″N 0°07′40″W" },
  date: "2026-11-16",
  span: "fortnight",
  zone: "Europe/London",
  utc: false,
  style: "24",
  made: "2026-11-16",
};

/** The row of the Sun section for a time, as the screen writes it, with the "UTC" after it taken off: the page says it once. */
function screenTimes(lat: number, lon: number, date: string, zone: string, writing: ClockWriting) {
  const day = sunDay(lat, lon, date);
  const rows = sunRows(day, dayLengthChange(lat, lon, date), moonPhase(day.noon), zone, writing);
  const value = (key: string) => rows.find((row) => row.key === key)?.value.replace(" UTC", "");
  return { day, value, rows };
}

describe("sun times on paper", () => {
  const places = [
    { name: "London", lat: 51.5074, lon: -0.1278, zone: "Europe/London" },
    { name: "New York", lat: 40.7128, lon: -74.006, zone: "America/New_York" },
    { name: "Hobart", lat: -42.8821, lon: 147.3272, zone: "Australia/Hobart" },
    // Far from the device's zone, so that some times fall on another date on its clock.
    { name: "Wellington, on a London clock", lat: -41.2865, lon: 174.7762, zone: "Europe/London" },
    { name: "Tromsø", lat: 69.6492, lon: 18.9553, zone: "Europe/Oslo" },
  ];
  const dates = ["2026-03-29", "2026-06-21", "2026-11-16", "2026-12-21", "2026-05-25", "2026-07-25"];

  it("gives every time the Sun section gives, to the minute, on each clock", () => {
    let compared = 0;
    for (const place of places)
      for (const date of dates)
        for (const [zone, writing] of [
          [place.zone, { style: "24" }],
          [place.zone, { style: "12" }],
          ["UTC", { style: "24", mark: "UTC" }],
        ] as Array<[string, ClockWriting]>) {
          const { day, value } = screenTimes(place.lat, place.lon, date, zone, writing);
          const [firstLight, sunrise, noon, sunset, lastLight, length] = dayCells(day, zone, writing);
          expect(noon, `${place.name} ${date} noon`).toBe(value("noon"));
          if (value("first-light") && /\d/.test(value("first-light")!)) expect(firstLight).toBe(value("first-light"));
          if (value("sunrise") && /\d/.test(value("sunrise")!)) expect(sunrise).toBe(value("sunrise"));
          if (value("sunset") && /\d/.test(value("sunset")!)) expect(sunset).toBe(value("sunset"));
          if (value("last-light") && /\d/.test(value("last-light")!)) expect(lastLight).toBe(value("last-light"));
          if (day.sun.kind === "crosses") expect(length).toBe(value("day-length"));
          compared += 1;
        }
    expect(compared).toBe(places.length * dates.length * 3);
    // A time that falls on another date on this clock says so, as the screen does.
    const wellington = screenTimes(-41.2865, 174.7762, "2026-11-16", "Europe/London", { style: "24" });
    expect(dayCells(wellington.day, "Europe/London", { style: "24" })[1]).toMatch(/^\d\d:\d\d on 15 Nov$/);
  });

  it("says in a word what the sun does on a day with no sunrise or no night", () => {
    // Tromsø: the midnight sun in June, the polar night in December.
    expect(dayCells(sunDay(69.6492, 18.9553, "2026-06-21"), "UTC", { style: "24" })).toEqual([
      "-",
      "up all day",
      expect.any(String),
      "no sunset",
      "-",
      "24 h",
    ]);
    const december = dayCells(sunDay(69.6492, 18.9553, "2026-12-21"), "UTC", { style: "24" });
    expect(december[1]).toBe("no sunrise");
    expect(december[3]).toBe("-");
    expect(december[5]).toBe("none");
    // Far enough north that the sun stays more than 6° down at midwinter.
    expect(dayCells(sunDay(78.2232, 15.6267, "2026-12-21"), "UTC", { style: "24" })[0]).toBe("none");
  });

  it("names the sheet by its place, or its position, and its span", () => {
    expect(sunTitle(london)).toBe("Sun times, 51°30'27\"N 0°07'40\"W, 14 days from 16 Nov 2026");
    expect(sunTitle({ ...london, place: { ...london.place, name: "Helvellyn" }, span: "month" })).toBe(
      "Sun times, Helvellyn, November 2026",
    );
  });

  it("covers two weeks, the month or the year", () => {
    expect(spanDays("2026-11-16", "fortnight")).toHaveLength(14);
    expect(spanDays("2026-11-16", "month")[0]).toBe("2026-11-01");
    expect(spanDays("2026-11-16", "month")).toHaveLength(30);
    expect(spanDays("2028-02-10", "month")).toHaveLength(29);
    expect(spanDays("2026-11-16", "year")).toHaveLength(365);
    expect(spanDays("2028-11-16", "year")).toHaveLength(366);
    expect(spanWords("2026-11-16", "year")).toBe("2026");
  });
});
