/**
 * The prediction on paper, laid out with the print kit. The words are the prediction's
 * own blocks (prediction-document.ts), so the PDF and the Markdown say the same thing;
 * this file only decides how each part looks, and adds what pictures can: the key
 * figures, the usable frequencies through the day as a chart, the path in section at its
 * best hour, the world's day and night at that hour, the bands by hour as shaded cells,
 * and a page on how HF travels.
 *
 * Every figure drawn is the engine's. The file is dated by when the engine answered, so
 * the same answer is the same file.
 */
import { bandOf, type PredictionResult, utcLabel } from "@outpost/shared";
import type { Content, TDocumentDefinitions } from "pdfmake/interfaces";
import {
  blocksToContent,
  bullets,
  callout,
  dataTable,
  figure,
  heading,
  label,
  measureOf,
  note,
  para,
  printDocument,
  sectionHeader,
} from "@/features/print-kit";
import { appLocale } from "@/lib/region";
import type { Block } from "../plans/document";
import { bestHourOf, NO_FIGURE, NOT_MODELLED, type PredictionPaper, predictionDocument, predictionTitle } from "../prediction-document";
import { type LandShapes, pathSection } from "./radio-diagrams";
import {
  bandsUnder,
  greyLineFigure,
  heatGrid,
  heatKey,
  howHfTravels,
  kept,
  keyFigures,
  shareLevel,
  usableFrequencyChart,
} from "./radio-parts";

