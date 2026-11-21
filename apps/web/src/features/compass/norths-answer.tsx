/**
 * The answer of "North here": first the one thing a person with a map and a compass does
 * (add or subtract so many degrees, each way), then the three norths it comes from, each
 * in a sentence, and any warning about the model's years or a magnetic pole.
 */
import { compassRule, type MapGrid, type Norths } from "@outpost/shared";
import { Notice } from "@/components/page";
import { KeepButtons } from "../tools/kit";
import {
  convergenceSentence,
  declinationSentence,
  gridMagneticSentence,
  mapWords,
  noGridSentence,
  outOfDateSentence,
  ruleLines,
} from "./words";

export function NorthsAnswer({
  norths,
  at,
  placeName,
  grid = "osgb",
}: {
  norths: Norths;
  at: number;
  placeName: string;
  /** The grid asked for, to say why there is none when there is none. */
  grid?: MapGrid;
}) {
  const { field, convergence, gridMagneticAngle } = norths;
  const onGrid = gridMagneticAngle !== null && convergence !== null;
  const rule = compassRule(onGrid ? gridMagneticAngle : norths.declination);
  const lines = ruleLines(rule);
  const sentences = [
    declinationSentence(norths.declination, field.declinationPerYear, at),
    ...(onGrid ? [convergenceSentence(convergence), gridMagneticSentence(gridMagneticAngle)] : []),
  ];
  const stale = outOfDateSentence(field.outsideYears);
  const uncertainty = Number(field.declinationUncertainty.toFixed(1));

  return (
    <>
      {stale ? (
        <Notice tone="warning" title="The magnetic model is out of date for this date" className="mb-4">
          {stale}
        </Notice>
      ) : null}
      {field.zone ? (
        <Notice
          tone="warning"
          title={field.zone === "blackout" ? "A compass cannot be trusted here" : "A compass may be unreliable here"}
          className="mb-4"
        >
          {field.zone === "blackout"
            ? "This place is in NOAA's blackout zone round a magnetic pole, where the field is nearly vertical: a needle wanders and the declination can be out by anything up to 180°."
            : "This place is near a magnetic pole (NOAA's caution zone), where the field is weak along the ground and a compass reading can be out by more than a degree."}
        </Notice>
      ) : null}
      <div className="rounded-panel bg-surface px-4 py-3">
        <div aria-live="polite" aria-atomic="true">
          <p className="text-small text-ink-muted">{mapWords(norths)}</p>
          <ul className="mt-1 grid gap-0.5">
            {lines.map((line) => (
              <li
                key={line}
                className={lines.length > 1 ? "text-heading font-semibold text-ink tabular" : "text-body font-medium text-ink"}
              >
                {line}
              </li>
            ))}
          </ul>
          <div className="mt-2 grid gap-1 text-body text-ink">
            {sentences.map((sentence) => (
              <p key={sentence}>{sentence}</p>
            ))}
            {onGrid || !noGridSentence(grid) ? null : <p className="text-ink-muted">{noGridSentence(grid)}</p>}
            <p className="text-small text-ink-muted">
              Rounded to whole degrees, as a hand compass is read. The model alone is good to about ±{uncertainty.toFixed(1)}° here.
            </p>
          </div>
        </div>
        <KeepButtons
          title={`North at ${placeName || "this place"}`}
          lines={[
            ...lines,
            ...sentences,
            `From the World Magnetic Model ${field.model.replace("WMM", "")} (NOAA and the British Geological Survey).`,
          ]}
        />
      </div>
    </>
  );
}
