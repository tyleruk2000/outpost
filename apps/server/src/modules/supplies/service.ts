/**
 * Supplies: the rows of stock, the household they are for, the barcodes the inventory
 * has been told about, and the shopping list. The arithmetic (how long it lasts, what to
 * buy) is in `@outpost/shared` (supplies.ts), so that the screen and the routes agree.
 *
 * Everything here is the person's own: it is counted and erased with the rest of their
 * things (`count`, `eraseAll`, used by modules/manage), and it is in the database that a
 * backup holds. Nothing is looked up anywhere else: a barcode the inventory does not
 * know is a new item whose name the person types.
 */
import {
  type BarcodeLookup,
  type BoughtInput,
  barcodeKey,
  DEFAULT_HOUSEHOLD,
  type EnergyTable,
  energyTableFor,
  type Household,
  type HouseholdInput,
  type HouseholdMember,
  productKey,
  type ShoppingLine,
  type ShoppingList,
  type ShoppingReason,
  SUPPLY_LIMITS,
  type SuppliesKept,
  type SupplyCategory,
  type SupplyDateKind,
  type SupplyItem,
  type SupplyItemInput,
  type SupplyProduct,
  shoppingSuggestions,
} from "@outpost/shared";
import { asc, eq, sql } from "drizzle-orm";
import type { AppContext } from "../../core/context.ts";
import { badRequest, notFound } from "../../core/errors.ts";
import { newId } from "../../core/ids.ts";
import { supplyHousehold, supplyItems, supplyMembers, supplyProducts, supplyShopping } from "../../db/schema.ts";

export interface SuppliesService {
  items(): SupplyItem[];
  item(id: string): SupplyItem;
  create(input: SupplyItemInput): SupplyItem;
  update(id: string, input: Partial<SupplyItemInput>): SupplyItem;
  /** Adds `by` (negative to use some) to the quantity, never below nought. */
  adjust(id: string, by: number): SupplyItem;
  remove(id: string): void;
  locations(): string[];
  household(): Household;
  setHousehold(input: HouseholdInput): Household;
  lookup(code: string): BarcodeLookup;
  shopping(): ShoppingList;
  workOutShopping(today: string): ShoppingList;
  addShoppingLine(input: { name: string; quantity: number | null; unit: string; note: string }): ShoppingLine;
  updateShoppingLine(id: string, input: { name?: string; quantity?: number | null; unit?: string; note?: string }): ShoppingLine;
  removeShoppingLine(id: string): void;
  bought(id: string, input: BoughtInput): { item: SupplyItem; line: ShoppingLine | null };
  /** Adds and updates rows from an import, all or nothing. */
  importRows(rows: Array<{ action: "add" | "update"; id?: string; item: SupplyItemInput }>): { added: number; updated: number };
  count(): SuppliesKept;
  eraseAll(): SuppliesKept;
}

const HOUSEHOLD_ID = "household";

