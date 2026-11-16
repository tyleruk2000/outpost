/**
 * The panel beside the map (desktop) or the sheet over its lower edge (phones). Both
 * hold the same four tabs; only the container differs.
 */
import { PanelLeftClose } from "lucide-react";
import { type KeyboardEvent, type PointerEvent, type ReactNode, type RefObject, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger, Tooltip } from "@/components/ui/misc";
import { cn } from "@/lib/utils";

export const PANEL_TABS = ["places", "routes", "offline", "sun"] as const;
export type PanelTab = (typeof PANEL_TABS)[number];

const TAB_LABELS: Record<PanelTab, string> = { places: "Places", routes: "Routes", offline: "Offline maps", sun: "Sun" };

export function PanelTabs({
  tab,
  onTabChange,
  onTabPress,
  counts,
  children,
}: {
  tab: PanelTab;
  onTabChange: (tab: PanelTab) => void;
  /** Any press on a tab, including the one already showing: on a phone it raises the lowered sheet. */
  onTabPress?: () => void;
  counts: Partial<Record<PanelTab, number>>;
  children: Record<PanelTab, ReactNode>;
}) {
  return (
    <Tabs value={tab} onValueChange={(next) => onTabChange(next as PanelTab)} className="flex min-h-0 flex-1 flex-col">
      {/* Four names and two counts fit across a 320 px phone. Where they do not (larger text, a zoomed page, counts in the
          hundreds) the row takes a second line: a name that had slid off the edge of a row that scrolls was a tab nobody found. */}
      <TabsList className="shrink-0 flex-wrap overflow-x-visible px-4 max-[23rem]:gap-x-3.5 max-[23rem]:px-3">
        {PANEL_TABS.map((item) => (
          <TabsTrigger key={item} value={item} onClick={onTabPress} className="max-md:min-h-11">
            {TAB_LABELS[item]}
            {counts[item] ? <span className="tabular text-micro font-normal text-ink-muted">{counts[item]}</span> : null}
          </TabsTrigger>
        ))}
      </TabsList>
      {PANEL_TABS.map((item) => (
        <TabsContent
          key={item}
          value={item}
          className="flex min-h-0 flex-1 flex-col focus-visible:-outline-offset-2 data-[state=inactive]:hidden"
        >
          {children[item]}
        </TabsContent>
      ))}
    </Tabs>
  );
}

export function DesktopPanel({ onCollapse, children }: { onCollapse: () => void; children: ReactNode }) {
  return (
    <aside aria-label="Places, routes and offline maps" className="flex w-[22rem] shrink-0 flex-col border-r border-border bg-page">
      <div className="flex h-14 shrink-0 items-center justify-between gap-2 pr-2 pl-4">
        <h1 className="font-title text-heading text-ink">Maps</h1>
        <Tooltip label="Hide this panel" side="bottom">
          <Button variant="ghost" size="icon" aria-label="Hide this panel" onClick={onCollapse}>
            <PanelLeftClose />
          </Button>
        </Tooltip>
      </div>
      {children}
    </aside>
  );
}

export const DETENTS = ["peek", "half", "full"] as const;
export type Detent = (typeof DETENTS)[number];

/**
 * Height of the handle and the tab row at the usual text size: what stays on screen when
 * the sheet is lowered. The sheet measures the two itself (`usePeekHeight`), because with
 * larger text, or the row on two lines, they are taller than this.
 */
export const PEEK_HEIGHT = 82;

/** The sheet's height at each resting position, for a map area of the given height. `peek` is the lowered height when it has been measured. */
export function detentHeight(detent: Detent, areaHeight: number, peek = PEEK_HEIGHT): number {
  if (detent === "peek") return peek;
  if (detent === "half") return Math.max(peek, Math.round(areaHeight * 0.5));
  // Full leaves the search box showing, so the way back to the map is never hidden.
  return Math.max(peek, areaHeight - 68);
}

export function nearestDetent(height: number, areaHeight: number, peek = PEEK_HEIGHT): Detent {
  let best: Detent = "peek";
  for (const detent of DETENTS) {
    if (Math.abs(detentHeight(detent, areaHeight, peek) - height) < Math.abs(detentHeight(best, areaHeight, peek) - height)) best = detent;
  }
  return best;
}

/**
 * How tall the lowered sheet has to be to show its handle and the whole row of tab names,
 * measured from the page: the names are the only way into the panel, so none of them may
 * end up below the edge of the sheet whatever size the text is.
 */
