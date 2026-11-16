/**
 * Power plans: a battery bank, the things that draw from it, and what charges it, kept
 * by a person under a name and worked out into how long it lasts and how much solar it
 * needs (Tools → Power and batteries).
 *
 * The server keeps a plan as the person typed it and works nothing out; the answers are
 * pure arithmetic done where they are shown (apps/web/src/features/power/calc). The
 * starting figures here each say where they come from. Every one is a starting point
 * the person can change, and the ones that bear on safety (how much current a battery or
 * a cable may carry) are never filled in for them: those come from the maker's data.
 */

// ── Batteries ───────────────────────────────────────────────────────────────

export type BatteryChemistry = "lifepo4" | "agm" | "flooded" | "li-ion";

export interface ChemistryFacts {
  id: BatteryChemistry;
  label: string;
  /** Nominal volts of one cell. */
  cellVolts: number;
  /** Cells in the usual "12 V" block of this chemistry. */
  cellsPerBlock: number;
  /** The share of the rated capacity a plan takes as usable, 0 to 1. A starting figure: the maker's own is better. */
  usableDod: number;
  /** Energy out over energy in, for a full discharge and recharge, 0 to 1. */
  roundTrip: number;
  /** Where each figure comes from, in a sentence. */
  basis: string;
}

/**
 * Starting figures for each chemistry. Sources (dated, and linked in docs/tools-power.md):
 * nominal cell voltages from Battery University BU-216 (lithium) and BU-303 (lead acid);
 * round-trip efficiency from Victron Energy's data sheets (LiFePO4 Smart: 92% at 1C or
 * less; Lithium SuperPack: "the average lead-acid battery" 80%, Li-ion 92%); usable
 * depth of discharge from the depth at which makers rate cycle life (Victron LiFePO4
 * Smart: 2,500 cycles at 80%) and, for lead acid, from Battery University BU-201 table 3
 * (deep-cycle lead acid: 400 to 500 cycles at 50%, 150 to 200 at 100%).
 */
export const CHEMISTRIES: readonly ChemistryFacts[] = [
  {
    id: "lifepo4",
    label: "Lithium iron phosphate (LiFePO4)",
    cellVolts: 3.2,
    cellsPerBlock: 4,
    usableDod: 0.8,
    roundTrip: 0.92,
    basis:
      "3.2 V a cell (Battery University BU-216). 92% round trip at 1C or less, and cycle life rated at 80% depth of discharge (Victron Energy, LiFePO4 Smart data sheet).",
  },
  {
    id: "agm",
    label: "Lead acid, AGM",
    cellVolts: 2,
    cellsPerBlock: 6,
    usableDod: 0.5,
    roundTrip: 0.8,
    basis:
      "2.0 V a cell (Battery University BU-303). 80% round trip for the average lead-acid battery (Victron Energy, Lithium SuperPack data sheet). 50% depth of discharge: deep-cycle lead acid gives 400 to 500 cycles at 50% against 150 to 200 at 100% (Battery University BU-201, table 3).",
  },
  {
    id: "flooded",
    label: "Lead acid, flooded",
    cellVolts: 2,
    cellsPerBlock: 6,
    usableDod: 0.5,
    roundTrip: 0.8,
    basis:
      "2.0 V a cell (Battery University BU-303). 80% round trip for the average lead-acid battery (Victron Energy, Lithium SuperPack data sheet). 50% depth of discharge, as for AGM (Battery University BU-201, table 3).",
  },
  {
    id: "li-ion",
    label: "Lithium ion (NMC)",
    cellVolts: 3.6,
    cellsPerBlock: 3,
    usableDod: 0.8,
    roundTrip: 0.92,
    basis:
      "3.6 V a cell (Battery University BU-216). 92% round trip for Li-ion (Victron Energy, Lithium SuperPack data sheet). 80% depth of discharge is Outpost's starting figure, as for LiFePO4: there is no one published figure for every maker, so use your battery's.",
  },
];

export const chemistryById = (id: BatteryChemistry): ChemistryFacts => CHEMISTRIES.find((item) => item.id === id) ?? CHEMISTRIES[0]!;

export interface PowerBattery {
  chemistry: BatteryChemistry;
  /** Nominal volts of one battery (block), as on its label: 12.8 for a "12 V" LiFePO4. */
  volts: number;
  /** Rated capacity of one battery, amp-hours. */
  ampHours: number;
  /** Batteries in series in each string. */
  series: number;
  /** Strings in parallel. */
  parallel: number;
  /** Share of the rated capacity used, 0 to 1. */
  usableDod: number;
  /** Round-trip energy efficiency, 0 to 1. */
  roundTrip: number;
  /** The whole bank's largest continuous discharge current, amps, from the maker's data (the BMS's rating for lithium). Null: not given. */
  maxDischargeA: number | null;
  /** The whole bank's largest charge current, amps, from the maker's data. Null: not given. */
  maxChargeA: number | null;
}

