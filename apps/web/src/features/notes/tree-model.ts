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
