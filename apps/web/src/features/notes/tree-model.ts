/**
 * The page tree as data: the flat list the server sends, turned into something that can
 * be walked, and the rules for dragging a page somewhere else. Nothing here touches the
 * DOM, so the rules can be tested on their own.
 */
import type { MoveNoteBody, NoteTreeItem } from "@outpost/shared";

export interface TreeIndex {
  byId: Map<string, NoteTreeItem>;
  /** Children in display order. The top level is under `null`. */
  childrenOf: Map<string | null, NoteTreeItem[]>;
}

export interface TreeRow {
  item: NoteTreeItem;
  depth: number;
  hasChildren: boolean;
  expanded: boolean;
  /** Place among its siblings, counting from 1, and how many siblings there are. */
  position: number;
  siblings: number;
}

/** Where a dragged page lands relative to the row under the pointer. */
export type DropZone = "before" | "after" | "inside";

/** Stands for "after the last top-level page" as a drop target. */
export const END = "\u0000end";

/** What letting go at a point in the tree would do, and where to draw it. */
export interface DropTarget {
  /** The row the mark is drawn on, or `END` for the space under the tree. */
  id: string;
  zone: DropZone;
  move: MoveNoteBody;
  /** How deep the page will sit where it lands; the top level is 0. */
  depth: number;
  /** A closed page that opens if the pointer rests on it, so the page can go deeper. */
  opens: string | null;
}

const byPosition = (a: NoteTreeItem, b: NoteTreeItem) => a.position - b.position || a.id.localeCompare(b.id);

export function buildTreeIndex(items: readonly NoteTreeItem[]): TreeIndex {
  const byId = new Map<string, NoteTreeItem>();
  for (const item of items) byId.set(item.id, item);
  const childrenOf = new Map<string | null, NoteTreeItem[]>();
  for (const item of items) {
    // A page whose parent is missing from the list is shown at the top rather than lost.
    const parent = item.parentId !== null && byId.has(item.parentId) ? item.parentId : null;
    const siblings = childrenOf.get(parent);
    if (siblings) siblings.push(item);
    else childrenOf.set(parent, [item]);
  }
  for (const siblings of childrenOf.values()) siblings.sort(byPosition);
  return { byId, childrenOf };
}

const parentOf = (index: TreeIndex, id: string): string | null => {
  const parentId = index.byId.get(id)?.parentId ?? null;
  return parentId !== null && index.byId.has(parentId) ? parentId : null;
};

/** Ids from the top of the tree down to the parent of `id`. */
export function ancestorIds(index: TreeIndex, id: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>([id]);
  let current = parentOf(index, id);
  while (current !== null && !seen.has(current)) {
    out.unshift(current);
    seen.add(current);
    current = parentOf(index, current);
  }
  return out;
}

/** True when `id` is `ancestorId` itself or somewhere underneath it. */
export function isSelfOrDescendant(index: TreeIndex, ancestorId: string, id: string): boolean {
  return id === ancestorId || ancestorIds(index, id).includes(ancestorId);
}

/** The rows to draw: every top-level page, and the children of each expanded page. */
export function visibleRows(index: TreeIndex, expanded: ReadonlySet<string>): TreeRow[] {
  const rows: TreeRow[] = [];
  const walk = (parentId: string | null, depth: number) => {
    const siblings = index.childrenOf.get(parentId) ?? [];
    siblings.forEach((item, at) => {
      const hasChildren = (index.childrenOf.get(item.id)?.length ?? 0) > 0;
      const open = hasChildren && expanded.has(item.id);
      rows.push({ item, depth, hasChildren, expanded: open, position: at + 1, siblings: siblings.length });
      if (open) walk(item.id, depth + 1);
    });
  };
  walk(null, 0);
  return rows;
}

/**
 * Which zone of a row the pointer is in. The top and bottom quarters reorder; the
 * middle nests. An open page with children has no "after" zone, because the space under
 * its row belongs to its first child.
 */
export function dropZoneAt(offsetY: number, rowHeight: number, row: Pick<TreeRow, "expanded">): DropZone {
  const ratio = rowHeight > 0 ? offsetY / rowHeight : 0.5;
  if (ratio < 0.28) return "before";
  if (ratio > 0.72 && !row.expanded) return "after";
  return "inside";
}

/**
 * The move a drop stands for, or `null` when it is not allowed (onto itself, into its
 * own sub-pages) or would change nothing. Dropping onto a closed page adds the page at
 * the end of its children; onto an open one (`first`), at the top, where the pointer is.
 */
