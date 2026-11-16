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
 */
import { type AntennaSpec, antennaModelLabel, groundSetting } from "@outpost/shared";

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
export const hasAzimuthPattern = (spec: AntennaSpec): boolean => spec.kind !== "isotropic" && spec.kind !== "vertical-monopole";

/** How an antenna was run, in one sentence for the result. */
export function describeAntenna(spec: AntennaSpec, beamDeg: number): string {
  const gain = netGainDb(spec);
  const adjust = gain === 0 ? "" : `, ${gain > 0 ? "plus" : "less"} ${Math.abs(gain).toFixed(1)} dB`;
  const ground = groundSetting(spec.ground);
  switch (spec.kind) {
    case "isotropic":
      return `Isotropic, ${gain.toFixed(1)} dBi in every direction`;
    case "vertical-monopole":
      return `${antennaModelLabel(spec.kind)} over ${ground.label.toLowerCase()} ground${adjust}`;
    default:
      return `${antennaModelLabel(spec.kind)}, ${spec.heightM} m above ${ground.label.toLowerCase()} ground, broadside towards ${Math.round(beamDeg)}°${spec.broadsideDeg === null ? " (the other station)" : ""}${adjust}`;
  }
}
