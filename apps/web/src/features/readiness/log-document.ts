/**
 * The log of events laid out with the print kit: a strip a day showing when each line
 * was written, then a table a day of time, who and what. Check-ins and steps ticked in a
 * plan carry a mark of their own (a ring, a square) as well as their words, in the table
 * and on the strips alike. Pure: lines in, document out. Names in any script print
 * (`renderPdf` sets them in a fallback font); none is put in the drawing.
 */
import type { EventLogLine } from "@outpost/shared";
import type { Content, TDocumentDefinitions } from "pdfmake/interfaces";
import {
  PRINT_COLOURS as C,
  type Drawing,
  dataTable,
  drawing,
  figure,
  label,
  measureOf,
  note,
  type PrintPaper,
  printDocument,
  svgText,
} from "@/features/print-kit";
import { formatTimeOfDay } from "@/lib/clock";
import { formatDate, plural } from "@/lib/utils";

type Kind = EventLogLine["kind"];

const KIND_WORDS: Record<Kind, string> = { entry: "Written down", checkin: "Check-in", tick: "Plan step ticked" };

/** A line's mark, centred on (x, y): a filled dot, a ring, a square. Shape as well as colour, for a grey copy. */
function mark(kind: Kind, x: number, y: number, r = 3.2): string {
  if (kind === "checkin") return `<circle cx="${x}" cy="${y}" r="${r}" fill="#ffffff" stroke="${C.know}" stroke-width="1.4"/>`;
  if (kind === "tick")
    return `<rect x="${x - r}" y="${y - r}" width="${2 * r}" height="${2 * r}" fill="${C.warn}" stroke="${C.warnInk}" stroke-width="0.5"/>`;
  return `<circle cx="${x}" cy="${y}" r="${r}" fill="${C.accent}"/>`;
}

