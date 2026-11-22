import type { PointHeight } from "@outpost/shared";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/lib/api";
import { setHeightUnit } from "@/lib/heights";
import { PACE_MS } from "./ground-height";
import type { LatLon } from "./lib/geo";
import type { MapEngine } from "./map/engine";
import { MapFooter, type ReadoutHeights } from "./map-footer";

vi.mock("@/lib/api", () => ({ api: { get: vi.fn() } }));
const asked = vi.mocked(api.get);

/** A map whose centre and pointer the test moves. */
function fakeEngine() {
  let centre: LatLon = { lat: 54.5109, lon: -3.5001 };
  const listeners = { move: new Set<() => void>(), pointer: new Set<(position: LatLon | null) => void>() };
  return {
    engine: {
      getCenter: () => centre,
      getZoom: () => 12,
      on: (type: "move" | "pointer", listener: never) => {
        listeners[type].add(listener);
        return () => listeners[type].delete(listener);
      },
    } as unknown as MapEngine,
    move(next: LatLon) {
      centre = next;
      for (const listener of listeners.move) listener();
    },
    pointer(position: LatLon | null) {
      for (const listener of listeners.pointer) listener(position);
    },
  };
}

/** A screen of this width, with or without a mouse. */
function screenOf({ desktop, mouse }: { desktop: boolean; mouse: boolean }) {
  window.matchMedia = ((query: string) => ({
    matches: query.includes("min-width") ? desktop : query.includes("hover") ? mouse : false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
  })) as unknown as typeof window.matchMedia;
}

const answer = (heightMeters: number | null) => (_path: string, query?: Record<string, unknown>) => {
  const [lat, lon] = String(query?.at).split(",").map(Number) as [number, number];
  return Promise.resolve({
    at: { lat, lon },
    heightMeters,
    cellMeters: heightMeters === null ? null : 38.2,
  } satisfies PointHeight) as never;
};

const footer = (map: ReturnType<typeof fakeEngine>, heights: ReadoutHeights = { terrain: true, onGetTerrain: vi.fn() }) =>
  render(<MapFooter engine={map.engine} format="decimal" onFormatChange={() => {}} credits={[]} heights={heights} />);

const figure = () => document.querySelector("[data-ground-height]");
const openReadout = () => userEvent.click(screen.getByRole("button", { name: /Coordinate format/ }));

const original = window.matchMedia;
beforeEach(() => asked.mockReset());
afterEach(() => {
  window.matchMedia = original;
  setHeightUnit("m");
});

