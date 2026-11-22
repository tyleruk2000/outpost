/**
 * The comparison on paper, laid out with the print kit: what was tried, each thing's
 * reliability through the day as lines on one chart, and the engine's figures by hour as
 * shaded grids. The words are the comparison's own blocks (comparison-document.ts).
 */
import type { CompareResult, PredictionResult } from "@outpost/shared";
import type { Content, TDocumentDefinitions } from "pdfmake/interfaces";
import {
  blocksToContent,
  bullets,
  PRINT_COLOURS as C,
  type ChartLine,
  callout,
  chart,
  dataTable,
  figure,
  label,
  measureOf,
  note,
  para,
  printDocument,
  sectionHeader,
} from "@/features/print-kit";
import { appLocale } from "@/lib/region";
import { comparisonDocument, comparisonTitle } from "../comparison-document";
import { NO_FIGURE, NOT_MODELLED, type PredictionPaper } from "../prediction-document";
import { groupsOf } from "./prediction-print";
import { darkSpans, heatGrid, heatKey, kept, shareLevel } from "./radio-parts";

const monthYear = new Intl.DateTimeFormat(appLocale(), { month: "long", year: "numeric", timeZone: "UTC" });

/** Each series its own colour and its own dash, so that grey keeps them apart. */
export const SERIES_LOOKS: Array<{ colour: string; dash?: string }> = [
  { colour: C.know },
  { colour: C.act, dash: "5 2" },
  { colour: C.accent, dash: "1.5 2" },
  { colour: C.warn, dash: "7 2 1.5 2" },
  { colour: C.ink, dash: "3 3" },
  { colour: C.muted, dash: "8 3" },
];

const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

export function comparisonPrint(result: PredictionResult, comparison: CompareResult, paper: PredictionPaper = "a4"): TDocumentDefinitions {
  const measure = measureOf(paper);
  const groups = groupsOf(comparisonDocument(result, comparison));
  const opening = groups.get("") ?? [];
  const title = opening[0]?.kind === "title" ? opening[0].text.replace(/^HF comparison: /, "") : "";
  const content: Content[] = [
    sectionHeader(
      {
        number: 1,
        title,
        subtitle: `HF comparison for any day of ${monthYear.format(new Date(`${result.request.date}T00:00:00Z`))}`,
        id: "comparison",
      },
      measure,
    ),
  ];
  if (opening[1]?.kind === "para") content.push(para(opening[1].text));
  if (opening[2]?.kind === "para") content.push(callout("know", "A monthly median, not the day", para(opening[2].text)));
  const tried = groups.get("What was tried") ?? [];
  const triedTable = tried.find((block) => block.kind === "table");
  if (triedTable?.kind === "table")
    content.push(label("What was tried"), dataTable(triedTable.head, triedTable.rows, { right: triedTable.right, bold: [0] }));

  // Reliability through the day, one line a series.
  const xs = Array.from({ length: 24 }, (_, index) => index + 1);
  const byRatio = comparison.mode.requiredSnrDbHz === null;
  const lines: ChartLine[] = comparison.series.map((series, index) => ({
    kind: "line",
    name: series.label,
    values: xs.map((_, hour) => {
      if (series.notModelled) return null;
      const value = (byRatio ? series.snrDbHz : series.reliability)?.[hour];
      return isNumber(value) ? (byRatio ? value : value * 100) : null;
    }),
    colour: SERIES_LOOKS[index % SERIES_LOOKS.length]!.colour,
    dash: SERIES_LOOKS[index % SERIES_LOOKS.length]!.dash,
    width: 1.8,
    dots: true,
  }));
  content.push(
    figure(
      chart({
        width: measure,
        height: 190,
        xs,
        xDomain: [0.5, 24.5],
        xTicks: [3, 6, 9, 12, 15, 18, 21, 24],
        xTick: (hour) => `${String(hour).padStart(2, "0")}:00`,
        xLabel: "Hour, UTC",
        yLabel: byRatio ? "dB in 1 Hz" : "% of days",
        yDomain: byRatio ? undefined : [0, 100],
        spans: darkSpans(result.request.date, result.path.midpoint, "Sun down mid-path"),
        series: lines,
      }).svg,
      {
        width: measure,
        title: byRatio ? "Signal-to-noise ratio through the day" : `Reliability of ${comparison.frequencyMhz} MHz through the day`,
        caption: byRatio
          ? "The median signal-to-noise ratio in 1 Hz for each thing tried, hour by hour. No line where the engine gave no figure."
          : "The share of the month's days on which the mode reaches what it is taken to need, for each thing tried, hour by hour. No line where the engine gave no figure. Grey: the Sun is down at the path's middle.",
      },
    ),
  );

  // The figures by hour.
  const hourHeads = xs.map((hour) => String(hour).padStart(2, "0"));
  const grid = (name: string, shaded: boolean) => {
    const blocks = groups.get(name) ?? [];
    const table = blocks.find((block) => block.kind === "table");
    if (table?.kind !== "table") return [];
    const out: Content[] = [
      label(name),
      heatGrid(
        hourHeads,
        table.rows.map((row, index) => ({
          label: row[0]!,
          cells: row.slice(1).map((text, hour) => {
            const value = comparison.series[index]?.reliability?.[hour];
            return { text, level: shaded && text !== NO_FIGURE && text !== NOT_MODELLED && isNumber(value) ? shareLevel(value) : null };
          }),
        })),
        measure,
        { labelWidth: 52 },
      ),
    ];
    if (shaded) out.push(heatKey(measure));
    for (const block of blocks) if (block.kind === "para") out.push(note(block.text));
    return [kept(...out)];
  };
  const names = [...groups.keys()];
  const reliabilityName = names.find((name) => name.startsWith("Reliability of"));
  if (reliabilityName) content.push(...grid(reliabilityName, true));
  content.push(...grid("Median signal-to-noise ratio by hour", false));
  content.push(...grid("The path's MUF by hour", false));

  const limits = groups.get("Before relying on it") ?? [];
  content.push(
    callout(
      "warn",
      "Before relying on it",
      limits.flatMap((block) => (block.kind === "list" ? [bullets(block.items)] : blocksToContent([block], measure))),
    ),
    label("Where these figures come from"),
    ...(groups.get("Where these figures come from") ?? []).map((block) => note(block.kind === "para" ? block.text : "")),
  );

  return printDocument({
    paper,
    title: comparisonTitle(result, comparison),
    made: new Date(result.computedAt),
    footerName: `HF comparison · ${result.request.tx.name} to ${result.request.rx.name}`,
    footerRight: `VOACAP medians about ${monthYear.format(new Date(`${result.request.date}T00:00:00Z`))}`,
    parts: [{ kind: "section", running: `1 · ${title}`, content }],
  });
}
