/**
 * A cross on the map at the point "the centre of the map" means: the one the readout at
 * the bottom gives while it says "Centre", the one the Sun tab works its times out for,
 * and where a route's next point goes when it is placed from the keyboard.
 *
 * It is always drawn. It used to be put away while a pointer was over the map (the
 * readout then gives the pointer's position), which on a laptop is nearly always: the
 * owner twice reported the mark as gone. The readout says "Pointer" or "Centre" in
 * words; the cross is the centre whichever it says.
 *
 * That point is not always the middle of the map's rectangle. On a phone the camera keeps
 * clear of the sheet and what else lies over the map, so the centre is the middle of the
 * part still in view; on any screen, a map that has flown to a place has made room for the
 * controls, and its centre is a little off the middle from then on. The cross is put where
 * the map itself says the centre is, so the mark and the coordinates cannot disagree.
 *
 * It follows the camera frame by frame, so it writes to the page directly instead of
 * going through React state.
 */
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import type { MapEngine } from "./map/engine";

export function CentreMark({
  engine,
  always,
}: {
  engine: MapEngine;
  /** Something is reading the centre (the Sun tab, a route drawn from the keyboard): on a phone with no room, the cross does not give way. */
  always: boolean;
}) {
  const mark = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const place = () => {
      const at = engine.centrePoint();
      if (!mark.current) return;
      mark.current.style.left = `${Math.round(at.x)}px`;
      mark.current.style.top = `${Math.round(at.y)}px`;
    };
    place();
    return engine.on("move", place);
  }, [engine]);

  return (
    <div
      ref={mark}
      aria-hidden
      data-centre-mark
      // A box 20 px across with the point in its middle.
      // On a phone with no room for the readout or for clear map (maps.css), the cross goes with it unless something else is reading the centre.
      className={cn("pointer-events-none absolute size-5 -translate-x-1/2 -translate-y-1/2", !always && "outpost-centre-mark-yields")}
    >
      {/* Ink with a hairline of the page colour round it, so it reads on any ground in either theme. */}
      <span className="absolute top-1/2 left-0 h-0.5 w-full -translate-y-1/2 bg-ink shadow-[0_0_0_1px_var(--page)]" />
      <span className="absolute top-0 left-1/2 h-full w-0.5 -translate-x-1/2 bg-ink shadow-[0_0_0_1px_var(--page)]" />
    </div>
  );
}
