/**
 * The grip beside the block under the pointer. Dragging it moves the block; pressing it
 * opens the block menu. People without a pointer get the same actions from the keyboard
 * and, on touch screens, from the bar above the keyboard.
 *
 * In a list the grip belongs to the item under the pointer, not to the whole list: it
 * drags that item with whatever is nested under it, and its menu acts on that item.
 * Holding Alt (Option on a Mac) while starting to drag takes the whole block instead (the
 * entire list), and the menu can be switched to the whole block too. It is Alt because a
 * browser will not start a drag at all while Shift is held: Shift and a press extends
 * the selection.
 */
import { DragHandle } from "@tiptap/extension-drag-handle-react";
import type { Node as PMNode } from "@tiptap/pm/model";
import { NodeSelection, TextSelection } from "@tiptap/pm/state";
import type { Editor } from "@tiptap/react";
import { GripVertical } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Menu, MenuContent, MenuTrigger } from "@/components/ui/menu";
import { isMac } from "@/lib/utils";
import { BlockMenuItems } from "./block-menu";
import { blockKinds, type TopBlock, topBlockAt } from "./blocks";
import { isListItem, type ListItemTarget, listItemAt, movesWholeBlock } from "./list-items";

const wholeKey = isMac ? "Option" : "Alt";
const position = { placement: "left-start" as const, strategy: "absolute" as const };

/**
 * Which node the grip takes hold of: a block of the page itself, or a single list item
 * at any depth. The handle scores every node around the pointer from 1,000 and takes
 * away what this returns; a node left with nothing is not a target, and of the rest the
 * deepest wins, so in a list it is the item under the pointer. Lists inside a table are
 * left to the table's own grip, where there is no room for another.
 */
export function handleTargetDeduction({
  node,
  depth,
  $pos,
}: {
  node: PMNode;
  depth: number;
  $pos: { node(depth: number): PMNode };
}): number {
  if (depth === 1) return 0;
  if (!isListItem(node)) return 1000;
  for (let above = depth - 1; above > 0; above -= 1) if ($pos.node(above).type.name === "table") return 1000;
  return 0;
}

const targets = {
  defaultRules: false,
  edgeDetection: "none" as const,
  rules: [{ id: "pageBlocksAndListItems", evaluate: handleTargetDeduction }],
};

const kindOf = (node: { type: { name: string }; attrs: Record<string, unknown> }) =>
  node.type.name === "heading" ? `heading${String(node.attrs.level)}` : node.type.name;

