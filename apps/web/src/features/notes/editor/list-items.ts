/**
 * What can be done to one item of a list by itself: moving it among its neighbours,
 * duplicating, deleting, turning it into another kind of block, and dragging it to
 * another list. An item always travels with whatever is nested under it.
 *
 * In the page model a list is one block that holds its items, so each of these is a
 * small rewrite of the list around the item. Every one is a single transaction, and so
 * a single step of undo. Nothing here adds to the model: the documents it writes are
 * made of the same lists and items as before.
 */

import { closeHistory } from "@tiptap/pm/history";
import { Fragment, type NodeType, type Node as PMNode, type ResolvedPos, Slice } from "@tiptap/pm/model";
import { type EditorState, NodeSelection, Plugin, PluginKey, TextSelection, type Transaction } from "@tiptap/pm/state";
import { canJoin, dropPoint } from "@tiptap/pm/transform";
import type { EditorView } from "@tiptap/pm/view";
import type { Editor } from "@tiptap/react";
import { isMac } from "@/lib/utils";

export type ListType = "bulletList" | "orderedList" | "taskList";
export type ItemType = "listItem" | "taskItem";

const LISTS: ReadonlySet<string> = new Set<ListType>(["bulletList", "orderedList", "taskList"]);
const ITEMS: ReadonlySet<string> = new Set<ItemType>(["listItem", "taskItem"]);

export const isList = (node: PMNode | null | undefined): boolean => !!node && LISTS.has(node.type.name);
export const isListItem = (node: PMNode | null | undefined): boolean => !!node && ITEMS.has(node.type.name);
export const isListKind = (kind: string): kind is ListType => LISTS.has(kind);
const itemTypeOf = (list: string): ItemType => (list === "taskList" ? "taskItem" : "listItem");

export interface ListItemTarget {
  /** Position right before the item. */
  pos: number;
  size: number;
  typeName: ItemType;
  /** Its place among the items of its list, counting from 0, and how many items there are. */
  index: number;
  count: number;
  /** Position right before the list that holds it, and that list's kind. */
  listPos: number;
  listType: ListType;
  /** True when the list is a block of the page itself, not inside another block. */
  topLevel: boolean;
}

function targetOf($inside: ResolvedPos, depth: number): ListItemTarget | null {
  const node = $inside.node(depth);
  const list = depth > 0 ? $inside.node(depth - 1) : null;
  if (!isListItem(node) || !list || !isList(list)) return null;
  return {
    pos: $inside.before(depth),
    size: node.nodeSize,
    typeName: node.type.name as ItemType,
    index: $inside.index(depth - 1),
    count: list.childCount,
    listPos: $inside.before(depth - 1),
    listType: list.type.name as ListType,
    topLevel: depth === 2,
  };
}

/** The innermost list item that holds a position, or that starts at it. */
export function listItemAt(doc: PMNode, pos: number): ListItemTarget | null {
  const at = Math.max(0, Math.min(pos, doc.content.size));
  const $pos = doc.resolve(at);
  // Right before an item: that item, which is what the handle reports.
  if (isListItem($pos.nodeAfter)) return targetOf(doc.resolve(at + 1), $pos.depth + 1);
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    if (isListItem($pos.node(depth))) return targetOf($pos, depth);
  }
  return null;
}

/**
 * The item the selection is in, when it is in one: the cursor in an item, text selected
 * within one item, or the item itself selected. A selection that runs across items is
 * not "an item", and then the keyboard and the menus act on the whole block as before.
 */
export function selectedListItem(state: EditorState): ListItemTarget | null {
  const { selection, doc } = state;
  if (selection instanceof NodeSelection) return isListItem(selection.node) ? listItemAt(doc, selection.from) : null;
  const from = listItemAt(doc, selection.from);
  if (!from) return null;
  const to = selection.empty ? from : listItemAt(doc, selection.to);
  return to && to.pos === from.pos ? from : null;
}

/**
 * Undo groups changes made close together in time and place. A move is a thing a person
 * did on purpose, so each one is marked to be undone by itself, however fast they come.
 */
const ownStep = (tr: Transaction): Transaction => closeHistory(tr);

const itemNode = (doc: PMNode, item: ListItemTarget): PMNode | null => {
  const node = doc.nodeAt(item.pos);
  return node && isListItem(node) ? node : null;
};

