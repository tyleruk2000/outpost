/**
 * On foot in Reachable from here: the minutes the server gives made into rings and shading, the card, and the printed
 * page. Every figure is made up.
 */
import { encodeBits, type WalkReach } from "@outpost/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/lib/api";
import type { MapEngine } from "../map/engine";
import { ContextMenu } from "../map-chrome";
import { PRINT_OVERLAYS } from "../print/overlays";
import { type ReachTool, useReach } from "../reach/reach-tool";
import { formatWalkTime, minutesAt, ringAt, setWalkShown, walkData, walkGrid, walkShade, walkShown } from "./walk-map";

vi.mock("@/lib/api", () => ({
  api: { get: vi.fn(), post: vi.fn() },
  errorMessage: (error: unknown) => String(error),
  ApiError: class extends Error {},
}));
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
let latest: ReachTool;
const onPrint = vi.fn();
function Harness() {
  latest = useReach({
    engine: engine as unknown as MapEngine,
    where: (position) => `${position.lat.toFixed(5)}, ${position.lon.toFixed(5)}`,
    onOpenStreets: () => {},
    onOpenNetworks: () => {},
    onPrint,
  });
  return <div>{latest.card}</div>;
}
const show = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <Harness />
      </MemoryRouter>
    </QueryClientProvider>,
  );

/** The walks asked of the server: only those (the streets' status and the roads are left unanswered). */
const walks = () => asked.mock.calls.filter(([path]) => path === "/api/maps/walk-reach").map(([, query]) => query);
const answerWalks = (answer: (minutes: number) => WalkReach) =>
  asked.mockImplementation(((path: string, query: Record<string, string>) =>
    path === "/api/maps/walk-reach" ? Promise.resolve(answer(Number(query.minutes))) : new Promise(() => {})) as never);

beforeEach(() => {
  localStorage.clear();
  asked.mockReset();
  vi.mocked(api.post).mockReset();
  vi.mocked(api.post).mockReturnValue(new Promise(() => {}));
  engine.setOverlay.mockClear();
  engine.fitBounds.mockClear();
  onPrint.mockClear();
  setWalkShown(null);
});

