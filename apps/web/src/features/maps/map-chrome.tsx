/** The controls and cards that float over the map: tools, zoom, the measuring card, the pin card. */
import { Compass, LocateFixed, Minus, Mountain, Plus, Ruler, Undo2, X } from "lucide-react";
import { type ReactNode, useEffect, useRef } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/misc";
import { cn } from "@/lib/utils";
import { copyText, type LocateState } from "./hooks";
import { formatPosition, type ReadoutFormat } from "./lib/coords";
import { formatBearing, formatDistance, formatDistanceWithMiles, type LatLon } from "./lib/geo";
import { measure } from "./lib/measure";
import { ControlButton, ControlGroup, mapSurface } from "./ui";

export type Tool = "browse" | "measure" | "add-place";

/** A map pin with a plus: the "add a place" tool. Drawn here because the icon set has no exact match at this weight. */
function PinPlus() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 10c0 5-7 11.5-7 11.5S5 15 5 10a7 7 0 0 1 14 0Z" />
      <path d="M12 7v6M9 10h6" />
    </svg>
  );
}

export function MapControls({
  tool,
  onToolChange,
  onZoomIn,
  onZoomOut,
  rotated,
  onResetNorth,
  locate,
  onLocate,
  hillshade,
  onHillshadeChange,
  disabled,
  className,
}: {
  tool: Tool;
  onToolChange: (tool: Tool) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  rotated: boolean;
  onResetNorth: () => void;
  /** Undefined when the browser has no geolocation at all. */
  locate: LocateState | undefined;
  onLocate: () => void;
  /** Undefined when no terrain is installed, so there is nothing to shade from. */
  hillshade: boolean | undefined;
  onHillshadeChange: (on: boolean) => void;
  /** The map could not be drawn; the controls that move it have nothing to act on. */
  disabled: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {/* Touch screens zoom by pinching; the buttons are for pointers and keyboards. */}
      <ControlGroup className="max-md:hidden">
        <ControlButton label="Zoom in" onClick={onZoomIn} disabled={disabled}>
          <Plus />
        </ControlButton>
        <ControlButton label="Zoom out" onClick={onZoomOut} disabled={disabled}>
          <Minus />
        </ControlButton>
      </ControlGroup>
      {rotated || locate !== undefined ? (
        <ControlGroup>
          {rotated ? (
            <ControlButton label="North up" onClick={onResetNorth}>
              <Compass />
            </ControlButton>
          ) : null}
          {locate !== undefined ? (
            <ControlButton
              label={
                locate === "off" ? "Show where I am" : locate === "waiting" ? "Finding your position. Stop" : "Stop showing where I am"
              }
              pressed={locate !== "off"}
              onClick={onLocate}
              disabled={disabled}
            >
              {locate === "waiting" ? <Spinner className="text-current" label="Finding your position" /> : <LocateFixed />}
            </ControlButton>
          ) : null}
        </ControlGroup>
      ) : null}
      <ControlGroup>
        <ControlButton
          label="Measure a distance"
          pressed={tool === "measure"}
          onClick={() => onToolChange(tool === "measure" ? "browse" : "measure")}
          disabled={disabled}
        >
          <Ruler />
        </ControlButton>
        <ControlButton
          label="Save a place: then click the map"
          pressed={tool === "add-place"}
          onClick={() => onToolChange(tool === "add-place" ? "browse" : "add-place")}
          disabled={disabled}
        >
          <PinPlus />
        </ControlButton>
        {hillshade !== undefined ? (
          <ControlButton label="Hill shading" pressed={hillshade} onClick={() => onHillshadeChange(!hillshade)} disabled={disabled}>
            <Mountain />
          </ControlButton>
        ) : null}
      </ControlGroup>
    </div>
  );
}

/** A card that floats above the bottom of the map: one at a time, for the tool or thing in hand. */
export function MapCard({
  title,
  onClose,
  closeLabel,
  children,
  className,
}: {
  title: ReactNode;
  onClose?: () => void;
  closeLabel?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn(mapSurface, "pointer-events-auto w-full max-w-[26rem] p-3.5", className)}>
      <div className="flex items-start justify-between gap-3">
        <h2 className="min-w-0 text-body font-semibold text-ink">{title}</h2>
        {onClose ? (
          <Button variant="ghost" size="icon-sm" aria-label={closeLabel ?? "Close"} onClick={onClose} className="-mt-1 -mr-1.5">
            <X />
          </Button>
        ) : null}
      </div>
      {children}
    </section>
  );
}

