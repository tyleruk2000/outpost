/**
 * Each publisher's answer, read from a small recorded copy in its real format
 * (test/fixtures/weather, fetched by hand on 16 November 2026 for public places and
 * trimmed). Nothing here touches the internet.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  eaTime,
  londonTime,
  parseEaFloods,
  parseEaStation,
  parseEaStations,
  parseMetOfficeWarnings,
  parseNasaPower,
  parseOpenMeteo,
  parsePvgis,
  readValidity,
  SourceFormatError,
} from "../src/modules/weather/parsers.ts";

const fixture = (name: string) => fs.readFileSync(path.join(import.meta.dirname, "fixtures/weather", name), "utf8");

describe("Open-Meteo's forecast", () => {
  it("reads every hour and day, in UTC, and says when it runs out", () => {
    const { data, validFrom, validUntil } = parseOpenMeteo(fixture("open-meteo-forecast.json"));
    expect(data.hours).toHaveLength(48);
    expect(data.days).toHaveLength(3);
    expect(data.hours[0]).toMatchObject({ t: Date.UTC(2026, 10, 16, 0) });
    expect(validFrom).toBe(Date.UTC(2026, 10, 16, 0));
    // The last hour is 23:00 on the 17th; the forecast covers it to its end.
    expect(validUntil).toBe(Date.UTC(2026, 10, 18, 0));
    expect(data.days[1]).toMatchObject({ date: "2026-11-17", code: 63, maxC: 12.5, minC: 5.1, precipMm: 15.2, precipChance: 100 });
    expect(data.model).toContain("Met Office UKV");
    expect(data.gridLat).toBeCloseTo(51.49, 1);
    for (const hour of data.hours) {
      expect(typeof hour.tempC).toBe("number");
      expect(hour.pressureHpa).toBeGreaterThan(900);
    }
  });

  it("keeps a missing figure as no figure, not nought", () => {
    const body = JSON.parse(fixture("open-meteo-forecast.json"));
    body.hourly.temperature_2m[3] = null;
    body.hourly.wind_gusts_10m[4] = "fast";
    const { data } = parseOpenMeteo(JSON.stringify(body));
    expect(data.hours[3]!.tempC).toBeNull();
    expect(data.hours[4]!.gustKmh).toBeNull();
  });

  it("refuses what is not a forecast, and passes on the service's own refusal", () => {
    expect(() => parseOpenMeteo("<html>")).toThrow(SourceFormatError);
    expect(() => parseOpenMeteo(JSON.stringify({ hourly: {} }))).toThrow(/no hours/);
    expect(() => parseOpenMeteo(JSON.stringify({ error: true, reason: "Latitude must be in range of -90 to 90°." }))).toThrow(
      /refused the request: Latitude must be/,
    );
  });
});

describe("the Met Office's warnings feed", () => {
  it("keeps the publisher's words unaltered, and reads the level, region and period from them", () => {
    const { data } = parseMetOfficeWarnings(fixture("met-office-uk.xml"));
    expect(data.feedTitle).toBe("Met Office warnings for UK");
    expect(data.publishedAt).toBe(Date.UTC(2026, 10, 16, 10, 1, 1));
    expect(data.items).toHaveLength(3);
    const first = data.items[0]!;
    expect(first.title).toBe("Yellow warning of snow affecting Dumfries, Galloway, Lothian & Borders");
    expect(first.description).toBe(
      "Yellow warning of snow affecting Dumfries, Galloway, Lothian & Borders: Dumfries and Galloway, Midlothian Council, Scottish Borders valid from 0000 Tue 17 Nov to 1100 Tue 17 Nov",
    );
    expect(first.level).toBe("yellow");
    expect(first.region).toBe("Dumfries, Galloway, Lothian & Borders");
    // November is GMT: UK time is UTC.
    expect(first.validFrom).toBe(Date.UTC(2026, 10, 17, 0, 0));
    expect(first.validUntil).toBe(Date.UTC(2026, 10, 17, 11, 0));
    expect(first.link).toMatch(/^https:\/\/www\.metoffice\.gov\.uk\/weather\/warnings-and-advice\/uk-warnings#/);
    expect(data.items.map((item) => item.region)).toEqual(["Dumfries, Galloway, Lothian & Borders", "East Midlands", "North East England"]);
  });

  it("reads a region's feed with no warnings in it as none", () => {
    const { data } = parseMetOfficeWarnings(fixture("met-office-se-empty.xml"));
    expect(data.items).toEqual([]);
    expect(data.feedTitle).toBe("Met Office warnings for London & South East England");
  });

  it("refuses what is not the feed, including XML with a declaration in it", () => {
    expect(() => parseMetOfficeWarnings("<html><body>Maintenance</body></html>")).toThrow(SourceFormatError);
    expect(() => parseMetOfficeWarnings("not xml")).toThrow(SourceFormatError);
    expect(() => parseMetOfficeWarnings('<!DOCTYPE rss [<!ENTITY x SYSTEM "file:///etc/passwd">]><rss><channel/></rss>')).toThrow(
      SourceFormatError,
    );
  });

  it("reads a period in British Summer Time, and one across the new year", () => {
    const june = readValidity("valid from 0600 Sat 20 Jun to 2100 Sat 20 Jun", Date.UTC(2026, 5, 19));
    expect(june).toEqual({ from: Date.UTC(2026, 5, 20, 5), until: Date.UTC(2026, 5, 20, 20) });
    const newYear = readValidity("valid from 1800 Thu 31 Dec to 1200 Fri 01 Jan", Date.UTC(2026, 11, 30));
    expect(newYear).toEqual({ from: Date.UTC(2026, 11, 31, 18), until: Date.UTC(2027, 0, 1, 12) });
    // Published in December about January: next year.
    expect(readValidity("valid from 0000 Sat 02 Jan to 1200 Sat 02 Jan", Date.UTC(2026, 11, 31))?.from).toBe(Date.UTC(2027, 0, 2, 0));
    expect(readValidity("in force for a while", Date.now())).toBeNull();
  });

  it("turns UK clock times into moments either side of the change to summer time", () => {
    // The clocks went forward at 01:00 UTC on 29 March 2026.
    expect(londonTime(2026, 2, 29, 0, 30)).toBe(Date.UTC(2026, 2, 29, 0, 30));
    expect(londonTime(2026, 2, 29, 3, 0)).toBe(Date.UTC(2026, 2, 29, 2, 0));
    expect(londonTime(2026, 9, 26, 12, 0)).toBe(Date.UTC(2026, 9, 26, 12, 0));
  });
});

describe("the Environment Agency's flood-monitoring API", () => {
  it("reads flood warnings in the publisher's words, most severe first", () => {
    const warnings = parseEaFloods(fixture("ea-floods.json"));
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({
      id: "111WATCHXH",
      area: "Christchurch Harbour",
      severity: "Flood alert",
      severityLevel: 3,
      riverOrSea: "English Channel",
      isTidal: true,
      raisedAt: Date.UTC(2026, 10, 16, 16, 6, 17),
    });
    expect(warnings[0]!.message).toMatch(/^Higher than normal tides tomorrow morning may lead to flooding\./);
  });

  it("reads stations and one station's latest level with its typical range", () => {
    const stations = parseEaStations(fixture("ea-stations.json"));
    expect(stations.map((station) => station.id).sort()).toEqual(["E21046", "E21609", "E26141"]);
    const bedford = stations.find((station) => station.id === "E21609")!;
    expect(bedford).toMatchObject({ label: "Bedford", river: "River Great Ouse" });
    const full = parseEaStation(fixture("ea-station-E21609.json"), bedford, 2.4);
    expect(full.latest).toEqual({ value: 0.29, unit: "mASD", at: Date.UTC(2026, 10, 16, 16, 0) });
    expect(full).toMatchObject({ typicalLow: 0.252, typicalHigh: 0.524, distanceKm: 2.4 });
    expect(full.highestRecent).toEqual({ value: 0.981, at: Date.UTC(2014, 1, 10, 0, 0) });
  });

  it("reads times with no zone as UK times and with Z as UTC", () => {
    expect(eaTime("2026-07-01T12:00:00")).toBe(Date.UTC(2026, 6, 1, 11, 0));
    expect(eaTime("2026-07-01T12:00:00Z")).toBe(Date.UTC(2026, 6, 1, 12, 0));
    expect(eaTime("yesterday")).toBeNull();
  });

  it("refuses what is not a list", () => {
    expect(() => parseEaFloods("{}")).toThrow(SourceFormatError);
    expect(() => parseEaStations("[]")).toThrow(SourceFormatError);
  });
});

describe("NASA POWER's climatology", () => {
  it("reads the twelve months and the period averaged", () => {
    const { data } = parseNasaPower(fixture("nasa-power-climatology.json"));
    expect(data.period).toBe("25-year Meteorological and Solar Monthly & Annual Climatologies (January 2001 - December 2025)");
    expect(data.months).toHaveLength(12);
    expect(data.months[0]).toEqual({ meanC: 4.14, precipMmPerDay: 2.1, precipMmMonth: 65.1, windMs: 5.78, sunKwhLevel: 0.8366 });
    // February: a day's mean times 28.
    expect(data.months[1]!.precipMmMonth).toBe(53.8);
  });

  it("reads the fill value as no figure", () => {
    const body = JSON.parse(fixture("nasa-power-climatology.json"));
    body.properties.parameter.T2M.JUL = -999;
    expect(parseNasaPower(JSON.stringify(body)).data.months[6]!.meanC).toBeNull();
  });

  it("passes on what NASA POWER said when it sends no averages", () => {
    expect(() => parseNasaPower(JSON.stringify({ messages: ["Latitude out of range."] }))).toThrow(/It said: Latitude out of range/);
  });
});

describe("PVGIS's monthly radiation", () => {
  it("averages each month over the years, a day at a time", () => {
    const { data } = parsePvgis(fixture("pvgis-mrcalc.json"));
    expect(data).toMatchObject({ firstYear: 2014, lastYear: 2015, optimalSlope: 39, databases: "PVGIS-SARAH3 and ERA5" });
    const rows = JSON.parse(fixture("pvgis-mrcalc.json")).outputs.monthly as Array<Record<string, number>>;
    const january = rows.filter((row) => row.month === 1);
    const expected = january.reduce((sum, row) => sum + row["H(i_opt)_m"]! / 31, 0) / january.length;
    expect(data.optimal[0]).toBeCloseTo(expected, 2);
    // 2014 January on level ground: 28.15 kWh/m² over 31 days.
    expect(data.level[0]).toBeGreaterThan(0.8);
    expect(data.level).toHaveLength(12);
    expect(data.optimal.every((value) => value !== null && value > 0)).toBe(true);
  });

  it("passes on PVGIS's own message", () => {
    expect(() => parsePvgis(JSON.stringify({ message: "Location over the sea. Please, check your input." }))).toThrow(
      /Location over the sea/,
    );
  });
});
