/**
 * Devices from the library (or a person's own) turned into loads, and a battery worked
 * out against a mix of them: how long it runs what runs, how many charges it holds
 * besides or instead, what it does over so many days, which thing uses most, and the
 * battery that would be needed. Pure functions; the worked examples are in
 * docs/tools-power.md and tested in devices.test.ts.
 *
 * The battery here is the quick calculator's: what can be taken out = capacity × usable
 * share. A plan also counts the battery's own round-trip loss (√η on the way out), so a
 * plan made from the same devices gives a little less.
 */
import {
  type ChargeEntry,
  COMMON_DEVICES,
  type CommonDevice,
  chemistryById,
  type DeviceState,
  type LoadOrigin,
  type OwnDevice,
  type PowerBattery,
  type PowerLoad,
  type PowerSupply,
  type PublishedFigure,
  type RadioEntry,
  type RadioModeId,
  radioModeById,
  USB_CHARGING,
} from "@outpost/shared";
import { loadDailyWh, supplyFactor } from "./plan";

/** The library by id. */
export const deviceById = (id: string): CommonDevice | undefined => COMMON_DEVICES.find((entry) => entry.id === id);

/** A transmit draw estimated from output: twice the output, as for an amplifier about half efficient (as the HF planner's radios are). */
export const estimatedTransmitW = (outputW: number): number => outputW * 2;

export const ESTIMATE_STATE = "estimate";

const origin = (library: LoadOrigin["library"], id: string, name: string, state: string | null, figures: Record<string, number>) => ({
  library,
  id,
  name,
  state,
  figures,
});

/** The state of a running device a load was made from. */
export const stateOf = (entry: CommonDevice, state: string | null): DeviceState | undefined =>
  entry.kind === "run" ? (entry.states.find((each) => each.id === state) ?? entry.states[0]) : undefined;

/**
 * A load made from a library entry, with its figures from the entry and a record of
 * where they came from. `null` for an entry with no figure (a guide, a label to read):
 * the person types those.
 */
export function loadFromEntry(entry: CommonDevice, id: string, quantity = 1): PowerLoad | null {
  const base = { id, name: entry.name, supply: entry.supply as PowerSupply, quantity, startHour: entry.hoursPerDay === 24 ? 0 : 18 };
  if (entry.kind === "run") {
    const state = entry.states[0]!;
    return {
      ...base,
      kind: "device",
      watts: state.figure.value,
      hoursPerDay: entry.hoursPerDay ?? 1,
      origin: origin("common", entry.id, entry.name, state.id, { watts: state.figure.value }),
    };
  }
  if (entry.kind === "charge") {
    return {
      ...base,
      startHour: 20,
      kind: "charge",
      wattHours: entry.battery.value,
      chargesPerDay: 1,
      chargeEfficiency: USB_CHARGING.share,
      chargeHours: 2,
      origin: origin("common", entry.id, entry.name, null, { wattHours: entry.battery.value }),
    };
  }
  if (entry.kind === "radio") {
    const top = entry.transmit[0]!;
    const mode = radioModeById(entry.mode);
    const figures: Record<string, number> = { transmitW: top.figure.value, receiveW: entry.receive.value };
    if (entry.standby) figures.standbyW = entry.standby.value;
    return {
      ...base,
      kind: "radio",
      transmitW: top.figure.value,
      receiveW: entry.receive.value,
      standbyW: entry.standby?.value ?? 0,
      onAirHours: entry.hoursPerDay ?? 2,
      standbyHours: 0,
      transmitShare: mode.transmitShare,
      modeFactor: mode.modeFactor,
      mode: mode.id,
      origin: origin("common", entry.id, entry.name, top.id, figures),
    };
  }
  return null;
}

/** A load made from one of a person's own devices. */
export function loadFromOwn(device: OwnDevice, id: string, quantity = 1): PowerLoad {
  const base = { id, name: device.name, supply: device.supply as PowerSupply, quantity, startHour: 18 };
  if (device.kind === "charge")
    return {
      ...base,
      startHour: 20,
      kind: "charge",
      wattHours: device.wattHours ?? 0,
      chargesPerDay: 1,
      chargeEfficiency: USB_CHARGING.share,
      chargeHours: 2,
      origin: origin("own", device.id, device.name, null, { wattHours: device.wattHours ?? 0 }),
    };
  if (device.kind === "radio") {
    const mode = radioModeById("fm");
    return {
      ...base,
      kind: "radio",
      transmitW: device.transmitW ?? 0,
      receiveW: device.receiveW ?? 0,
      standbyW: device.standbyW ?? 0,
      onAirHours: 2,
      standbyHours: 0,
      transmitShare: mode.transmitShare,
      modeFactor: mode.modeFactor,
      mode: mode.id,
      origin: origin("own", device.id, device.name, null, {
        transmitW: device.transmitW ?? 0,
        receiveW: device.receiveW ?? 0,
        standbyW: device.standbyW ?? 0,
      }),
    };
  }
  return {
    ...base,
    kind: "device",
    watts: device.watts ?? 0,
    hoursPerDay: 4,
    origin: origin("own", device.id, device.name, null, { watts: device.watts ?? 0 }),
  };
}

