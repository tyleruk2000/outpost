/**
 * The bars over the text (the formatting bar over a selection, the table bar over a
 * table) from the keyboard. Alt+F10 in the page moves focus into whichever bar is
 * showing, as in most editors; in the bar the arrow keys, Home and End move between its
 * buttons (one Tab stop for the whole bar), and Escape or Tab goes back to the text
 * with the selection as it was.
 */
import type { Editor } from "@tiptap/react";
import type { KeyboardEvent } from "react";

/** The key, as `aria-keyshortcuts` writes it. */
export const TOOLBAR_SHORTCUT = "Alt+F10";

/** Marks a bar over the text that Alt+F10 can reach. */
export const EDITOR_TOOLBAR = "data-editor-toolbar";

const items = (bar: HTMLElement): HTMLElement[] =>
  [...bar.querySelectorAll<HTMLElement>("button, input, [href]")].filter(
    (element) => !element.hasAttribute("disabled") && element.closest(`[${EDITOR_TOOLBAR}]`) === bar,
  );

/** The bar over the text that is showing, if one is. */
export function shownToolbar(root: ParentNode = document): HTMLElement | null {
  for (const bar of root.querySelectorAll<HTMLElement>(`[${EDITOR_TOOLBAR}]`)) {
    const style = getComputedStyle(bar.parentElement ?? bar);
    if (bar.isConnected && bar.getClientRects().length > 0 && style.visibility !== "hidden" && style.display !== "none") return bar;
  }
  return null;
}

/** Moves focus into the bar showing over the text: to the button last used there, or the first. True when there was one. */
export function focusToolbar(root: ParentNode = document): boolean {
  const bar = shownToolbar(root);
  if (!bar) return false;
  const all = items(bar);
  const target = all.find((item) => item.tabIndex === 0) ?? all[0];
  if (!target) return false;
  for (const item of all) item.tabIndex = item === target ? 0 : -1;
  target.focus();
  return true;
}

/** Keys inside a bar over the text. Put on the element with role="toolbar". */
export function toolbarKeyDown(editor: Editor) {
  return (event: KeyboardEvent<HTMLElement>) => {
    const bar = event.currentTarget;
    const target = event.target as HTMLElement;
    // Typing in the link field is typing, not moving along the bar.
    const typing = target instanceof HTMLInputElement;
    if (event.key === "Escape" || (event.key === "Tab" && !typing)) {
      event.preventDefault();
      event.stopPropagation();
      editor.commands.focus();
      return;
    }
    if (typing) return;
    const all = items(bar);
    const at = all.indexOf(target);
    if (at === -1) return;
    const next = { ArrowRight: at + 1, ArrowLeft: at - 1, Home: 0, End: all.length - 1 }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    const item = all[(next + all.length) % all.length];
    if (!item) return;
    for (const other of all) other.tabIndex = other === item ? 0 : -1;
    item.focus();
  };
}
