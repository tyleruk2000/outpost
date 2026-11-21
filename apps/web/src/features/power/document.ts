/**
 * A power plan written out as a PDF: the system, the answers, the state of charge drawn
 * hour by hour, and every assumption. Set with the same blocks and pages as a
 * communication plan (features/propagation/plans/document.ts).
 */
import { chemistryById, MONTHS, type PowerPlanInput, sunSourceText } from "@outpost/shared";
import { writePdfPages } from "@/features/maps/print/pdf";
import { INK, MUTED, type SheetItem } from "@/features/maps/print/sheet";
import { type Block, toSheets } from "@/features/propagation/plans/document";
import { appLocale } from "@/lib/region";
import { assumptions, loadDailyWh, type PlanAnswers, radioDuty, simulate } from "./calc/plan";
import { MAKER_SENTENCE, originSentence } from "./device-text";
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

export function planPdf(plan: PowerPlanInput, answers: PlanAnswers, written: Date): Uint8Array {
  const footer = `${plan.name} · an estimate from the figures typed in · Outpost`;
  return writePdfPages({
    pages: toSheets(planBlocks(plan, answers, written), footer),
    title: `Power plan: ${plan.name}`,
    created: written,
  });
}
