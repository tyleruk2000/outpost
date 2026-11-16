/**
 * The shopping list as pages of a PDF, through the same blocks and writer as the other
 * documents Outpost makes (propagation/plans/document.ts, maps/print/pdf.ts). Each line
 * has a box to tick by hand. The file is dated by the day the list was worked out, so
 * the same list written out twice is the same file.
 */
import type { ShoppingLine } from "@outpost/shared";
import { writePdfPages } from "@/features/maps/print/pdf";
import { type Block, toSheets } from "@/features/propagation/plans/document";
import { lineWords, reasonsWords } from "./words";

const longDate = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric" });
const shortDate = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });

export const shoppingTitle = (workedOutAt: number | null, now: number) =>
  `Shopping list for supplies, ${shortDate.format(workedOutAt ?? now)}`;

export function shoppingDocument(lines: ShoppingLine[], workedOutAt: number | null, now: number): Block[] {
  return [
    { kind: "title", text: "Shopping list for supplies" },
    {
      kind: "para",
      text: workedOutAt
        ? `Worked out on ${longDate.format(workedOutAt)} from the supplies kept in Outpost, for the household and the days wanted set there.`
        : `Written out on ${longDate.format(now)}.`,
    },
    {
      kind: "table",
      head: ["", "What", "Why"],
      rows: lines.map((line) => ["[  ]", lineWords(line), reasonsWords(line.reasons)]),
    },
    {
      kind: "para",
      text: "Quantities are whole packs of what is already kept, worked out from planning figures for energy and water, not dietary advice.",
    },
  ];
}

export function shoppingPdf(lines: ShoppingLine[], workedOutAt: number | null, now: number): Uint8Array {
  return writePdfPages({
    pages: toSheets(shoppingDocument(lines, workedOutAt, now), "Shopping list for supplies · Outpost"),
    title: shoppingTitle(workedOutAt, now),
    created: new Date(workedOutAt ?? now),
  });
}
