/**
 * "Estimated radio range from here": the repeaters' estimate for any point, from the long-press and right-click menu.
 * Every figure here is made up for the test.
 */
import { RANGE_BEARINGS, type SightRange } from "@outpost/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/lib/api";
import type { MapEngine } from "../map/engine";
import { ContextMenu } from "../map-chrome";
import { type PointRange, usePointRange } from "./point-range";

vi.mock("@/lib/api", () => ({ api: { get: vi.fn() }, errorMessage: (error: unknown) => String(error), ApiError: class extends Error {} }));
const asked = vi.mocked(api.get);

function answer(coverage: SightRange["coverage"]) {
  return (_path: string, query?: Record<string, unknown>) => {
    const [lat, lon] = String(query?.at).split(",").map(Number) as [number, number];
    const reach = (i: number) => (i < RANGE_BEARINGS / 2 ? 18_000 : 6_000);
    return Promise.resolve({
      at: { lat, lon },
      aerialMeters: Number(query?.aerial),
      stationMeters: Number(query?.station),
      maxMeters: 100_000,
      nearStepMeters: 100,
      farStepMeters: 250,
      nearMeters: 25_000,
      coverage,
      groundMeters: coverage === "none" ? null : 978,
      horizonMeters: 10_100,
      bearings:
        coverage === "none"
          ? []
          : Array.from({ length: RANGE_BEARINGS }, (_, i) => ({
              bearingDeg: (i * 360) / RANGE_BEARINGS,
              reachMeters: reach(i),
              limit: "sight",
              furtherMeters: null,
              unknownFromMeters: null,
            })),
      hiddenShare: 0,
    } as unknown as SightRange) as never;
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
    expect(asked).toHaveBeenCalledWith(
      "/api/maps/sight-range",
      { at: "54.45420,-3.21160", aerial: "1.5", station: "1.5" },
      expect.anything(),
    );
    expect(await screen.findByText(/^Ground in sight as far as about .* on most bearings, from .* to .*\.$/)).toBeInTheDocument();
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
    await screen.findByText(/^Ground in sight as far as about/);
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
    expect(await screen.findByText(/^Without terrain: the smooth-Earth radio horizon, about/)).toBeInTheDocument();
    expect(screen.getByText("No terrain is held here, so it is a plain circle.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Heights and details/ }));
    expect(screen.getByText(/No terrain is held here, so the circle is drawn as if the ground were flat all round/)).toBeInTheDocument();
  });

  it("is put away by its close button", async () => {
    asked.mockImplementation(answer("terrain"));
    show();
    act(() => latest.start({ position: { lat: 54.4542, lon: -3.2116 } }));
    await screen.findByText(/^Ground in sight as far as about/);
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
