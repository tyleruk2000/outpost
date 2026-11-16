/**
 * HF propagation planning: what a prediction is asked for and what comes back, with the
 * small sums both sides need (bands, modes, units, the geometry of a steep path).
 *
 * The predictions themselves are not made here or anywhere in Outpost's own code. They
 * come from a propagation engine the server runs (VOACAP); see
 * `apps/server/src/modules/propagation`. What is in this file is either a published
 * figure, with where it was read, or geometry that is labelled as geometry.
 */

// ── Bands ───────────────────────────────────────────────────────────────────

export interface HfBand {
  id: string;
  /** "40 m" */
  label: string;
  /** Band edges in MHz. */
  fromMhz: number;
  toMhz: number;
  /** One frequency near the middle of the band, which stands for it in a comparison. */
  mhz: number;
}

/**
 * The amateur bands between 3 and 30 MHz as the United Kingdom licence gives them (the
 * bundled sheet "Amateur radio bands in the United Kingdom"), each with one frequency
 * near its middle. 160 m is left out: the engine's stated range starts at 2 MHz.
 * Nothing here says who may transmit where; that is in the band sheets.
 */
export const HF_BANDS: readonly HfBand[] = [
  { id: "80m", label: "80 m", fromMhz: 3.5, toMhz: 3.8, mhz: 3.65 },
  { id: "60m", label: "60 m", fromMhz: 5.2585, toMhz: 5.4065, mhz: 5.33 },
  { id: "40m", label: "40 m", fromMhz: 7.0, toMhz: 7.2, mhz: 7.1 },
  { id: "30m", label: "30 m", fromMhz: 10.1, toMhz: 10.15, mhz: 10.12 },
  { id: "20m", label: "20 m", fromMhz: 14.0, toMhz: 14.35, mhz: 14.18 },
  { id: "17m", label: "17 m", fromMhz: 18.068, toMhz: 18.168, mhz: 18.12 },
  { id: "15m", label: "15 m", fromMhz: 21.0, toMhz: 21.45, mhz: 21.22 },
  { id: "12m", label: "12 m", fromMhz: 24.89, toMhz: 24.99, mhz: 24.94 },
  { id: "10m", label: "10 m", fromMhz: 28.0, toMhz: 29.7, mhz: 28.85 },
];

/** The range of frequencies the engine is stated to cover, in MHz. */
export const HF_MIN_MHZ = 2;
export const HF_MAX_MHZ = 30;

/** The band a frequency lies in, if it is in one. */
export function bandOf(mhz: number): HfBand | null {
  return HF_BANDS.find((band) => mhz >= band.fromMhz && mhz <= band.toMhz) ?? null;
}

// ── Operating modes ─────────────────────────────────────────────────────────

export type ModeId = "ssb" | "cw" | "ft8" | "js8" | "digital";

export interface OperatingMode {
  id: ModeId;
  label: string;
  /**
   * The signal-to-noise ratio the mode is taken to need, in dB, measured in
   * `referenceBandwidthHz`. Null for a mode with no published figure: the person gives
   * their own.
   */
  requiredSnrDb: number | null;
  /** The bandwidth the figure above is measured in: 1 Hz, or the 2500 Hz the digital modes report in. */
  referenceBandwidthHz: number;
  /** What the figure means, in the publisher's own terms. */
  meaning: string;
  /** Where the figure was read. */
  source: string;
}

/**
 * Starting figures for each mode. They are not measurements of anybody's station and
 * they are not on one basis: the two speech and Morse figures are a planning convention
 * for "reasonable" copy by ear, the FT8 figure is a simulated 50% decode threshold, and
 * the JS8 figure is the sensitivity its guide states. Every one can be changed in the
 * planner. All were read on 16 November 2026.
 */