/** A running device moved to another of its states: the figure and the record follow. */
export function withState(load: PowerLoad, state: DeviceState): PowerLoad {
  if (load.kind !== "device" || !load.origin) return load;
  return { ...load, watts: state.figure.value, origin: { ...load.origin, state: state.id, figures: { watts: state.figure.value } } };
}

/** A radio set to one of its published transmit figures (by its id). */
export function withTransmit(load: PowerLoad, entry: RadioEntry, pointId: string): PowerLoad {
  if (load.kind !== "radio" || !load.origin) return load;
  const point = entry.transmit.find((each) => each.id === pointId);
  if (!point) return load;
  const transmitW = point.figure.value;
  return { ...load, transmitW, origin: { ...load.origin, state: point.id, figures: { ...load.origin.figures, transmitW } } };
}

/**
 * A radio at a lower output than any its maker gives a figure for: the transmit draw is
 * the estimate, twice the output, and is said to be one.
 */
export function withLowerOutput(load: PowerLoad, outputW: number): PowerLoad {
  if (load.kind !== "radio" || !load.origin) return load;
  const transmitW = estimatedTransmitW(outputW);
  return {
    ...load,
    transmitW,
    origin: { ...load.origin, state: `${ESTIMATE_STATE}:${outputW}`, figures: { ...load.origin.figures, transmitW } },
  };
}

/** A radio set to a mode's share of time transmitting. */
export function withMode(load: PowerLoad, mode: RadioModeId): PowerLoad {
  if (load.kind !== "radio") return load;
  const preset = radioModeById(mode);
  return mode === "custom" ? { ...load, mode } : { ...load, mode, transmitShare: preset.transmitShare, modeFactor: preset.modeFactor };
}

/** True when a figure the load has is no longer the one it was given from its source. */
export function changedSince(load: PowerLoad): boolean {
  if (!load.origin) return false;
  const record = load as unknown as Record<string, unknown>;
  return Object.entries(load.origin.figures).some(([key, value]) => typeof record[key] === "number" && record[key] !== value);
}

/** The published figures a load's numbers came from, while they are unchanged; empty for anything else. */
export function figuresBehind(load: PowerLoad): PublishedFigure[] {
  if (load.origin?.library !== "common" || changedSince(load)) return [];
  const entry = deviceById(load.origin.id);
  if (!entry) return [];
  if (entry.kind === "run") {
    const state = stateOf(entry, load.origin.state);
    return state ? [state.figure] : [];
  }
  if (entry.kind === "charge") return [entry.battery];
  if (entry.kind === "radio") {
    const transmit = entry.transmit.find((point) => point.id === load.origin?.state);
    return [entry.receive, ...(entry.standby ? [entry.standby] : []), ...(transmit ? [transmit.figure] : [])];
  }
  return [];
}

/** How a load's figure stands: the maker's typical, the maker's maximum (so a runtime is "at least"), an estimate, or the person's own. */
export function figureKind(load: PowerLoad): "typical" | "at-most" | "estimate" | "own" {
  if (!load.origin || changedSince(load)) return "own";
  if (load.origin.library === "own") return "own";
  if (load.origin.state?.startsWith(ESTIMATE_STATE)) return "estimate";
  return figuresBehind(load).some((figure) => figure.basis === "at-most") ? "at-most" : "typical";
}

// ── A battery against a mix ─────────────────────────────────────────────────

export interface MixSetting {
  /** The battery's rated energy, watt-hours, and its voltage. */
  wattHours: number;
  volts: number;
  /** Share of the rated energy used, 0 to 1. */
  usable: number;
  /** The inverter's efficiency for AC loads, and the converter's for USB loads, 0 to 1. */
  inverter: number;
  usb: number;
  /** Days to plan for. */
  days: number;
}

export interface LoadShare {
  load: PowerLoad;
  /** Watt-hours a day from the battery, after the converter or inverter. */
  fromBatteryWh: number;
  share: number;
}

