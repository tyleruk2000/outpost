/**
 * The panel beside the map (desktop) or the sheet over its lower edge (phones). Both
 * hold the same five tabs; only the container differs.
 */
import { PanelLeftClose } from "lucide-react";
import { type KeyboardEvent, type PointerEvent, type ReactNode, type RefObject, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger, Tooltip } from "@/components/ui/misc";
import { cn } from "@/lib/utils";

export const PANEL_TABS = ["places", "routes", "layers", "offline", "sun"] as const;
export type PanelTab = (typeof PANEL_TABS)[number];

/**
 * Shorter names shown on the tab, with the full name as its accessible name: five full names
 * do not fit on one line in the side panel or on a 390 px phone, and "Sun" went on a second.
 */
const SHORT_LABELS: Partial<Record<PanelTab, string>> = { offline: "Offline" };

const TAB_LABELS: Record<PanelTab, string> = { places: "Places", routes: "Routes", layers: "Layers", offline: "Offline maps", sun: "Sun" };

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
      {/* Five names and two counts fit across a 320 px phone at the usual text size, with "Offline maps" written "Offline"
          (its full name is still its accessible name). Where they do not (larger text, a zoomed page, counts in the
          hundreds) the row takes a second line: a name that had slid off the edge of a row that scrolls was a tab nobody found.
          The two lines sit close: each name has its own height to touch, and the map has little enough room there. */}
      <TabsList className="shrink-0 gap-y-0 px-4 max-[23rem]:gap-x-3 max-[23rem]:px-3">
        {PANEL_TABS.map((item) => (
          <TabsTrigger
            key={item}
            value={item}
            onClick={onTabPress}
            aria-label={SHORT_LABELS[item] ? TAB_LABELS[item] : undefined}
            className="max-md:min-h-[44px] md:pointer-coarse:min-h-[44px] max-md:min-w-[44px] md:pointer-coarse:min-w-[44px] max-md:justify-center md:pointer-coarse:justify-center"
          >
            {SHORT_LABELS[item] ?? TAB_LABELS[item]}
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
          {/* The tab's name as a heading a screen reader can find, between the screen's h1 and the tab's own h3s. */}
          <h2 className="sr-only">{TAB_LABELS[item]}</h2>
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
        {/* The screen under Maps, linked from its own content as every parent screen does. */}
        <Link
          to="/maps/data"
          className="ml-auto inline-flex min-h-8 items-center rounded-control px-1 text-small text-primary underline decoration-1 underline-offset-2 hover:decoration-2"
        >
          Offline maps
        </Link>
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
function usePeekHeight(sheet: RefObject<HTMLElement | null>, first: string): number {
  const [peek, setPeek] = useState(PEEK_HEIGHT);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `first` is here so that a new first line is found and measured
  useLayoutEffect(() => {
    const element = sheet.current;
    // The row of tab names, or the first line of a tool that has taken the sheet over (its title and its close button).
    const tabs = element?.querySelector<HTMLElement>('[data-sheet-peek], [role="tablist"]');
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
  }, [sheet, first]);
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
  first = "tabs",
  hidden = false,
  children,
}: {
  detent: Detent;
  onDetentChange: (detent: Detent) => void;
  /** Told how tall the lowered sheet is, once that has been measured. */
  onPeekHeight?: (height: number) => void;
  /** What the sheet's first line is just now (the tabs, or a tool's name): when it changes, the lowered height is measured again. */
  first?: string;
  /** Out of sight while a card of what is in hand has its place (map-furniture.tsx); its height and state are kept for its return. */
  hidden?: boolean;
  children: ReactNode;
}) {
  const sheet = useRef<HTMLElement>(null);
  const peek = usePeekHeight(sheet, first);
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
      data-detent={detent}
      hidden={hidden}
      className={cn(
        "outpost-sheet absolute inset-x-0 bottom-0 z-20 flex flex-col rounded-t-[14px] border-t border-border bg-page shadow-float",
        dragHeight === null && "transition-[height] duration-(--duration-slow)",
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
        // 44 px to take hold of, 36 of them inside the sheet: the rest reaches up over the gap above it, so that
        // the handle and the first row of the sheet are never under the same finger.
        className="-mt-[8px] grid h-[44px] w-full shrink-0 touch-none place-content-center rounded-t-[14px] pt-[8px] focus-visible:-outline-offset-4"
      >
        <span aria-hidden className="h-1 w-10 rounded-full bg-border-strong" />
      </button>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </section>
  );
}
