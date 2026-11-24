/**
 * The bar with Save that stays at the foot of a long form (a medical sheet, Keeping in
 * touch). On a phone it sits on the bar of screens, whose height grows by the home
 * indicator's room on an iPhone; at its old fixed 4rem the two overlapped there.
 *
 * A field reached with Tab scrolls into view at the very foot of the window, under the
 * bar; `SAVE_BAR_ROOM` on the form's container leaves the bar's height below whatever
 * takes the focus (WCAG 2.4.11), and on a phone the bar is marked `data-sticky-bottom`
 * so that a field reached any other way is moved clear of it (components/focus-clear.ts).
 *
 * `stuck` false leaves the bar where it is in the form, at its foot: a form with nothing
 * changed has nothing to save, and a bar over it only hides fields (owner's review).
 */
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export const SAVE_BAR_ROOM = "[&_*]:scroll-mb-20";

export function SaveBar({ children, stuck = true }: { children: ReactNode; stuck?: boolean }) {
  return (
    <div
      data-save-bar
      data-sticky-bottom={stuck ? "" : undefined}
      className={cn(
        "mt-6 flex flex-wrap items-center gap-3 border-t border-border bg-page py-3",
        stuck && "sticky bottom-[var(--mobile-nav-height,calc(3.5rem+env(safe-area-inset-bottom)))] z-(--z-sticky) md:bottom-0",
      )}
    >
      {children}
    </div>
  );
}