export function MeasureCard({
  points,
  onUndo,
  onClear,
  onDone,
}: {
  points: LatLon[];
  onUndo: () => void;
  onClear: () => void;
  onDone: () => void;
}) {
  const result = measure(points);
  const list = useRef<HTMLOListElement>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: keep the newest leg in view as points are added
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [points.length]);

  return (
    <MapCard title="Measure" onClose={onDone} closeLabel="Stop measuring">
      {points.length === 0 ? (
        <p className="mt-1 text-small text-ink-muted">
          Click or tap the map to set the first point, then each point after it. Press Escape to stop.
        </p>
      ) : points.length === 1 ? (
        <p className="mt-1 text-small text-ink-muted">First point set. Click or tap the next one.</p>
      ) : (
        <>
          <p className="tabular mt-1 text-lead font-semibold text-ink" aria-live="polite">
            {formatDistanceWithMiles(result.totalMeters)}
          </p>
          <p className="tabular text-small text-ink-muted">
            {result.legs.length === 1 ? "One leg" : `${result.legs.length} legs`}, last leg heading {formatBearing(result.lastBearing ?? 0)}
          </p>
          {result.legs.length > 1 ? (
            <ol
              ref={list}
              className="scroll-quiet mt-2 max-h-28 divide-y divide-border overflow-y-auto border-y border-border"
              aria-label="Legs"
            >
              {result.legs.map((leg, index) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: legs are identified by their order
                <li key={index} className="tabular flex items-baseline justify-between gap-4 py-1.5 text-small">
                  <span className="text-ink-muted">
                    Leg {index + 1}, {formatBearing(leg.bearing)}
                  </span>
                  <span className="text-ink">
                    {formatDistance(leg.meters)}
                    <span className="ml-3 inline-block min-w-[4.5rem] text-right text-ink-muted">{formatDistance(leg.totalMeters)}</span>
                  </span>
                </li>
              ))}
            </ol>
          ) : null}
        </>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" onClick={onUndo} disabled={points.length === 0}>
          <Undo2 /> Undo last point
        </Button>
        <Button size="sm" variant="ghost" onClick={onClear} disabled={points.length === 0}>
          Clear
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone} className="ml-auto">
          Done
        </Button>
      </div>
    </MapCard>
  );
}

/** A found position that has not been saved: what it is, where it is, and the one thing to do with it. */
export function PinCard({
  title,
  detail,
  position,
  format,
  onSave,
  onClose,
}: {
  title: string;
  detail?: string;
  position: LatLon;
  format: ReadoutFormat;
  onSave: () => void;
  onClose: () => void;
}) {
  const coordinates = formatPosition(position.lat, position.lon, format).text;
  return (
    <MapCard title={<span className="font-title">{title}</span>} onClose={onClose} closeLabel="Remove this pin">
      {detail ? <p className="text-small text-ink-muted">{detail}</p> : null}
      <button
        type="button"
        onClick={async () => {
          if (await copyText(coordinates)) toast.success(`Copied ${coordinates}`);
        }}
        title="Copy"
        aria-label={`Copy coordinates ${coordinates}`}
        className="tabular mt-1 rounded-[3px] font-mono text-[0.8125rem] text-ink underline decoration-border-strong decoration-dotted underline-offset-4 hover:decoration-ink"
      >
        {coordinates}
      </button>
      <div className="mt-3">
        <Button size="sm" variant="primary" onClick={onSave}>
          Save this place
        </Button>
      </div>
    </MapCard>
  );
}

/** The short menu on a right-click or a long press. */
export function ContextMenu({
  point,
  bounds,
  coordinates,
  onSave,
  onMeasure,
  onClose,
}: {
  point: { x: number; y: number };
  /** Size of the map area, to keep the menu inside it. */
  bounds: { width: number; height: number };
  coordinates: string;
  onSave: () => void;
  onMeasure: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector("button")?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };
    const onPointer = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) onClose();
    };
    window.addEventListener("keydown", onKey, true);
    // Registered a moment later, so the press that opened the menu does not close it.
    const timer = window.setTimeout(() => window.addEventListener("pointerdown", onPointer, true), 0);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("pointerdown", onPointer, true);
    };
  }, [onClose]);

  const width = 232;
  const height = 148;
  const left = Math.max(8, Math.min(point.x, bounds.width - width - 8));
  const top = Math.max(8, Math.min(point.y, bounds.height - height - 8));
  const item =
    "flex w-full items-center rounded-[4px] px-2.5 py-1.5 text-left text-small text-ink hover:bg-surface-strong focus-visible:bg-surface-strong max-md:py-2.5";

  return (
    <div ref={ref} role="menu" aria-label="At this point" className={cn(mapSurface, "absolute z-30 p-1")} style={{ left, top, width }}>
      <p className="tabular truncate px-2.5 pt-1.5 pb-1 font-mono text-micro text-ink-muted">{coordinates}</p>
      <button type="button" role="menuitem" className={item} onClick={onSave}>
        Save a place here
      </button>
      <button type="button" role="menuitem" className={item} onClick={onMeasure}>
        Measure from here
      </button>
      <button
        type="button"
        role="menuitem"
        className={item}
        onClick={async () => {
          if (await copyText(coordinates)) toast.success(`Copied ${coordinates}`);
          onClose();
        }}
      >
        Copy coordinates
      </button>
    </div>
  );
}
