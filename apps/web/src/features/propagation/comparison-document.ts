/**
 * "The same path with one thing changed", written out: the planner's comparison of one
 * frequency across months, sunspot numbers, powers, antennas or kinds of noise, as a
 * table of the engine's figures by hour for each thing tried.
 *
 * Like the prediction's own pages (prediction-document.ts) it works nothing out: every
 * figure is one the engine returned, a figure that is missing is a dash, and the file
 * is dated by the prediction it was compared from, so that the same comparison written
 * out twice is the same file.
 */
import { bandOf, COMPARISONS, type CompareResult, type PredictionResult } from "@outpost/shared";
import { appLocale } from "@/lib/region";
import { type Block, toMarkdown } from "./plans/document";
import { APPROXIMATE, APPROXIMATE_KEY, NO_FIGURE, NOT_MODELLED } from "./prediction-document";

const longDate = new Intl.DateTimeFormat(appLocale(), { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const shortDate = new Intl.DateTimeFormat(appLocale(), { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const dateOf = (iso: string) => new Date(`${iso}T00:00:00Z`);
const mhz = (value: number) => `${value.toFixed(value >= 10 ? 1 : 2)} MHz`;
const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

const chosenOf = (comparison: CompareResult) => COMPARISONS.find((item) => item.id === comparison.what);

/** "HF comparison, London to Edinburgh, 20 m, months of the year, for 16 Nov 2026" */
export function comparisonTitle(result: PredictionResult, comparison: CompareResult): string {
  const { tx, rx, date, frequencyMhz } = result.request;
  const what = (chosenOf(comparison)?.label ?? comparison.what).toLowerCase();
  return `HF comparison, ${tx.name} to ${rx.name}, ${bandOf(frequencyMhz)?.label ?? mhz(frequencyMhz)}, ${what}, for ${shortDate.format(dateOf(date))}`;
}

export function comparisonDocument(result: PredictionResult, comparison: CompareResult): Block[] {
  const { request } = result;
  const chosen = chosenOf(comparison);
  const f = mhz(comparison.frequencyMhz);
  const band = bandOf(comparison.frequencyMhz);
  const { mode } = comparison;
  const hours = Array.from({ length: 24 }, (_, index) => String(index + 1).padStart(2, "0"));
  const right = hours.map((_, index) => index + 1);
  type Series = CompareResult["series"][number];
  // A series whose antenna is not modelled on the frequency has no figures (its zeros are blanks); one that is approximate is marked.
  const byHour = (series: Series, values: unknown, write: (value: number) => string) =>
    hours.map((_, index) => {
      if (series.notModelled) return NOT_MODELLED;
      const value = Array.isArray(values) ? values[index] : undefined;
      return isNumber(value) ? `${series.approximate ? APPROXIMATE : ""}${write(value)}` : NO_FIGURE;
    });
  const anyApproximate = comparison.series.some((series) => series.approximate);
  const anyNotModelled = comparison.series.some((series) => series.notModelled);
  const keys = [
    ...(anyApproximate ? [APPROXIMATE_KEY] : []),
    ...(anyNotModelled
      ? [`${NOT_MODELLED} is not modelled: the antenna of that row is a wire shorter than a half-wave here, so there is no figure.`]
      : []),
  ].join(" ");
  const withKeys = (text: string) => (keys ? `${text} ${keys}` : text);

  return [
    {
      kind: "title",
      text: `HF comparison: ${request.tx.name} to ${request.rx.name}, ${f}${band ? ` (${band.label})` : ""}, ${(chosen?.label ?? comparison.what).toLowerCase()}`,
    },
    {
      kind: "para",
      text: `${chosen?.reading ?? "The same path with one thing changed."} Everything else is as in the prediction for ${longDate.format(dateOf(request.date))}: ${request.powerWatts} W, ${mode.label}${
        mode.requiredSnrDbHz === null ? "" : `, taken to need ${mode.requiredSnrDbHz} dB in 1 Hz`
      }. The model works by month.`,
    },
    { kind: "para", text: `${comparison.basis.summary} It is not a reading of the ionosphere on the day.` },
    { kind: "heading", text: "What was tried" },
    {
      kind: "table",
      head: ["", "What was changed", "Sunspot number", "foF2 at 12:00 UTC, MHz"],
      right: [2, 3],
      rows: comparison.series.map((series) => [
        series.label,
        `${series.notModelled ? "Not modelled on this frequency. " : series.approximate ? "Approximate on this frequency. " : ""}${series.detail}`,
        isNumber(series.ssn) ? String(series.ssn) : NO_FIGURE,
        isNumber(series.foF2?.[11]) ? series.foF2[11]!.toFixed(1) : NO_FIGURE,
      ]),
    },
    { kind: "heading", text: `Reliability of ${f} by hour` },
    {
      kind: "table",
      head: ["UTC", ...hours],
      right,
      rows: comparison.series.map((series) => [
        series.label,
        ...byHour(series, series.reliability, (value) => String(Math.round(value * 100))),
      ]),
    },
    {
      kind: "para",
      text: withKeys(
        `Each figure is the share of the month's days on which ${mode.label} reaches what it is taken to need, in per cent, at the hour UTC above it (24 is midnight at the end of the day). A dash is an hour for which the engine gave no figure.`,
      ),
    },
    { kind: "heading", text: "Median signal-to-noise ratio by hour" },
    {
      kind: "table",
      head: ["UTC", ...hours],
      right,
      rows: comparison.series.map((series) => [series.label, ...byHour(series, series.snrDbHz, (value) => String(Math.round(value)))]),
    },
    { kind: "para", text: withKeys("In dB, in a 1 Hz bandwidth.") },
    { kind: "heading", text: "The path's MUF by hour" },
    {
      kind: "table",
      head: ["UTC", ...hours],
      right,
      // The MUF does not depend on the antenna: it is the engine's for every series.
      rows: comparison.series.map((series) => [
        series.label,
        ...byHour({ ...series, notModelled: undefined, approximate: undefined }, series.mufMhz, (value) => String(Math.round(value))),
      ]),
    },
    { kind: "para", text: "In MHz, to the nearest whole one: the frequency below which the path is open on half the days of the month." },
    { kind: "heading", text: "Before relying on it" },
    { kind: "list", items: (result.limits ?? []).filter((item) => typeof item === "string") },
    { kind: "heading", text: "Where these figures come from" },
    {
      kind: "para",
      text: `Worked out by ${comparison.engine.model}, run by ${comparison.engine.implementation} (checksum ${comparison.engine.sha256.slice(0, 16)}). Compared from the prediction answered on ${longDate.format(new Date(result.computedAt))} at ${new Date(result.computedAt).toISOString().slice(11, 16)} UTC, key ${result.key}.`,
    },
  ];
}

export const comparisonMarkdown = (result: PredictionResult, comparison: CompareResult): string =>
  toMarkdown(comparisonDocument(result, comparison));
