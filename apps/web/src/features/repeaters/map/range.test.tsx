import { RANGE_BEARINGS, RANGE_DEFAULT_AERIAL_METERS, type SightRange } from "@outpost/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MapEngine } from "@/features/maps/map/engine";
import { aerialOf, DEFAULT_RANGE_PREFS, formatReach, RANGE_KEY, rangeData, readRange } from "./range";
import { useRepeaterRange } from "./use-repeater-range";

const AT = { lat: 57, lon: -3.4 };

function range(
  coverage: SightRange["coverage"],
  shape: (bearing: number) => Partial<SightRange["bearings"][number]> = () => ({}),
): SightRange {
  return {
    at: AT,
    aerialMeters: 10,
    stationMeters: 1.5,
    maxMeters: 100_000,
    nearStepMeters: 100,
    farStepMeters: 250,
    nearMeters: 25_000,
    coverage,
    groundMeters: coverage === "none" ? null : 100,
    horizonMeters: 18_085,
    bearings:
      coverage === "none"
        ? []
        : Array.from({ length: RANGE_BEARINGS }, (_, index) => ({
            bearingDeg: index * 5,
            reachMeters: 18_000,
            limit: "sight" as const,
            furtherMeters: null,
            unknownFromMeters: coverage === "partial" ? 30_000 : null,
            ...shape(index * 5),
          })),
    hiddenShare: coverage === "none" ? null : 0.12,
    terrain: coverage === "none" ? null : { finestCellMeters: 92, coarsestCellMeters: 184, installedMaxZoom: 12 },
  };
}

describe("the estimate in words and on the map", () => {
  it("rounds a reach no finer than it is good for, with miles beside it", () => {
    expect(formatReach(18_085)).toBe("18 km (11 mi)");
    expect(formatReach(4_300)).toBe("4.5 km (2.5 mi)");
    expect(formatReach(430)).toBe("400 m");
    expect(formatReach(100_000)).toBe("100 km (62 mi)");
  });

  it("uses the listed aerial height, or the one assumed on this device where the list gives none", () => {
    expect(aerialOf(25, DEFAULT_RANGE_PREFS)).toEqual({ meters: 25, listed: true });
    expect(aerialOf(null, DEFAULT_RANGE_PREFS)).toEqual({ meters: RANGE_DEFAULT_AERIAL_METERS, listed: false });
    expect(RANGE_DEFAULT_AERIAL_METERS).toBe(10);
  });

  it("says a ridge, the share hidden and high ground beyond", () => {
    const ridged = range("terrain", (bearing) =>
      bearing === 90 ? { reachMeters: 4000 } : bearing === 180 ? { furtherMeters: 41_000 } : {},
    );
    const reading = readRange(ridged);
    expect(reading.title).toBe("In sight to about 18 km (11 mi) on most bearings, from 4 km (2.5 mi) to 18 km (11 mi).");
    expect(reading.sentences).toContain("About 10% of the ground inside the outline is hidden from the aerial by nearer ground.");
    expect(reading.sentences).toContain("Higher ground beyond the outline is in sight again on 1 bearing, up to 41 km (25 mi) away.");
    expect(reading.needsTerrain).toBe(false);
  });

  it("draws an outline with a dashed edge where terrain ran out, and a dashed circle with none", () => {
    const cut = rangeData(range("partial", (bearing) => (bearing >= 100 && bearing <= 120 ? { limit: "terrain", reachMeters: 9000 } : {})));
    const area = cut.features.find((feature) => feature.properties.kind === "area")!;
    expect((area.geometry.coordinates as number[][][])[0]).toHaveLength(RANGE_BEARINGS + 1);
    const edges = cut.features.filter((feature) => feature.properties.kind === "edge");
    // Solid, then dashed round the bearings that ran out, then solid again.
    expect(edges.map((edge) => edge.properties.dashed)).toEqual([false, true, false]);
    const none = rangeData(range("none"));
    expect(none.features.filter((feature) => feature.properties.kind === "edge").every((edge) => edge.properties.dashed)).toBe(true);
  });
});

// ── The switch in the repeater's card ───────────────────────────────────────

const engine = { setOverlay: vi.fn(), fitBounds: vi.fn(), isInView: () => false };
const fetched = vi.fn();
const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));

function Harness({ antennaMeters, onOpenOffline }: { antennaMeters: number | null; onOpenOffline?: () => void }) {
  const range = useRepeaterRange({
    engine: engine as unknown as MapEngine,
    repeater: { id: "r1", ...AT, antennaMeters },
    onOpenOffline,
  });
  return <div>{range.control}</div>;
}

function show(antennaMeters: number | null = 15, onOpenOffline = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <Harness antennaMeters={antennaMeters} onOpenOffline={onOpenOffline} />
    </QueryClientProvider>,
  );
  return { onOpenOffline };
}

const drawn = () => engine.setOverlay.mock.calls.filter(([, data]) => data.features.length > 0);

