/**
 * A power plan worked out: what it uses and makes in a day, how long it runs, what
 * solar it needs, its peak currents, and its state of charge hour by hour. Pure
 * arithmetic on what the person typed, with every assumption written out
 * (`assumptions`) so that the screen and the PDF can list them with the answers.
 *
 * The model, in short:
 * - A device draws its power for its hours a day. A radio on the air draws
 *   duty × transmit + (1 − duty) × receive, where duty = share of time transmitting ×
 *   the mode's factor, and its standby power for its standby hours.
 * - A charge (a phone, a power bank) takes its battery's watt-hours ÷ the charging
 *   efficiency for each charge.
 * - An AC load draws its power ÷ the inverter's efficiency from the battery, and the
 *   inverter draws its idle power for the hours it is on, spread evenly over the day. A
 *   USB load draws its power ÷ the USB converter's efficiency.
 * - The battery gives out the usable share of its rated energy. Round-trip efficiency is
 *   split evenly between charging and discharging (HOMER's convention).
 * - Solar makes array W × peak sun hours × (1 − losses) × controller a day, spread over
 *   06:00 to 18:00 as half a sine. Within each hour it feeds the loads first and charges
 *   the battery with what is over; what the full battery cannot take is lost.
 */
import {
  chemistryById,
  LOSS_LABELS,
  MONTHS,
  type PowerLoad,
  type PowerPlanInput,
  type PowerSupply,
  type RadioLoad,
  radioModeById,
  type SolarLosses,
  USB_CONVERTER,
} from "@outpost/shared";
import { bank, combinedLoss, controllerFactor, oneWay, solarDailyWh } from "./energy";

/** The radio's duty cycle: the share of time on the air that counts as full transmit power. */
export const radioDuty = (radio: Pick<RadioLoad, "transmitShare" | "modeFactor">): number => radio.transmitShare * radio.modeFactor;

/** Average draw while on the air, watts at the radio's terminals. */
export const radioOnAirW = (radio: RadioLoad): number => radioDuty(radio) * radio.transmitW + (1 - radioDuty(radio)) * radio.receiveW;

/** Energy a load uses in a day where it is supplied (at the plug for AC, at the USB socket for USB), watt-hours. */
export function loadDailyWh(load: PowerLoad): number {
  const one =
    load.kind === "device"
      ? load.watts * load.hoursPerDay
      : load.kind === "charge"
        ? (load.wattHours * load.chargesPerDay) / load.chargeEfficiency
        : radioOnAirW(load) * load.onAirHours + load.standbyW * load.standbyHours;
  return one * load.quantity;
}

/** A charge's average draw while charging, watts where it is supplied: its energy spread over the hours it takes. */
export const chargingW = (load: Extract<PowerLoad, { kind: "charge" }>): number =>
  load.wattHours / load.chargeEfficiency / load.chargeHours;

/** The most a load draws at once, watts where it is supplied: a radio key down at full output; a charge, its average while charging. */
export const loadPeakW = (load: PowerLoad): number =>
  (load.kind === "device" ? load.watts : load.kind === "charge" ? chargingW(load) : load.transmitW) * load.quantity;

/** The USB converter's efficiency: the plan's, or the starting figure for plans from before it. */
export const usbEfficiency = (plan: Pick<PowerPlanInput, "usb">): number => plan.usb?.efficiency ?? USB_CONVERTER.share;

/** What one watt at a load's supply takes from the battery: 1 for DC, more through the USB converter or the inverter. */
export function supplyFactor(plan: Pick<PowerPlanInput, "usb" | "inverter">, supply: PowerSupply): number {
  if (supply === "ac") return 1 / plan.inverter.efficiency;
  if (supply === "usb") return 1 / usbEfficiency(plan);
  return 1;
}

