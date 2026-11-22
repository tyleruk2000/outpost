/**
 * The list of frequencies on paper, laid out with the print kit: where on the radio dial
 * each entry lies, then each kind of station as a section with its table, a time signal's
 * layout set out part by part, and where each came from. The words are the list's own
 * blocks (document.ts).
 *
 * The dial's bands are the ITU's: Radio Regulations No. 2.1 and Recommendation ITU-R
 * V.431-9 (10/2025), "band N extends from 0.3 × 10^N Hz to 3 × 10^N Hz": LF 30 to 300 kHz,
 * MF 300 kHz to 3 MHz, HF 3 to 30 MHz, VHF 30 to 300 MHz, UHF 300 MHz to 3 GHz (read 22
 * November 2026; docs/sources.md).
 */
import { FREQUENCY_KINDS, type FrequencyEntry, kindLabel } from "@outpost/shared";
import type { Content, TDocumentDefinitions } from "pdfmake/interfaces";
import {
  bullets,
  PRINT_COLOURS as C,
  callout,
  dataTable,
  drawing,
  figure,
  heading,
  label,
  measureOf,
  para,
  printDocument,
  round,
  sectionHeader,
  svgText,
} from "@/features/print-kit";
import { groupsOf } from "@/features/propagation/print/prediction-print";
import { kept } from "@/features/propagation/print/radio-parts";
import { frequenciesTitle, frequencyBlocks, type Written } from "./document";

/** The ITU's bands, in kHz (Radio Regulations No. 2.1). */
export const ITU_BANDS = [
  { name: "LF", from: 30, to: 300 },
  { name: "MF", from: 300, to: 3_000 },
  { name: "HF", from: 3_000, to: 30_000 },
  { name: "VHF", from: 30_000, to: 300_000 },
  { name: "UHF", from: 300_000, to: 3_000_000 },
] as const;

const KIND_COLOURS = [C.act, C.know, C.accent, C.warn, "#6b4fa0", C.muted, "#8a5a2b", C.ink];

/** Every entry's frequencies on a dial from 30 kHz to 3 GHz, a row to a kind, with the ITU's bands across the top. */
export function dialDrawing(entries: FrequencyEntry[], width: number) {
  const kinds = FREQUENCY_KINDS.filter((kind) => entries.some((entry) => entry.kind === kind.id));
  const left = 104;
  const right = width - 6;
  const top = 26;
  const row = 15;
  const height = top + kinds.length * row + 20;
  const lo = Math.log10(30);
  const hi = Math.log10(3_000_000);
  const x = (khz: number) => left + ((Math.log10(Math.min(Math.max(khz, 30), 3_000_000)) - lo) / (hi - lo)) * (right - left);
  let body = "";
  ITU_BANDS.forEach((band, index) => {
    const from = x(band.from);
    const to = x(band.to);
    body += `<rect x="${round(from)}" y="${top - 2}" width="${round(to - from)}" height="${kinds.length * row + 4}" fill="${index % 2 === 0 ? C.shade : "#ffffff"}"/>`;
    body += `<rect x="${round(from)}" y="0" width="${round(to - from)}" height="16" fill="${index === 2 ? C.accent : C.accentSoft}"/>`;
    body += svgText((from + to) / 2, 11, band.name, { anchor: "middle", bold: true, size: 8, fill: index === 2 ? "#ffffff" : C.accent });
  });
  const ticks: Array<[number, string]> = [
    [30, "30 kHz"],
    [300, "300 kHz"],
    [3_000, "3 MHz"],
    [30_000, "30 MHz"],
    [300_000, "300 MHz"],
    [3_000_000, "3 GHz"],
  ];
  for (const [khz, words] of ticks) {
    const at = round(x(khz));
    body += `<line x1="${at}" y1="${top - 2}" x2="${at}" y2="${top + kinds.length * row + 4}" stroke="${C.rule}" stroke-width="0.5"/>`;
    body += svgText(at, top + kinds.length * row + 14, words, {
      anchor: khz === 30 ? "start" : khz === 3_000_000 ? "end" : "middle",
      size: 6.5,
      fill: C.muted,
    });
  }
  kinds.forEach((kind, index) => {
    const y = top + index * row + row / 2;
    const colour = KIND_COLOURS[FREQUENCY_KINDS.indexOf(kind) % KIND_COLOURS.length]!;
    body += svgText(left - 6, y + 2.5, kind.label, { anchor: "end", size: 7, bold: true, fill: colour });
    for (const entry of entries.filter((each) => each.kind === kind.id))
      for (const frequency of entry.frequencies) {
        const from = x(frequency.khz);
        const to = frequency.toKhz ? x(frequency.toKhz) : from;
        body +=
          to - from > 1.5
            ? `<rect x="${round(from)}" y="${round(y - 3.5)}" width="${round(to - from)}" height="7" fill="${colour}" fill-opacity="0.45"/>`
            : `<line x1="${round(from)}" y1="${round(y - 4.5)}" x2="${round(from)}" y2="${round(y + 4.5)}" stroke="${colour}" stroke-width="1.3"/>`;
      }
  });
  return drawing(width, height, body);
}

