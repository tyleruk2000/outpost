/**
 * A communication plan written out to be printed and carried: the same content as
 * Markdown (which must read well as plain text, tables and all) and as the pages of a
 * PDF, lettered with the PDF writer the map's printed pages use.
 *
 * Nothing here touches the network or works anything out about propagation: a plan and
 * its matrix in, text or pages out. The recommendations are the rule in
 * `@outpost/shared` applied to the engine's figures, and the rule is printed with them.
 */
import {
  APPROXIMATE_KEY,
  APPROXIMATE_MARK,
  type CommunicationPlan,
  halfWaveRangeMhz,
  hourRanges,
  MODEL_JOIN_NOTE,
  NOISE_ENVIRONMENTS,
  type PlanChoice,
  type PlanPair,
  type PlanResult,
  planBandLabel,
  planHours,
  planRecommendation,
  planRule,
  planTwoWay,
  toMaidenhead,
  utcLabel,
  wireOn,
} from "@outpost/shared";
import { monoWidth } from "@/features/maps/print/courier";
import { encodeWinAnsi, wrapText } from "@/features/maps/print/helvetica";
import { PAPERS } from "@/features/maps/print/paper";
import { INK, MUTED, type Sheet, type SheetItem } from "@/features/maps/print/sheet";
import { appLocale } from "@/lib/region";

export type Block =
  | { kind: "title"; text: string }
  | { kind: "heading"; text: string }
  | { kind: "para"; text: string }
  | { kind: "list"; items: string[] }
  | { kind: "table"; head: string[]; rows: string[][]; right?: number[] }
  /**
   * Something that is not words: a picture with what is drawn over it, a legend's
   * swatches. `draw` is given the top-left corner of a box as wide as the page's text and
   * `height` tall, and answers with what goes in it. `words` says the same thing for
   * Markdown, which has no pictures.
   */
  | { kind: "drawing"; height: number; draw: (x: number, y: number, width: number) => SheetItem[]; words?: string };