export const OPERATING_MODES: readonly OperatingMode[] = [
  {
    id: "ssb",
    label: "SSB voice",
    requiredSnrDb: 45,
    referenceBandwidthHz: 1,
    meaning: "The planning figure VOACAP's guide gives for reasonable SSB reception, in a 1 Hz bandwidth.",
    source: "Jari Perkiömäki OH6BG, \"Setting up input values for VOACAP\", voacap.com/2023/voacap-windows-input.html",
  },
  {
    id: "cw",
    label: "CW (Morse)",
    requiredSnrDb: 24,
    referenceBandwidthHz: 1,
    meaning: "The planning figure VOACAP's guide gives for reasonable CW reception, in a 1 Hz bandwidth (it also offers 27).",
    source: "Jari Perkiömäki OH6BG, \"Setting up input values for VOACAP\", voacap.com/2023/voacap-windows-input.html",
  },
  {
    id: "ft8",
    label: "FT8",
    requiredSnrDb: -18.8,
    referenceBandwidthHz: 2500,
    meaning:
      "The signal-to-noise ratio at which half of FT8 transmissions decode on a simulated mid-latitude moderate HF channel with no prior information; on a channel with noise only it is −20.8 dB.",
    source: "Franke, Somerville and Taylor, \"The FT4 and FT8 Communication Protocols\", QEX July/August 2020, Table 6",
  },
  {
    id: "js8",
    label: "JS8Call (normal speed)",
    requiredSnrDb: -24,
    referenceBandwidthHz: 2500,
    meaning:
      "The sensitivity the JS8Call guide states for normal speed. The guide does not say on what channel or at what share of decodes; slow is given as −28 dB, fast −20 dB and JS8 40 −18 dB.",
    source: "JS8Call User Guide, version 4.0 of 6 September 2026 (JS8Call-Improved)",
  },
  {
    id: "digital",
    label: "Another narrowband digital mode",
    requiredSnrDb: null,
    referenceBandwidthHz: 2500,
    meaning: "No figure is assumed. Give the signal-to-noise ratio your mode needs and the bandwidth it is measured in.",
    source: "Your own figure",
  },
];

export const modeById = (id: ModeId): OperatingMode => OPERATING_MODES.find((mode) => mode.id === id) ?? OPERATING_MODES[0]!;

/**
 * A signal-to-noise ratio measured in one bandwidth, restated for a 1 Hz bandwidth,
 * which is how the engine states every ratio: the same signal against the noise of a
 * band `bandwidthHz` times narrower. 10·log10 of the bandwidth is added.
 */
export function snrInOneHertz(snrDb: number, bandwidthHz: number): number {
  return snrDb + 10 * Math.log10(bandwidthHz);
}

/** The other way: a ratio in 1 Hz restated for a receiver bandwidth. */
export function snrInBandwidth(snrDbHz: number, bandwidthHz: number): number {
  return snrDbHz - 10 * Math.log10(bandwidthHz);
}

// ── Noise where the receiver is ─────────────────────────────────────────────

export type NoiseEnvironment = "city" | "residential" | "rural" | "remote";

export interface NoiseSetting {
  id: NoiseEnvironment;
  label: string;
  /** Man-made noise power at 3 MHz in a 1 Hz bandwidth, in dBW: the figure the engine is given. */
  dbwAt3Mhz: number;
}

/**
 * The four man-made noise settings of VOACAP, with the level each stands for at 3 MHz
 * (from the program's own source, `voacap.for`; the first three are the "city",
 * "residential" and "rural" curves of Recommendation ITU-R P.372). The engine reads the
 * level to a whole decibel. Atmospheric and galactic noise are worked out by the engine
 * from its own maps and are not set here.
 */
export const NOISE_ENVIRONMENTS: readonly NoiseSetting[] = [
  { id: "city", label: "Urban (city, industrial)", dbwAt3Mhz: -140.4 },
  { id: "residential", label: "Residential", dbwAt3Mhz: -144.7 },
  { id: "rural", label: "Rural", dbwAt3Mhz: -150.0 },
  { id: "remote", label: "Remote, far from any building", dbwAt3Mhz: -164.1 },
];

