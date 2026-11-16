import { ANTENNA_PRESETS, type PredictionCell, type PredictionHour, type PredictionResult } from "@outpost/shared";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HourGrid, HourLines, percent, ShareBars, shareFill } from "./charts";
import { emptyForm, exampleForm, formOf, requestOf } from "./data";
import { bestHour, windows } from "./results";

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

  it("opens a saved request as the form that asks it again", () => {
    const built = requestOf({ ...exampleForm(), date: "2026-11-16", solar: "manual", ssn: "60" }, []);
    if (!("request" in built)) throw new Error("expected a request");
    const again = requestOf(formOf(built.request, "40m"), []);
    expect(again).toEqual(built);
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
