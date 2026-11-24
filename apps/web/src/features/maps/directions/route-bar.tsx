/**
 * The bar at the top of the screen while Directions is in hand on a phone, in the spine's
 * colour where the app's top bar would be: what is being done, and the only place a point is
 * changed. The two ends (each opens the picker for that point), the swap, and the ways of
 * travelling where the streets service is installed. One line while the steps are read, and
 * a title of its own while a point is chosen on the map or the stops and options are open.
 */
import { ArrowUpDown, Circle, MapPin, X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { ROUTE_MODES } from "../road-route/street-words";
import type { Directions } from "./use-directions";
import { endsTitle, pointLabel } from "./words";

const barButton =
  "grid size-11 shrink-0 place-content-center rounded-control text-spine-ink hover:bg-spine-active focus-visible:outline-spine-ink";

function BarShell({ children }: { children: ReactNode }) {
  return (
    <header className="shrink-0 bg-spine pr-[max(0.5rem,env(safe-area-inset-right))] pl-[max(0.25rem,env(safe-area-inset-left))] text-spine-ink">
      {children}
    </header>
  );
}

/** A title and a line under it, with ✕ before them: choosing on the map, and the steps. */
function TitleBar({
  title,
  detail,
  closeLabel,
  onClose,
  end,
}: {
  title: string;
  detail?: string;
  closeLabel: string;
  onClose: () => void;
  end?: ReactNode;
}) {
  return (
    <BarShell>
      <div className="flex min-h-[60px] items-center gap-1 py-1">
        <button type="button" aria-label={closeLabel} onClick={onClose} className={barButton}>
          <X aria-hidden className="size-5" strokeWidth={1.8} />
        </button>
        <div className="min-w-0 flex-1 px-1">
          <p className="text-body font-semibold break-words">{title}</p>
          {detail ? <p className="text-small text-spine-ink-muted">{detail}</p> : null}
        </div>
        {end}
      </div>
    </BarShell>
  );
}

const MODE_WORDS = { drive: "Drive", "drive-door": "Door to door", walk: "Walk", cycle: "Cycle" } as const;

export function DirectionsBar({ directions }: { directions: Directions }) {
  const { points, view, choosing } = directions;
  const count = points.length;

  if (choosing) {
    const role = choosing.adding ? "stop" : choosing.index === 0 ? "start" : choosing.index === count - 1 ? "end" : "stop";
    return (
      <TitleBar
        title={`Choose the ${role}`}
        detail="Move the map until the cross is on it"
        closeLabel="Stop choosing on the map"
        onClose={directions.stopChoosing}
      />
    );
  }

  if (view === "options") {
    return (
      <TitleBar
        title="Stops and options"
        closeLabel="Close stops and options"
        onClose={() => directions.setView("route")}
        end={
          <button
            type="button"
            onClick={() => directions.setView("route")}
            className="min-h-11 shrink-0 rounded-control bg-spine-ink px-4 text-small font-semibold text-spine hover:bg-spine-ink/90 focus-visible:outline-spine-ink"
          >
            Done
          </button>
        }
      />
    );
  }

  const swap = (
    <button type="button" aria-label="Swap the start and the end" onClick={directions.swap} className={barButton}>
      <ArrowUpDown aria-hidden className="size-5" strokeWidth={1.8} />
    </button>
  );

  if (view === "steps" || view === "print") {
    return (
      <TitleBar
        title={endsTitle(points)}
        detail={`${MODE_WORDS[directions.mode]} · ${directions.units === "miles" ? "miles" : "kilometres"}`}
        closeLabel="End directions"
        onClose={directions.close}
        end={swap}
      />
    );
  }

  const stops = count - 2;
  const pointRow = (index: number) => {
    const point = points[index];
    const label = pointLabel(index, count);
    return (
      <button
        type="button"
        onClick={() => directions.openPicker({ index, adding: false })}
        aria-label={`${label}: ${point ? point.name : "not chosen"}. Change`}
        className="flex min-h-11 w-full min-w-0 items-center gap-2.5 px-3 text-left hover:bg-spine-active focus-visible:-outline-offset-2 focus-visible:outline-spine-ink"
      >
        {index === 0 ? (
          <Circle aria-hidden className="size-3.5 shrink-0 text-spine-ink-muted" strokeWidth={2.4} />
        ) : (
          <MapPin aria-hidden className="size-4 shrink-0 text-spine-ink-muted" />
        )}
        <span className={cn("min-w-0 flex-1 truncate text-body", point ? "font-semibold text-spine-ink" : "text-spine-ink-muted")}>
          {point ? point.name : index === 0 ? "Where from?" : "Where to?"}
        </span>
      </button>
    );
  };

  return (
    <BarShell>
      <div className="flex items-center gap-1 pt-2 pb-1.5">
        <button type="button" aria-label="End directions" onClick={directions.close} className={barButton}>
          <X aria-hidden className="size-5" strokeWidth={1.8} />
        </button>
        <div className="min-w-0 flex-1 divide-y divide-spine-border overflow-hidden rounded-control bg-spine-raised">
          {pointRow(0)}
          {stops > 0 ? (
            <button
              type="button"
              onClick={() => directions.setView("options")}
              className="flex min-h-11 w-full items-center gap-2.5 px-3 text-left text-small text-spine-ink-muted hover:bg-spine-active focus-visible:-outline-offset-2 focus-visible:outline-spine-ink"
            >
              <span aria-hidden className="size-4 shrink-0" />
              {stops === 1 ? `Via ${points[1]?.name ?? "a stop"}` : `${stops} stops`}
            </button>
          ) : null}
          {pointRow(count - 1)}
        </div>
        {swap}
      </div>
      {directions.streetsInstalled ? (
        // The ways of travelling scroll sideways inside the bar at large text, rather than taking a second row.
        <div role="radiogroup" aria-label="Way of travelling" className="scroll-quiet flex gap-1.5 overflow-x-auto px-2 pb-2">
          {ROUTE_MODES.map((option) => {
            const on = option.value === directions.mode;
            return (
              // biome-ignore lint/a11y/useSemanticElements: a row of chips, each a radio, as the bar's design asks
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => directions.setMode(option.value)}
                className={cn(
                  "min-h-11 shrink-0 rounded-full px-4 text-small font-medium whitespace-nowrap focus-visible:outline-spine-ink",
                  on ? "bg-spine-ink text-spine" : "border border-spine-border text-spine-ink hover:bg-spine-active",
                )}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      ) : null}
    </BarShell>
  );
}
