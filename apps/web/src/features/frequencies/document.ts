/**
 * The list of frequencies on paper, for keeping by the radio: the entries the screen is
 * showing, kind by kind, each with its frequencies, mode, hours and place, a time
 * signal's layout, and where each came from and when it was checked. Set with the same
 * blocks and pages as a communication plan (features/propagation/plans/document.ts).
 */
import {
  checkedOn,
  entryChecked,
  FREQUENCY_KINDS,
  type FrequencyEntry,
  formatFrequency,
  kindLabel,
  modeLabel,
  placeName,
  scheduleState,
  setChecked,
} from "@outpost/shared";
import { writePdfPages } from "@/features/maps/print/pdf";
import { type Block, toSheets } from "@/features/propagation/plans/document";
import { appLocale } from "@/lib/region";

const longDate = new Intl.DateTimeFormat(appLocale(), { day: "numeric", month: "long", year: "numeric" });

/** One frequency as it is written on paper: value, channel and anything particular to it. */
export function frequencyLine(frequency: FrequencyEntry["frequencies"][number]): string {
  const parts = [formatFrequency(frequency)];
  if (frequency.channel) parts.push(`channel ${frequency.channel}`);
  if (frequency.power) parts.push(frequency.power);
  if (frequency.hours) parts.push(frequency.hours);
  if (frequency.note) parts.push(frequency.note);
  return parts.join(", ");
}

/** "On the air", "Closed in March 2024", ... in words. */
export function statusWords(entry: FrequencyEntry): string | null {
  if (entry.status === "closed") return entry.closed ? `Closed: ${checkedOn(entry.closed)}` : "Closed";
  if (entry.status === "occasional") return "Only some of the time, or when activated";
  if (entry.status === "not-verified") return "Not verified against a primary source";
  return null;
}

/** What is said of a schedule with an end date, for `today`. */
export function scheduleWords(entry: FrequencyEntry, today: string): string | null {
  if (!entry.schedule) return null;
  const state = scheduleState(entry, today);
  const { season, from, until } = entry.schedule;
  if (state === "expired")
    return `Schedule for ${season} ran out on ${checkedOn(until)}: the frequencies may have changed. Use the bands to hunt.`;
  if (state === "not-yet") return `Schedule for ${season}, from ${checkedOn(from)}.`;
  return `Schedule for ${season}, good until ${checkedOn(until)}.`;
}

export interface Written {
  entries: FrequencyEntry[];
  /** The filters in words, for the first lines: "Time signals, for the United Kingdom". */
  chosen: string;
  /** Today on the device, YYYY-MM-DD. */
  today: string;
  written: Date;
}

export function frequencyBlocks({ entries, chosen, today, written }: Written): Block[] {
  const checked = setChecked(entries);
  const blocks: Block[] = [
    { kind: "title", text: "Frequencies to listen to" },
    {
      kind: "para",
      text: `${chosen}. ${entries.length} ${entries.length === 1 ? "entry" : "entries"}, written out on ${longDate.format(written)}. Checked against their sources ${
        checked.from === checked.to ? `on ${checkedOn(checked.from)}` : `between ${checkedOn(checked.from)} and ${checkedOn(checked.to)}`
      }.`,
    },
    {
      kind: "para",
      text: "Stations close and schedules change. Shortwave schedules change twice a year, at the end of March and the end of October. Times are UTC unless said otherwise. A frequency here is somewhere to try, not a promise that anything is on it.",
    },
  ];
  for (const kind of FREQUENCY_KINDS) {
    const ofKind = entries.filter((entry) => entry.kind === kind.id);
    if (ofKind.length === 0) continue;
    blocks.push({ kind: "heading", text: kindLabel(kind.id) });
    blocks.push({
      kind: "table",
      head: ["Frequency", "What", "Mode", "When and where"],
      rows: ofKind.map((entry) => [
        entry.frequencies.map(frequencyLine).join("; "),
        [entry.name, statusWords(entry)].filter(Boolean).join(". "),
        entry.modes.map(modeLabel).join(", "),
        [entry.hours, entry.where.map(placeName).join(", "), scheduleWords(entry, today)].filter(Boolean).join(". "),
      ]),
    });
    for (const entry of ofKind) {
      if (!entry.layout?.length && !entry.timeGiven) continue;
      blocks.push({ kind: "heading", text: `${entry.name}: setting a clock by it` });
      for (const paragraph of entry.layout ?? []) blocks.push({ kind: "para", text: paragraph });
      if (entry.timeGiven) blocks.push({ kind: "para", text: entry.timeGiven });
    }
  }
  blocks.push({ kind: "heading", text: "Where each came from" });
  blocks.push({
    kind: "list",
    items: entries.map(
      (entry) =>
        `${entry.name}: ${entry.sources.map((source) => `${source.publisher}, ${source.title}, ${source.url}`).join("; ")} (checked ${checkedOn(entryChecked(entry))})`,
    ),
  });
  blocks.push({
    kind: "para",
    text: "General information, not legal advice. Listening is lawful in most countries; transmitting needs the licence or the rules of the country you are in, and transmitting on a distress frequency other than in distress is an offence nearly everywhere.",
  });
  return blocks;
}

export const frequenciesTitle = (chosen: string, written: Date) => `Frequencies to listen to: ${chosen}, ${longDate.format(written)}`;

export function frequenciesPdf(input: Written): Uint8Array {
  const footer = `Frequencies to listen to · ${input.chosen} · stations close and schedules change · Outpost`;
  return writePdfPages({
    pages: toSheets(frequencyBlocks(input), footer),
    title: frequenciesTitle(input.chosen, input.written),
    created: input.written,
  });
}