const longDate = new Intl.DateTimeFormat(appLocale(), { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const monthYear = new Intl.DateTimeFormat(appLocale(), { month: "long", year: "numeric", timeZone: "UTC" });
const dateOf = (iso: string) => new Date(`${iso}T00:00:00Z`);

/** A two-way figure as it is written: a share of days, or decibels when bands are compared by ratio. */
export const planFigure = (value: number, byRatio: boolean): string => (byRatio ? `${value.toFixed(1)} dB` : `${Math.round(value * 100)}%`);

/** The best a band reaches, as a summary says it: "up to 62% of days", or "up to 46.0 dB". */
export const planBest = (value: number, byRatio: boolean, mark = ""): string =>
  `up to ${mark}${planFigure(value, byRatio)}${byRatio ? "" : " of days"}`;

/**
 * Why a pair has no figures on a band: one of its stations has a wire of a stated length
 * that the engine's model does not describe there (`wireOn`). Null when both antennas
 * are modelled on it. The engine's answer for such a band is blank, which must not be
 * read as "no path".
 */
export function pairNotModelled(plan: Pick<CommunicationPlan, "stations">, pair: Pick<PlanPair, "a" | "b">, mhz: number): string | null {
  const wires = [pair.a, pair.b]
    .map((id) => plan.stations.find((station) => station.id === id))
    .filter((station) => station !== undefined && wireOn(station.antenna, mhz)?.state === "not-modelled")
    .map((station) => {
      const { fromMhz, toMhz } = halfWaveRangeMhz(station!.antenna.lengthM!);
      if (station!.antenna.kind === "end-fed-sloping")
        return `${station!.name}'s ${station!.antenna.lengthM} m sloping wire (a half-wave or longer from ${fromMhz.toFixed(1)} MHz)`;
      return `${station!.name}'s ${station!.antenna.lengthM} m level wire (about a half-wave from ${fromMhz.toFixed(1)} to ${toMhz.toFixed(1)} MHz)`;
    });
  return wires.length === 0 ? null : `${wires.join(" and ")} ${wires.length > 1 ? "are" : "is"} not modelled on this band`;
}

/**
 * Why a pair's figures on a band are approximate: one of its stations has a level wire
 * longer than a half-wave there, run as VOACAP's sloping long wire. Null when neither is.
 */
export function pairApproximate(plan: Pick<CommunicationPlan, "stations">, pair: Pick<PlanPair, "a" | "b">, mhz: number): string | null {
  const wires = [pair.a, pair.b]
    .map((id) => plan.stations.find((station) => station.id === id))
    .filter((station) => station !== undefined && wireOn(station.antenna, mhz)?.state === "approximate")
    .map((station) => ({ name: `${station!.name}'s ${station!.antenna.lengthM} m`, sloping: station!.antenna.kind === "end-fed-sloping" }));
  const level = wires.filter((wire) => !wire.sloping).map((wire) => `${wire.name} level wire`);
  const sloping = wires.filter((wire) => wire.sloping).map((wire) => `${wire.name} sloping wire`);
  const words = [
    level.length > 0
      ? `${level.join(" and ")} ${level.length > 1 ? "are" : "is"} longer than a half-wave here, run as VOACAP's sloping long wire laid level`
      : "",
    sloping.length > 0
      ? `${sloping.join(" and ")} ${sloping.length > 1 ? "are" : "is"} run here as VOACAP's sloping long wire at its slope`
      : "",
  ].filter(Boolean);
  return words.length === 0 ? null : words.join("; ");
}

/** Whether a pair's figures on a band are approximate: as the matrix marks them, or, for a matrix kept before it did, as the stations' wires say. */
export const bandApproximate = (plan: Pick<CommunicationPlan, "stations">, pair: PlanPair, band: PlanPair["bands"][number]): boolean =>
  band.approximate === true || pairApproximate(plan, pair, band.mhz) !== null;

/** A two-way figure as the matrix prints it: "~62" where it is approximate. */
const matrixFigure = (text: string, approximate: boolean) => (approximate && text !== "-" ? `${APPROXIMATE_MARK}${text}` : text);

/** One recommendation in a sentence. */
export function choiceWords(choice: PlanChoice, byRatio: boolean): string {
  const what = byRatio ? "two-way signal-to-noise ratio" : "two-way reliability";
  const approximate = choice.approximate === true;
  return `${planBandLabel(choice.bandId)} (${choice.mhz} MHz)${approximate ? ", approximate" : ""}, ${hourRanges(choice.hours)} UTC. Its ${what} reaches ${planFigure(choice.best, byRatio)}${byRatio ? " in 1 Hz" : " of days"} at ${utcLabel(choice.bestHour)} and averages ${planFigure(choice.mean, byRatio)} over the window.${choice.belowHalf ? " It is below half the days at every hour of the window." : ""}${approximate ? " These figures are approximate: a station's end-fed wire is run on this band as VOACAP's sloping long wire, whose level is unchecked." : ""}`;
}

/** A recommendation in the summary table: "15 m, approximate, up to ~62% of days". */
const choiceCell = (choice: PlanChoice, byRatio: boolean) =>
  choice.approximate
    ? `${planBandLabel(choice.bandId)}, approximate, ${planBest(choice.best, byRatio, APPROXIMATE_MARK)}`
    : `${planBandLabel(choice.bandId)}, ${planBest(choice.best, byRatio)}`;

/** The plan as blocks of text, in reading order. */
export function planDocument(plan: CommunicationPlan, result: PlanResult, written: Date): Block[] {
  const hours = planHours(plan.fromUtc, plan.toUtc);
  const byRatio = result.mode.requiredSnrDbHz === null;
  const name = (id: string) => plan.stations.find((station) => station.id === id)?.name ?? id;
  const needs =
    result.mode.requiredSnrDbHz === null
      ? "no stated requirement"
      : `taken to need ${result.mode.requiredSnrDbHz} dB signal-to-noise ratio in a 1 Hz bandwidth`;
  const blocks: Block[] = [
    { kind: "title", text: `Communication plan: ${plan.name}` },
    {
      kind: "para",
      text: `For ${longDate.format(dateOf(plan.date))}, ${utcLabel(plan.fromUtc)} to ${utcLabel(plan.toUtc)} UTC. The model works by month, so this is a plan for any day of ${monthYear.format(dateOf(plan.date))}. Mode: ${result.mode.label}, ${needs}. Written out on ${longDate.format(written)}.`,
    },
    { kind: "para", text: `${result.basis.summary} It is not a reading of the ionosphere on the day.` },
    { kind: "heading", text: "Stations" },
    {
      kind: "table",
      head: ["Station", "Position", "Locator", "Power", "Antenna", "Noise"],
      rows: plan.stations.map((station) => [
        station.name,
        `${station.lat.toFixed(2)}, ${station.lon.toFixed(2)}`,
        toMaidenhead(station.lat, station.lon, 6) ?? "",
        `${station.powerWatts} W`,
        station.antennaName || "Not named",
        (NOISE_ENVIRONMENTS.find((item) => item.id === station.noise)?.label ?? station.noise).replace(/ \(.*\)$/, "").replace(/,.*$/, ""),
      ]),
    },
    { kind: "heading", text: "Which band for each pair" },
  ];
  const chosen = result.pairs.map((pair) => ({ pair, pick: planRecommendation(pair, hours, byRatio) }));
  blocks.push({
    kind: "table",
    head: ["Between", "km", "Primary", "Alternate"],
    right: [1],
    rows: chosen.map(({ pair, pick }) => [
      `${name(pair.a)} and ${name(pair.b)}`,
      pair.problem ? "" : String(Math.round(pair.distanceKm)),
      pick.primary ? choiceCell(pick.primary, byRatio) : "None",
      pick.alternate ? choiceCell(pick.alternate, byRatio) : "None",
    ]),
  });
  const anyApproximate = chosen.some(({ pick }) => pick.primary?.approximate || pick.alternate?.approximate);
  blocks.push({
    kind: "para",
    text: `${
      byRatio
        ? "The figure is the lower of the two directions' median signal-to-noise ratios in a 1 Hz bandwidth, at the band's best hour in the window."
        : "The figure is the two-way reliability at the band's best hour in the window: the share of days on which the weaker of the two directions is predicted to reach what the mode needs."
    }${anyApproximate ? ` A recommendation marked approximate may be followed, knowing that. ${APPROXIMATE_KEY}` : ""}`,
  });

  for (const { pair, pick } of chosen) {
    blocks.push({ kind: "heading", text: `${name(pair.a)} and ${name(pair.b)}` });
    if (pair.problem) {
      blocks.push({ kind: "para", text: `Not worked out. ${pair.problem}` });
      continue;
    }
    blocks.push({
      kind: "para",
      text: `${Math.round(pair.distanceKm)} km. Bearing ${Math.round(pair.bearingDeg)}° from ${name(pair.a)}, ${Math.round(pair.backBearingDeg)}° from ${name(pair.b)}.`,
    });
    blocks.push({
      kind: "list",
      items: [
        pick.primary ? `Primary: ${choiceWords(pick.primary, byRatio)}` : `Primary: none. ${pick.none ?? ""}`,
        pick.alternate ? `Alternate: ${choiceWords(pick.alternate, byRatio)}` : "Alternate: none. No second band of the plan qualifies.",
      ],
    });
    blocks.push({
      kind: "table",
      head: ["UTC", ...hours.map((hour) => String(hour).padStart(2, "0"))],
      right: hours.map((_, index) => index + 1),
      rows: pair.bands.map((band) => [
        planBandLabel(band.bandId),
        ...hours.map((hour) => {
          if (pairNotModelled(plan, pair, band.mhz)) return "n/m";
          const value = planTwoWay(band, hour, byRatio);
          return matrixFigure(
            value === null ? "-" : byRatio ? String(Math.round(value)) : String(Math.round(value * 100)),
            bandApproximate(plan, pair, band),
          );
        }),
      ]),
    });
    blocks.push({
      kind: "para",
      text: byRatio
        ? "Each figure is the lower of the two directions' median signal-to-noise ratios in 1 Hz, in dB, at that hour (24 is midnight at the end of the day). A dash is an hour at which the engine found no path."
        : "Each figure is the two-way reliability in per cent of days, at that hour (24 is midnight at the end of the day). A dash is an hour at which the engine found no path.",
    });
    // A band with no figures because an antenna is not modelled on it is said to be that, band by band: it is not a band that does badly.
    const without = pair.bands.flatMap((band) => {
      const why = pairNotModelled(plan, pair, band.mhz);
      return why ? [`${planBandLabel(band.bandId)}: ${why}.`] : [];
    });
    if (without.length > 0)
      blocks.push({
        kind: "para",
        text: `n/m is not modelled: the engine has no model of that antenna on that band, so there is no figure and the band cannot be recommended. ${without.join(" ")}`,
      });
    // A band whose figures are approximate is said to be that, band by band, beside the bands that are not modelled.
    const rough = pair.bands.flatMap((band) => {
      if (!bandApproximate(plan, pair, band)) return [];
      return [`${planBandLabel(band.bandId)}: ${pairApproximate(plan, pair, band.mhz) ?? "an antenna is run as an approximation"}.`];
    });
    if (rough.length > 0) {
      // Where a level wire is the dipole on one band of the pair and the long wire on another, the step between them is said here.
      const mixed = pair.bands.some(
        (band) =>
          !bandApproximate(plan, pair, band) &&
          [pair.a, pair.b].some(
            (id) => wireOn(plan.stations.find((station) => station.id === id)!.antenna, band.mhz)?.state === "half-wave",
          ),
      );
      blocks.push({ kind: "para", text: `${APPROXIMATE_KEY} ${rough.join(" ")}${mixed ? ` ${MODEL_JOIN_NOTE}` : ""}` });
    }
  }

  blocks.push({ kind: "heading", text: "How the bands were chosen" }, { kind: "list", items: planRule(byRatio) });
  blocks.push(
    { kind: "heading", text: "What these figures are" },
    { kind: "list", items: result.limits },
    {
      kind: "para",
      text: `Worked out by ${result.engine.model} (${result.engine.implementation}) from ${result.datasets.map((item) => `${item.id} ${item.version}`).join("; ")}, on ${longDate.format(new Date(result.computedAt))}.`,
    },
  );
  if (plan.notes.trim()) {
    blocks.push({ kind: "heading", text: "Notes" });
    for (const paragraph of plan.notes.split(/\n\s*\n/)) if (paragraph.trim()) blocks.push({ kind: "para", text: paragraph.trim() });
  }
  const linked = plan.linked.filter((link) => link.title !== null);
  if (linked.length > 0) {
    blocks.push(
      { kind: "heading", text: "Linked in Outpost" },
      { kind: "list", items: linked.map((link) => `${link.title} (${link.kind === "note" ? "a note" : "a document in the library"})`) },
    );
  }
  return blocks;
}

// ── Markdown ────────────────────────────────────────────────────────────────

const width = (text: string) => [...text].length;
const pad = (text: string, to: number, right: boolean) =>
  right ? " ".repeat(to - width(text)) + text : text + " ".repeat(to - width(text));

/** The widths that make a table's columns line up, and whether each is set to the right. */
function columns(block: Extract<Block, { kind: "table" }>) {
  return block.head.map((head, index) => ({
    width: Math.max(3, width(head), ...block.rows.map((row) => width(row[index] ?? ""))),
    right: block.right?.includes(index) ?? false,
  }));
}

/**
 * Markdown that is also plain text: tables are padded so that their columns stand in
 * line in any fixed-width view, and a pipe inside a cell is written so that it does not
 * end the cell.
 */
export function toMarkdown(blocks: Block[]): string {
  const out: string[] = [];
  const cell = (text: string) => text.replace(/\|/g, "\\|");
  for (const block of blocks) {
    if (block.kind === "title") out.push(`# ${block.text}`, "");
    else if (block.kind === "heading") out.push(`## ${block.text}`, "");
    else if (block.kind === "para") out.push(block.text, "");
    else if (block.kind === "list") out.push(...block.items.map((item) => `- ${item}`), "");
    else if (block.kind === "drawing") {
      if (block.words) out.push(block.words, "");
    } else {
      const escaped = { ...block, head: block.head.map(cell), rows: block.rows.map((row) => row.map(cell)) };
      const cols = columns(escaped);
      const line = (cells: string[]) => `| ${cols.map((col, index) => pad(cells[index] ?? "", col.width, col.right)).join(" | ")} |`;
      out.push(line(escaped.head));
      out.push(`| ${cols.map((col) => (col.right ? `${"-".repeat(col.width - 1)}:` : "-".repeat(col.width))).join(" | ")} |`);
      out.push(...escaped.rows.map(line), "");
    }
  }
  return `${out.join("\n").trimEnd()}\n`;
}

// ── PDF ─────────────────────────────────────────────────────────────────────

const MARGIN = 42;
const BODY = 9.5;
const LEADING = 13;
const TABLE = 7.6;
const TABLE_LEADING = 10.4;

/**
 * The plan as pages, A4 unless another paper is asked for: headings and prose in
 * Helvetica, tables in Courier so that their columns stand in line. A table is never
 * split across pages unless it is taller than a page; a heading is never left at the
 * foot of one.
 */
export function toSheets(blocks: Block[], footer: string, paper: "a4" | "letter" = "a4"): Sheet[] {
  const { width: pageWidth, height: pageHeight } = PAPERS[paper];
  const inner = pageWidth - 2 * MARGIN;
  const bottom = pageHeight - MARGIN - 16;
  const pages: SheetItem[][] = [[]];
  let y = MARGIN;
  const page = () => pages[pages.length - 1]!;
  const fresh = () => {
    pages.push([]);
    y = MARGIN;
  };
  const room = (height: number) => {
    if (y + height > bottom && y > MARGIN) fresh();
  };
  const text = (line: string, size: number, options: { bold?: boolean; mono?: boolean; x?: number; muted?: boolean } = {}) =>
    page().push({
      kind: "text",
      x: options.x ?? MARGIN,
      y,
      text: line,
      size,
      bold: options.bold,
      mono: options.mono,
      color: options.muted ? MUTED : INK,
    });

  for (const [index, block] of blocks.entries()) {
    if (block.kind === "title") {
      for (const line of wrapText(block.text, 17, inner, true)) {
        y += 18;
        text(line, 17, { bold: true });
      }
      y += 8;
    } else if (block.kind === "heading") {
      // Kept with at least the start of what it heads.
      const next = blocks[index + 1];
      room(40 + (next?.kind === "table" ? TABLE_LEADING * Math.min(next.rows.length + 2, 12) : LEADING * 2));
      y += 20;
      text(block.text, 11.5, { bold: true });
      y += 5;
    } else if (block.kind === "para") {
      const lines = wrapText(block.text, BODY, inner);
      room(Math.min(lines.length, 3) * LEADING);
      for (const line of lines) {
        room(LEADING);
        y += LEADING;
        text(line, BODY);
      }
      y += 5;
    } else if (block.kind === "list") {
      for (const item of block.items) {
        const lines = wrapText(item, BODY, inner - 12);
        room(Math.min(lines.length, 2) * LEADING);
        for (const [at, line] of lines.entries()) {
          room(LEADING);
          y += LEADING;
          if (at === 0) text("-", BODY);
          text(line, BODY, { x: MARGIN + 12 });
        }
        y += 2;
      }
      y += 3;
    } else if (block.kind === "drawing") {
      room(block.height);
      page().push(...block.draw(MARGIN, y, inner));
      y += block.height + 6;
    } else {
      const cols = columns(block);
      const gap = "  ";
      const line = (cells: string[]) => cols.map((col, at) => pad(cells[at] ?? "", col.width, col.right)).join(gap);
      // A table too wide for the page is set smaller, down to a size that can still be read.
      const natural = monoWidth(line(block.head), TABLE);
      const size = natural > inner ? Math.max(5.6, (TABLE * inner) / natural) : TABLE;
      const leading = (TABLE_LEADING * size) / TABLE;
      room(leading * Math.min(block.rows.length + 2, 40));
      const head = () => {
        y += leading;
        text(line(block.head), size, { mono: true, bold: true });
        y += 3;
        page().push({
          kind: "line",
          x1: MARGIN,
          y1: y,
          x2: MARGIN + Math.min(inner, monoWidth(line(block.head), size)),
          y2: y,
          color: MUTED,
          width: 0.5,
        });
        y += 1;
      };
      head();
      for (const row of block.rows) {
        if (y + leading > bottom) {
          fresh();
          head();
        }
        y += leading;
        text(line(row), size, { mono: true });
      }
      y += 7;
    }
  }
  return pages.map((items, index) => ({
    width: pageWidth,
    height: pageHeight,
    items: [
      ...items,
      {
        kind: "line",
        x1: MARGIN,
        y1: pageHeight - MARGIN - 4,
        x2: pageWidth - MARGIN,
        y2: pageHeight - MARGIN - 4,
        color: MUTED,
        width: 0.4,
      },
      { kind: "text", x: MARGIN, y: pageHeight - MARGIN + 8, text: footer, size: 7.5, color: MUTED },
      {
        kind: "text",
        x: pageWidth - MARGIN,
        y: pageHeight - MARGIN + 8,
        text: `Page ${index + 1} of ${pages.length}`,
        size: 7.5,
        color: MUTED,
        anchor: "end",
      },
    ],
  }));
}

/** The words of the blocks that the PDF's typeface cannot write, each once. They are printed as "?". */
export function unwritable(blocks: Block[]): string[] {
  const found = new Set<string>();
  const check = (line: string) => {
    for (const character of line) if (!encodeWinAnsi(character)) found.add(character);
  };
  for (const block of blocks) {
    if (block.kind === "list") block.items.forEach(check);
    else if (block.kind === "drawing") continue;
    else if (block.kind === "table") [block.head, ...block.rows].flat().forEach(check);
    else check(block.text);
  }
  return [...found];
}

export const planMarkdown = (plan: CommunicationPlan, result: PlanResult, written: Date): string =>
  toMarkdown(planDocument(plan, result, written));

/** Hands a file to the browser to save. */
export function saveFile(name: string, type: string, content: Uint8Array | string): void {
  const url = URL.createObjectURL(new Blob([content as BlobPart], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  // The browser has taken the bytes by the time the click returns; the address is given back a little later to be safe.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
