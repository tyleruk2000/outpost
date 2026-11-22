/**
 * A forecast in words from the person's own barometer readings, by the Zambretti
 * forecaster's tables: worked out here, with no connection, from the latest sea-level
 * pressure, its three-hour tendency and a wind direction the person gives. Shown with
 * the readings it used, its source, and where it does not hold.
 */
import {
  ageWords,
  type Tendency,
  WIND_POINTS,
  type WindPoint,
  ZAMBRETTI_SOURCE,
  zambretti,
  zambrettiOtherTrend,
  zambrettiSeason,
  zambrettiTrend,
} from "@outpost/shared";
import { useState } from "react";
import { Select } from "@/components/ui/misc";
import { formatDateTime } from "@/lib/utils";

const WIND_KEY = "outpost.weather.zambrettiWind";

function storedWind(): WindPoint | "none" {
  try {
    const stored = localStorage.getItem(WIND_KEY);
    return (WIND_POINTS as readonly string[]).includes(stored ?? "") ? (stored as WindPoint) : "none";
  } catch {
    return "none";
  }
}

const TREND_WORDS = { rising: "rising", steady: "steady", falling: "falling" } as const;

/**
 * `homeLat` is the home place's latitude when there is one, to say plainly when the dial
 * was not made for it. `readingWind` is the wind noted with the latest reading: the dial
 * starts from it when there is one, and from the last wind chosen here when not.
 */
export function ZambrettiForecast({
  tendency,
  now,
  homeLat,
  readingWind = null,
}: {
  tendency: Tendency;
  now: number;
  homeLat: number | null;
  readingWind?: WindPoint | null;
}) {
  const [wind, setWindState] = useState<WindPoint | "none">(() => readingWind ?? storedWind());
  const setWind = (next: WindPoint | "none") => {
    setWindState(next);
    try {
      localStorage.setItem(WIND_KEY, next);
    } catch {
      // Remembering the wind is a convenience.
    }
  };
  const trend = zambrettiTrend(tendency.change);
  const other = zambrettiOtherTrend(tendency.change);
  const answer = zambretti(tendency.to.hpa, trend, wind === "none" ? null : wind);
  const otherAnswer = other ? zambretti(tendency.to.hpa, other, wind === "none" ? null : wind) : null;
  const season = zambrettiSeason(new Date(tendency.to.takenAt).getMonth());
  const ageHours = (now - tendency.to.takenAt) / 3_600_000;

  return (
    <section aria-labelledby="zambretti-heading">
      <h3 id="zambretti-heading" className="text-body font-semibold text-ink">
        A forecast from your readings
      </h3>
      <p className="mt-1 text-lead text-ink" data-testid="zambretti">
        {answer.words}
        {answer.outsideScale ? <span className="text-body text-ink-muted"> (the pressure is off the dial's scale)</span> : null}
      </p>
      <p className="mt-1 max-w-[70ch] text-small text-ink-muted">
        Zambretti letter {answer.letter}, for <span className="tabular">{tendency.to.hpa.toFixed(1)} hPa</span> at sea level and{" "}
        {TREND_WORDS[trend]} (
        <span className="tabular">
          {tendency.rounded > 0 ? "+" : ""}
          {tendency.rounded.toFixed(1)} hPa
        </span>{" "}
        from {formatDateTime(tendency.from.takenAt)} to {formatDateTime(tendency.to.takenAt)}),{" "}
        {wind === "none" ? "with no wind direction" : `wind from ${wind}`}. A rule of thumb for the next twelve hours or so, not a forecast
        to act on.
      </p>
      {otherAnswer && other ? (
        <p className="mt-1 max-w-[70ch] text-small text-ink">
          A change under 1.6 hPa is read as steady. Read as {TREND_WORDS[other]}, the dial gives: {otherAnswer.words}.
        </p>
      ) : null}
      {answer.wind ? (
        <p className="mt-1 max-w-[70ch] text-small text-ink">
          {answer.wind.direction === "northerly"
            ? `A northerly wind can make the dial read up to one better: ${answer.wind.letters[0]!.words}.`
            : `A southerly wind can make the dial read up to two worse: ${answer.wind.letters.map((entry) => entry.words).join("; or ")}.`}
        </p>
      ) : null}
      {ageHours > 12 ? (
        <p className="mt-1 text-small text-warning">
          The latest reading is {ageWords(now - tendency.to.takenAt)} old, so this forecast is for a time that has passed. Take a new
          reading.
        </p>
      ) : null}
      {homeLat !== null && homeLat < 0 ? (
        <p className="mt-1 text-small text-warning">
          Home is in the southern hemisphere. The dial was made for the northern, and these tables do not hold there.
        </p>
      ) : null}
      <div className="mt-3 grid max-w-64 gap-1.5">
        <span id="zambretti-wind" className="text-small font-medium text-ink">
          Wind from
        </span>
        <Select
          aria-label="Wind from"
          value={wind}
          onChange={setWind}
          options={[
            { value: "none" as const, label: "Not known, or calm" },
            ...WIND_POINTS.map((point) => ({ value: point, label: point })),
          ]}
        />
      </div>
      <details className="mt-3 max-w-[70ch] text-small">
        <summary className="min-h-11 cursor-pointer py-2 font-medium text-primary">How this is worked out, and how far to trust it</summary>
        <p className="text-ink">
          Negretti & Zambra sold the Zambretti forecaster, a set of dials, from 1915. You set it to the wind, the barometer reading reduced
          to sea level and whether the barometer is rising, steady or falling, and a letter from A (settled fine) to Z (stormy, much rain)
          appears. The directions engraved on the{" "}
          <a className="text-primary underline underline-offset-2" href={ZAMBRETTI_SOURCE.instrumentUrl} target="_blank" rel="noreferrer">
            Science Museum's example
          </a>{" "}
          say: "Arrow points between two forecasts, combine the two. When temperature low enough, for rain read snow. Winter, October –
          March inclusive. Summer, April – September inclusive."
        </p>
        <p className="mt-2 text-ink">
          No scan of the dial's scales was found. The letters and the pressure at which each shows are the ones Meteormetrics read off the
          instrument (
          <a className="text-primary underline underline-offset-2" href={ZAMBRETTI_SOURCE.tablesUrl} target="_blank" rel="noreferrer">
            {ZAMBRETTI_SOURCE.tables}
          </a>
          , read {ZAMBRETTI_SOURCE.read}). Outpost gives the letter listed at the pressure nearest your reading. The paper says a northerly
          wind moves the dial up to one forecast better and a southerly up to two worse, and that a falling barometer reads about one worse
          in summer than in winter and a rising one about one better. It gives no table for these, so Outpost names the neighbouring
          forecasts rather than moving the answer. It is {season} on the dial's reckoning.
        </p>
        <p className="mt-2 text-ink">
          Where it does not hold: it was made for the British Isles and places like them in the northern temperate latitudes, not the
          southern hemisphere or the tropics. It needs a sea-level reading (Outpost reduces yours with the height you gave). It knows
          nothing of the weather elsewhere, so it cannot see a front or a storm coming that the pressure has not yet felt. Claims of 90 or
          94 per cent accuracy are made by sellers of instruments and were not checked by anyone independent. A forecast or a warning from a
          weather service is the thing to act on.
        </p>
      </details>
    </section>
  );
}
