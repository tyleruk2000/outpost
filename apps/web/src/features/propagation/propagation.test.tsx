import {
  ANTENNA_PRESETS,
  type AntennaProfile,
  type AntennaSpec,
  type PredictionCell,
  type PredictionHour,
  type PredictionRequest,
  type PredictionResult,
  type SavedPrediction,
} from "@outpost/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HourGrid, HourLines, percent, ShareBars, shareFill } from "./charts";
import { AS_SAVED, emptyForm, exampleForm, formOf, openSaved, rememberedForm, rememberForm, requestOf } from "./data";
import { Planner } from "./planner";
import { BasisNotice, bestHour, tableAge, windows } from "./results";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  localStorage.clear();
});

const cell = (reliability: number, snrDbHz = 30): PredictionCell => ({
  mhz: 7.1,
  path: "1F2",
  hops: 1,
  layer: "F2",
  takeoffDeg: 70,
  virtualHeightKm: 300,
  mufDays: 0.9,
  fieldDbuV: 10,
  signalDbw: -110,
  noiseDbwHz: -150,
  snrDbHz,
  snrLowDb: 10,
  snrUpDb: 8,
  reliability,
  txGainDbi: 3,
  rxGainDbi: 3,
  lossDb: 110,
});
const hours = (shares: number[]): PredictionHour[] =>
  shares.map((share, index) => ({ utc: index + 1, asked: cell(share, 20 + share * 20) }) as unknown as PredictionHour);

describe("the form", () => {
  it("says what is missing before anything is asked of the server", () => {
    expect(requestOf(emptyForm(), [])).toMatchObject({ field: "tx" });
    expect(requestOf({ ...exampleForm(), rx: { text: "somewhere", name: "" } }, [])).toMatchObject({ field: "rx" });
    expect(requestOf({ ...exampleForm(), frequencyMhz: "1.9" }, [])).toMatchObject({
      field: "frequencyMhz",
      problem: expect.stringContaining("between 2 and 30 MHz"),
    });
    expect(requestOf({ ...exampleForm(), powerWatts: "0" }, [])).toMatchObject({ field: "powerWatts" });
    expect(requestOf({ ...exampleForm(), solar: "manual", ssn: "" }, [])).toMatchObject({ field: "ssn" });
    expect(requestOf({ ...exampleForm(), solar: "fof2", fof2Mhz: "" }, [])).toMatchObject({ field: "fof2Mhz" });
  });

  it("builds the acceptance request from the example", () => {
    const built = requestOf({ ...exampleForm(), date: "2026-11-16" }, []);
    expect(built).toEqual({
      request: {
        tx: { name: "London", lat: 51.5074, lon: -0.1278 },
        rx: { name: "Birmingham", lat: 52.4862, lon: -1.8904 },
        date: "2026-11-16",
        powerWatts: 5,
        txAntenna: ANTENNA_PRESETS[0]!.spec,
        rxAntenna: ANTENNA_PRESETS[0]!.spec,
        noise: "city",
        frequencyMhz: 7.1,
        mode: "ssb",
        solar: { source: "table" },
      },
    });
  });

  it("reads a locator, a person's own mode figures, their measurement and the reply", () => {
    const built = requestOf(
      {
        ...exampleForm(),
        tx: { text: "IO91WM", name: "" },
        mode: "digital",
        requiredSnrDb: "-10",
        referenceBandwidthHz: "500",
        solar: "fof2",
        fof2Mhz: "6.4",
        fof2Hour: "11",
        reply: true,
        replyPowerWatts: "100",
        replyNoise: "rural",
      },
      [],
    );
    if (!("request" in built)) throw new Error("expected a request");
    expect(built.request.tx.lat).toBeCloseTo(51.52, 1);
    expect(built.request).toMatchObject({
      requiredSnrDb: -10,
      referenceBandwidthHz: 500,
      solar: { source: "fof2", fof2Mhz: 6.4, utcHour: 11 },
      reply: { powerWatts: 100, noise: "rural" },
    });
  });

  it("asks in the bandwidth the form shows when only the bandwidth is filled in", () => {
    // CW with "Signal-to-noise needed, dB" left empty, as its hint invites, and 500 typed in "In a bandwidth of, Hz".
    const built = requestOf({ ...exampleForm(), mode: "cw", referenceBandwidthHz: "500" }, []);
    if (!("request" in built)) throw new Error("expected a request");
    expect(built.request.referenceBandwidthHz).toBe(500);
    // The figure itself is left to the server, which has the mode's published one.
    expect("requiredSnrDb" in built.request).toBe(false);
    expect(requestOf(formOf(built.request, "40m", []), [])).toEqual(built);
    for (const referenceBandwidthHz of ["wide", "0", "-3"]) {
      expect(requestOf({ ...exampleForm(), mode: "cw", referenceBandwidthHz }, [])).toMatchObject({ field: "referenceBandwidthHz" });
    }
    expect(requestOf({ ...exampleForm(), mode: "cw", requiredSnrDb: "loud", referenceBandwidthHz: "500" }, [])).toMatchObject({
      field: "requiredSnrDb",
    });
  });

  it("opens a saved request as the form that asks it again", () => {
    const built = requestOf({ ...exampleForm(), date: "2026-11-16", solar: "manual", ssn: "60" }, []);
    if (!("request" in built)) throw new Error("expected a request");
    const again = requestOf(formOf(built.request, "40m", []), []);
    expect(again).toEqual(built);
  });
});

