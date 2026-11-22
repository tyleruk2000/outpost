/**
 * The power plan's drawings for its printed pages: how the plan's parts are wired, and
 * charts of what it works out. Everything drawn is the plan's own: its parts, their
 * figures, and the currents worked out from them (calc/plan.ts). The one rule drawn, a
 * fuse or breaker at the battery end of each cable, is 33 CFR 183.455(b), read on
 * 22 November 2026 (docs/sources.md).
 */
import { chemistryById, MONTHS, type PowerPlanInput } from "@outpost/shared";
import { PRINT_COLOURS as C, chart, type Drawing, drawing, round, svgText } from "@/features/print-kit";
import { bank } from "./calc/energy";
import { chargerByHour, demandByHour, loadDailyWh, loadPeakW, type PlanAnswers, SUN_SHAPE, supplyFactor, usbEfficiency } from "./calc/plan";
import { figure } from "./inputs";

// ── The wiring ──────────────────────────────────────────────────────────────

interface Part {
  title: string;
  lines: string[];
  fill: string;
  stroke: string;
}

/** A branch from the battery: what it feeds, and the most current it takes. */
interface Branch {
  key: "dc" | "usb" | "ac";
  converter: Part | null;
  loads: Part;
  peakA: number;
}

/** Names of loads, as many as fit on two short lines. */
function names(plan: PowerPlanInput, supply: "dc" | "usb" | "ac"): string[] {
  const all = plan.loads
    .filter((load) => load.supply === supply)
    .map((load) => (load.quantity > 1 ? `${load.name} x ${load.quantity}` : load.name));
  const shown = all.slice(0, 2).map((name) => (name.length > 18 ? `${name.slice(0, 17)}.` : name));
  if (all.length > 2) shown[1] = `and ${all.length - 1} more`;
  return shown;
}

const wh = (value: number) => `${figure(value, 0)} Wh a day`;

/** The plan's branches, its sources and the currents in each cable at the battery. */
export function wiringParts(plan: PowerPlanInput) {
  const sizes = bank(plan.battery.volts, plan.battery.ampHours, plan.battery.series, plan.battery.parallel);
  const volts = sizes.volts;
  const amps = (watts: number) => (volts > 0 ? watts / volts : 0);
  const of = (supply: "dc" | "usb" | "ac") => plan.loads.filter((load) => load.supply === supply);
  const peakW = (supply: "dc" | "usb" | "ac") => of(supply).reduce((sum, load) => sum + loadPeakW(load) * supplyFactor(plan, supply), 0);
  const dailyWh = (supply: "dc" | "usb" | "ac") => of(supply).reduce((sum, load) => sum + loadDailyWh(load), 0);
  const loadPart = (title: string, supply: "dc" | "usb" | "ac"): Part => ({
    title,
    lines: [...names(plan, supply), wh(dailyWh(supply))],
    fill: C.shade,
    stroke: C.muted,
  });
  const branches: Branch[] = [];
  if (of("dc").length > 0) branches.push({ key: "dc", converter: null, loads: loadPart("DC loads", "dc"), peakA: amps(peakW("dc")) });
  if (of("usb").length > 0)
    branches.push({
      key: "usb",
      converter: {
        title: "USB converter",
        lines: [`${figure(usbEfficiency(plan) * 100, 0)}% efficient`],
        fill: C.knowSoft,
        stroke: C.know,
      },
      loads: loadPart("USB loads", "usb"),
      peakA: amps(peakW("usb")),
    });
  if (of("ac").length > 0)
    branches.push({
      key: "ac",
      converter: {
        title: "Inverter",
        lines: [`${figure(plan.inverter.efficiency * 100, 0)}% efficient`, `${figure(plan.inverter.idleW, 1)} W idle`],
        fill: C.knowSoft,
        stroke: C.know,
      },
      loads: loadPart("AC loads", "ac"),
      peakA: amps(peakW("ac") + plan.inverter.idleW),
    });
  const { solar, charger } = plan;
  const controller = solar.controller === "mppt" ? solar.mpptEfficiency : 1;
  const sources: Array<{ part: Part; via: Part | null; peakA: number }> = [];
  if (solar.arrayWatts > 0)
    sources.push({
      part: { title: "Solar panels", lines: [`${figure(solar.arrayWatts, 0)} W`], fill: C.warnSoft, stroke: C.warn },
      via: {
        title: "Charge controller",
        lines: [solar.controller === "mppt" ? `MPPT, ${figure(solar.mpptEfficiency * 100, 0)}%` : "PWM"],
        fill: C.knowSoft,
        stroke: C.know,
      },
      // The most the panels give at their rating through the controller, as the plan's peak charge current takes it.
      peakA: amps(solar.arrayWatts * controller),
    });
  if (charger.enabled && charger.watts > 0)
    sources.push({
      part: {
        title: charger.name.trim() || "Charger",
        lines: [`${figure(charger.watts, 0)} W`, `${figure(charger.hoursPerDay, 1)} h a day`],
        fill: C.warnSoft,
        stroke: C.warn,
      },
      via: null,
      peakA: amps(charger.watts),
    });
  const chemistry = chemistryById(plan.battery.chemistry);
  const battery: Part = {
    title: "Battery",
    lines: [
      `${figure(sizes.volts, 1)} V, ${figure(sizes.ampHours, 0)} Ah`,
      `${figure(sizes.wattHours, 0)} Wh`,
      /\(([^)]+)\)/.exec(chemistry.label)?.[1] ?? chemistry.label,
    ],
    fill: C.accentSoft,
    stroke: C.accent,
  };
  return { branches, sources, battery };
}

