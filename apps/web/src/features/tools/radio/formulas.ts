/**
 * The sums behind the radio calculators. Pure arithmetic; the sources are named beside
 * each and in docs/tools.md. What Outpost's radio code already has (the radio horizon,
 * watts to dBW) is used from `@outpost/shared` rather than written again.
 */
import { dbwToWatts, EARTH_RADIUS_METERS, RADIO_EARTH_FACTOR, wattsToDbw } from "@outpost/shared";

/** The speed of light, in metres a second (exact, by the definition of the metre). */
export const SPEED_OF_LIGHT = 299_792_458;

// ── Antenna lengths ─────────────────────────────────────────────────────────

export type AntennaKind = "dipole" | "efhw" | "quarter";

/**
 * The usual starting factor for a wire antenna: a half-wave wire resonates a little
 * shorter than a half wavelength in free space, because of the end effect and the wire's
 * thickness. 0.95 gives the familiar 468 / f feet (ARRL) and 142.5 / f metres.
 */
export const WIRE_FACTOR = 0.95;

export interface AntennaLengths {
  /** The free-space wavelength, in metres. */
  wavelength: number;
  /** The whole radiating length, in metres: tip to tip for a dipole, the wire for an end-fed, the element for a quarter wave. */
  total: number;
  /** Each leg of a dipole, in metres; null for the others. */
  leg: number | null;
}

export function antennaLengths(kind: AntennaKind, mhz: number, factor = WIRE_FACTOR): AntennaLengths {
  const wavelength = SPEED_OF_LIGHT / (mhz * 1e6);
  const share = kind === "quarter" ? 0.25 : 0.5;
  const total = wavelength * share * factor;
  return { wavelength, total, leg: kind === "dipole" ? total / 2 : null };
}

// ── Free-space path loss ────────────────────────────────────────────────────

/**
 * Basic transmission loss in free space between isotropic antennas, in dB (ITU-R P.525):
 * L = 20·log10(4πd/λ). With f in MHz and d in km that is 32.45 + 20·log10 f + 20·log10 d;
 * the Recommendation rounds the constant to 32.4.
 */
export function freeSpaceLossDb(mhz: number, km: number): number {
  const wavelength = SPEED_OF_LIGHT / (mhz * 1e6);
  return 20 * Math.log10((4 * Math.PI * km * 1000) / wavelength);
}

// ── Radio horizon ───────────────────────────────────────────────────────────

/** Distance to the smooth-earth radio horizon from an antenna `height` metres up, in metres: √(2·k·R·h). */
export function radioHorizonMeters(height: number, k = RADIO_EARTH_FACTOR): number {
  return Math.sqrt(2 * k * EARTH_RADIUS_METERS * Math.max(0, height));
}

// ── Power and signal levels ─────────────────────────────────────────────────

export const wattsToDbm = (watts: number): number => wattsToDbw(watts) + 30;
export const dbmToWatts = (dbm: number): number => dbwToWatts(dbm - 30);

export type SMeterConvention = "hf" | "vhf";

/**
 * Where S9 lies under the IARU Region 1 recommendation: −73 dBm below 30 MHz and −93 dBm
 * above it, with 6 dB for each S-unit. (`sMeter` in @outpost/shared says the HF reading
 * in words; this gives both conventions and the reverse.)
 */
export const S9_DBM: Record<SMeterConvention, number> = { hf: -73, vhf: -93 };
export const DB_PER_S_UNIT = 6;

/** A level in dBm as S-units: 9 is S9, 9.5 is half a unit over… Above S9 the reading is S9 plus decibels. */
export function sUnitsFromDbm(dbm: number, convention: SMeterConvention): { units: number; overS9Db: number } {
  const fromS9 = dbm - S9_DBM[convention];
  if (fromS9 >= 0) return { units: 9, overS9Db: fromS9 };
  return { units: 9 + fromS9 / DB_PER_S_UNIT, overS9Db: 0 };
}

/** "S9 + 20 dB", "S7", "below S1": an S-meter reading as it is said. */
export function sMeterReading(dbm: number, convention: SMeterConvention): string {
  const { units, overS9Db } = sUnitsFromDbm(dbm, convention);
  if (overS9Db >= 0.5) return `S9 + ${Math.round(overS9Db)} dB`;
  const whole = Math.round(units);
  if (whole < 1) return "below S1";
  return `S${Math.min(9, whole)}`;
}

/** The level in dBm of an S-unit reading, with decibels over S9 where given. */
export function dbmFromSUnits(units: number, convention: SMeterConvention, overS9Db = 0): number {
  return S9_DBM[convention] + (units - 9) * DB_PER_S_UNIT + overS9Db;
}

// ── Cable loss ──────────────────────────────────────────────────────────────

/** A cable's attenuation at a frequency, from a manufacturer's figures: [MHz, dB per 100 m] in rising order of frequency. */
export type AttenuationTable = ReadonlyArray<readonly [number, number]>;

/**
 * Loss per 100 m at `mhz`, read between the two nearest published figures. Cable loss
 * rises close to the square root of frequency, so the reading is a straight line between
 * the points on logarithmic scales. Null outside the frequencies the table covers: the
 * calculator does not guess beyond the published figures.
 */
export function lossPer100m(table: AttenuationTable, mhz: number): number | null {
  if (table.length === 0) return null;
  const first = table[0]!;
  const last = table[table.length - 1]!;
  if (mhz < first[0] || mhz > last[0]) return null;
  for (let index = 0; index < table.length; index += 1) {
    const [f, db] = table[index]!;
    if (f === mhz) return db;
    const next = table[index + 1];
    if (next && mhz > f && mhz < next[0]) {
      const share = Math.log(mhz / f) / Math.log(next[0] / f);
      return Math.exp(Math.log(db) + share * (Math.log(next[1]) - Math.log(db)));
    }
  }
  return null;
}

export interface CableLoss {
  lossDb: number;
  /** The share of the power that arrives, 0 to 1. */
  delivered: number;
}

export function cableLoss(dbPer100m: number, lengthMeters: number): CableLoss {
  const lossDb = (dbPer100m * lengthMeters) / 100;
  return { lossDb, delivered: 10 ** (-lossDb / 10) };
}

// ── Battery life ────────────────────────────────────────────────────────────

export interface DutyCycle {
  /** Shares of the time, in per cent, that add up to 100. */
  transmitPercent: number;
  receivePercent: number;
  standbyPercent: number;
}

/** The average current drawn over a duty cycle, in the unit the currents are given in. */
export function averageCurrent(currents: { transmit: number; receive: number; standby: number }, duty: DutyCycle): number {
  return (currents.transmit * duty.transmitPercent + currents.receive * duty.receivePercent + currents.standby * duty.standbyPercent) / 100;
}

/** Hours a battery lasts: usable capacity over average current (both in mAh and mA, or Ah and A). */
export function batteryHours(capacity: number, usablePercent: number, average: number): number {
  return (capacity * usablePercent) / 100 / average;
}
