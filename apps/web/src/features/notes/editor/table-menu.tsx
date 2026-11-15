/** A compact bar over the table being edited: rows, columns, the header row, and removing the table. */
import type { Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { ArrowDownToLine, ArrowLeftToLine, ArrowRightToLine, ArrowUpToLine, ChevronDown, PanelTop, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { floating, Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { Tooltip } from "@/components/ui/misc";
import { cn } from "@/lib/utils";
import { toolButton } from "./link-field";

const appendToBody = () => document.body;
const placement = { placement: "top-start" as const, offset: 6, flip: true, shift: { padding: 8 } };
const textButton =
  "flex h-8 items-center gap-1 rounded-[4px] pr-1.5 pl-2 text-small text-ink hover:bg-surface-strong data-[state=open]:bg-surface-strong max-md:h-10";

function tableElement(editor: Editor): HTMLElement | null {
  const { $from } = editor.state.selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    if ($from.node(depth).type.name === "table") {
      const dom = editor.view.nodeDOM($from.before(depth));
      return dom instanceof HTMLElement ? dom : null;
    }
  }
  return null;
}

function TableSubmenu({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Menu>
      <MenuTrigger asChild>
        <button type="button" className={textButton}>
          {label}
          <ChevronDown aria-hidden className="size-3.5 text-ink-muted" />
        </button>
      </MenuTrigger>
      <MenuContent align="start" data-editor-popup onCloseAutoFocus={(event) => event.preventDefault()}>
        {children}
      </MenuContent>
    </Menu>
  );
}

export function TableMenu({ editor }: { editor: Editor }) {
  const run = (command: (chain: ReturnType<Editor["chain"]>) => ReturnType<Editor["chain"]>) => () => {
    command(editor.chain().focus()).run();
  };

  return (
    <BubbleMenu
      editor={editor}
      pluginKey="tableMenu"
      appendTo={appendToBody}
      updateDelay={0}
      options={placement}
      className="z-(--z-dropdown)"
      // Hidden while text is selected, so it never sits under the selection toolbar.
      shouldShow={({ editor: current, state, view, element }) =>
        current.isEditable &&
        (view.hasFocus() || element.contains(document.activeElement)) &&
        state.selection.empty &&
        current.isActive("table")
      }
      getReferencedVirtualElement={() => {
        const table = tableElement(editor);
        return table ? { getBoundingClientRect: () => table.getBoundingClientRect() } : null;
      }}
    >
      <div role="toolbar" aria-label="Table" data-editor-popup className={cn(floating, "flex min-w-0 items-center gap-0.5 p-1")}>
        <TableSubmenu label="Row">
          <MenuItem onSelect={run((chain) => chain.addRowBefore())}>
            <ArrowUpToLine /> Add row above
          </MenuItem>
          <MenuItem onSelect={run((chain) => chain.addRowAfter())}>
            <ArrowDownToLine /> Add row below
          </MenuItem>
          <MenuSeparator />
          <MenuItem danger onSelect={run((chain) => chain.deleteRow())}>
            <Trash2 /> Delete row
          </MenuItem>
        </TableSubmenu>
        <TableSubmenu label="Column">
          <MenuItem onSelect={run((chain) => chain.addColumnBefore())}>
            <ArrowLeftToLine /> Add column to the left
          </MenuItem>
          <MenuItem onSelect={run((chain) => chain.addColumnAfter())}>
            <ArrowRightToLine /> Add column to the right
          </MenuItem>
          <MenuSeparator />
          <MenuItem danger onSelect={run((chain) => chain.deleteColumn())}>
            <Trash2 /> Delete column
          </MenuItem>
        </TableSubmenu>
        <span aria-hidden className="mx-0.5 h-5 w-px bg-border" />
        <Tooltip label="Header row on or off">
          <button
            type="button"
            aria-label="Header row on or off"
            onMouseDown={(event) => event.preventDefault()}
            onClick={run((chain) => chain.toggleHeaderRow())}
            className={toolButton}
          >
            <PanelTop aria-hidden />
          </button>
        </Tooltip>
        <Tooltip label="Delete table">
          <button
            type="button"
            aria-label="Delete table"
            onMouseDown={(event) => event.preventDefault()}
            onClick={run((chain) => chain.deleteTable())}
            className={cn(toolButton, "hover:bg-danger-soft hover:text-danger")}
          >
            <Trash2 aria-hidden />
          </button>
        </Tooltip>
      </div>
    </BubbleMenu>
  );
}
