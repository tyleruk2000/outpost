/**
 * An antenna as VOACAP reads one: a short text file naming one of its antenna models
 * and that model's parameters. Outpost writes one per end of the path and hands it to
 * the engine; nothing about the pattern is worked out here.
 *
 * The layouts are those of the sample files in the VOACAP distribution
 * (`antennas/samples/sample.22`, `sample.23`, and `default/const17.voa`). What each
 * parameter does was checked against the engine, not assumed (see
 * `test/propagation-engine.test.ts`): a positive height is metres and a negative one
 * wavelengths, the "operating frequency" line is ignored (a length in wavelengths
 * follows whichever frequency is being worked out), and "gain above dipole" moves the
 * whole pattern by that many decibels.
 *
 * A wire of a stated length is written with its length in metres, a positive figure.
 * Checked against the engine in the same tests:
 *
 * - Type 22 (the vertical monopole) takes any height. In metres it gives what the same
 *   height in wavelengths gives at each frequency, and the pattern changes with height
 *   as a wire fed at the bottom should (the lobe lowers out to 5/8 of a wavelength and
 *   splits beyond). Below 0.35 wavelengths the engine takes off a loss for being short.
 *   That is the antenna a vertical end-fed wire is, so it is written on every frequency.
 * - Type 23 (the horizontal dipole) takes a length in metres too, and within a few
 *   hundredths of a wavelength of a half-wave gives what `-.50` gives. Away from a
 *   half-wave it is no model of an end-fed wire: it is fed at its centre, and it refers
 *   its gain to the current at that feed point, so a wire a whole wavelength long reads
 *   some 17 dB below a half-wave broadside, where an end-fed wire of that length has a
 *   null. So the file is written, and `engine.ts` gives no figure for a frequency on
 *   which the wire is not about a half-wave (`wireOn` in `@outpost/shared`).
 *
 * Type 41 (the ITS-78 "sloping long wire", `sample.41`) was looked at for the horizontal
 * wire and is not used: see docs/hf-propagation.md, "Equipment".
 */
import { type AntennaSpec, antennaModelLabel, groundSetting, halfWaveRangeMhz, isHorizontalAntenna } from "@outpost/shared";

/** A number in a column of the given width, as the sample files write them. */
function field(value: number, width: number, decimals: number): string {
  return value.toFixed(decimals).padStart(width);
}

/** What the person's gain and feedline figures add up to, in dB. */
export const netGainDb = (spec: AntennaSpec): number => spec.gainDb - spec.feedlineLossDb;

function groundLines(spec: AntennaSpec): string[] {
  const ground = groundSetting(spec.ground);
  return [`${field(ground.dielectric, 4, 0)}    [ 3] Dielectric....:`, `${field(ground.conductivity, 6, 5)}  [ 4] Conductivity..:`];
}

/** The length of a wire of a stated length, in metres. The routes check that it is there; this guards the file. */
function wireLength(spec: AntennaSpec): number {
  if (spec.lengthM === undefined || !(spec.lengthM > 0)) throw new Error("An end-fed wire of a stated length was asked for without its length.");
  return spec.lengthM;
}

