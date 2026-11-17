/**
 * The editing bar for touch screens. There is no hover on a phone, so everything the
 * block handle and the selection toolbar offer is here instead, in one row that sits on
 * top of the on-screen keyboard while the page is being written. Adding a block and Undo
 * are at its two ends and always in sight; the formatting between them scrolls sideways
 * when a narrow phone has no room for all of it.
 */
import type { Editor } from "@tiptap/react";
import { EllipsisVertical, IndentDecrease, IndentIncrease, Link2, Plus, Redo2, Undo2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Dialog, DialogBody, DialogContent } from "@/components/ui/dialog";
import { Menu, MenuContent, MenuTrigger } from "@/components/ui/menu";
import { cn } from "@/lib/utils";
import { BlockMenuItems } from "./block-menu";
import { selectedTopBlock, type TopBlock } from "./blocks";
import { markButtons, useFormatState } from "./format-state";
import { LINK_HELP, LinkField } from "./link-field";
import { type ListItemTarget, selectedListItem } from "./list-items";
import { useKeyboardInset } from "./use-touch";

const barButton =
  "grid size-11 shrink-0 place-content-center rounded-control text-ink-muted active:bg-surface-strong aria-pressed:bg-primary-soft aria-pressed:text-primary-soft-ink disabled:opacity-35 [&_svg]:size-[18px]";

/** Buttons must not take the focus, or the keyboard would close under the person's thumbs. */
const keepFocus = (event: { preventDefault(): void }) => event.preventDefault();

