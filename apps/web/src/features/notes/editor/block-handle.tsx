/**
 * The grip beside the block under the pointer. Dragging it moves the block; pressing it
 * opens the block menu. People without a pointer get the same actions from the keyboard
 * and, on touch screens, from the bar above the keyboard.
 */
import { DragHandle } from "@tiptap/extension-drag-handle-react";
import { TextSelection } from "@tiptap/pm/state";
import type { Editor } from "@tiptap/react";
import { GripVertical } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { Menu, MenuContent, MenuTrigger } from "@/components/ui/menu";
import { BlockMenuItems } from "./block-menu";
import { blockKinds, type TopBlock, topBlockAt } from "./blocks";

const position = { placement: "left-start" as const, strategy: "absolute" as const };

export function BlockHandle({ editor }: { editor: Editor }) {
  const hovered = useRef<number | null>(null);
  const [typeName, setTypeName] = useState("paragraph");
  const [menu, setMenu] = useState<{ block: TopBlock; kind: string | undefined } | null>(null);

  const onNodeChange = useCallback(
    ({ node, pos }: { node: { type: { name: string }; attrs: Record<string, unknown> } | null; pos: number }) => {
      hovered.current = node ? pos : null;
      if (node) setTypeName(node.type.name === "heading" ? `heading${String(node.attrs.level)}` : node.type.name);
    },
    [],
  );

  // The handle would otherwise wander off to another block while its menu is open.
  const lock = (locked: boolean) => editor.view.dispatch(editor.state.tr.setMeta("lockDragHandle", locked));

  const setOpen = (open: boolean) => {
    if (!open) {
      setMenu(null);
      lock(false);
      return;
    }
    const block = hovered.current === null ? null : topBlockAt(editor, hovered.current);
    if (!block) return;
    lock(true);
    const node = editor.state.doc.child(block.index);
    const kind = node.type.name === "heading" ? `heading${String(node.attrs.level)}` : node.type.name;
    setMenu({ block, kind: blockKinds.some((entry) => entry.id === kind) ? kind : undefined });
  };

  // A dragged block stays selected when it lands, which would bring up the selection
  // toolbar over it. Leave the cursor at its end instead.
  const settle = useCallback(() => {
    requestAnimationFrame(() => {
      if (editor.isDestroyed) return;
      const { state, view } = editor;
      if (state.selection.empty) return;
      view.dispatch(state.tr.setSelection(TextSelection.near(state.doc.resolve(state.selection.to), -1)));
    });
  }, [editor]);

  return (
    <DragHandle
      editor={editor}
      onNodeChange={onNodeChange}
      onElementDragEnd={settle}
      computePositionConfig={position}
      className={`note-block-handle is-${typeName}`}
    >
      {/* A plain button, opened on click: a menu trigger opens on press, and a press is how a drag starts. */}
      <button
        type="button"
        tabIndex={-1}
        aria-label="Block actions. Drag to move the block."
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
          <MenuContent side="bottom" align="start" data-editor-popup onCloseAutoFocus={(event) => event.preventDefault()}>
            <BlockMenuItems editor={editor} block={menu.block} activeKind={menu.kind} />
          </MenuContent>
        ) : null}
      </Menu>
    </DragHandle>
  );
}