/** The text of the antenna file for one end. */
export function antennaFile(spec: AntennaSpec): string {
  const gain = netGainDb(spec);
  switch (spec.kind) {
    case "isotropic": {
      // A table of gain against elevation angle (type 11) that is flat: the same gain,
      // the figure on the first line, at every one of its 91 angles.
      const rows: string[] = [];
      for (let row = 0; row < 10; row++) rows.push(Array.from({ length: row === 9 ? 1 : 10 }, () => field(0, 8, 1)).join(""));
      return [
        "Constant gain (Outpost)",
        " 3     3 parameters",
        `${field(gain, 6, 2)}  [ 1] Max Gain dBi..:`,
        "  11    [ 2] Antenna Type..: 91 values gain in elevation angle follows",
        "  0.0   [ 3] Efficiency (for IONCAP)",
        ...rows,
        "",
      ].join("\n");
    }
    case "end-fed-vertical":
      return [
        "End-fed wire, vertical (Outpost)",
        " 7     7 parameters",
        "  0.00  [ 1] Max Gain dBi..:",
        "  22    [ 2] Antenna Type..:",
        ...groundLines(spec),
        "10.000  [ 5] Operating Freq:",
        `${field(wireLength(spec), 6, 2)}  [ 6] Antenna Height:`,
        `${field(gain, 6, 1)}  [ 7] Gain ab dipole:`,
        "",
      ].join("\n");
    case "end-fed-horizontal":
      return [
        "End-fed wire, horizontal (Outpost)",
        " 8     8 parameters",
        "  0.00  [ 1] Max Gain dBi..:",
        "  23    [ 2] Antenna Type..:",
        ...groundLines(spec),
        "10.000  [ 5] Operating Freq:",
        `${field(wireLength(spec), 6, 2)}  [ 6] Antenna Length:`,
        `${field(spec.heightM, 6, 2)}  [ 7] Antenna Height:`,
        `${field(gain, 6, 1)}  [ 8] Gain ab dipole:`,
        "",
      ].join("\n");
    case "vertical-monopole":
      return [
        "Quarter-wave vertical (Outpost)",
        " 7     7 parameters",
        "  0.00  [ 1] Max Gain dBi..:",
        "  22    [ 2] Antenna Type..:",
        ...groundLines(spec),
        "10.000  [ 5] Operating Freq:",
        "  -.25  [ 6] Antenna Height:",
        `${field(gain, 6, 1)}  [ 7] Gain ab dipole:`,
        "",
      ].join("\n");
    default:
      // The horizontal half-wave dipole, which also stands in for an inverted-V and an
      // end-fed half-wave (the label says so).
      return [
        "Horizontal half-wave dipole (Outpost)",
        " 8     8 parameters",
        "  0.00  [ 1] Max Gain dBi..:",
        "  23    [ 2] Antenna Type..:",
        ...groundLines(spec),
        "10.000  [ 5] Operating Freq:",
        "  -.50  [ 6] Antenna Length:",
        `${field(spec.heightM, 6, 2)}  [ 7] Antenna Height:`,
        `${field(gain, 6, 1)}  [ 8] Gain ab dipole:`,
        "",
      ].join("\n");
  }
}

/** Whether the antenna's gain depends on compass direction, so that where it points matters. */
export const hasAzimuthPattern = (spec: AntennaSpec): boolean => isHorizontalAntenna(spec.kind);

const MATCHING_UNIT = "The matching unit's loss is not modelled.";

/** How an antenna was run, in one sentence for the result. */
export function describeAntenna(spec: AntennaSpec, beamDeg: number): string {
  const gain = netGainDb(spec);
  const adjust = gain === 0 ? "" : `, ${gain > 0 ? "plus" : "less"} ${Math.abs(gain).toFixed(1)} dB`;
  const ground = groundSetting(spec.ground);
  const facing = `broadside towards ${Math.round(beamDeg)}°${spec.broadsideDeg === null ? " (the other station)" : ""}`;
  switch (spec.kind) {
    case "isotropic":
      return `Isotropic, ${gain.toFixed(1)} dBi in every direction`;
    case "vertical-monopole":
      return `${antennaModelLabel(spec.kind)} over ${ground.label.toLowerCase()} ground${adjust}`;
    case "end-fed-vertical":
      return `End-fed wire ${wireLength(spec)} m long, vertical with its bottom end at the ground, over ${ground.label.toLowerCase()} ground${adjust}. Run as VOACAP's vertical monopole (type 22) ${wireLength(spec)} m high on every frequency; off its half-wave frequencies the figures are for a wire that is not a half-wave. ${MATCHING_UNIT}`;
    case "end-fed-horizontal": {
      const { fromMhz, toMhz } = halfWaveRangeMhz(wireLength(spec));
      return `End-fed wire ${wireLength(spec)} m long, horizontal, ${spec.heightM} m above ${ground.label.toLowerCase()} ground, ${facing}${adjust}. Run as VOACAP's horizontal dipole (type 23) of that length from ${fromMhz.toFixed(1)} to ${toMhz.toFixed(1)} MHz, where the wire is about a half-wave; no figure is given on other frequencies. ${MATCHING_UNIT}`;
    }
    default:
      return `${antennaModelLabel(spec.kind)}, ${spec.heightM} m above ${ground.label.toLowerCase()} ground, ${facing}${adjust}`;
  }
}
