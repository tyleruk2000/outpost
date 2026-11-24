/**
 * One pass on paper, to take outside with a handheld and a compass: when it rises, peaks
 * and sets (UTC and local), where it goes across the sky, how high it stands minute by
 * minute, where to point, the ground beneath it ("Over the ground"), what to tune to
 * through it for each published transmitter (kept with its heading on one page), and
 * how old the elements were. Laid out with the print kit and made on this device.
 */
import { compassPoint, elementsAgeWarning, type SatelliteTransmitter } from "@outpost/shared";
import type { Content, TDocumentDefinitions } from "pdfmake/interfaces";
import {
  PRINT_COLOURS as C,
  callout,
  dataTable,
  figure,
  heading,
  label,
  measureOf,
  note,
  type PrintPaper,
  para,
  printable,
  printDocument,
  steps,
  twoColumns,
} from "@/features/print-kit";
import { formatTimeOfDay } from "@/lib/clock";
import { formatDate } from "@/lib/utils";
import { elevationChart, MOMENT, momentWords, overTheGround, type PassGround, skyPlot } from "./diagrams";
import { dopplerTuning, type SatellitePass, type SatelliteState } from "./engine";
import { overWords, pointAt } from "./ground-track";
import { frequencyWords, geometryWords, pathWords, utcTime } from "./words";

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
  /** The track under the pass, for "Over the ground"; left out with no place to draw it from. */
  ground?: PassGround;
}

export const passTitle = (sheet: Pick<PassSheet, "name" | "pass">) =>
  `Satellite pass, ${sheet.name}, ${formatDate(sheet.pass.aos.getTime())} ${utcTime(sheet.pass.aos)} UTC`;

/** The points the tuning tables are worked at: where it rises, its highest, where it sets. */
function marks(path: SatelliteState[]): SatelliteState[] {
  return [path[0], path.reduce((best, point) => (point.elevationDeg > best.elevationDeg ? point : best), path[0]!), path.at(-1)].filter(
    (point): point is SatelliteState => Boolean(point),
  );
}

/** The three moments in a row: when, where to face, how high. Always up: one, where to point. */
function moments(pass: SatellitePass): Content {
  const cell = (kind: keyof typeof MOMENT, title: string, at: Date, azimuth: number, elevation: number) => ({
    stack: [
      { text: title, bold: true, fontSize: 9, color: MOMENT[kind] },
      { text: `${utcTime(at)} UTC`, bold: true, fontSize: 18, lineHeight: 1 },
      { text: `${formatTimeOfDay(at)} on this device's clock`, fontSize: 7.5, color: C.muted },
      { text: `Face ${Math.round(azimuth)}° ${compassPoint(azimuth)}`, fontSize: 9, margin: [0, 3, 0, 0] },
      { text: `${Math.round(elevation)}° above the horizon`, fontSize: 9 },
    ],
  });
  return {
    table: {
      widths: pass.alwaysUp ? ["*"] : ["*", "*", "*"],
      body: [
        pass.alwaysUp
          ? [
              {
                stack: [
                  { text: "Always up: it does not rise or set", bold: true, fontSize: 9, color: MOMENT.highest },
                  {
                    text: `Face ${Math.round(pass.tcaAzimuthDeg)}° ${compassPoint(pass.tcaAzimuthDeg)}`,
                    bold: true,
                    fontSize: 18,
                    lineHeight: 1,
                  },
                  { text: `${Math.round(pass.maxElevationDeg)}° above the horizon, all day`, fontSize: 9, margin: [0, 3, 0, 0] },
                ],
              },
            ]
          : [
              cell("rise", "Rises", pass.aos, pass.aosAzimuthDeg, 0),
              cell("highest", "Highest", pass.tca, pass.tcaAzimuthDeg, pass.maxElevationDeg),
              cell("set", "Sets", pass.los, pass.losAzimuthDeg, 0),
            ],
      ],
    },
    layout: {
      hLineWidth: () => 0,
      vLineWidth: (index: number) => (index === 1 || index === 2 ? 3 : 0),
      vLineColor: () => C.paper,
      fillColor: () => C.shade,
      paddingLeft: () => 9,
      paddingRight: () => 9,
      paddingTop: () => 7,
      paddingBottom: () => 7,
    },
    margin: [0, 0, 0, 12],
  } as Content;
}

