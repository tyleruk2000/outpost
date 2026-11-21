import { RANGE_DEFAULT_AERIAL_METERS, rangeGrid, type SightRange } from "@outpost/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MapEngine } from "@/features/maps/map/engine";
import { discPaths } from "@/features/maps/radio/range-why";
import {
  aerialOf,
  DEFAULT_RANGE_PREFS,
  formatReach,
  formatShare,
  furthestOf,
  migrateRangePrefs,
  RANGE_KEY,
  RANGE_MOST,
  rangeBounds,
  rangeData,
  rangeLayers,
  rangeShade,
  readRange,
} from "./range";
import { rangeFixture } from "./range-fixture";
import { useRepeaterRange } from "./use-repeater-range";

const AT = { lat: 57, lon: -3.4 };
const range = (coverage: SightRange["coverage"], rule: Parameters<typeof rangeFixture>[1] = {}, at = AT) =>
  rangeFixture(coverage, rule, at);
/** Hemmed in by nearer slopes, open down one glen: in sight to 900 m, and to 31 km along a gap 1.5° wide to the north-east. */
const glen = () =>
  range("terrain", { seen: (bearing, meters) => meters <= 900 || (bearing >= 44.5 && bearing <= 45.5 && meters <= 31_000) });

describe("the estimate in words", () => {
  it("rounds a reach no finer than it is good for, with miles beside it, and a share as a person says it", () => {
    expect(formatReach(18_085)).toBe("18 km (11 mi)");
    expect(formatReach(4_300)).toBe("4.5 km (2.5 mi)");
    expect(formatReach(430)).toBe("400 m");
    expect(formatReach(100_000)).toBe("100 km (62 mi)");
    expect([0, 0.004, 0.12, 0.996].map(formatShare)).toEqual(["none", "under 1%", "12%", "all"]);
  });

  it("uses the listed aerial height, or the one assumed on this device where the list gives none", () => {
    expect(aerialOf(25, DEFAULT_RANGE_PREFS)).toEqual({ meters: 25, listed: true });
    expect(aerialOf(null, DEFAULT_RANGE_PREFS)).toEqual({ meters: RANGE_DEFAULT_AERIAL_METERS, listed: false });
    expect(RANGE_DEFAULT_AERIAL_METERS).toBe(10);
  });

  it("says the share in sight near and further out, and the furthest with its direction, not where most bearings end", () => {
    const reading = readRange(glen());
    expect(reading.title).toMatch(/^In sight: \d+% of the ground within 10 km, (under 1%|\d+%) within 25 km\.$/);
    expect(reading.furthest).toBe("The furthest ground in sight is 31 km (19 mi) away to the north-east, through a gap about 2° wide.");
    expect(reading.short).toMatch(/^\d+% in sight within 10 km, furthest 31 km north-east$/);
    expect(reading.needsTerrain).toBe(false);
    expect(furthestOf(glen())).toMatchObject({ meters: 31_000, bearingDeg: 44.5, widthDeg: 1.5 });

    const open = readRange(range("terrain"));
    expect(open.title).toBe("In sight: all of the ground within 10 km, 52% within 25 km.");
    expect(open.furthest).toBe("The furthest ground in sight is 18 km (11 mi) away to the north.");
    expect(open.short).toBe("All in sight within 10 km, furthest 18 km north");
    expect(readRange(range("partial")).short).toBe("All in sight within 10 km, furthest 18 km north, terrain partial");
  });

  it("keeps the station and assumed height from what an earlier version stored, and takes a range that was on as none chosen", () => {
    expect(migrateRangePrefs({ on: true, station: "roof", assumedAerial: 20 })).toEqual({ chosen: [], station: "roof", assumedAerial: 20 });
    expect(migrateRangePrefs({ on: false, station: "nonsense", assumedAerial: -1 })).toEqual(DEFAULT_RANGE_PREFS);
    expect(migrateRangePrefs(null)).toEqual(DEFAULT_RANGE_PREFS);
    const present = { chosen: ["a", "b"], station: "car", assumedAerial: 12 };
    expect(migrateRangePrefs(present)).toEqual(present);
  });
});

