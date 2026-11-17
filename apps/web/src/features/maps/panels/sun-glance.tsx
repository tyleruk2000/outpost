/**
 * Today's sunrise and sunset for the centre of the map, in words, as one line that is on
 * the screen whenever the map is: on a phone it sits under the coordinates of the centre,
 * just above the lowered sheet. Touching it opens the Sun tab, where the rest of the day is.
 *
 * It is there so that nobody has to find the fourth name on the sheet to learn that
 * Outpost gives sun times at all, and so that the answer most people want is read without
 * opening anything.
 */
import { ChevronRight } from "lucide-react";
import { useMemo } from "react";
import { useClockStyle } from "@/lib/clock";
import { cn } from "@/lib/utils";
import { useToday } from "../grey-line/time";
import { sunDay } from "../lib/sun";
import { deviceZone, sunGlance } from "../lib/sun-text";
import type { MapEngine } from "../map/engine";
import { useRestingView } from "./sun-panel";

export function SunGlance({
  engine,
  onOpen,
  zone,
  where,
  className,
}: {
  engine: MapEngine;
  /** Opens the Sun tab. */
  onOpen: () => void;
  /** The time zone of the device's clock; read from the browser unless given. */
  zone?: string;
  /**
   * Words saying which point the times are for, shown before them. Given on a wide
   * screen, where the coordinates above the line can be the pointer's and not the centre's.
   */
  where?: string;
  className?: string;
}) {
  const view = useRestingView(engine);
  const style = useClockStyle();
  const device = useMemo(() => zone ?? deviceZone(), [zone]);
  // Today as this device has it, moving on at midnight: the line is on screen for hours.
  const today = useToday(device);
  const pieces = useMemo(() => (view ? sunGlance(sunDay(view.lat, view.lon, today), device, { style }) : []), [view, device, style, today]);
  if (pieces.length === 0) return null;

  return (
    <button
      type="button"
      data-sun-glance
      onClick={onOpen}
      // Not "Sun …": that is the name of the Sun line of a place, which can be on screen at the same time.
      aria-label={`Today at the centre of the map: ${pieces.join(", ")}. Show all of the day’s sun times`}
      className={cn(
        "outpost-sun-line flex min-h-[44px] w-full items-center gap-2 px-2.5 py-1 text-left hover:bg-surface-strong",
        className,
      )}
    >
      {/* Each piece stays whole; where both do not fit on one line, the sunset goes under the sunrise. */}
      <span className="tabular flex min-w-0 flex-1 flex-wrap gap-x-3 text-small font-medium text-ink">
        {where ? <span className="font-normal whitespace-nowrap text-ink-muted">{where}</span> : null}
        {pieces.map((piece) => (
          <span key={piece} className="whitespace-nowrap">
            {piece}
          </span>
        ))}
      </span>
      <ChevronRight aria-hidden className="size-4 shrink-0 text-ink-muted" />
    </button>
  );
}