const markSvg = (kind: Kind): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="9" height="9" viewBox="0 0 9 9">${mark(kind, 4.5, 4.5, 3.4)}</svg>`;

interface Day {
  /** Midnight, local time. */
  start: number;
  words: string;
  lines: EventLogLine[];
}

function daysOf(lines: EventLogLine[]): Day[] {
  const days: Day[] = [];
  for (const line of lines) {
    const words = formatDate(line.at);
    const last = days.at(-1);
    if (last?.words === words) last.lines.push(line);
    else {
      const start = new Date(line.at);
      start.setHours(0, 0, 0, 0);
      days.push({ start: start.getTime(), words, lines: [line] });
    }
  }
  return days;
}

/** The most days drawn as strips; a longer log is only tabled. */
export const TIMELINE_DAYS = 14;

/** A strip a day from midnight to midnight, a mark at each line's time, hours along the top. */
export function logTimeline(days: Day[], width: number): Drawing {
  const left = 74;
  const right = 8;
  const row = 22;
  const top = 16;
  const span = width - left - right;
  const height = top + days.length * row + 20;
  const parts: string[] = [];
  const xAt = (hours: number) => left + (hours / 24) * span;
  for (const hour of [0, 3, 6, 9, 12, 15, 18, 21, 24]) {
    const x = xAt(hour);
    parts.push(
      `<line x1="${x}" y1="${top - 3}" x2="${x}" y2="${top + days.length * row}" stroke="${C.rule}" stroke-width="${hour % 6 === 0 ? 0.6 : 0.3}"/>`,
    );
    if (hour % 6 === 0 && hour < 24) {
      const at = new Date(2026, 0, 1, hour).getTime();
      parts.push(svgText(x, top - 6, formatTimeOfDay(at), { size: 6.8, fill: C.muted, anchor: "middle" }));
    }
  }
  days.forEach((day, index) => {
    const y = top + index * row + row / 2;
    if (index % 2 === 0) parts.push(`<rect x="${left}" y="${y - row / 2}" width="${span}" height="${row}" fill="${C.shade}"/>`);
    parts.push(svgText(left - 6, y + 2.5, day.words, { size: 7.2, anchor: "end", bold: true }));
    // Marks close in time are set a little above and below each other, so that none hides another.
    let lastX = Number.NEGATIVE_INFINITY;
    let step = 0;
    for (const line of day.lines) {
      const x = xAt(Math.max(0, Math.min(24, (line.at - day.start) / 3_600_000)));
      step = x - lastX < 7 ? step + 1 : 0;
      lastX = x;
      const shift = step === 0 ? 0 : step % 2 === 1 ? -6.5 : 6.5;
      parts.push(mark(line.kind, x, y + shift));
    }
  });
  let x = left;
  const keyY = top + days.length * row + 14;
  for (const kind of ["entry", "checkin", "tick"] as const) {
    parts.push(mark(kind, x + 4, keyY - 2.5), svgText(x + 12, keyY, KIND_WORDS[kind], { size: 7 }));
    // Atkinson Hyperlegible Next at 7 pt averages a little over half its size a letter.
    x += 12 + KIND_WORDS[kind].length * 3.9 + 16;
  }
  return drawing(width, height, parts.join(""));
}

/** The log, oldest first, for afterwards and for an insurer. */
export function logDocument(lines: EventLogLine[], options: { now: number; made: Date; paper?: PrintPaper }): TDocumentDefinitions {
  const paper = options.paper ?? "a4";
  const measure = measureOf(paper);
  const days = daysOf(lines);
  const first = lines[0];
  const last = lines.at(-1);
  const counts = (["checkin", "tick"] as const)
    .map((kind) => {
      const count = lines.filter((line) => line.kind === kind).length;
      return count > 0 ? plural(count, kind === "checkin" ? "check-in" : "ticked step") : null;
    })
    .filter(Boolean);
  const content: Content[] = [
    { text: "Log of events", fontSize: 8.5, bold: true, color: C.accent, characterSpacing: 0.4 },
    {
      text:
        first && last
          ? days.length > 1
            ? `${formatDate(first.at)} to ${formatDate(last.at)}`
            : formatDate(first.at)
          : "Nothing written down",
      fontSize: 22,
      bold: true,
      lineHeight: 1.05,
      margin: [0, 2, 0, 3],
    },
    {
      text: `${plural(lines.length, "line")}${counts.length > 0 ? `, among them ${counts.join(" and ")}` : ""}. Written down as it happened, in Outpost; printed ${formatDate(options.now)}, ${formatTimeOfDay(options.now)}.`,
      fontSize: 10,
      color: C.muted,
      margin: [0, 0, 0, 10],
    },
  ];
  if (days.length > 0 && days.length <= TIMELINE_DAYS)
    content.push(
      figure(logTimeline(days, measure).svg, {
        width: measure,
        caption: "When each line was written, a strip a day from midnight to midnight.",
      }),
    );
  for (const day of days) {
    content.push(
      label(day.words),
      dataTable(
        ["", "Time", "Who", "What"],
        day.lines.map((line) => [
          { svg: markSvg(line.kind), width: 7, height: 7, margin: [0, 2, 0, 0] } as Content,
          formatTimeOfDay(line.at),
          line.author || (line.kind === "tick" ? "Plan step" : ""),
          [
            line.text,
            line.kind === "tick" && line.planName
              ? ` (${line.planName})`
              : line.planName && line.kind === "entry"
                ? ` (during ${line.planName})`
                : "",
            line.edited ? ` Changed by ${line.edited.by}, ${formatDate(line.edited.at)} ${formatTimeOfDay(line.edited.at)}.` : "",
          ].join(""),
        ]),
        { widths: [10, 46, "22%", "*"] },
      ),
    );
  }
  content.push(note("A line is stamped with Outpost's clock when it is added, unless an earlier time was given."));
  return printDocument({
    paper,
    title: `Log of events${first ? `, ${formatDate(first.at)}` : ""}`,
    made: options.made,
    footerName: "Log of events",
    footerRight: `Printed ${formatDate(options.now)}`,
    parts: [{ kind: "plain", content }],
  });
}
