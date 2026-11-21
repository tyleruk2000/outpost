/**
 * How far on foot: the minutes the server gives made into rings and shading, and the card. Every figure is made up.
 */
import { encodeBits, type WalkReach } from "@outpost/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/lib/api";
import type { MapEngine } from "../map/engine";
import { ContextMenu } from "../map-chrome";
import { formatWalkTime, minutesAt, ringAt, walkData, walkGrid, walkShade } from "./walk-map";
import { useWalkReach, type WalkReachTool } from "./walk-reach";

vi.mock("@/lib/api", () => ({ api: { get: vi.fn() }, errorMessage: (error: unknown) => String(error), ApiError: class extends Error {} }));
const asked = vi.mocked(api.get);

const AT = { lat: 54.43, lon: -3.01 };

/** Flat open ground walked at 50 m a minute every way, out to `minutes`; with `paths`, as if read with a map. */
function reach(minutes = 60, paths = true): WalkReach {
  const cellMeters = 25;
  const size = 2 * Math.ceil((minutes * 60) / cellMeters) + 1;
  const half = (size - 1) / 2;
  const grid = new Uint8Array(size * size).fill(255);
  let furthest = 0;
  for (let row = 0; row < size; row += 1)
    for (let column = 0; column < size; column += 1) {
      const meters = Math.hypot(column - half, row - half) * cellMeters;
      const time = meters / 50;
      if (time > minutes) continue;
      grid[row * size + column] = Math.floor(time);
      furthest = Math.max(furthest, meters);
    }
  return {
    at: AT,
    minutes,
    pace: "standard",
    coverage: "terrain",
    groundMeters: 52,
    cellMeters,
    size,
    minutesGrid: encodeBits(grid),
    paths,
    furthestMeters: Math.round(furthest),
  };
}

describe("the walk on the map", () => {
  it("reads the minutes to a place, and draws a ring at each half hour for a walk of an hour, labelled once", () => {
    const grid = walkGrid(reach(60))!;
    expect(minutesAt(grid, AT.lat, AT.lon)).toBe(0);
    // 1 km north: 20 minutes at 50 m a minute.
    expect(minutesAt(grid, AT.lat + 1000 / 111_195, AT.lon)).toBe(20);
    expect(minutesAt(grid, AT.lat + 0.1, AT.lon)).toBeNull();
    const data = walkData(grid);
    expect(data.features.filter((feature) => feature.properties.kind === "label").map((feature) => feature.properties.label)).toEqual([
      "30 min",
      "1 h",
    ]);
    // The half-hour ring is about 1.5 km out: its northernmost point.
    const label = data.features.find((feature) => feature.properties.label === "30 min")!;
    const [, lat] = label.geometry.coordinates as [number, number];
    expect((lat - AT.lat) * 111_195).toBeGreaterThan(1400);
    expect((lat - AT.lat) * 111_195).toBeLessThan(1600);
    expect(ringAt(grid, 30).length).toBeGreaterThan(100);
    expect(formatWalkTime(90)).toBe("1 h 30 min");
  });

  it("shades the ground reached in the walk's colour, palest in the last band, and leaves the rest clear", () => {
    const picture = walkShade(walkGrid(reach(60))!, "#c8620f", 200)!;
    const middle = Math.floor(picture.width / 2);
    const alpha = (x: number, y: number) => picture.pixels[(y * picture.width + x) * 4 + 3]!;
    expect(alpha(middle, middle)).toBe(255);
    expect(Array.from(picture.pixels.slice((middle * picture.width + middle) * 4, (middle * picture.width + middle) * 4 + 3))).toEqual([
      0xc8, 0x62, 0x0f,
    ]);
    // Three quarters of the way out: the second half hour, paler.
    expect(alpha(middle + Math.round(middle * 0.75), middle)).toBeLessThan(255);
    expect(alpha(middle + Math.round(middle * 0.75), middle)).toBeGreaterThan(0);
    expect(alpha(0, 0)).toBe(0);
  });
});

const engine = { setOverlay: vi.fn(), setShades: vi.fn(), fitBounds: vi.fn() };
let latest: WalkReachTool;
function Harness() {
  latest = useWalkReach({
    engine: engine as unknown as MapEngine,
    where: (position) => `${position.lat.toFixed(5)}, ${position.lon.toFixed(5)}`,
  });
  return <div>{latest.card}</div>;
}
const show = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <Harness />
    </QueryClientProvider>,
  );

beforeEach(() => {
  localStorage.clear();
  asked.mockReset();
  engine.setOverlay.mockClear();
  engine.fitBounds.mockClear();
});

describe("how far on foot from a point", () => {
  it("asks for an hour at a fit adult's pace, says how far, draws the rings and brings them into view", async () => {
    asked.mockImplementation((_path, query) => Promise.resolve(reach(Number((query as Record<string, string>).minutes))) as never);
    show();
    act(() => latest.start(AT));
    expect(screen.getByRole("heading", { name: "How far on foot" })).toBeInTheDocument();
    expect(asked).toHaveBeenCalledWith(
      "/api/maps/walk-reach",
      { at: "54.43000,-3.01000", minutes: "60", pace: "standard" },
      expect.anything(),
    );
    expect(await screen.findByText("Within 1 h: as far as 3.00 km from here, straight-line.")).toBeInTheDocument();
    expect(screen.getByText(/For a fit adult with no load\./)).toBeInTheDocument();
    await waitFor(() => expect(engine.fitBounds).toHaveBeenCalledTimes(1));
    const rings = engine.setOverlay.mock.calls.filter(([source]) => source === "o-walk").at(-1)![1];
    expect(rings.features.length).toBeGreaterThan(0);

    // Another time, and a slower pace, asked again and remembered.
    fireEvent.click(screen.getByRole("radio", { name: "2 h" }));
    fireEvent.click(screen.getByRole("button", { name: "Pace and what this is" }));
    expect(screen.getByText(/It knows nothing of fences, walls, private land/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "Slower" }));
    await waitFor(() =>
      expect(asked).toHaveBeenLastCalledWith(
        "/api/maps/walk-reach",
        { at: "54.43000,-3.01000", minutes: "120", pace: "slower" },
        expect.anything(),
      ),
    );
    expect(JSON.parse(localStorage.getItem("outpost.maps.walk")!)).toEqual({ minutes: 120, pace: "slower" });
  });

  it("says when no map gives paths, and when no terrain is held, with where to get it", async () => {
    asked.mockResolvedValue(reach(60, false) as never);
    show();
    act(() => latest.start(AT));
    expect(await screen.findByText(/No paths or roads from an installed map here/)).toBeInTheDocument();
    asked.mockResolvedValue({ ...reach(30), coverage: "none", minutesGrid: "", groundMeters: null, furthestMeters: 0 } as never);
    fireEvent.click(screen.getByRole("radio", { name: "30 min" }));
    expect(await screen.findByText(/No terrain is held here/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Stop showing how far on foot" }));
    await waitFor(() => expect(latest.card).toBeNull());
  });

  it("is offered in the map's menu at a point", () => {
    const onWalk = vi.fn();
    render(
      <ContextMenu
        point={{ x: 10, y: 10 }}
        bounds={{ width: 800, height: 600 }}
        coordinates="54.43000, -3.01000"
        onSave={() => {}}
        onMeasure={() => {}}
        onDraw={() => {}}
        onSun={() => {}}
        onWalk={onWalk}
        onClose={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "How far on foot from here" }));
    expect(onWalk).toHaveBeenCalledTimes(1);
  });
});