beforeEach(() => {
  localStorage.clear();
  engine.setOverlay.mockClear();
  engine.fitBounds.mockClear();
  fetched.mockReset();
  vi.stubGlobal("fetch", fetched);
});
afterEach(() => vi.unstubAllGlobals());

describe("the estimated range switch", () => {
  it("is off at first, and then asks nothing and draws nothing", () => {
    show();
    expect(screen.getByRole("switch", { name: "Estimated range" })).not.toBeChecked();
    expect(screen.getByText("Where its aerial is in line of sight over the ground.")).toBeInTheDocument();
    expect(fetched).not.toHaveBeenCalled();
    expect(drawn()).toEqual([]);
  });

  it("says it is working, then draws the outline from terrain and says what it rests on", async () => {
    let answer: (value: Response) => void = () => {};
    fetched.mockReturnValue(new Promise<Response>((resolve) => (answer = resolve)));
    show(15);
    await userEvent.click(screen.getByRole("switch", { name: "Estimated range" }));
    expect(screen.getByText("Working out the range from the terrain")).toBeInTheDocument();
    // Remembered on this device.
    expect(JSON.parse(localStorage.getItem(RANGE_KEY)!)).toMatchObject({ on: true, station: "handheld" });
    const url = new URL(String(fetched.mock.calls[0]![0]), "http://outpost.test");
    expect(url.pathname).toBe("/api/maps/sight-range");
    expect(Object.fromEntries(url.searchParams)).toEqual({ at: "57.00000,-3.40000", aerial: "15", station: "1.5" });
    // The heights and the limit are said, the listed height as listed.
    expect(
      screen.getByText(/Repeater aerial 15 m above the ground, as listed\. Handheld 1\.5 m: held at head height\. Out to 100 km/),
    ).toBeInTheDocument();

    answer(await json(range("terrain")));
    expect(await screen.findByText("In sight to about 18 km (11 mi) on most bearings.")).toBeInTheDocument();
    expect(drawn()).toHaveLength(1);
    expect(engine.fitBounds).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "Offline maps" })).toBeNull();
    // What it is not, behind one disclosure.
    await userEvent.click(screen.getByText("What this is, and is not"));
    expect(
      screen.getByText(/It takes no account of transmitter power, aerial gain or pattern, frequency, buildings and trees/),
    ).toBeVisible();
    expect(screen.getByText(/Ground read every 100 m out to 25 km and every 250 m beyond/)).toBeVisible();

    // Another station asks again, with its own height.
    fetched.mockReturnValue(json(range("terrain")));
    await userEvent.click(screen.getByRole("radio", { name: "Roof aerial" }));
    await waitFor(() => expect(fetched).toHaveBeenCalledTimes(2));
    expect(new URL(String(fetched.mock.calls[1]![0]), "http://outpost.test").searchParams.get("station")).toBe("8");
    // Switched off: the outline goes.
    await userEvent.click(screen.getByRole("switch", { name: "Estimated range" }));
    expect(engine.setOverlay.mock.calls.at(-1)![1].features).toEqual([]);
  });

  it("with no terrain says it is the smooth-Earth horizon and where terrain is got, and uses the assumed aerial height", async () => {
    fetched.mockReturnValue(json(range("none")));
    const { onOpenOffline } = show(null);
    await userEvent.click(screen.getByRole("switch", { name: "Estimated range" }));
    expect(await screen.findByText("Without terrain: the smooth-Earth radio horizon, about 18 km (11 mi).")).toBeInTheDocument();
    expect(screen.getByText(/assumed: its list gives no height/)).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Repeater aerial" })).toHaveValue("10");
    expect(new URL(String(fetched.mock.calls[0]![0]), "http://outpost.test").searchParams.get("aerial")).toBe("10");
    await userEvent.click(screen.getByRole("button", { name: "Offline maps" }));
    expect(onOpenOffline).toHaveBeenCalled();
  });

  it("with part of the area's terrain says the outline stops short", async () => {
    fetched.mockReturnValue(json(range("partial", (bearing) => (bearing < 30 ? { limit: "terrain", reachMeters: 9000 } : {}))));
    show();
    await userEvent.click(screen.getByRole("switch", { name: "Estimated range" }));
    expect(
      await screen.findByText(
        "Terrain is held for only part of the area within 100 km (62 mi). On 6 of 72 bearings it runs out while the aerial is still in sight, so the outline stops short there and is dashed.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Offline maps" })).toBeInTheDocument();
  });

  it("says when it could not be worked out, and tries again", async () => {
    fetched.mockReturnValue(json({ error: { code: "internal", message: "Something went wrong." } }, 500));
    show();
    await userEvent.click(screen.getByRole("switch", { name: "Estimated range" }));
    expect(await screen.findByText("The range could not be worked out")).toBeInTheDocument();
    fetched.mockReturnValue(json(range("terrain")));
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("In sight to about 18 km (11 mi) on most bearings.")).toBeInTheDocument();
  });
});
