/** Sun times on paper: the same times as the Sun section, to the minute, and what the page says about them. */
import { describe, expect, it } from "vitest";
import type { Block } from "@/features/propagation/plans/document";
import { moonPhase } from "./moon";
import { dayLengthChange, sunDay } from "./sun";
import { dayCells, type SunSheetInput, spanDays, spanWords, sunDocument, sunSheets, sunTitle } from "./sun-document";
import { type ClockWriting, sunRows } from "./sun-text";

const words = (blocks: Block[]) =>
  blocks
    .flatMap((block) =>
      block.kind === "table"
        ? [block.head.join(" | "), ...block.rows.map((row) => row.join(" | "))]
        : block.kind === "list"
          ? block.items
          : block.kind === "drawing"
            ? []
            : [block.text],
    )
    .join("\n");

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
    const text = words(sunDocument({ ...london, place: { lat: 69.6492, lon: 18.9553 }, date: "2026-06-21" }));
    for (const word of ['"up all day"', '"no sunset"', '"none"', '"all night"']) expect(text).toContain(word);
  });

  it("names the place, its position, the days and the clock, and has a line for every day in order", () => {
    const blocks = sunDocument(london);
    const text = words(blocks);
    expect(blocks[0]).toEqual({ kind: "title", text: "Sun times: 51°30'27\"N 0°07'40\"W" });
    expect(text).toContain(
      "At 51°30'27\"N 0°07'40\"W (51.50740, -0.12780), Maidenhead locator IO91WM. 14 days, 16 November 2026 to 29 November 2026.",
    );
    expect(text).toContain(
      "Times are on the clock of the device that made this sheet: time zone Europe/London, UTC+0, on the 24-hour clock.",
    );
    const rows = blocks.flatMap((block) => (block.kind === "table" ? block.rows : []));
    expect(rows.map((row) => row[0])).toEqual(
      spanDays("2026-11-16", "fortnight").map((date) =>
        new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(
          new Date(`${date}T00:00:00Z`),
        ),
      ),
    );
    expect(rows[0]![0]).toBe("Mon 16 Nov");
    // The screen's own words about what the times assume.
    expect(text).toContain(
      "For a flat horizon at sea level, to about a minute; hills make sunrise later and sunset earlier. In the far north and south it can be several minutes out.",
    );
    expect(text).toContain("0.833°");
    expect(text).toContain("Made in Outpost on 16 November 2026.");
    expect(sunTitle(london)).toBe("Sun times, 51°30'27\"N 0°07'40\"W, 14 days from 16 Nov 2026");
    expect(sunTitle({ ...london, place: { ...london.place, name: "Helvellyn" }, span: "month" })).toBe(
      "Sun times, Helvellyn, November 2026",
    );
  });

  it("says where the clock changes, writes UTC as UTC, and warns when the place keeps another zone's time", () => {
    const march = words(sunDocument({ ...london, date: "2026-03-10", span: "month" }));
    expect(march).toContain("time zone Europe/London, UTC+0, then UTC+1 from 29 Mar 2026, on the 24-hour clock.");
    const utc = words(sunDocument({ ...london, utc: true, style: "12" }));
    expect(utc).toContain("Times are in UTC, on the 24-hour clock.");
    expect(utc).not.toMatch(/\d (am|pm)\b/);
    const twelve = words(sunDocument({ ...london, style: "12" }));
    expect(twelve).toMatch(/\| \d{1,2}:\d\d am \|/);
    const far = words(sunDocument({ ...london, place: { lat: -41.2865, lon: 174.7762 } }));
    expect(far).toContain("By the sun, this place runs about 12 hours ahead of that time zone");
  });

  it("covers two weeks, the month or the year, a table to each month, on a page or a few", () => {
    expect(spanDays("2026-11-16", "fortnight")).toHaveLength(14);
    expect(spanDays("2026-11-16", "month")[0]).toBe("2026-11-01");
    expect(spanDays("2026-11-16", "month")).toHaveLength(30);
    expect(spanDays("2028-02-10", "month")).toHaveLength(29);
    expect(spanDays("2026-11-16", "year")).toHaveLength(365);
    expect(spanDays("2028-11-16", "year")).toHaveLength(366);
    expect(spanWords("2026-11-16", "year")).toBe("2026");
    expect(sunSheets(london)).toHaveLength(1);
    expect(sunSheets({ ...london, span: "month" })).toHaveLength(1);
    const year = sunSheets({ ...london, span: "year" }, "letter");
    expect(year.length).toBeGreaterThan(3);
    expect(year.length).toBeLessThanOrEqual(8);
    const headings = (input: SunSheetInput) =>
      sunDocument(input).flatMap((block) => (block.kind === "heading" && /\d{4}$/.test(block.text) ? [block.text] : []));
    expect(headings({ ...london, span: "year" })).toEqual(["2026"]);
    expect(headings({ ...london, date: "2026-11-25" })).toEqual(["November 2026", "December 2026"]);
  });
});
