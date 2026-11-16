/**
 * A coverage map written out: its figures, its legend, and that a cell with no answer
 * is never given a figure.
 */
import { ANTENNA_PRESETS, type CoverageCell, type CoverageResult, coverageGrid } from "@outpost/shared";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { describe, expect, it } from "vitest";
import { PAPERS } from "@/features/maps/print/paper";
import { writePdfPages } from "@/features/maps/print/pdf";
import { toMarkdown, toSheets } from "../plans/document";
import { wordsOf } from "../prediction-fixture";
import { cellMarks, coverageDocument, coverageFooter, coverageTitle, gridBox, mapBox, quantityMeaning } from "./coverage-document";
import { EXAMPLE_AREA } from "./data";

const dipole = ANTENNA_PRESETS[0]!.spec;
const day = (value: number | null) => Array.from({ length: 24 }, () => value);
const cellOf = (reliability: number, snr: number, signal: number): CoverageCell => ({
  distanceKm: 504,
  bearingDeg: 321,
  reliability: day(reliability),
  snrDbHz: day(snr),
  signalDbw: day(signal),
});

/** Two cells by two, rows from the south: 55% and 5%; then a cell the engine did not answer and one with no path at any hour. */
function mapOf(): CoverageResult {
  const grid = { ...coverageGrid(EXAMPLE_AREA, "coarse"), columns: 2, rows: 2, lonStep: 7, latStep: 5 };
  return {
    key: "a".repeat(40),
    request: {
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
    },
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
  };
}