/** Swaps an item with the one before or after it. The cursor travels with the item. */
export function moveListItem(editor: Editor, item: ListItemTarget, direction: -1 | 1): boolean {
  const { state } = editor;
  const list = state.doc.nodeAt(item.listPos);
  const node = itemNode(state.doc, item);
  const target = item.index + direction;
  if (!list || !node || target < 0 || target >= list.childCount) return false;
  const neighbour = list.child(target);
  const offset = state.selection.from - item.pos;
  const tr = state.tr.delete(item.pos, item.pos + item.size);
  const insertAt = direction === -1 ? item.pos - neighbour.nodeSize : item.pos + neighbour.nodeSize;
  tr.insert(insertAt, node);
  const inside = offset > 0 && offset < item.size && !(state.selection instanceof NodeSelection);
  tr.setSelection(TextSelection.near(tr.doc.resolve(insertAt + (inside ? offset : 1))));
  editor.view.dispatch(ownStep(tr).scrollIntoView());
  editor.view.focus();
  return true;
}

export function duplicateListItem(editor: Editor, item: ListItemTarget): boolean {
  const { state } = editor;
  const node = itemNode(state.doc, item);
  if (!node) return false;
  const at = item.pos + item.size;
  const tr = state.tr.insert(at, node.copy(node.content));
  tr.setSelection(TextSelection.near(tr.doc.resolve(at + 1)));
  editor.view.dispatch(ownStep(tr).scrollIntoView());
  editor.view.focus();
  return true;
}

/** Removes an item. Its list goes with its last item, and a block that would be left empty keeps one empty line. */
export function deleteListItem(editor: Editor, item: ListItemTarget): boolean {
  const { state } = editor;
  const list = state.doc.nodeAt(item.listPos);
  if (!list || !itemNode(state.doc, item)) return false;
  const tr = state.tr;
  if (list.childCount > 1) {
    tr.delete(item.pos, item.pos + item.size);
  } else {
    const $list = state.doc.resolve(item.listPos);
    const from = item.listPos;
    const to = from + list.nodeSize;
    const paragraph = state.schema.nodes.paragraph?.create();
    if ($list.parent.canReplace($list.index(), $list.index() + 1)) tr.delete(from, to);
    else if (paragraph) tr.replaceWith(from, to, paragraph);
    else return false;
  }
  tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(item.pos, tr.doc.content.size)), -1));
  editor.view.dispatch(ownStep(tr).scrollIntoView());
  editor.view.focus();
  return true;
}

/** An item as an item of the other kind: a to-do loses its tick box, anything else gains an empty one. */
function asItemType(node: PMNode, type: NodeType): PMNode {
  if (node.type === type) return node;
  return type.create(type.name === "taskItem" ? { checked: false } : null, node.content);
}

/** A paragraph's words as plain text, for a code block. */
const plainText = (node: PMNode): string =>
  node.textBetween(0, node.content.size, "\n", (leaf) => (leaf.type.name === "hardBreak" ? "\n" : String(leaf.attrs.label ?? "")));

/** The blocks an item becomes when it stops being a list item, for the kinds that are not lists. */
function blocksFor(state: EditorState, node: PMNode, kind: string): PMNode[] | null {
  const { nodes } = state.schema;
  const [first, ...rest] = Array.from({ length: node.childCount }, (_, at) => node.child(at));
  if (!first) return null;
  if (kind === "paragraph") return [first, ...rest];
  const heading = /^heading([1-3])$/.exec(kind);
  if (heading && nodes.heading) return [nodes.heading.create({ level: Number(heading[1]) }, first.content), ...rest];
  if (kind === "codeBlock" && nodes.codeBlock) {
    const text = plainText(first);
    return [nodes.codeBlock.create(null, text ? state.schema.text(text) : null), ...rest];
  }
  if (kind === "blockquote" && nodes.blockquote) return [nodes.blockquote.create(null, node.content)];
  if (kind === "callout" && nodes.callout) return [nodes.callout.create({ variant: "info" }, node.content)];
  return null;
}

/**
 * Turns one item into another kind of block and leaves the rest of the list as it was:
 * the items before it stay a list, the items after it become a list that carries on
 * (a numbered one keeps counting), and the item stands between them as what it now is.
 * Turned into another kind of list, it joins a list of that kind right next to it.
 */
