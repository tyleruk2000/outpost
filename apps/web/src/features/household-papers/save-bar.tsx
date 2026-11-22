/**
 * The bar with Save that stays at the foot of a long form (a medical sheet, Keeping in
 * touch). On a phone it sits on the bar of screens, whose height grows by the home
 * indicator's room on an iPhone; at its old fixed 4rem the two overlapped there.
 *
 * A field reached with Tab scrolls into view at the very foot of the window, under the
 * bar; `SAVE_BAR_ROOM` on the form's container leaves the bar's height below whatever
 * takes the focus (WCAG 2.4.11). The bar of screens on a phone is left by the page's own
 * scroll padding (styles/base.css).
 */
import type { ReactNode } from "react";

export const SAVE_BAR_ROOM = "[&_*]:scroll-mb-20";

export function SaveBar({ children }: { children: ReactNode }) {
  return (
    <div
      data-save-bar
      className="sticky bottom-[var(--mobile-nav-height,calc(3.5rem+env(safe-area-inset-bottom)))] z-(--z-sticky) mt-6 flex flex-wrap items-center gap-3 border-t border-border bg-page py-3 md:bottom-0"
    >
      {children}
    </div>
  );
}
