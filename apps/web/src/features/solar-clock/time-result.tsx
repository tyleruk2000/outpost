/**
 * A recovered time as the calculators write an answer: the time on the chosen clock to
 * no more figures than the method deserves, the range, the one sentence on where the
 * range comes from, and anything the person should know about it.
 */
import type { IsoDate } from "@/features/maps/lib/sun";
import type { ClockStyle } from "@/lib/clock";
import { Result } from "../tools/kit";
import { halfWidth, type Outcome } from "./recovery";
import { clockAt, giveOrTake, stepFor, type ZoneChoice, zoneWords } from "./zone";

export interface TimeWords {
  figure: string;
  sentence: string;
  low: string;
  high: string;
}

/** The answer in words: "12:05", and "… 12:05, give or take 10 minutes (between 11:55 and 12:15)". */
export function timeWords(outcome: Extract<Outcome, { ok: true }>, zone: ZoneChoice, style: ClockStyle, date: IsoDate): TimeWords {
  const { estimate } = outcome;
  const width = halfWidth(estimate);
  const step = stepFor(width);
  const figure = clockAt(estimate.at, zone, style, date, step);
  const low = clockAt(estimate.low, zone, style, date, step, "down");
  const high = clockAt(estimate.high, zone, style, date, step, "up");
  return { figure, low, high, sentence: `${figure}, ${giveOrTake(width)} (between ${low} and ${high})` };
}

export function TimeResult({
  outcome,
  label,
  lead,
  zone,
  style,
  date,
  keepTitle,
}: {
  outcome: Outcome | null;
  /** What the time is: "The time to set at the shortest shadow". */
  label: string;
  /** The sentence the time ends: "At the moment the shadow is shortest, the clock should read". */
  lead: string;
  zone: ZoneChoice;
  style: ClockStyle;
  date: IsoDate;
  keepTitle: string;
}) {
  if (outcome === null) return <Result label={label} figure={null} />;
  if (!outcome.ok) return <Result label={label} figure="" refusal={outcome.reason} />;
  const words = timeWords(outcome, zone, style, date);
  const clock = zoneWords(zone, outcome.estimate.at);
  return (
    <Result
      label={`${label}, on ${clock}`}
      figure={words.figure}
      keep={{
        title: keepTitle,
        lines: [`${lead} ${words.sentence}, on ${clock}.`, outcome.estimate.because, ...outcome.estimate.warnings],
      }}
    >
      <p>
        {lead} {words.sentence}.
      </p>
      <p className="mt-1 text-small text-ink-muted">{outcome.estimate.because}</p>
      {outcome.estimate.warnings.length > 0 ? (
        <ul className="mt-2 grid gap-1 text-small text-warning">
          {outcome.estimate.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      ) : null}
    </Result>
  );
}
