/** A compact bar over the table being edited: rows, columns, the header row, and removing the table. */

import { PluginKey } from "@tiptap/pm/state";
import type { Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { ArrowDownToLine, ArrowLeftToLine, ArrowRightToLine, ArrowUpToLine, ChevronDown, PanelTop, Trash2 } from "lucide-react";
import { type ReactNode, useMemo, useRef } from "react";
import { floating, Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { Tooltip } from "@/components/ui/misc";
import { cn } from "@/lib/utils";
import { toolButton } from "./link-field";
import { EDITOR_TOOLBAR, toolbarKeyDown } from "./toolbar-keys";

const appendToBody = () => document.body;
const MENU_KEY = new PluginKey("tableMenu");
const GAP = 6;
const placement = { placement: "top-start" as const, offset: GAP, flip: true, shift: { padding: 8 } };

/**
 * How much more room to make above a table for the bar, in pixels: the bar sits above the
 * table it is about, and with no room there it lay over the lines before it.
 */
export function roomToMake(gapAbove: number, barHeight: number): number {
  return Math.max(0, Math.ceil(barHeight + GAP * 2 - gapAbove));
}

/**
 * Makes room above the table being edited for the bar, and gives it back when the bar
 * goes. The margin is set on the <table>, whose attributes the table's view leaves alone.
 */
function useRoomAbove(editor: Editor, bar: { current: HTMLElement | null }) {
  const held = useRef<{ table: HTMLElement; margin: string } | null>(null);
  return useMemo(() => {
    const release = () => {
      if (held.current) held.current.table.style.marginTop = held.current.margin;
      held.current = null;
    };
    /** True when the room changed, so the bar has to be placed again. */
    const reserve = (): boolean => {
      const table = innerTable(editor);
      if (!table || held.current?.table === table) return false;
      release();
      const block = table.closest(".tableWrapper") ?? table;
      const before = block.previousElementSibling?.getBoundingClientRect().bottom;
      if (before === undefined) return false;
      const extra = roomToMake(table.getBoundingClientRect().top - before, bar.current?.offsetHeight ?? 0);
      if (extra === 0) return false;
      held.current = { table, margin: table.style.marginTop };
      table.style.marginTop = `${Number.parseFloat(getComputedStyle(table).marginTop) + extra}px`;
      return true;
    };
    // Placed again once the room is made: the bar is placed against where the table was.
    const replace = () =>
      requestAnimationFrame(() => {
        if (!editor.isDestroyed) editor.view.dispatch(editor.state.tr.setMeta(MENU_KEY, "updatePosition"));
      });
    return {
      onShow: () => {
        if (reserve()) replace();
      },
      onUpdate: () => {
        if (reserve()) replace();
      },
      onHide: release,
      onDestroy: release,
    };
  }, [editor, bar]);
}
const textButton =
  "flex h-8 items-center gap-1 rounded-[4px] pr-1.5 pl-2 text-small text-ink hover:bg-surface-strong data-[state=open]:bg-surface-strong max-md:h-10";

/** The <table> itself, inside the wrapper that lets a wide table scroll. */
function innerTable(editor: Editor): HTMLElement | null {
  const dom = tableElement(editor);
  return dom?.tagName === "TABLE" ? dom : (dom?.querySelector("table") ?? null);
}

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
  const bar = useRef<HTMLDivElement>(null);
  const room = useRoomAbove(editor, bar);
  const run = (command: (chain: ReturnType<Editor["chain"]>) => ReturnType<Editor["chain"]>) => () => {
    command(editor.chain().focus()).run();
  };

  return (
    <BubbleMenu
      editor={editor}
      pluginKey={MENU_KEY}
      appendTo={appendToBody}
      updateDelay={0}
      options={{ ...placement, ...room }}
      className="z-(--z-dropdown)"
      // Hidden while text is selected, so it never sits under the selection toolbar.
      shouldShow={({ editor: current, state, view, element }) =>
        current.isEditable &&
        (view.hasFocus() || element.contains(document.activeElement)) &&
        state.selection.empty &&
        current.isActive("table")
      }
      getReferencedVirtualElement={() => {
        const table = innerTable(editor);
        return table ? { getBoundingClientRect: () => table.getBoundingClientRect() } : null;
      }}
    >
      <div
        ref={bar}
        role="toolbar"
        aria-label="Table"
        aria-orientation="horizontal"
        data-editor-popup
        {...{ [EDITOR_TOOLBAR]: "" }}
        onKeyDown={toolbarKeyDown(editor)}
        className={cn(floating, "flex min-w-0 items-center gap-0.5 p-1")}
      >
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
