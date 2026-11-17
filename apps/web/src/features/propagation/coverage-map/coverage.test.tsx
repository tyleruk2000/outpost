import type { CoverageCell, CoverageRequest, CoverageResult, MarkerDto, SavedCoverage } from "@outpost/shared";
import { ANTENNA_PRESETS, coverageGrid } from "@outpost/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useEffect } from "react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { coverageFeatures } from "../map/layers";
import type { PlanMapProps } from "../map/plan-map";
import CoveragePage from "./coverage-page";
import { areaAround, areaOf, coverageRequestOf, EXAMPLE_AREA, exampleCoverageForm } from "./data";

// The map itself needs WebGL, which the test's browser has not got. What stands in for
// it shows what it was handed and lets a test press a place on it.
vi.mock("../map/plan-map", () => ({
  PlanMap: ({ label, data, places, onPress, onReady, onMoved }: PlanMapProps) => {
    // biome-ignore lint/correctness/useExhaustiveDependencies: said once, as the real map does when it is drawn
    useEffect(() => {
      onReady?.({ bounds: () => [-11, 49, 3, 59] });
      onMoved?.([-11, 49, 3, 59]);
    }, []);
    return (
      <section aria-label={label}>
        <output data-testid="features">{data?.features.map((feature) => feature.properties.kind).join(",")}</output>
        <button type="button" onClick={() => onPress?.({ position: { lat: 50.5, lon: -7 }, place: null })}>
          press the south-west cell
        </button>
        <button type="button" onClick={() => onPress?.({ position: { lat: 57, lon: 1 }, place: null })}>
          press the north-east cell
        </button>
        <button type="button" onClick={() => onPress?.({ position: { lat: 20, lon: 20 }, place: null })}>
          press outside
        </button>
        {places?.map((place) => (
          <button key={place.id} type="button" onClick={() => onPress?.({ position: { lat: place.lat, lon: place.lon }, place })}>
            press {place.name}
          </button>
        ))}
      </section>
    );
  },
}));

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

const dipole = ANTENNA_PRESETS[0]!.spec;
const request: CoverageRequest = {
  tx: { name: "London", lat: 51.51, lon: -0.13 },
  date: "2026-11-16",
  powerWatts: 5,
  txAntenna: dipole,
  rxAntenna: dipole,
  noise: "city",
  frequencyMhz: 7.1,
  mode: "ssb",
  solar: { source: "table" },
  area: EXAMPLE_AREA,
  resolution: "coarse",
};

const day = (value: number | null) => Array.from({ length: 24 }, () => value);
const cellOf = (reliability: number, snr: number, signal: number): CoverageCell => ({
  distanceKm: 504,
  bearingDeg: 321,
  reliability: day(reliability),
  snrDbHz: day(snr),
  signalDbw: day(signal),
});

/** Two cells by two: 55% in the south-west, 5% beside it, a cell the engine did not answer, and one with no path at any hour. */
function mapOf(patch: Partial<CoverageResult> = {}): CoverageResult {
  const grid = { ...coverageGrid(EXAMPLE_AREA, "coarse"), columns: 2, rows: 2, lonStep: 7, latStep: 5 };
  return {
    key: "a".repeat(40),
    request,
    computedAt: Date.UTC(2026, 10, 16, 10, 12),
    cached: false,
    tookMs: 700,
    engine: { id: "voacap", name: "VOACAP", model: "Version 16.1207W", implementation: "hfcast 2.14.0" } as CoverageResult["engine"],
    datasets: [{ id: "voacap-coefficients", version: "hfcast-1" }],
    basis: {
      kind: "recent-solar",
      ssn: 83,
      summary: "Monthly median for November 2026 at smoothed sunspot number 83.",
      tableDate: "2026-11-16",
      tableAgeDays: 0,
      ssnLow: null,
      ssnHigh: null,
    },
    mode: { id: "ssb", label: "SSB voice", requiredSnrDb: 45, referenceBandwidthHz: 1, requiredSnrDbHz: 45, source: "" },
    grid,
    cells: [
      cellOf(0.55, 46.7, -103.6),
      cellOf(0.05, 30, -120),
      null,
      { ...cellOf(0, 0, 0), reliability: day(null), snrDbHz: day(null), signalDbw: day(null) },
    ],
    unanswered: [{ index: 2, reason: "The engine could not work this place out: no such path." }],
    antennas: { tx: "Dipole, broadside turned towards each cell", rx: "Dipole, broadside turned towards the transmitter" },
    limits: ["Each cell is the engine's answer for a receiver at the centre of that cell."],
    ...patch,
  };
}

