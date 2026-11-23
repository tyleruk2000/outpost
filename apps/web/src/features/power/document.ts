/**
 * A power plan written out: the system, the answers, the state of charge drawn hour by
 * hour, and every assumption. `planBlocks` is the plan as plain blocks (its words, for
 * tests and text); `planDocument` is the printed plan, laid out with the print kit, with
 * the plan's wiring drawn and its figures charted (diagrams.ts).
 */
import { chemistryById, MONTHS, type PowerPlanInput, sunSourceText } from "@outpost/shared";
import type { Content, TDocumentDefinitions } from "pdfmake/interfaces";
import { INK, MUTED, type SheetItem } from "@/features/maps/print/sheet";
import {
  bullets,
  callout,
  dataTable,
  heading,
  figure as kitFigure,
  label,
  measureOf,
  note,
  PRINT_COLOURS,
  PRINT_TYPE,
  type PrintPaper,
  para,
  printDocument,
  sectionHeader,
} from "@/features/print-kit";
import type { Block } from "@/features/propagation/plans/document";
import { appLocale } from "@/lib/region";
import { bankDrawing } from "./bank-diagram";
import { assumptions, loadDailyWh, type PlanAnswers, radioDuty, simulate } from "./calc/plan";
import { MAKER_SENTENCE, originSentence } from "./device-text";
import { dayBalanceChart, monthsChart, socChart, wiringDiagram } from "./diagrams";
import { figure } from "./inputs";

const longDate = new Intl.DateTimeFormat(appLocale(), { day: "numeric", month: "long", year: "numeric" });
const CHART_RGB: [number, number, number] = [0.13, 0.42, 0.45];

export const ESTIMATE =
  "These figures are an estimate from the figures typed in, and general information: no substitute for the wiring regulations that apply or for a qualified electrician. Real batteries deliver less when cold, when old and when discharged fast; panels give less when hot, dirty or shaded.";

export function hoursText(hours: number | null): string {
  if (hours === null) return "No load";
  return hours >= 48 ? `${figure(hours / 24, 1)} days (${figure(hours, 0)} hours)` : `${figure(hours, 1)} hours`;
}

/** Which month the chart shows: the worst one with figures, or none (no sun) when there are none. */
export const chartMonth = (answers: PlanAnswers): number | null => answers.worstMonth;

