/**
 * The words for devices and the answers about them, kept apart so that they can be
 * tested on their own and used by the screen and the PDF alike.
 */
import {
  type CommonDevice,
  type DeviceSource,
  type OwnDevice,
  type PowerLoad,
  type PublishedFigure,
  publishedText,
  readOn,
} from "@outpost/shared";
import { deviceById, ESTIMATE_STATE, figureKind, figuresBehind, type MixAnswers, type MixSetting, stateOf } from "./calc/devices";
import { figure } from "./inputs";

export const MAKER_SENTENCE =
  "A maker's figure is for a new device under the maker's own test conditions. The label on your own device governs: where it differs, use it.";

export const TRADE_MARKS =
  "Product names are the trade marks of their owners, used here only to say which device a figure is for. Outpost is not connected with or endorsed by any of them.";

const watts = (value: number) => `${figure(value, value < 10 ? 2 : 1)} W`;
const wattHours = (value: number) => `${figure(value, value < 10 ? 2 : 1)} Wh`;

/** One line under a device's name in the picker: what figure it brings. */
export function entrySummary(entry: CommonDevice): string {
  switch (entry.kind) {
    case "run": {
      if (entry.warning) return `${watts(entry.states[0]!.figure.value)}: ${entry.warning}`;
      if (entry.range) {
        const values = entry.states.map((state) => state.figure.value);
        return `${watts(Math.min(...values))} to ${watts(Math.max(...values))}: choose the nearest to yours`;
      }
      const first = entry.states[0]!.figure;
      return first.basis === "at-most" ? `At most ${watts(first.value)}` : `${watts(first.value)} typical`;
    }
    case "charge":
      return `Battery ${wattHours(entry.battery.value)}`;
    case "radio": {
      const top = entry.transmit[0]!;
      return `Receive ${watts(entry.receive.value)}, transmit ${watts(top.figure.value)} (${top.label})`;
    }
    case "label":
      return entry.unit === "W" ? "Type its watts from the label" : "Type its battery's mAh or Wh from the label";
    case "guide":
      return "No figure: follow the maker's battery guide";
  }
}

export function ownSummary(device: OwnDevice): string {
  if (device.kind === "charge") return `Battery ${wattHours(device.wattHours ?? 0)}`;
  if (device.kind === "radio") return `Receive ${watts(device.receiveW ?? 0)}, transmit ${watts(device.transmitW ?? 0)}`;
  return watts(device.watts ?? 0);
}

/** "Raspberry Pi Ltd, Raspberry Pi documentation, “Power supply”, read 16 November 2026." */
export const sourceLine = (source: DeviceSource): string => `${source.publisher}, ${source.document}, read ${readOn(source.read)}.`;

/** "800 mA at 5 V = 4 W, typical bare-board active current" */
export function figureWorking(published: PublishedFigure): string {
  const unit = "milliampHours" in published.as || "wattHours" in published.as ? "Wh" : "W";
  const value = unit === "Wh" ? wattHours(published.value) : watts(published.value);
  const shown = publishedText(published.as);
  return shown === value ? value : `${shown} = ${value}`;
}

/** How a load's figure stands, in a few words, for its row. */
export function kindWords(load: PowerLoad): string | null {
  switch (figureKind(load)) {
    case "at-most":
      return "the maker's maximum, so this is at most";
    case "typical":
      return "the maker's typical figure";
    case "estimate":
      return "transmit draw estimated from the output";
    case "own":
      return load.origin ? (load.origin.library === "own" ? "your own figure" : "changed by you since") : null;
  }
}

/**
 * Where a load's figures came from, one sentence for the plan's screen and its PDF:
 * the library entry, its publisher, document, URL and the date read, and whether the
 * person has since changed a figure. Null for a load typed by hand.
 */
