/**
 * Which item each passage belongs to, kept in memory.
 *
 * Finding the items that hold a common word ("water" is in a third of a large library's
 * passages) asks the index for every matching passage. The index answers with passage
 * numbers alone in a few milliseconds; joining each to its row in `chunks` for its item
 * took three times as long, and on a Raspberry Pi over a hundred milliseconds. So the
 * owner of every passage, and the kind and household of every item, are kept here: a
 * few hundred kilobytes for 60,000 passages.
 *
 * The search service notes each passage and item it writes. Passages are numbered by
 * AUTOINCREMENT and never renumbered, so a number once noted keeps its owner; a passage
 * removed some other way is simply never found again. A passage the index finds that is
 * not noted here (written before this process started, or by some other way) has the
 * whole map read again, once.
 */
import type Database from "better-sqlite3";

export interface ItemFacts {
  kind: string;
  /** The household an item belongs to, for items kept per household (plans, supplies); null for the rest. */
  household: string | null;
}

export interface Owners {
  /** The item row a passage belongs to, or 0 when it is not known. */
  ownerOf(chunkId: number): number;
  item(entityRowId: number): ItemFacts | undefined;
  notePassage(chunkId: number, entityRowId: number): void;
  noteItem(entityRowId: number, facts: ItemFacts): void;
  /** Reads every passage's owner and every item's facts again. */
  reload(): void;
  loaded(): boolean;
}

export function createOwners(sqlite: Database.Database): Owners {
  let owner = new Int32Array(0);
  let items = new Map<number, ItemFacts>();
  let isLoaded = false;

  const grow = (chunkId: number) => {
    if (chunkId < owner.length) return;
    const next = new Int32Array(Math.max(chunkId + 1, Math.ceil(owner.length * 1.5), 1024));
    next.set(owner);
    owner = next;
  };

  const owners: Owners = {
    ownerOf: (chunkId) => (chunkId < owner.length ? owner[chunkId]! : 0),
    item: (entityRowId) => items.get(entityRowId),
    notePassage(chunkId, entityRowId) {
      if (!isLoaded) return;
      grow(chunkId);
      owner[chunkId] = entityRowId;
    },
    noteItem(entityRowId, facts) {
      if (isLoaded) items.set(entityRowId, facts);
    },
    reload() {
      const max = (sqlite.prepare("SELECT coalesce(max(id), 0) AS n FROM chunks").get() as { n: number }).n;
      owner = new Int32Array(max + 1024);
      for (const [id, entityRowId] of sqlite.prepare("SELECT id, entity_row_id FROM chunks").raw().iterate() as Iterable<
        [number, number]
      >) {
        owner[id] = entityRowId;
      }
      items = new Map();
      for (const [id, kind, household] of sqlite
        .prepare("SELECT id, kind, json_extract(meta, '$.household') FROM search_entities")
        .raw()
        .iterate() as Iterable<[number, string, unknown]>) {
        items.set(id, { kind, household: typeof household === "string" ? household : null });
      }
      isLoaded = true;
    },
    loaded: () => isLoaded,
  };
  return owners;
}
