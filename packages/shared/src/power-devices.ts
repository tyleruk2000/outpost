/**
 * Common devices for the battery calculators (Tools → Power and batteries): what a
 * Raspberry Pi, a phone, a radio or a router draws, each figure as its maker or an
 * official body published it, with where it was read and when.
 *
 * The rule is the project's: do not invent figures. Every figure here carries the
 * publisher's own words and the quantity as published (a current at a voltage, a
 * wattage, a capacity in mAh at a nominal voltage), so the conversion to watts or
 * watt-hours can be checked (apps/web/src/features/power/calc/devices.test.ts does).
 * A maker's figure is for a new device under the maker's own test conditions; the label
 * on a person's own device governs.
 *
 * The data is in `power-devices-data.ts`; this file has its shape and a person's own
 * devices, which the server keeps (apps/server/src/modules/power/devices.ts).
 */

// ── Where a figure came from ────────────────────────────────────────────────

export interface DeviceSource {
  publisher: string;
  /** The document's title as the publisher gives it, with its edition where it has one. */
  document: string;
  url: string;
  /** The day it was read, YYYY-MM-DD. */
  read: string;
}

/** A quantity exactly as published, before Outpost turns it into watts or watt-hours. */
export type PublishedQuantity =
  | { amps: number; volts: number }
  | { watts: number }
  | { milliampHours: number; volts: number }
  | { wattHours: number }
  /** Watt-hours from a stated energy over a stated time (a cool box's kWh a day, an average). */
  | { wattHoursPer: number; hours: number };

/**
 * One figure: watts for something that runs, watt-hours for a battery that is charged.
 * `typical` is what the publisher says it draws in use; `at-most` is a supply rating or
 * a maximum, which makes any runtime worked from it "at least".
 */
export interface PublishedFigure {
  value: number;
  as: PublishedQuantity;
  basis: "typical" | "at-most";
  /** The publisher's words, as published. */
  quote: string;
  /** Index into the entry's `sources`. */
  source: number;
  /** Where a voltage came from when it is not beside the current, and anything else needed to read the figure. */
  note?: string;
}

// ── The library ─────────────────────────────────────────────────────────────

export type DeviceGroupId = "computers" | "charged" | "radios" | "connected" | "home";

export const DEVICE_GROUPS: ReadonlyArray<{ id: DeviceGroupId; label: string }> = [
  { id: "computers", label: "Raspberry Pi and computers" },
  { id: "charged", label: "Phones and things you charge" },
  { id: "radios", label: "Radios" },
  { id: "connected", label: "Internet, network and screens" },
  { id: "home", label: "Light, warmth, food and health" },
];

/**
 * How a device is supplied from a battery: straight from it (12 V and the like), through
 * a converter to USB, or through an inverter at the mains voltage.
 */
export type DeviceSupply = "dc" | "usb" | "ac";

interface EntryBase {
  id: string;
  name: string;
  group: DeviceGroupId;
  /** Other words a person might search for it by. */
  aliases?: string[];
  supply: DeviceSupply;
  /** Typical hours a day, where that means something; the person changes it. */
  hoursPerDay?: number;
  /** A line shown with the entry: what the figure covers and what it leaves out. */
  note?: string;
  sources: DeviceSource[];
}

/** One state a device can be in (idle, in use, at most), each with its figure. */
export interface DeviceState {
  id: string;
  label: string;
  figure: PublishedFigure;
}

/** Something that runs: watts while on, in one or more states. The first state is the one offered first. */
export interface RunEntry extends EntryBase {
  kind: "run";
  states: DeviceState[];
  /**
   * A class of thing with no one maker's figure (an LED lamp): the states are points
   * from named sources, and the person chooses the one nearest theirs.
   */
  range?: boolean;
  /** Shown only as what an inverter must supply (a kettle): not a thing to run from a small battery. */
  warning?: string;
}

/** Something that is charged rather than run: its battery's energy. */
export interface ChargeEntry extends EntryBase {
  kind: "charge";
  battery: PublishedFigure;
}

/** A transceiver: receive, standby where published, and transmit at each stated output. */
export interface RadioEntry extends EntryBase {
  kind: "radio";
  receive: PublishedFigure;
  standby?: PublishedFigure;
  /** Highest output first. */
  transmit: Array<{ outputW: number; figure: PublishedFigure }>;
  /** Said when the maker gives transmit current at full power only. */
  fullPowerOnly?: boolean;
}

/** No figure to give: the person types it from the label (an unnamed phone, a medical device's charger). */
export interface LabelEntry extends EntryBase {
  kind: "label";
  /** What to type: watts while on, or a battery's watt-hours (or mAh and volts). */
  unit: "W" | "Wh";
  hint: string;
}

/** No figure at all, by design: a medical device whose maker's guide and the person's clinician govern. */
export interface GuideEntry extends EntryBase {
  kind: "guide";
  text: string;
}

export type CommonDevice = RunEntry | ChargeEntry | RadioEntry | LabelEntry | GuideEntry;

// ── Charging losses ─────────────────────────────────────────────────────────

/** A share of energy kept across one step of charging, with where the figure comes from. */
export interface ChargingStep {
  id: "charger" | "converter";
  label: string;
  /** 0 to 1. */
  share: number;
  basis: string;
  /** True where no citable figure was found and the default is Outpost's assumption. */
  assumption: boolean;
}

// ── A person's own devices ──────────────────────────────────────────────────

/** A person's own device, kept on the server so that it is one press next time. */
export interface OwnDeviceInput {
  name: string;
  kind: "run" | "charge" | "radio";
  supply: DeviceSupply;
  /** Watts while on (run). */
  watts: number | null;
  /** The battery's watt-hours (charge). */
  wattHours: number | null;
  /** Watts drawn receiving, transmitting at full output, and on standby (radio). */
  receiveW: number | null;
  transmitW: number | null;
  standbyW: number | null;
  /** Where the figure came from (the label, a meter), or anything else. */
  note: string;
}

export interface OwnDevice extends OwnDeviceInput {
  id: string;
  createdAt: number;
  updatedAt: number;
}

export const OWN_DEVICES_MAX = 500;

/** "16 November 2026" from "2026-11-16". */
export function readOn(day: string): string {
  const [year, month, date] = day.split("-").map(Number);
  const months = [
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
  return `${date} ${months[(month ?? 1) - 1]} ${year}`;
}

/** The figure's quantity as published, in words: "800 mA at 5 V", "3,349 mAh at 3.85 V". */
export function publishedText(as: PublishedQuantity): string {
  const n = (value: number) => value.toLocaleString("en-GB", { maximumFractionDigits: 3 });
  if ("amps" in as) return as.amps < 1 ? `${n(as.amps * 1000)} mA at ${n(as.volts)} V` : `${n(as.amps)} A at ${n(as.volts)} V`;
  if ("milliampHours" in as) return `${n(as.milliampHours)} mAh at ${n(as.volts)} V`;
  if ("watts" in as) return `${n(as.watts)} W`;
  if ("wattHoursPer" in as) return `${n(as.wattHoursPer)} Wh in ${n(as.hours)} h`;
  return `${n(as.wattHours)} Wh`;
}

/** What the published quantity comes to, in W or Wh: the conversion the data's test checks. */
export function convertedValue(as: PublishedQuantity): number {
  if ("amps" in as) return as.amps * as.volts;
  if ("milliampHours" in as) return (as.milliampHours / 1000) * as.volts;
  if ("watts" in as) return as.watts;
  if ("wattHoursPer" in as) return as.wattHoursPer / as.hours;
  return as.wattHours;
}