const BOX_W = 80;
const BOX_H = 46;

function box(x: number, y: number, part: Part, height = BOX_H): string {
  let out = `<rect x="${round(x)}" y="${round(y)}" width="${BOX_W}" height="${round(height)}" rx="4" fill="${part.fill}" stroke="${part.stroke}" stroke-width="1"/>`;
  const first = y + (height - (12 + part.lines.length * 8.5)) / 2 + 9;
  out += svgText(x + BOX_W / 2, first, part.title, { anchor: "middle", bold: true, size: 7.4 });
  part.lines.forEach((line, index) => {
    out += svgText(x + BOX_W / 2, first + 11 + index * 8.5, line, { anchor: "middle", size: 6.8, fill: C.muted });
  });
  return out;
}

/** A fuse, as IEC 60617 draws one: a box with the wire through it. Centred at (x, y), along the wire. */
const fuse = (x: number, y: number) =>
  `<rect x="${round(x - 7)}" y="${round(y - 3.5)}" width="14" height="7" fill="#ffffff" stroke="${C.act}" stroke-width="1.1"/><line x1="${round(x - 7)}" y1="${round(y)}" x2="${round(x + 7)}" y2="${round(y)}" stroke="${C.act}" stroke-width="1.1"/>`;

const wire = (x1: number, y1: number, x2: number, y2: number, colour: string = C.ink, dash = "") =>
  `<polyline points="${round(x1)},${round(y1)} ${round(x2)},${round(y1)} ${round(x2)},${round(y2)}" fill="none" stroke="${colour}" stroke-width="1.6"${dash ? ` stroke-dasharray="${dash}"` : ""}/>`;

const ampsWords = (amps: number) => `${figure(amps, 1)} A`;

/**
 * The plan's parts wired together: the sources on the left, the battery in the middle,
 * each kind of load on the right through its converter. A fuse sits on every cable at the
 * battery end, with the most current the plan works out for that cable beside it.
 */
export function wiringDiagram(plan: PowerPlanInput, width: number): Drawing {
  const { branches, sources, battery } = wiringParts(plan);
  const rows = Math.max(1, branches.length, sources.length);
  const pitch = 64;
  const top = 8;
  const height = top + rows * pitch + 34;
  const rowY = (index: number, count: number) => top + ((rows - count) * pitch) / 2 + index * pitch + BOX_H / 2;
  // Five columns: source, controller, battery, converter, loads.
  const gap = (width - 5 * BOX_W) / 4;
  const col = (index: number) => index * (BOX_W + gap);
  const batteryTop = top + 2;
  const batteryHeight = rows * pitch - (pitch - BOX_H) - 4;
  let body = "";

  sources.forEach((source, index) => {
    const y = rowY(index, sources.length);
    const intoBattery = col(2);
    const fuseX = intoBattery - 10;
    if (source.via) {
      body += box(col(0), y - BOX_H / 2, source.part);
      body += wire(col(0) + BOX_W, y, col(1), y, C.warn);
      body += box(col(1), y - BOX_H / 2, source.via);
    } else {
      // A charger feeds the battery directly; it sits under the controller, its cable as long as the others.
      body += box(col(1), y - BOX_H / 2, source.part);
    }
    body += wire(col(1) + BOX_W, y, intoBattery, y);
    body += fuse(fuseX, y);
    body += svgText(fuseX, y - 7, ampsWords(source.peakA), { anchor: "middle", size: 6.5, bold: true });
  });
  if (sources.length === 0)
    body += svgText(col(1) + BOX_W / 2, rowY(0, 1) + 3, "No charging in the plan", { anchor: "middle", fill: C.muted });

  body += box(col(2), batteryTop, battery, batteryHeight);

  branches.forEach((branch, index) => {
    const y = rowY(index, branches.length);
    const out = col(2) + BOX_W;
    const fuseX = out + 10;
    const colour = branch.key === "ac" ? C.know : C.ink;
    if (branch.converter) {
      body += wire(out, y, col(3), y);
      body += box(col(3), y - BOX_H / 2, branch.converter);
      body += wire(col(3) + BOX_W, y, col(4), y, colour, branch.key === "ac" ? "5 2" : "");
      body += svgText((col(3) + BOX_W + col(4)) / 2, y - 6, branch.key === "ac" ? "AC" : "USB", {
        anchor: "middle",
        size: 6.5,
        fill: C.muted,
      });
    } else body += wire(out, y, col(4), y);
    body += fuse(fuseX, y);
    body += svgText(fuseX, y - 7, ampsWords(branch.peakA), { anchor: "middle", size: 6.5, bold: true });
    body += box(col(4), y - BOX_H / 2, branch.loads);
  });
  if (branches.length === 0)
    body += svgText(col(4) + BOX_W / 2, rowY(0, 1) + 3, "No loads in the plan", { anchor: "middle", fill: C.muted });

  // The key.
  const keyY = height - 8;
  body += fuse(6, keyY - 3);
  body += svgText(18, keyY, "Fuse or breaker, at the battery end", { size: 7 });
  body += svgText(146, keyY, "Amps over a fuse: the most in that cable", { size: 7 });
  body += `<line x1="290" y1="${keyY - 3}" x2="308" y2="${keyY - 3}" stroke="${C.ink}" stroke-width="1.6"/>`;
  body += svgText(313, keyY, "DC", { size: 7 });
  body += `<line x1="336" y1="${keyY - 3}" x2="354" y2="${keyY - 3}" stroke="${C.know}" stroke-width="1.6" stroke-dasharray="5 2"/>`;
  body += svgText(359, keyY, "AC", { size: 7 });
  body += svgText(width, keyY, "Each line is a pair of wires", { size: 7, anchor: "end", fill: C.muted });
  return drawing(width, height, body);
}