export function planBlocks(plan: PowerPlanInput, answers: PlanAnswers, written: Date): Block[] {
  const chemistry = chemistryById(plan.battery.chemistry);
  const month = chartMonth(answers);
  const run = simulate(plan, month, 3);
  const floor = 1 - plan.battery.usableDod;
  const blocks: Block[] = [
    { kind: "title", text: `Power plan: ${plan.name}` },
    { kind: "para", text: `Written out on ${longDate.format(written)}. ${ESTIMATE}` },
    { kind: "heading", text: "Answers" },
    {
      kind: "table",
      head: ["", ""],
      rows: [
        [
          "Battery bank",
          `${figure(answers.bank.volts, 1)} V, ${figure(answers.bank.ampHours, 0)} Ah, ${figure(answers.bank.wattHours, 0)} Wh (${chemistry.label})`,
        ],
        ["Can be taken out", `${figure(answers.bank.deliveredWh, 0)} Wh`],
        ["Used in a day", `${figure(answers.dailyUseWh, 0)} Wh, an average of ${figure(answers.averageW, 1)} W`],
        ["Runs with no charging", hoursText(answers.runtimeHours)],
        ["Days of autonomy", answers.daysOfAutonomy === null ? "No load" : figure(answers.daysOfAutonomy, 1)],
        [
          "Solar to break even",
          answers.breakEvenArrayW === null
            ? "No sun hours given"
            : Number.isFinite(answers.breakEvenArrayW)
              ? `${figure(answers.breakEvenArrayW, 0)} W of panels, for ${MONTHS[answers.worstMonth!]}`
              : `None is enough: ${MONTHS[answers.worstMonth!]} has no sun`,
        ],
        [
          "Peak current from the battery",
          `${figure(answers.peak.dischargeA, 1)} A${answers.peak.battery.limit !== null ? `; battery allows ${figure(answers.peak.battery.limit, 0)} A` : ""}${answers.peak.cable.limit !== null ? `; cable rated ${figure(answers.peak.cable.limit, 0)} A` : ""}`,
        ],
        [
          "Peak charge current",
          `${figure(answers.peak.chargeA, 1)} A${answers.peak.charge.limit !== null ? `; battery allows ${figure(answers.peak.charge.limit, 0)} A` : ""}`,
        ],
      ],
    },
  ];
  const over = [
    answers.peak.battery.over ? "The peak current is more than the battery's rated discharge current." : null,
    answers.peak.cable.over ? "The peak current is more than the cable's rating." : null,
    answers.peak.charge.over ? "The charge current can be more than the battery's rated charge current." : null,
  ].filter((line): line is string => line !== null);
  if (over.length > 0) blocks.push({ kind: "para", text: `Over a limit: ${over.join(" ")}` });

  blocks.push({ kind: "heading", text: "Each month, from full" });
  blocks.push({
    kind: "table",
    head: ["Month", "Sun h", "Solar Wh/day", "Lowest", "Runs down"],
    right: [1, 2, 3],
    rows: answers.months.map((item) => [
      MONTHS[item.month]!,
      item.sunHours === null ? "-" : figure(item.sunHours, 2),
      figure(item.solarWh, 0),
      `${Math.round(item.lowest * 100)}%`,
      item.emptyOnDay === null ? "Keeps up" : `Day ${item.emptyOnDay}`,
    ]),
  });
  blocks.push({ kind: "para", text: sunSourceText(plan.solar.sunHoursSource) });
  blocks.push({
    kind: "para",
    text: `"Lowest" is the lowest state of charge in 30 days of that month's sun, starting full; "runs down" is the day it first reaches the usable limit (${Math.round(floor * 100)}%).`,
  });

  blocks.push({
    kind: "heading",
    text: `State of charge over three days${month === null ? ", with no charging but the charger" : `, ${MONTHS[month]}`}`,
  });
  blocks.push({
    kind: "drawing",
    height: 150,
    words: `State of charge at the end of each day: ${[23, 47, 71].map((hour, day) => `day ${day + 1} ${Math.round((run.soc[hour] ?? 0) * 100)}%`).join(", ")}.`,
    draw: (x0, y0, width) => socDrawing(run.soc, floor, x0, y0, width, 150),
  });

  blocks.push({ kind: "heading", text: "Loads" });
  blocks.push(
    plan.loads.length === 0
      ? { kind: "para", text: "None." }
      : {
          kind: "table",
          head: ["Load", "Supply", "Power", "Wh/day"],
          right: [3],
          rows: plan.loads.map((load) => [
            `${load.name}${load.quantity > 1 ? ` x ${load.quantity}` : ""}`,
            load.supply === "ac" ? "AC" : load.supply === "usb" ? "USB" : "DC",
            load.kind === "device"
              ? `${figure(load.watts, 1)} W, ${figure(load.hoursPerDay, 1)} h`
              : load.kind === "charge"
                ? `${figure(load.wattHours, 1)} Wh battery, ${figure(load.chargesPerDay, 1)} a day`
                : `TX ${figure(load.transmitW, 1)} W, RX ${figure(load.receiveW, 1)} W, duty ${figure(radioDuty(load) * 100, 1)}%`,
            figure(loadDailyWh(load), 0),
          ]),
        },
  );
  // Where each load's figures came from, for loads made from the library or a person's own device.
  const cited = plan.loads.map(originSentence).filter((line): line is string => line !== null);
  if (cited.length > 0) {
    blocks.push({ kind: "heading", text: "Where the figures come from" });
    blocks.push({ kind: "list", items: [...cited, MAKER_SENTENCE] });
  }
  blocks.push({ kind: "heading", text: "Assumptions" }, { kind: "list", items: assumptions(plan, answers) });
  if (plan.notes.trim()) {
    blocks.push({ kind: "heading", text: "Notes" });
    for (const paragraph of plan.notes.split(/\n\s*\n/)) if (paragraph.trim()) blocks.push({ kind: "para", text: paragraph.trim() });
  }
  return blocks;
}