const longDate = new Intl.DateTimeFormat(appLocale(), { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const monthYear = new Intl.DateTimeFormat(appLocale(), { month: "long", year: "numeric", timeZone: "UTC" });

/** The blocks under each heading, by the heading's words; the blocks before the first heading under "". */
export function groupsOf(blocks: Block[]): Map<string, Block[]> {
  const groups = new Map<string, Block[]>();
  let current = "";
  groups.set(current, []);
  for (const block of blocks) {
    if (block.kind === "heading") {
      current = block.text;
      groups.set(current, []);
    } else groups.get(current)!.push(block);
  }
  return groups;
}

const textOf = (block: Block | undefined) => (block && (block.kind === "para" || block.kind === "title") ? block.text : "");
const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

export interface PredictionPrintOptions {
  /** Natural Earth's outline of the land, for the world at the best hour; without it the sketch has no coasts. */
  land?: LandShapes | null;
}

export function predictionPrint(
  result: PredictionResult,
  paper: PredictionPaper = "a4",
  options: PredictionPrintOptions = {},
): TDocumentDefinitions {
  const measure = measureOf(paper);
  const blocks = predictionDocument(result);
  const groups = groupsOf(blocks);
  const { request, path } = result;
  const best = bestHourOf(result);
  const band = bandOf(request.frequencyMhz);
  const frequency = band ? band.label : `${request.frequencyMhz} MHz`;
  const noMode = result.mode.requiredSnrDbHz === null;

  // ── 1. The prediction ──
  const opening = groups.get("") ?? [];
  const titleWords = textOf(opening[0]).replace(/^HF prediction: /, "");
  const first: Content[] = [
    sectionHeader(
      {
        number: 1,
        title: titleWords,
        subtitle: `HF prediction for any day of ${monthYear.format(new Date(`${request.date}T00:00:00Z`))}. ${result.mode.label}, ${request.powerWatts} W.`,
        id: "prediction",
      },
      measure,
    ),
  ];
  const bestShare = best && !noMode ? best.asked.reliability : null;
  first.push(
    keyFigures([
      { value: `${Math.round(path.distanceKm)} km`, label: "the path" },
      { value: `${Math.round(path.bearingDeg)}°`, label: `bearing from ${request.tx.name}` },
      { value: best ? utcLabel(best.utc) : NO_FIGURE, label: `best hour for ${frequency}, UTC`, tone: "know" },
      ...(noMode
        ? []
        : [
            {
              value: isNumber(bestShare) ? `${Math.round(bestShare * 100)}%` : NO_FIGURE,
              label: "of days, at that hour",
              tone: "act" as const,
            },
          ]),
      { value: best && isNumber(best.mufMhz) ? `${best.mufMhz.toFixed(1)}` : NO_FIGURE, label: "MUF then, MHz" },
    ]),
  );
  first.push(para(textOf(opening[1])));
  first.push(callout("know", "A monthly median, not the day", para(textOf(opening[2]))));
  const findings = groups.get("The best of it") ?? [];
  first.push(
    callout(
      "act",
      "The best of it",
      findings.flatMap((block) => (block.kind === "list" ? [bullets(block.items)] : blocksToContent([block], measure))),
      { keep: false },
    ),
  );
  const chartDrawing = usableFrequencyChart(result, measure);
  const top = Math.max(...result.hours.map((hour) => hour.hpfMhz).filter(isNumber), request.frequencyMhz);
  first.push(
    figure(chartDrawing.svg, {
      width: measure,
      title: "Usable frequencies through the day",
      caption: `The engine's figures for this path, hour by hour. Below the MUF the path is open on half the days; below the FOT on nine days in ten; the shaded band runs from the FOT up to the frequency open on one day in ten. The lowest usable frequency (LUF) is drawn where the engine gave one. Grey: the Sun is down at the path's middle. Bands under the top of the chart: ${bandsUnder(top * 1.1)} MHz.`,
    }),
  );

  // The path and stations, then the path drawn at its best hour and the world then.
  first.push(kept(heading("The path and the stations"), ...blocksToContent(groups.get("The path and the stations") ?? [], measure)));
  for (const name of [...groups.keys()].filter((name) => name === "How the antennas were run on each band")) {
    first.push(label(name), ...blocksToContent(groups.get(name)!, measure));
  }
  if (best && typeof best.asked.path === "string") {
    const { drawing, stretch } = pathSection(measure, {
      distanceKm: path.distanceKm,
      hops: best.asked.hops,
      virtualHeightKm: best.asked.virtualHeightKm,
      takeoffDeg: best.asked.takeoffDeg,
      layer: best.asked.layer,
      from: request.tx.name,
      to: request.rx.name,
    });
    first.push(
      figure(drawing.svg, {
        width: measure,
        title: `The path at ${utcLabel(best.utc)} UTC: ${best.asked.path}`,
        caption: `The engine's mode at the best hour: ${best.asked.hops} ${best.asked.hops === 1 ? "hop" : "hops"} off the ${best.asked.layer || "ionosphere"} at a virtual height of ${Math.round(best.asked.virtualHeightKm)} km, leaving ${Math.round(best.asked.takeoffDeg)}° above the horizon. Drawn as the textbook triangle, with the ground flat and heights ${Math.round(stretch)} times their scale against distances. The regions' heights are the Bureau of Meteorology's; green is the ground wave's reach over land, up to 100 km.`,
      }),
    );
    const at = Date.parse(`${request.date}T00:00:00Z`) + best.utc * 3_600_000;
    first.push(
      ...greyLineFigure(measure, at, [request.tx, request.rx], options.land ?? null, {
        title: `Day and night at ${utcLabel(best.utc)} UTC on ${longDate.format(new Date(`${request.date}T00:00:00Z`))}`,
        caption:
          "Worked out with the same arithmetic as the map's grey line (Jean Meeus, Astronomical Algorithms). Where a path runs in darkness the D region, which soaks up lower frequencies by day, is gone. World outline: Natural Earth.",
      }),
    );
  }

  // ── 2. Hour by hour ──
  const second: Content[] = [
    sectionHeader(
      { number: 2, title: "Hour by hour", subtitle: `${frequency} and every band, each hour of the day, UTC`, id: "hours" },
      measure,
    ),
  ];
  const askedName = [...groups.keys()].find((name) => name.includes("hour by hour"));
  if (askedName) {
    const [table, ...rest] = groups.get(askedName)!;
    second.push(label(askedName));
    if (table?.kind === "table") second.push(dataTable(table.head, table.rows, { right: table.right }));
    for (const block of rest) second.push(block.kind === "para" ? note(block.text) : blocksToContent([block], measure)[0]!);
  }
  const bandsGroup = groups.get("Bands by hour") ?? [];
  const bandsAt = second.length;
  second.push(label("Bands by hour"));
  const hourHeads = result.hours.map((hour) => String(hour.utc).padStart(2, "0"));
  const bandTable = bandsGroup.find((block) => block.kind === "table");
  if (bandTable?.kind === "table") {
    second.push(
      heatGrid(
        hourHeads,
        bandTable.rows.map((row, index) => ({
          label: row[0]!,
          cells: row.slice(1).map((text, hour) => {
            const cell = result.hours[hour]?.bands?.[index];
            const share = noMode || text === NO_FIGURE || text === NOT_MODELLED ? null : (cell?.reliability ?? null);
            return { text, level: shareLevel(share) };
          }),
        })),
        measure,
      ),
    );
    if (!noMode) second.push(heatKey(measure));
  }
  for (const block of bandsGroup.filter((block) => block.kind !== "table"))
    second.push(block.kind === "para" ? note(block.text) : blocksToContent([block], measure)[0]!);
  second.splice(bandsAt, second.length - bandsAt, kept(...second.slice(bandsAt)));
  const more = groups.get("More that came with the answer");
  if (more) second.push(label("More that came with the answer"), ...blocksToContent(more, measure));

  // Before relying on it, at the end of the figures.
  const limits = groups.get("Before relying on it") ?? [];
  const where = groups.get("Where these figures come from") ?? [];
  second.push(
    kept(
      heading("Before relying on it"),
      callout(
        "warn",
        "A prediction, not a promise",
        limits.flatMap((block) => (block.kind === "list" ? [bullets(block.items)] : blocksToContent([block], measure))),
      ),
    ),
    label("Where these figures come from"),
    ...where.map((block) => note(textOf(block))),
  );

  // ── 3. How HF travels ──
  const third: Content[] = [
    sectionHeader(
      { number: 3, title: "How HF gets there", subtitle: "Ground wave, sky wave, the skip zone, and coming back straight down", id: "how" },
      measure,
    ),
    ...howHfTravels(measure).slice(1),
  ];

  return printDocument({
    paper,
    title: predictionTitle(result),
    subject: `${request.tx.name} to ${request.rx.name}`,
    made: new Date(result.computedAt),
    footerName: `HF prediction · ${request.tx.name} to ${request.rx.name}`,
    footerRight: `VOACAP median for ${monthYear.format(new Date(`${request.date}T00:00:00Z`))}`,
    parts: [
      { kind: "section", running: `1 · ${titleWords}`, content: first },
      { kind: "section", running: "2 · Hour by hour", content: second },
      { kind: "section", running: "3 · How HF gets there", content: third },
    ],
  });
}
