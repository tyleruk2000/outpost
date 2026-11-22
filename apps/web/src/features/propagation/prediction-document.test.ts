/**
 * A prediction written out: what the pages say, that the PDF holds it as text a reader
 * can search, and that no figure appears where the engine gave none.
 */
import { HF_BANDS, type PredictionCell, type PredictionResult } from "@outpost/shared";
import { describe, expect, it } from "vitest";
import { contentText, renderPdf } from "@/features/print-kit";
import type { Block } from "./plans/document";
import { bestHourOf, NO_FIGURE, NOT_MODELLED, predictionDocument, predictionMarkdown, predictionTitle } from "./prediction-document";
import { noPath, prediction, wordsOf } from "./prediction-fixture";
import { predictionPrint } from "./print/prediction-print";
import { readPdf } from "./print/read-pdf";

const tableAfter = (blocks: Block[], heading: string) => {
  const at = blocks.findIndex((block) => block.kind === "heading" && block.text === heading);
  const table = blocks.slice(at).find((block) => block.kind === "table");
  if (at < 0 || table?.kind !== "table") throw new Error(`No table under "${heading}"`);
  return table;
};

describe("what the prediction says", () => {
  it("is named for what it is and for when", () => {
    expect(predictionTitle(prediction())).toBe("HF prediction, London to Edinburgh, 20 m, for 16 Nov 2026");
    const offBand = prediction();
    offBand.request.frequencyMhz = 6.5;
    expect(predictionTitle(offBand)).toBe("HF prediction, London to Edinburgh, 6.50 MHz, for 16 Nov 2026");
  });

  it("gives the path, both stations as run, the sunspot number and its source, and every caveat", () => {
    const result = prediction();
    const words = wordsOf(predictionDocument(result));
    expect(words).toContain("HF prediction: London to Edinburgh, 14.2 MHz (20 m)");
    expect(words).toContain("For 16 November 2026. The model works by month, so this is a prediction for any day of November 2026.");
    expect(words).toContain("SSB voice, taken to need 45 dB in 1 Hz, which is 45 dB in 1 Hz (VOACAP's guide)");
    expect(words).toContain("Path: 534 km, bearing 338° out and 156° back.");
    expect(words).toContain("Transmitter: London, 51.51, -0.13 (IO91wm). 100 W.");
    expect(words).toContain("Receiver: Edinburgh, 55.95, -3.19 (IO85jw). Man-made noise there: Residential (-144.7 dBW in 1 Hz at 3 MHz).");
    // How each antenna was run is the engine's own sentence, approximation and all.
    expect(words).toContain(`Transmitting antenna: ${result.antennas.tx}`);
    expect(words).toContain(`Receiving antenna: ${result.antennas.rx}`);
    expect(words).toContain("The reply: 50 W from Edinburgh, with man-made noise at London of Rural (-150 dBW in 1 Hz at 3 MHz).");
    expect(words).toContain("A monthly median, with a recent solar forecast.");
    expect(words).toContain(result.basis.summary);
    expect(words).toContain("The table's own range for the month is 70 to 104.");
    expect(words).toContain("The engine ran at a smoothed sunspot number of 87. It is not a reading of the ionosphere on the day.");
    for (const limit of result.limits) expect(words).toContain(limit);
    expect(words).toContain("Worked out by VOACAP 16.1207W, run by voacapl 0.7.6 as WebAssembly (checksum 0123456789abcdef)");
    expect(words).toContain("ionospheric-coefficients CCIR 1966; solar-cycle 2026-11-01 0a1b2c3d4e5f");
    expect(words).toContain("Answered on 16 November 2026 at 14:32 UTC. Key abc123def456.");
  });

  it("states the best hour, the hours at half the days, and the best bands, from the engine's figures", () => {
    const result = prediction();
    expect(bestHourOf(result)?.utc).toBe(13);
    const words = wordsOf(predictionDocument(result));
    expect(words).toContain("14.2 MHz does best at 13:00 UTC: SSB voice reaches what it is taken to need on 91% of days.");
    expect(words).toContain(
      "The reply reaches it on 46% of days at that hour. A contact needs both directions, so it can be expected on no more than 46% of days",
    );
    // 0.91 less 0.14 an hour either side of 13:00 is at or above a half from 11:00 to 15:00.
    expect(words).toContain("Through the day 14.2 MHz reaches half the days or more at 11:00 to 15:00 UTC.");
    expect(words).toContain(
      "Best bands at 13:00 UTC: 20 m (14.2 MHz) 91%, 1F2, 47 dB; 80 m (3.65 MHz) 37%, 1F2, 31 dB; 60 m (5.33 MHz) 37%, 1F2, 31 dB.",
    );
  });

  it("prints the engine's figure in every cell that has one, and a dash in every cell that has none", () => {
    const result = prediction();
    const blocks = predictionDocument(result);

    const asked = tableAfter(blocks, "14.2 MHz hour by hour");
    expect(asked.head).toEqual([
      "UTC",
      "Rel %",
      "Reply %",
      "SNR dB",
      "Worst",
      "Best",
      "Signal dBm",
      "S-meter",
      "MUF",
      "FOT",
      "Path",
      "Angle",
    ]);
    expect(asked.rows).toHaveLength(24);
    // 13:00: 91% and half that back; a median of 20 + 27 dB, 9 lower and 7 higher at the tenths; −110 dBW is −80 dBm.
    expect(asked.rows[12]).toEqual(["13:00", "91", "46", "47", "38", "54", "-80", "S8", "15.3", "12.3", "1F2", "22°"]);
    // 03:00: no path. The cell's own figures (0, −999) are not printed. The MUF belongs to the hour and is.
    expect(asked.rows[2]).toEqual([
      "03:00",
      NO_FIGURE,
      NO_FIGURE,
      NO_FIGURE,
      NO_FIGURE,
      NO_FIGURE,
      NO_FIGURE,
      NO_FIGURE,
      "14.3",
      "11.3",
      NO_FIGURE,
      NO_FIGURE,
    ]);

    const bands = tableAfter(blocks, "Bands by hour");
    expect(bands.head).toEqual(["UTC", ...Array.from({ length: 24 }, (_, index) => String(index + 1).padStart(2, "0"))]);
    expect(bands.rows.map((row) => row[0])).toEqual(HF_BANDS.map((band) => band.label));
    const row = (label: string) => bands.rows.find((cells) => cells[0] === label)!.slice(1);
    expect(row("40 m")).toEqual(Array(24).fill("37"));
    expect(row("10 m")).toEqual(Array(24).fill(NO_FIGURE));
    expect(row("20 m").slice(0, 6)).toEqual(Array(6).fill(NO_FIGURE));
    expect(row("20 m")[12]).toBe("91");
    // Nothing anywhere in either table stands in for a missing figure.
    for (const cells of [...asked.rows, ...bands.rows]) expect(cells).not.toContain("-999");
    expect(wordsOf(blocks)).toContain("A dash is an hour for which the engine gave no figure");
  });

  it("gives ratios, and no reliability at all, for a mode with no requirement", () => {
    const result = prediction({
      mode: {
        id: "digital",
        label: "Another narrowband digital mode",
        requiredSnrDb: null,
        referenceBandwidthHz: 2500,
        requiredSnrDbHz: null,
        source: "Your own figure",
      },
    });
    const blocks = predictionDocument(result);
    expect(tableAfter(blocks, "14.2 MHz hour by hour").head).not.toContain("Rel %");
    expect(tableAfter(blocks, "Bands by hour").rows[2]!.slice(1)).toEqual(Array(24).fill("31"));
    const words = wordsOf(blocks);
    expect(words).toContain("no requirement is set for it, so there is no reliability to state");
    expect(words).toContain("The median signal-to-noise ratio of 14.2 MHz is highest at 13:00 UTC: 47 dB in 1 Hz.");
    expect(words).not.toMatch(/\d+% of days/);
  });

  it("says so when no hour has a path, and invents nothing", () => {
    const result = prediction();
    for (const hour of result.hours) hour.asked = noPath(14.18);
    const blocks = predictionDocument(result);
    expect(bestHourOf(result)).toBeNull();
    expect(wordsOf(blocks)).toContain("At no hour of the day does the engine find a way for 14.2 MHz to reach the receiver.");
    for (const cells of tableAfter(blocks, "14.2 MHz hour by hour").rows) expect(cells.slice(1, 8)).toEqual(Array(7).fill(NO_FIGURE));
  });

  it("prints n/m, and why, for a band the antenna is not modelled on, and never a dash that reads as no path", () => {
    // A 10 m end-fed wire, horizontal: a half-wave on 20 m, and not modelled on 40 m (index 2 of the bands).
    const wire = {
      kind: "end-fed-horizontal",
      heightM: 6,
      lengthM: 10,
      ground: "average",
      broadsideDeg: null,
      gainDb: 0,
      feedlineLossDb: 0,
    } as const;
    const result = prediction();
    result.request = { ...result.request, txAntenna: wire };
    const forty = HF_BANDS.findIndex((band) => band.label === "40 m");
    for (const hour of result.hours) hour.bands[forty] = { ...noPath(HF_BANDS[forty]!.mhz), notModelled: true };
    const blocks = predictionDocument(result);
    const bands = tableAfter(blocks, "Bands by hour");
    expect(bands.rows[forty]!.slice(1)).toEqual(Array(24).fill(NOT_MODELLED));
    const words = wordsOf(blocks);
    expect(words).toContain("n/m is not modelled (40 m): the engine has no model of the antenna on that band, so there is no figure.");
    expect(words).toContain("The transmitting antenna:");
    // The band is not among the best bands, and 20 m is still predicted.
    expect(words).not.toMatch(/Best bands[^.]*40 m/);
    expect(bestHourOf(result)).not.toBeNull();

    // Asked about a frequency the wire is not modelled on: said outright, and not as a closed path.
    const asked = prediction();
    asked.request = { ...asked.request, txAntenna: wire, frequencyMhz: 7.1 };
    for (const hour of asked.hours) hour.asked = { ...noPath(7.1), notModelled: true };
    const said = wordsOf(predictionDocument(asked));
    expect(said).toContain(
      "7.10 MHz is not modelled with this antenna, so no figure is given for it: this is not a prediction that the path is closed.",
    );
    expect(said).not.toContain("At no hour of the day does the engine find a way");
    expect(said).toContain("that is not the same as no path");
  });

  it("prints what an answer carries that this file has never heard of", () => {
    // What another builder's engine might add: a band it does not model, said on the cell; a third antenna line; a note of its own.
    const result = prediction() as PredictionResult & { notes?: string[]; antennas: Record<string, string> };
    result.notes = ["The transmitting wire is 20.1 m long, which is not a half wave on 30 m."];
    result.antennas.tuner = "A tuner's loss is not modelled.";
    for (const hour of result.hours) {
      const thirty = hour.bands[3] as unknown as Record<string, unknown>;
      thirty.reliability = null;
      thirty.path = null;
      thirty.unmodelled = "Not modelled for this band: the wire is not resonant here.";
      // A cell that is missing altogether.
      (hour.bands as unknown as Array<PredictionCell | null>)[5] = null;
    }
    const blocks = predictionDocument(result);
    const words = wordsOf(blocks);
    expect(words).toContain("More that came with the answer");
    expect(words).toContain("The transmitting wire is 20.1 m long, which is not a half wave on 30 m.");
    expect(words).toContain("30 m: Not modelled for this band: the wire is not resonant here.");
    expect(words).toContain("tuner: A tuner's loss is not modelled.");
    const bands = tableAfter(blocks, "Bands by hour");
    expect(bands.rows[3]!.slice(1)).toEqual(Array(24).fill(NO_FIGURE));
    expect(bands.rows[5]!.slice(1)).toEqual(Array(24).fill(NO_FIGURE));
  });

  it("is the same content as Markdown, with tables whose columns line up", () => {
    const markdown = predictionMarkdown(prediction());
    expect(markdown).toMatch(/^# HF prediction: London to Edinburgh, 14\.2 MHz \(20 m\)\n/);
    expect(markdown).toContain("## Bands by hour");
    expect(markdown).toContain("| 13:00 |    91 |      46 |     47 |");
    const rows = markdown.split("\n").filter((line) => line.startsWith("| 80 m") || line.startsWith("| UTC  |  01"));
    expect(new Set(rows.map((line) => line.length)).size).toBe(1);
  });
});

describe("the prediction as a PDF", () => {
  it("lays out the prediction's own words, with the chart, the path, the world and the page on how HF travels", () => {
    const doc = predictionPrint(prediction(), "a4", { land: null });
    const text = contentText(doc.content);
    for (const words of [
      "London to Edinburgh, 14.2 MHz (20 m)",
      "534 km",
      "13:00",
      "91%",
      "A monthly median, not the day",
      "Usable frequencies through the day",
      "MUF: open half the days",
      "14.18 MHz asked",
      "The path at 13:00 UTC: 1F2",
      "F2 at 300 km (virtual height)",
      "Day and night at 13:00 UTC on 16 November 2026",
      "Bands by hour",
      "Share of days:",
      "How HF gets there",
      "skip zone",
      "D, 50 to 90 km: absorbs, by day only",
      "comes down all round: no skip zone",
      "A prediction, not a promise",
      "Key abc123def456",
    ])
      expect(text, words).toContain(words);
    // The bands' cells carry their figures, and a band with no path has dashes, never a nought.
    expect(text).toMatch(/10 m( -){24}/);
  });

  it("holds its words as text a reader finds, in reading order, on A4 and US Letter", async () => {
    const result = prediction();
    const { pages, info, text } = await readPdf((await renderPdf(predictionPrint(result, "a4"))).bytes);
    expect(pages[0]).toMatchObject({ width: 595.28, height: 841.89 });
    expect(info.Title).toBe("HF prediction, London to Edinburgh, 20 m, for 16 Nov 2026");
    const order = [
      "London to Edinburgh, 14.2 MHz (20 m)",
      "For 16 November 2026",
      "smoothed sunspot number of 87",
      "The best of it",
      "does best at 13:00 UTC",
      "The path and the stations",
      "Transmitter: London",
      "14.2 MHz hour by hour",
      "Bands by hour",
      "Before relying on it",
      "Where these figures come from",
      "Key abc123def456",
      "How HF gets there",
    ];
    let from = 0;
    const flat = text.replace(/\s+/g, " ");
    for (const words of order) {
      const at = flat.indexOf(words, from);
      expect(at, `"${words}" after position ${from}`).toBeGreaterThanOrEqual(0);
      from = at + words.length;
    }
    expect(flat).toContain("Every figure is a monthly median: what a month like this one usually does.");
    const letter = await readPdf((await renderPdf(predictionPrint(result, "letter"))).bytes);
    expect(letter.pages[0]).toMatchObject({ width: 612, height: 792 });
  });

  it("is the same file each time it is made for the same answer", async () => {
    const make = async (result: PredictionResult) => Buffer.from((await renderPdf(predictionPrint(result))).bytes);
    const first = await make(prediction());
    expect((await make(prediction())).equals(first)).toBe(true);
    // The answer's `cached` mark changes when it is asked for again; the file does not.
    expect((await make(prediction({ cached: true }))).equals(first)).toBe(true);
    // A later answer is another file.
    expect((await make(prediction({ computedAt: Date.UTC(2026, 10, 17) }))).equals(first)).toBe(false);
  });

  it("prints a place in another script in its own letters, in the drawings too", async () => {
    const result = prediction();
    result.request.rx.name = "Москва";
    const { text } = await readPdf((await renderPdf(predictionPrint(result, "a4", { land: null }))).bytes);
    expect(text).toContain("London to Москва");
    // The path drawn at its best hour names both ends.
    expect(text.split("Москва").length).toBeGreaterThan(3);
  }, 60_000);
});