export function BlockHandle({ editor }: { editor: Editor }) {
  const hovered = useRef<{ pos: number; item: boolean } | null>(null);
  const [typeName, setTypeName] = useState("paragraph");
  const [menu, setMenu] = useState<{ block: TopBlock; item: ListItemTarget | null; kind: string | undefined } | null>(null);

  const onNodeChange = useCallback(({ node, pos }: { node: PMNode | null; pos: number }) => {
    hovered.current = node ? { pos, item: isListItem(node) } : null;
    if (node) setTypeName(kindOf(node));
  }, []);

  // Beside a list item the grip stands left of the bullet, number or tick box, at the edge of its list.
  const reference = useCallback(() => {
    const at = hovered.current;
    if (!at?.item || editor.isDestroyed) return null;
    const dom = editor.view.nodeDOM(at.pos);
    const list = dom instanceof HTMLElement ? dom.parentElement : null;
    if (!(dom instanceof HTMLElement) || !list) return null;
    return {
      getBoundingClientRect: () => {
        const item = dom.getBoundingClientRect();
        const left = list.getBoundingClientRect().left;
        return new DOMRect(left, item.top, item.right - left, item.height);
      },
    };
  }, [editor]);

  // The handle would otherwise wander off to another block while its menu is open.
  const lock = (locked: boolean) => editor.view.dispatch(editor.state.tr.setMeta("lockDragHandle", locked));

  const setOpen = (open: boolean) => {
    if (!open) {
      setMenu(null);
      lock(false);
      return;
    }
    const at = hovered.current;
    const block = at ? topBlockAt(editor, at.pos) : null;
    if (!at || !block) return;
    lock(true);
    const kind = kindOf(editor.state.doc.child(block.index));
    setMenu({
      block,
      item: at.item ? listItemAt(editor.state.doc, at.pos) : null,
      kind: blockKinds.some((entry) => entry.id === kind) ? kind : undefined,
    });
  };

  // With Alt held, the drag that has just begun on a list item takes the whole block instead.
  // The handle sets up its own drag of the item on the grip's element; listening further up
  // the page means this runs after that, whatever order the listeners were added in.
  useEffect(() => {
    const frame = editor.view.dom.parentElement;
    if (!frame) return;
    const takeWholeBlock = (event: DragEvent) => {
      const at = hovered.current;
      if (!event.altKey || !at?.item || !event.dataTransfer) return;
      if (!(event.target instanceof Element) || !event.target.closest(".note-block-handle")) return;
      const block = topBlockAt(editor, at.pos);
      if (!block) return;
      const { view } = editor;
      const selection = NodeSelection.create(view.state.doc, block.pos);
      view.dragging = { slice: selection.content(), move: true, node: selection } as typeof view.dragging;
      // On a Mac, Option held over a drop means "copy". This drag is a move whatever is held.
      movesWholeBlock.add(view);
      view.dispatch(view.state.tr.setSelection(selection));
      const dom = view.nodeDOM(block.pos);
      if (dom instanceof HTMLElement) event.dataTransfer.setDragImage(dom, 0, 0);
    };

    // Any key hides the handle, which is right for typing and wrong for Alt: the handle has to
    // still be there to press. After a bare modifier key, show it again where the pointer last was.
    let pointer: { x: number; y: number } | null = null;
    const track = (event: MouseEvent) => {
      if (editor.view.dom.contains(event.target as Node)) pointer = { x: event.clientX, y: event.clientY };
    };
    const forget = () => {
      pointer = null;
    };
    const keepHandle = (event: KeyboardEvent) => {
      const at = pointer;
      if (!at || !["Alt", "Shift", "Control", "Meta"].includes(event.key)) return;
      requestAnimationFrame(() => {
        if (!editor.isDestroyed)
          editor.view.dom.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: at.x, clientY: at.y }));
      });
    };

    frame.addEventListener("dragstart", takeWholeBlock);
    frame.addEventListener("mousemove", track);
    frame.addEventListener("mouseleave", forget);
    frame.addEventListener("keydown", keepHandle);
    return () => {
      frame.removeEventListener("dragstart", takeWholeBlock);
      frame.removeEventListener("mousemove", track);
      frame.removeEventListener("mouseleave", forget);
      frame.removeEventListener("keydown", keepHandle);
    };
  }, [editor]);

  // A dragged block stays selected when it lands, which would bring up the selection
  // toolbar over it. Leave the cursor at its end instead.
  const settle = useCallback(() => {
    movesWholeBlock.delete(editor.view);
    requestAnimationFrame(() => {
      if (editor.isDestroyed) return;
      const { state, view } = editor;
      if (state.selection.empty) return;
      view.dispatch(state.tr.setSelection(TextSelection.near(state.doc.resolve(state.selection.to), -1)));
    });
  }, [editor]);

  const onItem = typeName === "listItem" || typeName === "taskItem";

  return (
    <DragHandle
      editor={editor}
      nested={targets}
      onNodeChange={onNodeChange}
      onElementDragEnd={settle}
      getReferencedVirtualElement={reference}
      computePositionConfig={position}
      className={`note-block-handle is-${typeName}`}
    >
      {/* A plain button, opened on click: a menu trigger opens on press, and a press is how a drag starts. */}
      <button
        type="button"
        tabIndex={-1}
        aria-label={
          onItem
            ? `List item actions. Drag to move the item; hold ${wholeKey} to move the whole list.`
            : "Block actions. Drag to move the block."
        }
        title={onItem ? `Drag to move this item. Hold ${wholeKey} to move the whole list.` : undefined}
        aria-haspopup="menu"
        data-state={menu ? "open" : "closed"}
        onClick={() => setOpen(true)}
      >
        <GripVertical aria-hidden />
      </button>
      <Menu open={menu !== null} onOpenChange={setOpen}>
        <MenuTrigger asChild>
          <span aria-hidden className="pointer-events-none absolute inset-0" />
        </MenuTrigger>
        {menu ? (
          <MenuContent
            side="bottom"
            align="start"
            data-editor-popup
            onCloseAutoFocus={(event) => {
              // The grip cannot take the focus back; the page does, so that undo is one key away.
              event.preventDefault();
              if (!editor.isDestroyed) editor.view.focus();
            }}
          >
            <BlockMenuItems editor={editor} block={menu.block} item={menu.item} activeKind={menu.kind} />
          </MenuContent>
        ) : null}
      </Menu>
    </DragHandle>
  );
}
