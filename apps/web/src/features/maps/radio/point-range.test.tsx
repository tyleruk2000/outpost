/**
 * "Estimated radio range from here": the repeaters' estimate for any point, from the long-press and right-click menu.
 * Every figure here is made up for the test.
 */
import type { SightRange, TerrainProfile } from "@outpost/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { rangeFixture } from "@/features/repeaters/map/range-fixture";
import { api } from "@/lib/api";
import type { MapEngine } from "../map/engine";
import { ContextMenu } from "../map-chrome";
import { type PointRange, usePointRange } from "./point-range";

vi.mock("@/lib/api", () => ({ api: { get: vi.fn() }, errorMessage: (error: unknown) => String(error), ApiError: class extends Error {} }));
const asked = vi.mocked(api.get);

/** In sight to 18 km on the eastern half of the compass and to 6 km on the western; along any path, a valley. */
function answer(coverage: SightRange["coverage"]) {
  return (path: string, query?: Record<string, unknown>) => {
    if (path === "/api/maps/terrain-profile") {
      // A valley between the two ends: the line of sight passes over it.
      const heights = Array.from({ length: 101 }, (_, i) => 900 + (78 * Math.abs(i - 50)) / 50);
      return Promise.resolve({
        distanceMeters: 20_000,
        stepMeters: 200,
        heights,
        coverage: "terrain",
        gaps: [],
      } as unknown as TerrainProfile) as never;
    }
    const [lat, lon] = String(query?.at).split(",").map(Number) as [number, number];
    return Promise.resolve(
      rangeFixture(
        coverage,
        { seen: (bearing, meters) => meters <= (bearing < 180 ? 18_000 : 6_000), groundMeters: 978 },
        { lat, lon },
        { aerialMeters: Number(query?.aerial), stationMeters: Number(query?.station) },
      ),
    ) as never;
  };
}

const fitBounds = vi.fn();
const engine = { fitBounds } as unknown as MapEngine;
let latest: PointRange;
function Harness({ onReady }: { onReady?: () => void }) {
  latest = usePointRange({ engine, where: (position) => `${position.lat.toFixed(5)}, ${position.lon.toFixed(5)}` });
  useEffect(() => onReady?.(), [onReady]);
  return <div>{latest.card}</div>;
}
/** The card starts folded to two lines; this opens it out. */
const unfold = () => fireEvent.click(screen.getByRole("button", { name: "Show the details" }));
const show = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <Harness />
    </QueryClientProvider>,
  );

beforeEach(() => {
  asked.mockReset();
  fitBounds.mockReset();
  localStorage.clear();
});
afterEach(() => vi.useRealTimers());

