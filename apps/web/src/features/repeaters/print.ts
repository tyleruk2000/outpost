/**
 * The repeaters the list shows, as a printed sheet to keep beside a radio: callsign, the
 * frequency to listen on, the shift, the tone or code, the place, the distance and
 * bearing from where they were measured, and the list each came from with the date of
 * its data. Laid out with the print kit; pure, rows in and document out.
 */
import { formatMHz, REPEATER_LICENCE_LINE, REPEATER_STATUS_LINE, type RepeaterDto, type RepeaterListDto } from "@outpost/shared";
import type { TDocumentDefinitions } from "pdfmake/interfaces";
import { formatBearing } from "@/features/maps/lib/geo";
import { dataTable, heading, note, type PrintPaper, para, printable, printDocument } from "@/features/print-kit";
import { formatDate, plural } from "@/lib/utils";
import { accessParts, isApproximate, shiftWords, sourceOf } from "./words";

export interface RepeatersSheet {
  repeaters: RepeaterDto[];
  lists: Map<string, RepeaterListDto>;
  /** What they are in order of and measured from: "nearest to Home first". */
  order: string;
  /** The place distances are from, or null when none is chosen. */
  from: string | null;
  /** The filters that are on, in words. */
  filters: string[];
  /** How many matched in all, when more matched than are printed. */
  total: number;
  distance: (meters: number) => string;
  made: Date;
  paper: PrintPaper;
}

export function repeatersDocument(sheet: RepeatersSheet): TDocumentDefinitions {
  const rows = sheet.repeaters.map((repeater) => {
    const source = sourceOf(repeater.listId ? sheet.lists.get(repeater.listId) : undefined);
    const away =
      repeater.distanceMeters !== undefined && repeater.bearingDegrees !== undefined
        ? `${isApproximate(repeater) ? "about " : ""}${sheet.distance(repeater.distanceMeters)}, ${formatBearing(repeater.bearingDegrees)}`
        : repeater.lat === null
          ? "no position"
          : "";
    return [
      `**${printable(repeater.callsign)}**`,
      formatMHz(repeater.outputHz),
      printable(shiftWords(repeater).replace(/^shift /, "")),
      printable(accessParts(repeater).join(", ") || "none listed"),
      printable([repeater.place, repeater.locator].filter(Boolean).join(", ")),
      ...(sheet.from ? [printable(away)] : []),
      printable(`${source.text}${repeater.status === "off-air" ? "; listed as not operational" : ""}`),
    ];
  });
  const head = ["Callsign", "Listen, MHz", "Shift", "Tone or code", "Place", ...(sheet.from ? ["Distance, bearing (true)"] : []), "From"];
  const intro = [
    `${plural(sheet.repeaters.length, "repeater")}${sheet.total > sheet.repeaters.length ? ` of the ${sheet.total} that match` : ""}, ${sheet.order}.`,
    sheet.filters.length > 0 ? `Filters: ${sheet.filters.join("; ")}.` : "",
  ]
    .filter(Boolean)
    .join(" ");
  return printDocument({
    paper: sheet.paper,
    title: "Repeaters",
    subject: "Amateur radio repeaters, from the lists kept in Outpost",
    made: sheet.made,
    footerName: "Repeaters",
    footerRight: formatDate(sheet.made.getTime()),
    parts: [
      {
        kind: "plain",
        orientation: "landscape",
        content: [
          heading("Repeaters"),
          para(printable(intro)),
          dataTable(head, rows, { right: [1] }),
          note(printable(`${REPEATER_STATUS_LINE} Check a repeater on the air before relying on it. ${REPEATER_LICENCE_LINE}`)),
        ],
      },
    ],
  });
}