/** "Seconds: a 5 ms tick…" as a row of a table: the part, then what it is. */
const partOf = (paragraph: string): [string, string] => {
  const at = paragraph.indexOf(": ");
  return at > 0 && at < 40 ? [paragraph.slice(0, at), paragraph.slice(at + 2)] : ["", paragraph];
};

export function frequenciesPrint(input: Written, paper: "a4" | "letter" = "a4"): TDocumentDefinitions {
  const measure = measureOf(paper);
  const groups = groupsOf(frequencyBlocks(input));
  const opening = groups.get("") ?? [];
  const chosen = input.chosen;

  const first: Content[] = [
    sectionHeader(
      { number: 1, title: "Frequencies to listen to", subtitle: opening[1]?.kind === "para" ? opening[1].text : chosen, id: "list" },
      measure,
    ),
  ];
  if (opening[2]?.kind === "para") first.push(callout("warn", "Stations close and schedules change", para(opening[2].text)));
  first.push(
    figure(dialDrawing(input.entries, measure).svg, {
      width: measure,
      title: "Where they are on the dial",
      caption:
        "Each mark is one frequency of the list, a shaded bar a band or a range of channels; the scale is logarithmic, each step ten times the one before. The bands are the ITU's: Radio Regulations No. 2.1.",
    }),
  );

  const parts: Array<{ kind: "section"; running: string; content: Content[] }> = [];
  let number = 1;
  for (const [name, blocks] of groups) {
    if (name === "" || name === "Where each came from" || name.endsWith(": setting a clock by it")) continue;
    const content: Content[] = number === 1 ? first : [];
    if (number > 1) content.push(sectionHeader({ number, title: name, id: `kind-${number}` }, measure));
    else content.push(heading(name));
    for (const block of blocks)
      if (block.kind === "table")
        content.push(
          dataTable(
            block.head,
            // Each frequency on a line of its own, its figure in bold.
            block.rows.map((row) => [
              (row[0] ?? "")
                .split("; ")
                .map((line) => line.replace(/^([^,]+)/, "**$1**"))
                .join("\n"),
              ...row.slice(1),
            ]),
            { widths: [measure * 0.24, measure * 0.26, measure * 0.12, "*"] },
          ),
        );
    // Each time signal of this kind, set out part by part.
    const kindId = FREQUENCY_KINDS.find((kind) => kindLabel(kind.id) === name)?.id;
    for (const entry of input.entries.filter((each) => each.kind === kindId)) {
      const layout = groups.get(`${entry.name}: setting a clock by it`);
      if (!layout) continue;
      content.push(
        kept(
          label(`${entry.name}: setting a clock by it`),
          dataTable(
            ["", ""],
            layout
              .filter((block) => block.kind === "para")
              .map((block) => {
                const [part, words] = partOf(block.kind === "para" ? block.text : "");
                return [part ? `**${part}**` : "", words];
              }),
            { widths: [measure * 0.18, "*"] },
          ),
        ),
      );
    }
    if (number > 1) parts.push({ kind: "section", running: `${number} · ${name}`, content });
    number += 1;
  }

  const sources = groups.get("Where each came from") ?? [];
  const last: Content[] = [heading("Where each came from")];
  for (const block of sources) {
    if (block.kind === "list") last.push(bullets(block.items.map((item) => item)));
    else if (block.kind === "para") last.push(callout("know", "Listening and transmitting", para(block.text)));
  }
  const tail = parts.at(-1)?.content ?? first;
  tail.push(...last);

  return printDocument({
    paper,
    title: frequenciesTitle(input.chosen, input.written),
    made: input.written,
    footerName: `Frequencies to listen to · ${chosen}`,
    footerRight: "Stations close and schedules change",
    parts: [{ kind: "section", running: "1 · Frequencies to listen to", content: first }, ...parts],
  });
}