describe("an estimated radio range from any point", () => {
  it("asks nothing, and shows nothing, until it is chosen", async () => {
    show();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(asked).not.toHaveBeenCalled();
    expect(latest.card).toBeNull();
    expect(latest.outline).toBeNull();
  });

  it("works out the range from the point with a handheld at both ends, says it in the repeaters' words, and brings it into view", async () => {
    asked.mockImplementation(answer("terrain"));
    show();
    act(() => latest.start({ position: { lat: 54.4542, lon: -3.2116 }, name: "Scafell Pike" }));
    expect(screen.getByRole("heading", { name: "Estimated radio range" })).toBeInTheDocument();
    // Folded to the answer in a few words, so that the shading has the map; opened out with one press.
    expect(await screen.findByText(/^\d+% in sight within 10 km/)).toBeInTheDocument();
    unfold();
    expect(asked).toHaveBeenCalledWith(
      "/api/maps/sight-range",
      { at: "54.45420,-3.21160", aerial: "1.5", station: "1.5" },
      expect.anything(),
    );
    expect(await screen.findByText(/^In sight: \d+% of the ground within 10 km, \d+% within 25 km\.$/)).toBeInTheDocument();
    expect(screen.getByText(/From “Scafell Pike”, 54\.45420, -3\.21160, ground 978 m above sea level/)).toBeInTheDocument();
    // Short until asked: the heights and what the estimate is are a press away.
    expect(screen.queryByLabelText("Your aerial")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /^Heights and details: your aerial 1\.5 m, handheld at the other end$/ }));
    expect(screen.getByText(/Line of sight only\. Your aerial 1\.5 m above the ground here/)).toBeInTheDocument();
    expect(screen.getByText(/It is an estimate, not a promise/)).toBeInTheDocument();
    expect(screen.getByText(/It is not a circle, because a hill blocks one side and not another/)).toBeInTheDocument();
    // Drawn with the repeaters' outlines, named; and brought into view once.
    await waitFor(() => expect(latest.outline?.name).toBe("Scafell Pike"));
    await waitFor(() => expect(fitBounds).toHaveBeenCalledTimes(1));
  });

  it("asks again for a mast and a roof aerial at the other end, and remembers them", async () => {
    asked.mockImplementation(answer("terrain"));
    show();
    act(() => latest.start({ position: { lat: 54.4542, lon: -3.2116 } }));
    unfold();
    await screen.findByText(/^In sight: /);
    fireEvent.click(screen.getByRole("button", { name: /^Heights and details/ }));
    fireEvent.change(screen.getByLabelText("Your aerial"), { target: { value: "10" } });
    fireEvent.click(screen.getByRole("radio", { name: "Roof aerial" }));
    await waitFor(
      () =>
        expect(asked).toHaveBeenLastCalledWith(
          "/api/maps/sight-range",
          { at: "54.45420,-3.21160", aerial: "10", station: "8" },
          expect.anything(),
        ),
      { timeout: 2000 },
    );
    expect(JSON.parse(localStorage.getItem("outpost.maps.pointRange")!)).toEqual({ aerial: 10, station: "roof" });
  });

  it("with no terrain here, says so and how far the plain horizon is, rather than a circle that looks like an answer", async () => {
    asked.mockImplementation(answer("none"));
    show();
    act(() => latest.start({ position: { lat: -33.9, lon: 18.4 } }));
    unfold();
    expect(await screen.findByText(/^Without terrain: the smooth-Earth radio horizon, about/)).toBeInTheDocument();
    expect(screen.getByText("No terrain is held here, so it is a plain circle.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Heights and details/ }));
    expect(screen.getByText(/No terrain is held here, so the circle is drawn as if the ground were flat all round/)).toBeInTheDocument();
  });

  it("says the furthest ground in sight and its direction, and shows why along a direction chosen on the disc", async () => {
    asked.mockImplementation(answer("terrain"));
    show();
    act(() => latest.start({ position: { lat: 54.4542, lon: -3.2116 } }));
    unfold();
    expect(await screen.findByText("Typical range about 12 km; furthest 18 km to the north.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Why this shape: look along one direction" }));
    const disc = screen.getByRole("slider", { name: /^Direction to look along/ });
    // It starts along the furthest ground in sight, and asks for the ground along it.
    expect(disc).toHaveAttribute("aria-valuetext", "north (0°), 18 km (11 mi) out");
    await waitFor(() => expect(asked).toHaveBeenCalledWith("/api/maps/terrain-profile", expect.anything(), expect.anything()));
    expect(await screen.findByText("The ground north of the aerial, seen from the side")).toBeInTheDocument();
    expect(screen.getByText(/In sight: nothing stands in the way\./)).toBeInTheDocument();
    // Turned with the keys: a quarter of the way round is east.
    for (let turn = 0; turn < 4; turn += 1) fireEvent.keyDown(disc, { key: "PageDown" });
    expect(disc).toHaveAttribute("aria-valuetext", "east (90°), 18 km (11 mi) out");
    expect(screen.getByText("Ground in sight from the aerial")).toBeInTheDocument();
  });

  it("is put away by its close button", async () => {
    asked.mockImplementation(answer("terrain"));
    show();
    act(() => latest.start({ position: { lat: 54.4542, lon: -3.2116 } }));
    // From the folded card as well as the open one.
    await screen.findByText(/in sight within 10 km/);
    fireEvent.click(screen.getByRole("button", { name: "Stop showing this range" }));
    await waitFor(() => expect(latest.card).toBeNull());
    expect(latest.outline).toBeNull();
  });
});

describe("the map's menu at a point", () => {
  it("offers the estimated radio range from there", () => {
    const onRange = vi.fn();
    render(
      <ContextMenu
        point={{ x: 100, y: 100 }}
        bounds={{ width: 800, height: 600 }}
        coordinates="54.45420, -3.21160"
        onSave={() => {}}
        onMeasure={() => {}}
        onDraw={() => {}}
        onSun={() => {}}
        onRange={onRange}
        onClose={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "Estimated radio range from here" }));
    expect(onRange).toHaveBeenCalledTimes(1);
  });
});