/** The look angles a minute apart; a long list in two halves side by side, to keep the pass on one page. */
function minuteTable(path: SatelliteState[]): Content {
  const table = (rows: SatelliteState[]) =>
    dataTable(
      ["UTC", "Bearing", "Elevation", "Distance"],
      rows.map((point) => [
        `**${utcTime(point.at)}**`,
        `${Math.round(point.azimuthDeg)}° ${compassPoint(point.azimuthDeg)}`,
        `${Math.max(0, Math.round(point.elevationDeg))}°`,
        `${Math.round(point.rangeKm).toLocaleString("en-GB")} km`,
      ]),
      { right: [1, 2, 3], widths: ["*", "*", "*", "*"] },
    );
  if (path.length <= 8) return table(path);
  const half = Math.ceil(path.length / 2);
  return twoColumns([table(path.slice(0, half))], [table(path.slice(half))]);
}

export function passDocument(sheet: PassSheet, paper: PrintPaper): TDocumentDefinitions {
  const { pass, path } = sheet;
  const measure = measureOf(paper);
  const name = printable(sheet.name);
  const warning = elementsAgeWarning(sheet.epoch, sheet.written.getTime());
  const column = (measure - 16) / 2;
  const alwaysUp = pass.alwaysUp === true;
  const content: Content[] = [
    { text: `Satellite pass · NORAD ${sheet.noradId}`, fontSize: 8, bold: true, color: C.accent, characterSpacing: 0.4 },
    { text: name, fontSize: 22, bold: true, margin: [0, 2, 0, 2] },
    {
      text: alwaysUp
        ? `${formatDate(pass.aos.getTime())}, seen from ${printable(sheet.place)}. ${pathWords(pass)}: it does not rise or set.`
        : `${formatDate(pass.aos.getTime())}, seen from ${printable(sheet.place)}. ${Math.round(pass.durationSeconds / 60)} minutes above the horizon. ${pathWords(pass)}.`,
      color: C.muted,
    },
    { canvas: [{ type: "line", x1: 0, y1: 0, x2: measure, y2: 0, lineWidth: 1.6, lineColor: C.accent }], margin: [0, 8, 0, 12] },
    moments(pass),
  ];
  if (alwaysUp)
    content.push(
      twoColumns(
        [
          figure(skyPlot(pass, path, Math.min(236, column)).svg, {
            title: "In the sky",
            width: Math.min(236, column),
            caption: `Seen from below, north at the top: the outer ring is the horizon, the centre straight up. The diamond is where it stays, ${Math.round(pass.maxElevationDeg)}° up in the ${compassPoint(pass.tcaAzimuthDeg)}.`,
          }),
        ],
        [
          steps([
            `Face ${Math.round(pass.tcaAzimuthDeg)}° ${compassPoint(pass.tcaAzimuthDeg)} and tilt up ${Math.round(pass.maxElevationDeg)}°.`,
            "It stays there: an antenna aimed once needs no turning.",
            "Tune as the tables of frequencies say: the Doppler shift is small and hardly moves.",
          ]),
        ],
      ),
      ...(warning ? [callout("warn", "Old elements", para(warning))] : []),
      note("Bearings are from true north, as the elements give them."),
    );
  else
    content.push(
      twoColumns(
        [
          figure(skyPlot(pass, path, Math.min(236, column)).svg, {
            title: "Across the sky",
            width: Math.min(236, column),
            caption: `Seen from below, north at the top: the outer ring is the horizon, the centre straight up. Open circle: rises ${momentWords(pass.aos, pass.aosAzimuthDeg)}. Diamond: highest. Square: sets ${momentWords(pass.los, pass.losAzimuthDeg)}. A dot each minute.`,
          }),
        ],
        [
          figure(elevationChart(pass, path, column).svg, {
            title: "Height above the horizon",
            width: column,
            caption: `${geometryWords(pass.maxElevationDeg)}: ${Math.round(pass.maxElevationDeg)}° at its highest (a high pass reaches 45°, a good one 20°).`,
          }),
          steps([
            `Before ${utcTime(pass.aos)} UTC, face ${compassPoint(pass.aosAzimuthDeg)} and point at the horizon.`,
            "Follow the table below minute by minute: turn to the bearing and tilt up to the elevation.",
            "Retune as the tables of frequencies say: the Doppler shift moves the signal through the pass.",
          ]),
        ],
      ),
      ...(warning ? [callout("warn", "Old elements", para(warning))] : []),
      heading("Where to point, minute by minute"),
      minuteTable(path),
      note("Bearings are from true north, as the elements give them. A wrong clock makes every time here wrong."),
    );
  if (sheet.ground) {
    const ground = overTheGround(pass, sheet.ground, measure);
    const highest = pointAt(sheet.ground.samples, pass.tca.getTime());
    content.push(
      figure(ground.svg, {
        title: "Over the ground",
        width: measure,
        caption: alwaysUp
          ? `The diamond is where it stays${highest ? `, over ${overWords(highest.lat, highest.lon)}` : ""}; night shaded as at ${utcTime(pass.tca)} UTC. House: ${printable(sheet.place)}. Dashed ring: inside it, a satellite at its height is above ${printable(sheet.place)}'s horizon.`
          : `From 45 minutes before it rises to 45 minutes after it sets; night shaded as at its highest, ${utcTime(pass.tca)} UTC${
              highest ? `, when it is over ${overWords(highest.lat, highest.lon)}` : ""
            }. Heavy line: above the horizon at ${printable(sheet.place)}. Open circle: rises. Diamond: highest. Square: sets. House: ${printable(sheet.place)}. Dashed ring: inside it, the satellite is above ${printable(sheet.place)}'s horizon. A small circle each 10 minutes, its time in UTC beside it where there is room.`,
      }),
    );
  }
  const tuning = alwaysUp ? marks(path).slice(1, 2) : marks(path);
  sheet.transmitters.forEach((transmitter, index) => {
    const down = transmitter.downlinkLowHz;
    const up = transmitter.uplinkLowHz;
    // The heading, the transmitter's name and its table on one page: never a heading alone at a page's foot.
    content.push({
      unbreakable: true,
      stack: [
        ...(index === 0 ? [heading("What to tune to")] : []),
        label(printable(`${transmitter.description}${transmitter.mode ? `, ${transmitter.mode}` : ""}`)),
        dataTable(
          [
            "",
            ...(alwaysUp ? [] : ["UTC"]),
            ...(down ? ["Listen on"] : []),
            ...(up ? [sheet.licensed ? "Send on" : "Uplink (licence needed to send)"] : []),
          ],
          tuning.map((point, row) => {
            const tuned = dopplerTuning(point.rangeRateKmS, down, up);
            return [
              `**${alwaysUp ? "All day" : (["Rises", "Highest", "Sets"][row] ?? "")}**`,
              ...(alwaysUp ? [] : [utcTime(point.at)]),
              ...(tuned.downlinkHz ? [frequencyWords(tuned.downlinkHz)] : []),
              ...(tuned.uplinkHz ? [frequencyWords(tuned.uplinkHz)] : []),
            ];
          }),
        ),
      ],
    } as Content);
  });
  if (!sheet.licensed && sheet.transmitters.some((transmitter) => transmitter.uplinkLowHz))
    content.push(
      callout(
        "know",
        "Sending needs a licence",
        para("Sending to a satellite needs an amateur licence: uplinks are listed for reference."),
      ),
    );
  content.push(
    note(
      `Worked out on this device with SGP4 from CelesTrak's elements for NORAD ${sheet.noradId}, dated ${formatDate(sheet.epoch)} ${utcTime(sheet.epoch)} UTC. Frequencies and modes from SatNOGS DB (CC BY-SA 4.0). A transmitter listed as in use may still be off.`,
    ),
  );
  return printDocument({
    paper,
    title: passTitle(sheet),
    made: sheet.written,
    footerName: `${name} · NORAD ${sheet.noradId}`,
    footerRight: `Made ${formatDate(sheet.written.getTime())}`,
    parts: [{ kind: "plain", content }],
  });
}
