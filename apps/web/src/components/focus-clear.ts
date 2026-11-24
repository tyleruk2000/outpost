/**
 * On a phone the top bar stays at the top and the bar of screens at the bottom, over the page. A control
 * reached with Tab (a keyboard on a tablet, switch access) was scrolled just into the window by the
 * browser, which left it under one of the bars, where its focus ring could not be seen (WCAG 2.4.11).
 * The page is moved on by the bar's height and a little more. Only focus is moved for: a link to a
 * place on a screen (/settings#backup) lands as it always did, each screen keeping its own scroll margin.
 */
import { type RefObject, useEffect } from "react";

/** Room left between a focused control and a bar, in CSS pixels. */
const ROOM = 8;

/**
 * How far to scroll the page so that a box lies between the bars: negative is up, 0 is not at all. A box wholly
 * outside the window (`height` tall) was not scrolled to by the browser: focus given with `preventScroll`, or the page
 * moved since (a remembered place restored on Back, which this used to undo by scrolling back up to the search field).
 */
export function clearance(box: { top: number; bottom: number }, clearBelow: number, clearAbove: number, height = Infinity): number {
  if (box.bottom <= 0 || box.top >= height) return 0;
  if (box.top < clearBelow) return box.top - clearBelow - ROOM;
  // Up from under the bottom bar, but never so far that its top goes under the top bar: for a box taller than the room, the top matters.
  if (box.bottom > clearAbove) return Math.max(0, Math.min(box.bottom - clearAbove + ROOM, box.top - clearBelow - ROOM));
  return 0;
}

/**
 * Whether focus arriving on this element is one to keep clear of the bars: a control reached from the keyboard.
 * Not focus that follows a tap or a click: Safari on an iPhone does not focus a tapped button but the nearest
 * focusable box round it, `<main tabIndex={-1}>`, whose top is far above the window, so clearing it scrolled the
 * page to the top on the first tap of a button (owner's review, 24 Nov 2026). Nor the screen's own box (#content),
 * focused on purpose when a screen opens.
 */
export function wantsClearing(target: Element): boolean {
  if (target.id === "content" || target.tagName === "MAIN") return false;
  try {
    return target.matches(":focus-visible");
  } catch {
    // A browser without :focus-visible: keep the old behaviour.
    return true;
  }
}

export function useFocusClearOfBars(top: RefObject<HTMLElement | null>, bottom: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const onFocus = (event: FocusEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (!wantsClearing(target)) return;
      const header = top.current;
      const bar = bottom.current;
      // The bars are drawn only on a phone; a dialog or sheet lies over them, and the bars' own controls are in them.
      if (!header || !bar || header.offsetParent === null) return;
      if (header.contains(target) || bar.contains(target) || target.closest('[role="dialog"], [role="alertdialog"]')) return;
      // After the browser's own scroll to the control.
      requestAnimationFrame(() => {
        if (document.activeElement !== target) return;
        // A screen's own bar that stays under the top one (How search works' stage picker) is marked data-sticky-top.
        let clearBelow = header.getBoundingClientRect().bottom;
        for (const stuck of document.querySelectorAll<HTMLElement>("[data-sticky-top]")) {
          if (stuck.contains(target) || stuck.offsetParent === null) continue;
          const box = stuck.getBoundingClientRect();
          if (box.top <= clearBelow + 1) clearBelow = Math.max(clearBelow, box.bottom);
        }
        // And a form's own bar that stays on the bottom one (Save on a medical sheet) is marked data-sticky-bottom.
        let clearAbove = bar.getBoundingClientRect().top;
        for (const stuck of document.querySelectorAll<HTMLElement>("[data-sticky-bottom]")) {
          if (stuck.contains(target) || stuck.offsetParent === null) continue;
          const box = stuck.getBoundingClientRect();
          if (box.bottom >= clearAbove - 1 && box.top < clearAbove) clearAbove = box.top;
        }
        const by = clearance(target.getBoundingClientRect(), clearBelow, clearAbove, window.innerHeight);
        if (by !== 0) window.scrollBy({ top: by, behavior: "instant" });
      });
    };
    document.addEventListener("focusin", onFocus);
    return () => document.removeEventListener("focusin", onFocus);
  }, [top, bottom]);
}
