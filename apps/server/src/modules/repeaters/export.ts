/**
 * Writing a set of repeaters out as a file: CHIRP's CSV, for programming a radio, and
 * Outpost's own CSV, which carries every field and reads back without loss.
 *
 * CHIRP's columns, defaults and number formats are those of `Memory.to_csv` in its
 * source (`chirp/chirp_common.py`, read on 16 November 2026). A file written here is a
 * starting point: what a list says about a repeater may be out of date, and CHIRP's own
 * columns cannot say everything (a tone burst, a talkgroup). The person checks it
 * before transmitting; the screen that offers the file says so.
 */
import { formatMHz, type RepeaterDto, type RepeaterListDto, type RepeaterMode } from "@outpost/shared";
import { CHIRP_COLUMNS, OUTPOST_COLUMNS } from "./formats.ts";

/** One cell: quoted when it holds a comma, a quote or a line break, and never starting a formula in a spreadsheet. */
function cell(value: string | number | null): string {
  if (value === null) return "";
  let text = String(value);
  // A spreadsheet treats words that start with one of these as a sum to work out. Numbers, and
  // CHIRP's "+" and "-", are left as they are.
  if (typeof value === "string" && /^[=+\-@\t\r]./.test(text) && !/^[+-]?[\d.]+$/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

const line = (cells: Array<string | number | null>) => cells.map(cell).join(",");

/** CHIRP writes frequencies and shifts as megahertz with six places. */
const chirpFrequency = (hz: number) => `${Math.floor(hz / 1e6)}.${String(hz % 1_000_000).padStart(6, "0")}`;

/** The mode CHIRP should set: FM wherever the repeater takes it, otherwise its one digital mode. */
function chirpMode(modes: RepeaterMode[]): string {
  if (modes.length === 0 || modes.includes("fm")) return "FM";
  const words: Partial<Record<RepeaterMode, string>> = { dmr: "DMR", dstar: "DV", fusion: "DN", p25: "P25", nxdn: "NXDN" };
  return words[modes[0]!] ?? "FM";
}

/** The step a frequency sits on: 12.5 kHz and 6.25 kHz channels do not fall on CHIRP's default of 5 kHz. */
function chirpStep(hz: number): string {
  if (hz % 5000 === 0) return "5.00";
  if (hz % 12_500 === 0) return "12.50";
  if (hz % 6250 === 0) return "6.25";
  return "5.00";
}

export interface ExportContext {
  /** The list each entry came from, by id. */
  lists: Map<string, RepeaterListDto>;
}

const dateOf = (timestamp: number) => new Date(timestamp).toISOString().slice(0, 10);

function sourceOf(repeater: RepeaterDto, context: ExportContext): { source: string; date: string } {
  const list = repeater.listId ? context.lists.get(repeater.listId) : undefined;
  if (!list) return { source: "Entered by hand", date: dateOf(repeater.updatedAt) };
  return { source: list.source || list.name, date: dateOf(list.dataDate) };
}

/**
 * CHIRP's CSV. `Frequency` is what the radio listens on, which is the repeater's
 * output; `Duplex` and `Offset` give where it transmits. A repeater whose input is not
 * listed is written with no shift and `off`, so that the radio will not transmit there
 * until the person has filled it in.
 */
export function toChirpCsv(repeaters: RepeaterDto[], context: ExportContext): string {
  const lines = [CHIRP_COLUMNS.join(",")];
  repeaters.forEach((repeater, index) => {
    let duplex = "";
    let offset = 0;
    if (repeater.inputHz === null) duplex = "off";
    else if (repeater.inputHz !== repeater.outputHz) {
      const shift = repeater.inputHz - repeater.outputHz;
      // A shift into another band is given as the transmit frequency itself.
      if (Math.abs(shift) > 100e6) {
        duplex = "split";
        offset = repeater.inputHz;
      } else {
        duplex = shift > 0 ? "+" : "-";
        offset = Math.abs(shift);
      }
    }
    const tone = repeater.ctcssHz !== null ? "Tone" : repeater.dcsCode !== null ? "DTCS" : "";
    const { source, date } = sourceOf(repeater, context);
    const comment = [
      repeater.place,
      repeater.dmrColourCode !== null ? `colour code ${repeater.dmrColourCode}` : "",
      repeater.talkgroups ? `talkgroups ${repeater.talkgroups}` : "",
      repeater.accessNote,
      repeater.statusText ? `listed as ${repeater.statusText.toLowerCase()}` : "",
      `${source}, ${date}`,
    ]
      .filter(Boolean)
      .join("; ");
    lines.push(
      line([
        index + 1,
        repeater.callsign,
        chirpFrequency(repeater.outputHz),
        duplex,
        chirpFrequency(offset),
        tone,
        (repeater.ctcssHz ?? 88.5).toFixed(1),
        (repeater.ctcssHz ?? 88.5).toFixed(1),
        repeater.dcsCode ?? "023",
        "NN",
        repeater.dcsCode ?? "023",
        "Tone->Tone",
        chirpMode(repeater.modes),
        chirpStep(repeater.outputHz),
        "",
        "",
        comment,
        "",
        "",
        "",
        "",
      ]),
    );
  });
  return `${lines.join("\r\n")}\r\n`;
}

/** Every field, one repeater to a row, with where each came from and the date of its data. */
export function toOutpostCsv(repeaters: RepeaterDto[], context: ExportContext): string {
  const lines = [OUTPOST_COLUMNS.join(",")];
  for (const repeater of repeaters) {
    const { source, date } = sourceOf(repeater, context);
    lines.push(
      line([
        repeater.callsign,
        formatMHz(repeater.outputHz),
        repeater.inputHz === null ? null : formatMHz(repeater.inputHz),
        repeater.band,
        repeater.modes.join(" "),
        repeater.ctcssHz === null ? null : repeater.ctcssHz.toFixed(1),
        repeater.dcsCode,
        repeater.dmrColourCode,
        repeater.talkgroups,
        repeater.accessNote,
        repeater.channel,
        repeater.place,
        repeater.region,
        repeater.country,
        repeater.lat,
        repeater.lon,
        repeater.locator,
        repeater.lat === null ? null : repeater.positionPrecisionMeters,
        repeater.antennaMeters,
        repeater.keeper,
        repeater.status,
        repeater.statusText,
        repeater.notes,
        source,
        date,
      ]),
    );
  }
  return `${lines.join("\r\n")}\r\n`;
}
