/**
 * Supplies in search: each item by its name, category, where it is kept, how much there
 * is, its date and its notes. An item belongs to one household and is found only while
 * that household is the current one (search/owners.ts); with several households, a
 * result names whose it is. The index follows every change (`supplies.changed`,
 * `households.changed`), writing only the items that changed.
 */
import { categoryLabel, isArmoredMessage } from "@outpost/shared";
import type { AppContext } from "../../core/context.ts";
import type { IndexEntity } from "../search/service.ts";

export const SUPPLY_SEARCH_KIND = "supply";

interface ItemRow {
  id: string;
  householdId: string;
  name: string;
  category: string;
  quantity: number;
  unit: string;
  location: string;
  date: string | null;
  dateKind: string | null;
  notes: string;
}

const plain = (text: string | null | undefined) => (text && !isArmoredMessage(text) ? text.trim() : "");

export function supplyEntity(row: ItemRow, household: { name: string; several: boolean }): IndexEntity {
  const category = categoryLabel(row.category);
  const where = plain(row.location);
  const amount = `${Number.isInteger(row.quantity) ? row.quantity : row.quantity.toFixed(2)} ${plain(row.unit)}`.trim();
  const date = row.date ? `${row.dateKind === "use-by" ? "Use by" : "Best before"} ${row.date}` : "";
  return {
    kind: SUPPLY_SEARCH_KIND,
    entityId: row.id,
    title: plain(row.name) || category,
    subtitle: [category, where, household.several ? `for ${household.name}` : ""].filter(Boolean).join(", "),
    collection: "Supplies",
    url: `/prepare/supplies/items/${row.id}`,
    household: row.householdId,
    tags: [],
    sections: [{ text: [`${amount}${where ? `, kept in ${where}` : ""}.`, date, plain(row.notes)].filter(Boolean).join("\n") }],
  };
}

/** Indexes every supply item now and after every change. */
export function indexSupplies(ctx: AppContext): () => void {
  const sync = () => {
    const households = ctx.services.households.list();
    const names = new Map(households.map((household) => [household.id, household.name]));
    const rows = ctx.sqlite
      .prepare(
        `SELECT id, household_id AS householdId, name, category, quantity, unit, location, date, date_kind AS dateKind, notes
         FROM supply_items`,
      )
      .all() as ItemRow[];
    ctx.services.search.syncKind(
      SUPPLY_SEARCH_KIND,
      rows.map((row) => supplyEntity(row, { name: names.get(row.householdId) ?? "another household", several: households.length > 1 })),
    );
  };
  sync();
  return ctx.events.subscribe((event) => {
    if (event.type === "supplies.changed" || event.type === "households.changed") sync();
  });
}
