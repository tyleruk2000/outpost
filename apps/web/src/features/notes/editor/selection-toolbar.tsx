/**
 * The toolbar over selected text: formatting, a link field, and "Turn into". With the
 * cursor resting in a link it shows that link's address instead, to open, change or remove.
 */

import { NodeSelection } from "@tiptap/pm/state";
import { CellSelection } from "@tiptap/pm/tables";
import type { Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { ChevronDown, Link2 } from "lucide-react";
import { useEffect, useState } from "react";
import { floating, Menu, MenuContent, MenuTrigger } from "@/components/ui/menu";
import { Tooltip } from "@/components/ui/misc";
import { cn, modKey } from "@/lib/utils";
import { TurnIntoItems } from "./block-menu";
import { blockKinds, canTurnInto, selectedTopBlock } from "./blocks";
import { markButtons, useFormatState } from "./format-state";
import { EDIT_LINK_EVENT } from "./link";
import { LinkField, toolButton } from "./link-field";

export const SELECTION_TOOLBAR = "selectionToolbar";

const appendToBody = () => document.body;
const placement = { placement: "top" as const, offset: 8, flip: true, shift: { padding: 8 } };

export function SelectionToolbar({ editor }: { editor: Editor }) {
  const format = useFormatState(editor);
  const [editingLink, setEditingLink] = useState(false);
  const active = new Set(format.marks.split(" "));
  // Resting in a link with nothing selected is a request to see that link.
  const linkMode = editingLink || (format.empty && format.href !== null);

  useEffect(() => {
    const dom = editor.view.dom;
    const open = () => setEditingLink(true);
    dom.addEventListener(EDIT_LINK_EVENT, open);
    return () => dom.removeEventListener(EDIT_LINK_EVENT, open);
  }, [editor]);

  // A new selection starts with the formatting buttons again.
  useEffect(() => {
    const reset = () => setEditingLink(false);
    editor.on("selectionUpdate", reset);
    return () => {
      editor.off("selectionUpdate", reset);
    };
  }, [editor]);

  // The toolbar lives on the body, so focus moving anywhere else has to hide it by hand.
  useEffect(() => {
    const onBlur = ({ event }: { event: FocusEvent }) => {
      const next = event.relatedTarget as HTMLElement | null;
      if (next?.closest?.("[data-editor-popup]")) return;
      editor.view.dispatch(editor.state.tr.setMeta(SELECTION_TOOLBAR, "hide"));
    };
    editor.on("blur", onBlur);
    return () => {
      editor.off("blur", onBlur);
    };
  }, [editor]);

  const block = selectedTopBlock(editor);
  const kind = blockKinds.find((entry) => entry.id === format.kind);

  return (
    <BubbleMenu
      editor={editor}
      pluginKey={SELECTION_TOOLBAR}
      appendTo={appendToBody}
      updateDelay={120}
      options={placement}
      className="z-(--z-dropdown)"
      shouldShow={({ editor: current, state, from, to, view, element }) => {
        if (!current.isEditable) return false;
        const { selection } = state;
        if (selection instanceof NodeSelection || selection instanceof CellSelection) return false;
        if (state.doc.resolve(from).parent.type.spec.code) return false;
        if (!view.hasFocus() && !element.contains(document.activeElement)) return false;
        if (selection.empty) return current.isActive("link");
        return state.doc.textBetween(from, to, " ").trim().length > 0;
      }}
    >
      <div
        role="toolbar"
        aria-label="Format the selection"
        data-editor-popup
        className={cn(floating, "flex min-w-0 items-center gap-0.5 p-1")}
      >
        {linkMode ? (
          <LinkField
            key={format.href ?? "new"}
            editor={editor}
            href={format.href}
            onDone={() => setEditingLink(false)}
            className="w-[min(20rem,calc(100vw-2rem))]"
          />
        ) : (
          <>
            {canTurnInto(block) ? (
              <>
                <Menu>
                  <MenuTrigger asChild>
                    <button
                      type="button"
                      className="flex h-8 items-center gap-1 rounded-[4px] pr-1.5 pl-2 text-small text-ink hover:bg-surface-strong data-[state=open]:bg-surface-strong"
                    >
                      {kind?.label ?? "Turn into"}
                      <ChevronDown aria-hidden className="size-3.5 text-ink-muted" />
                    </button>
                  </MenuTrigger>
                  <MenuContent align="start" data-editor-popup onCloseAutoFocus={(event) => event.preventDefault()}>
                    <TurnIntoItems active={format.kind} onPick={(next) => next.apply(editor)} />
                  </MenuContent>
                </Menu>
                <span aria-hidden className="mx-0.5 h-5 w-px bg-border" />
              </>
            ) : null}
            {markButtons.map((button) => (
              <Tooltip key={button.mark} label={button.label} shortcut={button.shortcut}>
                <button
                  type="button"
                  aria-label={button.label}
                  aria-pressed={active.has(button.mark)}
                  onClick={() => editor.chain().focus().toggleMark(button.mark).run()}
                  className={toolButton}
                >
                  <button.icon aria-hidden />
                </button>
              </Tooltip>
            ))}
            <span aria-hidden className="mx-0.5 h-5 w-px bg-border" />
            <Tooltip label="Link" shortcut={`${modKey} K`}>
              <button
                type="button"
                aria-label="Link"
                aria-pressed={format.href !== null}
                onClick={() => setEditingLink(true)}
                className={toolButton}
              >
                <Link2 aria-hidden />
              </button>
            </Tooltip>
          </>
        )}
      </div>
    </BubbleMenu>
  );
}