/** Watts a load draws in each hour of the day (0 to 23), averaged over the hour, where it is supplied. */
export function loadByHour(load: PowerLoad): number[] {
  const hours = new Array<number>(24).fill(0);
  const lay = (start: number, length: number, watts: number) => {
    let left = Math.min(24, length);
    let at = start;
    while (left > 1e-9) {
      const part = Math.min(1, left);
      hours[at % 24]! += watts * part;
      left -= part;
      at += 1;
    }
  };
  if (load.kind === "device") lay(load.startHour, load.hoursPerDay, load.watts * load.quantity);
  else if (load.kind === "charge") {
    const hours = Math.min(24, load.chargeHours * load.chargesPerDay);
    if (hours > 0) lay(load.startHour, hours, loadDailyWh(load) / hours);
  } else {
    lay(load.startHour, load.onAirHours, radioOnAirW(load) * load.quantity);
    lay(load.startHour + Math.ceil(load.onAirHours), load.standbyHours, load.standbyW * load.quantity);
  }
  return hours;
}

/** The share of a day's sun in each hour: half a sine from 06:00 to 18:00. Adds up to 1. */
export const SUN_SHAPE: number[] = (() => {
  const raw = Array.from({ length: 24 }, (_, hour) => (hour >= 6 && hour < 18 ? Math.sin((Math.PI * (hour + 0.5 - 6)) / 12) : 0));
  const total = raw.reduce((sum, value) => sum + value, 0);
  return raw.map((value) => value / total);
})();

export const solarLoss = (losses: SolarLosses): number => combinedLoss(Object.values(losses));

export interface MonthAnswer {
  month: number;
  sunHours: number | null;
  /** Watt-hours a day from the solar controller. */
  solarWh: number;
  /** From full, simulated for 30 days: the first day (1-based) the battery reaches its usable limit, or null if it never does. */
  emptyOnDay: number | null;
  /** The lowest state of charge over the 30 days, 0 to 1 of rated capacity. */
  lowest: number;
}

export interface PeakCheck {
  /** Amps from the battery with everything on at once and every radio keyed. */
  dischargeA: number;
  /** Amps into the battery with the solar at its rating and the charger on. */
  chargeA: number;
  battery: { limit: number | null; over: boolean | null };
  cable: { limit: number | null; over: boolean | null };
  charge: { limit: number | null; over: boolean | null };
}

export interface PlanAnswers {
  bank: { volts: number; ampHours: number; wattHours: number; usableWh: number; deliveredWh: number };
  /** Watt-hours a day taken from the battery's terminals by the loads, the inverter included. */
  dailyUseWh: number;
  /** Of that, the AC loads' share (after the inverter's losses) and the inverter's idle draw. */
  acWh: number;
  /** The USB loads' share, after the converter's losses. */
  usbWh: number;
  inverterIdleWh: number;
  /** Average draw from the battery, watts. */
  averageW: number;
  /** With no charging at all. */
  runtimeHours: number | null;
  daysOfAutonomy: number | null;
  /** Watt-hours a day the charger puts in, when there is one. */
  chargerWh: number;
  months: MonthAnswer[];
  /** The month with the fewest peak sun hours given, or null when none are. */
  worstMonth: number | null;
  /** Array watts that break even in the worst month with no charger: all of the day's use passed through the battery. */
  breakEvenArrayW: number | null;
  peak: PeakCheck;
  loss: number;
  controller: number;
}

const SIM_DAYS = 30;

/**
 * State of charge, 0 to 1 of the rated energy, at the end of each hour, starting full,
 * for `days` days of `month` (0 to 11; null for no sun). Also the energy short: what
 * the loads wanted when the battery was at its usable limit.
 */