export function createSuppliesService(ctx: AppContext): SuppliesService {
  const { db, sqlite } = ctx;
  const changed = () => ctx.events.publish({ type: "supplies.changed" });

  const toItem = (row: typeof supplyItems.$inferSelect): SupplyItem => ({
    id: row.id,
    name: row.name,
    category: row.category as SupplyCategory,
    quantity: row.quantity,
    unit: row.unit,
    location: row.location,
    dateKind: (row.dateKind as SupplyDateKind | null) ?? null,
    date: row.date,
    kcalPerUnit: row.kcalPerUnit,
    kcalPer100g: row.kcalPer100g,
    gramsPerUnit: row.gramsPerUnit,
    litresPerUnit: row.litresPerUnit,
    minimum: row.minimum,
    barcode: row.barcode,
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });

  const toLine = (row: typeof supplyShopping.$inferSelect): ShoppingLine => ({
    id: row.id,
    source: row.source as ShoppingLine["source"],
    itemId: row.itemId,
    name: row.name,
    quantity: row.quantity,
    unit: row.unit,
    reasons: row.reasons as ShoppingReason[],
    note: row.note,
  });

  const householdRow = () => db.select().from(supplyHousehold).where(eq(supplyHousehold.id, HOUSEHOLD_ID)).get();

  /** Marks the stock as changed since the shopping list was worked out. */
  const touch = (now = Date.now()) => {
    const row = householdRow();
    if (row) db.update(supplyHousehold).set({ stockChangedAt: now }).where(eq(supplyHousehold.id, HOUSEHOLD_ID)).run();
    else
      db.insert(supplyHousehold)
        .values({
          id: HOUSEHOLD_ID,
          daysWanted: DEFAULT_HOUSEHOLD.daysWanted,
          drinkingLitres: DEFAULT_HOUSEHOLD.drinkingLitres,
          allUsesLitres: DEFAULT_HOUSEHOLD.allUsesLitres,
          waterBasis: DEFAULT_HOUSEHOLD.waterBasis,
          shoppingWorkedAt: null,
          stockChangedAt: now,
          updatedAt: now,
        })
        .run();
  };

  /** Remembers what a barcode is, so that it is known after the last of it is gone. */
  const remember = (item: SupplyItem, now: number) => {
    const key = item.barcode ? barcodeKey(item.barcode) : null;
    if (!key || !item.barcode) return;
    const values = {
      barcode: item.barcode,
      name: item.name,
      category: item.category,
      unit: item.unit,
      kcalPerUnit: item.kcalPerUnit,
      kcalPer100g: item.kcalPer100g,
      gramsPerUnit: item.gramsPerUnit,
      litresPerUnit: item.litresPerUnit,
      updatedAt: now,
    };
    db.insert(supplyProducts)
      .values({ barcodeKey: key, ...values })
      .onConflictDoUpdate({ target: supplyProducts.barcodeKey, set: values })
      .run();
  };

  const get = (id: string) => {
    const row = db.select().from(supplyItems).where(eq(supplyItems.id, id)).get();
    if (!row) throw notFound("That item");
    return toItem(row);
  };

  /** The stored columns of an item, and nothing else from what was given. */
  const columns = (input: SupplyItemInput) => ({
    category: input.category,
    quantity: input.quantity,
    kcalPerUnit: input.kcalPerUnit,
    kcalPer100g: input.kcalPer100g,
    gramsPerUnit: input.gramsPerUnit,
    litresPerUnit: input.litresPerUnit,
    minimum: input.minimum,
    notes: input.notes,
    date: input.date,
    name: input.name.trim(),
    unit: input.unit.trim(),
    location: input.location.trim(),
    dateKind: input.date ? (input.dateKind ?? "best-before") : null,
    barcode: input.barcode?.trim() || null,
    barcodeKey: input.barcode ? barcodeKey(input.barcode) : null,
  });

  const count = (): SuppliesKept => {
    const n = (table: string) => (sqlite.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n;
    return { items: n("supply_items"), members: n("supply_members"), shopping: n("supply_shopping"), barcodes: n("supply_products") };
  };

  const service: SuppliesService = {
    items: () => db.select().from(supplyItems).orderBy(asc(supplyItems.name), asc(supplyItems.date)).all().map(toItem),

    item: get,

    create(input) {
      if ((sqlite.prepare("SELECT count(*) AS n FROM supply_items").get() as { n: number }).n >= SUPPLY_LIMITS.items)
        throw badRequest(`The inventory holds at most ${SUPPLY_LIMITS.items.toLocaleString("en-GB")} rows.`);
      const now = Date.now();
      const id = newId();
      db.insert(supplyItems)
        .values({ id, ...columns(input), createdAt: now, updatedAt: now })
        .run();
      const item = get(id);
      remember(item, now);
      touch(now);
      changed();
      return item;
    },

    update(id, input) {
      const current = get(id);
      const now = Date.now();
      const next = { ...current, ...input };
      db.update(supplyItems)
        .set({ ...columns(next), updatedAt: now })
        .where(eq(supplyItems.id, id))
        .run();
      const item = get(id);
      remember(item, now);
      touch(now);
      changed();
      return item;
    },

    adjust(id, by) {
      get(id);
      const now = Date.now();
      // In one statement, so that two presses from two phones both count.
      sqlite
        .prepare("UPDATE supply_items SET quantity = max(0, min(?, quantity + ?)), updated_at = ? WHERE id = ?")
        .run(SUPPLY_LIMITS.quantity, by, now, id);
      touch(now);
      changed();
      return get(id);
    },

    remove(id) {
      get(id);
      sqlite.transaction(() => {
        db.delete(supplyItems).where(eq(supplyItems.id, id)).run();
        // A line of the shopping list still names it; it no longer has a row to add to.
        db.update(supplyShopping).set({ itemId: null }).where(eq(supplyShopping.itemId, id)).run();
        touch();
      })();
      changed();
    },

    locations: () =>
      (
        sqlite.prepare("SELECT DISTINCT location FROM supply_items WHERE location != '' ORDER BY location COLLATE NOCASE").all() as Array<{
          location: string;
        }>
      ).map((row) => row.location),

    household() {
      const row = householdRow();
      // The people of the current household (modules/households), in its order.
      const order = ctx.services.households.personIds();
      const byId = new Map(
        db
          .select()
          .from(supplyMembers)
          .all()
          .map((member) => [member.id, member]),
      );
      const members = order
        .flatMap((id) => byId.get(id) ?? [])
        .map(
          (member): HouseholdMember => ({
            id: member.id,
            kind: member.kind as HouseholdMember["kind"],
            name: member.name,
            band: member.band as HouseholdMember["band"],
            sex: member.sex as HouseholdMember["sex"],
            kcalPerDay: member.kcalPerDay,
            drinkingLitres: member.drinkingLitres,
            allUsesLitres: member.allUsesLitres,
            note: member.note,
          }),
        );
      // The table a household that has not chosen one takes: by the current household's country (modules/households).
      const country = ctx.services.households.country();
      const energyBasis = { table: energyTableFor(country), country };
      if (!row) return { ...DEFAULT_HOUSEHOLD, energyBasis, members };
      return {
        daysWanted: row.daysWanted,
        energyTable: (row.energyTable as EnergyTable | null) ?? null,
        energyBasis,
        drinkingLitres: row.drinkingLitres,
        allUsesLitres: row.allUsesLitres,
        waterBasis: row.waterBasis as Household["waterBasis"],
        members,
        updatedAt: row.updatedAt,
      };
    },

    setHousehold(input) {
      const now = Date.now();
      sqlite.transaction(() => {
        touch(now);
        db.update(supplyHousehold)
          .set({
            daysWanted: input.daysWanted,
            energyTable: input.energyTable,
            drinkingLitres: input.drinkingLitres,
            allUsesLitres: input.allUsesLitres,
            waterBasis: input.waterBasis,
            updatedAt: now,
          })
          .where(eq(supplyHousehold.id, HOUSEHOLD_ID))
          .run();
        // The people of the current household (modules/households): the ones sent are kept or
        // added, in this order; one left out leaves this household, and goes from the People
        // list only if they are in no other household.
        const households = ctx.services.households;
        const before = households.personIds();
        const known = new Set(
          db
            .select({ id: supplyMembers.id })
            .from(supplyMembers)
            .all()
            .map((row) => row.id),
        );
        let next = (db
          .select({ n: sql<number>`coalesce(max(${supplyMembers.position}), -1) + 1` })
          .from(supplyMembers)
          .get()?.n ?? 0) as number;
        const ids = input.members.map((member) => {
          const columns = {
            kind: member.kind,
            name: member.name.trim(),
            band: member.kind === "person" ? member.band : null,
            sex: member.kind === "person" ? member.sex : null,
            kcalPerDay: member.kcalPerDay,
            drinkingLitres: member.drinkingLitres,
            allUsesLitres: member.allUsesLitres,
            note: member.note.trim(),
            updatedAt: now,
          };
          if (member.id && known.has(member.id)) {
            db.update(supplyMembers).set(columns).where(eq(supplyMembers.id, member.id)).run();
            return member.id;
          }
          const id = member.id && /^[a-z0-9-]{1,64}$/.test(member.id) ? member.id : newId();
          db.insert(supplyMembers)
            .values({ id, position: next++, ...columns, createdAt: now })
            .run();
          known.add(id);
          return id;
        });
        households.syncMembers(ids);
        for (const gone of before.filter((id) => !ids.includes(id))) {
          const elsewhere = sqlite.prepare("SELECT 1 FROM household_people WHERE person_id = ?").get(gone);
          if (!elsewhere) db.delete(supplyMembers).where(eq(supplyMembers.id, gone)).run();
        }
      })();
      changed();
      return service.household();
    },

    lookup(code) {
      const key = barcodeKey(code);
      if (!key) throw badRequest("Give a barcode: the number under the bars.");
      const items = db.select().from(supplyItems).where(eq(supplyItems.barcodeKey, key)).orderBy(asc(supplyItems.date)).all().map(toItem);
      const remembered = db.select().from(supplyProducts).where(eq(supplyProducts.barcodeKey, key)).get();
      const product: SupplyProduct | null = remembered
        ? {
            barcode: remembered.barcode,
            name: remembered.name,
            category: remembered.category as SupplyCategory,
            unit: remembered.unit,
            kcalPerUnit: remembered.kcalPerUnit,
            kcalPer100g: remembered.kcalPer100g,
            gramsPerUnit: remembered.gramsPerUnit,
            litresPerUnit: remembered.litresPerUnit,
          }
        : null;
      return { code: code.replace(/\s+/g, ""), key, items, product };
    },

    shopping() {
      const row = householdRow();
      const lines = db.select().from(supplyShopping).orderBy(asc(supplyShopping.position)).all().map(toLine);
      const workedOutAt = row?.shoppingWorkedAt ?? null;
      return { lines, workedOutAt, stale: workedOutAt !== null && row !== undefined && row.stockChangedAt > workedOutAt };
    },

    workOutShopping(today) {
      const suggestions = shoppingSuggestions(service.items(), service.household(), today);
      const now = Date.now();
      sqlite.transaction(() => {
        touch(now);
        // Lines the person added stay; the worked-out ones are worked out afresh.
        db.delete(supplyShopping).where(eq(supplyShopping.source, "worked")).run();
        const own = db.select().from(supplyShopping).orderBy(asc(supplyShopping.position)).all();
        suggestions.forEach((line, position) => {
          db.insert(supplyShopping)
            .values({
              id: newId(),
              position,
              source: "worked",
              itemId: line.itemId,
              name: line.name,
              quantity: line.quantity,
              unit: line.unit,
              reasons: line.reasons,
              note: line.note,
              createdAt: now,
              updatedAt: now,
            })
            .run();
        });
        own.forEach((line, index) => {
          db.update(supplyShopping)
            .set({ position: suggestions.length + index })
            .where(eq(supplyShopping.id, line.id))
            .run();
        });
        // Worked out now: what it was worked from has not changed since.
        db.update(supplyHousehold).set({ shoppingWorkedAt: now, stockChangedAt: now }).where(eq(supplyHousehold.id, HOUSEHOLD_ID)).run();
      })();
      changed();
      return service.shopping();
    },

    addShoppingLine(input) {
      if (count().shopping >= SUPPLY_LIMITS.shoppingLines)
        throw badRequest(`The shopping list holds at most ${SUPPLY_LIMITS.shoppingLines} lines.`);
      const now = Date.now();
      const id = newId();
      const position = (sqlite.prepare("SELECT coalesce(max(position), -1) + 1 AS n FROM supply_shopping").get() as { n: number }).n;
      db.insert(supplyShopping)
        .values({
          id,
          position,
          source: "own",
          itemId: null,
          name: input.name.trim(),
          quantity: input.quantity,
          unit: input.unit.trim(),
          reasons: ["own"],
          note: input.note.trim(),
          createdAt: now,
          updatedAt: now,
        })
        .run();
      changed();
      return toLine(db.select().from(supplyShopping).where(eq(supplyShopping.id, id)).get()!);
    },

    updateShoppingLine(id, input) {
      const row = db.select().from(supplyShopping).where(eq(supplyShopping.id, id)).get();
      if (!row) throw notFound("That line of the shopping list");
      db.update(supplyShopping)
        .set({
          ...(input.name !== undefined ? { name: input.name.trim() } : {}),
          ...(input.quantity !== undefined ? { quantity: input.quantity } : {}),
          ...(input.unit !== undefined ? { unit: input.unit.trim() } : {}),
          ...(input.note !== undefined ? { note: input.note.trim() } : {}),
          updatedAt: Date.now(),
        })
        .where(eq(supplyShopping.id, id))
        .run();
      changed();
      return toLine(db.select().from(supplyShopping).where(eq(supplyShopping.id, id)).get()!);
    },

    removeShoppingLine(id) {
      const result = db.delete(supplyShopping).where(eq(supplyShopping.id, id)).run();
      if (result.changes === 0) throw notFound("That line of the shopping list");
      changed();
    },

    bought(id, input) {
      const row = db.select().from(supplyShopping).where(eq(supplyShopping.id, id)).get();
      if (!row) throw notFound("That line of the shopping list");
      const line = toLine(row);
      const model = line.itemId ? db.select().from(supplyItems).where(eq(supplyItems.id, line.itemId)).get() : undefined;
      const date = input.date || null;
      const dateKind = date ? (input.dateKind ?? "best-before") : null;
      let item: SupplyItem;
      const result = sqlite.transaction(() => {
        if (model) {
          const base = toItem(model);
          const location = input.location?.trim() ?? base.location;
          // The same product, kept in the same place with the same date, is one row: add to it.
          const same = service
            .items()
            .find(
              (candidate) =>
                productKey(candidate) === productKey(base) &&
                candidate.location === location &&
                candidate.date === date &&
                candidate.dateKind === dateKind,
            );
          if (same) item = service.adjust(same.id, input.quantity);
          else
            item = service.create({
              ...base,
              quantity: input.quantity,
              location,
              date,
              dateKind,
              minimum: base.minimum,
            });
        } else {
          item = service.create({
            name: line.name,
            category: input.category ?? "other",
            quantity: input.quantity,
            unit: line.unit,
            location: input.location?.trim() ?? "",
            dateKind,
            date,
            kcalPerUnit: null,
            kcalPer100g: null,
            gramsPerUnit: null,
            litresPerUnit: null,
            minimum: null,
            barcode: null,
            notes: "",
          });
        }
        // Bought all of it, or more: the line is done. Fewer: what is left stays on the list.
        if (line.quantity === null || input.quantity >= line.quantity) {
          db.delete(supplyShopping).where(eq(supplyShopping.id, id)).run();
          return null;
        }
        db.update(supplyShopping)
          .set({ quantity: line.quantity - input.quantity, updatedAt: Date.now() })
          .where(eq(supplyShopping.id, id))
          .run();
        return toLine(db.select().from(supplyShopping).where(eq(supplyShopping.id, id)).get()!);
      })();
      changed();
      return { item: item!, line: result };
    },

    importRows(rows) {
      let added = 0;
      let updated = 0;
      if (count().items + rows.filter((row) => row.action === "add").length > SUPPLY_LIMITS.items)
        throw badRequest(`The inventory holds at most ${SUPPLY_LIMITS.items.toLocaleString("en-GB")} rows; this file would take it over.`);
      const now = Date.now();
      sqlite.transaction(() => {
        for (const row of rows) {
          if (row.action === "update" && row.id) {
            const current = db.select({ id: supplyItems.id }).from(supplyItems).where(eq(supplyItems.id, row.id)).get();
            if (!current) throw notFound(`The item to update (${row.item.name})`);
            db.update(supplyItems)
              .set({ ...columns(row.item), updatedAt: now })
              .where(eq(supplyItems.id, row.id))
              .run();
            remember(get(row.id), now);
            updated += 1;
          } else {
            const id = newId();
            db.insert(supplyItems)
              .values({ id, ...columns(row.item), createdAt: now, updatedAt: now })
              .run();
            remember(get(id), now);
            added += 1;
          }
        }
        touch(now);
      })();
      changed();
      return { added, updated };
    },

    count,

    eraseAll() {
      const before = count();
      sqlite.transaction(() => {
        db.delete(supplyShopping).run();
        db.delete(supplyItems).run();
        db.delete(supplyProducts).run();
        db.delete(supplyMembers).run();
        db.delete(supplyHousehold).run();
      })();
      changed();
      return before;
    },
  };
  return service;
}
