/**
 * A prediction written out to be printed and carried: the path and the date, both
 * stations as the engine ran them, where the sunspot number came from, the frequency
 * asked about hour by hour, every band hour by hour, and everything a reader has to
 * know before relying on any of it. The same content as pages of a PDF and as Markdown.
 *
 * Nothing here works anything out about propagation. Every figure is one the engine
 * returned, and the sentences are the result's own (`basis.summary`, `antennas`,
 * `limits`) or say only what a figure is. So that this stays true as the engine's
 * answer grows, the result is read loosely:
 *
 * - whatever is under `antennas` is printed, whatever its keys;
 * - any other words the answer carries that this file has never heard of (a top-level
 *   sentence or list of sentences, or a sentence on a cell of the band table) are
 *   printed under "More that came with the answer";
 * - a cell with no figure (the engine found no path at that hour, the mode has no
 *   requirement, the cell is missing or holds something that is not a number) is
 *   printed as a dash, and the page says what a dash means. It is never printed as 0.
 *
 * The file's own date is the moment the engine answered, not the moment of printing.
 * The same answer written out twice is therefore the same file byte for byte, which is
 * how the library knows it already has it.
 */
import {
  bandOf,
  dbwToDbm,
  HF_BANDS,
  NOISE_ENVIRONMENTS,
  notModelledOn,
  type PredictionCell,
  type PredictionHour,
  type PredictionResult,
  sMeter,
  utcLabel,
} from "@outpost/shared";
import { writePdfPages } from "@/features/maps/print/pdf";
import type { Sheet } from "@/features/maps/print/sheet";
import { type Block, toMarkdown, toSheets, unwritable } from "./plans/document";

export type PredictionPaper = "a4" | "letter";

const longDate = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const shortDate = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const monthYear = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
const dateOf = (iso: string) => new Date(`${iso}T00:00:00Z`);

/** What is printed where there is no figure. */
export const NO_FIGURE = "-";
/** What is printed where the engine has no model of an antenna on a band: not a poor prediction, no prediction. */
export const NOT_MODELLED = "n/m";

/** A cell the answer marks as not modelled (an end-fed wire away from the band it is a half-wave on). */
const notModelled = (cell: PredictionCell | null | undefined): boolean =>
  Boolean(cell) && typeof cell === "object" && cell!.notModelled === true;

const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const mhz = (value: number) => `${value.toFixed(value >= 10 ? 1 : 2)} MHz`;
const whole = (value: number | null) => (value === null ? NO_FIGURE : String(Math.round(value)));
const share = (value: number | null) => (value === null ? NO_FIGURE : String(Math.round(value * 100)));
const percent = (value: number) => `${Math.round(value * 100)}%`;

/** A cell the engine found a way through for. Anything else has no figures to print. */
const answered = (cell: PredictionCell | null | undefined): cell is PredictionCell =>
  Boolean(cell) && typeof cell === "object" && typeof cell!.path === "string";

/** One figure of a cell, or null where the cell has none. */
function figure(cell: PredictionCell | null | undefined, key: keyof PredictionCell): number | null {
  if (!answered(cell)) return null;
  const value = cell[key];
  return isNumber(value) ? value : null;
}

/** The share of days the mode's requirement is met, or null: no path, or no requirement to meet. */
function reliability(result: PredictionResult, cell: PredictionCell | null | undefined): number | null {
  return result.mode.requiredSnrDbHz === null ? null : figure(cell, "reliability");
}

/**
 * The share of days the reply gets through. The answer gives the reply's figures
 * without saying whether the engine found a path for it, so it is printed only for an
 * hour at which the outward direction has one: the two directions cross the same
 * ionosphere, and a figure beside "no path" would be a nought that means nothing.
 */
function replyOf(hour: PredictionHour): number | null {
  return answered(hour.asked) && hour.reply && isNumber(hour.reply.reliability) ? hour.reply.reliability : null;
}

/** The frequency asked about, as the band it lies in where it lies in one: "20 m", or "6.50 MHz". */
function frequencyName(result: PredictionResult): string {
  const band = bandOf(result.request.frequencyMhz);
  return band ? band.label : mhz(result.request.frequencyMhz);
}

