/**
 * What can be done to a whole block: turning it into another kind, and moving,
 * duplicating or deleting it. Used by the slash menu, the block handle, the selection
 * toolbar and the keyboard, so each of them does exactly the same thing.
 */

import { NodeSelection, TextSelection } from "@tiptap/pm/state";
import type { Editor } from "@tiptap/react";
import { Code, Heading1, Heading2, Heading3, Info, List, ListOrdered, ListTodo, type LucideIcon, Pilcrow, TextQuote } from "lucide-react";

export interface BlockKind {
  id: string;
  label: string;
  icon: LucideIcon;
  /** True when the block holding the selection is of this kind. */
  isActive(editor: Editor): boolean;
  /** Turns the selected block(s) into this kind. The selection must already be inside them. */
  apply(editor: Editor): boolean;
}

/** Back to plain paragraphs first, so that any kind can become any other. */
const plain = (editor: Editor) => editor.chain().focus().clearNodes();

const inWrapper = (editor: Editor) =>
  ["bulletList", "orderedList", "taskList", "blockquote", "callout"].some((name) => editor.isActive(name));

export const blockKinds: BlockKind[] = [
  {
    id: "paragraph",
    label: "Text",
    icon: Pilcrow,
    isActive: (editor) => editor.isActive("paragraph") && !inWrapper(editor),
    apply: (editor) => plain(editor).run(),
  },
  ...([1, 2, 3] as const).map(
    (level): BlockKind => ({
      id: `heading${level}`,
      label: `Heading ${level}`,
      icon: [Heading1, Heading2, Heading3][level - 1] ?? Heading1,
      isActive: (editor) => editor.isActive("heading", { level }),
      apply: (editor) => plain(editor).setNode("heading", { level }).run(),
    }),
  ),
  {
    id: "bulletList",
    label: "Bulleted list",
    icon: List,
    isActive: (editor) => editor.isActive("bulletList"),
    apply: (editor) => plain(editor).toggleBulletList().run(),
  },
  {
    id: "orderedList",
    label: "Numbered list",
    icon: ListOrdered,
    isActive: (editor) => editor.isActive("orderedList"),
    apply: (editor) => plain(editor).toggleOrderedList().run(),
  },
  {
    id: "taskList",
    label: "To-do list",
    icon: ListTodo,
    isActive: (editor) => editor.isActive("taskList"),
    apply: (editor) => plain(editor).toggleTaskList().run(),
  },
  {
    id: "blockquote",
    label: "Quote",
    icon: TextQuote,
    isActive: (editor) => editor.isActive("blockquote"),
    apply: (editor) => plain(editor).wrapIn("blockquote").run(),
  },
  {
    id: "callout",
    label: "Callout",
    icon: Info,
    isActive: (editor) => editor.isActive("callout"),
    apply: (editor) => plain(editor).wrapIn("callout", { variant: "info" }).run(),
  },
  {
    id: "codeBlock",
    label: "Code block",
    icon: Code,
    isActive: (editor) => editor.isActive("codeBlock"),
    apply: (editor) => plain(editor).setNode("codeBlock").run(),
  },
];

export const activeBlockKind = (editor: Editor): BlockKind | undefined => blockKinds.find((kind) => kind.isActive(editor));

/** Kinds of block that hold running text and can therefore be turned into one another. */
const CONVERTIBLE = new Set(["paragraph", "heading", "bulletList", "orderedList", "taskList", "blockquote", "callout", "codeBlock"]);

export interface TopBlock {
  /** Position right before the block. */
  pos: number;
  index: number;
  size: number;
  typeName: string;
}

/** The top-level block containing a position (or starting at it). */
export function topBlockAt(editor: Editor, pos: number): TopBlock | null {
  const { doc } = editor.state;
  if (doc.childCount === 0) return null;
  const $pos = doc.resolve(Math.max(0, Math.min(pos, doc.content.size)));
  const index = Math.min($pos.index(0), doc.childCount - 1);
  const node = doc.child(index);
  let start = 0;
  for (let i = 0; i < index; i += 1) start += doc.child(i).nodeSize;
  return { pos: start, index, size: node.nodeSize, typeName: node.type.name };
}

export const selectedTopBlock = (editor: Editor): TopBlock | null => topBlockAt(editor, editor.state.selection.from);

export const canTurnInto = (block: TopBlock | null): boolean => block !== null && CONVERTIBLE.has(block.typeName);

/** Puts the selection over the whole content of a block, ready for `BlockKind.apply`. */
function selectContents(editor: Editor, block: TopBlock): void {
  const { doc } = editor.state;
  const from = TextSelection.near(doc.resolve(block.pos + 1), 1).from;
  const to = TextSelection.near(doc.resolve(block.pos + block.size - 1), -1).to;
  editor.commands.setTextSelection({ from: Math.min(from, to), to: Math.max(from, to) });
}

export function turnBlockInto(editor: Editor, block: TopBlock, kind: BlockKind): boolean {
  if (!canTurnInto(block)) return false;
  selectContents(editor, block);
  return kind.apply(editor);
}

/** Swaps a block with its neighbour. The cursor travels with the block. */
export function moveBlock(editor: Editor, block: TopBlock, direction: -1 | 1): boolean {
  const { state } = editor;
  const { doc } = state;
  const targetIndex = block.index + direction;
  if (targetIndex < 0 || targetIndex >= doc.childCount) return false;
  const node = doc.child(block.index);
  const neighbour = doc.child(targetIndex);
  const offset = state.selection.from - block.pos;
  const tr = state.tr;
  tr.delete(block.pos, block.pos + block.size);
  const insertAt = direction === -1 ? block.pos - neighbour.nodeSize : block.pos + neighbour.nodeSize;
  tr.insert(insertAt, node);
  const inside = offset > 0 && offset < block.size;
  if (inside && !(state.selection instanceof NodeSelection)) tr.setSelection(TextSelection.near(tr.doc.resolve(insertAt + offset)));
  else if (NodeSelection.isSelectable(node)) tr.setSelection(NodeSelection.create(tr.doc, insertAt));
  else tr.setSelection(TextSelection.near(tr.doc.resolve(insertAt + 1)));
  editor.view.dispatch(tr.scrollIntoView());
  return true;
}

export function duplicateBlock(editor: Editor, block: TopBlock): boolean {
  const { state } = editor;
  const node = state.doc.child(block.index);
  const at = block.pos + block.size;
  const tr = state.tr.insert(at, node.copy(node.content));
  tr.setSelection(TextSelection.near(tr.doc.resolve(at + 1)));
  editor.view.dispatch(tr.scrollIntoView());
  return true;
}

export function deleteBlock(editor: Editor, block: TopBlock): boolean {
  const { state } = editor;
  const tr = state.tr.delete(block.pos, block.pos + block.size);
  // A page always keeps at least one line to write on.
  if (tr.doc.childCount === 0) {
    const paragraph = state.schema.nodes.paragraph?.create();
    if (paragraph) tr.insert(0, paragraph);
  }
  tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(block.pos, tr.doc.content.size)), -1));
  editor.view.dispatch(tr.scrollIntoView());
  return true;
}
