/**
 * A communication plan on paper, laid out with the print kit: which band for each pair
 * at the top, each pair's two-way figures as shaded hours, the stations on the world at
 * the start of the window with day and night, a log to fill in, and the page on how HF
 * travels. The words are the plan's own blocks (plans/document.ts).
 */
import { type CommunicationPlan, type PlanResult, planHours, utcLabel } from "@outpost/shared";
import type { Content, TDocumentDefinitions } from "pdfmake/interfaces";
import {
  blocksToContent,
  bullets,
  PRINT_COLOURS as C,
  callout,
  dataTable,
  heading,
  label,
  measureOf,
  note,
  para,
  printDocument,
  sectionHeader,
  steps,
  PRINT_TYPE as T,
} from "@/features/print-kit";
import { appLocale } from "@/lib/region";
import { type Block, planDocument } from "../plans/document";
import { kitWritable, writableBlocks } from "./glyphs";
import { groupsOf } from "./prediction-print";
import type { LandShapes } from "./radio-diagrams";
import { greyLineFigure, heatGrid, heatKey, howHfTravels, kept, shareLevel } from "./radio-parts";

const longDate = new Intl.DateTimeFormat(appLocale(), { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const monthYear = new Intl.DateTimeFormat(appLocale(), { month: "long", year: "numeric", timeZone: "UTC" });

const listOf = (blocks: Block[]) => blocks.flatMap((block) => (block.kind === "list" ? block.items : []));

/** A table of empty lines to write each call in. */
function callLog(rows: number): Content {
  const head = ["UTC", "Band", "Station", "Heard (strength)", "Notes"];
  return {
    table: {
      headerRows: 1,
      widths: [40, 42, 90, 80, "*"],
      body: [
        head.map((words) => ({ text: words, bold: true, fontSize: T.small + 0.5, fillColor: C.shade })),
        ...Array.from({ length: rows }, () => head.map(() => ({ text: " ", fontSize: 11 }))),
      ],
    },
    layout: {
      hLineWidth: () => 0.5,
      vLineWidth: () => 0.5,
      hLineColor: () => C.rule,
      vLineColor: () => C.rule,
      paddingTop: () => 3,
      paddingBottom: () => 3,
    },
    margin: [0, 2, 0, 10],
  } as Content;
}

export interface PlanPrintOptions {
  land?: LandShapes | null;
  paper?: "a4" | "letter";
}

export function planPrint(
  plan: CommunicationPlan,
  result: PlanResult,
  written: Date,
  options: PlanPrintOptions = {},
): TDocumentDefinitions {
  const paper = options.paper ?? "a4";
  const measure = measureOf(paper);
  const blocks = writableBlocks(planDocument(plan, result, written));
  const groups = groupsOf(blocks);
  const opening = groups.get("") ?? [];
  const name = kitWritable(plan.name);
  const byRatio = result.mode.requiredSnrDbHz === null;
  const hours = planHours(plan.fromUtc, plan.toUtc);
  const stationName = (id: string) => kitWritable(plan.stations.find((station) => station.id === id)?.name ?? id);

  const first: Content[] = [
    sectionHeader(
      {
        number: 1,
        title: name,
        subtitle: `Communication plan, ${utcLabel(plan.fromUtc)} to ${utcLabel(plan.toUtc)} UTC, for any day of ${monthYear.format(new Date(`${plan.date}T00:00:00Z`))}`,
        id: "plan",
      },
      measure,
    ),
  ];
  if (opening[1]?.kind === "para") first.push(para(opening[1].text));
  if (opening[2]?.kind === "para") first.push(callout("know", "A monthly median, not the day", para(opening[2].text)));

  // Which band for each pair: what to do, first.
  const which = groups.get("Which band for each pair") ?? [];
  const whichTable = which.find((block) => block.kind === "table");
  if (whichTable?.kind === "table")
    first.push(
      callout(
        "act",
        "Which band for each pair",
        [
          dataTable(whichTable.head, whichTable.rows, { right: whichTable.right, bold: [0, 2] }),
          ...which.filter((block) => block.kind === "para").map((block) => note(block.kind === "para" ? block.text : "")),
        ],
        { keep: false },
      ),
    );

  const stations = groups.get("Stations") ?? [];
  const stationTable = stations.find((block) => block.kind === "table");
  if (stationTable?.kind === "table") first.push(kept(label("Stations"), dataTable(stationTable.head, stationTable.rows, { bold: [0] })));

  // Each pair.
  const known = new Set([
    "",
    "Stations",
    "Which band for each pair",
    "How the bands were chosen",
    "What these figures are",
    "Notes",
    "Linked in Outpost",
  ]);
  for (const [heading_, pairBlocks] of groups) {
    if (known.has(heading_)) continue;
    const pair = result.pairs.find((each) => `${stationName(each.a)} and ${stationName(each.b)}` === heading_);
    const out: Content[] = [heading(heading_)];
    for (const block of pairBlocks) {
      if (block.kind === "para" && !out.some((item) => (item as { table?: unknown }).table)) out.push(para(block.text));
      else if (block.kind === "list")
        out.push(
          steps(
            block.items.map((item) => item.replace(/^(Primary|Alternate):/, "**$1:**")),
            { colour: C.accent },
          ),
        );
      else if (block.kind === "table") {
        out.push(
          heatGrid(
            block.head.slice(1),
            block.rows.map((row, index) => ({
              label: row[0]!,
              cells: row.slice(1).map((text, hour) => {
                const band = pair?.bands[index];
                const at = hours[hour];
                const forward = band && at !== undefined ? band.forward.reliability[at - 1] : null;
                const back = band && at !== undefined ? band.back.reliability[at - 1] : null;
                const share =
                  byRatio ||
                  text === "-" ||
                  text === "n/m" ||
                  forward === null ||
                  back === null ||
                  forward === undefined ||
                  back === undefined
                    ? null
                    : Math.min(forward, back);
                return { text, level: shareLevel(share) };
              }),
            })),
            measure,
            { labelWidth: 46 },
          ),
        );
        if (!byRatio) out.push(heatKey(measure));
      } else if (block.kind === "para") out.push(note(block.text));
    }
    first.push(kept(...out));
  }

  // The stations on the world at the start of the window.
  const at = Date.parse(`${plan.date}T00:00:00Z`) + plan.fromUtc * 3_600_000;
  const places = plan.stations.map((station) => ({ name: kitWritable(station.name), lat: station.lat, lon: station.lon }));
  if (places.length > 0)
    first.push(
      ...greyLineFigure(measure, at, places, options.land ?? null, {
        title: `The stations at ${utcLabel(plan.fromUtc)} UTC on ${longDate.format(new Date(`${plan.date}T00:00:00Z`))}, the start of the window`,
        caption:
          "Day and night worked out with the same arithmetic as the map's grey line (Jean Meeus, Astronomical Algorithms); the line joins the first two stations. World outline: Natural Earth.",
      }),
    );

  first.push(
    kept(heading("How the bands were chosen"), callout("know", "The rule", bullets(listOf(groups.get("How the bands were chosen") ?? [])))),
  );
  const what = groups.get("What these figures are") ?? [];
  first.push(
    kept(
      heading("What these figures are"),
      callout("warn", "A plan from medians", [
        bullets(listOf(what)),
        ...what.filter((block) => block.kind === "para").map((block) => note(block.kind === "para" ? block.text : "")),
      ]),
    ),
  );
  const notes = groups.get("Notes");
  if (notes) first.push(kept(heading("Notes"), ...blocksToContent(notes, measure)));
  const linked = groups.get("Linked in Outpost");
  if (linked) first.push(kept(label("Linked in Outpost"), ...blocksToContent(linked, measure)));
  first.push(kept(heading("Calls made"), note("Write each call in as it is made."), callLog(14)));

  const second: Content[] = [
    sectionHeader(
      { number: 2, title: "How HF gets there", subtitle: "Ground wave, sky wave, the skip zone, and coming back straight down", id: "how" },
      measure,
    ),
    ...howHfTravels(measure).slice(1),
  ];

  return printDocument({
    paper,
    title: `Communication plan: ${plan.name}`,
    made: written,
    footerName: `Communication plan · ${name}`,
    footerRight: `VOACAP median for ${monthYear.format(new Date(`${plan.date}T00:00:00Z`))}`,
    parts: [
      { kind: "section", running: `1 · ${name}`, content: first },
      { kind: "section", running: "2 · How HF gets there", content: second },
    ],
  });
}