describe("the estimate on the map", () => {
  it("shades the ground in sight as one picture, clear where it is hidden, in the range's colour", () => {
    const picture = rangeShade(glen(), "#13905a", 200)!;
    const alpha = (x: number, y: number) => picture.pixels[(y * picture.width + x) * 4 + 3]!;
    const middle = Math.floor(picture.width / 2);
    // The aerial's own ground is in sight; the ground just beyond the slopes is clear.
    expect(alpha(middle, middle)).toBe(255);
    expect(Array.from(picture.pixels.slice((middle * picture.width + middle) * 4, (middle * picture.width + middle) * 4 + 3))).toEqual([
      0x13, 0x90, 0x5a,
    ]);
    expect(alpha(middle - 40, middle)).toBe(0);
    // Along the glen to the north-east, 20 km out, the ground is shaded.
    const out = Math.round((middle * 20) / 31.3);
    const glenPixels = [-1, 0, 1].map((step) =>
      alpha(middle + Math.round(out * Math.SQRT1_2) + step, middle - Math.round(out * Math.SQRT1_2)),
    );
    expect(Math.max(...glenPixels)).toBeGreaterThan(0);
    // The picture covers the box the map is fitted to.
    const [west, south, east, north] = rangeBounds(glen());
    expect(picture.coordinates).toEqual([
      [west, north],
      [east, north],
      [east, south],
      [west, south],
    ]);
    // Nothing to shade with no terrain: the plain circle is a shape.
    expect(rangeShade(range("none"), "#13905a")).toBeNull();
  });

  it("draws rings at 10, 25, 50 and 100 km out to the first beyond the ground in sight, each written once, and no spiky outline", () => {
    const data = rangeData(glen(), "QZ3RNG");
    const rings = data.features.filter((feature) => feature.properties.kind === "ring");
    expect(rings).toHaveLength(3);
    expect(data.features.filter((feature) => feature.properties.kind === "ring-label").map((feature) => feature.properties.label)).toEqual([
      "10 km",
      "25 km",
      "50 km",
    ]);
    expect(rings.every((ring) => ring.properties.name === "QZ3RNG" && ring.properties.dashed === false)).toBe(true);
    expect(data.features.some((feature) => feature.properties.kind === "edge")).toBe(false);
    const layers = rangeLayers({ ink: "#000", page: "#fff", range: "#13905a" } as never);
    const ring = layers.find((layer) => layer.id === "o-range-ring") as { paint: Record<string, unknown> };
    expect(ring.paint["line-color"]).toBe("#13905a");
    // With no terrain: a washed, dashed circle at the smooth-Earth horizon.
    const none = rangeData(range("none"));
    expect(none.features.map((feature) => feature.properties.kind)).toEqual(["area", "ring"]);
    expect(none.features[1]!.properties.dashed).toBe(true);
  });

  it("draws the disc of the why view from the same answer, with the ground not known told apart", () => {
    const answer = range("partial", { unknownFrom: (bearing) => (bearing < 90 ? 20_000 : 60_000) });
    const paths = discPaths(answer, rangeGrid(answer));
    expect(paths.seen.length).toBeGreaterThan(0);
    expect(paths.unknown.length).toBeGreaterThan(0);
    expect(discPaths(range("terrain"), rangeGrid(range("terrain"))).unknown).toBe("");
  });
});

// ── The switch in each repeater's card ──────────────────────────────────────

const engine = { setOverlay: vi.fn(), fitBounds: vi.fn(), setShades: vi.fn() };
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
let answerRange: (at: { lat: number; lon: number }) => Promise<Response> = (at) => json(range("terrain", {}, at));

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
        .features.filter((feature: { properties: { kind: string } }) => feature.properties.kind === "ring")
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
  answerRange = (at) => json(range("terrain", {}, at));
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
    expect(screen.getByText(/^In sight: all of the ground within 10 km, 52% within 25 km\.$/)).toBeInTheDocument();
    expect(screen.getByText("The furthest ground in sight is 18 km (11 mi) away to the north.")).toBeInTheDocument();
    expect(labelled()).toEqual(["QZ3RNG"]);
    await waitFor(() => expect(engine.fitBounds).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("button", { name: "Get terrain in Offline maps" })).toBeNull();
    // What it is not, behind one disclosure.
    await userEvent.click(screen.getByText("What this is, and is not"));
    expect(
      screen.getByText(/It takes no account of transmitter power, aerial gain or pattern, frequency, buildings and trees/),
    ).toBeVisible();
    expect(
      screen.getByText(
        /Ground read along 720 bearings, 0.5° apart: every 10 m out to 2 km, every 50 m to 25 km, every 100 m to 50 km and every 250 m to 100 km/,
      ),
    ).toBeVisible();

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

  it("with part of the area's terrain says more may be in sight beyond", async () => {
    answerRange = () => json(range("partial", { unknownFrom: (bearing) => (bearing < 30 ? 9000 : 30_000) }));
    show();
    await userEvent.click(screen.getByRole("switch", { name: "Estimated range" }));
    await unfold();
    expect(screen.getByText(/Terrain covers only part of the area within 100 km \(62 mi\)\.$/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Get terrain in Offline maps" })).toBeInTheDocument();
    // The fuller account is behind the disclosure.
    await userEvent.click(screen.getByText("What this is, and is not"));
    expect(
      screen.getByText(
        "Terrain is held for only part of the area within 100 km (62 mi). On 60 of 720 bearings it runs out while the ground is still in sight, so more may be in sight beyond.",
      ),
    ).toBeVisible();
  });

  it("says when it could not be worked out, and tries again", async () => {
    answerRange = () => json({ error: { code: "internal", message: "Something went wrong." } }, 500);
    show();
    await userEvent.click(screen.getByRole("switch", { name: "Estimated range" }));
    expect(await screen.findByText("The range could not be worked out")).toBeInTheDocument();
    answerRange = (at) => json(range("terrain", {}, at));
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    await unfold();
    expect(screen.getByText(/^In sight: all of the ground within 10 km, 52% within 25 km\.$/)).toBeInTheDocument();
    expect(screen.getByText("The furthest ground in sight is 18 km (11 mi) away to the north.")).toBeInTheDocument();
  });

  it("folds the card to one line once the outline is drawn, on a phone as on a wide screen, and unfolds it again", async () => {
    show(15, vi.fn(), true);
    await userEvent.click(screen.getByRole("switch", { name: "Estimated range" }));
    const folded = await screen.findByRole("region", { name: "QZ3RNG: estimated range" });
    expect(folded).toHaveTextContent(/QZ3RNG\s*All in sight within 10 km, furthest 18 km north$/);
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
    answerRange = (at) => (at.lat > 57.2 ? new Promise<Response>((resolve) => (late = resolve)) : json(range("terrain", {}, at)));
    show(15, vi.fn(), false, { open: null });
    // The one answered first is drawn without waiting for the other.
    await waitFor(() => expect(labelled()).toEqual(["QZ3RNG"]));
    late(await json(range("terrain", {}, { lat: 57.3, lon: -3.4 })));
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