/** An antenna that is no generic one: the garden dipole of the server's own profile test. */
const garden: AntennaSpec = { kind: "horizontal-dipole", heightM: 7, ground: "poor", broadsideDeg: null, gainDb: 0, feedlineLossDb: 1.2 };
const gardenProfile = (change: Partial<AntennaProfile> = {}): AntennaProfile => ({
  id: "a1",
  name: "Garden dipole",
  ...garden,
  minMhz: 7,
  maxMhz: 7.2,
  notes: "",
  createdAt: 0,
  updatedAt: 0,
  ...change,
});
const savedWith = (change: Partial<PredictionRequest> = {}): SavedPrediction => {
  const built = requestOf({ ...exampleForm(), date: "2026-03-09" }, []);
  if (!("request" in built)) throw new Error("expected a request");
  return {
    id: "s1",
    name: "Garden to Birmingham",
    request: { ...built.request, txAntenna: garden, ...change },
    key: "",
    noteId: null,
    createdAt: 0,
    updatedAt: 0,
  };
};

/** The planner on a server that has these saved predictions and antennas. Returns what was posted to it. */
function showPlanner(saved: SavedPrediction[], antennas: AntennaProfile[] = []) {
  const posted: Array<{ path: string; body: unknown }> = [];
  vi.stubGlobal("scrollTo", vi.fn());
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const { pathname } = new URL(String(input), "http://outpost.test");
      const json = (body: unknown, status = 200) =>
        new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
      if (init?.method === "POST") {
        posted.push({ path: pathname, body: JSON.parse(String(init.body)) });
        return json({ error: { code: "bad_request", message: "The test's server predicts nothing." } }, 400);
      }
      if (pathname === "/api/radio/propagation/engines")
        return json({ engines: [{ id: "voacap", name: "VOACAP", ready: true, problem: null }] });
      if (pathname === "/api/radio/profiles") return json({ radios: [], antennas });
      if (pathname === "/api/radio/propagation/saved") return json({ saved });
      if (pathname === "/api/maps/markers") return json({ markers: [] });
      return json({}, 404);
    }),
  );
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <Planner />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return posted;
}

