/**
 * The prediction's PDF on the planner, and the comparison's under its chart: what is
 * offered, what the file is called, and what the comparison's pages say.
 */
import type { CompareResult } from "@outpost/shared";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderPdf } from "@/features/print-kit";
import { comparisonDocument, comparisonTitle } from "./comparison-document";
import { ComparisonExport, PredictionExport } from "./prediction-export";
import { prediction, wordsOf } from "./prediction-fixture";
import { comparisonPrint } from "./print/comparison-print";
import { readPdf } from "./print/read-pdf";

const saved: Array<{ name: string; type: string; content: Uint8Array | string }> = [];
vi.mock("./plans/document", async (original) => ({
  ...(await original<typeof import("./plans/document")>()),
  saveFile: (name: string, type: string, content: Uint8Array | string) => saved.push({ name, type, content }),
}));

const made: File[] = [];
beforeEach(() => {
  URL.createObjectURL = vi.fn((file: Blob) => `blob:made-${made.push(file as File)}`);
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => {
  localStorage.clear();
  saved.length = 0;
  made.length = 0;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const comparison = (): CompareResult => {
  const base = prediction();
  const series = (label: string, detail: string, ssn: number, top: number) => ({
    label,
    detail,
    ssn,
    reliability: Array.from({ length: 24 }, (_, index) => (index >= 8 && index <= 15 ? top : 0)),
    snrDbHz: Array.from({ length: 24 }, (_, index) => (index >= 8 && index <= 15 ? 50 : 3)),
    mufMhz: Array.from({ length: 24 }, () => 12.4),
    foF2: Array.from({ length: 24 }, (_, index) => (index === 11 ? 7.9 : 5)),
  });
  return {
    what: "power",
    frequencyMhz: 14.18,
    mode: base.mode,
    series: [series("5 W", "5 W at the transmitter", 83, 0.21), series("100 W", "100 W at the transmitter", 83, 0.67)],
    engine: base.engine,
    basis: base.basis,
  };
};

describe("the prediction's PDF on the planner", () => {
  it("offers the PDF to save, to add to the library and as Markdown, on the paper chosen", async () => {
    // A device set to a country that prints on A4.
    vi.spyOn(navigator, "language", "get").mockReturnValue("en-GB");
    render(
      <MemoryRouter>
        <PredictionExport result={prediction()} />
      </MemoryRouter>,
    );
    const block = screen.getByRole("region", { name: "This prediction as a PDF" });
    await waitFor(() => expect(block).toHaveTextContent(/\d pages of A4, made on this device/), { timeout: 15_000 });
    const save = await within(block).findByRole("link", { name: "Save as PDF" });
    expect(save).toHaveAttribute("download", "hf-prediction-london-to-edinburgh-20-m-for-16-nov-2026.pdf");
    expect(within(block).getByRole("button", { name: "Add to library" })).toBeEnabled();
    expect((await made.at(-1)!.text()).startsWith("%PDF-1.")).toBe(true);
    const a4 = made.at(-1)!.size;

    // US Letter is the same choice as the paper aids on the Encryption screen, and is remembered.
    fireEvent.click(within(block).getByRole("radio", { name: "US Letter" }));
    await waitFor(() => expect(block).toHaveTextContent("pages of US Letter"), { timeout: 15_000 });
    expect(localStorage.getItem("outpost.encryption.paper")).toBe('"letter"');
    await waitFor(() => expect(made.at(-1)!.size).not.toBe(a4));
    const letter = await readPdf(new Uint8Array(await made.at(-1)!.arrayBuffer()));
    expect(letter.pages[0]).toMatchObject({ width: 612, height: 792 });

    fireEvent.click(within(block).getByRole("button", { name: "Export as Markdown" }));
    expect(saved[0]).toMatchObject({
      name: "hf-prediction-london-to-edinburgh-20-m-for-16-nov-2026.md",
      type: "text/markdown;charset=utf-8",
    });
    expect(saved[0]!.content).toContain("# HF prediction: London to Edinburgh, 14.2 MHz (20 m)");
  });

  it("says which saved prediction it was made from", async () => {
    const sent: FormData[] = [];
    class Upload {
      upload = {};
      status = 200;
      responseText = JSON.stringify({
        results: [{ originalName: "x.pdf", status: "created", document: { id: "d2", title: "T", category: "Made in Outpost" } }],
      });
      onload: (() => void) | undefined;
      open() {}
      setRequestHeader() {}
      send(form: FormData) {
        sent.push(form);
        this.onload?.();
      }
      abort() {}
    }
    vi.stubGlobal("XMLHttpRequest", Upload);
    const result = prediction();
    result.request.rx.name = "Москва";
    render(
      <MemoryRouter>
        <PredictionExport result={result} savedName="Evening sked" />
      </MemoryRouter>,
    );
    await screen.findByRole("link", { name: "Save as PDF" }, { timeout: 15_000 });
    fireEvent.click(screen.getByRole("button", { name: "Add to library" }));
    expect(sent[0]!.get("source")).toBe("Made in Outpost from the saved HF prediction “Evening sked”: /radio/propagation");
    expect(sent[0]!.get("title")).toBe("HF prediction, London to Москва, 20 m, for 16 Nov 2026");
    expect(sent[0]!.get("tags")).toBe("HF prediction");
  });
});

describe("the comparison's PDF", () => {
  it("is named for what was changed, and gives every series its figures by hour", () => {
    const result = prediction();
    const compared = comparison();
    expect(comparisonTitle(result, compared)).toBe("HF comparison, London to Edinburgh, 20 m, transmitter power, for 16 Nov 2026");
    const blocks = comparisonDocument(result, compared);
    const words = wordsOf(blocks);
    expect(words).toContain("HF comparison: London to Edinburgh, 14.2 MHz (20 m), transmitter power");
    expect(words).toContain(
      "The same path at other powers. Everything else is as in the prediction for 16 November 2026: 100 W, SSB voice, taken to need 45 dB in 1 Hz.",
    );
    expect(words).toContain(compared.basis.summary);
    expect(words).toContain("5 W | 5 W at the transmitter | 83 | 7.9");
    const reliability = blocks.filter((block) => block.kind === "table")[1]!;
    if (reliability.kind !== "table") throw new Error("expected a table");
    expect(reliability.rows[0]).toEqual(["5 W", ...Array(8).fill("0"), ...Array(8).fill("21"), ...Array(8).fill("0")]);
    expect(reliability.rows[1]!.slice(9, 17)).toEqual(Array(8).fill("67"));
    for (const limit of result.limits) expect(words).toContain(limit);
    expect(words).toContain("Compared from the prediction answered on 16 November 2026 at 14:32 UTC, key abc123def456.");
  });

  it("prints a dash where a series has no figure, and is the same file each time", async () => {
    const result = prediction();
    const compared = comparison();
    (compared.series[0]!.reliability as Array<number | null>)[3] = null;
    compared.series[1]!.snrDbHz = [];
    const tables = comparisonDocument(result, compared).filter((block) => block.kind === "table");
    if (tables[1]?.kind !== "table" || tables[2]?.kind !== "table") throw new Error("expected tables");
    expect(tables[1].rows[0]![4]).toBe("-");
    expect(tables[2].rows[1]!.slice(1)).toEqual(Array(24).fill("-"));
    const make = async () => Buffer.from((await renderPdf(comparisonPrint(result, comparison()))).bytes);
    expect((await make()).equals(await make())).toBe(true);
    const { text } = await readPdf(new Uint8Array(await make()));
    expect(text).toContain("Reliability of 14.18 MHz through the day");
    expect(text).toContain("5 W at the transmitter");
  });

  it("is offered under the chart with the same three things", async () => {
    render(
      <MemoryRouter>
        <ComparisonExport result={prediction()} comparison={comparison()} />
      </MemoryRouter>,
    );
    const block = await screen.findByRole("region", { name: "This comparison as a PDF" });
    expect(await within(block).findByRole("link", { name: "Save as PDF" }, { timeout: 15_000 })).toHaveAttribute(
      "download",
      "hf-comparison-london-to-edinburgh-20-m-transmitter-power-for-16-nov-2026.pdf",
    );
    expect(within(block).getByRole("button", { name: "Add to library" })).toBeEnabled();
    fireEvent.click(within(block).getByRole("button", { name: "Export as Markdown" }));
    expect(saved[0]!.name).toBe("hf-comparison-london-to-edinburgh-20-m-transmitter-power-for-16-nov-2026.md");
  });
});