/** "HF prediction, London to Edinburgh, 20 m, for 16 Nov 2026": what the file is, and for when. */
export function predictionTitle(result: PredictionResult): string {
  const { tx, rx, date } = result.request;
  return `HF prediction, ${tx.name} to ${rx.name}, ${frequencyName(result)}, for ${shortDate.format(dateOf(date))}`;
}

const BASIS_TITLE: Record<string, string> = {
  climatology: "A monthly median, with an old solar forecast",
  "recent-solar": "A monthly median, with a recent solar forecast",
  "own-measurement": "A monthly median, run at your own figure",
};

/** The hour at which the frequency asked about does best, by the rule the screen opens on: reliability, then signal-to-noise ratio. */
export function bestHourOf(result: PredictionResult): PredictionHour | null {
  const known = result.hours.filter((hour) => answered(hour.asked));
  if (known.length === 0) return null;
  const by = (hour: PredictionHour) => [reliability(result, hour.asked) ?? -1, figure(hour.asked, "snrDbHz") ?? Number.NEGATIVE_INFINITY];
  return [...known].sort((a, b) => by(b)[0]! - by(a)[0]! || by(b)[1]! - by(a)[1]!)[0]!;
}

/** Runs of hours in which the frequency asked about reaches a share of days, as the screen writes them: "08:00 to 16:00". */
function windowsOf(result: PredictionResult, level: number): string[] {
  const { hours } = result;
  const runs: string[] = [];
  let start: number | null = null;
  for (let index = 0; index <= hours.length; index += 1) {
    const open = index < hours.length && (reliability(result, hours[index]!.asked) ?? -1) >= level;
    if (open && start === null) start = index;
    if (!open && start !== null) {
      runs.push(start === index - 1 ? utcLabel(hours[start]!.utc) : `${utcLabel(hours[start]!.utc)} to ${utcLabel(hours[index - 1]!.utc)}`);
      start = null;
    }
  }
  return runs;
}

const ANTENNA_NAMES: Record<string, string> = { tx: "Transmitting antenna", rx: "Receiving antenna" };
/** The parts of an answer this file prints in a place of their own. Anything else that is words is printed as it stands. */
const KNOWN_PARTS = new Set([
  "key",
  "request",
  "computedAt",
  "cached",
  "engine",
  "datasets",
  "basis",
  "path",
  "mode",
  "modes",
  "sweepMhz",
  "hours",
  "antennas",
  "deck",
  "limits",
]);
/** The words of a cell that are figures' names, not sentences. */
const CELL_LABELS = new Set(["path", "layer"]);

const sentences = (value: unknown): string[] =>
  typeof value === "string"
    ? value.trim()
      ? [value.trim()]
      : []
    : Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string" && item.trim() !== "").map((item) => item.trim())
      : [];

/** Words the answer carries that this file has no place for: printed as they stand, so that nothing the engine said is dropped. */
function otherWords(result: PredictionResult): string[] {
  const found: string[] = [];
  for (const [key, value] of Object.entries(result as unknown as Record<string, unknown>)) {
    if (!KNOWN_PARTS.has(key)) found.push(...sentences(value));
  }
  // A sentence on a cell of the band table (why a band has no figure, say) is given once, with the bands it was said of.
  const said = new Map<string, Set<string>>();
  for (const hour of result.hours) {
    HF_BANDS.forEach((band, index) => {
      const cell = hour.bands?.[index] as unknown as Record<string, unknown> | null | undefined;
      if (!cell || typeof cell !== "object") return;
      for (const [key, value] of Object.entries(cell)) {
        if (CELL_LABELS.has(key) || typeof value !== "string" || !/\s/.test(value.trim())) continue;
        const bands = said.get(value.trim()) ?? new Set<string>();
        bands.add(band.label);
        said.set(value.trim(), bands);
      }
    });
  }
  for (const [words, bands] of said) found.push(`${[...bands].join(", ")}: ${words}`);
  return found;
}

