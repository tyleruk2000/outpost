/**
 * One pass on paper, to take outside with a handheld and a compass: when it rises, peaks
 * and sets (UTC and local), where to point minute by minute, what to tune to through it
 * for each published transmitter, and how old the elements were. Set with the same blocks
 * as a communication plan, and made on this device.
 */
import { compassPoint, elementsAgeWarning, type SatelliteTransmitter } from "@outpost/shared";
import { writePdfPages } from "@/features/maps/print/pdf";
import { type Block, toSheets } from "@/features/propagation/plans/document";
import { formatDate } from "@/lib/utils";
import { dopplerTuning, type SatellitePass, type SatelliteState } from "./engine";
import { bothTimes, frequencyWords, pathWords, utcTime } from "./words";

export interface PassSheet {
  name: string;
  noradId: number;
  epoch: number;
  place: string;
  pass: SatellitePass;
  /** Look angles through the pass, about one a minute. */
  path: SatelliteState[];
  transmitters: SatelliteTransmitter[];
  written: Date;
  licensed: boolean;
}

export const passTitle = (sheet: Pick<PassSheet, "name" | "pass">) =>
  `Satellite pass, ${sheet.name}, ${formatDate(sheet.pass.aos.getTime())} ${utcTime(sheet.pass.aos)} UTC`;

export function passBlocks(sheet: PassSheet): Block[] {
  const { pass, path } = sheet;
  const warning = elementsAgeWarning(sheet.epoch, sheet.written.getTime());
  const blocks: Block[] = [
    { kind: "title", text: `${sheet.name}: pass on ${formatDate(pass.aos.getTime())}` },
    {
      kind: "para",
      text: `Seen from ${sheet.place}. Rises ${bothTimes(pass.aos)}, highest ${bothTimes(pass.tca)}, sets ${bothTimes(pass.los)}: ${Math.round(pass.durationSeconds / 60)} minutes. ${pathWords(pass)}.`,
    },
    {
      kind: "para",
      text: `Worked out on this device with SGP4 from CelesTrak's elements for NORAD ${sheet.noradId}, dated ${formatDate(sheet.epoch)} ${utcTime(sheet.epoch)} UTC.${warning ? ` ${warning}` : ""} A wrong clock makes every time here wrong.`,
    },
    { kind: "heading", text: "Where to point" },
    {
      kind: "table",
      head: ["UTC", "Bearing", "Elevation", "Distance"],
      right: [1, 2, 3],
      rows: path.map((point) => [
        utcTime(point.at),
        `${Math.round(point.azimuthDeg)}° ${compassPoint(point.azimuthDeg)}`,
        `${Math.max(0, Math.round(point.elevationDeg))}°`,
        `${Math.round(point.rangeKm).toLocaleString("en-GB")} km`,
      ]),
    },
  ];
  const marks = [
    path[0],
    path.reduce((best, point) => (point.elevationDeg > best.elevationDeg ? point : best), path[0]!),
    path.at(-1),
  ].filter((point): point is SatelliteState => Boolean(point));
  for (const transmitter of sheet.transmitters) {
    const down = transmitter.downlinkLowHz;
    const up = transmitter.uplinkLowHz;
    blocks.push({ kind: "heading", text: `${transmitter.description}${transmitter.mode ? `, ${transmitter.mode}` : ""}` });
    blocks.push({
      kind: "table",
      head: ["", "UTC", ...(down ? ["Listen on"] : []), ...(up ? [sheet.licensed ? "Send on" : "Uplink (licence needed to send)"] : [])],
      rows: marks.map((point, index) => {
        const tuned = dopplerTuning(point.rangeRateKmS, down, up);
        return [
          ["Rise", "Highest", "Set"][index] ?? "",
          utcTime(point.at),
          ...(tuned.downlinkHz ? [frequencyWords(tuned.downlinkHz)] : []),
          ...(tuned.uplinkHz ? [frequencyWords(tuned.uplinkHz)] : []),
        ];
      }),
    });
  }
  blocks.push({
    kind: "para",
    text: "Frequencies and modes from SatNOGS DB (CC BY-SA 4.0); orbital elements from CelesTrak. A transmitter listed as in use may still be off.",
  });
  return blocks;
}

export function passPdf(sheet: PassSheet): Uint8Array {
  return writePdfPages({
    pages: toSheets(passBlocks(sheet), `${sheet.name} · NORAD ${sheet.noradId} · Outpost`),
    title: passTitle(sheet),
    created: sheet.written,
  });
}