export const noiseSetting = (id: NoiseEnvironment): NoiseSetting => NOISE_ENVIRONMENTS.find((item) => item.id === id) ?? NOISE_ENVIRONMENTS[1]!;

// ── Units ───────────────────────────────────────────────────────────────────

/** Power in watts as decibels relative to one watt. */
export const wattsToDbw = (watts: number): number => 10 * Math.log10(watts);
export const dbwToWatts = (dbw: number): number => 10 ** (dbw / 10);
/** Decibels relative to a watt as decibels relative to a milliwatt. */
export const dbwToDbm = (dbw: number): number => dbw + 30;

/**
 * A received power as an S-meter reading by the HF convention: S9 is −73 dBm at the
 * receiver's input and each S-unit below it is 6 dB (the bundled Radio Engineering
 * Handbook, "Decibels"). Real S-meters seldom follow it closely.
 */
export function sMeter(dbw: number): string {
  const dbm = dbwToDbm(dbw);
  if (dbm >= -73) {
    const over = Math.round(dbm + 73);
    return over >= 1 ? `S9 + ${over} dB` : "S9";
  }
  const units = Math.max(0, Math.round(9 - (-73 - dbm) / 6));
  return units < 1 ? "below S1" : `S${units}`;
}

/** Wavelength in metres. */
export const hfWavelengthMeters = (mhz: number): number => 299.792458 / mhz;

// ── Geometry of a steep path (not a prediction) ─────────────────────────────

/** Mean radius of the Earth in kilometres, as distances are measured elsewhere in Outpost. */
const EARTH_RADIUS_KM = 6371.0088;

export interface SteepPathGeometry {
  /** Angle above the horizon at which the signal leaves and arrives, in degrees. */
  elevationDeg: number;
  /** Angle between the ray and the vertical where it meets the layer, in degrees. */
  incidenceDeg: number;
  /** 1 / cos(incidence): how far above the vertical critical frequency a path of this shape reaches. */
  secant: number;
}

/**
 * One hop between two points `distanceKm` apart over a curved Earth, mirrored at
 * `virtualHeightKm` above the middle of the path. This is the textbook triangle: with θ
 * half the angle the path spans at the Earth's centre, the elevation is
 * atan((cos θ − R/(R + h)) / sin θ), and the ray meets the layer at the angle whose sine
 * is R·cos(elevation) / (R + h). Geometry only: the Earth's magnetic field, the layer's
 * thickness and absorption are not in it.
 */
export function steepPathGeometry(distanceKm: number, virtualHeightKm: number): SteepPathGeometry {
  const ratio = EARTH_RADIUS_KM / (EARTH_RADIUS_KM + virtualHeightKm);
  const half = Math.max(distanceKm, 0.001) / (2 * EARTH_RADIUS_KM);
  const elevation = Math.atan((Math.cos(half) - ratio) / Math.sin(half));
  const incidence = Math.asin(Math.min(1, ratio * Math.cos(elevation)));
  return {
    elevationDeg: (elevation * 180) / Math.PI,
    incidenceDeg: (incidence * 180) / Math.PI,
    secant: 1 / Math.cos(incidence),
  };
}

/**
 * The secant law: a layer whose critical frequency (the highest it returns straight
 * down) is `criticalMhz` returns a ray meeting it at `incidenceDeg` from the vertical
 * up to `criticalMhz` / cos(incidence). A first check of whether a path can work at
 * all, and no more than that.
 */
export function secantLawMhz(criticalMhz: number, incidenceDeg: number): number {
  return criticalMhz / Math.cos((incidenceDeg * Math.PI) / 180);
}

// ── Profiles ────────────────────────────────────────────────────────────────