describe("on foot, in Reachable from here", () => {
  it("walks an hour over terrain at a fit adult's pace, says how far, draws the rings and brings them into view", async () => {
    answerWalks((minutes) => reach(minutes));
    show();
    act(() => latest.start(AT, null, "walk"));
    expect(screen.getByRole("heading", { name: "Reachable from here" })).toBeInTheDocument();
    expect(within(screen.getByRole("radiogroup", { name: "Way of travelling" })).getByRole("radio", { name: "Walk" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(walks().at(-1)).toEqual({ at: "54.43000,-3.01000", minutes: "60", pace: "standard" });
    expect(await screen.findByText("Within 1 h: as far as 3.00 km from here, straight-line.")).toBeInTheDocument();
    expect(screen.getByText(/Hills, paths and water counted\. For a fit adult with no load\./)).toBeInTheDocument();
    expect(screen.getByText(/ground 52 m above sea level/)).toBeInTheDocument();
    await waitFor(() => expect(engine.fitBounds).toHaveBeenCalledTimes(1));
    const rings = engine.setOverlay.mock.calls.filter(([source]) => source === "o-walk").at(-1)![1];
    expect(rings.features.length).toBeGreaterThan(0);
    // Nothing is asked of the streets service on foot.
    expect(vi.mocked(api.post).mock.calls.some(([path]) => path === "/api/streets/reach")).toBe(false);
    // Kept for the printed page, and printed from the card.
    expect(walkShown()?.minutes).toBe(60);
    fireEvent.click(screen.getByRole("button", { name: "Print or save as PDF" }));
    expect(onPrint).toHaveBeenCalledTimes(1);

    // 8 hours, and a slower pace, asked again and remembered.
    fireEvent.click(within(screen.getByRole("radiogroup", { name: "Time" })).getByRole("radio", { name: "8 hours" }));
    fireEvent.click(screen.getByRole("button", { name: "Pace and what this is" }));
    expect(screen.getByText(/It knows nothing of fences, walls, private land/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "Slower" }));
    await waitFor(() => expect(walks().at(-1)).toEqual({ at: "54.43000,-3.01000", minutes: "480", pace: "slower" }));
    expect(JSON.parse(localStorage.getItem("outpost.maps.reach")!)).toMatchObject({ mode: "walk", minutes: { walk: 480 }, pace: "slower" });
  });

  it("keeps the pace chosen when How far on foot was a tool of its own", async () => {
    localStorage.setItem("outpost.maps.walk", JSON.stringify({ minutes: 90, pace: "slowest" }));
    answerWalks((minutes) => reach(minutes));
    show();
    act(() => latest.start(AT, null, "walk"));
    expect(walks().at(-1)).toEqual({ at: "54.43000,-3.01000", minutes: "60", pace: "slowest" });
  });

  it("says when no map gives paths, and when no terrain is held, with where to get it", async () => {
    answerWalks((minutes) => reach(minutes, false));
    show();
    act(() => latest.start(AT, null, "walk"));
    expect(await screen.findByText(/No paths or roads from an installed map here/)).toBeInTheDocument();
    answerWalks((minutes) => ({ ...reach(minutes), coverage: "none", minutesGrid: "", groundMeters: null, furthestMeters: 0 }));
    fireEvent.click(within(screen.getByRole("radiogroup", { name: "Time" })).getByRole("radio", { name: "30 min" }));
    expect(await screen.findByText(/No terrain is held here/)).toBeInTheDocument();
    // Nothing to print without terrain.
    expect(screen.queryByRole("button", { name: "Print or save as PDF" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Stop showing what is reachable" }));
    await waitFor(() => expect(latest.card).toBeNull());
  });

  it("prints the rings with the paces and what the walk leaves out", async () => {
    const overlay = PRINT_OVERLAYS.find((each) => each.id === "walk")!;
    const context = { theme: { walk: "#c8620f", ink: "#000", page: "#fff" }, regions: [] } as never;
    expect(overlay.unavailable?.(context)).toMatch(/No walk is showing/);
    setWalkShown(reach(120));
    expect(overlay.unavailable?.(context)).toBeUndefined();
    expect(overlay.hint?.(context)).toMatch(/2 h on foot/);
    const draft = { data: {}, sources: {}, layers: [], notes: [] as string[] } as never as Parameters<typeof overlay.apply>[0];
    overlay.apply(draft, context, new Set());
    const notes = draft.notes.join(" ");
    expect(notes).toMatch(/Reachable on foot within 2 h from 54\.43000, -3\.01000/);
    expect(notes).toMatch(/rings every hour/);
    expect(notes).toMatch(/fit adult with no load/);
    expect(notes).toMatch(/Tobler's hiking function/);
    expect(notes).toMatch(/fences, walls, private land/);
    expect(draft.layers.map((layer) => layer.id)).toEqual(
      expect.arrayContaining(["print-walk-ring", "print-walk-label", "print-walk-start"]),
    );
  });

  it("is one entry in the map's menu at a point: Reachable from here, not a walk of its own", () => {
    const onReach = vi.fn();
    render(
      <ContextMenu
        point={{ x: 10, y: 10 }}
        bounds={{ width: 800, height: 600 }}
        coordinates="54.43000, -3.01000"
        onSave={() => {}}
        onMeasure={() => {}}
        onDraw={() => {}}
        onSun={() => {}}
        onReach={onReach}
        onClose={() => {}}
      />,
    );
    expect(screen.queryByRole("menuitem", { name: "How far on foot from here" })).toBeNull();
    fireEvent.click(screen.getByRole("menuitem", { name: "Reachable from here" }));
    expect(onReach).toHaveBeenCalledTimes(1);
  });
});