export function simulate(plan: PowerPlanInput, month: number | null, days: number): { soc: number[]; shortWh: number; spillWh: number } {
  const { battery } = plan;
  const sizes = bank(battery.volts, battery.ampHours, battery.series, battery.parallel);
  const capacity = sizes.wattHours;
  const floor = capacity * (1 - battery.usableDod);
  const efficiency = oneWay(battery.roundTrip);
  const demand = demandByHour(plan);
  const sun = month === null ? 0 : (plan.solar.sunHours[month] ?? 0);
  const solarWh = solarDailyWh(
    plan.solar.arrayWatts,
    sun,
    solarLoss(plan.solar.losses),
    controllerFactor(plan.solar.controller, plan.solar.mpptEfficiency, plan.solar.pwmBatteryVolts, plan.solar.pwmPanelVmp),
  );
  const charger = chargerByHour(plan);
  let stored = capacity;
  let shortWh = 0;
  let spillWh = 0;
  const soc: number[] = [];
  for (let day = 0; day < days; day += 1) {
    for (let hour = 0; hour < 24; hour += 1) {
      const net = solarWh * SUN_SHAPE[hour]! + charger[hour]! - demand[hour]!;
      if (net >= 0) {
        const room = capacity - stored;
        const added = net * efficiency;
        stored += Math.min(room, added);
        spillWh += Math.max(0, added - room) / efficiency;
      } else {
        const taken = -net / efficiency;
        const available = Math.max(0, stored - floor);
        stored -= Math.min(available, taken);
        shortWh += Math.max(0, taken - available) * efficiency;
      }
      soc.push(capacity > 0 ? stored / capacity : 0);
    }
  }
  return { soc, shortWh, spillWh };
}

/** Watts from the battery's terminals in each hour: DC loads, AC loads through the inverter, and its idle draw. */
export function demandByHour(plan: PowerPlanInput): number[] {
  const hours = new Array<number>(24).fill(0);
  const hasAc = plan.loads.some((load) => load.supply === "ac");
  for (const load of plan.loads) {
    const byHour = loadByHour(load);
    const factor = supplyFactor(plan, load.supply);
    for (let hour = 0; hour < 24; hour += 1) hours[hour]! += byHour[hour]! * factor;
  }
  if (hasAc) for (let hour = 0; hour < 24; hour += 1) hours[hour]! += (plan.inverter.idleW * plan.inverter.hoursOn) / 24;
  return hours;
}

function chargerByHour(plan: PowerPlanInput): number[] {
  const hours = new Array<number>(24).fill(0);
  if (!plan.charger.enabled || plan.charger.watts <= 0) return hours;
  let left = Math.min(24, plan.charger.hoursPerDay);
  let at = plan.charger.startHour;
  while (left > 1e-9) {
    const part = Math.min(1, left);
    hours[at % 24]! += plan.charger.watts * part;
    left -= part;
    at += 1;
  }
  return hours;
}