// ── Loads ───────────────────────────────────────────────────────────────────

/** How a load is supplied: straight from the battery (DC), or through the inverter (AC). */
export type PowerSupply = "dc" | "ac";

interface LoadBase {
  id: string;
  name: string;
  supply: PowerSupply;
  /** How many of it. */
  quantity: number;
  /** The hour of the day it is first on, 0 to 23, for the hour-by-hour chart. */
  startHour: number;
}

/** Anything with one power figure: on for so many hours a day at that power. */
export interface DeviceLoad extends LoadBase {
  kind: "device";
  /** Power while on, watts (at the plug for an AC load). */
  watts: number;
  hoursPerDay: number;
}

/**
 * A transceiver: on the air (listening, and transmitting part of that time) for some
 * hours, on standby for some more. While on the air its average draw is
 * `duty × transmitW + (1 − duty) × receiveW`, where `duty = transmitShare × modeFactor`.
 */
export interface RadioLoad extends LoadBase {
  kind: "radio";
  /** Draw from the supply at full output, key down, watts. The radio's manual gives the transmit current. */
  transmitW: number;
  /** Draw while receiving, watts. */
  receiveW: number;
  /** Draw on standby (on, squelched or scanning, or in a low-power mode), watts. */
  standbyW: number;
  onAirHours: number;
  standbyHours: number;
  /** The share of time on the air spent transmitting, 0 to 1. */
  transmitShare: number;
  /** The mode's average power while transmitting against full output, 0 to 1. */
  modeFactor: number;
  /** Which starting point the two shares came from; "custom" once changed. */
  mode: RadioModeId;
}

export type PowerLoad = DeviceLoad | RadioLoad;

export type RadioModeId = "ssb" | "ssb-processed" | "cw" | "ft8" | "fm" | "custom";

export interface RadioModePreset {
  id: RadioModeId;
  label: string;
  transmitShare: number;
  modeFactor: number;
  basis: string;
}

/**
 * Starting points for a transceiver's duty cycle. The mode factors are the ARRL's
 * (Station Evaluation Worksheet B, after FCC OET Bulletin 65 Supplement B): 40% for CW,
 * 20% for SSB with no speech processing, 40% with heavy processing, 100% for FM or
 * digital modes. FT8 sends 79 symbols of 0.16 s (12.64 s) in each 15 s period and a
 * station sends in every other period (Franke, Somerville and Taylor, "The FT4 and FT8
 * Communication Protocols", QEX July/August 2020), so 12.64 s of every 30 s. A
 * conversation is taken as half the time each way: that is Outpost's assumption.
 */
export const RADIO_MODES: readonly RadioModePreset[] = [
  {
    id: "ssb",
    label: "SSB voice",
    transmitShare: 0.5,
    modeFactor: 0.2,
    basis:
      "20% while transmitting, SSB with no speech processing (ARRL), and transmitting half the time on the air (Outpost's assumption).",
  },
  {
    id: "ssb-processed",
    label: "SSB voice, heavy speech processing",
    transmitShare: 0.5,
    modeFactor: 0.4,
    basis:
      "40% while transmitting, SSB with heavy speech processing (ARRL), and transmitting half the time on the air (Outpost's assumption).",
  },
  {
    id: "cw",
    label: "CW",
    transmitShare: 0.5,
    modeFactor: 0.4,
    basis: "40% while transmitting, CW (ARRL), and transmitting half the time on the air (Outpost's assumption).",
  },
  {
    id: "ft8",
    label: "FT8",
    transmitShare: 12.64 / 30,
    modeFactor: 1,
    basis:
      "100% while transmitting, digital modes (ARRL); 12.64 s sent in every other 15 s period, 42% of the time (QEX, July/August 2020).",
  },
  {
    id: "fm",
    label: "FM voice",
    transmitShare: 0.5,
    modeFactor: 1,
    basis: "100% while transmitting, FM (ARRL), and transmitting half the time on the air (Outpost's assumption).",
  },
  { id: "custom", label: "Your own figures", transmitShare: 0.5, modeFactor: 1, basis: "Figures you typed in." },
];

