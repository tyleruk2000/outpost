/** The Places tab: the list of saved places, and the form for adding or changing one. */
import { haversineMeters, type MarkerColor, type MarkerDto, type MarkerIcon } from "@outpost/shared";
import type { UseQueryResult } from "@tanstack/react-query";
import { ArrowLeft, Copy, Move, Search, Star, Trash2, Undo2 } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { toast } from "sonner";
import { ErrorState, Notice } from "@/components/page";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Skeleton, Switch } from "@/components/ui/misc";
import { KeepPlacesRow } from "@/features/kept/keep-controls";
import { copyText } from "@/lib/clipboard";
import { cn, plural } from "@/lib/utils";
import { formatPosition, type ReadoutFormat } from "../lib/coords";
import { formatDistance } from "../lib/geo";
import { iconOf, isDrawn, PLACE_ICON_NAMES } from "../lib/place-icons";
import { fold } from "../lib/search";
import { Locator } from "../radio/locator";
import { ColorPicker, IconPicker, PlaceMark } from "../ui";
import { SunSection } from "./sun";

/** A place as it is being added or changed, before it is saved. */
export interface PlaceDraft {
  /** The saved place being changed; absent for a new one. */
  id?: string;
  name: string;
  note: string;
  color: MarkerColor;
  icon: MarkerIcon;
  isFavorite: boolean;
  lat: number;
  lon: number;
}

export const draftOf = (marker: MarkerDto): PlaceDraft => ({
  id: marker.id,
  name: marker.name,
  note: marker.note,
  color: marker.color,
  icon: iconOf(marker),
  isFavorite: marker.isFavorite,
  lat: marker.lat,
  lon: marker.lon,
});

export function isDraftChanged(draft: PlaceDraft, saved: MarkerDto | undefined): boolean {
  if (!saved) return true;
  return (
    draft.name.trim() !== saved.name ||
    draft.note !== saved.note ||
    draft.color !== saved.color ||
    draft.icon !== iconOf(saved) ||
    draft.isFavorite !== saved.isFavorite ||
    draft.lat !== saved.lat ||
    draft.lon !== saved.lon
  );
}

