/** The menu of a block: turn it into another kind, duplicate, move, delete. In a list it is the menu of one item, or of the whole list. */
import type { Editor } from "@tiptap/react";
import { ArrowDown, ArrowUp, Check, ChevronRight, Copy, Replace, Trash2 } from "lucide-react";
import { DropdownMenu } from "radix-ui";
import { useState } from "react";
import { floating, MenuItem, MenuLabel, MenuSeparator } from "@/components/ui/menu";
import { cn, isMac } from "@/lib/utils";
import { type BlockKind, blockKinds, canTurnInto, deleteBlock, duplicateBlock, moveBlock, type TopBlock, turnBlockInto } from "./blocks";
import { deleteListItem, duplicateListItem, isListKind, type ListItemTarget, moveListItem, turnListItemInto } from "./list-items";

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

type Scope = "item" | "block";

const scopeItem =
  "flex min-h-8 flex-1 cursor-default items-center justify-center rounded-[4px] px-3 whitespace-nowrap text-ink-muted outline-none select-none data-highlighted:bg-surface-strong data-[state=checked]:bg-primary-soft data-[state=checked]:font-medium data-[state=checked]:text-primary-soft-ink max-md:min-h-11";

/** In a list: whether the menu acts on the one item or on the whole block it is in. Choosing does not close the menu. */
function ScopeSwitch({ scope, onChange, whole }: { scope: Scope; onChange(scope: Scope): void; whole: string }) {
  return (
    <>
      <DropdownMenu.RadioGroup
        aria-label="Apply to"
        value={scope}
        onValueChange={(value) => onChange(value as Scope)}
        className="flex gap-1 p-0.5"
      >
        <DropdownMenu.RadioItem value="item" onSelect={(event) => event.preventDefault()} className={scopeItem}>
          This item
        </DropdownMenu.RadioItem>
        <DropdownMenu.RadioItem value="block" onSelect={(event) => event.preventDefault()} className={scopeItem}>
          {whole}
        </DropdownMenu.RadioItem>
      </DropdownMenu.RadioGroup>
      <MenuSeparator />
    </>
  );
}

export function BlockMenuItems({
  editor,
  block,
  item = null,
  activeKind,
  flat,
}: {
  editor: Editor;
  block: TopBlock;
  /** The list item the menu was opened on, when it was opened on one. */
  item?: ListItemTarget | null;
  activeKind?: string;
  /** One list with no submenu and no key hints: how the menu is shown on touch screens. */
  flat?: boolean;
}) {
  const [scope, setScope] = useState<Scope>("item");
  const onItem = item !== null && scope === "item";
  const count = editor.state.doc.childCount;

  // The same five actions, on the item or on the block.
  const can = onItem
    ? { turn: true, up: item.index > 0, down: item.index < item.count - 1 }
    : { turn: canTurnInto(block), up: block.index > 0, down: block.index < count - 1 };
  const act = onItem
    ? {
        turn: (kind: BlockKind) => turnListItemInto(editor, item, kind.id),
        duplicate: () => duplicateListItem(editor, item),
        move: (direction: -1 | 1) => moveListItem(editor, item, direction),
        remove: () => deleteListItem(editor, item),
      }
    : {
        turn: (kind: BlockKind) => turnBlockInto(editor, block, kind),
        duplicate: () => duplicateBlock(editor, block),
        move: (direction: -1 | 1) => moveBlock(editor, block, direction),
        remove: () => deleteBlock(editor, block),
      };
  const active = onItem ? item.listType : activeKind;
  // The keys act on the item the cursor is in, so they are not promised for the whole list.
  const hints = !flat && (item === null || onItem);
  const turnInto = <TurnIntoItems active={active} onPick={act.turn} />;

  return (
    <>
      {item ? <ScopeSwitch scope={scope} onChange={setScope} whole={isListKind(block.typeName) ? "Whole list" : "Whole block"} /> : null}
      {can.turn && !flat ? (
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
      <MenuItem onSelect={act.duplicate}>
        <Copy /> Duplicate {hints ? <span className={hint}>{keys.duplicate}</span> : null}
      </MenuItem>
      <MenuItem disabled={!can.up} onSelect={() => act.move(-1)}>
        <ArrowUp /> Move up {hints ? <span className={hint}>{keys.up}</span> : null}
      </MenuItem>
      <MenuItem disabled={!can.down} onSelect={() => act.move(1)}>
        <ArrowDown /> Move down {hints ? <span className={hint}>{keys.down}</span> : null}
      </MenuItem>
      <MenuSeparator />
      <MenuItem danger onSelect={act.remove}>
        <Trash2 /> Delete
      </MenuItem>
      {can.turn && flat ? (
        <>
          <MenuSeparator />
          <MenuLabel>Turn into</MenuLabel>
          {turnInto}
        </>
      ) : null}
    </>
  );
}
