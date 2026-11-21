/**
 * The three norths in words, for someone with a map and a compass: what the figures are,
 * which way, and what to do with a bearing. Kept apart from the screen so the words can be
 * tested on their own.
 */
import { angleInWords, type CompassRule, type MapGrid, magneticModelInfo, type Norths } from "@outpost/shared";

/** "With an Ordnance Survey map here", "With a UTM map here, zone 31U", "With a map drawn to true north here". */
export function mapWords(norths: Norths): string {
  if (norths.convergence === null) return "With a map drawn to true north here";
  if (norths.grid === "utm") return `With a UTM map here, zone ${norths.zone}`;
  if (norths.grid === "ups") return `With a UPS map here (${norths.zone === "UPS N" ? "north" : "south"} polar)`;
  return "With an Ordnance Survey map here";
}

/** Why no grid north is given, when the grid asked for has none here; null when none was asked for. */
export function noGridSentence(asked: MapGrid): string | null {
  if (asked === "osgb") return "There is no Ordnance Survey grid here, so only true and magnetic north are given.";
  if (asked === "utm") return "Grid north is not defined at the pole itself, so only true and magnetic north are given.";
  return null;
}

export function monthYear(at: number): string {
  return new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" }).format(at);
}

/** "Magnetic north is 0.6° west of true north here, in November 2026, moving about 0.2° east a year." */
export function declinationSentence(declination: number, perYear: number, at: number): string {
  const angle = angleInWords(declination);
  const where = angle.startsWith("0.0°") ? "in line with true north here, to a tenth of a degree" : `${angle} of true north here`;
  const rate = Number(Math.abs(perYear).toFixed(1));
  const moving =
    rate === 0 ? "and hardly moving from year to year" : `moving about ${rate.toFixed(1)}° ${perYear > 0 ? "east" : "west"} a year`;
  return `Magnetic north is ${where}, in ${monthYear(at)}, ${moving}.`;
}

/** "Grid north is 1.0° west of true north here." */
export function convergenceSentence(convergence: number): string {
  const angle = angleInWords(convergence);
  return angle.startsWith("0.0°")
    ? "Grid north is in line with true north here, to a tenth of a degree."
    : `Grid north is ${angle} of true north here.`;
}

/** "Magnetic north is 0.9° east of grid north here." */
export function gridMagneticSentence(angle: number): string {
  const words = angleInWords(angle);
  return words.startsWith("0.0°")
    ? "Magnetic north is in line with grid north here, to a tenth of a degree."
    : `Magnetic north is ${words} of grid north here.`;
}

/** The two lines of the rule: "Map to compass: subtract 1°", or a line saying nothing needs doing. */
export function ruleLines(rule: CompassRule): string[] {
  if (rule.mapToCompass === null || rule.compassToMap === null) {
    return ["Map and compass agree here to within half a degree: use a bearing as it is, either way."];
  }
  return [`Map to compass: ${rule.mapToCompass} ${rule.degrees}°`, `Compass to map: ${rule.compassToMap} ${rule.degrees}°`];
}

/** "1 year and 2 months", "5 months", "less than a month". */
export function lengthOfTime(years: number): string {
  const months = Math.round(Math.abs(years) * 12);
  if (months === 0) return "less than a month";
  const whole = Math.floor(months / 12);
  const rest = months % 12;
  const y = whole === 0 ? "" : `${whole} year${whole === 1 ? "" : "s"}`;
  const m = rest === 0 ? "" : `${rest} month${rest === 1 ? "" : "s"}`;
  return [y, m].filter(Boolean).join(" and ");
}

/** Said when the date is outside the model's years; null inside them. */
export function outOfDateSentence(outsideYears: number | null): string | null {
  if (outsideYears === null) return null;
  const { name, epoch, end } = magneticModelInfo();
  if (outsideYears > 0) {
    return `${name} is for ${epoch} to ${end - 1}, and today is ${lengthOfTime(outsideYears)} past its end. These figures carry its yearly changes on, which its makers do not stand behind: they can be out by a degree or more. A newer Outpost carries the next model.`;
  }
  return `This device's date is ${lengthOfTime(outsideYears)} before ${epoch}, when ${name} begins. Check the device's clock: the figures are the model carried backwards, and can be out by a degree or more.`;
}
