import type { NoteTreeItem } from "@outpost/shared";
import { describe, expect, it } from "vitest";
import {
  ancestorIds,
  buildTreeIndex,
  dropTargetAt,
  dropZoneAt,
  END,
  isSelfOrDescendant,
  moveAmongSiblings,
  moveDestinations,
  moveForDrop,
  pathLabel,
  placeOf,
  visibleRows,
} from "./tree-model";

const page = (id: string, parentId: string | null, position: number, title = id): NoteTreeItem => ({
  id,
  parentId,
  position,
  title,
  icon: null,
  isFavorite: false,
  childCount: 0,
  updatedAt: 1,
});

/**
 * a
 * ├─ a1
 * │  └─ a1x
 * └─ a2
 * b
 * c
 */
const items = [page("c", null, 3), page("a2", "a", 2), page("a", null, 1), page("b", null, 2), page("a1x", "a1", 1), page("a1", "a", 1)];
const index = buildTreeIndex(items);
const ids = (rows: Array<{ item: NoteTreeItem }>) => rows.map((row) => row.item.id);

describe("buildTreeIndex", () => {
  it("groups pages under their parent, ordered by position", () => {
    expect(index.childrenOf.get(null)?.map((item) => item.id)).toEqual(["a", "b", "c"]);
    expect(index.childrenOf.get("a")?.map((item) => item.id)).toEqual(["a1", "a2"]);
  });

  it("shows a page whose parent is missing at the top level", () => {
    const orphaned = buildTreeIndex([page("x", "gone", 1), page("y", null, 2)]);
    expect(orphaned.childrenOf.get(null)?.map((item) => item.id)).toEqual(["x", "y"]);
  });
});

describe("visibleRows", () => {
  it("lists only the top level when nothing is expanded", () => {
    const rows = visibleRows(index, new Set());
    expect(ids(rows)).toEqual(["a", "b", "c"]);
    expect(rows[0]).toMatchObject({ depth: 0, hasChildren: true, expanded: false });
    expect(rows[1]).toMatchObject({ hasChildren: false });
  });

  it("walks into expanded pages only", () => {
    expect(ids(visibleRows(index, new Set(["a"])))).toEqual(["a", "a1", "a2", "b", "c"]);
    const deep = visibleRows(index, new Set(["a", "a1"]));
    expect(ids(deep)).toEqual(["a", "a1", "a1x", "a2", "b", "c"]);
    expect(deep[2]?.depth).toBe(2);
  });

  it("ignores an expanded page hidden inside a collapsed one", () => {
    expect(ids(visibleRows(index, new Set(["a1"])))).toEqual(["a", "b", "c"]);
  });
});

describe("ancestors", () => {
  it("lists ancestors from the top down", () => {
    expect(ancestorIds(index, "a1x")).toEqual(["a", "a1"]);
    expect(ancestorIds(index, "a")).toEqual([]);
  });

  it("does not loop on a cycle in bad data", () => {
    const cyclic = buildTreeIndex([page("p", "q", 1), page("q", "p", 1)]);
    expect(ancestorIds(cyclic, "p")).toEqual(["q"]);
  });

  it("knows what is underneath a page", () => {
    expect(isSelfOrDescendant(index, "a", "a1x")).toBe(true);
    expect(isSelfOrDescendant(index, "a", "a")).toBe(true);
    expect(isSelfOrDescendant(index, "a1", "a2")).toBe(false);
  });

  it("writes the path of a page", () => {
    expect(pathLabel(index, "a1x")).toBe("a / a1");
    expect(pathLabel(index, "b")).toBe("");
  });
});

describe("dropZoneAt", () => {
  it("splits a row into before, inside and after", () => {
    expect(dropZoneAt(2, 28, { expanded: false })).toBe("before");
    expect(dropZoneAt(14, 28, { expanded: false })).toBe("inside");
    expect(dropZoneAt(26, 28, { expanded: false })).toBe("after");
  });

  it("has no after zone on an open page, whose children follow it", () => {
    expect(dropZoneAt(26, 28, { expanded: true })).toBe("inside");
  });
});

