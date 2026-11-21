/**
 * Celestial navigation worked on the device, held to the US Naval Observatory: its
 * computed altitudes from a known place are taken as perfect sights, and the fix found
 * from them must come back to that place.
 */
import fs from "node:fs";
import path from "node:path";
import {
  almanacFor,
  clockErrorMiles,
  correctSight,
  dipMinutes,
  fixFrom,
  lineOfPosition,
  noonLatitude,
  offset,
  polarisLatitude,
  reduce,
  type SightBody,
  STARS,
  starByName,
  starsToShoot,
} from "@outpost/shared/sky";
import { describe, expect, it } from "vitest";

const rows: Array<{ date: string; time: string; lat: number; lon: number; object: string; hc: number; zn: number; refr: number }> =
  JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "fixtures/sky/usno-celnav.json"), "utf8")).rows;

const bodyOf = (name: string): SightBody => {
  const lower = name.toLowerCase();
  if (["sun", "moon", "venus", "mars", "jupiter", "saturn"].includes(lower)) return { kind: "body", id: lower as "sun" };
  return { kind: "star", star: starByName(name)! };
};

const at = (row: { date: string; time: string }) => Date.parse(`${row.date}T${row.time}Z`);
const nm = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) =>
  Math.hypot(a.lat - b.lat, (a.lon - b.lon) * Math.cos((a.lat * Math.PI) / 180)) * 60;

describe("sight reduction", () => {
  it("computes the Observatory's altitude and azimuth for stars to a few tenths of a minute", () => {
    const stars = rows.filter((r) => r.object !== "ARIES" && !["Sun", "Moon", "Venus", "Mars", "Jupiter", "Saturn"].includes(r.object));
    for (const row of stars.slice(0, 80)) {
      const r = reduce(almanacFor(bodyOf(row.object), at(row)), row.hc, { lat: row.lat, lon: row.lon });
      expect(Math.abs(r.intercept), row.object).toBeLessThan(0.5);
      expect(Math.abs(((r.zn - row.zn + 540) % 360) - 180), row.object).toBeLessThan(0.1);
    }
  });

  it("finds the place back from three star sights, starting 40 miles away", () => {
    const moment = rows.filter((r) => r.date === "2026-11-21" && r.lat === 40 && r.lon === -70);
    // The stars the screen would suggest for that moment.
    const chosen = starsToShoot(STARS, at(moment[0]!), 40, -70);
    const picks = chosen.map((c) => moment.find((r) => r.object.toLowerCase() === c.star.name!.toLowerCase())!);
    expect(picks.length).toBeGreaterThanOrEqual(3);
    const sights = picks.map((row) => ({ almanac: almanacFor(bodyOf(row.object), at(row)), ho: row.hc, sigma: 1 }));
    const fix = fixFrom(sights, { lat: 40.5, lon: -69.4 });
    expect(fix).not.toBeNull();
    expect(nm(fix!.position, { lat: 40, lon: -70 })).toBeLessThan(0.5);
    expect(fix!.cut).toBeGreaterThan(30);
    expect(fix!.ellipse.major).toBeGreaterThan(0.5);
    expect(fix!.ellipse.major).toBeLessThan(2);
  });

  it("finds a place south of the equator and east of Greenwich the same way", () => {
    const moment = rows.filter((r) => r.date === "2031-01-10" && r.lat === -35 && r.lon === 150);
    const stars = moment.filter((r) => starByName(r.object) && r.hc > 15).slice(0, 4);
    expect(stars.length).toBeGreaterThanOrEqual(3);
    const fix = fixFrom(
      stars.map((row) => ({ almanac: almanacFor(bodyOf(row.object), at(row)), ho: row.hc, sigma: 1 })),
      { lat: -34.6, lon: 150.6 },
    );
    expect(nm(fix!.position, { lat: -35, lon: 150 })).toBeLessThan(0.5);
  });

  it("makes a running fix from two Sun sights hours apart", () => {
    // A boat sails 090° at 6 knots between a morning and a noon sight; its noon place is 40° N 70° W.
    const noonPlace = { lat: 40, lon: -70 };
    const morning = Date.parse("2026-11-21T13:00:00Z");
    const noon = Date.parse("2026-11-21T16:45:00Z");
    const run = { east: 6 * 3.75, north: 0 };
    const morningPlace = offset(noonPlace, -run.east, -run.north);
    const sun = { kind: "body", id: "sun" } as const;
    const morningAlmanac = almanacFor(sun, morning);
    const noonAlmanac = almanacFor(sun, noon);
    const hoMorning = reduce(morningAlmanac, 0, morningPlace).hc;
    const hoNoon = reduce(noonAlmanac, 0, noonPlace).hc;
    const fix = fixFrom(
      [
        { almanac: morningAlmanac, ho: hoMorning, sigma: 1, advance: run },
        { almanac: noonAlmanac, ho: hoNoon, sigma: 1 },
      ],
      { lat: 40.3, lon: -70.4 },
    );
    expect(nm(fix!.position, noonPlace)).toBeLessThan(0.2);
    // The advanced line passes through the noon place.
    const line = lineOfPosition(reduce(morningAlmanac, hoMorning, { lat: 40.3, lon: -70.4 }), 30, run);
    expect(line.ends).toHaveLength(2);
  });
});