/** The prediction as blocks of text, in reading order. */
export function predictionDocument(result: PredictionResult): Block[] {
  const { request, mode, basis, path } = result;
  const f = mhz(request.frequencyMhz);
  const band = bandOf(request.frequencyMhz);
  const noMode = mode.requiredSnrDbHz === null;
  const noise = (id: string) => {
    const setting = NOISE_ENVIRONMENTS.find((item) => item.id === id);
    return setting ? `${setting.label} (${setting.dbwAt3Mhz} dBW in 1 Hz at 3 MHz)` : id;
  };
  const needs = noMode
    ? "no requirement is set for it, so there is no reliability to state"
    : `taken to need ${mode.requiredSnrDb} dB in ${mode.referenceBandwidthHz} Hz, which is ${mode.requiredSnrDbHz} dB in 1 Hz (${mode.source})`;

  const blocks: Block[] = [
    { kind: "title", text: `HF prediction: ${request.tx.name} to ${request.rx.name}, ${f}${band ? ` (${band.label})` : ""}` },
    {
      kind: "para",
      text: `For ${longDate.format(dateOf(request.date))}. The model works by month, so this is a prediction for any day of ${monthYear.format(dateOf(request.date))}. Mode: ${mode.label}, ${needs}.`,
    },
    {
      kind: "para",
      text: `${BASIS_TITLE[basis.kind] ?? "A monthly median"}. ${basis.summary}${
        basis.ssnLow !== null && basis.ssnHigh !== null
          ? ` The table's own range for the month is ${basis.ssnLow} to ${basis.ssnHigh}.`
          : ""
      } The engine ran at a smoothed sunspot number of ${basis.ssn}. It is not a reading of the ionosphere on the day.`,
    },
    { kind: "heading", text: "The path and the stations" },
  ];

  const stations: string[] = [
    `Path: ${Math.round(path.distanceKm)} km, bearing ${Math.round(path.bearingDeg)}° out and ${Math.round(path.backBearingDeg)}° back.`,
    `Transmitter: ${request.tx.name}, ${request.tx.lat.toFixed(2)}, ${request.tx.lon.toFixed(2)}${path.txLocator ? ` (${path.txLocator})` : ""}. ${request.powerWatts} W.`,
    `Receiver: ${request.rx.name}, ${request.rx.lat.toFixed(2)}, ${request.rx.lon.toFixed(2)}${path.rxLocator ? ` (${path.rxLocator})` : ""}. Man-made noise there: ${noise(request.noise)}.`,
  ];
  // How each end's antenna was run, in the engine's own words, whatever it has to say and about however many ends.
  for (const [end, words] of Object.entries((result.antennas ?? {}) as Record<string, unknown>)) {
    for (const line of sentences(words)) stations.push(`${ANTENNA_NAMES[end] ?? end}: ${line}`);
  }
  if (request.reply) {
    stations.push(
      `The reply: ${request.reply.powerWatts} W from ${request.rx.name}, with man-made noise at ${request.tx.name} of ${noise(request.reply.noise)}.`,
    );
  } else {
    stations.push("The reply was not asked for: only reception at the receiver is predicted. A contact needs the path to work both ways.");
  }
  blocks.push({ kind: "list", items: stations });

  // ── The best of it, as the screen states it ──
  const best = bestHourOf(result);
  const findings: string[] = [];
  if (notModelled(result.hours[0]?.asked)) {
    const why = notModelledOn(result.request.txAntenna, result.request.rxAntenna, result.request.frequencyMhz);
    findings.push(
      `${f} is not modelled with this antenna, so no figure is given for it: this is not a prediction that the path is closed. ${why ?? ""}`.trim(),
    );
  } else if (!best) {
    findings.push(`At no hour of the day does the engine find a way for ${f} to reach the receiver.`);
  } else if (noMode) {
    findings.push(
      `The median signal-to-noise ratio of ${f} is highest at ${utcLabel(best.utc)} UTC: ${whole(figure(best.asked, "snrDbHz"))} dB in 1 Hz. Give the ratio your mode needs to get a reliability.`,
    );
  } else {
    const at = reliability(result, best.asked)!;
    findings.push(
      `${f} does best at ${utcLabel(best.utc)} UTC: ${mode.label} reaches what it is taken to need on ${percent(at)} of days. The median ratio is ${whole(figure(best.asked, "snrDbHz"))} dB in 1 Hz and the path's MUF is ${isNumber(best.mufMhz) ? mhz(best.mufMhz) : "not given"}.`,
    );
    const back = replyOf(best);
    if (back !== null) {
      findings.push(
        `The reply reaches it on ${percent(back)} of days at that hour. A contact needs both directions, so it can be expected on no more than ${percent(Math.min(at, back))} of days, before interference, operators and equipment are counted.`,
      );
    }
    const good = windowsOf(result, 0.5);
    findings.push(
      good.length > 0
        ? `Through the day ${f} reaches half the days or more at ${good.join(", ")} UTC.`
        : `At no hour of the day does ${f} reach half the days with ${mode.label}.`,
    );
    const ranked = HF_BANDS.map((item, index) => ({ band: item, cell: best.bands?.[index] }))
      .map((item) => ({ ...item, share: reliability(result, item.cell), ratio: figure(item.cell, "snrDbHz") }))
      .filter((item): item is typeof item & { share: number; cell: PredictionCell } => item.share !== null)
      .sort((a, b) => b.share - a.share || (b.ratio ?? 0) - (a.ratio ?? 0));
    if (ranked.length > 0) {
      findings.push(
        `Best bands at ${utcLabel(best.utc)} UTC: ${ranked
          .slice(0, 3)
          .map((item) => `${item.band.label} (${mhz(item.band.mhz)}) ${percent(item.share)}, ${item.cell.path}, ${whole(item.ratio)} dB`)
          .join("; ")}.`,
      );
    }
  }
  blocks.push({ kind: "heading", text: "The best of it" }, { kind: "list", items: findings });

  // ── The frequency asked about, hour by hour ──
  const withReply = !noMode && result.hours.some((hour) => hour.reply);
  blocks.push({ kind: "heading", text: `${f} hour by hour` });
  const head = [
    "UTC",
    ...(noMode ? [] : ["Rel %"]),
    ...(withReply ? ["Reply %"] : []),
    "SNR dB",
    "Worst",
    "Best",
    "Signal dBm",
    "S-meter",
    "MUF",
    "FOT",
    "Path",
    "Angle",
  ];
  blocks.push({
    kind: "table",
    head,
    // Figures stand to the right of their columns; words to the left.
    right: head.flatMap((name, index) => (name === "UTC" || name === "S-meter" || name === "Path" ? [] : [index])),
    rows: result.hours.map((hour) => {
      const cell = hour.asked;
      const ratio = figure(cell, "snrDbHz");
      const low = figure(cell, "snrLowDb");
      const up = figure(cell, "snrUpDb");
      const signal = figure(cell, "signalDbw");
      return [
        utcLabel(hour.utc),
        ...(noMode ? [] : [share(reliability(result, cell))]),
        ...(withReply ? [share(replyOf(hour))] : []),
        whole(ratio),
        whole(ratio === null || low === null ? null : ratio - low),
        whole(ratio === null || up === null ? null : ratio + up),
        whole(signal === null ? null : dbwToDbm(signal)),
        signal === null ? NO_FIGURE : sMeter(signal),
        isNumber(hour.mufMhz) ? hour.mufMhz.toFixed(1) : NO_FIGURE,
        isNumber(hour.fotMhz) ? hour.fotMhz.toFixed(1) : NO_FIGURE,
        answered(cell) ? cell.path! : NO_FIGURE,
        answered(cell) && isNumber(cell.takeoffDeg) ? `${Math.round(cell.takeoffDeg)}°` : NO_FIGURE,
      ];
    }),
  });
  blocks.push({
    kind: "para",
    text: `${
      noMode
        ? ""
        : `Rel is the share of the month's days on which ${mode.label} reaches what it is taken to need, in per cent${withReply ? "; Reply is the same for the way back" : ""}. `
    }SNR is the median signal-to-noise ratio in 1 Hz, with the ratio on the worst and on the best tenth of days. Signal is the median power at the receiver; the S-meter reading follows the convention that S9 is -73 dBm, which real meters seldom do. MUF (open on half the days) and FOT (on nine days in ten) are in MHz. Path is the hops and the layer that returns the signal; angle is how far above the horizon it leaves. 24:00 is midnight at the end of the day. ${notModelled(result.hours[0]?.asked) ? "There are no figures here because the antenna is not modelled on this frequency (see above); that is not the same as no path." : "A dash is an hour for which the engine gave no figure: it found no path."}`,
  });

  // ── Every band, hour by hour ──
  blocks.push({ kind: "heading", text: "Bands by hour" });
  const hourHeads = result.hours.map((hour) => String(hour.utc).padStart(2, "0"));
  blocks.push({
    kind: "table",
    head: ["UTC", ...hourHeads],
    right: hourHeads.map((_, index) => index + 1),
    rows: HF_BANDS.map((item, index) => [
      item.label,
      ...result.hours.map((hour) => {
        const cell = hour.bands?.[index];
        if (notModelled(cell)) return NOT_MODELLED;
        return noMode ? whole(figure(cell, "snrDbHz")) : share(reliability(result, cell));
      }),
    ]),
  });
  const without = HF_BANDS.filter((_item, index) => result.hours.some((hour) => notModelled(hour.bands?.[index])));
  blocks.push({
    kind: "para",
    text: `${
      noMode
        ? "Each figure is the median signal-to-noise ratio in 1 Hz, in dB, because the mode has no requirement to measure a reliability against. It is"
        : `Each figure is the reliability of ${mode.label} in per cent of days,`
    } on one frequency near the middle of the band (${HF_BANDS.map((item) => `${item.label} ${item.mhz}`).join(", ")} MHz), at the hour UTC above it. A dash is an hour for which the engine gave no figure for that band. Your licence decides which bands you may use.`,
  });
  if (without.length > 0) {
    const why = notModelledOn(result.request.txAntenna, result.request.rxAntenna, without[0]!.mhz);
    blocks.push({
      kind: "para",
      text: `${NOT_MODELLED} is not modelled (${without.map((item) => item.label).join(", ")}): the engine has no model of the antenna on that band, so there is no figure. It is not a poor prediction, and the band is left out of the best bands above. ${why ?? ""}`.trim(),
    });
  }

  const more = otherWords(result);
  if (more.length > 0) blocks.push({ kind: "heading", text: "More that came with the answer" }, { kind: "list", items: more });

  blocks.push({ kind: "heading", text: "Before relying on it" }, { kind: "list", items: sentences(result.limits) });
  blocks.push(
    { kind: "heading", text: "Where these figures come from" },
    {
      kind: "para",
      text: `Worked out by ${result.engine.model}, run by ${result.engine.implementation} (checksum ${result.engine.sha256.slice(0, 16)}), from ${result.datasets.map((item) => `${item.id} ${item.version}`).join("; ")}. Answered on ${longDate.format(new Date(result.computedAt))} at ${new Date(result.computedAt).toISOString().slice(11, 16)} UTC. Key ${result.key}.`,
    },
  );
  return blocks;
}

const footerOf = (result: PredictionResult) =>
  `${result.request.tx.name} to ${result.request.rx.name}, ${mhz(result.request.frequencyMhz)} · VOACAP monthly median for ${monthYear.format(dateOf(result.request.date))}, not the conditions on the day · Outpost`;

export const predictionSheets = (result: PredictionResult, paper: PredictionPaper = "a4"): Sheet[] =>
  toSheets(predictionDocument(result), footerOf(result), paper);

export function predictionPdf(result: PredictionResult, paper: PredictionPaper = "a4"): Uint8Array {
  // Dated by when the engine answered, so that the same answer is the same file (see the top of this file).
  return writePdfPages({ pages: predictionSheets(result, paper), title: predictionTitle(result), created: new Date(result.computedAt) });
}

export const predictionMarkdown = (result: PredictionResult): string => toMarkdown(predictionDocument(result));

/** Characters in the prediction that the PDF's typeface cannot write (a place name in another script). They are printed as "?". */
export const predictionUnwritable = (result: PredictionResult): string[] => unwritable(predictionDocument(result));
