/** How the Supplies screen says things: quantities, dates, reasons. Kept apart so they can be tested on their own. */
import { daysBetween, kcalOfUnit, type LeftOutReason, type ShoppingLine, type ShoppingReason, type SupplyItem } from "@outpost/shared";
import { formatNumber } from "@/lib/utils";

const longDate = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
/** "3 Dec 2026", from a calendar day. */
export const dayWords = (day: string): string => longDate.format(new Date(`${day}T00:00:00Z`));

/** A quantity as people count: whole numbers bare, fractions to two places at most. */
export const amount = (value: number): string => formatNumber(Math.round(value * 100) / 100);

/** "10 tins", "1 tin", "2.5 kg", "3": the unit made plural in the plain English way, and left alone where it is a measure. */
export function quantityWords(quantity: number, unit: string): string {
  const word = unit.trim();
  if (!word) return amount(quantity);
  const measure = /^(g|kg|ml|l|litres?|oz|lb|m|cm)$/i.test(word);
  if (quantity === 1 || measure || /s$/i.test(word)) return `${amount(quantity)} ${word}`;
  const many = /(ch|sh|x|ss)$/i.test(word) ? `${word}es` : /[^aeiou]y$/i.test(word) ? `${word.slice(0, -1)}ies` : `${word}s`;
  return `${amount(quantity)} ${many}`;
}

/** "Use by 3 Dec 2026", "Best before 3 Dec 2026". */
export const dateWords = (item: Pick<SupplyItem, "date" | "dateKind">): string | null =>
  item.date ? `${item.dateKind === "use-by" ? "Use by" : "Best before"} ${dayWords(item.date)}` : null;

/** How far off a date is, as a shelf is checked: "today", "in 3 days", "12 days ago". */
export function whenWords(daysLeft: number): string {
  if (daysLeft === 0) return "today";
  if (daysLeft === 1) return "tomorrow";
  if (daysLeft === -1) return "yesterday";
  if (daysLeft > 0) return daysLeft < 60 ? `in ${daysLeft} days` : `in about ${Math.round(daysLeft / 30)} months`;
  return -daysLeft < 60 ? `${-daysLeft} days ago` : `about ${Math.round(-daysLeft / 30)} months ago`;
}

/** The state of an item's date today, for its row: past use-by is the one that matters most. */
export function dateState(item: Pick<SupplyItem, "date" | "dateKind">, today: string): "past-use-by" | "past-best-before" | "soon" | null {
  if (!item.date) return null;
  const left = daysBetween(today, item.date);
  if (left < 0) return item.dateKind === "use-by" ? "past-use-by" : "past-best-before";
  return left <= 30 ? "soon" : null;
}

/** What one unit holds, for an item's line: "336 kcal each", "2 litres each". */
export function contentWords(item: SupplyItem): string | null {
  if (item.category === "water") return item.litresPerUnit !== null ? `${amount(item.litresPerUnit)} litres each` : null;
  if (item.category === "food" || item.category === "pet-food") {
    const kcal = kcalOfUnit(item);
    return kcal !== null ? `${formatNumber(Math.round(kcal))} kcal each` : null;
  }
  return null;
}

export const LEFT_OUT_WORDS: Record<LeftOutReason, string> = {
  "no-energy": "no energy given",
  "no-litres": "no litres given",
  "past-use-by": "past its use-by",
  "none-left": "none left",
};

export const REASON_WORDS: Record<ShoppingReason, string> = {
  energy: "for the days wanted",
  water: "for the days wanted",
  minimum: "below the minimum you set",
  expired: "to replace what is past its use-by",
  own: "added by you",
};

export const reasonsWords = (reasons: ShoppingReason[]): string => [...new Set(reasons.map((reason) => REASON_WORDS[reason]))].join(", ");

/** A line of the shopping list as it is copied or printed: "5 tins of Baked beans". */
export function lineWords(line: Pick<ShoppingLine, "name" | "quantity" | "unit" | "note">): string {
  if (line.quantity === null) return line.note ? `${line.name}: ${line.note.replace(/^About/, "about")}` : line.name;
  const what = line.unit ? `${quantityWords(line.quantity, line.unit)} of ${line.name}` : `${amount(line.quantity)} × ${line.name}`;
  return line.note ? `${what} (${line.note})` : what;
}

/** The whole list as plain text, for pasting into a message. */
export const shoppingText = (lines: ShoppingLine[]): string => lines.map((line) => `- ${lineWords(line)}`).join("\n");
