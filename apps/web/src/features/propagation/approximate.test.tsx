/**
 * A level wire's three states where figures are shown: on a half-wave band (VOACAP's
 * dipole), on a band where it is longer (approximate figures, run as VOACAP's sloping long
 * wire laid level) and on a band where it is shorter (not modelled). The band table, the
 * headline, the plan's matrix, and the words of the prediction, comparison and plan
 * exports each keep the three apart, and none says approximate by colour alone. (The
 * coverage map's words are in coverage-map/coverage-document.test.ts.)
 */
import {
  ANTENNA_PRESETS,
  type AntennaSpec,
  APPROXIMATE_KEY,
  type CommunicationPlan,
  type CompareResult,
  HF_BANDS,
  MODEL_JOIN_NOTE,
  type PlanResult,
  type PredictionCell,
  type PredictionResult,
  pathRunOn,
  RUN_LABELS,
  runLine,
} from "@outpost/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { comparisonDocument } from "./comparison-document";
import { planDocument, planPdf, toMarkdown } from "./plans/document";
import { Pair } from "./plans/plan-page";
import { predictionDocument, predictionMarkdown, predictionPdf } from "./prediction-document";
import { cell, prediction, wordsOf } from "./prediction-fixture";
import { Results } from "./results";

afterEach(() => vi.unstubAllGlobals());

const flat10 = ANTENNA_PRESETS.find((item) => item.id === "efhw-10m-horizontal")!.spec;
const dipole = ANTENNA_PRESETS.find((item) => item.id === "low-dipole")!.spec;

const blank = (mhz: number): PredictionCell => ({
  ...cell(mhz, 0),
  path: null,
  hops: 0,
  layer: "",
  snrDbHz: 0,
  signalDbw: 0,
  notModelled: true,
});

/** The fixture's day with the 10 m level wire transmitting: each band in the state the shared rule gives it. */
function wireResult(frequencyMhz: number, wire: AntennaSpec = flat10): PredictionResult {
  const base = prediction();
  const request = { ...base.request, txAntenna: wire, rxAntenna: dipole, frequencyMhz };
  const shaped = (target: PredictionCell, mhz: number): PredictionCell => {
    const state = pathRunOn(wire, dipole, mhz);
    if (state === "not-modelled") return blank(mhz);
    return state === "approximate" ? { ...target, mhz, approximate: true } : { ...target, mhz };
  };
  const sweepMhz = Array.from({ length: 29 }, (_, index) => index + 2);
  return {
    ...base,
    request,
    sweepMhz,
    hours: base.hours.map((hour) => ({
      ...hour,
      sweepReliability: sweepMhz.map(() => 0.5),
      sweepSnrDbHz: sweepMhz.map(() => 40),
      asked: shaped(hour.bands[HF_BANDS.findIndex((band) => band.mhz === frequencyMhz)] ?? hour.asked, frequencyMhz),
      bands: hour.bands.map((item, index) => shaped(item, HF_BANDS[index]!.mhz)),
    })),
    runs: [frequencyMhz, ...HF_BANDS.map((band) => band.mhz)].map((mhz) => runLine(wire, dipole, mhz)),
  };
}

const shown = (node: React.ReactNode) => {
  vi.stubGlobal("scrollTo", vi.fn());
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({}), { status: 404, headers: { "content-type": "application/json" } })),
  );
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>{node}</MemoryRouter>
    </QueryClientProvider>,
  );
};

describe("the headline for a frequency on which the level wire is approximate", () => {
  it("says approximate in its first line, and in a notice that gives the reason", () => {
    shown(<Results result={wireResult(21.22)} hour={13} onHour={() => {}} />);
    const section = screen.getByRole("heading", { name: "London to Edinburgh" }).closest("section")!;
    // The reading's first line, above the MUF and the share of days.
    const first = section.querySelector("p[data-approximate]")!;
    expect(first.parentElement!.firstElementChild).toBe(first);
    expect(first.textContent).toMatch(/^Approximate figures for 21\.2 MHz\./);
    const notice = screen.getByText("Approximate figures for 21.2 MHz").closest('[role="status"], [role="alert"]')!;
    expect(notice.textContent).toContain(
      "The transmitting antenna: 10 m of wire is 0.71 wavelengths at 21.22 MHz, longer than a half-wave",
    );
    expect(notice.textContent).toContain("sloping long wire (type 41) laid level");
    // The figures are shown, each said to be approximate, and nothing says there is no figure.
    expect(screen.getByText(/% for SSB voice \(approximate\)$/)).toBeTruthy();
    expect(screen.queryByText(/No figure for/)).toBeNull();
    // The heat map marks the whole megahertz the wire is approximate on, in words in its reading.
    expect(screen.getByText(/A row marked ≈ in a dashed frame has approximate figures/)).toBeTruthy();
    const sweep = screen.getByRole("region", { name: /from 2 to 30 MHz by hour/ });
    expect(sweep.querySelectorAll("g[data-approximate]")).toHaveLength(14);
    expect(sweep.querySelectorAll("rect[data-not-modelled]")).toHaveLength(12);
  });

  it("has nothing approximate about it on the half-wave band", () => {
    shown(<Results result={wireResult(14.18)} hour={13} onHour={() => {}} />);
    expect(screen.queryByText(/^Approximate figures for/)).toBeNull();
    expect(screen.getByText(/% for SSB voice$/)).toBeTruthy();
    // The bands still show all three states, and the step between the two models is said beside them.
    expect(screen.getByText("Two of VOACAP's models side by side")).toBeTruthy();
  });
});

