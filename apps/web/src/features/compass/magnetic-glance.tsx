/**
 * One quiet line on the map's centre card: magnetic north's angle from true north at the
 * centre of the map ("Magnetic 0.6° W"). Pressing it opens Tools → Compass for that point,
 * where the grid figure and the rule between map and compass are.
 *
 * Worked out when the map comes to rest, not while it moves: one evaluation of the model,
 * a few microseconds, and nothing at all while the map is still.
 */
import { decimalYear, magneticField } from "@outpost/shared";
import { type ReactNode, useMemo, useState } from "react";
import { Link } from "react-router";
import type { MapEngine } from "@/features/maps/map/engine";
import { useRestingView } from "@/features/maps/panels/sun-panel";
import { cn } from "@/lib/utils";

/** "Magnetic 0.6° W": to a tenth of a degree, as the Compass screen gives it. */
export function magneticShort(declination: number): string {
  const tenth = Number(Math.abs(declination).toFixed(1));
  return tenth === 0 ? "Magnetic 0.0°" : `Magnetic ${tenth.toFixed(1)}° ${declination > 0 ? "E" : "W"}`;
}

export function MagneticGlance({ engine, className }: { engine: MapEngine; className?: string }) {
  const view = useRestingView(engine);
  const [year] = useState(() => decimalYear(Date.now()));
  const declination = useMemo(() => (view ? magneticField(view.lat, view.lon, year).declination : null), [view, year]);
  if (!view || declination === null) return null;
  const words = magneticShort(declination);
  return (
    <Link
      to={`/tools/compass?lat=${view.lat.toFixed(5)}&lon=${view.lon.toFixed(5)}`}
      data-magnetic-glance
      aria-label={`${words}: ${words.replace("Magnetic", "magnetic north is").replace(" E", " east").replace(" W", " west")} of true north at the centre of the map. Open the compass for this point`}
      className={cn(
        "tabular flex min-h-[44px] min-w-0 items-center px-2.5 py-1 text-small text-ink-muted hover:bg-surface-strong hover:text-ink md:min-h-9",
        className,
      )}
    >
      {words}
    </Link>
  );
}

/** The line under the centre's coordinates: the sun's times when they are shown, and the magnetic line beside them. */
export function CentreLines({ engine, sun }: { engine: MapEngine; sun: ReactNode }) {
  return (
    // The sun's times never narrower than their longest piece, and the magnetic line may take two lines: on a 320 px
    // phone, and a laptop with the largest text, the times were squeezed under "Magnetic 0.3° W" and the two overlapped.
    <div className="flex items-stretch">
      {sun ? <div className="min-w-min flex-1">{sun}</div> : null}
      <MagneticGlance engine={engine} className={sun ? "border-l border-border" : "w-full"} />
    </div>
  );
}
