/** Celestial navigation: reading what is typed, the worked example, and the screen against a stand-in server. */
import { almanacFor, reduce, starByName } from "@outpost/shared/sky";
import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { fakeApi, renderScreen } from "../manage/test-support";
import { toolScreens } from "../tools/screens";
import CelestialNavigationPage from "./celnav-page";
import { EXAMPLE, formBlocks, workedExample } from "./form";
import { celnavData } from "./map-layers";
import { plotReach } from "./plot-plate";
import { formatAngle, formatLatLon, plotOf, readAngle, type SightRecord, sightInstant, workSights } from "./sights";

beforeEach(() => localStorage.clear());

const nm = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) =>
  Math.hypot(a.lat - b.lat, (a.lon - b.lon) * Math.cos((a.lat * Math.PI) / 180)) * 60;

describe("reading what is typed", () => {
  it("reads degrees and minutes in the ways people write them", () => {
    expect(readAngle("34 12.5")).toBeCloseTo(34 + 12.5 / 60, 9);
    expect(readAngle("34°12.5′")).toBeCloseTo(34 + 12.5 / 60, 9);
    expect(readAngle("34° 12,5'")).toBeCloseTo(34 + 12.5 / 60, 9);
    expect(readAngle("34.25")).toBe(34.25);
    expect(readAngle("34 61")).toBeNull();
    expect(readAngle("north")).toBeNull();
  });

  it("writes angles and positions to a tenth of a minute", () => {
    expect(formatAngle(34.999999)).toBe("35° 0.0′");
    expect(formatLatLon(-33.5, "lat")).toBe("33° 30.0′ S");
    expect(formatLatLon(-4.0833333, "lon")).toBe("4° 05.0′ W");
  });

  it("reads a time in UT with or without seconds", () => {
    expect(sightInstant("2026-11-21", "15:04:30")).toBe(Date.UTC(2026, 10, 21, 15, 4, 30));
    expect(sightInstant("2026-11-21", "15:04")).toBe(Date.UTC(2026, 10, 21, 15, 4));
    expect(sightInstant("2026-11-21", "25:00")).toBeNull();
  });
});

describe("the worked example", () => {
  it("puts its line of position within a tenth of a mile of the true place", () => {
    const ex = workedExample();
    const { reduction } = ex;
    const z = (reduction.zn * Math.PI) / 180;
    // The true place's distance from the line: along the azimuth, from the foot of the intercept.
    const east = (EXAMPLE.truth.lon - EXAMPLE.dr.lon) * 60 * Math.cos((EXAMPLE.dr.lat * Math.PI) / 180);
    const north = (EXAMPLE.truth.lat - EXAMPLE.dr.lat) * 60;
    const along = east * Math.sin(z) + north * Math.cos(z);
    expect(Math.abs(along - reduction.intercept)).toBeLessThan(0.1);
    expect(formBlocks().some((b) => b.kind === "table")).toBe(true);
  });
});

describe("working sights", () => {
  const at = Date.UTC(2026, 10, 21, 18, 0, 0);
  const truth = { lat: 51.5, lon: -1 };
  // Sextant altitudes made up from the true place: a plumb line has no dip, so Hs is the apparent altitude.
  const sightOf = (name: string, id: string): SightRecord => {
    const star = starByName(name)!;
    const hc = reduce(almanacFor({ kind: "star", star }, at), 0, truth).hc;
    const refraction = 0.96 / Math.tan(((hc + 7.31 / (hc + 4.4)) * Math.PI) / 180) / 60;
    return {
      id,
      body: `hr:${star.hr}`,
      limb: "centre",
      date: "2026-11-21",
      time: "18:00:00",
      hs: (hc + refraction).toFixed(5),
      indexError: "0",
      heightOfEye: "0",
      horizon: "plumb",
    };
  };

  it("finds the fix from three stars and says how big the error can be", () => {
    const records = [sightOf("Vega", "a"), sightOf("Capella", "b"), sightOf("Fomalhaut", "c")];
    const { worked, fix, problems } = workSights(records, { lat: 51.8, lon: -0.6 }, { course: "", speed: "" });
    expect(problems).toEqual([]);
    expect(worked).toHaveLength(3);
    // Refraction here is a different formula from the screen's, so allow a tenth of a mile or so.
    expect(nm(fix!.position, truth)).toBeLessThan(0.3);
    // Plumb-line sights are allowed thirty minutes of arc each: the ellipse says so.
    expect(fix!.ellipse.major).toBeGreaterThan(10);
    const plot = plotOf(worked, fix, { lat: 51.8, lon: -0.6 }, at);
    const kinds = celnavData(plot).features.map((f) => f.properties.kind);
    expect(kinds.filter((k) => k === "line")).toHaveLength(3);
    expect(kinds).toContain("fix");
    expect(kinds).toContain("ellipse");
  });

  it("draws a sheet that reaches every line of position, however far it passes from the position worked from", () => {
    // From 37 miles west of the true place, Vega (in the west)'s line passes far outside the eight miles a sheet starts at.
    const dr = { lat: 51.5, lon: -2 };
    const { worked } = workSights([sightOf("Vega", "a")], dr, { course: "", speed: "" });
    const plot = plotOf(worked, null, dr, at);
    const intercept = Math.abs(worked[0]!.reduction.intercept);
    expect(intercept).toBeGreaterThan(10);
    expect(plotReach(plot)).toBeGreaterThan(intercept);
  });

  it("says what is missing from a sight not yet filled in", () => {
    const { problems } = workSights([{ ...sightOf("Vega", "a"), time: "" }], truth, { course: "", speed: "" });
    expect(problems[0]!.problem).toMatch(/time of the sight in UT/);
  });
});

describe("the screen", () => {
  it("is listed under Tools", () => {
    expect(toolScreens.find((s) => s.to === "/tools/celestial-navigation")?.label).toBe("Celestial navigation");
  });

  it("says it is for learning, and works a sight as it is typed", async () => {
    fakeApi({
      "GET /api/maps/markers": {
        markers: [
          {
            id: "m1",
            name: "Boat",
            note: "",
            lat: 50.1667,
            lon: -4.6667,
            color: "teal",
            icon: "home",
            isFavorite: false,
            noteId: null,
            createdAt: 1,
            updatedAt: 1,
          },
        ],
      },
    });
    renderScreen(<CelestialNavigationPage />, "/tools/celestial-navigation");
    expect(screen.getByRole("heading", { level: 1, name: "Celestial navigation" })).toBeInTheDocument();
    expect(screen.getByText("For learning, and as a fallback")).toBeInTheDocument();
    const ex = workedExample();
    fireEvent.change(await screen.findByLabelText("Date (UT)"), { target: { value: "2026-06-21" } });
    fireEvent.change(screen.getByLabelText("Time (UT)"), { target: { value: "14:30:00" } });
    fireEvent.change(screen.getByLabelText("Sextant altitude"), { target: { value: ex.hs.toFixed(5) } });
    fireEvent.change(screen.getByLabelText("Index error, minutes"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("Height of eye, metres"), { target: { value: "3" } });
    expect(await screen.findByText("Observed altitude")).toBeInTheDocument();
    expect(screen.getByText(/One line of position: you are somewhere on it/)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /The lines of position from your sights/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show on the map" })).toBeInTheDocument();
    expect(screen.getByText(/Four seconds of clock error is a minute of longitude/)).toBeInTheDocument();
  });
});
