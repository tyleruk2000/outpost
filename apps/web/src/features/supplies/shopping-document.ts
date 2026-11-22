/**
 * The shopping list as a printed page, laid out with the print kit: a checklist with a
 * "Got it" and a "To get" box on every line, the lines grouped by the supplies' own
 * categories. The file is dated by the day the list was worked out, so the same list
 * made twice is the same document.
 */
import { categoryLabel, type ShoppingLine, SUPPLY_CATEGORIES, type SupplyItem } from "@outpost/shared";
import type { Content, TDocumentDefinitions } from "pdfmake/interfaces";
import {
  type ChecklistGroup,
  callout,
  checklist,
  measureOf,
  note,
  PRINT_COLOURS,
  type PrintPaper,
  printDocument,
  steps,
} from "@/features/print-kit";
import { appLocale } from "@/lib/region";
import { amount, quantityWords, REASON_WORDS } from "./words";

const longDate = new Intl.DateTimeFormat(appLocale(), { day: "numeric", month: "long", year: "numeric" });
const shortDate = new Intl.DateTimeFormat(appLocale(), { day: "numeric", month: "short", year: "numeric" });

export const shoppingTitle = (workedOutAt: number | null, now: number) =>
  `Shopping list for supplies, ${shortDate.format(workedOutAt ?? now)}`;

const OWN = "Added by you";

/** Which group a line goes under: the category of what it tops up, or the person's own. */
function groupOf(line: ShoppingLine, items: SupplyItem[]): string {
  const item = line.itemId ? items.find((entry) => entry.id === line.itemId) : undefined;
  if (item) return categoryLabel(item.category);
  if (line.source === "own") return OWN;
  if (line.reasons.includes("water")) return categoryLabel("water");
  if (line.reasons.includes("energy")) return categoryLabel("food");
  return categoryLabel("other");
}

/** "5 tins", "2", or what the list says in words where it has no number ("about 21 litres more"). */
function howMuch(line: ShoppingLine): string {
  if (line.quantity === null) return line.note.replace(/^About/, "about");
  return line.unit ? quantityWords(line.quantity, line.unit) : amount(line.quantity);
}

/** The name in bold, then why it is on the list. */
function whatWords(line: ShoppingLine): string {
  const why = [...new Set(line.reasons.filter((reason) => reason !== "own").map((reason) => REASON_WORDS[reason]))].join(", ");
  const kept = line.quantity !== null && line.note ? ` (${line.note})` : "";
  return `**${line.name}**${kept}${why ? `: ${why}` : ""}`;
}

export function shoppingGroups(lines: ShoppingLine[], items: SupplyItem[]): ChecklistGroup[] {
  const order = [...SUPPLY_CATEGORIES.map((category) => category.label as string), OWN];
  const groups = new Map<string, ChecklistGroup>();
  for (const line of lines) {
    const heading = groupOf(line, items);
    if (!groups.has(heading)) groups.set(heading, { heading, rows: [] });
    groups.get(heading)?.rows.push({ what: whatWords(line), amount: howMuch(line) });
  }
  return [...groups.values()].sort((a, b) => order.indexOf(a.heading) - order.indexOf(b.heading));
}

export interface ShoppingDocumentInput {
  lines: ShoppingLine[];
  /** The stock, for each line's category. */
  items: SupplyItem[];
  workedOutAt: number | null;
  now: number;
  paper: PrintPaper;
}

export function shoppingDocument(input: ShoppingDocumentInput): TDocumentDefinitions {
  const measure = measureOf(input.paper);
  const made = input.workedOutAt ?? input.now;
  const count = input.lines.length;
  const content: Content[] = [
    { text: "Supplies", fontSize: 8, bold: true, color: PRINT_COLOURS.accent, characterSpacing: 0.4 },
    { text: "Shopping list", fontSize: 22, bold: true, margin: [0, 2, 0, 2] },
    {
      text: input.workedOutAt
        ? `${count} ${count === 1 ? "thing" : "things"} to buy, worked out on ${longDate.format(input.workedOutAt)} from the supplies kept in Outpost, for the household and the days wanted set there.`
        : `${count} ${count === 1 ? "thing" : "things"} to buy, written out on ${longDate.format(input.now)}.`,
      color: PRINT_COLOURS.muted,
    },
    {
      canvas: [{ type: "line", x1: 0, y1: 0, x2: measure, y2: 0, lineWidth: 1.6, lineColor: PRINT_COLOURS.accent }],
      margin: [0, 8, 0, 12],
    },
    checklist(shoppingGroups(input.lines, input.items)),
    callout("know", "Back home", [
      steps([
        "Tick **Got it** for what you bought, and **To get** for what the shop did not have.",
        "In Outpost, mark each line bought: it goes into the stock with the date on the label.",
        "Work the list out again to see what is still short.",
      ]),
    ]),
    note("Quantities are whole packs of what is already kept, worked out from planning figures for energy and water, not dietary advice."),
  ];
  return printDocument({
    paper: input.paper,
    title: shoppingTitle(input.workedOutAt, input.now),
    made: new Date(made),
    footerName: "Shopping list for supplies",
    footerRight: `Made ${longDate.format(made)}`,
    parts: [{ kind: "plain", content }],
  });
}
