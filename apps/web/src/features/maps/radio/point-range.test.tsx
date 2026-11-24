/**
 * "Estimated radio range from here": the repeaters' estimate for any point, from the long-press and right-click menu.
 * Every figure here is made up for the test.
 */
import type { SightRange, SightRangeEvent, TerrainProfile } from "@outpost/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { rangeFixture } from "@/features/repeaters/map/range-fixture";
import { api } from "@/lib/api";
import type { MapEngine } from "../map/engine";
import { ContextMenu } from "../map-chrome";
import { type PointRange, pointRangePath, readPointRangePath, usePointRange } from "./point-range";

vi.mock("@/lib/api", () => ({
  api: { get: vi.fn(), lines: vi.fn() },
  errorMessage: (error: unknown) => String(error),
  ApiError: class extends Error {},
}));
const asked = vi.mocked(api.get);
/** The range is asked a line at a time. */
const streamed = vi.mocked(api.lines);
const rangeCalls = () => streamed.mock.calls.filter(([path]) => path === "/api/maps/sight-range");

/** In sight to 18 km on the eastern half of the compass and to 6 km on the western; along any path, a valley. */
function rangeAt(coverage: SightRange["coverage"], query?: Record<string, unknown>) {
  const [lat, lon] = String(query?.at).split(",").map(Number) as [number, number];
  return rangeFixture(
    coverage,
    { seen: (bearing, meters) => meters <= (bearing < 180 ? 18_000 : 6_000), groundMeters: 978 },
    { lat, lon },
    { aerialMeters: Number(query?.aerial), stationMeters: Number(query?.station) },
  );
}

/**
 * The server's lines for a range: how long the last took, the share done, the range to 25 km, then the whole. With
 * `hold`, it stops after the part and waits until it is given up (what the server does while it reads the far ground).
 */
function lines(coverage: SightRange["coverage"], options: { hold?: (query: Record<string, unknown>) => boolean } = {}) {
  return async (_path: string, query: Record<string, unknown> | undefined, onLine: (line: never) => void, signal?: AbortSignal) => {
    const range = rangeAt(coverage, query);
    const say = (line: SightRangeEvent) => onLine(line as never);
    say({ type: "start", done: 0, expectMs: 2100 });
    say({ type: "progress", done: 0.07 });
    if (options.hold?.(query ?? {})) {
      say({ type: "part", done: 0.32, range: { ...range, maxMeters: 25_000 } });
      await new Promise((_, reject) => signal?.addEventListener("abort", () => reject(new DOMException("Given up", "AbortError"))));
    }
    say({ type: "end", done: 1, range });
  };
}

