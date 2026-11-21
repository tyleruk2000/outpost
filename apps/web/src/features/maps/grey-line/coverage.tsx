/**
 * The grey line on an HF coverage map: off unless asked for (remembered in this browser,
 * apart from the Maps screen's own switch), and drawn for the hour the map shows on the
 * 15th of the month asked about. VOACAP answers for a month, not a day, so the line is
 * only ever "about" right for any one day of it, and the words under the switch say so.
 */
import { utcLabel } from "@outpost/shared";
import { useId } from "react";
import { Checkbox } from "@/components/ui/misc";
import { appLocale } from "@/lib/region";
import { useStoredState } from "../hooks";

const KEY = "outpost.radio.coverage.greyLine";
const isBoolean = (value: unknown): value is boolean => typeof value === "boolean";

export const useCoverageGreyLine = () => useStoredState(KEY, isBoolean, false);

const monthFormat = new Intl.DateTimeFormat(appLocale(), { timeZone: "UTC", month: "long", year: "numeric" });

/**
 * The moment the line is drawn for: the hour shown (1 to 24, as the engine counts them,
 * so 24 is midnight at the end of the day) on the 15th of the month of `date`.
 */
export function coverageMoment(date: string, utcHour: number): number | null {
  const match = /^(\d{4})-(\d{2})-\d{2}$/.exec(date);
  if (!match) return null;
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, 15, utcHour);
}

/** The switch and, while it is on, what the line is drawn for. */
export function CoverageGreyLine({
  on,
  onChange,
  date,
  utcHour,
}: {
  on: boolean;
  onChange: (on: boolean) => void;
  /** The date the prediction was asked for, YYYY-MM-DD. */
  date: string;
  utcHour: number;
}) {
  const id = useId();
  const at = coverageMoment(date, utcHour);
  return (
    <div className="grid basis-full gap-1">
      <div className="flex min-h-11 items-center gap-3">
        <Checkbox id={id} checked={on} onCheckedChange={(checked) => onChange(checked === true)} aria-describedby={`${id}-when`} />
        <label htmlFor={id} className="text-small text-ink">
          Grey line (day and night)
        </label>
      </div>
      <p id={`${id}-when`} className="text-small text-ink-muted" data-coverage-grey-line>
        {on && at !== null
          ? `Drawn for ${utcLabel(utcHour)} UTC on about the 15th of ${monthFormat.format(at)}. The prediction is for the whole month, so the line is drawn for the middle of it; on other days it lies a little east or west of this, most of all near the equinoxes and far from the equator. Night is shaded under the cells, and the line is where the Sun rises or sets.`
          : "Night shaded and the line where the Sun rises and sets, for the hour shown, in the middle of the month."}
      </p>
    </div>
  );
}