/** The text a reader finds in a PDF, every page joined. */
async function pdfText(file: Uint8Array): Promise<string> {
  const reading = getDocument({
    data: file.slice(),
    useSystemFonts: false,
    disableFontFace: true,
    standardFontDataUrl: `${process.cwd()}/node_modules/pdfjs-dist/standard_fonts/`,
  });
  const document = await reading.promise;
  const pages: string[] = [];
  for (let number = 1; number <= document.numPages; number += 1) {
    const content = await (await document.getPage(number)).getTextContent();
    pages.push((content.items as Array<{ str: string; hasEOL: boolean }>).map((item) => item.str + (item.hasEOL ? "\n" : "")).join(""));
  }
  await reading.destroy();
  return pages.join("\n");
}

describe("the prediction written out", () => {
  it("is a PDF in which a reader finds ~ beside the approximate figures, n/m for the bands with none, and the key to both", async () => {
    const text = (await pdfText(predictionPdf(wireResult(14.18)))).replace(/\s+/g, " ");
    expect(text).toContain("~37");
    expect(text).toContain("n/m");
    expect(text).toContain("~ before a figure is approximate");
    expect(text).toContain("How the antennas were run on each band");
    expect(text).toContain("Approximate: VOACAP's sloping long wire, laid level");
  });

  it("prints the three states in the band table: figures, ~figures and n/m, with the key and the join beside them", () => {
    const result = wireResult(14.18);
    const blocks = predictionDocument(result);
    const table = blocks.find((block) => block.kind === "table" && block.head[0] === "UTC" && block.head.length === 25);
    if (table?.kind !== "table") throw new Error("no band table");
    const row = (label: string) => table.rows.find((item) => item[0] === label)!;
    expect(row("20 m")[13]).toBe("91");
    expect(row("15 m")[13]).toBe("~37");
    expect(row("40 m")[13]).toBe("n/m");
    const words = wordsOf(blocks);
    expect(words).toContain(`${APPROXIMATE_KEY} Approximate here: 17 m, 15 m, 12 m, 10 m.`);
    expect(words).toContain(MODEL_JOIN_NOTE);
    expect(words).toContain(`20 m (14.18 MHz), modelled. Transmitting: ${RUN_LABELS.halfWave}.`);
    expect(words).toContain(`15 m (21.22 MHz), approximate. Transmitting: ${RUN_LABELS.approximate}.`);
    expect(words).toContain("40 m (7.1 MHz), n/m. Transmitting: Not modelled.");
    // The Markdown is the same words.
    expect(predictionMarkdown(result)).toContain("~37");
  });

  it("prints a sloping wire's bands as ~figures from 40 m up and n/m below, with no join between two models", () => {
    const sloper = ANTENNA_PRESETS.find((item) => item.id === "efhw-20m-sloping")!.spec;
    const blocks = predictionDocument(wireResult(14.18, sloper));
    const table = blocks.find((block) => block.kind === "table" && block.head[0] === "UTC" && block.head.length === 25);
    if (table?.kind !== "table") throw new Error("no band table");
    const row = (label: string) => table.rows.find((item) => item[0] === label)!;
    expect(row("40 m")[13]).toMatch(/^~/);
    expect(row("20 m")[13]).toMatch(/^~/);
    expect(row("80 m")[13]).toBe("n/m");
    const words = wordsOf(blocks);
    expect(words).toContain(`7.1 MHz), approximate. Transmitting: ${RUN_LABELS.sloping}.`);
    expect(words).toContain("or a sloping wire, at its slope");
    expect(words).not.toContain(MODEL_JOIN_NOTE);
    expect(blocks[0]).toMatchObject({ kind: "title", text: expect.stringMatching(/, approximate$/) });
  });

  it("says approximate in the title and first finding when the frequency asked about is", () => {
    const blocks = predictionDocument(wireResult(21.22));
    expect(blocks[0]).toMatchObject({ kind: "title", text: expect.stringMatching(/, approximate$/) });
    const findings = blocks.find((block) => block.kind === "list" && block.items[0]!.startsWith("Approximate:"));
    expect(findings).toBeTruthy();
    expect(wordsOf(blocks)).toContain("21.2 MHz hour by hour, approximate");
  });
});