describe("moveForDrop", () => {
  it("refuses a drop onto the page itself", () => {
    expect(moveForDrop(index, "a", "a", "inside")).toBeNull();
    expect(moveForDrop(index, "a", "a", "before")).toBeNull();
  });

  it("refuses a drop into or next to the page's own sub-pages", () => {
    expect(moveForDrop(index, "a", "a1", "inside")).toBeNull();
    expect(moveForDrop(index, "a", "a1x", "after")).toBeNull();
    expect(moveForDrop(index, "a", "a2", "before")).toBeNull();
  });

  it("nests a page at the end of a closed page, and at the top of an open one", () => {
    expect(moveForDrop(index, "c", "a", "inside")).toEqual({ parentId: "a" });
    expect(moveForDrop(index, "c", "a", "inside", true)).toEqual({ parentId: "a", afterId: null });
  });

  it("places a page before a row, after that row's previous sibling", () => {
    expect(moveForDrop(index, "c", "b", "before")).toEqual({ parentId: null, afterId: "a" });
    expect(moveForDrop(index, "c", "a", "before")).toEqual({ parentId: null, afterId: null });
  });

  it("places a page after a row", () => {
    expect(moveForDrop(index, "a", "c", "after")).toEqual({ parentId: null, afterId: "c" });
    expect(moveForDrop(index, "b", "a1", "after")).toEqual({ parentId: "a", afterId: "a1" });
  });

  it("moves a sub-page out to its parent's level", () => {
    expect(moveForDrop(index, "a1x", "b", "before")).toEqual({ parentId: null, afterId: "a" });
  });

  it("skips the dragged page when working out what comes before", () => {
    // b dragged to just before c: it is already there.
    expect(moveForDrop(index, "b", "c", "before")).toBeNull();
    expect(moveForDrop(index, "b", "a", "after")).toBeNull();
    // a dragged to just before c: after b.
    expect(moveForDrop(index, "a", "c", "before")).toEqual({ parentId: null, afterId: "b" });
  });

  it("does nothing when the page is already where the drop would put it", () => {
    expect(moveForDrop(index, "a2", "a", "inside")).toBeNull();
    expect(moveForDrop(index, "a1", "a", "inside")).toEqual({ parentId: "a" });
    expect(moveForDrop(index, "a1", "a", "inside", true)).toBeNull();
    expect(moveForDrop(index, "a2", "a", "inside", true)).toEqual({ parentId: "a", afterId: null });
  });

  it("returns null for pages that are no longer in the tree", () => {
    expect(moveForDrop(index, "gone", "a", "inside")).toBeNull();
    expect(moveForDrop(index, "a", "gone", "inside")).toBeNull();
  });
});

describe("moveDestinations", () => {
  it("leaves out the page and everything under it", () => {
    expect(moveDestinations(index, "a").map((item) => item.id)).toEqual(["b", "c"]);
    expect(moveDestinations(index, "a1").map((item) => item.id)).toEqual(["a", "a2", "b", "c"]);
  });
});

