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
  hideTabs = false,
  children,
}: {
  tab: PanelTab;
  onTabChange: (tab: PanelTab) => void;
  /** Any press on a tab, including the one already showing: on a phone it raises the lowered sheet. */
  onTabPress?: () => void;
  counts: Partial<Record<PanelTab, number>>;
  /**
   * On a phone, while a form has the sheet (Plan a route, a place being added or changed, Find a route): the row of
   * names is put away so the form starts at the top of the sheet. The form's own first line leads back.
   */
  hideTabs?: boolean;
  children: Record<PanelTab, ReactNode>;
}) {
  return (
    <Tabs value={tab} onValueChange={(next) => onTabChange(next as PanelTab)} className="flex min-h-0 flex-1 flex-col">
      {/* Five names and two counts fit across a 320 px phone at the usual text size, with "Offline maps" written "Offline"
          (its full name is still its accessible name). Where they do not (larger text, a zoomed page, counts in the
          hundreds) the row takes a second line: a name that had slid off the edge of a row that scrolls was a tab nobody found.
          The two lines sit close: each name has its own height to touch, and the map has little enough room there. */}
      <TabsList hidden={hideTabs} className="shrink-0 gap-y-0 px-4 max-[23rem]:gap-x-3 max-[23rem]:px-3">
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
 * What of the map area the browser is showing just now, where the phone's keyboard is up:
 * iOS leaves the page its full height and lays the keyboard over its foot, so a sheet held
 * to the foot of the map area had its fields under the keyboard. `inset` is how much of the
 * area's foot is covered; `height` how much of the area is still to be seen. With no
 * keyboard (or no `visualViewport`) the whole area.
 */
export function keyboardFit(
  area: { top: number; bottom: number },
  viewport: { offsetTop: number; height: number } | null,
): { inset: number; height: number } {
  const whole = { inset: 0, height: Math.max(0, area.bottom - area.top) };
  if (!viewport) return whole;
  const bottom = Math.min(area.bottom, viewport.offsetTop + viewport.height);
  const top = Math.max(area.top, viewport.offsetTop);
  const inset = Math.max(0, Math.round(area.bottom - bottom));
  // A pixel or two is the browser rounding, not a keyboard.
  if (inset < 2) return whole;
  return { inset, height: Math.max(0, Math.round(bottom - top)) };
}

/** Below this much room to show, a sheet being typed in takes all of it, over the search box too. */
export const SHORT_ROOM = 440;

/**
 * The sheet's height while a field in it is being typed in, or null for its height at rest. With the keyboard up the
 * sheet stands on it and takes what is left above (`keyboardFit`); where that is little (a phone's keyboard leaves
 * about 300 px), it takes all of it, the search box over the map too: the form's own first line leads back, and the
 * field and its suggestions are what is wanted. Lowered, it stays lowered.
 */
export function typingHeight(detent: Detent, typing: { inset: number; height: number } | null, peek = PEEK_HEIGHT): number | null {
  if (!typing || detent === "peek") return null;
  if (typing.height < SHORT_ROOM) return typing.height;
  return typing.inset > 0 ? detentHeight("full", typing.height, peek) : null;
}

/**
 * `keyboardFit` for the map area the sheet sits in, while a field in the sheet has focus (the keyboard up for the
 * search box over the map leaves the sheet as it is); followed as the keyboard comes and goes and the page is panned
 * under it.
 */
function useTypingFit(sheet: RefObject<HTMLElement | null>): { inset: number; height: number } | null {
  const [fit, setFit] = useState<{ inset: number; height: number } | null>(null);
  useEffect(() => {
    const viewport = window.visualViewport;
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const element = sheet.current;
        const box = element?.parentElement?.getBoundingClientRect();
        if (!element || !box) return;
        const field = document.activeElement;
        const typing =
          element.contains(field) &&
          (field instanceof HTMLTextAreaElement ||
            (field instanceof HTMLInputElement && !["checkbox", "radio", "button", "submit", "range"].includes(field.type)));
        // The box is in the page's own coordinates, as the visual viewport's offset is.
        const next = keyboardFit(box, viewport ? { offsetTop: viewport.offsetTop, height: viewport.height } : null);
        setFit((current) => (!typing ? null : current?.inset === next.inset && current.height === next.height ? current : next));
      });
    };
    measure();
    viewport?.addEventListener("resize", measure);
    viewport?.addEventListener("scroll", measure);
    window.addEventListener("resize", measure);
    document.addEventListener("focusin", measure);
    document.addEventListener("focusout", measure);
    return () => {
      cancelAnimationFrame(frame);
      viewport?.removeEventListener("resize", measure);
      viewport?.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
      document.removeEventListener("focusin", measure);
      document.removeEventListener("focusout", measure);
    };
  }, [sheet]);
  return fit;
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
    // The row of tab names, or the first line of a tool or form that has taken the sheet over (its title and its way
    // back): the first of them that is on show.
    const tabs = [...(element?.querySelectorAll<HTMLElement>('[data-sheet-peek], [role="tablist"]') ?? [])].find(
      (each) => each.getClientRects().length > 0,
    );
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
  action,
  children,
}: {
  /** The one action of the lowered sheet, at the right of its handle under the thumb: Directions. */
  action?: ReactNode;
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

  // With the keyboard up for a field in the sheet, the sheet stands on the keyboard and takes what is left above it,
  // so the field being typed in is never under the keyboard (typingHeight).
  const typing = useTypingFit(sheet);
  const height = dragHeight ?? typingHeight(detent, typing, peek) ?? detentHeight(detent, areaHeight, peek);
  const lift = typing?.inset ?? 0;
  const keyboard = typing && typingHeight(detent, typing, peek) !== null ? typing : null;
  // Once the sheet has settled on the keyboard, the field being typed in is scrolled into what is left of it.
  useEffect(() => {
    if (!keyboard) return;
    const timer = window.setTimeout(() => {
      const field = document.activeElement;
      if (field instanceof HTMLElement && sheet.current?.contains(field)) field.scrollIntoView?.({ block: "nearest" });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [keyboard]);
  useLayoutEffect(() => {
    const area = sheet.current?.parentElement;
    area?.style.setProperty("--sheet-height", `${height}px`);
    // Messages (toasts) stand above the sheet rather than over its handle and first line.
    document.documentElement.style.setProperty("--sheet-toast-lift", `${hidden ? 0 : height + lift}px`);
    return () => {
      area?.style.removeProperty("--sheet-height");
      document.documentElement.style.removeProperty("--sheet-toast-lift");
    };
  }, [height, lift, hidden]);

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
      style={{ height, bottom: lift || undefined }}
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
        className={cn(
          "-mt-[8px] grid w-full shrink-0 touch-none rounded-t-[14px] pt-[8px] focus-visible:-outline-offset-4",
          // With an action beside it, the row is as tall as the action's 44 px and the bar sits at its top.
          action ? "h-[56px] place-items-start justify-center pt-[14px]" : "h-[44px] place-content-center",
        )}
      >
        <span aria-hidden className="h-1 w-10 rounded-full bg-border-strong" />
      </button>
      {action ? <div className="absolute top-[4px] right-3 z-[1] flex">{action}</div> : null}
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </section>
  );
}