export function TouchBar({ editor }: { editor: Editor }) {
  const format = useFormatState(editor);
  const inset = useKeyboardInset();
  const [focused, setFocused] = useState(editor.isFocused);
  const [menu, setMenu] = useState<{ block: TopBlock; item: ListItemTarget | null } | null>(null);
  const [linking, setLinking] = useState(false);
  const active = new Set(format.marks.split(" "));

  useEffect(() => {
    const onFocus = () => setFocused(true);
    const onBlur = ({ event }: { event: FocusEvent }) => {
      const next = event.relatedTarget as HTMLElement | null;
      if (!next?.closest?.("[data-editor-popup]")) setFocused(false);
    };
    editor.on("focus", onFocus);
    editor.on("blur", onBlur);
    return () => {
      editor.off("focus", onFocus);
      editor.off("blur", onBlur);
    };
  }, [editor]);

  // Fades the edge of the formatting buttons that has more beyond it, so that a phone too
  // narrow for all of them shows there is more to scroll to.
  const middle = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState<"none" | "start" | "end" | "both">("none");
  const visible = focused || menu !== null || linking;
  const listButtons = format.listItem !== null;
  // biome-ignore lint/correctness/useExhaustiveDependencies: the indent buttons come and go with the cursor, which changes what overflows
  useEffect(() => {
    const strip = middle.current;
    if (!visible || !strip) return;
    const measure = () => {
      const start = strip.scrollLeft > 1;
      const end = strip.scrollLeft + strip.clientWidth < strip.scrollWidth - 1;
      setMore(start && end ? "both" : start ? "start" : end ? "end" : "none");
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(strip);
    strip.addEventListener("scroll", measure, { passive: true });
    return () => {
      observer.disconnect();
      strip.removeEventListener("scroll", measure);
    };
  }, [visible, listButtons]);

  const itemType = format.listItem;
  const keyboardOpen = inset > 80;
  if (!visible) return null;

  return (
    <>
      <div
        role="toolbar"
        aria-label="Editing"
        data-editor-popup
        style={keyboardOpen ? { bottom: inset } : undefined}
        className={cn(
          "fixed inset-x-0 z-(--z-nav) flex items-center gap-0.5 border-t border-border bg-raised px-1.5 py-1",
          // With no keyboard on screen the bar rests on the bottom tabs (phones) or the window edge.
          !keyboardOpen && "bottom-[calc(3.25rem+env(safe-area-inset-bottom))] md:bottom-0",
        )}
      >
        <button
          type="button"
          aria-label="Add a block"
          onPointerDown={keepFocus}
          onClick={() => {
            // The same menu as typing "/", opened for people who would never guess the key.
            const { $from } = editor.state.selection;
            const needsSpace = $from.parentOffset > 0 && !/\s$/.test($from.parent.textBetween(0, $from.parentOffset, undefined, "￼"));
            editor
              .chain()
              .focus()
              .insertContent(needsSpace ? " /" : "/")
              .run();
          }}
          disabled={format.inCode}
          className={barButton}
        >
          <Plus aria-hidden />
        </button>
        <Menu
          open={menu !== null}
          onOpenChange={(open) => {
            const block = open ? selectedTopBlock(editor) : null;
            // In a list the menu starts on the item the cursor is in.
            setMenu(block ? { block, item: selectedListItem(editor.state) } : null);
          }}
        >
          <MenuTrigger asChild>
            <button type="button" aria-label="Block actions" className={barButton}>
              <EllipsisVertical aria-hidden />
            </button>
          </MenuTrigger>
          {menu ? (
            <MenuContent
              side="top"
              align="start"
              data-editor-popup
              onCloseAutoFocus={(event) => event.preventDefault()}
              className="scroll-quiet max-h-[min(70dvh,var(--radix-dropdown-menu-content-available-height))] overflow-y-auto max-md:[&_[role=menuitem]]:min-h-11"
            >
              <BlockMenuItems editor={editor} block={menu.block} item={menu.item} activeKind={format.kind} flat />
            </MenuContent>
          ) : null}
        </Menu>
        <span aria-hidden className="mx-1 h-6 w-px shrink-0 bg-border" />
        <div
          ref={middle}
          data-more={more}
          className="scroll-quiet flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto data-[more=both]:[mask-image:linear-gradient(to_right,transparent,black_1.5rem,black_calc(100%-1.5rem),transparent)] data-[more=end]:[mask-image:linear-gradient(to_right,black_calc(100%-1.5rem),transparent)] data-[more=start]:[mask-image:linear-gradient(to_right,transparent,black_1.5rem)]"
        >
          {markButtons.map((button) => (
            <button
              key={button.mark}
              type="button"
              aria-label={button.label}
              aria-pressed={active.has(button.mark)}
              disabled={format.inCode}
              onPointerDown={keepFocus}
              onClick={() => editor.chain().focus().toggleMark(button.mark).run()}
              className={barButton}
            >
              <button.icon aria-hidden />
            </button>
          ))}
          <button
            type="button"
            aria-label="Link"
            aria-pressed={format.href !== null}
            disabled={format.inCode || (format.empty && format.href === null)}
            onClick={() => setLinking(true)}
            className={barButton}
          >
            <Link2 aria-hidden />
          </button>
          {itemType ? (
            <>
              <span aria-hidden className="mx-1 h-6 w-px shrink-0 bg-border" />
              <button
                type="button"
                aria-label="Indent less"
                onPointerDown={keepFocus}
                onClick={() => editor.chain().focus().liftListItem(itemType).run()}
                className={barButton}
              >
                <IndentDecrease aria-hidden />
              </button>
              <button
                type="button"
                aria-label="Indent more"
                onPointerDown={keepFocus}
                onClick={() => editor.chain().focus().sinkListItem(itemType).run()}
                className={barButton}
              >
                <IndentIncrease aria-hidden />
              </button>
            </>
          ) : null}
        </div>
        <span aria-hidden className="mx-1 h-6 w-px shrink-0 bg-border" />
        <button
          type="button"
          aria-label="Undo"
          disabled={!format.canUndo}
          onPointerDown={keepFocus}
          onClick={() => editor.chain().focus().undo().run()}
          className={barButton}
        >
          <Undo2 aria-hidden />
        </button>
        <button
          type="button"
          aria-label="Redo"
          disabled={!format.canRedo}
          onPointerDown={keepFocus}
          onClick={() => editor.chain().focus().redo().run()}
          className={barButton}
        >
          <Redo2 aria-hidden />
        </button>
      </div>

      <Dialog open={linking} onOpenChange={setLinking}>
        <DialogContent
          title={format.href ? "Change link" : "Add link"}
          description={LINK_HELP}
          size="sm"
          data-editor-popup
          onCloseAutoFocus={(event) => event.preventDefault()}
        >
          <DialogBody>
            <LinkField
              editor={editor}
              href={format.href}
              onDone={() => setLinking(false)}
              className="rounded-control border border-border-strong px-1 focus-within:border-focus"
            />
          </DialogBody>
        </DialogContent>
      </Dialog>
    </>
  );
}