export function PlaceEditor({
  draft,
  saved,
  format,
  saving,
  deleting,
  mapReady,
  onChange,
  onSave,
  onClose,
  onDelete,
  onNeedRoom,
}: {
  draft: PlaceDraft;
  /** The place as it is stored, when changing an existing one. */
  saved: MarkerDto | undefined;
  format: ReadoutFormat;
  saving: boolean;
  deleting: boolean;
  /** False when the map could not be drawn, so there is no pin to drag. */
  mapReady: boolean;
  onChange: (draft: PlaceDraft) => void;
  onSave: () => void;
  onClose: () => void;
  onDelete: () => void;
  /** The sun times were opened: on a phone the sheet is raised to hold them. */
  onNeedRoom?: () => void;
}) {
  const favouriteId = useId();
  const [confirming, setConfirming] = useState(false);
  const coordinates = formatPosition(draft.lat, draft.lon, format).text;
  const moved = saved ? haversineMeters(saved.lat, saved.lon, draft.lat, draft.lon) : 0;
  const changed = isDraftChanged(draft, saved);

  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(event) => {
        event.preventDefault();
        onSave();
      }}
    >
      <div className="flex items-center gap-1 border-b border-border px-2 py-1.5">
        <Button variant="ghost" size="sm" onClick={onClose}>
          <ArrowLeft /> Places
        </Button>
      </div>
      <div className="scroll-quiet grid min-h-0 flex-1 content-start gap-4 overflow-y-auto px-4 py-4">
        {/* The Sun line sits straight under the name: on a phone the sheet shows little more than this at first. */}
        <div className="grid gap-1">
          <h3 className="flex items-start gap-2.5 font-title text-lead text-ink">
            {/* As it is on the map, and as it will be once a change of colour or icon is saved. */}
            <PlaceMark color={draft.color} icon={draft.icon} className="mt-0.5" />
            <span className="min-w-0">{saved ? saved.name : "New place"}</span>
          </h3>
          <SunSection
            position={{ lat: draft.lat, lon: draft.lon }}
            name={saved?.name}
            onOpen={onNeedRoom}
            className="border-b border-border pb-1"
          />
        </div>
        <Field label="Name">
          {(ids) => (
            <Input
              {...ids}
              value={draft.name}
              onChange={(event) => onChange({ ...draft, name: event.target.value })}
              maxLength={200}
              required
              autoFocus={!saved}
            />
          )}
        </Field>
        <Field label="Note" hint="Plain text. Anything worth remembering about this place.">
          {(ids) => (
            <Textarea
              {...ids}
              value={draft.note}
              onChange={(event) => onChange({ ...draft, note: event.target.value })}
              maxLength={20_000}
              rows={4}
            />
          )}
        </Field>
        <div className="grid gap-1.5">
          <span className="text-small font-medium text-ink">Colour</span>
          <ColorPicker label="Colour" value={draft.color} onChange={(color) => onChange({ ...draft, color })} />
        </div>
        <div className="grid gap-1.5">
          <span className="text-small font-medium text-ink">Icon</span>
          <IconPicker label="Icon" value={draft.icon} color={draft.color} onChange={(icon) => onChange({ ...draft, icon })} />
        </div>
        <div className="flex items-start gap-3">
          <Switch id={favouriteId} checked={draft.isFavorite} onCheckedChange={(checked) => onChange({ ...draft, isFavorite: checked })} />
          <label htmlFor={favouriteId} className="text-small text-ink">
            <span className="flex items-center gap-1.5 font-medium">
              <Star aria-hidden className={cn("size-4", draft.isFavorite ? "fill-lamp text-lamp" : "text-ink-muted")} /> Favourite
            </span>
            <span className="block text-ink-muted">Listed first, and always named on the map.</span>
          </label>
        </div>

        <div className="grid gap-1.5">
          <span className="text-small font-medium text-ink">Position</span>
          <button
            type="button"
            onClick={async () => {
              if (await copyText(coordinates)) toast.success(`Copied ${coordinates}`);
            }}
            aria-label={`Copy coordinates ${coordinates}`}
            className="tabular group flex items-center gap-2 self-start font-mono text-[0.8125rem] text-ink"
          >
            {coordinates}
            <Copy aria-hidden className="size-3.5 text-ink-faint group-hover:text-ink" />
          </button>
          {format === "maidenhead" ? null : <Locator position={draft} className="self-start" />}
          {saved && moved >= 1 ? (
            <Notice
              tone="info"
              className="mt-1"
              action={
                <Button size="sm" variant="ghost" onClick={() => onChange({ ...draft, lat: saved.lat, lon: saved.lon })}>
                  <Undo2 /> Undo move
                </Button>
              }
            >
              Moved {formatDistance(moved)} from where it was saved. “Save changes” keeps the new position.
            </Notice>
          ) : mapReady ? (
            <p className="text-small text-ink-muted">
              Drag the pin on the map to move it.
              {/* Phones have no Tab key to reach the pin with. */}
              <span className="max-md:hidden"> From the keyboard, Tab to the pin and use the arrow keys; Shift moves it further.</span>
            </p>
          ) : null}
        </div>
      </div>
      <footer className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-3">
        <Button type="submit" variant="primary" loading={saving} disabled={!draft.name.trim() || !changed}>
          {saved ? "Save changes" : "Save place"}
        </Button>
        <Button onClick={onClose}>{saved && !changed ? "Close" : "Cancel"}</Button>
        {saved ? (
          <Button variant="danger-ghost" className="ml-auto" onClick={() => setConfirming(true)}>
            <Trash2 /> Delete
          </Button>
        ) : null}
      </footer>
      {saved ? (
        <ConfirmDialog
          open={confirming}
          onOpenChange={setConfirming}
          title={`Delete “${saved.name}”?`}
          description="The place and its note are removed from the map and from search. This cannot be undone."
          confirmLabel="Delete place"
          loading={deleting}
          onConfirm={onDelete}
        />
      ) : null}
    </form>
  );
}

