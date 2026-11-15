/** The menu of a block: turn it into another kind, duplicate, move, delete. */
import type { Editor } from "@tiptap/react";
import { ArrowDown, ArrowUp, Check, ChevronRight, Copy, Replace, Trash2 } from "lucide-react";
import { DropdownMenu } from "radix-ui";
import { floating, MenuItem, MenuLabel, MenuSeparator } from "@/components/ui/menu";
import { cn, isMac } from "@/lib/utils";
import { type BlockKind, blockKinds, canTurnInto, deleteBlock, duplicateBlock, moveBlock, type TopBlock, turnBlockInto } from "./blocks";

const hint = "ml-auto pl-4 font-mono text-micro text-ink-faint";
const keys = isMac ? { duplicate: "⇧⌘D", up: "⌥⇧↑", down: "⌥⇧↓" } : { duplicate: "Ctrl Shift D", up: "Alt Shift ↑", down: "Alt Shift ↓" };

/** The kinds a block can become, with a tick on what it is now. */
export function TurnIntoItems({ active, onPick }: { active: string | undefined; onPick(kind: BlockKind): void }) {
  return (
    <>
      {blockKinds.map((kind) => (
        <MenuItem key={kind.id} onSelect={() => onPick(kind)}>
          <kind.icon /> {kind.label}
          {kind.id === active ? <Check className="ml-auto text-primary!" aria-label="Current" /> : null}
        </MenuItem>
      ))}
    </>
  );
}

export function BlockMenuItems({
  editor,
  block,
  activeKind,
  flat,
}: {
  editor: Editor;
  block: TopBlock;
  activeKind?: string;
  /** One list with no submenu and no key hints: how the menu is shown on touch screens. */
  flat?: boolean;
}) {
  const count = editor.state.doc.childCount;
  const turnInto = <TurnIntoItems active={activeKind} onPick={(kind) => turnBlockInto(editor, block, kind)} />;
  return (
    <>
      {canTurnInto(block) && !flat ? (
        <DropdownMenu.Sub>
          <DropdownMenu.SubTrigger className="flex cursor-default items-center gap-2.5 rounded-[4px] px-2.5 py-1.5 outline-none select-none data-highlighted:bg-surface-strong data-[state=open]:bg-surface-strong max-md:py-2.5 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-ink-muted">
            <Replace /> Turn into
            <ChevronRight className="ml-auto" />
          </DropdownMenu.SubTrigger>
          <DropdownMenu.Portal>
            <DropdownMenu.SubContent sideOffset={6} alignOffset={-5} collisionPadding={8} data-editor-popup className={cn(floating)}>
              {turnInto}
            </DropdownMenu.SubContent>
          </DropdownMenu.Portal>
        </DropdownMenu.Sub>
      ) : null}
      <MenuItem onSelect={() => duplicateBlock(editor, block)}>
        <Copy /> Duplicate {flat ? null : <span className={hint}>{keys.duplicate}</span>}
      </MenuItem>
      <MenuItem disabled={block.index === 0} onSelect={() => moveBlock(editor, block, -1)}>
        <ArrowUp /> Move up {flat ? null : <span className={hint}>{keys.up}</span>}
      </MenuItem>
      <MenuItem disabled={block.index >= count - 1} onSelect={() => moveBlock(editor, block, 1)}>
        <ArrowDown /> Move down {flat ? null : <span className={hint}>{keys.down}</span>}
      </MenuItem>
      <MenuSeparator />
      <MenuItem danger onSelect={() => deleteBlock(editor, block)}>
        <Trash2 /> Delete
      </MenuItem>
      {canTurnInto(block) && flat ? (
        <>
          <MenuSeparator />
          <MenuLabel>Turn into</MenuLabel>
          {turnInto}
        </>
      ) : null}
    </>
  );
}
