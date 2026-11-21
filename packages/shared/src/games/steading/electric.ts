/**
 * The settlement's electricity: what each source makes, what each battery holds, what a
 * generator burns, and how a moment's power is shared out.
 *
 * Every kind of generation and storage is on one line for the whole settlement. In a
 * moment, the sun, the wind and the water wheel come first; what they make beyond the
 * load charges the batteries, and what they fall short of is drawn from the batteries;
 * only when the batteries are down to their floor does a generator start, and it follows
 * the load without charging them. When everything together falls short, the workshops'
 * machines go without first, then the houses' lights.
 *
 * Rates here are per settlement day, as everywhere in the Steading: kWh a day is the
 * average power in kW times 24.
 */
import { type BatteryChemistry, chemistryById } from "../../power.ts";
import { LANDS, type LandId } from "./lands.ts";

/** One 400 W panel, twelve to an array (the game's size for an array). */
export const PANEL_WATTS = 400;
export const PANELS_PER_ARRAY = 12;
export const ARRAY_KWP = (PANEL_WATTS * PANELS_PER_ARRAY) / 1000;

/** A generator's rating, kW, and its tank, litres. */
export const GENERATOR_KW = 10;
export const TANK_LITRES = 200;
/** Litres in a can of diesel. */
export const CAN_LITRES = 20;
/**
 * HOMER's worked example: a 50 kW generator using 1.655 L/h with no load (its intercept)
 * and 15.3 L/h at 50 kW. Scaled to size, a generator burns 0.0331 L/h for each kW of its
 * rating whenever it runs, and 0.2729 L for each kWh it makes.
 */
export const FUEL_NO_LOAD_L_PER_KW_H = 1.655 / 50;
export const FUEL_L_PER_KWH = (15.3 - 1.655) / 50;
/** Litres a day a generator burns making `kwhDay` kWh a day (zero when it does not run). */
export const fuelPerDay = (kwhDay: number) => (kwhDay > 1e-12 ? 24 * FUEL_NO_LOAD_L_PER_KW_H * GENERATOR_KW + FUEL_L_PER_KWH * kwhDay : 0);
/** The most kWh a day a generator can make with `litresDay` of fuel a day (and its rating). */
export const kwhFromFuel = (litresDay: number) =>
  Math.max(0, Math.min(GENERATOR_KW * 24, (litresDay - 24 * FUEL_NO_LOAD_L_PER_KW_H * GENERATOR_KW) / FUEL_L_PER_KWH));

export interface BankKind {
  chemistry: BatteryChemistry;
  /** Cells in series, and one cell's nominal volts and amp-hours. */
  cells: number;
  cellVolts: number;
  ampHours: number;
  volts: number;
  /** Nominal energy, kWh. */
  kwh: number;
  /** The share of it used, and the energy round trip (from Tools → Power's figures). */
  usable: number;
  roundTrip: number;
}

function bank(chemistry: BatteryChemistry, cells: number, ampHours: number): BankKind {
  const facts = chemistryById(chemistry);
  const volts = cells * facts.cellVolts;
  return {
    chemistry,
    cells,
    cellVolts: facts.cellVolts,
    ampHours,
    volts,
    kwh: (volts * ampHours) / 1000,
    usable: facts.usableDod,
    roundTrip: facts.roundTrip,
  };
}

export const BANKS = {
  leadbank: bank("flooded", 24, 1_000),
  lithiumbank: bank("lifepo4", 16, 280),
} as const;
export type BankId = keyof typeof BANKS;
export const isBank = (kind: string): kind is BankId => kind in BANKS;

/** The month (0 to 11) of a moment, by the UTC calendar: the season of every land follows it. */
export const monthOf = (at: number) => new Date(at).getUTCMonth();

/** The sun and wind of a land in a month, per settlement day. */
export interface Weather {
  month: number;
  /** The share of the day that is daylight, 0 to 1. */
  daylight: number;
  /** kWh a day from one array, all of it made in daylight. */
  arrayKwh: number;
  /** kWh a day from one turbine, steady day and night. */
  turbineKwh: number;
}

export function weatherOf(land: LandId, month: number): Weather {
  const l = LANDS[land];
  return {
    month,
    daylight: Math.min(1, Math.max(0, (l.daylightHours[month] ?? 12) / 24)),
    arrayKwh: ARRAY_KWP * (l.solarKwhPerKwp[month] ?? 0),
    turbineKwh: l.turbineKwh[month] ?? 0,
  };
}

/** What sits on the line in a moment: sources, the batteries, the generators and the loads. */
export interface LineInput {
  /** kWh a day the sun, the wind and the wheel make now. */
  renewable: number;
  /** The batteries together: usable kWh they can hold, what they hold, and each way's efficiency. */
  capacity: number;
  stored: number;
  oneWay: number;
  /** Each generator's id and the litres in its tank. */
  generators: { id: number; tank: number }[];
  /** kWh a day wanted by each house, then by each machine, in the order they are served. */
  houses: { id: number; want: number }[];
  machines: { id: number; want: number }[];
}

export interface LineFlow {
  renewable: number;
  /** kWh a day into the batteries (after losses) and out of them (before losses: what they lose of their store). */
  charging: number;
  discharging: number;
  /** kWh a day of sun and wind with nowhere to go. */
  spilled: number;
  /** kWh a day each generator makes, and the litres a day it burns. */
  generated: Map<number, number>;
  burning: Map<number, number>;
  /** kWh a day each house and machine is given. */
  given: Map<number, number>;
  want: number;
  served: number;
  /** Whether the batteries are full, at their floor, or between. */
  bank: "full" | "empty" | "between" | "none";
}

const EPS = 1e-9;

/** The power on the line in a moment. Nothing here depends on goods: the line is worked out first. */
export function shareLine(input: LineInput): LineFlow {
  const want = [...input.houses, ...input.machines].reduce((sum, w) => sum + w.want, 0);
  const has = input.capacity > EPS;
  const bank: LineFlow["bank"] = !has ? "none" : input.stored >= input.capacity - EPS ? "full" : input.stored <= EPS ? "empty" : "between";
  let charging = 0;
  let discharging = 0;
  let spilled = 0;
  const generated = new Map<number, number>();
  const burning = new Map<number, number>();
  let supply = input.renewable;
  if (input.renewable >= want) {
    const surplus = input.renewable - want;
    if (has && bank !== "full") charging = surplus * input.oneWay;
    else spilled = surplus;
    supply = want;
  } else {
    const short = want - input.renewable;
    if (has && bank !== "empty") {
      discharging = short / input.oneWay;
      supply = want;
    } else {
      // The batteries are at their floor (or there are none): the generators with fuel follow
      // the load, the first built starting first.
      let left = short;
      for (const g of input.generators) {
        if (g.tank <= EPS) continue;
        const kwh = Math.min(left, GENERATOR_KW * 24);
        if (kwh <= EPS) continue;
        generated.set(g.id, kwh);
        burning.set(g.id, fuelPerDay(kwh));
        left -= kwh;
      }
      supply = input.renewable + (short - left);
    }
  }
  // Houses first, then the machines, each as far as the supply goes.
  const given = new Map<number, number>();
  let left = supply;
  for (const w of [...input.houses, ...input.machines]) {
    const take = Math.max(0, Math.min(left, w.want));
    if (take > EPS) given.set(w.id, take);
    left -= take;
  }
  return {
    renewable: input.renewable,
    charging,
    discharging,
    spilled,
    generated,
    burning,
    given,
    want,
    served: Math.min(supply, want),
    bank,
  };
}