function socDrawing(soc: number[], floor: number, x0: number, y0: number, width: number, height: number): SheetItem[] {
  const left = x0 + 30;
  const right = x0 + width;
  const top = y0 + 6;
  const bottom = y0 + height - 18;
  const x = (index: number) => left + (index / Math.max(1, soc.length - 1)) * (right - left);
  const y = (share: number) => top + (1 - share) * (bottom - top);
  const items: SheetItem[] = [];
  for (const tick of [0, 0.5, 1]) {
    items.push({ kind: "line", x1: left, y1: y(tick), x2: right, y2: y(tick), color: [0.85, 0.87, 0.88], width: 0.4 });
    items.push({ kind: "text", x: left - 4, y: y(tick) + 3, text: `${tick * 100}%`, size: 7, color: MUTED, anchor: "end" });
  }
  for (let day = 0; day < Math.ceil(soc.length / 24); day += 1)
    items.push({ kind: "text", x: x(day * 24 + 11.5), y: bottom + 12, text: `Day ${day + 1}`, size: 7, color: MUTED, anchor: "middle" });
  // The usable limit as a broken line.
  for (let at = left; at < right; at += 8)
    items.push({ kind: "line", x1: at, y1: y(floor), x2: Math.min(right, at + 4), y2: y(floor), color: MUTED, width: 0.8 });
  items.push({
    kind: "text",
    x: right,
    y: y(floor) - 3,
    text: `Usable limit ${Math.round(floor * 100)}%`,
    size: 7,
    color: INK,
    anchor: "end",
  });
  for (let index = 1; index < soc.length; index += 1)
    items.push({ kind: "line", x1: x(index - 1), y1: y(soc[index - 1]!), x2: x(index), y2: y(soc[index]!), color: CHART_RGB, width: 1.4 });
  return items;
}

// ── The printed plan ────────────────────────────────────────────────────────

/** The rule drawn on the wiring, in its own words (33 CFR 183.455, read 22 November 2026). */
export const FUSE_RULE = {
  where:
    "“A manually reset, trip-free circuit breaker or fuse must be placed at the source of power for each circuit or conductor”, or, where that is physically impractical, “within seven inches of the source of power”, measured along the conductor.",
  each: "“Each ungrounded current-carrying conductor must be protected by a manually reset, tripfree circuit breaker or fuse.”",
  rating:
    "For circuits of less than 50 volts, a fuse's or breaker's current rating must not exceed “150% of the value of the amperage in Table 5 for the conductor size it is protecting”; for 50 volts or more, the Table 5 value itself.",
  source: "33 CFR 183.455, Overcurrent protection: General (United States Coast Guard rules for boats), read 22 November 2026.",
};

/** Large figures in a row, each with its words under it. */
function keyFigures(items: Array<{ value: string; words: string; colour?: string }>): Content {
  return {
    table: {
      widths: items.map(() => "*"),
      body: [
        items.map((item) => ({
          stack: [
            { text: item.value, fontSize: 15, bold: true, color: item.colour ?? PRINT_COLOURS.accent, lineHeight: 1 },
            { text: item.words, fontSize: PRINT_TYPE.small, color: PRINT_COLOURS.muted, margin: [0, 3, 0, 0] },
          ],
        })),
      ],
    },
    layout: {
      hLineWidth: (index: number) => (index === 0 ? 1.4 : 0.4),
      vLineWidth: (index: number, node: { table: { widths?: unknown[] } }) =>
        index === 0 || index === (node.table.widths?.length ?? 0) ? 0 : 0.4,
      hLineColor: (index: number) => (index === 0 ? PRINT_COLOURS.accent : PRINT_COLOURS.rule),
      vLineColor: () => PRINT_COLOURS.rule,
      paddingLeft: (index: number) => (index === 0 ? 0 : 8),
      paddingRight: () => 6,
      paddingTop: () => 7,
      paddingBottom: () => 7,
    },
    margin: [0, 0, 0, 12],
  } as Content;
}

