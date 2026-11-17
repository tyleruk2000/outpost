/**
 * The frame every game is drawn in: the screen's heading in the same place as every
 * other screen, the controls of the game beside it, the board, and under the board a
 * disclosure for the rules and what is kept ("About").
 */
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { Page, PageHeader } from "@/components/page";

export function GameFrame({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: ReactNode;
  /** New game, undo and the like, beside the heading on a wide screen and under it on a phone. */
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Page width="wide" className="max-md:px-4 max-md:pt-5">
      <PageHeader title={title} description={description} actions={actions} className="mb-5 md:mb-6" />
      {children}
    </Page>
  );
}

/** A disclosure under the board: the rules used, and what is kept where. */
export function GameAbout({ summary = "About this game", children }: { summary?: string; children: ReactNode }) {
  return (
    <details className="group mt-6 border-t border-border pt-2 text-small">
      <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1.5 text-primary md:min-h-8 [&::-webkit-details-marker]:hidden">
        <ChevronRight aria-hidden className="size-4 transition-transform duration-150 group-open:rotate-90 motion-reduce:transition-none" />
        {summary}
      </summary>
      <div className="mt-1 grid max-w-[70ch] gap-2 pl-5.5 text-ink">{children}</div>
    </details>
  );
}

/**
 * The classes for a board: no text selection, no long-press callout, and no double-tap
 * zoom (`touch-action: manipulation` keeps scrolling and pinching the page). A board that
 * drags pieces sets `touch-none` on the piece being dragged, not on the whole board, so
 * that the page can still be scrolled past it.
 */
export const boardSurface = "select-none touch-manipulation [-webkit-touch-callout:none] [-webkit-tap-highlight-color:transparent]";
