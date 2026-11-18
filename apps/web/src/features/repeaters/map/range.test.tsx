import { RANGE_BEARINGS, RANGE_DEFAULT_AERIAL_METERS, type SightRange } from "@outpost/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MapEngine } from "@/features/maps/map/engine";
import {
  aerialOf,
  DEFAULT_RANGE_PREFS,
  formatReach,
  migrateRangePrefs,
  RANGE_KEY,
  RANGE_MOST,
  rangeBounds,
  rangeData,
  rangeLayers,
  readRange,
} from "./range";
import { useRepeaterRange } from "./use-repeater-range";

const AT = { lat: 57, lon: -3.4 };

function range(
  coverage: SightRange["coverage"],
  shape: (bearing: number) => Partial<SightRange["bearings"][number]> = () => ({}),
  at = AT,
): SightRange {
  return {
    at,
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

  it("says a ridge and the share hidden", () => {
    const ridged = range("terrain", (bearing) =>
      bearing === 90 ? { reachMeters: 4000 } : bearing === 180 ? { furtherMeters: 41_000 } : {},
    );
    const reading = readRange(ridged);
    expect(reading.title).toBe("Ground in sight as far as about 18 km (11 mi) on most bearings, from 4 km (2.5 mi) to 18 km (11 mi).");
    // Said beside the answer: only the shaded ground is in sight.
    expect(reading.note).toBe("About 10% of the ground within it is hidden by nearer ground: only the shaded ground is in sight.");
    expect(reading.needsTerrain).toBe(false);
    // The few words for the folded card say the nearest as well, when none goes further than most.
    expect(reading.short).toBe("Mostly about 18 km, down to 4 km");
  });

  it("says a spike in the few words too, rather than only where most bearings end", () => {
    const spiked = readRange(range("terrain", (bearing) => (bearing === 45 ? { reachMeters: 8000 } : { reachMeters: 1000 })));
    expect(spiked.short).toBe("Mostly about 1 km, up to 8 km");
    expect(spiked.title).toBe("Ground in sight as far as about 1 km (0.5 mi) on most bearings, from 1 km (0.5 mi) to 8 km (5 mi).");
    expect(readRange(range("terrain")).short).toBe("In sight to about 18 km");
    expect(readRange(range("partial", (bearing) => (bearing === 90 ? { reachMeters: 41_000 } : {}))).short).toBe(
      "Mostly 18 km, up to 41 km, terrain partial",
    );
    expect(readRange(range("partial")).short).toBe("About 18 km, terrain partial");
  });

  it("labels each outline's edge with its repeater's callsign", () => {
    const data = rangeData(range("terrain"), "QZ3RNG");
    expect(data.features.filter((feature) => feature.properties.kind === "edge").every((edge) => edge.properties.name === "QZ3RNG")).toBe(
      true,
    );
    const label = rangeLayers({ ink: "#000", page: "#fff" } as never).find((layer) => layer.id === "o-range-label")!;
    expect((label.layout as Record<string, unknown>)["text-field"]).toEqual(["get", "name"]);
  });

  it("keeps the station and assumed height from what an earlier version stored, and takes a range that was on as none chosen", () => {
    expect(migrateRangePrefs({ on: true, station: "roof", assumedAerial: 20 })).toEqual({ chosen: [], station: "roof", assumedAerial: 20 });
    expect(migrateRangePrefs({ on: false, station: "nonsense", assumedAerial: -1 })).toEqual(DEFAULT_RANGE_PREFS);
    expect(migrateRangePrefs(null)).toEqual(DEFAULT_RANGE_PREFS);
    const present = { chosen: ["a", "b"], station: "car", assumedAerial: 12 };
    expect(migrateRangePrefs(present)).toEqual(present);
  });

  it("draws an outline with a dashed edge where terrain ran out, and a dashed circle with none", () => {
    const cut = rangeData(range("partial", (bearing) => (bearing >= 100 && bearing <= 120 ? { limit: "terrain", reachMeters: 9000 } : {})));
    const area = cut.features.find((feature) => feature.properties.kind === "area")!;
    // Shaded: a wedge for each stretch in sight on each bearing (here one each, from the aerial out).
    expect(area.geometry.type).toBe("MultiPolygon");
    expect(area.geometry.coordinates as unknown[]).toHaveLength(RANGE_BEARINGS);
    const edges = cut.features.filter((feature) => feature.properties.kind === "edge");
    // Solid, then dashed round the bearings that ran out, then solid again.
    expect(edges.map((edge) => edge.properties.dashed)).toEqual([false, true, false]);
    const none = rangeData(range("none"));
    expect(none.features.filter((feature) => feature.properties.kind === "edge").every((edge) => edge.properties.dashed)).toBe(true);
  });
});