export interface PlanDocumentInput {
  plan: PowerPlanInput;
  answers: PlanAnswers;
  /** When the plan was last saved: the PDF's date. */
  written: Date;
  paper: PrintPaper;
}

/** The power plan, laid out with the print kit. Pure: the plan in, the document out. */
export function planDocument({ plan, answers, written, paper }: PlanDocumentInput): TDocumentDefinitions {
  const measure = measureOf(paper);
  const chemistry = chemistryById(plan.battery.chemistry);
  const month = chartMonth(answers);
  const run = simulate(plan, month, 3);
  const floor = 1 - plan.battery.usableDod;
  const date = longDate.format(written);
  const title = `Power plan: ${plan.name}`;
  const lowVoltage = answers.bank.volts < 50;

  // 1. The system.
  const over = [
    answers.peak.battery.over
      ? `The peak current, ${figure(answers.peak.dischargeA, 1)} A, is more than the ${figure(answers.peak.battery.limit!, 0)} A the battery is rated to give.`
      : null,
    answers.peak.cable.over
      ? `The peak current, ${figure(answers.peak.dischargeA, 1)} A, is more than the cable's ${figure(answers.peak.cable.limit!, 0)} A rating.`
      : null,
    answers.peak.charge.over
      ? `The charge current can reach ${figure(answers.peak.chargeA, 1)} A, more than the ${figure(answers.peak.charge.limit!, 0)} A the battery is rated to take.`
      : null,
  ].filter((line): line is string => line !== null);
  const wiring = wiringDiagram(plan, measure);
  const bankSvg = bankDrawing(plan.battery.volts, plan.battery.ampHours, plan.battery.series, plan.battery.parallel);
  const cable = plan.cableRatingA;
  const system: Content[] = [
    sectionHeader({ number: 1, title, subtitle: `The system and what it comes to. Written out on ${date}.`, id: "power-system" }, measure),
    keyFigures([
      {
        value: `${figure(answers.bank.wattHours, 0)} Wh`,
        words: `Battery bank, ${figure(answers.bank.volts, 1)} V ${figure(answers.bank.ampHours, 0)} Ah`,
      },
      { value: `${figure(answers.dailyUseWh, 0)} Wh`, words: `Used in a day, ${figure(answers.averageW, 1)} W on average` },
      { value: answers.runtimeHours === null ? "No load" : hoursText(answers.runtimeHours), words: "Runs with no charging" },
      {
        value:
          answers.breakEvenArrayW === null
            ? "No sun hours"
            : Number.isFinite(answers.breakEvenArrayW)
              ? `${figure(answers.breakEvenArrayW, 0)} W`
              : "None enough",
        words: answers.worstMonth === null ? "Solar to break even" : `Solar to break even in ${MONTHS[answers.worstMonth]}`,
        colour: PRINT_COLOURS.warnInk,
      },
    ]),
    callout("warn", "An estimate", para(ESTIMATE, 0)),
    ...(over.length > 0
      ? [
          callout("act", "Over a limit", [
            bullets(over),
            para(
              "Too much current through a battery or a cable heats it. Share the load out, or use a battery and cable rated for it, fused to protect the cable.",
              0,
            ),
          ]),
        ]
      : []),
    heading("The answers"),
    dataTable(
      ["", ""],
      [
        [
          "Battery bank",
          `${figure(answers.bank.volts, 1)} V, ${figure(answers.bank.ampHours, 0)} Ah, ${figure(answers.bank.wattHours, 0)} Wh (${chemistry.label})`,
        ],
        ["Can be taken out", `${figure(answers.bank.deliveredWh, 0)} Wh`],
        ["Used in a day", `${figure(answers.dailyUseWh, 0)} Wh, an average of ${figure(answers.averageW, 1)} W`],
        ["Runs with no charging", hoursText(answers.runtimeHours)],
        ["Days of autonomy", answers.daysOfAutonomy === null ? "No load" : figure(answers.daysOfAutonomy, 1)],
        [
          "Solar to break even",
          answers.breakEvenArrayW === null
            ? "No sun hours given"
            : Number.isFinite(answers.breakEvenArrayW)
              ? `${figure(answers.breakEvenArrayW, 0)} W of panels, for ${MONTHS[answers.worstMonth!]}`
              : `None is enough: ${MONTHS[answers.worstMonth!]} has no sun`,
        ],
        [
          "Peak current from the battery",
          `${figure(answers.peak.dischargeA, 1)} A${answers.peak.battery.limit !== null ? `; battery allows ${figure(answers.peak.battery.limit, 0)} A` : ""}${answers.peak.cable.limit !== null ? `; cable rated ${figure(answers.peak.cable.limit, 0)} A` : ""}`,
        ],
        [
          "Peak charge current",
          `${figure(answers.peak.chargeA, 1)} A${answers.peak.charge.limit !== null ? `; battery allows ${figure(answers.peak.charge.limit, 0)} A` : ""}`,
        ],
      ],
      { bold: [0], widths: [150, "*"] },
    ),
    kitFigure(bankSvg.svg, {
      title: "The battery bank",
      width: Math.min(measure, bankSvg.width),
      caption: `${bankSvg.layout.alt}${bankSvg.layout.note ? ` ${bankSvg.layout.note}` : ""}`,
    }),
    kitFigure(wiring.svg, {
      title: "How it is wired",
      width: measure,
      caption: `The parts of this plan and the most current each cable from the battery carries, as the plan works it out (every load on at once, every radio keyed; the panels at their rating). Each fuse is drawn at the battery end of its cable, as the rule below asks. The drawing shows which part feeds which, not the cables' sizes or lengths.`,
    }),
    callout("know", "Where the fuses go", [
      bullets([FUSE_RULE.each, FUSE_RULE.where, FUSE_RULE.rating]),
      ...(cable !== null
        ? [
            para(
              lowVoltage
                ? `This plan gives the cable from the battery as rated ${figure(cable, 0)} A. If that is its Table 5 figure, its fuse may be rated at most ${figure(cable * 1.5, 0)} A.`
                : `This plan gives the cable from the battery as rated ${figure(cable, 0)} A. If that is its Table 5 figure, its fuse may be rated at most ${figure(cable, 0)} A.`,
              0,
            ),
          ]
        : []),
      note(
        `${FUSE_RULE.source} A rule for one kind of wiring, given as guidance like the cable sizes in Tools, Power and batteries: the regulations where the system is installed, and the battery maker's instructions, come first.`,
      ),
    ]),
  ];

  // 2. Through the day and the year.
  const day = dayBalanceChart(plan, answers, month, measure);
  const months = monthsChart(answers, measure);
  const soc = socChart(run.soc, floor, measure);
  const year: Content[] = [
    sectionHeader(
      {
        number: 2,
        title: "Through the day and the year",
        subtitle:
          month === null
            ? "No sun hours are given, so only the charger, if any, charges the battery."
            : `${MONTHS[month]} is the month with the fewest peak sun hours given.`,
        id: "power-year",
      },
      measure,
    ),
    kitFigure(day.svg, {
      title: month === null ? "A day, hour by hour" : `A day in ${MONTHS[month]}, hour by hour`,
      width: measure,
      caption: `What comes in and what the loads take from the battery each hour, in watts. The solar is ${figure(month === null ? 0 : (answers.months[month]?.solarWh ?? 0), 0)} Wh for the day, spread from 06:00 to 18:00 as half a sine, as the plan takes it; the loads' line includes the inverter's and converter's losses.`,
    }),
    kitFigure(soc.svg, {
      title: `State of charge over three days${month === null ? "" : `, ${MONTHS[month]}`}, starting full`,
      width: measure,
      caption: `At the end of each day: ${[23, 47, 71].map((hour, index) => `day ${index + 1} ${Math.round((run.soc[hour] ?? 0) * 100)}%`).join(", ")}.${run.shortWh > 0 ? ` At the usable limit, ${figure(run.shortWh, 0)} Wh of the loads would go unmet over the three days.` : ""}`,
    }),
    kitFigure(months.svg, {
      title: "Each month: solar made a day against the day's use",
      width: measure,
      caption: sunSourceText(plan.solar.sunHoursSource),
    }),
    {
      stack: [
        heading("Each month, from full"),
        dataTable(
          ["Month", "Sun h", "Solar Wh a day", "Lowest", "Runs down"],
          answers.months.map((item) => [
            MONTHS[item.month]!,
            item.sunHours === null ? "-" : figure(item.sunHours, 2),
            figure(item.solarWh, 0),
            `${Math.round(item.lowest * 100)}%`,
            item.emptyOnDay === null ? "Keeps up" : `**Day ${item.emptyOnDay}**`,
          ]),
          { right: [1, 2, 3] },
        ),
        note(
          `"Lowest" is the lowest state of charge in 30 days of that month's sun, starting full; "runs down" is the day it first reaches the usable limit (${Math.round(floor * 100)}%).`,
        ),
      ],
      unbreakable: true,
    } as Content,
  ];

  // 3. Loads, assumptions, notes.
  const cited = plan.loads.map(originSentence).filter((line): line is string => line !== null);
  const loads: Content[] = [
    sectionHeader(
      {
        number: 3,
        title: "Loads and assumptions",
        subtitle: "What the plan powers, and every figure it takes as given.",
        id: "power-loads",
      },
      measure,
    ),
    plan.loads.length === 0
      ? para("No loads.")
      : dataTable(
          ["Load", "Supply", "Power", "Wh a day"],
          plan.loads.map((load) => [
            `${load.name}${load.quantity > 1 ? ` x ${load.quantity}` : ""}`,
            load.supply === "ac" ? "AC" : load.supply === "usb" ? "USB" : "DC",
            load.kind === "device"
              ? `${figure(load.watts, 1)} W, ${figure(load.hoursPerDay, 1)} h`
              : load.kind === "charge"
                ? `${figure(load.wattHours, 1)} Wh battery, ${figure(load.chargesPerDay, 1)} a day`
                : `TX ${figure(load.transmitW, 1)} W, RX ${figure(load.receiveW, 1)} W, duty ${figure(radioDuty(load) * 100, 1)}%`,
            figure(loadDailyWh(load), 0),
          ]),
          { right: [3], bold: [0] },
        ),
    ...(cited.length > 0 ? [label("Where the figures come from"), bullets([...cited, MAKER_SENTENCE])] : []),
    heading("Assumptions"),
    bullets(assumptions(plan, answers)),
    ...(plan.notes.trim()
      ? [
          heading("Notes"),
          ...plan.notes
            .split(/\n\s*\n/)
            .filter((paragraph) => paragraph.trim())
            .map((paragraph) => para(paragraph.trim())),
        ]
      : []),
  ];

  return printDocument({
    paper,
    title,
    subject: "A power plan: an estimate from the figures typed in.",
    made: written,
    footerName: title,
    footerRight: `Written out ${date}`,
    parts: [
      { kind: "section", running: "1 · The system", content: system },
      { kind: "section", running: "2 · Through the day and the year", content: year },
      { kind: "section", running: "3 · Loads and assumptions", content: loads },
    ],
  });
}
