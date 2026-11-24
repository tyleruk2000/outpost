/**
 * Drawing a route, and changing the shape of one: the panel that goes with the points
 * on the map. Everything that can be done on the map by pointer or finger can be done
 * here with buttons, so the whole of it works from the keyboard.
 */
import type { Bbox, MarkerColor } from "@outpost/shared";
import { ArrowLeft, ArrowLeftRight, CircleAlert, Crosshair, Redo2, Undo2, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { Notice } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/misc";
import { cn, modKey, plural } from "@/lib/utils";
import { formatDistance, formatDistanceWithMiles, type LatLon } from "../lib/geo";
import { measure } from "../lib/measure";
import { pressWord } from "../lib/press";
import { canRedo, canSave, canUndo, isChanged, isFull, type RouteEdit, redo, removePoint, reversePoints, undo } from "../lib/route-edit";
import { flatWalk } from "../lib/tracks";
import { ColorPicker } from "../ui";

/** Said once, where drawing starts: what a drawn route is, and what it is not. */
export const STRAIGHT_LINES =
  "A drawn route is straight lines between the points you place. It does not follow paths or roads: Outpost does not plan routes.";

/** A route being drawn, or one whose shape is being changed. */
export interface RouteDraft {
  /** The saved route whose shape is being changed; absent for a new route. */
  trackId?: string;
  /** For a new route, what it will be called. For a saved one, its name as it stands. */
  name: string;
  color: MarkerColor;
  edit: RouteEdit;
  /** The point chosen on the map or in the list. */
  selected: number | null;
  /** The saved route is a recording from a GPX file: saving replaces what was recorded. */
  replacesRecording?: boolean;
}

/** Whether the draft holds anything that closing would lose. */
export function hasUnsavedWork(draft: RouteDraft): boolean {
  return draft.trackId ? isChanged(draft.edit) : draft.edit.points.length > 0;
}

/** How much of a line lies where terrain is installed, judged by the box the terrain covers. */
export function terrainCover(points: LatLon[], terrain: Bbox | null): "all" | "some" | "none" {
  if (!terrain || points.length === 0) return "none";
  const inside = points.filter(
    (point) => point.lon >= terrain[0] && point.lon <= terrain[2] && point.lat >= terrain[1] && point.lat <= terrain[3],
  );
  return inside.length === points.length ? "all" : inside.length === 0 ? "none" : "some";
}

/** What saving will do about heights, said before the route is saved. */
export function heightsNote(points: LatLon[], terrain: Bbox | null): string {
  const cover = terrainCover(points, terrain);
  if (cover === "all") return "Heights are read from the terrain installed here when you save, for the ascent and an elevation profile.";
  if (cover === "some") {
    return "Terrain is installed for only part of this line, so the ascent and the elevation profile will cover that part only.";
  }
  return terrain
    ? "No terrain is installed where this line runs, so the saved route will have no ascent or elevation profile."
    : "No terrain is installed, so the saved route will have no ascent or elevation profile. Terrain can be downloaded with a map region under Offline maps.";
}

export function RouteEditor({
  draft,
  terrain,
  mapReady,
  saving,
  error,
  nameRequested,
  onNameShown,
  onChange,
  onAddAtCentre,
  onMoveToCentre,
  onSave,
  onClose,
}: {
  draft: RouteDraft;
  /** The box installed terrain covers; null when there is none. */
  terrain: Bbox | null;
  /** False when the map could not be drawn, so there is nothing to place points on. */
  mapReady: boolean;
  saving: boolean;
  /** Why the last attempt to save failed, in the server's words. */
  error: string | undefined;
  /** The person asked, from the card on the map, to name the route: the name field is brought into view and focused. */
  nameRequested: boolean;
  onNameShown: () => void;
  onChange: (draft: RouteDraft) => void;
  onAddAtCentre: () => void;
  /** Moves a point to the middle of the map: how a point is moved without a pointer. */
  onMoveToCentre: (index: number) => void;
  onSave: () => void;
  /** Asks to leave; the screen checks for unsaved points first. */
  onClose: () => void;
}) {
  const { edit, selected } = draft;
  const { points } = edit;
  const result = measure(points);
  const reshaping = Boolean(draft.trackId);
  const list = useRef<HTMLOListElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);

  // Keep the chosen point, or else the newest, in view in the list. Only the list is
  // scrolled: `scrollIntoView` would also move the panel, and on a phone the page under it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when the selection or the number of points changes
  useEffect(() => {
    const container = list.current;
    if (!container) return;
    const row = selected === null ? null : container.querySelector<HTMLElement>(`[data-point="${selected}"]`);
    if (!row) {
      container.scrollTop = container.scrollHeight;
      return;
    }
    const frame = container.getBoundingClientRect();
    const box = row.getBoundingClientRect();
    if (box.top < frame.top) container.scrollTop -= frame.top - box.top;
    else if (box.bottom > frame.bottom) container.scrollTop += box.bottom - frame.bottom;
  }, [selected, points.length]);

  // "Name and save" on the map's card: the next thing to do is type a name.
  useEffect(() => {
    const input = nameInput.current;
    const container = body.current;
    if (!nameRequested) return;
    onNameShown();
    if (!input || !container) return;
    // Scrolled by hand, and only this panel: focusing would otherwise drag the page along on a phone.
    container.scrollTop += input.getBoundingClientRect().top - container.getBoundingClientRect().top - 48;
    input.focus({ preventScroll: true });
  }, [nameRequested, onNameShown]);

  const apply = (next: RouteEdit, nextSelected: number | null = null) => onChange({ ...draft, edit: next, selected: nextSelected });
  const ready = canSave(edit) && (reshaping ? isChanged(edit) : draft.name.trim().length > 0);

  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(event) => {
        event.preventDefault();
        if (ready) onSave();
      }}
    >
      <div className="flex items-center gap-1 border-b border-border px-2 py-1.5">
        <Button variant="ghost" size="sm" onClick={onClose}>
          <ArrowLeft /> Routes
        </Button>
      </div>
      <div ref={body} className="scroll-quiet grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] content-start gap-4 overflow-y-auto px-4 py-4">
        <div>
          <h3 className="font-title text-lead text-ink">{reshaping ? draft.name : "Draw a route"}</h3>
          {reshaping ? <p className="text-small text-ink-muted">Editing its shape</p> : null}
          <p className="mt-1.5 text-small text-ink-muted">{STRAIGHT_LINES}</p>
        </div>

        {!mapReady ? (
          <Notice tone="warning" icon={<CircleAlert />}>
            The map cannot be drawn in this browser, so points cannot be placed on it.
          </Notice>
        ) : null}

        <div>
          <p className="tabular text-heading font-semibold text-ink" aria-live="polite" aria-atomic>
            {points.length < 2 ? "0 m" : formatDistanceWithMiles(result.totalMeters)}
          </p>
          {points.length >= 2 ? (
            <p className="tabular text-small text-ink">
              Walking, about {flatWalk(result.totalMeters)} on the flat. The climbing is added once the route is saved with heights.
            </p>
          ) : null}
          <p className="tabular text-small text-ink-muted">
            {points.length === 0
              ? `No points yet. ${pressWord()} the map to place the first one.`
              : points.length === 1
                ? "First point placed. Place the next one."
                : `${plural(points.length, "point")}. Drag a point to move it, or the small handle between two points to add one there.${points.length >= 3 ? ` ${pressWord()} the first point to close the loop.` : ""}`}
          </p>
          {isFull(edit) ? (
            <p className="mt-1 text-small text-warning">That is as many points as one route can have. Remove one to add another.</p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => apply(undo(edit))} disabled={!canUndo(edit)} title={`${modKey}Z`}>
            <Undo2 /> Undo
          </Button>
          <Button size="sm" onClick={() => apply(redo(edit))} disabled={!canRedo(edit)} title={`Shift ${modKey}Z`}>
            <Redo2 /> Redo
          </Button>
          <Button size="sm" variant="ghost" onClick={() => apply(reversePoints(edit))} disabled={points.length < 2}>
            <ArrowLeftRight /> Reverse
          </Button>
        </div>

        <div className="grid gap-1.5">
          <Button
            onClick={onAddAtCentre}
            disabled={!mapReady || isFull(edit)}
            // Its words wrap on a narrow phone with large text, where on one line they ran past the panel.
            className="h-auto min-h-9 max-w-full justify-self-start py-2 text-left whitespace-normal max-md:h-auto max-md:min-h-11 md:pointer-coarse:min-h-11"
          >
            <Crosshair /> Add a point at the centre of the map
          </Button>
          <p className="text-small text-ink-muted max-md:hidden">
            With the keyboard: move the map with the arrow keys, then press <Kbd>Enter</Kbd> to add a point at its centre.
          </p>
        </div>

        {reshaping ? null : (
          <>
            <Field label="Name">
              {(ids) => (
                <Input
                  {...ids}
                  ref={nameInput}
                  value={draft.name}
                  onChange={(event) => onChange({ ...draft, name: event.target.value })}
                  maxLength={200}
                  placeholder="For example, Ridge from the car park"
                />
              )}
            </Field>
            <div className="grid gap-1.5">
              <span className="text-small font-medium text-ink">Colour on the map</span>
              <ColorPicker label="Colour on the map" value={draft.color} onChange={(color) => onChange({ ...draft, color })} />
            </div>
          </>
        )}

        {points.length > 0 ? (
          <div className="grid gap-1.5">
            <h4 className="text-small font-medium text-ink">Points</h4>
            <ol
              ref={list}
              className="scroll-quiet max-h-44 divide-y divide-border overflow-y-auto border-y border-border"
              aria-label="Points of the route, in order"
            >
              {points.map((point, index) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: points are identified by their order
                <li key={index} data-point={index} className={cn("flex items-center", index === selected && "bg-primary-soft")}>
                  <button
                    type="button"
                    aria-pressed={index === selected}
                    onClick={() => onChange({ ...draft, selected: index === selected ? null : index })}
                    className="tabular flex min-w-0 flex-1 items-baseline gap-3 py-1.5 pr-2 pl-1 text-left text-small focus-visible:-outline-offset-2 max-md:py-2.5 md:pointer-coarse:py-2.5"
                  >
                    <span className="w-7 shrink-0 text-right text-ink-muted">{index + 1}</span>
                    <span className="min-w-0 flex-1 truncate text-ink">
                      {index === 0 ? "Start" : formatDistance(result.legs[index - 1]!.totalMeters)}
                      {index === selected ? <span className="sr-only">, chosen on the map</span> : null}
                    </span>
                    <span className="shrink-0 font-mono text-micro text-ink-muted max-md:hidden">
                      {point.lat.toFixed(4)}, {point.lon.toFixed(4)}
                    </span>
                  </button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove point ${index + 1}`}
                    onClick={() => apply(removePoint(edit, index))}
                    className="shrink-0"
                  >
                    <X />
                  </Button>
                </li>
              ))}
            </ol>
            {selected !== null && points[selected] ? (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <span className="tabular text-small text-ink-muted">Point {selected + 1}:</span>
                <Button size="sm" onClick={() => onMoveToCentre(selected)} disabled={!mapReady}>
                  <Crosshair /> Move to the centre of the map
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}

        {points.length >= 2 ? <p className="text-small text-ink-muted">{heightsNote(points, terrain)}</p> : null}

        {draft.replacesRecording ? (
          <Notice tone="warning" icon={<CircleAlert />}>
            Saving replaces the points that were recorded for this route with the line drawn here. Its waypoints are kept.
          </Notice>
        ) : null}

        {error ? (
          <Notice tone="danger" icon={<CircleAlert />} title="The route was not saved">
            {error}
          </Notice>
        ) : null}
      </div>
      <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-4 py-3">
        {!ready && !saving ? (
          <span className="mr-auto text-small text-ink-muted">
            {points.length < 2
              ? "A route needs at least two points."
              : reshaping
                ? "Nothing has been changed yet."
                : "Give the route a name to save it."}
          </span>
        ) : null}
        <Button onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="primary" loading={saving} disabled={!ready}>
          {reshaping ? "Save new shape" : "Save route"}
        </Button>
      </footer>
    </form>
  );
}