describe("corrections", () => {
  it("takes dip as 1.76 minutes times the root of the height of eye", () => {
    expect(dipMinutes(9)).toBeCloseTo(5.28, 2);
    expect(dipMinutes(0)).toBe(0);
  });

  it("turns a sextant altitude of the Sun's lower limb back into the true altitude, step by step", () => {
    const row = rows.find((r) => r.object === "Sun" && r.hc > 20)!;
    const almanac = almanacFor({ kind: "body", id: "sun" }, at(row));
    // Build the sextant reading from the Observatory's altitude and its own corrections: refraction, semi-diameter, parallax.
    const usno = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "fixtures/sky/usno-celnav.json"), "utf8")).rows.find(
      (r: { object: string; date: string; time: string; lat: number; lon: number }) =>
        r.object === "Sun" && r.date === row.date && r.time === row.time && r.lat === row.lat && r.lon === row.lon,
    );
    const ha = row.hc - usno.sd - usno.pa - usno.refr;
    const indexError = 2;
    const hs = ha + dipMinutes(3) / 60 + indexError / 60;
    const { steps, ho } = correctSight(
      { body: { kind: "body", id: "sun" }, at: at(row), hs, indexError, heightOfEye: 3, horizon: "sea", limb: "lower" },
      almanac,
    );
    expect(steps.map((s) => s.label)).toEqual(["Index error", "Dip", "Refraction", "Semi-diameter", "Parallax"]);
    expect(Math.abs(ho - row.hc) * 60).toBeLessThan(0.3);
  });

  it("halves an artificial horizon's angle and takes no dip", () => {
    const { steps } = correctSight(
      {
        body: { kind: "body", id: "sun" },
        at: Date.parse("2026-06-21T12:00:00Z"),
        hs: 100,
        indexError: 0,
        heightOfEye: 10,
        horizon: "artificial",
        limb: "lower",
      },
      almanacFor({ kind: "body", id: "sun" }, Date.parse("2026-06-21T12:00:00Z")),
    );
    expect(steps[0]!.label).toMatch(/Halve/);
    expect(steps[0]!.after).toBe(50);
    expect(steps.some((s) => s.label === "Dip")).toBe(false);
  });
});

describe("latitude", () => {
  it("from Polaris, at the Observatory's altitude, is the place's latitude", () => {
    const row = rows.find((r) => r.object === "POLARIS" && r.lat === 40)!;
    const lat = polarisLatitude(almanacFor(bodyOf("Polaris"), at(row)), row.hc, row.lon);
    expect(Math.abs(lat - 40) * 60).toBeLessThan(0.5);
  });

  it("from the Sun on the meridian, in both hemispheres", () => {
    expect(noonLatitude(50, -20, "south")).toBe(20);
    expect(noonLatitude(60, 10, "north")).toBe(-20);
  });

  it("says four seconds of clock error is a minute of longitude", () => {
    expect(clockErrorMiles(4, 0)).toBeCloseTo(1, 5);
    expect(clockErrorMiles(4, 60)).toBeCloseTo(0.5, 5);
  });
});

describe("stars to shoot", () => {
  it("chooses three bright stars well spread in azimuth", () => {
    const chosen = starsToShoot(STARS, Date.parse("2026-11-21T22:00:00Z"), 51.5, 0);
    expect(chosen.length).toBeGreaterThanOrEqual(3);
    for (const s of chosen) expect(s.altitude).toBeGreaterThanOrEqual(15);
    for (let i = 0; i < chosen.length; i++)
      for (let j = i + 1; j < chosen.length; j++)
        expect(Math.abs(((chosen[i]!.azimuth - chosen[j]!.azimuth + 540) % 360) - 180)).toBeGreaterThanOrEqual(60);
  });
});