describe("a comparison written out", () => {
  it("marks approximate series ~ and not-modelled ones n/m, never 0", () => {
    const result = wireResult(21.22);
    const series = (label: string, change: object) => ({
      label,
      detail: label,
      ssn: 83,
      reliability: Array(24).fill(0.5),
      snrDbHz: Array(24).fill(30),
      mufMhz: Array(24).fill(20),
      foF2: Array(24).fill(7),
      ...change,
    });
    const comparison = {
      what: "antennas",
      frequencyMhz: 21.22,
      mode: result.mode,
      engine: result.engine,
      basis: result.basis,
      series: [
        series("Dipole", {}),
        series("Wire", { approximate: true }),
        series("Short wire", { notModelled: true, reliability: Array(24).fill(0) }),
      ],
    } as unknown as CompareResult;
    const words = wordsOf(comparisonDocument(result, comparison));
    expect(words).toContain("Dipole | 50 | 50");
    expect(words).toContain("Wire | ~50 | ~50");
    expect(words).toContain("Short wire | n/m | n/m");
    expect(words).toContain(APPROXIMATE_KEY);
    expect(words).toContain("Approximate on this frequency. Wire");
  });
});

describe("a plan with an approximate band", () => {
  const day = (value: number | null) => Array.from({ length: 24 }, () => value);
  const plan = {
    name: "Wires",
    notes: "",
    stations: [
      { id: "a", name: "Home", lat: 51.5, lon: -0.1, powerWatts: 20, antenna: flat10, antennaName: "10 m wire", noise: "rural" },
      { id: "b", name: "Rome", lat: 41.9, lon: 12.5, powerWatts: 20, antenna: dipole, antennaName: "Dipole", noise: "rural" },
    ],
    date: "2026-11-16",
    fromUtc: 9,
    toUtc: 11,
    linked: [],
  } as unknown as CommunicationPlan;
  const pair = {
    a: "a",
    b: "b",
    distanceKm: 1430,
    bearingDeg: 130,
    backBearingDeg: 320,
    problem: null,
    bands: [
      {
        bandId: "40m",
        mhz: 7.1,
        forward: { reliability: day(null), snrDbHz: day(null) },
        back: { reliability: day(null), snrDbHz: day(null) },
      },
      {
        bandId: "20m",
        mhz: 14.18,
        forward: { reliability: day(0.6), snrDbHz: day(50) },
        back: { reliability: day(0.5), snrDbHz: day(48) },
      },
      {
        bandId: "15m",
        mhz: 21.22,
        forward: { reliability: day(0.8), snrDbHz: day(55) },
        back: { reliability: day(0.7), snrDbHz: day(52) },
        approximate: true as const,
      },
    ],
  };
  const result = {
    mode: { id: "cw", label: "CW (Morse)", requiredSnrDb: 24, referenceBandwidthHz: 1, requiredSnrDbHz: 24, source: "" },
    basis: { summary: "Monthly median." },
    pairs: [pair],
    limits: [],
    engine: { model: "VOACAP", implementation: "hfcast" },
    datasets: [],
    computedAt: Date.UTC(2026, 10, 16),
  } as unknown as PlanResult;

  it("writes the three states in the matrix, may recommend the approximate band, and says so in the recommendation", () => {
    const text = toMarkdown(planDocument(plan, result, new Date(Date.UTC(2026, 10, 16))));
    expect(text).toMatch(/\| 40 m +\| +n\/m \| +n\/m \| +n\/m \|/);
    expect(text).toMatch(/\| 20 m +\| +50 \| +50 \| +50 \|/);
    expect(text).toMatch(/\| 15 m +\| +~70 \| +~70 \| +~70 \|/);
    expect(text).toContain("15 m, approximate, up to ~70%");
    expect(text).toContain("Primary: 15 m (21.22 MHz), approximate, 09:00 to 11:00 UTC.");
    expect(text).toContain("These figures are approximate");
    expect(text).toContain("15 m: Home's 10 m level wire is longer than a half-wave here, run as VOACAP's sloping long wire laid level.");
    expect(text).toContain(MODEL_JOIN_NOTE);
    expect(text).toContain("Alternate: 20 m (14.18 MHz), 09:00");
  });

  it("is a PDF that says the same", async () => {
    const text = (await pdfText(planPdf(plan, result, new Date(Date.UTC(2026, 10, 16))))).replace(/\s+/g, " ");
    expect(text).toContain("15 m, approximate, up to ~70%");
    expect(text).toContain("~70");
    expect(text).toContain("n/m is not modelled");
  });

  it("shows the three states on the plan's screen in words and marks", () => {
    shown(
      <ul>
        <Pair pair={pair as never} plan={plan} result={result} />
      </ul>,
    );
    expect(screen.getByText(/^Approximate on 15 m\./)).toBeTruthy();
    const grid = screen.getByRole("region", { name: /Two-way reliability between Home and Rome/ });
    expect(grid.querySelectorAll("g[data-approximate]")).toHaveLength(1);
    expect(grid.querySelectorAll("rect[data-not-modelled]")).toHaveLength(1);
    expect(within(grid).getByText("15 m ≈")).toBeTruthy();
    const table = screen.getByRole("table", { name: /share of days/ });
    expect(within(table).getByText("15 m ≈").closest("tr")!.textContent).toContain("≈70%");
    expect(within(table).getByText("40 m").closest("tr")!.textContent).toContain("not modelled");
  });
});