export function workOut(plan: PowerPlanInput): PlanAnswers {
  const { battery, solar } = plan;
  const sizes = bank(battery.volts, battery.ampHours, battery.series, battery.parallel);
  const usableWh = sizes.wattHours * battery.usableDod;
  const deliveredWh = usableWh * oneWay(battery.roundTrip);
  const hasAc = plan.loads.some((load) => load.supply === "ac");
  const acWh =
    plan.loads.filter((load) => load.supply === "ac").reduce((sum, load) => sum + loadDailyWh(load), 0) / plan.inverter.efficiency;
  const dcWh = plan.loads.filter((load) => load.supply === "dc").reduce((sum, load) => sum + loadDailyWh(load), 0);
  const usbWh = plan.loads.filter((load) => load.supply === "usb").reduce((sum, load) => sum + loadDailyWh(load), 0) / usbEfficiency(plan);
  const inverterIdleWh = hasAc ? plan.inverter.idleW * plan.inverter.hoursOn : 0;
  const dailyUseWh = dcWh + usbWh + acWh + inverterIdleWh;
  const loss = solarLoss(solar.losses);
  const controller = controllerFactor(solar.controller, solar.mpptEfficiency, solar.pwmBatteryVolts, solar.pwmPanelVmp);
  const chargerWh = plan.charger.enabled ? plan.charger.watts * plan.charger.hoursPerDay : 0;

  const months: MonthAnswer[] = MONTHS.map((_, month) => {
    const sunHours = solar.sunHours[month] ?? null;
    const run = simulate(plan, month, SIM_DAYS);
    const floor = 1 - battery.usableDod + 1e-9;
    const at = run.soc.findIndex((value) => value <= floor);
    return {
      month,
      sunHours,
      solarWh: solarDailyWh(solar.arrayWatts, sunHours ?? 0, loss, controller),
      emptyOnDay: dailyUseWh > 0 && at >= 0 ? Math.floor(at / 24) + 1 : null,
      lowest: Math.min(1, ...run.soc),
    };
  });
  const given = months.filter((month) => month.sunHours !== null);
  const worst = given.length > 0 ? given.reduce((low, month) => (month.sunHours! < low.sunHours! ? month : low)) : null;
  const perArrayWatt = worst ? solarDailyWh(1, worst.sunHours!, loss, controller) * battery.roundTrip : 0;

  const peakDemandW =
    plan.loads.reduce((sum, load) => sum + loadPeakW(load) * supplyFactor(plan, load.supply), 0) + (hasAc ? plan.inverter.idleW : 0);
  const dischargeA = sizes.volts > 0 ? peakDemandW / sizes.volts : 0;
  const chargeA = sizes.volts > 0 ? (solar.arrayWatts * controller + (plan.charger.enabled ? plan.charger.watts : 0)) / sizes.volts : 0;
  const check = (limit: number | null, amps: number) => ({ limit, over: limit === null ? null : amps > limit });

  return {
    bank: { volts: sizes.volts, ampHours: sizes.ampHours, wattHours: sizes.wattHours, usableWh, deliveredWh },
    dailyUseWh,
    acWh,
    usbWh,
    inverterIdleWh,
    averageW: dailyUseWh / 24,
    runtimeHours: dailyUseWh > 0 ? deliveredWh / (dailyUseWh / 24) : null,
    daysOfAutonomy: dailyUseWh > 0 ? deliveredWh / dailyUseWh : null,
    chargerWh,
    months,
    worstMonth: worst?.month ?? null,
    breakEvenArrayW: worst && dailyUseWh > 0 ? (perArrayWatt > 0 ? dailyUseWh / perArrayWatt : Number.POSITIVE_INFINITY) : null,
    peak: {
      dischargeA,
      chargeA,
      battery: check(battery.maxDischargeA, dischargeA),
      cable: check(plan.cableRatingA, dischargeA),
      charge: check(battery.maxChargeA, chargeA),
    },
    loss,
    controller,
  };
}

const pct = (share: number, digits = 0) => `${(share * 100).toFixed(digits)}%`;
const round = (value: number, digits = 1) => Number(value.toFixed(digits)).toString();