function answer(coverage: SightRange["coverage"]) {
  streamed.mockImplementation(lines(coverage) as never);
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
    return Promise.resolve(rangeAt(coverage, query)) as never;
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
  streamed.mockReset();
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
    expect(streamed).not.toHaveBeenCalled();
  });

  it("works out the range from the point with a handheld at both ends, says it in the repeaters' words, and brings it into view", async () => {
    asked.mockImplementation(answer("terrain"));
    show();
    act(() => latest.start({ position: { lat: 54.4542, lon: -3.2116 }, name: "Scafell Pike" }));
    expect(screen.getByRole("heading", { name: "Estimated radio range" })).toBeInTheDocument();
    // Folded to the answer in a few words, so that the shading has the map; opened out with one press.
    expect(await screen.findByText(/^\d+% in sight within 10 km/)).toBeInTheDocument();
    unfold();
    expect(streamed).toHaveBeenCalledWith(
      "/api/maps/sight-range",
      { at: "54.45420,-3.21160", aerial: "1.5", station: "1.5" },
      expect.any(Function),
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
    await waitFor(() =>
      expect(streamed).toHaveBeenLastCalledWith(
        "/api/maps/sight-range",
        { at: "54.45420,-3.21160", aerial: "10", station: "8" },
        expect.any(Function),
        expect.anything(),
      ),
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

describe("while the range is worked out", () => {
  const SCAFELL = { lat: 54.4542, lon: -3.2116 };
  const openHeights = () => {
    unfold();
    fireEvent.click(screen.getByRole("button", { name: /^Heights and details/ }));
  };

  it("shows how far along it is and how long the last took here, and draws the near ground first", async () => {
    asked.mockImplementation(answer("terrain"));
    streamed.mockImplementation(lines("terrain", { hold: () => true }) as never);
    show();
    act(() => latest.start({ position: SCAFELL }));
    unfold();
    const bar = await screen.findByRole("progressbar", { name: "Working out the range" });
    await waitFor(() => expect(bar).toHaveAttribute("aria-valuenow", "32"));
    // The ground in sight out to 25 km is on the map before the rest is known, and the card says so.
    expect(latest.outline?.range.maxMeters).toBe(25_000);
    expect(latest.outline?.dim).toBe(false);
    expect(screen.getByText("The ground in sight out to 25 km is drawn; working out the ground further out.")).toBeInTheDocument();
    // Said politely, in the region the answer will be read out from.
    expect(screen.getByText(/out to 25 km is drawn/).closest("[aria-live]")).toHaveAttribute("aria-live", "polite");
  });

  it("before anything is drawn, says what it is doing and about how long it took here last time", async () => {
    asked.mockImplementation(answer("terrain"));
    streamed.mockImplementation((async (_path: string, _query: unknown, onLine: (line: never) => void, signal?: AbortSignal) => {
      onLine({ type: "start", done: 0, expectMs: 2100 } as never);
      await new Promise((_, reject) => signal?.addEventListener("abort", () => reject(new DOMException("Given up", "AbortError"))));
    }) as never);
    show();
    act(() => latest.start({ position: SCAFELL }));
    expect(await screen.findByText("Working out the range, about 2 s")).toBeInTheDocument();
    unfold();
    expect(screen.getByText("Working out the range from the ground's shape, about 2 s on this Outpost.")).toBeInTheDocument();
    expect(latest.outline).toBeNull();
  });

  it("asks once for heights stepped through quickly, not once for each", async () => {
    asked.mockImplementation(answer("terrain"));
    show();
    act(() => latest.start({ position: SCAFELL }));
    await screen.findByText(/in sight within 10 km/);
    openHeights();
    const field = screen.getByLabelText("Your aerial");
    for (const value of ["1", "1.5", "5", "10"]) fireEvent.change(field, { target: { value } });
    fireEvent.click(screen.getByRole("radio", { name: "Car" }));
    await waitFor(() => expect(rangeCalls()).toHaveLength(2));
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(rangeCalls().map(([, query]) => query)).toEqual([
      { at: "54.45420,-3.21160", aerial: "1.5", station: "1.5" },
      { at: "54.45420,-3.21160", aerial: "10", station: "2" },
    ]);
  });

  it("keeps the last answer on the map, faded, while other heights are worked out, and gives up what is no longer wanted", async () => {
    asked.mockImplementation(answer("terrain"));
    const signals: AbortSignal[] = [];
    const held = lines("terrain", { hold: (query) => query.aerial !== "1.5" });
    streamed.mockImplementation(((path: string, query: Record<string, unknown>, onLine: never, signal: AbortSignal) => {
      signals.push(signal);
      return held(path, query, onLine, signal);
    }) as never);
    show();
    act(() => latest.start({ position: SCAFELL }));
    await screen.findByText(/in sight within 10 km/);
    const first = latest.outline!;
    expect(first.dim).toBe(false);
    openHeights();
    // Asked for 10 m: the answer is held back, as a far read would be.
    streamed.mockImplementationOnce(((_path: string, _query: Record<string, unknown>, onLine: never, signal: AbortSignal) => {
      signals.push(signal);
      return (async () => {
        (onLine as (line: SightRangeEvent) => void)({ type: "start", done: 0, expectMs: 2100 });
        await new Promise((_, reject) => signal.addEventListener("abort", () => reject(new DOMException("Given up", "AbortError"))));
      })();
    }) as never);
    fireEvent.change(screen.getByLabelText("Your aerial"), { target: { value: "10" } });
    await waitFor(() => expect(rangeCalls()).toHaveLength(2));
    // Never a blank map: the last answer stays, faded, and the card says why.
    await waitFor(() => expect(latest.outline?.dim).toBe(true));
    expect(latest.outline?.range).toBe(first.range);
    expect(await screen.findByText(/The last answer stays on the map, faded, until this one is ready\./)).toBeInTheDocument();
    // Changed again before it came: the question for 10 m is given up, so the server stops working on it.
    fireEvent.change(screen.getByLabelText("Your aerial"), { target: { value: "1.5" } });
    await waitFor(() => expect(signals[1]!.aborted).toBe(true));
    await waitFor(() => expect(latest.outline?.dim).toBe(false));
  });
});

describe("a shared estimated range", () => {
  it("is an address with the point, the name and both heights, read back as it was", () => {
    const path = pointRangePath({ position: { lat: 54.4542, lon: -3.2116 }, name: "Scafell Pike" }, { aerial: 10, station: "roof" });
    expect(path).toBe("/maps?lat=54.45420&lon=-3.21160&z=12&range=10&station=roof&name=Scafell+Pike");
    expect(readPointRangePath(new URL(path, "http://outpost.local").searchParams)).toEqual({
      position: { lat: 54.4542, lon: -3.2116 },
      name: "Scafell Pike",
      heights: { aerial: 10, station: "roof" },
    });
  });

  it("is not read from a plain camera link or from heights that cannot be", () => {
    const read = (query: string) => readPointRangePath(new URLSearchParams(query));
    expect(read("lat=54.4&lon=-3.2&z=12")).toBeNull();
    expect(read("lat=54.4&lon=-3.2&range=-1")).toBeNull();
    expect(read("lat=54.4&lon=-3.2&range=1.5&station=boat")).toBeNull();
    expect(read("lon=-3.2&range=1.5")).toBeNull();
    expect(read("lat=54.4&lon=-3.2&range=1.5")?.heights).toEqual({ aerial: 1.5, station: "handheld" });
  });

  it("opened, is worked out with the heights it came with, and its QR code holds them", async () => {
    asked.mockImplementation(answer("terrain"));
    show();
    act(() => latest.start({ position: { lat: 54.4542, lon: -3.2116 }, heights: { aerial: 10, station: "car" } }));
    await screen.findByText(/^\d+% in sight within 10 km/);
    expect(streamed).toHaveBeenCalledWith(
      "/api/maps/sight-range",
      { at: "54.45420,-3.21160", aerial: "10", station: "2" },
      expect.any(Function),
      expect.anything(),
    );
    // Not first with the heights remembered here: the phone asks once.
    await new Promise((resolve) => setTimeout(resolve, 700));
    expect(rangeCalls()).toHaveLength(1);
    // Remembered here as the heights now in use, as any change of them is.
    expect(JSON.parse(localStorage.getItem("outpost.maps.pointRange")!)).toEqual({ aerial: 10, station: "car" });
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
