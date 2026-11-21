/**
 * A short-range forecast in words from a barometer: the Zambretti forecaster's
 * method, worked from the person's own readings with no connection.
 *
 * The forecaster is a set of three dials sold by Negretti & Zambra from 1915 (patent
 * 6276/1915, designed by E. W. Kitchin). Its directions, as engraved on the Science
 * Museum's example (object 1984-531): "Observe direction of wind, read barometer and
 * note whether rising, falling or steady. Set dials accordingly and the forecast appears
 * where indicated. Arrow points between two forecasts, combine the two. When temperature
 * low enough, for rain read snow. Winter, October – March inclusive. Summer, April –
 * September inclusive."
 *
 * No scan of the dial's own scales was found. The letters, their words and the pressure
 * at which each letter shows for a falling, steady and rising barometer are those
 * Meteormetrics Ltd read off the instrument and published in "Short-Range Local
 * Forecasting with a Digital Barograph using an Algorithm based on the Zambretti
 * Forecaster", tables 1a to 1c (archived copy of meteormetrics.com/zambretti.htm, read
 * 21 November 2026). Outpost uses those tables as they are, not the straight lines the
 * paper fits to them: the letter is the one listed at the pressure nearest the reading.
 *
 * The paper says the dial moves a forecast "by up to 1 forecast unit" better for a
 * northerly wind and "by up to 2 Z units" worse for a southerly, and about one unit
 * between summer and winter. It gives no table for either, so Outpost does not move the
 * forecast: it names the neighbouring forecasts the wind could move it to.
 */

/** The 26 forecasts, by letter, in the words of the Meteormetrics paper. */
export const ZAMBRETTI_WORDS = {
  A: "Settled fine",
  B: "Fine weather",
  C: "Becoming fine",
  D: "Fine, becoming less settled",
  E: "Fine, possibly showers",
  F: "Fairly fine, improving",
  G: "Fairly fine, possibly showers early",
  H: "Fairly fine, showery later",
  I: "Showery early, improving",
  J: "Changeable, mending",
  K: "Fairly fine, showers likely",
  L: "Rather unsettled, clearing later",
  M: "Unsettled, probably improving",
  N: "Showery, bright intervals",
  O: "Showery, becoming more unsettled",
  P: "Changeable, some rain",
  Q: "Unsettled, short fine intervals",
  R: "Unsettled, rain later",
  S: "Unsettled, rain at times",
  T: "Very unsettled, finer at times",
  U: "Rain at times, worse later",
  V: "Rain at times, becoming very unsettled",
  W: "Rain at frequent intervals",
  X: "Very unsettled, rain",
  Y: "Stormy, possibly improving",
  Z: "Stormy, much rain",
} as const;
export type ZambrettiLetter = keyof typeof ZAMBRETTI_WORDS;

/** Tables 1a to 1c of the paper: each letter and the sea-level pressure, hPa, at which the dial shows it. Best first. */
export const ZAMBRETTI_SERIES: Record<"falling" | "steady" | "rising", ReadonlyArray<readonly [ZambrettiLetter, number]>> = {
  falling: [
    ["A", 1050],
    ["B", 1040],
    ["D", 1024],
    ["H", 1018],
    ["O", 1010],
    ["R", 1004],
    ["U", 998],
    ["V", 991],
    ["X", 985],
  ],
  steady: [
    ["A", 1033],
    ["B", 1023],
    ["E", 1014],
    ["K", 1008],
    ["N", 1000],
    ["P", 994],
    ["S", 989],
    ["W", 981],
    ["X", 974],
    ["Z", 960],
  ],
  rising: [
    ["A", 1030],
    ["B", 1022],
    ["C", 1012],
    ["F", 1007],
    ["G", 1000],
    ["I", 995],
    ["J", 990],
    ["L", 984],
    ["M", 978],
    ["Q", 970],
    ["T", 965],
    ["Y", 959],
    ["Z", 947],
  ],
};

export const ZAMBRETTI_SOURCE = {
  instrument:
    "Negretti & Zambra, weather forecaster, patent 6276/1915: Science Museum Group collection, object 1984-531 (collection.sciencemuseumgroup.org.uk/objects/co54425)",
  instrumentUrl: "https://collection.sciencemuseumgroup.org.uk/objects/co54425",
  tables:
    "Meteormetrics Ltd, “Short-Range Local Forecasting with a Digital Barograph using an Algorithm based on the Zambretti Forecaster”, tables 1a–1c",
  tablesUrl: "http://web.archive.org/web/20160213225210/http://meteormetrics.com/zambretti.htm",
  read: "2026-11-21",
} as const;