// ── The switch in each repeater's card ──────────────────────────────────────

const engine = { setOverlay: vi.fn(), fitBounds: vi.fn() };
const fetched = vi.fn();
const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));

interface Held {
  id: string;
  callsign: string;
  lat: number;
  lon: number;
  antennaMeters: number | null;
}
/** The repeaters the server holds: r1 is QZ3RNG at AT, r2 to r9 are QZ3RN2 to QZ3RN9 further north. */
let held: Record<string, Held> = {};
/** How the server answers for an outline; by default, terrain all round at the place asked about. */
let answerRange: (at: { lat: number; lon: number }) => Promise<Response> = (at) => json(range("terrain", () => ({}), at));

function server(input: RequestInfo | URL) {
  const url = new URL(String(input), "http://outpost.test");
  if (url.pathname === "/api/maps/sight-range") {
    const [lat, lon] = url.searchParams.get("at")!.split(",").map(Number);
    return answerRange({ lat: lat!, lon: lon! });
  }
  const one = /^\/api\/repeaters\/([^/]+)$/.exec(url.pathname);
  if (one) {
    const repeater = held[one[1]!];
    return repeater ? json({ repeater, list: null }) : json({ error: { code: "not_found", message: "No such repeater." } }, 404);
  }
  return json({ error: { code: "not_found", message: "Not here." } }, 404);
}

/** The outlines asked of the server, as their places. */
const asked = () =>
  fetched.mock.calls
    .map(([input]) => new URL(String(input), "http://outpost.test"))
    .filter((url) => url.pathname === "/api/maps/sight-range");
const overlay = () => engine.setOverlay.mock.calls.at(-1)?.[1] ?? { features: [] };
/** The callsigns written along the outlines on the map now. */
const labelled = () =>
  [
    ...new Set(
      overlay()
        .features.filter((feature: { properties: { kind: string } }) => feature.properties.kind === "edge")
        .map((feature: { properties: { name: string } }) => feature.properties.name),
    ),
  ].sort();

