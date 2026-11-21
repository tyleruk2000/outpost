/**
 * The almanac worked out on the device, held to the US Naval Observatory's: the Greenwich
 * hour angle and declination of the Sun, Moon, planets and navigational stars at five
 * moments from 2026 to 2035 (fixtures/sky/usno-celnav.json), and moonrise, moonset and
 * the Moon's phase for seven places (fixtures/sky/usno-moon.json). The limits asserted
 * here are the accuracy the night-sky and celestial navigation screens state.
 */
import fs from "node:fs";
import path from "node:path";
import {
  almanacFor,
  bodyPlace,
  CONSTELLATION_FIGURES,
  ghaAries,
  moonRiseSet,
  moonState,
  NAVIGATIONAL_STARS,
  nextPhases,
  norm180,
  starByHr,
  starByName,
  starPlaceOfDate,
} from "@outpost/shared/sky";
import { describe, expect, it } from "vitest";

interface CelnavRow {
  date: string;
  time: string;
  lat: number;
  lon: number;
  object: string;
  gha: number;
  dec: number | null;
  hc: number;
  zn: number;
}

const fixture = (name: string) => JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "fixtures/sky", name), "utf8"));
const celnav: CelnavRow[] = fixture("usno-celnav.json").rows;
const moonDays: Array<{
  date: string;
  lat: number;
  lon: number;
  moon: Record<string, string>;
  phase: string;
  illuminated: string;
  closest: { year: number; month: number; day: number; time: string; phase: string };
}> = fixture("usno-moon.json").rows;

const BODIES = ["sun", "moon", "venus", "mars", "jupiter", "saturn"] as const;

/** The largest difference on the sky (minutes of arc) for each kind of body over the fixture. */
function differences() {
  const worst = new Map<string, number>();
  const seen = new Set<string>();
  for (const row of celnav) {
    const key = `${row.date} ${row.time} ${row.object}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const at = Date.parse(`${row.date}T${row.time}Z`);
    if (row.dec === null) {
      // Aries: an hour angle and no declination.
      worst.set("aries", Math.max(worst.get("aries") ?? 0, Math.abs(norm180(ghaAries(at) - row.gha)) * 60));
      continue;
    }
    const lower = row.object.toLowerCase();
    let gha: number;
    let dec: number;
    let kind: string;
    if ((BODIES as readonly string[]).includes(lower)) {
      const place = bodyPlace(lower as (typeof BODIES)[number], at);
      ({ gha, dec } = place);
      kind = lower;
    } else {
      const star = starByName(row.object);
      expect(star, row.object).toBeDefined();
      const place = starPlaceOfDate(star!, at);
      gha = (((ghaAries(at) - place.ra) % 360) + 360) % 360;
      dec = place.dec;
      kind = "stars";
    }
    const onSky = Math.hypot(norm180(gha - row.gha) * Math.cos((dec * Math.PI) / 180), dec - row.dec) * 60;
    worst.set(kind, Math.max(worst.get(kind) ?? 0, onSky));
  }
  return worst;
}

describe("the almanac", () => {
  const worst = differences();

  it("covers every navigational star the Observatory names", () => {
    const named = new Set(celnav.map((row) => row.object.toLowerCase()));
    for (const star of NAVIGATIONAL_STARS) expect(named.has(star.name!.toLowerCase()), star.name!).toBe(true);
    expect(NAVIGATIONAL_STARS).toHaveLength(58);
  });

  it("puts Aries and the stars within half a minute of arc", () => {
    expect(worst.get("aries")).toBeLessThan(0.05);
    expect(worst.get("stars")).toBeLessThan(0.5);
  });

  it("puts the Sun within half a minute of arc", () => {
    expect(worst.get("sun")).toBeLessThan(0.5);
  });

  it("puts the Moon within two minutes of arc and the planets within two", () => {
    expect(worst.get("moon")).toBeLessThan(2);
    for (const planet of ["venus", "mars", "jupiter", "saturn"]) expect(worst.get(planet), planet).toBeLessThan(2);
  });

  it("gives the Moon's semi-diameter and parallax as the Observatory's corrections do", () => {
    const row = celnav.find((r) => r.object === "Moon")!;
    const at = Date.parse(`${row.date}T${row.time}Z`);
    const almanac = almanacFor({ kind: "body", id: "moon" }, at);
    const usno = fixture("usno-celnav.json").rows.find(
      (r: { object: string; date: string; time: string }) => r.object === "Moon" && r.date === row.date && r.time === row.time,
    );
    expect(Math.abs(almanac.sd / 60 - usno.sd) * 60).toBeLessThan(0.3);
    // The Observatory gives the parallax in altitude (HP × cos h) at its computed altitude.
    expect(Math.abs((almanac.hp / 60) * Math.cos((usno.hc * Math.PI) / 180) - usno.pa) * 60).toBeLessThan(0.5);
  });
});

describe("the Moon", () => {
  const minutes = (date: string, hhmm: string) => Date.parse(`${date}T${hhmm}:00Z`);

  it("rises and sets within three minutes of the Observatory's times", () => {
    for (const day of moonDays) {
      const start = Date.parse(`${day.date}T00:00:00Z`);
      const { rise, set } = moonRiseSet(start, start + 86_400_000, day.lat, day.lon);
      if (day.moon.Rise) expect(Math.abs(rise! - minutes(day.date, day.moon.Rise)) / 60_000, `${day.date} rise`).toBeLessThan(3);
      if (day.moon.Set) expect(Math.abs(set! - minutes(day.date, day.moon.Set)) / 60_000, `${day.date} set`).toBeLessThan(3);
    }
  });

  it("is lit as the Observatory says, within two per cent", () => {
    for (const day of moonDays) {
      // The Observatory gives the fraction lit for midday on its date.
      const lit = moonState(Date.parse(`${day.date}T12:00:00Z`)).illuminated * 100;
      expect(Math.abs(lit - Number.parseFloat(day.illuminated)), day.date).toBeLessThanOrEqual(2);
    }
  });

  it("reaches its next phase within ten minutes of the Observatory's time", () => {
    for (const day of moonDays) {
      const { year, month, day: d, time, phase } = day.closest;
      const published = Date.parse(`${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}T${time}:00Z`);
      const ours = nextPhases(published - 3 * 86_400_000).find((p) => p.name.toLowerCase() === phase.toLowerCase());
      expect(ours, phase).toBeDefined();
      expect(Math.abs(ours!.at - published) / 60_000, `${phase} ${day.date}`).toBeLessThan(10);
    }
  });
});

describe("the star catalogue", () => {
  it("joins only stars it holds, with no figure line longer than a constellation", () => {
    for (const figure of CONSTELLATION_FIGURES) {
      for (const [a, b] of figure.pairs) {
        const s = starByHr(a)!;
        const t = starByHr(b)!;
        expect(s && t, figure.name).toBeTruthy();
        const D = Math.PI / 180;
        const apart =
          Math.acos(Math.sin(s.dec * D) * Math.sin(t.dec * D) + Math.cos(s.dec * D) * Math.cos(t.dec * D) * Math.cos((s.ra - t.ra) * D)) /
          D;
        expect(apart, figure.name).toBeLessThan(20);
      }
    }
  });
});