export function originSentence(load: PowerLoad): string | null {
  const from = load.origin;
  if (!from) return null;
  if (from.library === "own") {
    const changed = changedFrom(load);
    return `From your own device “${from.name}”.${changed ? " A figure has been changed since." : ""}`;
  }
  const entry = deviceById(from.id);
  if (!entry) return `From the library entry “${from.name}”, which this version of Outpost no longer has.`;
  const kind = figureKind(load);
  const sources = sourcesBehind(load, entry);
  const cite = sources.map((source) => `${source.publisher}, ${source.document} (${source.url}), read ${readOn(source.read)}`).join("; ");
  const state = entry.kind === "run" && entry.states.length > 1 ? stateOf(entry, from.state)?.label : null;
  const estimate =
    from.state?.startsWith(ESTIMATE_STATE) === true
      ? ` The transmit draw at ${from.state.split(":")[1]} W out is Outpost's estimate, twice the output; the maker gives it at full output only.`
      : "";
  const changed = kind === "own" ? " A figure has been changed by hand since, so the figures are yours." : "";
  const most = kind === "at-most" ? " The figure is the most it should draw, so a runtime from it is at least as long." : "";
  const used = figuresBehind(load).map(figureWorking);
  const title = load.name === entry.name ? entry.name : `${load.name} (${entry.name})`;
  return `${title}${state ? `, ${state.toLowerCase()}` : ""}: ${used.length > 0 ? `${used.join("; ")}, ` : ""}from ${cite}.${most}${estimate}${changed}`;
}

function changedFrom(load: PowerLoad): boolean {
  const record = load as unknown as Record<string, unknown>;
  return Object.entries(load.origin?.figures ?? {}).some(([key, value]) => typeof record[key] === "number" && record[key] !== value);
}

/** The sources of the figures a load uses (or of the entry, once changed by hand). */
export function sourcesBehind(load: PowerLoad, entry: CommonDevice): DeviceSource[] {
  const figures = figuresBehind(load);
  const indexes = figures.length > 0 ? [...new Set(figures.map((item) => item.source))] : entry.sources.map((_, index) => index);
  return indexes.map((index) => entry.sources[index]!).filter(Boolean);
}

// ── The answers about a mix of devices ──────────────────────────────────────

const named = (load: PowerLoad) => `${load.quantity > 1 ? `${load.quantity} × ` : "the "}${load.name}`;

/** "a, b and c" */
export const listWords = (items: string[]): string =>
  items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;

/** "51.2 hours", or "4.9 days (118 hours)" from two days up. */
export function spanWords(hours: number): string {
  return hours >= 48 ? `${figure(hours / 24, 1)} days (${figure(hours, 0)} hours)` : `${figure(hours, 1)} hours`;
}

const count = (value: number) => (value < 10 ? figure(Math.floor(value * 10) / 10, 1) : figure(Math.floor(value), 0));

export interface MixWords {
  atLeast: string;
  runs: { figure: string; detail: string } | null;
  charges: Array<{ label: string; figure: string; detail: string }>;
  over: { figure: string; detail: string };
  all: { figure: string; detail: string } | null;
  need: { figure: string; detail: string };
}