describe("a saved prediction", () => {
  it("opens with the antenna it was saved with, not a generic one", () => {
    const saved = savedWith();
    const opened = openSaved(saved, []);
    expect(opened.form.txAntennaId).toBe(AS_SAVED);
    expect(opened.form.rxAntennaId).toBe("preset:low-dipole");
    expect(opened).toMatchObject({ request: saved.request });
    expect(requestOf(opened.form, [])).toEqual({ request: saved.request });
  });

  it("opens on the profile when one still has exactly that antenna, and as saved when the profile has changed", () => {
    const saved = savedWith();
    expect(formOf(saved.request, "40m", [gardenProfile()]).txAntennaId).toBe("a1");
    const changed = [gardenProfile({ heightM: 9 })];
    const opened = openSaved(saved, changed);
    expect(opened.form.txAntennaId).toBe(AS_SAVED);
    expect(opened).toMatchObject({ request: { txAntenna: garden } });
  });

  it("is not asked at all when the form cannot ask exactly what was saved", () => {
    // 1e-7 is written by JavaScript as "1e-7", which is not a position anybody types.
    const saved = savedWith({ tx: { name: "Null Island", lat: 1e-7, lon: 0 } });
    const opened = openSaved(saved, []);
    expect("request" in opened).toBe(false);
    expect(opened).toMatchObject({ problem: expect.stringContaining("the transmitter") });
  });

  it("is sent to the engine as it was saved when Open is pressed, and the screen says which date it is for", async () => {
    const saved = savedWith();
    const posted = showPlanner([saved]);
    fireEvent.click(await screen.findByRole("button", { name: "Open" }));
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]).toEqual({ path: "/api/radio/propagation/predict", body: saved.request });
    const notice = screen.getByText("Saved prediction: Garden to Birmingham").closest('[role="status"]')!;
    expect(notice.textContent).toContain("9 March 2026");
    expect(notice.textContent).toContain("as it was saved");
  });
});

describe("the form remembered in this browser", () => {
  const on = (instant: string) => vi.setSystemTime(new Date(instant));

  it("opens on today's date when it was last used on another day, with the rest as it was left", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    on("2026-11-16T10:00:00Z");
    rememberForm({ ...exampleForm(), powerWatts: "20", band: "80m", frequencyMhz: "3.7" });
    expect(rememberedForm().date).toBe("2026-11-16");
    on("2027-01-20T10:00:00Z");
    expect(rememberedForm()).toEqual({ ...exampleForm(), date: "2027-01-20", powerWatts: "20", band: "80m", frequencyMhz: "3.7" });
  });

  it("does not bring back a date planned for on an earlier day, or one kept before the day was recorded", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    on("2026-11-16T10:00:00Z");
    rememberForm({ ...exampleForm(), date: "2026-12-24" });
    on("2026-11-17T00:00:01Z");
    expect(rememberedForm().date).toBe("2026-11-17");
    localStorage.setItem("outpost.propagation.form.v1", JSON.stringify({ ...exampleForm(), date: "2026-06-01" }));
    expect(rememberedForm()).toEqual({ ...exampleForm(), date: "2026-11-17" });
  });

  it("keeps a date chosen earlier the same day, which is what leaving the tab and coming back is", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    on("2026-11-16T09:00:00Z");
    rememberForm({ ...exampleForm(), date: "2026-12-24" });
    on("2026-11-16T21:00:00Z");
    expect(rememberedForm().date).toBe("2026-12-24");
  });
});

describe("how old the solar table is", () => {
  it("is said on the screen, by this device's clock, after the dated sentence that is kept and printed", () => {
    expect(tableAge("2026-11-16", new Date("2026-11-16T23:30:00Z"))).toBe("That is today.");
    expect(tableAge("2026-11-15", new Date("2026-11-16T08:00:00Z"))).toBe("That is 1 day ago.");
    expect(tableAge("2026-11-01", new Date("2026-11-16T08:00:00Z"))).toBe("That is 15 days ago.");
    render(
      <BasisNotice
        basis={{
          kind: "recent-solar",
          ssn: 83,
          summary:
            "Monthly median for November 2026 at smoothed sunspot number 83, which is NOAA's forecast for the month in the table that came with Outpost, dated 2026-11-16.",
          tableDate: "2026-11-16",
          tableAgeDays: 0,
          ssnLow: null,
          ssnHigh: null,
        }}
      />,
    );
    expect(screen.getByText(/dated 2026-11-16\. That is (today|\d+ days? ago)\. It is not a reading/)).toBeInTheDocument();
  });
});

describe("reading a day", () => {
  it("finds the best hour and the stretches that reach a level", () => {
    const day = hours([0, 0, 0, 0, 0, 0, 0.2, 0.6, 0.7, 0.8, 0.75, 0.6, 0.4, 0.5, 0.55, 0.3, 0.1, 0, 0, 0, 0, 0, 0.6, 0]);
    expect(bestHour({ hours: day } as PredictionResult)).toBe(10);
    expect(windows(day, 0.5)).toEqual(["08:00 to 12:00", "14:00 to 15:00", "23:00"]);
    expect(windows(hours(Array(24).fill(0.1)), 0.5)).toEqual([]);
  });
});