export const radioModeById = (id: RadioModeId): RadioModePreset => RADIO_MODES.find((item) => item.id === id) ?? RADIO_MODES[0]!;

// ── The inverter ────────────────────────────────────────────────────────────

export interface PowerInverter {
  /** Share of DC power that comes out as AC under load, 0 to 1, from its data sheet. */
  efficiency: number;
  /** Its own draw while switched on, watts (the data sheet's "zero load power"). */
  idleW: number;
  /** Hours a day it is switched on. Used only when the plan has an AC load. */
  hoursOn: number;
}

// ── Charging ────────────────────────────────────────────────────────────────

/**
 * The derating factors of NREL's PVWatts (Dobos, PVWatts Version 5 Manual, NREL/TP-6A20-62641,
 * 2014), percent, as its defaults. They combine as 1 − Π(1 − lossᵢ/100): 14.08% with these.
 */
export interface SolarLosses {
  soiling: number;
  shading: number;
  snow: number;
  mismatch: number;
  wiring: number;
  connections: number;
  lightInducedDegradation: number;
  nameplate: number;
  age: number;
  availability: number;
}

export const PVWATTS_LOSSES: SolarLosses = {
  soiling: 2,
  shading: 3,
  snow: 0,
  mismatch: 2,
  wiring: 2,
  connections: 0.5,
  lightInducedDegradation: 1.5,
  nameplate: 1,
  age: 0,
  availability: 3,
};

export const LOSS_LABELS: Record<keyof SolarLosses, string> = {
  soiling: "Soiling",
  shading: "Shading",
  snow: "Snow",
  mismatch: "Mismatch",
  wiring: "Wiring",
  connections: "Connections",
  lightInducedDegradation: "Light-induced degradation",
  nameplate: "Nameplate rating",
  age: "Age",
  availability: "Availability",
};

export type ChargeController = "mppt" | "pwm";

export interface PowerSolar {
  /** The array's rated power, watts (the sum of the panels' labels). Zero: no solar. */
  arrayWatts: number;
  controller: ChargeController;
  /** An MPPT controller's conversion efficiency, 0 to 1. */
  mpptEfficiency: number;
  /** For a PWM controller: the battery's voltage while charging, and the panel's voltage at maximum power (its label's Vmp). */
  pwmBatteryVolts: number;
  pwmPanelVmp: number;
  losses: SolarLosses;
  /** Peak sun hours (kWh/m² a day on the panels' plane) for January to December; null for a month not given. */
  sunHours: Array<number | null>;
}

/** A generator, or a mains charger when there is mains, charging for some hours a day. */
export interface PowerCharger {
  enabled: boolean;
  name: string;
  /** What reaches the battery, watts: the charger's rated output current × the charging voltage. */
  watts: number;
  hoursPerDay: number;
  startHour: number;
}

// ── A plan ──────────────────────────────────────────────────────────────────

export interface PowerPlanInput {
  name: string;
  notes: string;
  battery: PowerBattery;
  loads: PowerLoad[];
  inverter: PowerInverter;
  solar: PowerSolar;
  charger: PowerCharger;
  /** The cable from the battery: its rated current, amps, from the maker's data or the wiring regulations. Null: not given. */
  cableRatingA: number | null;
}

export interface PowerPlan extends PowerPlanInput {
  id: string;
  createdAt: number;
  updatedAt: number;
}

export const POWER_PLAN_MAX_LOADS = 60;

/** Months, for labels. */
export const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** A new plan: one 100 Ah LiFePO4 battery, no loads, no solar figures yet. */
export function newPowerPlan(name: string): PowerPlanInput {
  const chemistry = chemistryById("lifepo4");
  return {
    name,
    notes: "",
    battery: {
      chemistry: "lifepo4",
      volts: chemistry.cellVolts * chemistry.cellsPerBlock,
      ampHours: 100,
      series: 1,
      parallel: 1,
      usableDod: chemistry.usableDod,
      roundTrip: chemistry.roundTrip,
      maxDischargeA: null,
      maxChargeA: null,
    },
    loads: [],
    inverter: { efficiency: 0.88, idleW: 8, hoursOn: 24 },
    solar: {
      arrayWatts: 0,
      controller: "mppt",
      mpptEfficiency: 0.95,
      pwmBatteryVolts: 13.6,
      pwmPanelVmp: 18,
      losses: { ...PVWATTS_LOSSES },
      sunHours: Array.from({ length: 12 }, () => null),
    },
    charger: { enabled: false, name: "Generator", watts: 0, hoursPerDay: 0, startHour: 18 },
    cableRatingA: null,
  };
}