export interface RadioProfile {
  id: string;
  name: string;
  model: string;
  /** Transmitter output power in watts. */
  powerWatts: number;
  /** The range the radio transmits over, in MHz. */
  minMhz: number;
  maxMhz: number;
  modes: ModeId[];
  /** Anything worth recording about the receiver. It is not used in a prediction. */
  receiver: string;
  notes: string;
  createdAt: number;
  updatedAt: number;
}

export type RadioProfileInput = Omit<RadioProfile, "id" | "createdAt" | "updatedAt">;

/**
 * How an antenna is modelled. Each is one of VOACAP's own antenna models; what a person
 * actually has is always an approximation to it.
 *
 * - `isotropic`: the same gain in every direction, the figure given.
 * - `horizontal-dipole`: VOACAP's horizontal half-wave dipole over ground (type 23).
 * - `inverted-v`, `end-fed-half-wave`: VOACAP has no model of either. Both are run as
 *   the horizontal half-wave dipole at the height given, and say so wherever shown.
 * - `vertical-monopole`: VOACAP's quarter-wave vertical over ground (type 22).
 */
export type AntennaKind = "isotropic" | "horizontal-dipole" | "inverted-v" | "end-fed-half-wave" | "vertical-monopole";

export type GroundKind = "poor" | "average" | "good" | "sea";

export interface GroundSetting {
  id: GroundKind;
  label: string;
  /** Relative dielectric constant. */
  dielectric: number;
  /** Conductivity in siemens per metre. */
  conductivity: number;
}

/**
 * Ground constants handed to the antenna model. "Poor" is the pair VOACAP's own sample
 * antenna files use (4 and 0.001 S/m) and "good" the pair its curtain-array samples use
 * (10 and 0.01 S/m); "average" (15, 0.005) and "sea" (80, 5) are the usual textbook
 * pairs and lie inside the ranges VOACAP's files state (1 to 80, 0.00003 to 5 S/m).
 * They are assumptions about the ground under the antenna, not measurements of it.
 */
export const GROUNDS: readonly GroundSetting[] = [
  { id: "poor", label: "Poor (dry, rocky, built-up)", dielectric: 4, conductivity: 0.001 },
  { id: "average", label: "Average", dielectric: 15, conductivity: 0.005 },
  { id: "good", label: "Good (damp, farmland)", dielectric: 10, conductivity: 0.01 },
  { id: "sea", label: "Sea water", dielectric: 80, conductivity: 5 },
];

export const groundSetting = (id: GroundKind): GroundSetting => GROUNDS.find((item) => item.id === id) ?? GROUNDS[1]!;

/** An antenna as a prediction uses it. A saved profile is this with a name. */
export interface AntennaSpec {
  kind: AntennaKind;
  /** Height above ground in metres: of the wire for a horizontal antenna, of the feed point's ground for a vertical (ignored). */
  heightM: number;
  ground: GroundKind;
  /**
   * For a horizontal antenna, the compass bearing its broadside faces, in degrees; null
   * to turn it broadside to the other station. Ignored for the others.
   */
  broadsideDeg: number | null;
  /** Gain of an isotropic antenna, or gain added to a modelled one (a negative figure for a compromise antenna), in dB. */
  gainDb: number;
  /** Loss in the feedline, in dB, taken off the gain. */
  feedlineLossDb: number;
}

export interface AntennaProfile extends AntennaSpec {
  id: string;
  name: string;
  /** The range the antenna is used over, in MHz. */
  minMhz: number;
  maxMhz: number;
  notes: string;
  createdAt: number;
  updatedAt: number;
}

export type AntennaProfileInput = Omit<AntennaProfile, "id" | "createdAt" | "updatedAt">;

export interface AntennaPreset {
  id: string;
  name: string;
  spec: AntennaSpec;
  /** How it is modelled and what that leaves out, shown wherever the preset is offered. */
  modelledAs: string;
}

