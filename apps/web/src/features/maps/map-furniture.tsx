/**
 * Where things sit over the map: the one place that decides it, for every tool.
 *
 * On a wide screen little lies over the map and nothing over its middle: search at the
 * top left, the column of controls at the top right, and at the foot the card of the
 * tool in hand with the readout, the scale and the credits under it.
 *
 * On a phone the same things share a much smaller map with the sheet, so each kind of
 * thing owns one place and gives way in a set order. They are laid out as one column
 * from the top of the map to the top of the sheet, so nothing can lie over anything else:
 *
 *   search, and the menu of every tool      the top edge, always
 *   the tools as icons                      under the end of the search box, as many as fit
 *   (the clear map)                         the centre of the map is two fifths of the way down it
 *   the cards                               the lower three fifths of the clear map, at most
 *   the readout, the scale, the credits     just above the sheet
 *
 * - A card may take the lower three fifths of the clear map, less a margin. The camera
 *   keeps the centre of the map two fifths of the way down, so the centre and the cross
 *   that marks it are never under a card, and the map does not move when one comes up.
 *   With more to say than that, a card scrolls inside itself; its title and its close
 *   button stay put.
 * - The column of icons shows what fits above the cards and stops there. Every tool is
 *   in the menu at the end of the search box by name, so none is lost when it is not in
 *   the column.
 * - As the room gets shorter (larger text, a small phone, the sheet raised), things step
 *   aside in this order: the icons, which show only what fits; then the coordinates of
 *   the centre, with the scale bar; then the line of sun times that is under them while
 *   the sheet is lowered. The credits and the search box never do. What fits is worked
 *   out here from what each of them measures, so it holds for any size of text and any
 *   length of credits: `data-room` on the column says which, and maps.css does the rest.
 * - With the sheet at its full height only the search box is left, as the way back.
 *
 * The space the top and the foot take is measured and handed to `onClear`, so the camera
 * can keep the centre of the map in the part that is left.
 */
