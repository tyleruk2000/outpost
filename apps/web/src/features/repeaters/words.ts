/** How the repeater screens say things: access, where an entry came from and how old that is, how exact a position is. */
import {
  APPROXIMATE_POSITION_METERS,
  formatAge,
  formatShift,
  formatTone,
  modeName,
  type RepeaterDto,
  type RepeaterListDto,
  repeaterDataAge,
} from "@outpost/shared";
import { formatDistance } from "@/features/maps/lib/geo";
import { formatDate } from "@/lib/utils";

type Access = Pick<RepeaterDto, "ctcssHz" | "dcsCode" | "dmrColourCode" | "talkgroups" | "accessNote">;

/** "CTCSS 94.8 Hz", "DCS 023", "colour code 3": what has to be set to get in, or nothing when the list gives none. */
export function accessParts(repeater: Access): string[] {
  return [
    repeater.ctcssHz !== null ? `CTCSS ${formatTone(repeater.ctcssHz)}` : "",
    repeater.dcsCode !== null ? `DCS ${repeater.dcsCode}` : "",
    repeater.dmrColourCode !== null ? `colour code ${repeater.dmrColourCode}` : "",
  ].filter(Boolean);
}

/** "shift -0.6 MHz", "simplex", or "input not listed": where to transmit, relative to where to listen. */
export function shiftWords(repeater: Pick<RepeaterDto, "outputHz" | "inputHz">): string {
  if (repeater.inputHz === null) return "input not listed";
  if (repeater.inputHz === repeater.outputHz) return "simplex";
  return `shift ${formatShift(repeater.outputHz, repeater.inputHz)}`;
}

/** How many decimal places of a position are worth showing, given how exactly it was listed. */
export function positionDigits(repeater: Pick<RepeaterDto, "positionPrecisionMeters">): number {
  const meters = repeater.positionPrecisionMeters ?? 0;
  return meters >= 5000 ? 1 : meters >= 500 ? 2 : meters >= 50 ? 3 : 5;
}

export const modesLine = (repeater: Pick<RepeaterDto, "modes">) => repeater.modes.map(modeName).join(", ");

export interface SourceReading {
  /** "RSGB ETCC, data of 1 Oct 2026" */
  text: string;
  /** "7 months old": said only once the data is old enough to doubt. */
  age: string | null;
  tone: "neutral" | "warning";
}

/** Where an entry came from and the date of its data, with its age once that is worth a warning. */
export function sourceOf(list: RepeaterListDto | null | undefined, now = Date.now()): SourceReading {
  if (!list) return { text: "Entered by hand", age: null, tone: "neutral" };
  const { days, age } = repeaterDataAge(list.dataDate, now);
  return {
    text: `${list.source || list.name}, data of ${formatDate(list.dataDate)}`,
    age: age === "current" ? null : `${formatAge(days)} old`,
    tone: age === "current" ? "neutral" : "warning",
  };
}

/** What to say about a list's age where there is room for a sentence. Null while the data is recent. */
export function ageWarning(list: RepeaterListDto, now = Date.now()): string | null {
  const { days, age } = repeaterDataAge(list.dataDate, now);
  if (age === "current") return null;
  return age === "very-old"
    ? `This data is ${formatAge(days)} old. Repeaters change tone, frequency and keeper, and close: check anything that matters against a current list.`
    : `This data is ${formatAge(days)} old. Some of it will have changed.`;
}

/** Whether a listed position is too rough to rest an exact answer on. */
export const isApproximate = (repeater: Pick<RepeaterDto, "positionPrecisionMeters">) =>
  (repeater.positionPrecisionMeters ?? 0) >= APPROXIMATE_POSITION_METERS;

/** "to within about 5.56 km" */
export function precisionText(repeater: Pick<RepeaterDto, "positionPrecisionMeters">): string | null {
  const meters = repeater.positionPrecisionMeters;
  if (meters === null || meters <= 0) return null;
  return `to within about ${formatDistance(meters)}`;
}

/** The sentence about a position, wherever an exact place matters. */
export function positionNote(repeater: Pick<RepeaterDto, "positionPrecisionMeters" | "listId">): string {
  const precision = precisionText(repeater);
  if (isApproximate(repeater)) {
    return `The list gives this position only ${precision}: lists blur private sites on purpose. Anything worked out from it, line of sight above all, is rough.`;
  }
  if (repeater.listId) {
    return `A listed position${precision ? `, written ${precision}` : ""}. It has not been checked against the site.`;
  }
  return precision ? `From its locator, ${precision}.` : "As you entered it.";
}