/** Every assumption behind the answers, as sentences, in the order the plan is set out. */
export function assumptions(plan: PowerPlanInput, answers: PlanAnswers): string[] {
  const { battery, solar, inverter } = plan;
  const chemistry = chemistryById(battery.chemistry);
  const lines = [
    `Battery: ${battery.series * battery.parallel} × ${round(battery.volts)} V ${round(battery.ampHours, 0)} Ah ${chemistry.label} (${battery.series} in series, ${battery.parallel} in parallel), ${round(answers.bank.wattHours, 0)} Wh rated.`,
    `${pct(battery.usableDod)} of the rated capacity is used, and ${pct(battery.roundTrip)} of the energy put in comes back out (round trip), split evenly between charging and discharging (${pct(oneWay(battery.roundTrip), 1)} each way, as HOMER does). Starting figures for ${chemistry.label}: ${chemistry.basis}`,
    "The rated capacity is taken as delivered. Real batteries give less when cold, when old, and when discharged fast; lead acid in particular is rated at its 20-hour rate and gives less at higher currents.",
  ];
  for (const load of plan.loads) {
    const where =
      load.supply === "ac"
        ? "through the inverter"
        : load.supply === "usb"
          ? "over USB, through the converter"
          : "from the battery directly";
    if (load.kind === "charge") {
      lines.push(
        `${load.name}${load.quantity > 1 ? ` × ${load.quantity}` : ""}: a ${round(load.wattHours)} Wh battery charged ${round(load.chargesPerDay)} times a day from ${String(load.startHour).padStart(2, "0")}:00, ${where}, ${pct(load.chargeEfficiency)} of the energy reaching the battery. The hours it takes (${round(load.chargeHours)} h a charge) decide only when in the day it draws.`,
      );
    } else if (load.kind === "device") {
      lines.push(
        `${load.name}${load.quantity > 1 ? ` × ${load.quantity}` : ""}: ${round(load.watts)} W for ${round(load.hoursPerDay)} h a day from ${String(load.startHour).padStart(2, "0")}:00, ${where}.`,
      );
    } else {
      const mode = radioModeById(load.mode);
      lines.push(
        `${load.name}${load.quantity > 1 ? ` × ${load.quantity}` : ""}: ${round(load.transmitW)} W transmitting, ${round(load.receiveW)} W receiving, ${round(load.standbyW)} W on standby; ${round(load.onAirHours)} h on the air and ${round(load.standbyHours)} h on standby a day, ${where}. Duty cycle ${pct(radioDuty(load), 1)}: ${pct(load.transmitShare)} of the time on the air transmitting × ${pct(load.modeFactor)} for the mode (${load.mode === "custom" ? "your figures" : `${mode.label}: ${mode.basis}`}).`,
      );
    }
  }
  if (plan.loads.some((load) => load.supply === "usb"))
    lines.push(`USB converter: ${pct(usbEfficiency(plan))} efficient. ${USB_CONVERTER.basis}`);
  if (plan.loads.some((load) => load.supply === "ac"))
    lines.push(
      `Inverter: ${pct(inverter.efficiency)} efficient under load, drawing ${round(inverter.idleW)} W of its own for ${round(inverter.hoursOn)} h a day, spread evenly over the day. Outpost's starting figures are 88% and 8 W: use your inverter's data sheet.`,
    );
  if (solar.arrayWatts > 0) {
    lines.push(
      `Solar: ${round(solar.arrayWatts, 0)} W of panels. Losses ${pct(answers.loss, 1)} in all (PVWatts' way of combining them: ${Object.entries(
        solar.losses,
      )
        .map(([key, value]) => `${LOSS_LABELS[key as keyof SolarLosses].toLowerCase()} ${value}%`)
        .join(", ")}).`,
      solar.controller === "mppt"
        ? `MPPT charge controller, ${pct(solar.mpptEfficiency)} efficient.`
        : `PWM charge controller: the panels work at the battery's ${round(solar.pwmBatteryVolts)} V rather than their ${round(solar.pwmPanelVmp)} V best, keeping ${pct(answers.controller)} of their power.`,
      "Peak sun hours are the figures typed for each month; each day's sun is spread over 06:00 to 18:00 as half a sine. Temperature is not counted: panels give less when hot.",
    );
  }
  if (plan.charger.enabled && plan.charger.watts > 0)
    lines.push(
      `${plan.charger.name || "Charger"}: ${round(plan.charger.watts, 0)} W into the battery for ${round(plan.charger.hoursPerDay)} h a day from ${String(plan.charger.startHour).padStart(2, "0")}:00.`,
    );
  lines.push(
    "Within each hour, what is made feeds the loads first and charges the battery with what is over; what a full battery cannot take is lost. The month's figures start from full and run 30 days of the same weather.",
    "The solar needed to break even is worked out as if all of the day's use passed through the battery, so it is on the safe side.",
  );
  return lines;
}