const DIPOLE_NOTE =
  "Run as VOACAP's horizontal half-wave dipole over ground at this height, resonant on whichever frequency is asked about. A real antenna cut for one band, bent, sloping or near buildings will differ.";

/** Generic starting points. Two antennas of the same kind do not have the same pattern; these are one model of each kind. */
export const ANTENNA_PRESETS: readonly AntennaPreset[] = [
  {
    id: "low-dipole",
    name: "Low horizontal dipole, 5 m",
    spec: { kind: "horizontal-dipole", heightM: 5, ground: "average", broadsideDeg: null, gainDb: 0, feedlineLossDb: 0 },
    modelledAs: DIPOLE_NOTE,
  },
  {
    id: "dipole-10m",
    name: "Horizontal dipole, 10 m",
    spec: { kind: "horizontal-dipole", heightM: 10, ground: "average", broadsideDeg: null, gainDb: 0, feedlineLossDb: 0 },
    modelledAs: DIPOLE_NOTE,
  },
  {
    id: "inverted-v",
    name: "Inverted-V, mean wire height 6 m",
    spec: { kind: "inverted-v", heightM: 6, ground: "average", broadsideDeg: null, gainDb: 0, feedlineLossDb: 0 },
    modelledAs:
      "VOACAP has no inverted-V. It is run as a horizontal half-wave dipole at the height you give, so give the mean height of the wire, not the apex. An approximation: a real inverted-V radiates a little less upwards and more off its ends.",
  },
  {
    id: "efhw",
    name: "End-fed half-wave, horizontal at 6 m",
    spec: { kind: "end-fed-half-wave", heightM: 6, ground: "average", broadsideDeg: null, gainDb: 0, feedlineLossDb: 0 },
    modelledAs:
      "VOACAP has no end-fed model. A half-wave wire carries much the same current wherever it is fed, so it is run as a horizontal half-wave dipole at the wire's height. An approximation: a sloping wire, operation on harmonics and the matching unit's loss are not in it.",
  },
  {
    id: "vertical",
    name: "Quarter-wave vertical",
    spec: { kind: "vertical-monopole", heightM: 0, ground: "average", broadsideDeg: null, gainDb: 0, feedlineLossDb: 0 },
    modelledAs:
      "Run as VOACAP's quarter-wave vertical over ground, resonant on whichever frequency is asked about. A short or loaded vertical, or one with few radials, is weaker than this; take the difference off as gain.",
  },
  {
    id: "isotropic",
    name: "Isotropic (no pattern), 0 dBi",
    spec: { kind: "isotropic", heightM: 0, ground: "average", broadsideDeg: null, gainDb: 0, feedlineLossDb: 0 },
    modelledAs: "The same gain in every direction. Not a real antenna: useful for comparing with other tools.",
  },
];

/** One line saying how an antenna of this kind is modelled. */
export function antennaModelLabel(kind: AntennaKind): string {
  switch (kind) {
    case "isotropic":
      return "Isotropic";
    case "horizontal-dipole":
      return "Horizontal half-wave dipole (VOACAP type 23)";
    case "inverted-v":
      return "Inverted-V, run as a horizontal half-wave dipole (approximation)";
    case "end-fed-half-wave":
      return "End-fed half-wave, run as a horizontal half-wave dipole (approximation)";
    case "vertical-monopole":
      return "Quarter-wave vertical (VOACAP type 22)";
  }
}

export const isApproximatedAntenna = (kind: AntennaKind): boolean => kind === "inverted-v" || kind === "end-fed-half-wave";

// ── A prediction ────────────────────────────────────────────────────────────

export interface PropagationSite {
  name: string;
  lat: number;
  lon: number;
}