export interface MixAnswers {
  /** What can be taken out: capacity × usable share. */
  deliveredWh: number;
  /** A day's use from the battery by what runs (devices and radios), by what is charged, and in all. */
  runWh: number;
  chargeWh: number;
  dailyWh: number;
  /** Days the battery runs everything as set, and hours it runs what runs (nothing charged). */
  daysAll: number | null;
  runHours: number | null;
  /** For each thing charged: charges of one of it the battery holds instead of anything else, and besides running the rest for `days`. */
  charges: Array<{ load: PowerLoad; perChargeWh: number; instead: number; besides: number }>;
  /** Over `days`: whether what runs fits, and how many times over the set charges a day fit beside it (1 = as set). */
  plan: { days: number; runsFit: boolean; runDays: number | null; chargeScale: number | null };
  ranked: LoadShare[];
  /** The battery needed for `days` of everything: rated watt-hours and amp-hours at the voltage given. */
  needWh: number;
  needAh: number;
  /** True when any figure is a maker's maximum, so every runtime here is at least this long. */
  atLeast: boolean;
  /** True when any figure is an estimate (a radio at a lower output than its maker gives). */
  estimated: boolean;
}

const supplyOf = (setting: MixSetting) => ({
  inverter: { efficiency: setting.inverter, idleW: 0, hoursOn: 0 },
  usb: { efficiency: setting.usb },
});

/** Watt-hours a day a load takes from the battery. */
export const fromBatteryWh = (load: PowerLoad, setting: MixSetting): number =>
  loadDailyWh(load) * supplyFactor(supplyOf(setting), load.supply);

export function workOutMix(loads: PowerLoad[], setting: MixSetting): MixAnswers {
  const deliveredWh = setting.wattHours * setting.usable;
  const shares = loads.map((load) => ({ load, fromBatteryWh: fromBatteryWh(load, setting) }));
  const runWh = shares.filter(({ load }) => load.kind !== "charge").reduce((sum, item) => sum + item.fromBatteryWh, 0);
  const chargeWh = shares.filter(({ load }) => load.kind === "charge").reduce((sum, item) => sum + item.fromBatteryWh, 0);
  const dailyWh = runWh + chargeWh;
  const days = Math.max(0, setting.days);
  const left = deliveredWh - runWh * days;
  const charges = loads.flatMap((load) => {
    if (load.kind !== "charge") return [];
    const perChargeWh = (load.wattHours / load.chargeEfficiency) * supplyFactor(supplyOf(setting), load.supply);
    return [{ load, perChargeWh, instead: deliveredWh / perChargeWh, besides: Math.max(0, left) / perChargeWh }];
  });
  const needWh = setting.usable > 0 ? (dailyWh * days) / setting.usable : 0;
  return {
    deliveredWh,
    runWh,
    chargeWh,
    dailyWh,
    daysAll: dailyWh > 0 ? deliveredWh / dailyWh : null,
    runHours: runWh > 0 ? (deliveredWh / runWh) * 24 : null,
    charges,
    plan: {
      days,
      runsFit: left >= 0,
      runDays: runWh > 0 ? deliveredWh / runWh : null,
      chargeScale: chargeWh > 0 && days > 0 ? Math.max(0, left) / (chargeWh * days) : null,
    },
    ranked: shares
      .map((item) => ({ ...item, share: dailyWh > 0 ? item.fromBatteryWh / dailyWh : 0 }))
      .sort((a, b) => b.fromBatteryWh - a.fromBatteryWh),
    needWh,
    needAh: setting.volts > 0 ? needWh / setting.volts : 0,
    atLeast: loads.some((load) => figureKind(load) === "at-most"),
    estimated: loads.some((load) => figureKind(load) === "estimate"),
  };
}

// ── A battery or power station as a plan's battery bank ─────────────────────

export type BankEntry = ChargeEntry & { bank: NonNullable<ChargeEntry["bank"]> };

/** The library's batteries and power stations a plan can start from. */
export const BANK_ENTRIES: readonly BankEntry[] = COMMON_DEVICES.filter(
  (entry): entry is BankEntry => entry.kind === "charge" && entry.bank !== undefined,
);

/**
 * A plan's battery set from a library entry: one battery, its chemistry's starting
 * figures, and the maker's volts and amp-hours where given; otherwise the chemistry's
 * volts and the amp-hours that make the maker's watt-hours. The watt-hours are the
 * maker's either way. The rated currents are left as they were: Outpost does not guess them.
 */
export function batteryFromEntry(entry: BankEntry, current: PowerBattery): PowerBattery {
  const chemistry = entry.bank.chemistry ?? current.chemistry;
  const facts = chemistryById(chemistry);
  const changed = chemistry !== current.chemistry;
  const volts = entry.bank.volts ?? (entry.bank.chemistry ? Number((facts.cellVolts * facts.cellsPerBlock).toFixed(2)) : current.volts);
  const ampHours = entry.bank.volts && entry.bank.ampHours ? entry.bank.ampHours : Number((entry.battery.value / volts).toFixed(3));
  return {
    ...current,
    chemistry,
    volts,
    ampHours,
    series: 1,
    parallel: 1,
    usableDod: changed ? facts.usableDod : current.usableDod,
    roundTrip: changed ? facts.roundTrip : current.roundTrip,
  };
}
