/**
 * A cross on the map at the point "the centre of the map" means: the one the readout at
 * the bottom gives while it says "Centre", the one the Sun tab works its times out for,
 * and where a route's next point goes when it is placed from the keyboard.
 *
 * That point is not always the middle of the map's rectangle. The camera keeps clear of
 * what lies over the map (the search box, the controls, the sheet on a phone), so the
 * centre is the middle of the part still in view. The cross is put where the map itself
 * says the centre is, so the mark and the coordinates cannot disagree.
 *
 * It follows the camera frame by frame, so it writes to the page directly instead of
 * going through React state.
 */
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { MapEngine } from "./map/engine";

export function CentreMark({
  engine,
  always,
}: {
  engine: MapEngine;
  /** Something other than the readout is reading the centre (the Sun tab, a route drawn from the keyboard): shown whatever the pointer is doing. */
  always: boolean;
}) {
  const mark = useRef<HTMLDivElement>(null);
  /** With a pointer over the map the readout gives the pointer's position, not the centre's. */
  const [pointerOver, setPointerOver] = useState(false);

  useEffect(() => {
    const place = () => {
      const at = engine.centrePoint();
      if (mark.current) mark.current.style.transform = `translate(${Math.round(at.x)}px, ${Math.round(at.y)}px)`;
    };
    place();
    const offMove = engine.on("move", place);
    const offPointer = engine.on("pointer", (position) => setPointerOver(position !== null));
    return () => {
      offMove();
      offPointer();
    };
  }, [engine]);

  return (
    <div
      ref={mark}
      aria-hidden
      data-centre-mark
      className={cn("pointer-events-none absolute top-0 left-0 size-0", !always && pointerOver && "hidden")}
    >
      {/* Ink with a hairline of the page colour round it, so it reads on any ground in either theme. */}
      <span className="absolute -top-px -left-2.5 h-0.5 w-5 bg-ink shadow-[0_0_0_1px_var(--page)]" />
      <span className="absolute -top-2.5 -left-px h-5 w-0.5 bg-ink shadow-[0_0_0_1px_var(--page)]" />
    </div>
  );
}
