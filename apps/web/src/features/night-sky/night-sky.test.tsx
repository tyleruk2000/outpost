/** The night sky: its pure model in both hemispheres, and the screen against a stand-in server. The places are made up. */
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { fakeApi, renderScreen } from "../manage/test-support";
import { toolScreens } from "../tools/screens";
import { chartPoint, poleView } from "./model";
import NightSkyPage, { instantOf } from "./night-sky-page";

const marker = (over: Record<string, unknown> = {}) => ({
  id: "m1",
  name: "Cottage",
  note: "",
  lat: 51.4779,
  lon: -0.0015,
  color: "teal",
  icon: "home",
  isFavorite: false,
  noteId: null,
  createdAt: 1,
  updatedAt: 1,
  ...over,
});

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("outpost.tools.solar-clock.zone", "fixed:0");
});

/** How far the pole (0, 0) is from the line through two points, in the plane of the view. */
function poleOffLine(a: [number, number], b: [number, number]): { off: number; ahead: boolean } {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const length = Math.hypot(dx, dy);
  const off = Math.abs(dx * -a[1] - dy * -a[0]) / length;
  // The pole lies beyond the second star, not behind the first.
  const ahead = (-a[0] * dx + -a[1] * dy) / length > length;
  return { off, ahead };
}

describe("the chart", () => {
  it("puts the zenith at the centre, north at the top and east on the left", () => {
    const zenith = chartPoint(90, 0);
    expect(Math.hypot(zenith[0], zenith[1])).toBeCloseTo(0, 9);
    const north = chartPoint(0, 0);
    expect(north[0]).toBeCloseTo(0, 9);
    expect(north[1]).toBeCloseTo(-1, 9);
    const east = chartPoint(0, 90);
    expect(east[0]).toBeCloseTo(-1, 9);
    expect(east[1]).toBeCloseTo(0, 9);
  });
});

describe("finding the pole", () => {
  it("in the north: the Plough's pointers lead to Polaris, about five times their distance", () => {
    const view = poleView(Date.UTC(2026, 11, 1, 22), 51.5, 0);
    expect(view.finding.hemisphere).toBe("north");
    const { from, to } = view.pointers;
    expect(from && to).toBeTruthy();
    const { off, ahead } = poleOffLine(from!, to!);
    const gap = Math.hypot(to![0] - from![0], to![1] - from![1]);
    expect(ahead).toBe(true);
    // Polaris is within a degree of the pole; the line passes within a fifth of the pointers' gap of it.
    expect(off / gap).toBeLessThan(0.6);
    const reach = Math.hypot(to![0], to![1]) / gap;
    expect(reach).toBeGreaterThan(4);
    expect(reach).toBeLessThan(6);
    // Polaris sits near the centre of the view.
    const polaris = view.stars.find((s) => s.name === "Polaris")!;
    expect(Math.hypot(...polaris.at!)).toBeLessThan(0.03);
  });

  it("in the south: the Cross's long axis points to the pole about four and a half lengths on", () => {
    const view = poleView(Date.UTC(2027, 4, 1, 12), -33.9, 151.2);
    expect(view.finding.hemisphere).toBe("south");
    const { from, to } = view.pointers;
    expect(from && to).toBeTruthy();
    const { ahead, off } = poleOffLine(from!, to!);
    const gap = Math.hypot(to![0] - from![0], to![1] - from![1]);
    expect(ahead).toBe(true);
    expect(off / gap).toBeLessThan(1);
    const reach = Math.hypot(to![0], to![1]) / gap;
    expect(reach).toBeGreaterThan(3.5);
    expect(reach).toBeLessThan(6);
  });
});

describe("a clock reading", () => {
  it("is turned into the instant it names", () => {
    expect(instantOf("2026-11-21", "22:00", { kind: "fixed", minutes: 60 })).toBe(Date.UTC(2026, 10, 21, 21));
    expect(instantOf("2026-11-21", "nonsense", { kind: "fixed", minutes: 0 })).toBeNull();
  });
});

describe("the screen", () => {
  it("is listed under Tools", () => {
    expect(toolScreens.find((s) => s.to === "/tools/night-sky")?.label).toBe("Night sky");
  });

  it("asks for a place when none is saved", async () => {
    fakeApi({ "GET /api/maps/markers": { markers: [] } });
    renderScreen(<NightSkyPage />, "/tools/night-sky");
    expect(screen.getByRole("heading", { level: 1, name: "Night sky" })).toBeInTheDocument();
    expect(await screen.findByText(/Choose a place above, or type its coordinates/)).toBeInTheDocument();
  });

  it("shows the Moon, the chart and finding north for the home place at a chosen time", async () => {
    fakeApi({ "GET /api/maps/markers": { markers: [marker()] } });
    renderScreen(<NightSkyPage />, "/tools/night-sky");
    await userEvent.click(await screen.findByRole("radio", { name: "Another time" }));
    const date = screen.getByLabelText("Date");
    await userEvent.clear(date);
    await userEvent.type(date, "2026-11-21");
    expect(await screen.findByRole("heading", { name: "The Moon" })).toBeInTheDocument();
    expect(screen.getByText(/Waxing gibbous, \d+% lit/)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /The sky over Cottage/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Finding north by the stars" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Facing north from Cottage/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "What is up" })).toBeInTheDocument();
  });
});