describe("a coverage map written out", () => {
  it("says it is approximate in its title and beside its legend when an antenna is run as an approximation", () => {
    const approximate = "The transmitting antenna: 10 m of wire is 0.71 wavelengths at 21.22 MHz, longer than a half-wave.";
    const blocks = coverageDocument({ ...mapOf(), approximate }, "reliability", 12, null);
    expect(blocks[0]).toMatchObject({ kind: "title", text: "HF coverage: London, 7.10 MHz (40 m), approximate" });
    const words = wordsOf(blocks);
    expect(words).toContain(`Approximate map: every figure on it is. ${approximate}`);
    // Next to the legend: the paragraph comes straight before it.
    const at = blocks.findIndex((block) => block.kind === "para" && block.text.startsWith("Approximate map"));
    expect(blocks[at + 1]).toMatchObject({ kind: "drawing" });
    expect(wordsOf(coverageDocument(mapOf(), "reliability", 12, null))).not.toContain("Approximate");
  });

  it("is named for the transmitter, the band, what it shades by, the hour and the day", () => {
    expect(coverageTitle(mapOf(), "reliability", 12)).toBe("HF coverage, London, 40 m, reliability at 12:00 UTC, for 16 Nov 2026");
    expect(coverageTitle(mapOf(), "signal", 3)).toBe("HF coverage, London, 40 m, signal strength at 03:00 UTC, for 16 Nov 2026");
  });

  it("puts each cell in the screen's class, and gives no figure to a cell that has none", () => {
    // 55% is the third class of five; 5% is below the lowest; then no answer, and no path.
    expect(cellMarks(mapOf(), "reliability", 12)).toEqual(["3", "0", "x", "-"]);
    // 46.7 dB against 45 needed is "0 to 10 dB over", the third class; 30 dB is 15 short, the first.
    expect(cellMarks(mapOf(), "snr", 12)).toEqual(["3", "1", "x", "-"]);
  });

  it("gives the legend with its counts, the grid's size, the grid in figures, and the caveats", () => {
    const result = mapOf();
    const blocks = coverageDocument(result, "reliability", 12, null);
    const words = wordsOf(blocks);
    expect(words).toContain("HF coverage: London, 7.10 MHz (40 m)");
    expect(words).toContain("Reliability at 12:00 UTC, for 16 November 2026.");
    expect(words).toContain("Transmitter: London (51.51, -0.13), 5 W, SSB voice, taken to need 45 dB in 1 Hz.");
    expect(words).toContain("3: 50 to 69% (1 cell)");
    expect(words).toContain("0: Under 10%: no shade (1 cell)");
    expect(words).toContain("-: No path found at this hour: no shade (1 cell)");
    expect(words).toContain("x: Not answered by the engine: crossed through (1 cell)");
    expect(words).toContain("The grid is 2 × 2 cells of 7.00° of longitude by 5.00° of latitude");
    expect(words).toContain("Each cell is one answer from the engine, for a receiver at the cell's centre.");
    // North at the top: the unanswered cell and the one with no path are the northern row.
    const [south, north] = [result.grid.south + 2.5, result.grid.south + 7.5];
    expect(words).toContain(`${north.toFixed(2)} | x -\n${south.toFixed(2)} | 3 0`);
    expect(words).toContain("- is a cell with no path at this hour, x is a cell the engine did not answer");
    expect(words).toContain(plainMeaning(result));
    expect(words).toContain("Transmitting antenna: Dipole, broadside turned towards each cell");
    expect(words).toContain("At every receiver: Dipole, broadside turned towards the transmitter; urban (city, industrial) noise");
    expect(words).toContain("Cell 3 was not answered: The engine could not work this place out: no such path.");
    expect(words).toContain(result.limits[0]);
    expect(words).toContain("on 16 November 2026 at 10:12 UTC (4 cells). Key aaaaaaaa");
    // With no picture the page says so, and says where the area is.
    expect(words).toContain("The picture of the map could not be drawn on this device, so this page has the grid in figures only.");
    expect(toMarkdown(blocks)).toContain("5: 90% or more (0 cells); 4: 70 to 89% (0 cells); 3: 50 to 69% (1 cell)");
  });

  it("writes the signal's convention with a hyphen the PDF's typeface has", () => {
    expect(quantityMeaning(mapOf(), "signal")).toContain("S9 = −73 dBm");
    expect(wordsOf(coverageDocument(mapOf(), "signal", 12, null))).toContain("S9 = -73 dBm");
  });

  it("gives the picture the shape the area has on the map, inside the page", () => {
    const result = mapOf();
    const inner = PAPERS.a4.width - 84;
    const box = mapBox(result, inner);
    expect(box.width).toBeLessThanOrEqual(inner);
    expect(box.height).toBeLessThanOrEqual(330);
    // 14° of longitude by 10° of latitude about 54°N is a little taller than it is wide on the map.
    expect(gridBox(result)).toEqual([result.grid.west, result.grid.south, result.grid.west + 14, result.grid.south + 10]);
    expect(box.width / box.height).toBeGreaterThan(0.7);
    expect(box.width / box.height).toBeLessThan(1);
  });

  it("is a PDF whose legend and figures a reader finds as text, with the picture in its place", async () => {
    const result = mapOf();
    const box = mapBox(result, PAPERS.a4.width - 84);
    const blocks = coverageDocument(result, "reliability", 12, { ...box, pieces: [{ id: "map-1", x: 0, y: 0, ...box }] });
    const pages = toSheets(blocks, coverageFooter(result));
    const image = pages[0]!.items.find((item) => item.kind === "image");
    expect(image).toMatchObject({ kind: "image", id: "map-1", x: 42, width: box.width, height: box.height });
    // The legend's swatches are drawn in the shade as it looks over land, each with its figure beside it.
    expect(pages[0]!.items.filter((item) => item.kind === "rect" && item.fill)).toHaveLength(5);

    const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]);
    const file = writePdfPages({
      pages,
      pictures: new Map([["map-1", { jpeg, width: 8, height: 4 }]]),
      title: coverageTitle(result, "reliability", 12),
      created: new Date(result.computedAt),
    });
    const reading = getDocument({ data: file.slice(), useSystemFonts: false, disableFontFace: true });
    const document = await reading.promise;
    let text = "";
    for (let number = 1; number <= document.numPages; number += 1) {
      const items = (await (await document.getPage(number)).getTextContent()).items as Array<{ str: string; hasEOL: boolean }>;
      text += `${items.map((item) => item.str + (item.hasEOL ? "\n" : "")).join("")}\n`;
    }
    await reading.destroy();
    const flat = text.replace(/\s+/g, " ");
    expect(flat).toContain("HF coverage: London, 7.10 MHz (40 m)");
    expect(flat).toContain("50 to 69%");
    expect(flat).toContain("The same grid in figures");
    expect(flat).toMatch(/x - .*3 0/);
    expect(flat).toContain("Each cell is the engine's answer for a receiver at the centre of that cell.");
  });
});

/** The legend's sentence as the page writes it. */
function plainMeaning(result: CoverageResult): string {
  return quantityMeaning(result, "reliability").replace(/−/g, "-");
}