/** Every answer about a mix, in words, with its working. "At least" wherever any figure is a maker's maximum. */
export function mixSentences(answers: MixAnswers, setting: MixSetting): MixWords {
  const least = answers.atLeast ? "At least " : "";
  const loads = answers.ranked.map((item) => item.load);
  const runners = loads.filter((load) => load.kind !== "charge");
  const charged = loads.filter((load) => load.kind === "charge");
  const maxima = loads.filter((load) => figureKind(load) === "at-most");
  const estimates = loads.filter((load) => figureKind(load) === "estimate");
  const taken = `${figure(answers.deliveredWh, 0)} Wh can be taken out (${figure(setting.wattHours, 0)} Wh × ${figure(setting.usable * 100, 0)}% usable)`;
  const estimateLine =
    estimates.length > 0 ? ` The transmit draw of ${listWords(estimates.map((load) => `the ${load.name}`))} is an estimate.` : "";

  const runs =
    answers.runHours !== null && answers.plan.runDays !== null
      ? {
          figure: `${least}${spanWords(answers.runHours)}`,
          detail: `${capital(listWords(runners.map(named)))}, as set, ${runners.length === 1 && runners[0]!.quantity === 1 ? "uses" : "use"} ${figure(answers.runWh, 0)} Wh a day from the battery. ${taken} ÷ ${figure(answers.runWh, 0)} Wh a day = ${figure(answers.plan.runDays, 2)} days.${estimateLine}`,
        }
      : null;

  const charges = answers.charges.map(({ load, perChargeWh, instead, besides }) => {
    const load2 = load as Extract<PowerLoad, { kind: "charge" }>;
    const via =
      load.supply === "usb"
        ? ` ÷ ${figure(setting.usb * 100, 0)}% through the USB converter`
        : load.supply === "ac"
          ? ` ÷ ${figure(setting.inverter * 100, 0)}% through the inverter`
          : "";
    return {
      label: `Charges of one ${load.name}`,
      figure: runners.length > 0 ? `${least}${count(instead)} instead, ${count(besides)} besides` : `${least}${count(instead)}`,
      detail: `One charge takes ${figure(perChargeWh, 1)} Wh from the battery (${figure(load2.wattHours, 1)} Wh ÷ ${figure(load2.chargeEfficiency * 100, 0)}% charging${via}). Instead of anything else: ${figure(answers.deliveredWh, 0)} ÷ ${figure(perChargeWh, 1)} = ${figure(instead, 1)}.${runners.length > 0 ? ` Besides running the rest for ${figure(setting.days, 1)} days: what is left, ${figure(Math.max(0, answers.deliveredWh - answers.runWh * setting.days), 0)} Wh, ÷ ${figure(perChargeWh, 1)} = ${figure(besides, 1)}.` : ""}`,
    };
  });

  const days = `${figure(setting.days, 1)} ${setting.days === 1 ? "day" : "days"}`;
  let over: MixWords["over"];
  if (!answers.plan.runsFit && runners.length > 0) {
    over = {
      figure: `Not enough: ${answers.atLeast ? "at least " : ""}${figure(answers.plan.runDays ?? 0, 1)} days`,
      detail: `With this battery, ${listWords(runners.map(named))}, as set, ${answers.atLeast ? "run at least" : "run only"} ${figure(answers.plan.runDays ?? 0, 1)} days, with nothing left to charge with. For ${days}: a bigger battery, fewer hours, or charging.`,
    };
  } else {
    const scale = answers.plan.chargeScale;
    const chargeWords = charged.map((load) => {
      const each = (load as Extract<PowerLoad, { kind: "charge" }>).chargesPerDay * (scale ?? 0);
      return `each ${load.name} up to ${figure(Math.floor(each * 10) / 10, 1)} ${each >= 0.95 && each < 1.05 ? "time" : "times"} a day`;
    });
    const spare = answers.deliveredWh - answers.runWh * setting.days;
    const runPart = runners.length > 0 ? `run ${listWords(runners.map(named))} as set` : "";
    const chargePart = chargeWords.length > 0 ? `charge ${listWords(chargeWords)}` : "";
    const sentence = `With this battery, for ${days}, you can ${[runPart, chargePart].filter(Boolean).join(", and ")}${chargeWords.length === 0 ? `, with ${figure(spare, 0)} Wh to spare` : ""}.`;
    over = {
      figure: scale !== null && scale < 1 ? "Enough to run, less to charge" : answers.atLeast ? "At least enough" : "Enough",
      detail: `${sentence}${scale !== null && scale < 1 ? ` That is ${figure(scale * 100, 0)}% of the charging set.` : ""}`,
    };
  }

  const all =
    answers.daysAll !== null && runners.length > 0 && charged.length > 0
      ? {
          figure: `${least}${figure(answers.daysAll, 1)} days`,
          detail: `Running and charging as set: ${figure(answers.dailyWh, 0)} Wh a day from the battery. ${taken} ÷ ${figure(answers.dailyWh, 0)} = ${figure(answers.daysAll, 2)} days.`,
        }
      : null;

  const need = {
    figure: `${figure(answers.needWh, 0)} Wh, ${figure(answers.needAh, 0)} Ah at ${figure(setting.volts, 1)} V`,
    detail: `For ${days} of everything as set with no charging: ${figure(answers.dailyWh, 0)} Wh a day × ${figure(setting.days, 1)} ÷ ${figure(setting.usable * 100, 0)}% usable. Rated capacity; cold and age call for more.${answers.atLeast ? " Some figures are maxima, so this errs large." : ""}`,
  };

  const atLeast =
    maxima.length > 0
      ? `${capital(listWords(maxima.map((load) => `the ${load.name}`)))} ${maxima.length === 1 ? "is" : "are"} counted at the most ${maxima.length === 1 ? "it" : "they"} should draw (a maker's maximum or the rating of its recommended supply), not a typical figure, so the battery lasts at least as long as said.`
      : "";
  return { atLeast, runs, charges, over, all, need };
}

const capital = (text: string) => (text ? text[0]!.toUpperCase() + text.slice(1) : text);
