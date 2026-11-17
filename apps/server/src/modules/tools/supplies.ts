/**
 * Supplies: how many days of food, water and energy the household holds, what is
 * missing, and what is in stock.
 *
 * The outlook is worked out by the same shared functions `GET /api/supplies/outlook`
 * answers with (`supplyOutlook`, `shoppingSuggestions`, `energySummary`), over the same
 * rows the Supplies screen reads (`ctx.services.supplies`).
 */
import {
  categoryLabel,
  energySummary,
  localDay,
  SUPPLY_CATEGORIES,
  type SupplyItem,
  shoppingSuggestions,
  supplyOutlook,
} from "@outpost/shared";
import { z } from "zod";
import { defineTool, pageOf, type ToolDefinition } from "./types.ts";

const NOTHING = "No supplies are recorded in Outpost. They are added under Preparedness → Supplies.";

const days = (value: number | null) => (value === null ? "not known (no daily need set)" : `${value.toFixed(1)} days`);
const fold = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function stockLine(item: SupplyItem): string {
  const date = item.date && item.dateKind ? `, ${item.dateKind === "use-by" ? "use by" : "best before"} ${item.date}` : "";
  const where = item.location ? `, in ${item.location}` : "";
  return `- ${item.name}: ${item.quantity} ${item.unit} (${categoryLabel(item.category)}${where}${date})`;
}

export const supplies = defineTool({
  name: "supplies",
  title: "supplies",
  area: "supplies",
  description:
    "The household's supplies: days of food and water held, energy, and what is missing. Give query or category to list what is in stock by name or kind (food, water, medical, fuel, batteries…).",
  input: z.object({
    query: z.string().trim().min(1).max(80).optional().describe("Words in an item's name, e.g. rice."),
    category: z
      .string()
      .trim()
      .min(1)
      .max(40)
      .optional()
      .describe("A kind of supply: food, water, pet food, fuel, medical, hygiene, batteries, equipment, other."),
    page: z.number().int().min(1).max(50).optional().describe("Which page of the stock list, from 1."),
  }),
  run({ query: askedQuery, category: askedCategory, page }, { ctx, now }) {
    // A query that names a kind of supply is that kind: bonsai-2:2b asked for query "food" and was told nothing matched
    // (docs/ai.md, "Tried with a real model: tools").
    const namesKind = (words: string) =>
      SUPPLY_CATEGORIES.some((entry) => entry.id === fold(words).trim() || fold(entry.label) === fold(words).trim());
    let query = askedQuery;
    let category = askedCategory;
    if (query && namesKind(query) && (!category || fold(category).trim() === fold(query).trim())) {
      category ??= query;
      query = undefined;
    }
    const service = ctx.services.supplies;
    const items = service.items();
    if (items.length === 0) return { held: false, text: NOTHING, url: "/prepare/supplies" };

    const daysLine = () => {
      const outlook = supplyOutlook(items, service.household(), localDay(new Date(now)));
      return `Outlook for all stock: food ${days(outlook.food.days)}, water ${days(outlook.water.days)}, of ${outlook.daysWanted} days wanted.`;
    };

    if (query || category) {
      const wanted = category ? fold(category).trim() : null;
      const cat = wanted
        ? SUPPLY_CATEGORIES.find((entry) => entry.id === wanted || fold(entry.label) === wanted || fold(entry.label).startsWith(wanted))
        : undefined;
      if (wanted && !cat) {
        return {
          held: false,
          text: `"${category}" is not a kind of supply Outpost keeps. The kinds are: ${SUPPLY_CATEGORIES.map((entry) => entry.label.toLowerCase()).join(", ")}.`,
          url: "/prepare/supplies",
        };
      }
      const rows = items
        .filter((item) => !cat || item.category === cat.id)
        .filter((item) => !query || fold(`${item.name} ${item.notes}`).includes(fold(query)))
        .sort((a, b) => a.name.localeCompare(b.name, "en-GB"));
      const asked = [cat ? cat.label.toLowerCase() : null, query ? `"${query}"` : null].filter(Boolean).join(", ");
      if (rows.length === 0) {
        return {
          held: false,
          text: `No supplies held match ${asked}. Stock is added under Preparedness → Supplies.\n${daysLine()}`,
          url: "/prepare/supplies",
        };
      }
      const { shown, line } = pageOf(rows, page ?? 1, 15);
      return {
        held: true,
        label: `stock, ${asked}`,
        url: "/prepare/supplies",
        // The days figures go with every answer: asked "how many days of food", llama3.2:3b asked for the food
        // category, and given only the list, made up a number of days (docs/ai.md, "Tried with a real model: tools").
        text: [`Supplies held (${asked}), as recorded in Outpost:`, ...shown.map(stockLine), line, daysLine()].filter(Boolean).join("\n"),
      };
    }

    const today = localDay(new Date(now));
    const household = service.household();
    const outlook = supplyOutlook(items, household, today);
    const energy = energySummary(outlook, household);
    const missing = shoppingSuggestions(items, household, today);
    const lines = [
      `Supplies outlook for ${today}, from the stock recorded in Outpost: ${outlook.people} ${outlook.people === 1 ? "person" : "people"}, ${outlook.pets} ${outlook.pets === 1 ? "pet" : "pets"}, ${outlook.daysWanted} days wanted.`,
      `Food: ${days(outlook.food.days)} (${outlook.food.items} items counted${outlook.food.leftOut.length > 0 ? `, ${outlook.food.leftOut.length} not counted` : ""}).`,
      `Water: ${days(outlook.water.days)} at ${outlook.water.perDay.toFixed(1)} litres a day (${outlook.water.basis === "all" ? "all uses" : "drinking"}).`,
      outlook.petFood ? `Pet food: ${days(outlook.petFood.days)}.` : null,
      outlook.runsOutFirst ? `Runs out first: ${outlook.runsOutFirst.what}, after ${outlook.runsOutFirst.days.toFixed(1)} days.` : null,
      `Energy: ${energy.sentences.days} ${energy.sentences.uncounted ?? ""}`.trim(),
      outlook.expired.length > 0
        ? `Past use-by (do not eat): ${outlook.expired
            .map((row) => row.name)
            .slice(0, 8)
            .join(", ")}.`
        : null,
      outlook.within[30].length > 0
        ? `Dated within 30 days: ${outlook.within[30]
            .map((row) => `${row.name} (${row.date})`)
            .slice(0, 8)
            .join(", ")}.`
        : null,
      missing.length > 0
        ? `Missing, to reach the days wanted: ${missing
            .slice(0, 8)
            .map((line) => (line.quantity !== null ? `${line.quantity} ${line.unit} ${line.name}` : line.name))
            .join("; ")}${missing.length > 8 ? `; and ${missing.length - 8} more` : ""}.`
        : "Nothing is missing for the days wanted.",
      `By kind: ${outlook.byCategory.map((row) => `${categoryLabel(row.category)} ${row.rows}`).join(", ")}. Ask with category or query for the items.`,
    ];
    return { held: true, label: `outlook, ${today}`, url: "/prepare/supplies", text: lines.filter(Boolean).join("\n") };
  },
});

export const SUPPLIES_TOOLS: ToolDefinition[] = [supplies];