export function moveForDrop(index: TreeIndex, dragId: string, targetId: string, zone: DropZone, first = false): MoveNoteBody | null {
  const dragged = index.byId.get(dragId);
  const target = index.byId.get(targetId);
  if (!dragged || !target) return null;
  if (isSelfOrDescendant(index, dragId, targetId)) return null;

  if (zone === "inside") {
    const children = index.childrenOf.get(targetId) ?? [];
    const already = (first ? children[0] : children[children.length - 1])?.id === dragId;
    if (already) return null;
    return first ? { parentId: targetId, afterId: null } : { parentId: targetId };
  }

  const parentId = parentOf(index, targetId);
  const siblings = (index.childrenOf.get(parentId) ?? []).filter((item) => item.id !== dragId);
  const at = siblings.findIndex((item) => item.id === targetId);
  const previous = zone === "before" ? siblings[at - 1] : siblings[at];
  const afterId = previous ? previous.id : null;

  // Already exactly there: same parent, same page before it.
  if (parentOf(index, dragId) === parentId) {
    const current = index.childrenOf.get(parentId) ?? [];
    const currentPrevious = current[current.findIndex((item) => item.id === dragId) - 1];
    if ((currentPrevious?.id ?? null) === afterId) return null;
  }
  return { parentId, afterId };
}

/**
 * The drop a point in the tree stands for. Rows are all the same height, so the row is
 * worked out from the distance below the top of the tree (`y`) and the height of a row
 * plus the gap under it (`stride`): this works for rows that are not drawn, too.
 */
export function dropTargetAt(index: TreeIndex, rows: readonly TreeRow[], dragId: string, y: number, stride: number): DropTarget | null {
  if (y < 0 || stride <= 0) return null;
  const at = Math.floor(y / stride);
  const row = rows[at];
  if (!row) {
    // The empty space under the tree: to the end of the top level.
    const last = index.childrenOf.get(null)?.at(-1);
    if (!last || last.id === dragId || !index.byId.has(dragId)) return null;
    return { id: END, zone: "after", move: { parentId: null }, depth: 0, opens: null };
  }
  const rowHeight = Math.max(1, stride - 1);
  const zone = dropZoneAt(Math.min(y - at * stride, rowHeight), rowHeight, row);
  const move = moveForDrop(index, dragId, row.item.id, zone, row.expanded);
  if (!move) return null;
  const inside = zone === "inside";
  return {
    id: row.item.id,
    zone,
    move,
    depth: inside ? row.depth + 1 : row.depth,
    opens: inside && row.hasChildren && !row.expanded ? row.item.id : null,
  };
}

/** Where a page is now, as a move: what an undo sends to put it back. */
export function placeOf(index: TreeIndex, id: string): MoveNoteBody | null {
  if (!index.byId.has(id)) return null;
  const parentId = parentOf(index, id);
  const siblings = index.childrenOf.get(parentId) ?? [];
  const previous = siblings[siblings.findIndex((item) => item.id === id) - 1];
  return { parentId, afterId: previous ? previous.id : null };
}

/** One place up or down among its siblings, or `null` at the end of the line. */
export function moveAmongSiblings(index: TreeIndex, id: string, direction: -1 | 1): MoveNoteBody | null {
  if (!index.byId.has(id)) return null;
  const parentId = parentOf(index, id);
  const siblings = index.childrenOf.get(parentId) ?? [];
  const at = siblings.findIndex((item) => item.id === id);
  if (direction === -1) {
    if (at <= 0) return null;
    return { parentId, afterId: siblings[at - 2]?.id ?? null };
  }
  const next = siblings[at + 1];
  return next ? { parentId, afterId: next.id } : null;
}

/** Pages a page may be moved into: everything except itself and its own sub-pages. */
export function moveDestinations(index: TreeIndex, movingId: string): NoteTreeItem[] {
  const out: NoteTreeItem[] = [];
  const walk = (parentId: string | null) => {
    for (const item of index.childrenOf.get(parentId) ?? []) {
      if (item.id === movingId) continue;
      out.push(item);
      walk(item.id);
    }
  };
  walk(null);
  return out;
}

/** "Projects / Hut repairs" for a page two levels down; empty for a top-level page. */
export function pathLabel(index: TreeIndex, id: string): string {
  return ancestorIds(index, id)
    .map((ancestor) => index.byId.get(ancestor)?.title.trim() || "Untitled")
    .join(" / ");
}