import { type ReactNode, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * How much of the readout there is room for: all of it; the line of sun times without the coordinates
 * and the scale; or none of it, where there would be no clear map left with a cross on it.
 */
type Room = "all" | "sun" | "none";

/** The least height of clear map kept before anything of the readout is shown: room for the cross and a little round it. */
const CLEAR_MIN = 56;

export interface ClearSpace {
  /** From the top of the map to the top of the clear part of it. */
  top: number;
  /** From the top of the sheet up to the foot of the clear part. */
  bottom: number;
}

export function MapFurniture({
  phone,
  covered,
  search,
  tools,
  notice,
  cards,
  footer,
  onClear,
  docked = false,
  dockRoom,
}: {
  phone: boolean;
  /** The sheet is at its full height: only the search box is left showing. */
  covered: boolean;
  /**
   * On a phone: something is in hand and its card has taken the sheet's place at the foot of the map. The
   * readout steps aside, and the card has the whole width and everything up to just below the centre.
   */
  docked?: boolean;
  /** How tall the card at the foot, with the credits over it, may be: from the foot of the map to just below the centre. */
  dockRoom?: number;
  search: ReactNode;
  /** The column of controls: beside the search box on a wide screen, under its end on a phone. */
  tools: ReactNode;
  /** Something gone wrong with the map itself, said under the search box. */
  notice?: ReactNode;
  /** The cards of what is in hand, in the order they stack. */
  cards: ReactNode;
  footer: ReactNode;
  /** On a phone: how much of the map the top and the foot take, whenever that changes. */
  onClear?: (space: ClearSpace) => void;
}) {
  const column = useRef<HTMLDivElement>(null);
  const head = useRef<HTMLDivElement>(null);
  const foot = useRef<HTMLDivElement>(null);
  const latest = useRef(onClear);
  latest.current = onClear;
  const [room, setRoom] = useState<Room>("all");
  /** The heights of the coordinates and of the sun line as last seen, for when they are out of sight and cannot be measured. */
  const natural = useRef({ coordinates: 0, sun: 0 });

  useLayoutEffect(() => {
    // With the sheet at its full height the map is out of sight; what was measured before still stands for when it comes back.
    // With a card at the foot the readout is out of sight, and the camera keeps the room it had before (maps-page.tsx).
    if (!phone || covered || docked || typeof ResizeObserver === "undefined") return;
    const report = () => {
      const top = head.current?.getBoundingClientRect().height ?? 0;
      const bottom = foot.current?.getBoundingClientRect().height ?? 0;
      // What the readout has room for. Worked out from the heights its parts have when they show, not from
      // whether they show now, so that hiding one does not change the answer and bring it back.
      const all = column.current;
      if (all) {
        const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
        const height = (selector: string) => all.querySelector<HTMLElement>(selector)?.offsetHeight ?? 0;
        const sunLine = all.querySelector(".outpost-sun-line") !== null;
        if (height(".outpost-readout-coords") > 0) natural.current.coordinates = height(".outpost-readout-coords");
        if (height(".outpost-sun-line") > 0) natural.current.sun = height(".outpost-sun-line") + 1;
        const coordinates = natural.current.coordinates || 3 * rem;
        const sun = sunLine ? natural.current.sun || 3 * rem : 0;
        // What is left once the search box, the credits (which have a line of their own on a phone) and the least
        // of clear map are taken out, with the gaps between them. None of these depends on the answer.
        const free = all.clientHeight - top - 16 - height(".outpost-credits") - 6 - CLEAR_MIN;
        setRoom(free >= coordinates + sun ? "all" : sunLine && free >= sun ? "sun" : "none");
      }
      // The insets and gaps of the column: 12 px above the search box, 8 px between rows, 16 px above the sheet (the
      // sheet's handle reaches 8 px up, and the credits' "N more" reaches 8 px down to be 44 px to touch).
      latest.current?.({ top: 12 + top + 8, bottom: bottom > 0 ? 16 + bottom + 8 : 16 });
    };
    report();
    const observer = new ResizeObserver(report);
    for (const part of [column.current, head.current, foot.current]) if (part) observer.observe(part);
    return () => observer.disconnect();
  }, [phone, covered, docked]);

  if (!phone) {
    return (
      <>
        {/* It ends above the line of credits at the foot, so that the column of tools never runs over them or off the map. */}
        {/* Over the cards below it, so that the search box's list of results is never under one. */}
        <div className="pointer-events-none absolute inset-x-3 top-3 bottom-9 z-[11] flex items-start gap-2">
          {search}
          {tools}
        </div>
        {notice ? <div className="absolute inset-x-3 top-[4.25rem] z-10 flex justify-center">{notice}</div> : null}
        {/* Below the search box and above the foot: two cards at once (a recording's and a tool's) used to run up off the
            top of the map, under the search box. Now they share the height there is, and each scrolls inside itself. */}
        <div className="pointer-events-none absolute inset-x-3 top-[4.25rem] bottom-2.5 z-10 flex flex-col items-center justify-end gap-2">
          <div className="flex min-h-0 w-full shrink flex-col items-center justify-end gap-2 empty:hidden">{cards}</div>
          {footer}
        </div>
      </>
    );
  }

  return (
    // Insets and gaps in pixels, like the 44 px of what is pressed: they do not grow with the text.
    <div
      ref={column}
      data-room={room}
      data-docked={docked && !covered ? "" : undefined}
      className={cn(
        "outpost-furniture pointer-events-none absolute inset-x-[12px] top-[12px] flex flex-col gap-[8px]",
        // With the sheet at its full height only the search box is left above it, and its list of results drops over
        // the sheet (z 20), not under it, where nothing in it could be seen or pressed.
        covered ? "z-[21]" : "z-10",
        docked && !covered ? "bottom-0" : "bottom-[calc(var(--sheet-height,0px)+16px)]",
      )}
    >
      {/* Above the rest of the column: the search box's list of results drops over the tools and the cards under it (a
          card's title row is z 1), and a finger on the end of a result pressed "Show where I am" or a card instead. */}
      <div ref={head} className="relative z-[2] grid shrink-0 grid-cols-[minmax(0,1fr)] gap-[8px]">
        {search}
        {covered ? null : notice}
      </div>
      {covered ? null : docked ? (
        <>
          <div className="flex min-h-[56px] flex-1 flex-col">{tools}</div>
          {/* The foot of the map, edge to edge: the credits, then the card in the sheet's place. Never above the
              centre: what does not fit scrolls inside the card, under its title and close button. */}
          <div className="-mx-[12px] flex min-h-0 shrink flex-col gap-[6px]" style={{ maxHeight: dockRoom }}>
            <div className="shrink-0 px-[12px]">{footer}</div>
            <div className="outpost-furniture-dock flex min-h-0 flex-col">{cards}</div>
          </div>
        </>
      ) : (
        <>
          <div className="outpost-furniture-clear flex min-h-0 flex-1 flex-col gap-[8px]">
            {tools}
            <div className="outpost-furniture-cards flex min-h-0 shrink flex-col items-center justify-end gap-[8px] empty:hidden">
              {cards}
            </div>
          </div>
          <div ref={foot} className="shrink-0">
            {footer}
          </div>
        </>
      )}
    </div>
  );
}
