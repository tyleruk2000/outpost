/**
 * The words and figures of the Weather and hazards screen, kept apart from the screen so
 * that they can be tested: a day of forecast in plain words, units, and what a river
 * level is beside its usual range.
 */
import { cToF, type ForecastDay, type ForecastHour, kmhToMph, type RiverStation, weatherWords } from "@outpost/shared";

export type WindUnit = "kmh" | "mph";
export type TempUnit = "c" | "f";

export const windText = (kmh: number | null, unit: WindUnit): string =>
  kmh === null ? "no figure" : unit === "mph" ? `${Math.round(kmhToMph(kmh))} mph` : `${Math.round(kmh)} km/h`;
export const tempText = (c: number | null, unit: TempUnit): string =>
  c === null ? "no figure" : unit === "f" ? `${Math.round(cToF(c))} °F` : `${Math.round(c)} °C`;
export const tempValue = (c: number, unit: TempUnit): number => (unit === "f" ? cToF(c) : c);

/** "Moderate rain. 5 to 13 °C. 15.2 mm of rain or snow; the chance of some is 100%. Wind up to 23 km/h, gusts to 49 km/h." */
export function daySentence(day: ForecastDay, wind: WindUnit, temp: TempUnit): string {
  const parts = [`${weatherWords(day.code)}.`];
  if (day.minC !== null && day.maxC !== null)
    parts.push(`${tempText(day.minC, temp).replace(/ °[CF]$/, "")} to ${tempText(day.maxC, temp)}.`);
  if (day.precipMm !== null) {
    const chance = day.precipChance === null ? "" : `; the chance of some is ${Math.round(day.precipChance)}%`;
    parts.push(day.precipMm < 0.1 ? `Little or no rain or snow${chance}.` : `${day.precipMm.toFixed(1)} mm of rain or snow${chance}.`);
  }
  if (day.windMaxKmh !== null) {
    parts.push(
      `Wind up to ${windText(day.windMaxKmh, wind)}${day.gustMaxKmh !== null ? `, gusts to ${windText(day.gustMaxKmh, wind)}` : ""}.`,
    );
  }
  return parts.join(" ");
}

/** The hours from `now` to the end of the forecast. A forecast's past hours are not what is expected. */
export const hoursAhead = (hours: ForecastHour[], now: number): ForecastHour[] => hours.filter((hour) => hour.t + 3_600_000 > now);

/** Days from today (UTC) onward. */
export const daysAhead = (days: ForecastDay[], now: number): ForecastDay[] => {
  const today = new Date(now).toISOString().slice(0, 10);
  return days.filter((day) => day.date >= today);
};

/** Where a river's latest level sits against the range the Environment Agency calls typical there. */
export function levelWords(station: RiverStation): string | null {
  if (!station.latest || station.typicalLow === null || station.typicalHigh === null) return null;
  const value = station.latest.value;
  if (value > station.typicalHigh) return "above its typical range";
  if (value < station.typicalLow) return "below its typical range";
  return "within its typical range";
}

const weekday = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
/** "Tuesday 17 November", for a UTC calendar day. */
export const dayName = (date: string): string => weekday.format(Date.parse(`${date}T12:00:00Z`));