describe("the height in the readout", () => {
  it("with a mouse, shows the ground under the pointer, beside the coordinates", async () => {
    screenOf({ desktop: true, mouse: true });
    asked.mockImplementation(answer(312.4));
    const map = fakeEngine();
    footer(map);
    act(() => map.pointer({ lat: 54.61094, lon: -3.50013 }));
    await waitFor(() => expect(asked).toHaveBeenLastCalledWith("/api/maps/height", { at: "54.6109,-3.5001" }, expect.anything()));
    await waitFor(() => expect(figure()).toHaveTextContent("· 312 m"));
    // In the same line as the coordinates, in the same figures.
    expect(figure()!.parentElement).toHaveClass("font-mono");
    expect(figure()!.parentElement).toHaveTextContent("54.61094, -3.50013 · 312 m");
    expect(figure()).toHaveAttribute(
      "title",
      expect.stringMatching(/not a surveyed spot height\. Above mean sea level, as the terrain data gives it\./),
    );
  });

  it("with a mouse that is not over the map, shows the ground at the centre, as the coordinates do", async () => {
    screenOf({ desktop: true, mouse: true });
    asked.mockImplementation(answer(96));
    const map = fakeEngine();
    footer(map);
    await waitFor(() => expect(figure()).toHaveTextContent("· 96 m"));
    expect(asked.mock.calls[0]![1]).toEqual({ at: "54.5109,-3.5001" });
    expect(screen.getByText("Centre")).toBeInTheDocument();
    // The pointer comes and goes: the centre again, without asking again.
    act(() => map.pointer({ lat: 54.7, lon: -3.5 }));
    await waitFor(() => expect(asked).toHaveBeenCalledTimes(2));
    act(() => map.pointer(null));
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(figure()).toHaveTextContent("· 96 m");
    expect(asked).toHaveBeenCalledTimes(2);
  });

  it("goes on showing a figure while the pointer moves, without holding it still", async () => {
    screenOf({ desktop: true, mouse: true });
    asked.mockImplementation((path, query) => {
      const lat = Number(String(query?.at).split(",")[0]);
      return answer(Math.round(lat * 10))(path, query);
    });
    const map = fakeEngine();
    footer(map);
    act(() => map.pointer({ lat: 54.5, lon: -3.5 }));
    await waitFor(() => expect(figure()).toHaveTextContent("· 545 m"));
    const before = asked.mock.calls.length;
    const started = Date.now();
    for (let step = 1; step <= 30; step += 1) {
      act(() => map.pointer({ lat: 54.5 + step * 0.01, lon: -3.5 }));
      // Never blank between one figure and the next.
      expect(figure()).not.toBeNull();
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    // About 300 ms of movement asks a few times, not thirty: once each PACE_MS, and once
    // more at each end. Measured, because on a busy machine the 30 steps take longer.
    const paces = Math.ceil((Date.now() - started) / PACE_MS);
    expect(asked.mock.calls.length - before).toBeLessThanOrEqual(paces + 2);
    await waitFor(() => expect(figure()).toHaveTextContent("· 548 m"));
  });

  it("in feet, when that is chosen", async () => {
    screenOf({ desktop: true, mouse: true });
    setHeightUnit("ft");
    asked.mockImplementation(answer(312));
    const map = fakeEngine();
    footer(map);
    act(() => map.pointer({ lat: 54.5, lon: -3.5 }));
    await waitFor(() => expect(figure()).toHaveTextContent("· 1,025 ft"));
  });

  it("where no terrain covers the point: nothing folded, and opened, what heights need", async () => {
    screenOf({ desktop: true, mouse: true });
    asked.mockImplementation(answer(null));
    const onGetTerrain = vi.fn();
    const map = fakeEngine();
    footer(map, { terrain: true, onGetTerrain });
    act(() => map.pointer({ lat: 54.5, lon: -3.5 }));
    await waitFor(() => expect(asked).toHaveBeenLastCalledWith("/api/maps/height", { at: "54.5,-3.5" }, expect.anything()));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(figure()).toBeNull();
    expect(screen.queryByText(/0 m/)).toBeNull();

    act(() => map.pointer(null));
    await openReadout();
    expect(await screen.findByText("Heights need terrain for this area. It comes with a map region, under Offline maps.")).toBeVisible();
    await userEvent.click(screen.getByRole("menuitem", { name: "Get terrain" }));
    expect(onGetTerrain).toHaveBeenCalledTimes(1);
  });

  it("with no terrain installed at all, asks nothing", async () => {
    screenOf({ desktop: true, mouse: true });
    const map = fakeEngine();
    footer(map, { terrain: false });
    act(() => map.pointer({ lat: 54.5, lon: -3.5 }));
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(asked).not.toHaveBeenCalled();
    expect(figure()).toBeNull();
    await openReadout();
    expect(await screen.findByText(/Heights need terrain for this area/)).toBeVisible();
  });

  it("on a phone, is not in the folded readout and asks nothing for it", async () => {
    screenOf({ desktop: false, mouse: false });
    asked.mockImplementation(answer(312));
    const map = fakeEngine();
    footer(map);
    act(() => map.move({ lat: 54.52, lon: -3.5 }));
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(asked).not.toHaveBeenCalled();
    expect(figure()).toBeNull();
    expect(screen.getByText("Centre")).toBeInTheDocument();
  });

  it("on a phone, is in the opened readout: the centre's height, and what it is", async () => {
    screenOf({ desktop: false, mouse: false });
    asked.mockImplementation(answer(312));
    const map = fakeEngine();
    footer(map);
    await openReadout();
    const note = await screen.findByText("Height at the centre");
    await waitFor(() => expect(note.parentElement).toHaveTextContent("Height at the centre312 m"));
    expect(screen.getByText(/read from terrain in cells about 38 m across: not a surveyed spot height/)).toBeVisible();
    expect(asked).toHaveBeenCalledTimes(1);
    expect(asked.mock.calls[0]![1]).toEqual({ at: "54.5109,-3.5001" });
    // Still not in the folded line.
    expect(figure()).toBeNull();
  });

  it("is not read where the footer is not given heights (the kept maps, propagation)", async () => {
    screenOf({ desktop: true, mouse: true });
    const map = fakeEngine();
    render(<MapFooter engine={map.engine} format="decimal" onFormatChange={() => {}} credits={[]} />);
    act(() => map.pointer({ lat: 54.5, lon: -3.5 }));
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(asked).not.toHaveBeenCalled();
  });
});
