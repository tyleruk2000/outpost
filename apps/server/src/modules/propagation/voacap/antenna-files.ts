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
 *   null. So it is written only where the wire is about a half-wave.
 * - Type 41 (the ITS-78 "sloping long wire", `sample.41`) is written for a level wire
 *   longer than a half-wave: slope 0, the wire's length, and its height as the feed
 *   height. Its current is that of a wire fed at one end, and laid level its pattern is
 *   the same whichever end the feed is at; its reference direction is along the wire.
 *   Its gain is worked out against the wire as a monopole over perfect ground, so it
 *   reads about 1.3 dB below type 23 at a half-wave, and its figures are labelled
 *   approximate. Two things differ from the other files, both checked against the
 *   engine in `test/propagation-wire.test.ts`:
 *   - The length and height are written in wavelengths at the one frequency the file is
 *     for. The engine keeps a pattern for each whole megahertz and reads between them;
 *     for a long wire a length in metres is a different number of wavelengths at each
 *     whole megahertz, and reading between two such patterns is not the pattern of the
 *     wire (seen: up to 12 dB apart for 82 m of wire). So each frequency gets its own file.
 *   - The file has no "gain above dipole" line. The gain added and feedline loss are
 *     applied by `engine.ts` instead, by lowering the requirement and raising the ratio
 *     and signal by the same figure, which the engine shows gives what that line gives.
 * - A level wire shorter than a half-wave is given no figure (`wireOn`); type 23 is
 *   written for it, and `engine.ts` throws the answer away.
 *
 * See docs/hf-propagation.md, "Equipment".
 */
import {
  type AntennaSpec,
  antennaModelLabel,
  antennaRunOn,
  groundSetting,
  HF_MIN_MHZ,
  halfWaveRangeMhz,
  hfWavelengthMeters,
  isHorizontalAntenna,
  longWireRangeMhz,
} from "@outpost/shared";

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
  if (spec.lengthM === undefined || !(spec.lengthM > 0))
    throw new Error("An end-fed wire of a stated length was asked for without its length.");
  return spec.lengthM;
}

/** Whether an antenna is run as the sloping long wire laid level at this frequency: an approximation, with a file of its own. */
export const runsAsLongWire = (spec: AntennaSpec, mhz: number): boolean => antennaRunOn(spec, mhz) === "approximate";

/**
 * The text of the antenna file for one end. `mhz` is the frequency the file is for: it
 * matters only for a level wire longer than a half-wave there, whose file holds that
 * frequency's wavelengths; every other file serves every frequency.
 */
export function antennaFile(spec: AntennaSpec, mhz?: number): string {
  const gain = netGainDb(spec);
  if (mhz !== undefined && runsAsLongWire(spec, mhz)) {
    const wavelength = hfWavelengthMeters(mhz);
    return [
      "End-fed wire, horizontal, longer than a half-wave (Outpost)",
      " 8     8 parameters",
      "  0.00  [ 1] Max Gain dBi..:",
      "  41    [ 2] Antenna Type..:",
      ...groundLines(spec),
      "10.000  [ 5] Operating Freq:",
      "  0.00  [ 6] Slope from Hor:",
      // Negative: wavelengths, at this file's one frequency.
      `${field(-wireLength(spec) / wavelength, 6, 3)}  [ 7] Wire Length   :`,
      `${field(-spec.heightM / wavelength, 6, 3)}  [ 8] Feed Height   :`,
      "",
    ].join("\n");
  }
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
      const length = wireLength(spec);
      const { fromMhz, toMhz } = halfWaveRangeMhz(length);
      const long = longWireRangeMhz(length);
      const line = Math.round((beamDeg + 90) % 180);
      const longer = long
        ? ` Above ${long.fromMhz.toFixed(1)} MHz, where it is longer, approximate: run as VOACAP's sloping long wire (type 41) laid level, the wire running ${line}° to ${line + 180}°, whose level is unchecked and reads about 1.3 dB below the dipole model at a half-wave.`
        : "";
      const shorter =
        fromMhz > HF_MIN_MHZ ? ` Below ${fromMhz.toFixed(1)} MHz, where it is shorter, not modelled: no figure is given.` : "";
      return `End-fed wire ${length} m long, horizontal, ${spec.heightM} m above ${ground.label.toLowerCase()} ground, ${facing}${adjust}. Run as VOACAP's horizontal dipole (type 23) of that length from ${fromMhz.toFixed(1)} to ${toMhz.toFixed(1)} MHz, where the wire is about a half-wave.${longer}${shorter} ${MATCHING_UNIT}`;
    }
    default:
      return `${antennaModelLabel(spec.kind)}, ${spec.heightM} m above ${ground.label.toLowerCase()} ground, ${facing}${adjust}`;
  }
}