/**
 * Where the sunspot number that drives the prediction comes from.
 *
 * - `table`: the smoothed sunspot number predicted for the month, from the solar cycle
 *   table installed (shipped with Outpost, or a newer one the person downloaded).
 * - `manual`: a sunspot number the person typed.
 * - `fof2`: a critical frequency (foF2) the person measured or read off an ionosonde,
 *   with the hour it was for. Outpost finds the sunspot number at which the engine's
 *   own map gives that foF2 over the middle of the path at that hour, and runs with it.
 */
export type SolarInput = { source: "table" } | { source: "manual"; ssn: number } | { source: "fof2"; fof2Mhz: number; utcHour: number };

export interface PredictionRequest {
  tx: PropagationSite;
  rx: PropagationSite;
  /** The day planned for, as YYYY-MM-DD (UTC). The model works by month; see `PredictionBasis`. */
  date: string;
  powerWatts: number;
  txAntenna: AntennaSpec;
  rxAntenna: AntennaSpec;
  /** Man-made noise where the receiver is. */
  noise: NoiseEnvironment;
  /** The frequency asked about, in MHz. */
  frequencyMhz: number;
  mode: ModeId;
  /** The figures for the mode asked about, when the person has changed them or the mode has none. */
  requiredSnrDb?: number;
  referenceBandwidthHz?: number;
  solar: SolarInput;
  /**
   * The other station's transmitter and the noise where the first station listens, for
   * the reply: a contact needs the path to work both ways. Left out, only reception at
   * the receiver is predicted.
   */
  reply?: { powerWatts: number; noise: NoiseEnvironment };
}

/** One frequency at one hour, as the engine gives it. */
export interface PredictionCell {
  mhz: number;
  /** "1F2": hops and the layer that returns the signal. Null when the engine found no mode. */
  path: string | null;
  hops: number;
  layer: string;
  /** Angle above the horizon at which the signal leaves, in degrees. */
  takeoffDeg: number;
  /** Virtual height of the reflection, km. */
  virtualHeightKm: number;
  /** Share of the days of the month on which the path's MUF is above this frequency, 0 to 1. */
  mufDays: number;
  /** Median field strength at the receiver, dB above 1 µV/m. */
  fieldDbuV: number;
  /** Median signal power at the receiver, dBW. */
  signalDbw: number;
  /** Median noise power at the receiver in 1 Hz, dBW. */
  noiseDbwHz: number;
  /** Median signal-to-noise ratio in 1 Hz, dB. */
  snrDbHz: number;
  /** How far below and above the median the ratio lies on the worst and best tenth of days, dB. */
  snrLowDb: number;
  snrUpDb: number;
  /** Share of the days of the month on which the ratio reaches what the mode needs, 0 to 1. */
  reliability: number;
  /** Antenna gain at the take-off angle at each end, dBi. */
  txGainDbi: number;
  rxGainDbi: number;
  /** Total loss from transmitter to receiver, dB. */
  lossDb: number;
}

/** The ionosphere over the middle of the path at one hour, from the engine's maps. */
export interface IonosphereHour {
  /** Critical frequencies in MHz. foF1 is 0 when there is no F1 layer. */
  foF2: number;
  foE: number;
  foF1: number;
  /** Height of the F2 layer's peak and its virtual height, km. */
  hmF2: number;
  virtualHeightF2Km: number;
  m3000: number;
  /** Angle of the Sun from overhead, degrees: above 90 it is below the horizon. */
  sunZenithDeg: number;
}