/** The sixteen points of the compass a wind is given in, and where each sits in degrees. */
export const WIND_POINTS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"] as const;
export type WindPoint = (typeof WIND_POINTS)[number];
const NORTHERLY: readonly WindPoint[] = ["NW", "NNW", "N", "NNE", "NE"];
const SOUTHERLY: readonly WindPoint[] = ["SE", "SSE", "S", "SSW", "SW"];

/**
 * How Outpost reads the tendency for the dial, which has only "rising", "steady" and
 * "falling". A change of less than 1.6 hPa in three hours (the Met Office's "steady" and
 * "slowly") is read as steady, as a household barometer's needle barely moves that much;
 * this is Outpost's choice, and the screen gives the other reading beside it.
 */
export const ZAMBRETTI_STEADY_BELOW_HPA = 1.6;

export interface ZambrettiAnswer {
  letter: ZambrettiLetter;
  words: string;
  trend: "falling" | "steady" | "rising";
  /** The sea-level pressure it was read at, hPa. */
  hpa: number;
  /** The reading is above or below every pressure in the series: the dial's scale ends there. */
  outsideScale: "above" | "below" | null;
  /** What a northerly or southerly wind could move it to, per the paper: one better, or up to two worse. */
  wind: { direction: "northerly" | "southerly"; letters: Array<{ letter: ZambrettiLetter; words: string }> } | null;
}

/** The dial's forecast for a sea-level pressure and a trend, with what the wind could move it to. */
export function zambretti(hpa: number, trend: ZambrettiAnswer["trend"], wind: WindPoint | null = null): ZambrettiAnswer {
  const series = ZAMBRETTI_SERIES[trend];
  let best = 0;
  for (let index = 1; index < series.length; index += 1) {
    if (Math.abs(series[index]![1] - hpa) < Math.abs(series[best]![1] - hpa)) best = index;
  }
  const top = series[0]![1];
  const bottom = series[series.length - 1]![1];
  const letter = series[best]![0];
  const neighbours = (indices: number[]): Array<{ letter: ZambrettiLetter; words: string }> =>
    indices.flatMap((index) => {
      const entry = series[index];
      return entry ? [{ letter: entry[0], words: ZAMBRETTI_WORDS[entry[0]] as string }] : [];
    });
  const windAnswer: ZambrettiAnswer["wind"] =
    wind && NORTHERLY.includes(wind)
      ? { direction: "northerly", letters: neighbours([best - 1]) }
      : wind && SOUTHERLY.includes(wind)
        ? { direction: "southerly", letters: neighbours([best + 1, best + 2]) }
        : null;
  return {
    letter,
    words: ZAMBRETTI_WORDS[letter],
    trend,
    hpa,
    outsideScale: hpa > top ? "above" : hpa < bottom ? "below" : null,
    wind: windAnswer && windAnswer.letters.length > 0 ? windAnswer : null,
  };
}

/** The dial's trend for a three-hour change, hPa (positive is rising), by Outpost's reading above. */
export function zambrettiTrend(change: number): ZambrettiAnswer["trend"] {
  const rounded = Math.round(change * 10) / 10;
  if (Math.abs(rounded) < ZAMBRETTI_STEADY_BELOW_HPA) return "steady";
  return rounded > 0 ? "rising" : "falling";
}

/** The other trend a "slowly" change could be read as, for the line beside the forecast; null when the reading is plain. */
export function zambrettiOtherTrend(change: number): ZambrettiAnswer["trend"] | null {
  const rounded = Math.round(change * 10) / 10;
  if (rounded === 0 || Math.abs(rounded) >= ZAMBRETTI_STEADY_BELOW_HPA) return null;
  return rounded > 0 ? "rising" : "falling";
}

/** Summer on the dial is April to September inclusive, winter October to March (the engraved directions). `month` counts from 0, as `Date` does. */
export const zambrettiSeason = (month: number): "summer" | "winter" => (month >= 3 && month <= 8 ? "summer" : "winter");