interface Server {
  posted: Array<{ path: string; body: unknown }>;
  deleted: string[];
}

/**
 * Stands in for the live-events stream, which tells the screen each time a job moves (its query is under "jobs"):
 * the screen's own poll is only a slow fallback for when that stream is down.
 */
let jobEvents: number | undefined;
function withJobEvents(client: QueryClient): QueryClient {
  window.clearInterval(jobEvents);
  jobEvents = window.setInterval(() => void client.invalidateQueries({ queryKey: ["jobs"] }), 300);
  return client;
}
afterEach(() => window.clearInterval(jobEvents));

function showPage(
  options: {
    engineReady?: boolean;
    answer?: (body: CoverageRequest) => unknown;
    job?: () => unknown;
    saved?: SavedCoverage[] | "fails";
    markers?: MarkerDto[];
    kept?: CoverageResult;
  } = {},
): Server {
  const server: Server = { posted: [], deleted: [] };
  vi.stubGlobal("scrollTo", vi.fn());
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const { pathname } = new URL(String(input), "http://outpost.test");
      const json = (body: unknown, status = 200) =>
        new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
      if (init?.method === "POST") {
        const body = init.body ? JSON.parse(String(init.body)) : undefined;
        server.posted.push({ path: pathname, body });
        if (pathname === "/api/radio/propagation/coverage") return json(options.answer ? options.answer(body) : { coverage: mapOf() });
        return json({ ok: true });
      }
      if (init?.method === "DELETE") {
        server.deleted.push(pathname);
        return json({ ok: true });
      }
      if (pathname === "/api/radio/propagation/engines")
        return json({
          engines: [
            {
              id: "voacap",
              name: "VOACAP",
              ready: options.engineReady ?? true,
              problem: "A propagation data file is damaged: coeffs/coeff11w.bin.",
            },
          ],
        });
      if (pathname === "/api/radio/profiles") return json({ radios: [], antennas: [] });
      if (pathname === "/api/maps/markers") return json({ markers: options.markers ?? [] });
      if (pathname === "/api/radio/propagation/coverage") {
        if (options.saved === "fails") return json({ error: { code: "internal", message: "The database is busy." } }, 500);
        return json({ saved: options.saved ?? [], limits: { maxCells: 2304, maxWaiting: 3 } });
      }
      if (pathname.startsWith("/api/radio/propagation/coverage/")) return json({ coverage: options.kept ?? mapOf() });
      if (pathname.startsWith("/api/jobs/")) return json({ job: options.job?.() });
      return json({}, 404);
    }),
  );
  render(
    <QueryClientProvider client={withJobEvents(new QueryClient({ defaultOptions: { queries: { retry: false } } }))}>
      <MemoryRouter initialEntries={["/radio/coverage"]}>
        <Routes>
          <Route path="/radio/coverage" element={<CoveragePage />} />
          <Route path="/radio/propagation" element={<p>The planner</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return server;
}

const tryExample = async () => fireEvent.click(await screen.findByRole("button", { name: /Try London on 40 m/ }));

describe("the area and the request", () => {
  it("turns what a map shows into an area a grid can be laid over", () => {
    expect(areaOf([-11, 49, 3, 59])).toEqual({ west: -11, south: 49, east: 3, north: 59 });
    // Clear of the poles, no wider than the Earth, and the west edge brought into range.
    expect(areaOf([-400, -95, 400, 95])).toEqual({ west: -180, south: -89, east: 180, north: 89 });
    expect(areaOf([170, -45, 190, -35])).toEqual({ west: 170, south: -45, east: 190, north: -35 });
    expect(areaOf([190, -45, 200, -35])).toEqual({ west: -170, south: -45, east: -160, north: -35 });
    expect(areaOf([0, 50, 0.2, 50.1])).toBeNull();
    const around = areaAround(51.5, -0.13);
    expect(around.north - around.south).toBe(12);
    expect(around.east - around.west).toBeGreaterThan(18);
  });

  it("says what is missing before anything is asked of the server", () => {
    const form = exampleCoverageForm();
    expect(coverageRequestOf({ ...form, tx: { text: "", name: "" } }, [], EXAMPLE_AREA)).toMatchObject({ field: "tx" });
    expect(coverageRequestOf({ ...form, frequencyMhz: "31" }, [], EXAMPLE_AREA)).toMatchObject({ field: "frequencyMhz" });
    expect(coverageRequestOf({ ...form, powerWatts: "" }, [], EXAMPLE_AREA)).toMatchObject({ field: "powerWatts" });
    expect(coverageRequestOf({ ...form, txBearing: "400" }, [], EXAMPLE_AREA)).toMatchObject({ field: "txBearing" });
    expect(coverageRequestOf({ ...form, solar: "manual", ssn: "" }, [], EXAMPLE_AREA)).toMatchObject({ field: "ssn" });
    const built = coverageRequestOf({ ...form, txBearing: "45", solar: "manual", ssn: "120" }, [], EXAMPLE_AREA);
    expect(built).toMatchObject({
      request: { tx: { name: "London" }, txAntenna: { broadsideDeg: 45 }, solar: { source: "manual", ssn: 120 }, area: EXAMPLE_AREA },
    });
  });
});

describe("what is drawn", () => {
  const shades = ["#1", "#2", "#3", "#4", "#5"];
  it("shades a cell by its class, leaves a low or pathless cell unshaded, and crosses out one with no answer", () => {
    const drawn = coverageFeatures(mapOf(), { quantity: "reliability", utcHour: 12, shades, selected: null });
    const kinds = drawn.features.map((feature) => feature.properties.kind);
    expect(kinds).toEqual(["cell", "none", "area", "tx"]);
    expect(drawn.features[0]!.properties).toMatchObject({ fill: "#3", level: 2 });
    // The same cell by signal strength: -103.6 dBW is -73.6 dBm, S9.
    const bySignal = coverageFeatures(mapOf(), { quantity: "signal", utcHour: 12, shades, selected: 0 });
    expect(bySignal.features[0]!.properties).toMatchObject({ fill: "#5" });
    expect(bySignal.features.map((feature) => feature.properties.kind)).toEqual(["cell", "cell", "none", "area", "selected", "tx"]);
  });
});

describe("the coverage screen", () => {
  it("says so when the engine cannot run, and offers nothing that would need it", async () => {
    showPage({ engineReady: false });
    expect(await screen.findByText("The propagation engine cannot run, so no coverage can be worked out")).toBeInTheDocument();
    expect(screen.getByText(/coeff11w\.bin/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Work out coverage" })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Try London on 40 m/ })).toBeDisabled();
  });

  it("starts empty, with the size of the grid it would make, and does not send a form with no transmitter", async () => {
    const server = showPage();
    expect(await screen.findByRole("heading", { name: "No coverage map yet" })).toBeInTheDocument();
    expect(
      await screen.findByText(/Over what the map shows now: 13 × 16 = 208 cells, each about 70\.\d km by 69\.5 km/),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "Fine" }));
    expect(screen.getByText(/39 × 48 = 1,872 cells/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Work out coverage" }));
    expect(
      screen
        .getAllByRole("alert")
        .map((item) => item.textContent)
        .join(" "),
    ).toContain("Say where the transmitter is");
    expect(server.posted).toEqual([]);
  });

  it("shows a map that was already worked out, with a legend that counts the cells and says what the number is", async () => {
    const server = showPage();
    await tryExample();
    expect(await screen.findByRole("heading", { name: "What this map rests on" })).toBeInTheDocument();
    expect(server.posted[0]).toMatchObject({
      path: "/api/radio/propagation/coverage",
      body: { tx: { name: "London", lat: 51.5074, lon: -0.1278 }, area: EXAMPLE_AREA, resolution: "coarse", noise: "city" },
    });
    expect(screen.getByTestId("features").textContent).toBe("cell,none,area,tx");
    const legend = screen.getByRole("list", { name: /What the shades mean/ });
    expect(within(legend).getByText("50 to 69%").parentElement?.textContent).toContain("1 cell");
    expect(within(legend).getByText("Under 10%: no shade").parentElement?.textContent).toContain("1 cell");
    expect(within(legend).getByText("No path found at this hour: no shade").parentElement?.textContent).toContain("1 cell");
    expect(within(legend).getByText("Not answered by the engine").parentElement?.textContent).toContain("1 cell");
    expect(screen.getByText(/share of the days of the month .* what SSB voice needs \(45 dB in a 1 Hz bandwidth\)/)).toBeInTheDocument();
    expect(screen.getByText(/The grid is 2 × 2 cells .* Nothing is smoothed and nothing is filled in between cells\./)).toBeInTheDocument();
    // Where the figures come from is on the screen, and nothing calls them live.
    expect(screen.getByText("A monthly median, with a recent solar forecast")).toBeInTheDocument();
    expect(screen.getByText(/in 0\.7 s on this computer \(4 cells\)/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/\blive\b|real-time|current conditions/i);
  });

  it("changes what is shaded with the quantity and the hour", async () => {
    showPage({ kept: mapOf() });
    await tryExample();
    await screen.findByRole("heading", { name: "What this map rests on" });
    fireEvent.click(screen.getByRole("radio", { name: "Signal strength" }));
    expect(screen.getByText(/S9 = −73 dBm and 6 dB to the unit/)).toBeInTheDocument();
    expect(screen.getByTestId("features").textContent).toBe("cell,cell,none,area,tx");
    fireEvent.click(screen.getByRole("radio", { name: "Signal to noise" }));
    expect(screen.getByText(/less the 45 dB in a 1 Hz bandwidth that SSB voice needs/)).toBeInTheDocument();
    expect(screen.getByText("0 to 10 dB over").parentElement?.textContent).toContain("1 cell");
    expect(screen.getByText("12:00 UTC")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "An hour later" }));
    expect(screen.getByText("13:00 UTC")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("slider", { name: "Hour, UTC" }), { target: { value: "3" } });
    expect(screen.getByText("03:00 UTC")).toBeInTheDocument();
  });

  it("reads a cell out when it is pressed or a place is typed, and never shows a figure for a cell with none", async () => {
    showPage();
    await tryExample();
    await screen.findByRole("heading", { name: "What this map rests on" });
    expect(screen.getByText("No cell chosen yet.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "press the south-west cell" }));
    expect(screen.getByRole("heading", { name: "The cell at 51.50, -7.50 (IO61GM), at 12:00 UTC" })).toBeInTheDocument();
    expect(screen.getByText("504 km from London, on a bearing of 321°.")).toBeInTheDocument();
    expect(screen.getByText("55% of days")).toBeInTheDocument();
    expect(screen.getByText("46.7 dB in 1 Hz, median: 1.7 dB over what SSB voice needs")).toBeInTheDocument();
    expect(screen.getByText("-103.6 dBW, median (S9)")).toBeInTheDocument();
    expect(screen.getByTestId("features").textContent).toContain("selected");

    fireEvent.click(screen.getByRole("button", { name: "press the north-east cell" }));
    expect(
      screen.getByText(/The engine found no way for the signal to arrive at this hour, so there are no figures for it\./),
    ).toBeInTheDocument();
    expect(screen.queryByText(/% of days/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "press outside" }));
    expect(screen.getByRole("alert").textContent).toBe("That place is outside the area that was worked out.");

    // By keyboard: a typed place reads the cell it falls in. This one was not answered.
    fireEvent.change(screen.getByLabelText("A place"), { target: { value: "56.5, -8" } });
    fireEvent.click(screen.getByRole("button", { name: "Read this place" }));
    expect(
      screen.getByText(/Not answered\. The engine could not work this place out: no such path\. Nothing is shown for it\./),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("A place"), { target: { value: "nowhere" } });
    fireEvent.click(screen.getByRole("button", { name: "Read this place" }));
    expect(screen.getByRole("alert").textContent).toContain("Give coordinates");
  });

  it("takes the path to a cell to the planner", async () => {
    showPage();
    await tryExample();
    await screen.findByRole("heading", { name: "What this map rests on" });
    fireEvent.click(screen.getByRole("button", { name: "press the south-west cell" }));
    fireEvent.click(screen.getByRole("button", { name: "Open this path in the planner" }));
    expect(await screen.findByText("The planner")).toBeInTheDocument();
    const form = JSON.parse(localStorage.getItem("outpost.propagation.form.v1")!);
    expect(form).toMatchObject({ tx: { text: "51.51, -0.13", name: "London" }, rx: { text: "51.5, -7.5" }, frequencyMhz: "7.1" });
  });

  it("shows only signal strength for a mode with no stated requirement", async () => {
    showPage({
      answer: () => ({
        coverage: mapOf({
          mode: {
            id: "digital",
            label: "Another narrowband digital mode",
            requiredSnrDb: null,
            referenceBandwidthHz: 2500,
            requiredSnrDbHz: null,
            source: "",
          },
          cells: [{ ...cellOf(0, 46.7, -103.6), reliability: null }, null, null, null],
        }),
      }),
    });
    await tryExample();
    expect(await screen.findByText(/Signal strength only: Another narrowband digital mode has no stated requirement/)).toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: "Reliability" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "press the south-west cell" }));
    expect(screen.getByText("No figure: the mode has no stated requirement")).toBeInTheDocument();
  });

  it("follows the job cell by cell, and stopping it keeps nothing", async () => {
    let state = "running";
    const server = showPage({
      answer: () => ({ job: { id: "job-1" } }),
      job: () => ({ id: "job-1", state, progress: { current: 104, total: 208, message: null }, result: null, error: null }),
    });
    await tryExample();
    expect(await screen.findByText("104 of 208 cells")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Cells worked out" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Work out coverage" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Stop" }));
    await waitFor(() => expect(server.posted.map((item) => item.path)).toContain("/api/jobs/job-1/cancel"));
    state = "cancelled";
    expect(
      await screen.findByText(/stopped before it finished\. Nothing of it was kept/, undefined, { timeout: 3000 }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "What this map rests on" })).not.toBeInTheDocument();
  });

  it("fetches the map when the job has finished, and says why when it failed", async () => {
    let job: Record<string, unknown> = {
      id: "job-1",
      state: "succeeded",
      progress: { current: 4, total: 4 },
      result: { key: "a".repeat(40) },
    };
    let asked = 0;
    showPage({ answer: () => ({ job: { id: `job-${++asked}` } }), job: () => job });
    await tryExample();
    expect(await screen.findByRole("heading", { name: "What this map rests on" })).toBeInTheDocument();
    job = { id: "job-2", state: "failed", progress: {}, result: null, error: "A propagation data file is damaged." };
    fireEvent.click(screen.getByRole("button", { name: "Work out coverage" }));
    expect(await screen.findByText("No coverage map was made")).toBeInTheDocument();
    expect(screen.getByText("A propagation data file is damaged.")).toBeInTheDocument();
  });

  it("says what the server said when it refuses", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    showPage({ answer: () => ({ coverage: undefined }) });
    // A refusal: the stand-in answers 409 for this one.
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) =>
        init?.method === "POST"
          ? new Response(
              JSON.stringify({
                error: { code: "conflict", message: "3 coverage maps are already being worked out or waiting their turn." },
              }),
              {
                status: 409,
                headers: { "content-type": "application/json" },
              },
            )
          : new Response(JSON.stringify({ engines: [{ id: "voacap", ready: true }], radios: [], antennas: [], markers: [], saved: [] }), {
              headers: { "content-type": "application/json" },
            }),
      ),
    );
    await tryExample();
    expect(await screen.findByText(/3 coverage maps are already being worked out/)).toBeInTheDocument();
  });

  it("lists saved maps, opens one with the figures it was saved with, saves and deletes", async () => {
    const saved: SavedCoverage = {
      id: "s1",
      name: "Britain on 40 m",
      key: "a".repeat(40),
      request,
      computedAt: Date.UTC(2026, 10, 16, 10, 12),
      ssn: 83,
      cells: 208,
      createdAt: 1,
    };
    const server = showPage({ saved: [saved] });
    expect(await screen.findByRole("heading", { name: "Saved coverage maps" })).toBeInTheDocument();
    expect(
      screen.getByText(/7\.1 MHz, SSB voice, 5 W, for 2026-11-16 at sunspot number 83\. 208 cells, worked out 16 Nov 2026, 10:12\./),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    expect(await screen.findByRole("heading", { name: "What this map rests on" })).toBeInTheDocument();
    expect(server.posted).toEqual([]);

    fireEvent.click(screen.getByRole("button", { name: "Save this map" }));
    const dialog = screen.getByRole("dialog", { name: "Save this map" });
    fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "London, 40 m" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(server.posted).toEqual([
        { path: "/api/radio/propagation/coverage/saved", body: { name: "London, 40 m", key: "a".repeat(40) } },
      ]),
    );

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    const confirm = await screen.findByRole("alertdialog");
    expect(confirm.textContent).toContain("“Britain on 40 m” will be removed from the list, with its figures.");
    fireEvent.click(within(confirm).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(server.deleted).toEqual(["/api/radio/propagation/coverage/saved/s1"]));
  });

  it("says so when the saved maps cannot be listed", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    showPage({ saved: "fails" });
    expect(await screen.findByText("The saved coverage maps could not be listed")).toBeInTheDocument();
    expect(screen.getByText("The database is busy.")).toBeInTheDocument();
  });
});