// ── Charts ──────────────────────────────────────────────────────────────────

const hourTick = (hour: number) => `${String(hour % 24).padStart(2, "0")}:00`;

/**
 * One day of the month the chart is for, hour by hour: what the solar makes (half a
 * sine from 06:00 to 18:00, as the plan takes it), what the charger puts in, and what the
 * loads take from the battery.
 */
export function dayBalanceChart(plan: PowerPlanInput, answers: PlanAnswers, month: number | null, width: number): Drawing {
  const hours = Array.from({ length: 24 }, (_, hour) => hour);
  const solarWh = month === null ? 0 : (answers.months[month]?.solarWh ?? 0);
  const solar = hours.map((hour) => solarWh * SUN_SHAPE[hour]!);
  const charger = chargerByHour(plan);
  const demand = demandByHour(plan);
  return chart({
    width,
    height: 170,
    xs: hours,
    xDomain: [0, 23],
    xTicks: [0, 3, 6, 9, 12, 15, 18, 21],
    xTick: hourTick,
    xLabel: "Hour of the day",
    yLabel: "Watts",
    series: [
      {
        kind: "band",
        name: month === null ? "Solar (no sun hours given)" : `Solar, ${MONTHS[month]}`,
        low: hours.map(() => 0),
        high: solar,
        colour: C.warn,
        opacity: 0.45,
      },
      ...(charger.some((watts) => watts > 0)
        ? [{ kind: "bars" as const, name: plan.charger.name.trim() || "Charger", values: charger, colour: C.accent }]
        : []),
      { kind: "line", name: "Taken by the loads", values: demand, colour: C.act, width: 1.8 },
    ],
  });
}

/** Each month's solar a day against the day's use. */
export function monthsChart(answers: PlanAnswers, width: number): Drawing {
  const xs = answers.months.map((item) => item.month);
  return chart({
    width,
    height: 150,
    xs,
    xDomain: [-0.5, 11.5],
    xTicks: xs,
    xTick: (month) => (MONTHS[month] ?? "").slice(0, 3),
    yLabel: "Wh a day",
    yDomain: [0, Math.max(answers.dailyUseWh * 1.15, ...answers.months.map((item) => item.solarWh), 1)],
    yTick: (value) => figure(value, 0),
    series: [{ kind: "bars", name: "Solar made a day", values: answers.months.map((item) => item.solarWh), colour: C.warn }],
    rules:
      answers.dailyUseWh > 0
        ? [{ y: answers.dailyUseWh, words: `Use ${figure(answers.dailyUseWh, 0)} Wh`, colour: C.act, dash: "4 2" }]
        : [],
  });
}

/** State of charge over three days, starting full, with the hours of no sun shaded and the usable limit drawn. */
export function socChart(soc: number[], floor: number, width: number): Drawing {
  const xs = soc.map((_, index) => index + 1);
  const days = Math.ceil(soc.length / 24);
  const spans = Array.from({ length: days + 1 }, (_, day) => ({ from: day * 24 - 6, to: day * 24 + 6, fill: C.shade, words: "no sun" }));
  return chart({
    width,
    height: 160,
    xs,
    xDomain: [0, soc.length],
    xTicks: Array.from({ length: days }, (_, day) => day * 24 + 12),
    xTick: (hour) => `Day ${Math.floor(hour / 24) + 1}`,
    yDomain: [0, 100],
    yTick: (value) => `${value}%`,
    yLabel: "Charge",
    spans,
    series: [{ kind: "line", name: "State of charge", values: soc.map((share) => share * 100), colour: C.accent, width: 1.8 }],
    rules: [{ y: floor * 100, words: `Usable limit ${Math.round(floor * 100)}%`, colour: C.act, dash: "4 2" }],
  });
}