export interface PredictionHour {
  /** The hour UTC the figures are for, 1 to 24 (24 is midnight at the end of the day). */
  utc: number;
  /** Local mean time at the middle of the path, in hours. */
  localTime: number;
  /** The frequency below which the path is open on half the days of the month, MHz. */
  mufMhz: number;
  /** Open on nine days in ten (the "optimum working frequency"), MHz. */
  fotMhz: number;
  /** Open on one day in ten, MHz. */
  hpfMhz: number;
  /**
   * The lowest frequency of the sweep on which the mode asked about reaches 90%
   * reliability at this hour (the engine's own definition of the LUF, over Outpost's
   * sweep), or null when none does.
   */
  lufMhz: number | null;
  ionosphere: IonosphereHour;
  /** The frequency asked about. */
  asked: PredictionCell;
  /** Each amateur band, in the order of `HF_BANDS`. */
  bands: PredictionCell[];
  /** Reliability at every frequency of `PredictionResult.sweepMhz`, 0 to 1. */
  sweepReliability: number[];
  /** Median signal-to-noise ratio in 1 Hz at every frequency of the sweep, dB. */
  sweepSnrDbHz: number[];
  /** Reliability of the frequency asked about for every mode of `PredictionResult.modes`, 0 to 1; null for a mode with no figure. */
  modeReliability: Array<number | null>;
  /** The reply on the frequency asked about, when `PredictionRequest.reply` was given: the receiver transmitting back. */
  reply: { reliability: number; snrDbHz: number } | null;
}

/** What kind of knowledge the sunspot number behind a prediction is. Never "live conditions". */
export type BasisKind = "climatology" | "recent-solar" | "own-measurement";

export interface PredictionBasis {
  kind: BasisKind;
  /** The smoothed sunspot number the engine ran with. */
  ssn: number;
  /** One sentence saying where the number came from, with dates. */
  summary: string;
  /** The date of the solar table used, when one was, as YYYY-MM-DD. */
  tableDate: string | null;
  /** How old that table was when the prediction was made, in days. */
  tableAgeDays: number | null;
  /** The table's low and high figures for the month, when it gives them. */
  ssnLow: number | null;
  ssnHigh: number | null;
}

export interface ModeLine {
  id: ModeId;
  label: string;
  /** What the mode is taken to need, in its own bandwidth and restated in 1 Hz. Null when no figure is known. */
  requiredSnrDb: number | null;
  referenceBandwidthHz: number;
  requiredSnrDbHz: number | null;
  source: string;
}

export interface EngineDescription {
  id: string;
  /** "VOACAP" */
  name: string;
  /** The model and its version as the engine states it. */
  model: string;
  /** The program that implements it here, and its version. */
  implementation: string;
  licence: string;
  /** Checksum of the engine file in use. */
  sha256: string;
  /** What this engine can and cannot give, so that a screen never shows a blank it cannot fill. */
  gives: { reliability: boolean; luf: boolean; ionosphere: boolean; measuredFoF2: boolean; coverage: boolean };
  minMhz: number;
  maxMhz: number;
}

export interface PredictionResult {
  /** A name for this exact question to this exact engine and data: the cache key. */
  key: string;
  request: PredictionRequest;
  computedAt: number;
  /** True when this answer was found already worked out rather than run again. */
  cached: boolean;
  engine: EngineDescription;
  /** Versions of the data the answer rests on. */
  datasets: Array<{ id: string; version: string }>;
  basis: PredictionBasis;
  path: {
    distanceKm: number;
    /** Bearing from the transmitter to the receiver and back, degrees from true north. */
    bearingDeg: number;
    backBearingDeg: number;
    midpoint: { lat: number; lon: number };
    txLocator: string;
    rxLocator: string;
  };
  mode: ModeLine;
  modes: ModeLine[];
  /** The frequencies of the heat map, MHz. */
  sweepMhz: number[];
  /** Twenty-four hours, 01:00 to 24:00 UTC. */
  hours: PredictionHour[];
  /** How each end's antenna was run, in words. */
  antennas: { tx: string; rx: string };
  /** The card deck the engine was given for the frequency asked about: what the original program would be fed to ask the same question. */
  deck: string;
  /** Things a reader must know before relying on the figures. */
  limits: string[];
}