describe("charts", () => {
  it("shades a share by fixed steps and writes it as a percentage", () => {
    expect(shareFill(0.95)).toBe("var(--chart-seq-5)");
    expect(shareFill(0.5)).toBe("var(--chart-seq-3)");
    expect(shareFill(0.1)).toBe("var(--chart-seq-1)");
    expect(shareFill(0.05)).toBe("var(--surface-strong)");
    expect(shareFill(null)).toBe("transparent");
    expect(percent(0.374)).toBe("37%");
    expect(percent(null)).toBe("no figure");
  });

  it("gives a grid's numbers as a table and reads a cell with the arrow keys", () => {
    const onHour = vi.fn();
    const values = Array.from({ length: 24 }, (_, index) => index / 24);
    render(
      <HourGrid
        name="Reliability by band"
        hour={12}
        onHour={onHour}
        rows={[
          { label: "80 m", values },
          { label: "40 m", values: values.map((value) => 1 - value), marked: true },
        ]}
      />,
    );
    const table = screen.getByRole("table", { name: "Reliability by band" });
    expect(table.querySelectorAll("tbody tr")).toHaveLength(24);
    expect(table.querySelector("tbody tr:nth-child(13)")?.textContent).toBe("13:0050%50%");
    const grid = screen.getByRole("region", { name: /Reliability by band/ });
    fireEvent.keyDown(grid, { key: "ArrowRight" });
    expect(screen.getByText("13:00 UTC, 40 m: 50% of days")).toBeTruthy();
    fireEvent.keyDown(grid, { key: "ArrowUp" });
    expect(screen.getByText("13:00 UTC, 80 m: 50% of days")).toBeTruthy();
    fireEvent.keyDown(grid, { key: "Enter" });
    expect(onHour).toHaveBeenCalledWith(13);
  });

  it("gives a line chart a legend for two series, a table, and hours on the arrow keys", () => {
    const onHour = vi.fn();
    render(
      <HourLines
        name="Reliability by hour"
        hour={5}
        onHour={onHour}
        domain={[0, 100]}
        format={(value) => `${Math.round(value)}%`}
        series={[
          { label: "There", color: "var(--chart-1)", values: Array(24).fill(40) },
          { label: "Back", color: "var(--chart-2)", values: Array(24).fill(70) },
        ]}
      />,
    );
    expect(screen.getByRole("list", { name: "What the lines are" }).textContent).toBe("ThereBack");
    expect(screen.getByText("05:00 UTC: There 40%, Back 70%")).toBeTruthy();
    expect(screen.getByRole("table", { name: "Reliability by hour" }).querySelectorAll("tbody tr")).toHaveLength(24);
    fireEvent.keyDown(screen.getByRole("region", { name: /Reliability by hour/ }), { key: "ArrowRight" });
    expect(onHour).toHaveBeenCalledWith(6);
  });

  it("draws a chart at the width it has from the first paint, never wider than a phone", () => {
    // A chart used to be laid out 640 px wide until the resize observer answered, a frame later:
    // at 390 px that was a sideways scroll of 270 px for an instant each time a chart appeared.
    const rect = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ width: 358 } as DOMRect);
    try {
      const values = Array.from({ length: 24 }, () => 0.5);
      const { container } = render(<HourGrid name="Reliability by band" hour={12} onHour={() => {}} rows={[{ label: "40 m", values }]} />);
      expect(container.querySelector("svg")?.getAttribute("width")).toBe("358");
    } finally {
      rect.mockRestore();
    }
  });

  it("writes every bar's figure beside it", () => {
    render(
      <ShareBars
        name="Bands"
        rows={[
          { label: "40 m", share: 0.62, detail: "7.10 MHz, 1F2, 41 dB", marked: true },
          { label: "10 m", share: null, detail: "no path" },
        ]}
      />,
    );
    const items = screen.getByRole("list", { name: "Bands" }).querySelectorAll("li");
    expect(items[0]!.textContent).toContain("62%");
    expect(items[1]!.textContent).toContain("–");
  });
});