export function turnListItemInto(editor: Editor, item: ListItemTarget, kind: string): boolean {
  const { state } = editor;
  const { doc, schema } = state;
  const list = doc.nodeAt(item.listPos);
  const node = itemNode(doc, item);
  if (!list || !node || kind === item.listType) return false;

  const items = Array.from({ length: list.childCount }, (_, at) => list.child(at));
  const before = items.slice(0, item.index);
  const after = items.slice(item.index + 1);
  const start = Number(list.attrs.start ?? 1);

  let middle: PMNode[] | null;
  if (isListKind(kind)) {
    const listType = schema.nodes[kind];
    const itemType = schema.nodes[itemTypeOf(kind)];
    middle = listType && itemType ? [listType.create(null, asItemType(node, itemType))] : null;
  } else {
    middle = blocksFor(state, node, kind);
  }
  if (!middle) return false;

  let from = item.listPos;
  let to = item.listPos + list.nodeSize;
  const pieces: PMNode[] = [];
  if (before.length > 0) pieces.push(list.copy(Fragment.fromArray(before)));
  /** Where the item's own content begins once the pieces are in place. */
  let landing = from + (pieces[0]?.nodeSize ?? 0);

  // A lone list of one kind next to a list of the same kind is one list.
  const $list = doc.resolve(item.listPos);
  const made = isListKind(kind) ? middle[0] : undefined;
  const previous = $list.index() > 0 ? $list.parent.child($list.index() - 1) : null;
  const next = $list.index() + 1 < $list.parent.childCount ? $list.parent.child($list.index() + 1) : null;
  let joined = made;
  if (joined && before.length === 0 && previous && previous.type === joined.type) {
    from -= previous.nodeSize;
    landing = from + previous.nodeSize - 1;
    joined = previous.copy(previous.content.append(joined.content));
  }
  if (joined && after.length === 0 && next && next.type === joined.type) {
    to += next.nodeSize;
    joined = joined.copy(joined.content.append(next.content));
  }
  pieces.push(...(joined ? [joined] : middle));

  if (after.length > 0) {
    const attrs = list.type.name === "orderedList" ? { ...list.attrs, start: start + item.index + 1 } : list.attrs;
    pieces.push(list.type.create(attrs, Fragment.fromArray(after)));
  }

  const tr = state.tr.replaceWith(from, to, pieces);
  tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(landing, tr.doc.content.size)), 1));
  editor.view.dispatch(ownStep(tr).scrollIntoView());
  editor.view.focus();
  return true;
}

// ── Dragging an item ──

/**
 * What a dragged item should be where the pointer is: an item of the kind the list
 * there holds, so a bullet dropped among to-dos becomes a to-do; and away from any
 * list, a list of its own of the kind it came from, so a numbered item stays numbered.
 */
export function sliceForDrop(doc: PMNode, sourcePos: number, pos: number): Slice | null {
  const source = doc.nodeAt(sourcePos);
  const sourceList = doc.resolve(sourcePos).parent;
  if (!source || !isListItem(source) || !isList(sourceList)) return null;
  const $pos = doc.resolve(Math.max(0, Math.min(pos, doc.content.size)));
  for (let depth = $pos.depth; depth >= 0; depth -= 1) {
    const list = $pos.node(depth);
    if (!isList(list)) continue;
    const itemType = doc.type.schema.nodes[itemTypeOf(list.type.name)];
    return itemType ? new Slice(Fragment.from(asItemType(source, itemType)), 0, 0) : null;
  }
  return new Slice(Fragment.from(sourceList.type.create(null, source)), 0, 0);
}

/**
 * The drop of the item at `sourcePos` at `pos` (a position in the document, as the
 * pointer reports it): the item leaves its list, which goes too if that was its last
 * item, and lands at the nearest place it fits, as `sliceForDrop` says it should be
 * there. One transaction, and one step of undo. `null` when nothing would change.
 */