/** The bands of one hour, best first: by reliability, then by signal-to-noise ratio. */
export function rankBands(hour: PredictionHour): Array<{ band: HfBand; cell: PredictionCell }> {
  return HF_BANDS.map((band, index) => ({ band, cell: hour.bands[index]! }))
    .filter((item) => item.cell !== undefined)
    .sort((a, b) => b.cell.reliability - a.cell.reliability || b.cell.snrDbHz - a.cell.snrDbHz);
}

/** "07:00" for hour 7, "24:00" for the last hour of the day. */
export const utcLabel = (hour: number): string => `${String(hour).padStart(2, "0")}:00`;

/** `POST /api/radio/propagation/compare`: the same circuit with one thing changed at a time. */
export type CompareWhat = "seasons" | "sunspots" | "power" | "antennas" | "noise";

export const COMPARISONS: ReadonlyArray<{ id: CompareWhat; label: string; reading: string }> = [
  { id: "seasons", label: "Months of the year", reading: "The same path in each month, all at the sunspot number of the month asked about, so that only the season changes." },
  { id: "sunspots", label: "Solar activity (foF2)", reading: "The same path at other sunspot numbers. More sunspots raise foF2, the highest frequency the ionosphere returns straight down." },
  { id: "power", label: "Transmitter power", reading: "The same path at other powers." },
  { id: "antennas", label: "Transmitting antenna", reading: "The same path with each generic antenna at the transmitter." },
  { id: "noise", label: "Noise at the receiver", reading: "The same path with the receiver in each kind of place." },
];

export interface CompareRequest {
  base: PredictionRequest;
  what: CompareWhat;
}

export interface CompareSeries {
  label: string;
  /** What was changed, in words. */
  detail: string;
  ssn: number;
  /** Per hour, 01:00 to 24:00 UTC, for the frequency asked about. */
  reliability: number[];
  snrDbHz: number[];
  mufMhz: number[];
  foF2: number[];
}

export interface CompareResult {
  what: CompareWhat;
  frequencyMhz: number;
  mode: ModeLine;
  series: CompareSeries[];
  engine: EngineDescription;
  basis: PredictionBasis;
}

// ── Engines and data ────────────────────────────────────────────────────────

export interface EngineStatus extends EngineDescription {
  /** False when the engine or the data it must have is missing or damaged. */
  ready: boolean;
  /** Why not, for a person. */
  problem: string | null;
  /** Used by default. */
  selected: boolean;
}

export type DatasetKind = "required" | "optional";

export interface PropagationDataset {
  id: string;
  title: string;
  description: string;
  kind: DatasetKind;
  /** "Included with Outpost", or where a downloaded copy is kept. */
  where: string;
  installed: boolean;
  version: string | null;
  /** The date the data itself is of, YYYY-MM-DD, when it has one. */
  dataDate: string | null;
  bytes: number | null;
  files: number | null;
  /** True when every file matched its recorded checksum the last time they were read. */
  verified: boolean | null;
  /** Checksum of the dataset's manifest or single file. */
  sha256: string | null;
  licence: string;
  source: string;
  /** True when a newer copy can be fetched through the download manager. */
  downloadable: boolean;
  /** Set when a newer copy than the included one is installed, or the other way round. */
  note: string | null;
}

/** `GET /api/radio/propagation/datasets` */
export interface PropagationDatasets {
  datasets: PropagationDataset[];
  /** Data that was looked at and is not offered, with the reason. */
  notOffered: Array<{ title: string; reason: string }>;
  /** The solar table in use, month by month. */
  solar: { dataDate: string; origin: "included" | "downloaded"; ageDays: number; months: SolarMonth[] };
}

export interface SolarMonth {
  /** "2026-11" */
  month: string;
  ssn: number;
  low: number | null;
  high: number | null;
}

// ── Saved predictions ───────────────────────────────────────────────────────

export interface SavedPrediction {
  id: string;
  name: string;
  request: PredictionRequest;
  /** The key of the answer it was saved with. */
  key: string;
  noteId: string | null;
  createdAt: number;
  updatedAt: number;
}