function usePeekHeight(sheet: RefObject<HTMLElement | null>): number {
  const [peek, setPeek] = useState(PEEK_HEIGHT);
  useLayoutEffect(() => {
    const element = sheet.current;
    const tabs = element?.querySelector<HTMLElement>('[role="tablist"]');
    if (!element || !tabs || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      // From the top of the sheet to the foot of the row, whatever height the sheet itself has just now.
      const needed = Math.ceil(tabs.getBoundingClientRect().bottom - element.getBoundingClientRect().top);
      if (needed > 0) setPeek(needed);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(tabs);
    return () => observer.disconnect();
  }, [sheet]);
  return peek;
}

/**
 * The phone layout's panel: a sheet with a handle that rests at three heights. It can
 * be dragged, tapped (which steps to the next height) or moved with the arrow keys.
 * Its height is published as `--sheet-height` on the map area, so what floats over the
 * map can stay clear of it.
 */
export function MobileSheet({
  detent,
  onDetentChange,
  onPeekHeight,
  children,
}: {
  detent: Detent;
  onDetentChange: (detent: Detent) => void;
  /** Told how tall the lowered sheet is, once that has been measured. */
  onPeekHeight?: (height: number) => void;
  children: ReactNode;
}) {
  const sheet = useRef<HTMLElement>(null);
  const peek = usePeekHeight(sheet);
  useEffect(() => onPeekHeight?.(peek), [peek, onPeekHeight]);
  const [areaHeight, setAreaHeight] = useState(600);
  const [dragHeight, setDragHeight] = useState<number | null>(null);
  const drag = useRef<{ startY: number; startHeight: number; moved: boolean } | null>(null);

  useEffect(() => {
    const area = sheet.current?.parentElement;
    if (!area) return;
    const observer = new ResizeObserver(([entry]) => entry && setAreaHeight(entry.contentRect.height));
    observer.observe(area);
    return () => observer.disconnect();
  }, []);

  const height = dragHeight ?? detentHeight(detent, areaHeight, peek);
  useLayoutEffect(() => {
    const area = sheet.current?.parentElement;
    area?.style.setProperty("--sheet-height", `${height}px`);
    return () => {
      area?.style.removeProperty("--sheet-height");
    };
  }, [height]);

  const onPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { startY: event.clientY, startHeight: detentHeight(detent, areaHeight, peek), moved: false };
  };
  const onPointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const state = drag.current;
    if (!state) return;
    const delta = state.startY - event.clientY;
    if (Math.abs(delta) > 6) state.moved = true;
    if (state.moved) setDragHeight(Math.max(peek, Math.min(detentHeight("full", areaHeight, peek), state.startHeight + delta)));
  };
  const onPointerUp = () => {
    const state = drag.current;
    drag.current = null;
    if (!state) return;
    if (state.moved && dragHeight !== null) onDetentChange(nearestDetent(dragHeight, areaHeight, peek));
    // A tap steps through the heights: up, up, then back down.
    else onDetentChange(DETENTS[(DETENTS.indexOf(detent) + 1) % DETENTS.length]!);
    setDragHeight(null);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const index = DETENTS.indexOf(detent);
    if (event.key === "ArrowUp" && index < DETENTS.length - 1) onDetentChange(DETENTS[index + 1]!);
    else if (event.key === "ArrowDown" && index > 0) onDetentChange(DETENTS[index - 1]!);
    else if (event.key === "Enter" || event.key === " ") onDetentChange(DETENTS[(index + 1) % DETENTS.length]!);
    else return;
    event.preventDefault();
  };

  return (
    <section
      ref={sheet}
      aria-label="Places, routes and offline maps"
      className={cn(
        "absolute inset-x-0 bottom-0 z-20 flex flex-col rounded-t-[14px] border-t border-border bg-page shadow-float",
        dragHeight === null && "transition-[height] duration-200 ease-out",
      )}
      style={{ height }}
    >
      <button
        type="button"
        aria-label={`Panel height: ${detent === "peek" ? "lowered" : detent === "half" ? "half" : "full"}. Drag, or press to change`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          drag.current = null;
          setDragHeight(null);
        }}
        onKeyDown={onKeyDown}
        className="grid h-11 w-full shrink-0 touch-none place-content-center rounded-t-[14px] focus-visible:-outline-offset-4"
      >
        <span aria-hidden className="h-1 w-10 rounded-full bg-border-strong" />
      </button>
      <div className="-mt-2 flex min-h-0 flex-1 flex-col">{children}</div>
    </section>
  );
}
