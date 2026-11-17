/**
 * Batteries, solar panels and generators: energy in and energy out. Pure functions.
 *
 * Sources:
 * - Round-trip efficiency is split evenly between charging and discharging, each the
 *   square root of the round trip: HOMER Pro's battery model (UL Solutions, HOMER Pro
 *   manual, "Battery round-trip efficiency").
 * - Solar derating: NREL's PVWatts Version 5 (Dobos, NREL/TP-6A20-62641, 2014): losses
 *   combined as 1 − Π(1 − lossᵢ), and a standard module's temperature coefficient of
 *   power, −0.47% per °C above a cell temperature of 25 °C.
 * - Peak sun hours are the day's irradiation on the panels' plane in kWh/m², which is
 *   the number of hours at the 1 kW/m² the panel's rating is made at.
 * - Generator fuel: HOMER Pro's straight-line fuel curve, F = F₀·Y + F₁·P (UL Solutions,
 *   HOMER Pro manual, "Generator fuel curve intercept coefficient" and "slope").
 */

// ── Battery banks ───────────────────────────────────────────────────────────

export interface Bank {
  volts: number;
  ampHours: number;
  wattHours: number;
  batteries: number;
}

/** Batteries in series add their voltages; strings in parallel add their amp-hours. */
export function bank(volts: number, ampHours: number, series: number, parallel: number): Bank {
  return {
    volts: volts * series,
    ampHours: ampHours * parallel,
    wattHours: volts * series * ampHours * parallel,
    batteries: series * parallel,
  };
}

export interface Runtime {
  /** What can be taken out, watt-hours: capacity × usable share × efficiency. */
  deliveredWh: number;
  hours: number;
  /** Current from the battery, amps. */
  amps: number;
  /** As a fraction of the capacity per hour (the "C-rate"). */
  cRate: number;
}

/**
 * How long a battery runs a steady load: capacity × usable share × efficiency ÷ load.
 * `efficiency` is everything between the cells and the load (an inverter, a converter).
 */
export function runtime(wattHours: number, volts: number, loadW: number, usable: number, efficiency: number): Runtime | null {
  if (!(wattHours > 0) || !(loadW > 0) || !(volts > 0) || !(usable > 0) || !(efficiency > 0)) return null;
  const deliveredWh = wattHours * usable * efficiency;
  const amps = loadW / efficiency / volts;
  return { deliveredWh, hours: deliveredWh / loadW, amps, cRate: amps / (wattHours / volts) };
}

/** Charging and discharging each lose the square root of the round trip. */
export const oneWay = (roundTrip: number): number => Math.sqrt(roundTrip);

// ── Solar ───────────────────────────────────────────────────────────────────

/** PVWatts' way of adding losses given in per cent: 1 − Π(1 − lossᵢ/100). A fraction, 0 to 1. */
export function combinedLoss(percents: number[]): number {
  return 1 - percents.reduce((kept, percent) => kept * (1 - percent / 100), 1);
}

export const PVWATTS_TEMPERATURE_COEFFICIENT = -0.47; // % per °C, standard module

/** The factor for cells warmer (or cooler) than 25 °C. */
export const temperatureFactor = (cellCelsius: number, coefficient = PVWATTS_TEMPERATURE_COEFFICIENT): number =>
  1 + (coefficient / 100) * (cellCelsius - 25);

/**
 * What a charge controller passes on. An MPPT controller converts the panel's power at
 * its best point, less its own losses. A PWM controller connects the panel to the battery,
 * so the panel works at the battery's voltage rather than its own best one: about
 * Vbattery ÷ Vmp of its power.
 */
export function controllerFactor(controller: "mppt" | "pwm", mpptEfficiency: number, batteryVolts: number, panelVmp: number): number {
  if (controller === "mppt") return mpptEfficiency;
  return panelVmp > 0 ? Math.min(1, batteryVolts / panelVmp) : 0;
}

/** Watt-hours a day out of the controller: W × peak sun hours × (1 − losses) × temperature × controller. */
export function solarDailyWh(arrayW: number, sunHours: number, loss: number, controller: number, temperature = 1): number {
  return Math.max(0, arrayW * sunHours * (1 - loss) * temperature * controller);
}

export interface ChargeTime {
  /** Energy to put in, watt-hours, counting the charging loss. */
  neededWh: number;
  /** What is left over each day for the battery after the loads running meanwhile. */
  netDailyWh: number;
  /** Days of sun to refill; null when nothing is left over for the battery. */
  days: number | null;
}

/** Days to put back `refillWh` taken out, with `dailyLoadWh` used each day meanwhile. */
export function chargeTime(refillWh: number, dailySolarWh: number, roundTrip: number, dailyLoadWh = 0): ChargeTime {
  const neededWh = refillWh / oneWay(roundTrip);
  const netDailyWh = dailySolarWh - dailyLoadWh;
  return { neededWh, netDailyWh, days: netDailyWh > 0 ? neededWh / netDailyWh : null };
}

// ── Generators ──────────────────────────────────────────────────────────────

/**
 * The share of its no-load intercept in a generator's full-load fuel use, from the one
 * worked example in HOMER's documentation: a 50 kW generator using 8.48 L/h at 25 kW
 * and 15.3 L/h at 50 kW, an intercept of 1.655 L/h. An estimate for a generator whose
 * data sheet gives only one figure. Small petrol generators may differ a good deal.
 */
export const HOMER_EXAMPLE_INTERCEPT_SHARE = 1.655 / 15.3;

export interface FuelPoint {
  /** Load as a share of the rated output, 0 to 1. */
  load: number;
  litresPerHour: number;
}

export interface FuelCurve {
  /** Litres an hour with nothing connected. */
  intercept: number;
  /** Extra litres an hour per unit of load share. */
  slope: number;
  /** Whether it came from two figures of the person's own, or from one and the usual shape. */
  basis: "two-points" | "estimated";
}

/** A straight fuel line: through two points of the data sheet, or through one and HOMER's example shape. */
export function fuelCurve(full: FuelPoint, second: FuelPoint | null): FuelCurve | null {
  if (!(full.litresPerHour > 0) || !(full.load > 0)) return null;
  if (second && second.litresPerHour > 0 && second.load >= 0 && Math.abs(second.load - full.load) > 1e-6) {
    const slope = (full.litresPerHour - second.litresPerHour) / (full.load - second.load);
    const intercept = full.litresPerHour - slope * full.load;
    if (slope > 0 && intercept >= 0) return { intercept, slope, basis: "two-points" };
    return null;
  }
  // The full-load figure is scaled to 100% first; the shape is HOMER's example.
  const atFull = full.litresPerHour / (HOMER_EXAMPLE_INTERCEPT_SHARE + (1 - HOMER_EXAMPLE_INTERCEPT_SHARE) * full.load);
  return { intercept: atFull * HOMER_EXAMPLE_INTERCEPT_SHARE, slope: atFull * (1 - HOMER_EXAMPLE_INTERCEPT_SHARE), basis: "estimated" };
}

export const litresPerHourAt = (curve: FuelCurve, load: number): number => curve.intercept + curve.slope * load;

export const LITRES_PER_UK_GALLON = 4.54609;
export const LITRES_PER_US_GALLON = 3.785411784;