export function dropListItem(state: EditorState, sourcePos: number, pos: number, move = true): Transaction | null {
  const { doc } = state;
  const source = doc.nodeAt(sourcePos);
  const slice = sliceForDrop(doc, sourcePos, pos);
  const dropped = slice?.content.firstChild;
  if (!source || !slice || !dropped) return null;
  const at = Math.max(0, Math.min(pos, doc.content.size));
  const point = dropPoint(doc, at, slice) ?? at;

  const tr = state.tr;
  if (move) tr.deleteRange(sourcePos, sourcePos + source.nodeSize);
  const target = tr.mapping.map(point);
  const steps = tr.steps.length;
  tr.replaceRangeWith(target, target, dropped);
  if (tr.steps.length === steps || tr.doc.eq(doc)) return null;

  // Where it went: the insertion may have been nudged to a place the node fits.
  let from = target;
  let to = target;
  tr.mapping.maps[tr.mapping.maps.length - 1]?.forEach((_oldStart, _oldEnd, newStart, newEnd) => {
    from = newStart;
    to = newEnd;
  });

  // A list set down right against a list of the same kind becomes part of it.
  if (isList(dropped)) {
    const next = tr.doc.resolve(to).nodeAfter;
    if (next?.type === dropped.type && canJoin(tr.doc, to)) {
      // The list that was already there keeps its own numbering.
      tr.join(to).setNodeMarkup(from, undefined, next.attrs);
    }
    const $from = tr.doc.resolve(from);
    if ($from.nodeBefore?.type === dropped.type && canJoin(tr.doc, from)) {
      tr.join(from);
      to -= 2;
    }
  }

  // The cursor ends up at the end of the item's own line, ready to carry on writing.
  const start = isList(dropped) ? from + 1 : from;
  const item = tr.doc.resolve(Math.min(start, tr.doc.content.size)).nodeAfter;
  const line = item?.firstChild;
  const end = item && line && isListItem(item) ? start + 1 + line.nodeSize - 1 : to;
  tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(end, tr.doc.content.size)), -1));
  return ownStep(tr).setMeta("uiEvent", "drop");
}

interface Dragging {
  slice: Slice;
  move: boolean;
  node?: NodeSelection;
}

/** The list item being dragged by its handle, if that is what is being dragged, and where it came from. */
function draggedItem(view: EditorView): { dragging: Dragging; from: number } | null {
  const dragging = view.dragging as Dragging | null;
  const source = dragging?.node;
  if (!dragging || !(source instanceof NodeSelection) || !isListItem(source.node)) return null;
  // The document has not changed since the drag began, so the item is still where it was picked up.
  if (source.from > view.state.doc.content.size || view.state.doc.nodeAt(source.from) !== source.node) return null;
  return { dragging, from: source.from };
}

/**
 * While an item is dragged, keeps `view.dragging` in step with what is under the
 * pointer. The editor's drop marker reads it (after this runs) to show where the item
 * would go, so the marker stands where the drop below will put it.
 */
function adaptDrag(view: EditorView, event: DragEvent): boolean {
  const drag = draggedItem(view);
  const at = drag ? view.posAtCoords({ left: event.clientX, top: event.clientY }) : null;
  if (!drag || !at) return false;
  const slice = sliceForDrop(view.state.doc, drag.from, at.pos);
  if (slice) view.dragging = { slice, move: drag.dragging.move, node: drag.dragging.node } as typeof view.dragging;
  return false;
}

/** Editors in which the drag under way is a whole block taken by its handle with Alt held. */
export const movesWholeBlock = new WeakSet<EditorView>();

export const listItemDropKey = new PluginKey("listItemDrop");

export function listItemDrop() {
  let current: EditorView | null = null;
  return new Plugin({
    key: listItemDropKey,
    view(view) {
      current = view;
      return {
        destroy() {
          current = null;
        },
      };
    },
    props: {
      handleDOMEvents: {
        dragenter: adaptDrag,
        dragover: adaptDrag,
      },
      // The editor asks "does this drop copy?". A whole block taken with Alt held is always a move;
      // for every other drag this is the editor's own rule (Option on a Mac, Ctrl elsewhere).
      dragCopies: (event) => (current !== null && movesWholeBlock.has(current) ? false : isMac ? event.altKey : event.ctrlKey),
      handleDrop(view, event, _slice, moved) {
        const drag = draggedItem(view);
        const at = drag ? view.posAtCoords({ left: event.clientX, top: event.clientY }) : null;
        if (!drag || !at) return false;
        const tr = dropListItem(view.state, drag.from, at.pos, moved);
        // The grip took the focus when it was pressed; the page has it back, as after any drop.
        view.focus();
        if (tr) view.dispatch(tr);
        // Handled either way: a drop that changes nothing must not fall through to a second, different drop.
        return true;
      },
    },
  });
}