describe("dropTargetAt", () => {
  // Rows of 30 px with a 1 px gap. Open: a, a1, a1x, a2, b, c.
  const stride = 31;
  const open = visibleRows(index, new Set(["a", "a1"]));
  // Closed: a, b, c.
  const closed = visibleRows(index, new Set());
  const y = (row: number, part: number) => row * stride + 30 * part;

  it("finds the row from the distance down the tree, and the zone within it", () => {
    expect(dropTargetAt(index, open, "c", y(4, 0.1), stride)).toEqual({
      id: "b",
      zone: "before",
      move: { parentId: null, afterId: "a" },
      depth: 0,
      opens: null,
    });
    expect(dropTargetAt(index, open, "c", y(3, 0.9), stride)).toMatchObject({
      id: "a2",
      zone: "after",
      move: { parentId: "a", afterId: "a2" },
    });
    expect(dropTargetAt(index, open, "c", y(3, 0.5), stride)).toMatchObject({ id: "a2", zone: "inside", move: { parentId: "a2" } });
  });

  it("gives the level the page will have: one deeper when it goes inside", () => {
    expect(dropTargetAt(index, open, "c", y(2, 0.1), stride)?.depth).toBe(2);
    expect(dropTargetAt(index, open, "c", y(2, 0.5), stride)?.depth).toBe(3);
    expect(dropTargetAt(index, open, "a1x", y(4, 0.9), stride)?.depth).toBe(0);
  });

  it("goes to the top of an open page, where the pointer is, and to the end of a closed one", () => {
    expect(dropTargetAt(index, open, "c", y(0, 0.9), stride)).toMatchObject({
      id: "a",
      zone: "inside",
      move: { parentId: "a", afterId: null },
      opens: null,
    });
    expect(dropTargetAt(index, closed, "c", y(0, 0.5), stride)).toMatchObject({
      id: "a",
      zone: "inside",
      move: { parentId: "a" },
      opens: "a",
    });
  });

  it("only opens a closed page that has something inside", () => {
    expect(dropTargetAt(index, closed, "c", y(1, 0.5), stride)).toMatchObject({ id: "b", zone: "inside", opens: null });
  });

  it("counts the gap under a row as the bottom of that row", () => {
    expect(dropTargetAt(index, open, "c", 3 * stride + 30.5, stride)).toMatchObject({ id: "a2", zone: "after" });
  });

  it("never lets a page land on itself or inside its own sub-pages", () => {
    for (const row of [0, 1, 2, 3]) {
      for (const part of [0.1, 0.5, 0.9]) expect(dropTargetAt(index, open, "a", y(row, part), stride)).toBeNull();
    }
    expect(dropTargetAt(index, open, "a1", y(2, 0.5), stride)).toBeNull();
    // Out of its parent, next to it, is fine.
    expect(dropTargetAt(index, open, "a1", y(4, 0.5), stride)).toMatchObject({ id: "b", zone: "inside" });
  });

  it("takes the space under the last row as the end of the top level", () => {
    expect(dropTargetAt(index, open, "a1", y(6, 0.5), stride)).toEqual({
      id: END,
      zone: "after",
      move: { parentId: null },
      depth: 0,
      opens: null,
    });
    // The last top-level page is already there.
    expect(dropTargetAt(index, open, "c", y(6, 0.5), stride)).toBeNull();
  });

  it("has no target above the tree or for a page that is gone", () => {
    expect(dropTargetAt(index, open, "c", -5, stride)).toBeNull();
    expect(dropTargetAt(index, open, "gone", y(1, 0.5), stride)).toBeNull();
    expect(dropTargetAt(index, open, "gone", y(9, 0.5), stride)).toBeNull();
  });
});

describe("placeOf", () => {
  it("says where a page is, as the move that would put it back", () => {
    expect(placeOf(index, "a")).toEqual({ parentId: null, afterId: null });
    expect(placeOf(index, "c")).toEqual({ parentId: null, afterId: "b" });
    expect(placeOf(index, "a2")).toEqual({ parentId: "a", afterId: "a1" });
    expect(placeOf(index, "gone")).toBeNull();
  });
});

describe("moveAmongSiblings", () => {
  it("moves a page one place up or down", () => {
    expect(moveAmongSiblings(index, "c", -1)).toEqual({ parentId: null, afterId: "a" });
    expect(moveAmongSiblings(index, "b", -1)).toEqual({ parentId: null, afterId: null });
    expect(moveAmongSiblings(index, "a", 1)).toEqual({ parentId: null, afterId: "b" });
    expect(moveAmongSiblings(index, "a1", 1)).toEqual({ parentId: "a", afterId: "a2" });
  });

  it("stops at the first and last place", () => {
    expect(moveAmongSiblings(index, "a", -1)).toBeNull();
    expect(moveAmongSiblings(index, "c", 1)).toBeNull();
    expect(moveAmongSiblings(index, "a1x", -1)).toBeNull();
    expect(moveAmongSiblings(index, "a1x", 1)).toBeNull();
    expect(moveAmongSiblings(index, "gone", 1)).toBeNull();
  });
});