function Harness({ open: first, visible, onOpenOffline }: { open: string | null; visible: boolean; onOpenOffline?: () => void }) {
  const [open, setOpen] = useState(first);
  const range = useRepeaterRange({
    engine: engine as unknown as MapEngine,
    visible,
    repeater: open ? held[open]! : null,
    onOpenOffline,
    onClose: () => setOpen(null),
  });
  return (
    <div>
      {Object.keys(held).map((id) => (
        <button key={id} type="button" onClick={() => setOpen(id)}>
          Open {held[id]!.callsign}
        </button>
      ))}
      <button type="button" onClick={() => setOpen(null)}>
        Close the card
      </button>
      {open ? (
        <div data-testid="card">
          {range.folded ?? (
            <>
              {range.foldButton}
              {range.control}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

/** A wide screen unless asked for a phone. QZ3RNG's card is open unless asked otherwise. */
function show(
  antennaMeters: number | null = 15,
  onOpenOffline = vi.fn(),
  phone = false,
  { open = "r1" as string | null, visible = true } = {},
) {
  vi.spyOn(window, "matchMedia").mockImplementation(
    (query: string) => ({ matches: !phone, media: query, addEventListener() {}, removeEventListener() {} }) as unknown as MediaQueryList,
  );
  held.r1!.antennaMeters = antennaMeters;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={client}>
      <Harness open={open} visible={visible} onOpenOffline={onOpenOffline} />
    </QueryClientProvider>,
  );
  return { onOpenOffline, view };
}

/** Once an outline is drawn the card is folded to one line; this opens it out again. */
async function unfold() {
  await userEvent.click(await screen.findByRole("button", { name: "Show the details" }));
}

const drawn = () => engine.setOverlay.mock.calls.filter(([, data]) => data.features.length > 0);
const stored = () => JSON.parse(localStorage.getItem(RANGE_KEY) ?? "null");

beforeEach(() => {
  localStorage.clear();
  engine.setOverlay.mockClear();
  engine.fitBounds.mockClear();
  held = {
    r1: { id: "r1", callsign: "QZ3RNG", ...AT, antennaMeters: 15 },
    ...Object.fromEntries(
      Array.from({ length: 8 }, (_, index) => [
        `r${index + 2}`,
        { id: `r${index + 2}`, callsign: `QZ3RN${index + 2}`, lat: 57.2 + index * 0.1, lon: -3.4, antennaMeters: 20 },
      ]),
    ),
  };
  answerRange = (at) => json(range("terrain", () => ({}), at));
  fetched.mockReset();
  fetched.mockImplementation(server);
  vi.stubGlobal("fetch", fetched);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("the estimated range switch", () => {
  it("is off at first, and then asks nothing and draws nothing", () => {
    show();
    expect(screen.getByRole("switch", { name: "Estimated range" })).not.toBeChecked();
    expect(fetched).not.toHaveBeenCalled();
    expect(drawn()).toEqual([]);
  });

  it("says it is working, then draws the outline from terrain and says what it rests on", async () => {
    let answer: (value: Response) => void = () => {};
    answerRange = () => new Promise<Response>((resolve) => (answer = resolve));
    show(15);
    await userEvent.click(screen.getByRole("switch", { name: "Estimated range" }));
    expect(screen.getByText("Working out the range from the terrain")).toBeInTheDocument();
    // Remembered on this device, for this repeater.
    expect(stored()).toMatchObject({ chosen: ["r1"], station: "handheld" });
    await waitFor(() => expect(asked()).toHaveLength(1));
    expect(asked()[0]!.pathname).toBe("/api/maps/sight-range");
    expect(Object.fromEntries(asked()[0]!.searchParams)).toEqual({ at: "57.00000,-3.40000", aerial: "15", station: "1.5" });
    // The heights and the limit are said, the listed height as listed.
    expect(
      screen.getByText(
        /Line of sight only\. Repeater aerial 15 m above the ground, as listed\. Handheld 1\.5 m: held at head height\. Out to 100 km/,
      ),
    ).toBeInTheDocument();

    answer(await json(range("terrain")));
    // Drawn, the card folds to one line and the outline is brought into view.
    await unfold();
    expect(screen.getByText("Ground in sight as far as about 18 km (11 mi) on most bearings.")).toBeInTheDocument();
    expect(labelled()).toEqual(["QZ3RNG"]);
    await waitFor(() => expect(engine.fitBounds).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("button", { name: "Get terrain in Offline maps" })).toBeNull();
    // What it is not, behind one disclosure.
    await userEvent.click(screen.getByText("What this is, and is not"));
    expect(
      screen.getByText(/It takes no account of transmitter power, aerial gain or pattern, frequency, buildings and trees/),
    ).toBeVisible();
    expect(screen.getByText(/Ground read every 100 m out to 25 km and every 250 m beyond/)).toBeVisible();

    // Another station asks again, with its own height: once, though the card and the map both want it.
    await userEvent.click(screen.getByRole("radio", { name: "Roof aerial" }));
    await waitFor(() => expect(asked()).toHaveLength(2));
    expect(asked()[1]!.searchParams.get("station")).toBe("8");
    // Switched off: the outline goes.
    await userEvent.click(screen.getByRole("switch", { name: "Estimated range" }));
    expect(overlay().features).toEqual([]);
    expect(stored().chosen).toEqual([]);
  });

  it("with no terrain says it is the smooth-Earth horizon and where terrain is got, and uses the assumed aerial height", async () => {
    answerRange = () => json(range("none"));
    const { onOpenOffline } = show(null);
    await userEvent.click(screen.getByRole("switch", { name: "Estimated range" }));
    await unfold();
    expect(screen.getByText("Without terrain: the smooth-Earth radio horizon, about 18 km (11 mi).")).toBeInTheDocument();
    expect(screen.getByText(/assumed: its list gives no height/)).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Repeater aerial" })).toHaveValue("10");
    expect(asked()[0]!.searchParams.get("aerial")).toBe("10");
    expect(screen.getByText("No terrain is held here, so it is a plain circle.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Get terrain in Offline maps" }));
    expect(onOpenOffline).toHaveBeenCalled();
  });

  it("with part of the area's terrain says the outline stops short", async () => {
    answerRange = () => json(range("partial", (bearing) => (bearing < 30 ? { limit: "terrain", reachMeters: 9000 } : {})));
    show();
    await userEvent.click(screen.getByRole("switch", { name: "Estimated range" }));
    await unfold();
    expect(screen.getByText(/Terrain covers only part of the area within 100 km \(62 mi\)\.$/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Get terrain in Offline maps" })).toBeInTheDocument();
    // The fuller account is behind the disclosure.
    await userEvent.click(screen.getByText("What this is, and is not"));
    expect(
      screen.getByText(
        "Terrain is held for only part of the area within 100 km (62 mi). On 6 of 72 bearings it runs out while the aerial is still in sight, so the outline stops short there and is dashed.",
      ),
    ).toBeVisible();
  });

  it("says when it could not be worked out, and tries again", async () => {
    answerRange = () => json({ error: { code: "internal", message: "Something went wrong." } }, 500);
    show();
    await userEvent.click(screen.getByRole("switch", { name: "Estimated range" }));
    expect(await screen.findByText("The range could not be worked out")).toBeInTheDocument();
    answerRange = (at) => json(range("terrain", () => ({}), at));
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    await unfold();
    expect(screen.getByText("Ground in sight as far as about 18 km (11 mi) on most bearings.")).toBeInTheDocument();
  });

  it("folds the card to one line once the outline is drawn, on a phone as on a wide screen, and unfolds it again", async () => {
    show(15, vi.fn(), true);
    await userEvent.click(screen.getByRole("switch", { name: "Estimated range" }));
    const folded = await screen.findByRole("region", { name: "QZ3RNG: estimated range" });
    expect(folded).toHaveTextContent(/QZ3RNG\s*In sight to about 18 km$/);
    expect(screen.queryByRole("radio", { name: "Handheld" })).toBeNull();
    await waitFor(() => expect(engine.fitBounds).toHaveBeenCalledTimes(1));
    await userEvent.click(screen.getByRole("button", { name: "Show the details" }));
    expect(screen.getByRole("radio", { name: "Handheld" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Show less" }));
    expect(screen.getByRole("region", { name: "QZ3RNG: estimated range" })).toBeInTheDocument();
    // Switched off from the folded card: the card opens out again and the outline goes.
    await userEvent.click(screen.getByRole("switch", { name: "Estimated range" }));
    expect(screen.getByRole("switch", { name: "Estimated range" })).not.toBeChecked();
    expect(screen.queryByRole("region", { name: "QZ3RNG: estimated range" })).toBeNull();
    expect(overlay().features).toEqual([]);
  });
});

describe("ranges chosen repeater by repeater", () => {
  it("switches on for one repeater only, keeps each outline after its card closes, and labels each", async () => {
    show();
    await userEvent.click(screen.getByRole("switch", { name: "Estimated range" }));
    await screen.findByRole("region", { name: "QZ3RNG: estimated range" });
    await waitFor(() => expect(engine.fitBounds).toHaveBeenCalledTimes(1));

    // Another repeater's switch is its own, and off.
    await userEvent.click(screen.getByRole("button", { name: "Open QZ3RN2" }));
    expect(screen.getByRole("switch", { name: "Estimated range" })).not.toBeChecked();
    expect(labelled()).toEqual(["QZ3RNG"]);
    await userEvent.click(screen.getByRole("switch", { name: "Estimated range" }));
    await screen.findByRole("region", { name: "QZ3RN2: estimated range" });
    await waitFor(() => expect(labelled()).toEqual(["QZ3RN2", "QZ3RNG"]));
    // The map is fitted to the one just switched on, not to both.
    await waitFor(() => expect(engine.fitBounds).toHaveBeenCalledTimes(2));
    const [south, , north] = [engine.fitBounds.mock.calls[1]![0][1], 0, engine.fitBounds.mock.calls[1]![0][3]];
    expect((south + north) / 2).toBeCloseTo(57.2, 1);
    expect(stored().chosen).toEqual(["r1", "r2"]);

    // Closed, both stay; each was asked of the server once.
    await userEvent.click(screen.getByRole("button", { name: "Close the card" }));
    expect(labelled()).toEqual(["QZ3RN2", "QZ3RNG"]);
    expect(asked()).toHaveLength(2);

    // The first opened again shows its switch on, and switched off there it goes alone.
    await userEvent.click(screen.getByRole("button", { name: "Open QZ3RNG" }));
    expect(screen.getByRole("switch", { name: "Estimated range" })).toBeChecked();
    expect(screen.getByText("2 ranges are shown on the map.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("switch", { name: "Estimated range" }));
    expect(labelled()).toEqual(["QZ3RN2"]);
    expect(screen.queryByText(/ranges are shown on the map/)).toBeNull();
  });

  it("is remembered on this device: drawn again with no card open, each asked once, as they come", async () => {
    localStorage.setItem(RANGE_KEY, JSON.stringify({ chosen: ["r1", "r3"], station: "car", assumedAerial: 10 }));
    let late: (value: Response) => void = () => {};
    answerRange = (at) => (at.lat > 57.2 ? new Promise<Response>((resolve) => (late = resolve)) : json(range("terrain", () => ({}), at)));
    show(15, vi.fn(), false, { open: null });
    // The one answered first is drawn without waiting for the other.
    await waitFor(() => expect(labelled()).toEqual(["QZ3RNG"]));
    late(await json(range("terrain", () => ({}), { lat: 57.3, lon: -3.4 })));
    await waitFor(() => expect(labelled()).toEqual(["QZ3RN3", "QZ3RNG"]));
    expect(asked()).toHaveLength(2);
    expect(asked().every((url) => url.searchParams.get("station") === "2")).toBe(true);
    // Nothing is fitted or folded for ranges that were already on.
    expect(engine.fitBounds).not.toHaveBeenCalled();
  });

  it("migrates what an earlier version stored: the station and height kept, nothing chosen", async () => {
    localStorage.setItem(RANGE_KEY, JSON.stringify({ on: true, station: "roof", assumedAerial: 20 }));
    show(null);
    expect(screen.getByRole("switch", { name: "Estimated range" })).not.toBeChecked();
    expect(fetched).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("switch", { name: "Estimated range" }));
    await waitFor(() => expect(asked()).toHaveLength(1));
    expect(Object.fromEntries(asked()[0]!.searchParams)).toMatchObject({ aerial: "20", station: "8" });
    expect(stored()).toEqual({ chosen: ["r1"], station: "roof", assumedAerial: 20 });
  });

  it(`shows at most ${RANGE_MOST}, says so rather than refusing quietly, and hides them all`, async () => {
    const eight = Array.from({ length: RANGE_MOST }, (_, index) => `r${index + 2}`);
    localStorage.setItem(RANGE_KEY, JSON.stringify({ chosen: eight, station: "handheld", assumedAerial: 10 }));
    show();
    await waitFor(() => expect(labelled()).toHaveLength(RANGE_MOST));
    expect(screen.getByText(`${RANGE_MOST} ranges are shown on the map.`)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("switch", { name: "Estimated range" }));
    expect(screen.getByRole("switch", { name: "Estimated range" })).not.toBeChecked();
    expect(
      screen.getByText(
        `${RANGE_MOST} ranges are shown, as many as can be at once. Switch one off in its card, or hide them all, to show this one.`,
      ),
    ).toBeInTheDocument();
    expect(stored().chosen).toEqual(eight);

    await userEvent.click(screen.getByRole("button", { name: "Hide all ranges" }));
    expect(overlay().features).toEqual([]);
    expect(stored().chosen).toEqual([]);
    expect(screen.queryByRole("button", { name: "Hide all ranges" })).toBeNull();
    // With room again, this one switches on.
    await userEvent.click(screen.getByRole("switch", { name: "Estimated range" }));
    await waitFor(() => expect(labelled()).toEqual(["QZ3RNG"]));
  });

  it("drops quietly a chosen repeater that is no longer held", async () => {
    localStorage.setItem(RANGE_KEY, JSON.stringify({ chosen: ["gone", "r1"], station: "handheld", assumedAerial: 10 }));
    show(15, vi.fn(), false, { open: null });
    await waitFor(() => expect(labelled()).toEqual(["QZ3RNG"]));
    await waitFor(() => expect(stored().chosen).toEqual(["r1"]));
    expect(asked()).toHaveLength(1);
  });

  it("asks nothing while none is chosen, or while the map's repeaters are off", () => {
    show(15, vi.fn(), false, { open: null });
    expect(fetched).not.toHaveBeenCalled();
    localStorage.setItem(RANGE_KEY, JSON.stringify({ chosen: ["r1"], station: "handheld", assumedAerial: 10 }));
    show(15, vi.fn(), false, { open: null, visible: false });
    expect(fetched).not.toHaveBeenCalled();
    expect(drawn()).toEqual([]);
  });
});

describe("what is in sight from a summit", () => {
  // As from Scafell Pike: the slopes just below are out of sight at once, other hills far off are in sight.
  const summit = (bearing: number) => ({
    reachMeters: 100,
    furthestMeters: 60_000,
    runs: [
      [0, 150],
      [25_000, 32_000],
      [55_000, 60_000],
    ] as Array<[number, number]>,
    outlineLimit: "sight" as const,
    bearingDeg: bearing,
  });

  it("draws the outline at the furthest ground in sight, shades only the stretches in sight, and says most is hidden", () => {
    const answer = { ...range("terrain", summit), hiddenShare: 0.82 };
    const reading = readRange(answer, "here");
    expect(reading.title).toBe("Ground in sight as far as about 60 km (37 mi) on most bearings.");
    expect(reading.note).toBe("About 80% of the ground within it is hidden by nearer ground: only the shaded ground is in sight.");
    expect(reading.needsTerrain).toBe(false);
    const data = rangeData(answer, "Scafell Pike");
    const area = data.features.find((feature) => feature.properties.kind === "area")!;
    expect(area.geometry.coordinates as unknown[]).toHaveLength(RANGE_BEARINGS * 3);
    // The outline is out at 60 km, not at the 100 m where the first slope falls away.
    const [west, south, east, north] = rangeBounds(answer);
    expect(north - south).toBeGreaterThan(1);
    expect(east - west).toBeGreaterThan(1.5);
  });
});