export function PlacesList({
  markers,
  onOpen,
  onToggleFavourite,
  onMove,
  onAdd,
  canAddOnMap,
  onShowSun,
}: {
  markers: UseQueryResult<MarkerDto[]>;
  onOpen: (marker: MarkerDto) => void;
  onToggleFavourite: (marker: MarkerDto) => void;
  /** Starts moving a place on the map without opening it. Left out when there is no map to move it on. */
  onMove?: (marker: MarkerDto) => void;
  /** Starts the "click the map to save a place" tool. */
  onAdd: () => void;
  canAddOnMap: boolean;
  /** Opens the Sun tab. Sun times do not need a saved place, and someone looking for them here is told so. */
  onShowSun?: () => void;
}) {
  const [filter, setFilter] = useState("");
  const all = markers.data ?? [];
  const shown = useMemo(() => {
    const needle = fold(filter);
    const matching = needle ? all.filter((marker) => fold(marker.name).includes(needle)) : all;
    // Favourites first, then by name: a list people scan, not a log.
    return [...matching].sort((a, b) => Number(b.isFavorite) - Number(a.isFavorite) || a.name.localeCompare(b.name, "en"));
  }, [all, filter]);

  if (markers.isPending) {
    return (
      <div className="grid gap-3 p-4" aria-busy>
        <Skeleton className="h-10" />
        <Skeleton className="h-10" />
        <Skeleton className="h-10" />
      </div>
    );
  }
  if (markers.isError) {
    return (
      <div className="p-4">
        <ErrorState error={markers.error} onRetry={() => markers.refetch()} />
      </div>
    );
  }

  if (all.length === 0) {
    return (
      <div className="px-4 py-5">
        <h3 className="font-title text-lead text-ink">No saved places yet</h3>
        <p className="mt-1.5 text-small text-ink-muted">
          Keep the places that matter to a trip: a car park, a bothy, a summit, a spring. Right-click the map (or press and hold on a touch
          screen) and choose “Save a place here”, or save a search result.
        </p>
        {canAddOnMap ? (
          <Button variant="primary" className="mt-4" onClick={onAdd}>
            Save a place
          </Button>
        ) : null}
        {onShowSun ? (
          <p className="mt-5 border-t border-border pt-4 text-small text-ink-muted">
            Sunrise and sunset do not need a saved place. The Sun tab gives them for the centre of the map.{" "}
            <Button variant="link" size="sm" onClick={onShowSun}>
              Show sun times
            </Button>
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 px-4 pt-3 pb-2">
        <div className="relative min-w-0 flex-1">
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-ink-muted" />
          <Input
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Filter by name"
            aria-label="Filter saved places by name"
            className="pl-8 text-small"
          />
        </div>
        {canAddOnMap ? (
          <Button onClick={onAdd} className="shrink-0">
            Save a place
          </Button>
        ) : null}
      </div>
      <p className="tabular px-4 pb-2 text-micro text-ink-muted">
        {filter ? `${shown.length} of ${plural(all.length, "place")}` : plural(all.length, "place")}
      </p>
      {shown.length === 0 ? (
        <p className="px-4 py-3 text-small text-ink-muted">No saved place has “{filter}” in its name.</p>
      ) : (
        <ul className="scroll-quiet min-h-0 flex-1 divide-y divide-border overflow-y-auto border-t border-border">
          {shown.map((marker) => (
            <li key={marker.id} className="flex items-stretch">
              <button
                type="button"
                onClick={() => onOpen(marker)}
                className="flex min-w-0 flex-1 items-start gap-3 py-2.5 pr-1 pl-4 text-left hover:bg-surface focus-visible:-outline-offset-2 max-md:py-3"
              >
                <PlaceMark color={marker.color} icon={iconOf(marker)} />
                <span className="min-w-0">
                  <span className="block truncate text-small font-medium text-ink">
                    {marker.name}
                    {isDrawn(iconOf(marker)) ? <span className="sr-only">, {PLACE_ICON_NAMES[iconOf(marker)]}</span> : null}
                  </span>
                  {marker.note ? <span className="block truncate text-small text-ink-muted">{marker.note.split("\n")[0]}</span> : null}
                </span>
              </button>
              {onMove ? (
                <button
                  type="button"
                  aria-label={`Move ${marker.name} on the map`}
                  title="Move on the map"
                  onClick={() => onMove(marker)}
                  className="grid w-11 shrink-0 place-content-center text-ink-muted hover:text-ink focus-visible:-outline-offset-2"
                >
                  <Move className="size-4" />
                </button>
              ) : null}
              <button
                type="button"
                aria-pressed={marker.isFavorite}
                aria-label={marker.isFavorite ? `Remove ${marker.name} from favourites` : `Make ${marker.name} a favourite`}
                onClick={() => onToggleFavourite(marker)}
                className="grid w-11 shrink-0 place-content-center text-ink-faint hover:text-ink focus-visible:-outline-offset-2"
              >
                <Star className={cn("size-4", marker.isFavorite && "fill-lamp text-lamp")} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <KeepPlacesRow count={all.length} />
    </div>
  );
}
