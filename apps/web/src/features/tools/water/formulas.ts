/**
 * The sums behind the water calculators. Volumes in litres, areas in square metres,
 * rainfall in millimetres. The planning figures and the treatment guidance are quoted
 * from their sources in `guidance.ts`.
 */

/** Water to store for a household: people × days × litres each a day. */
export const storageLitres = (people: number, days: number, litresPerPersonDay: number): number => people * days * litresPerPersonDay;

/**
 * Rain collected from a roof: plan area × rainfall × run-off coefficient × filter
 * efficiency. One millimetre of rain on one square metre is one litre. This is the
 * yield formula of BS 8515 (YR = A × e × h × η), without its 0.05 for sizing a tank.
 */
export function rainYieldLitres(planAreaM2: number, rainfallMm: number, runoff: number, filterEfficiency: number): number {
  return planAreaM2 * rainfallMm * runoff * filterEfficiency;
}

export interface FilterLife {
  /** Days until the rated volume is used, at the daily use given. */
  daysByVolume: number;
  /** Days until the maker's time limit, if one was given. */
  daysByTime: number | null;
  /** The sooner of the two. */
  days: number;
  /** Which limit comes first. */
  limit: "volume" | "time";
}

/**
 * How long a filter lasts, from the figures on its own label: the volume it is rated for
 * and, where the maker gives one, the longest it may be used for once started.
 */
export function filterLife(ratedLitres: number, alreadyLitres: number, dailyLitres: number, maxDays: number | null): FilterLife {
  const daysByVolume = Math.max(0, ratedLitres - alreadyLitres) / dailyLitres;
  const daysByTime = maxDays;
  const timeFirst = daysByTime !== null && daysByTime < daysByVolume;
  return { daysByVolume, daysByTime, days: timeFirst ? daysByTime : daysByVolume, limit: timeFirst ? "time" : "volume" };
}

/** Altitude above which the EPA and the CDC say to boil for three minutes instead of one, in metres (5,000 ft and 6,500 ft). */
export const EPA_THREE_MINUTES_ABOVE_M = 5000 * 0.3048;
export const CDC_THREE_MINUTES_ABOVE_M = 6500 * 0.3048;

export interface BoilAdvice {
  minutes: 1 | 3;
  /** Whose threshold decided it, in words. */
  why: string;
}

/**
 * How long to keep water at a rolling boil at a height, by US guidance: one minute, or
 * three above 5,000 ft (EPA) or 6,500 ft (CDC). Where the two differ, the longer time is
 * given. UK and WHO guidance say only to bring it to a rolling boil.
 */
export function boilAdvice(heightMeters: number): BoilAdvice {
  if (heightMeters > CDC_THREE_MINUTES_ABOVE_M)
    return { minutes: 3, why: "above 6,500 ft (about 1,980 m), where both the CDC and the EPA say three minutes" };
  if (heightMeters > EPA_THREE_MINUTES_ABOVE_M) {
    return { minutes: 3, why: "above 5,000 ft (about 1,520 m), where the EPA says three minutes; the CDC's threshold is higher, 6,500 ft" };
  }
  return { minutes: 1, why: "below 5,000 ft (about 1,520 m)" };
}
