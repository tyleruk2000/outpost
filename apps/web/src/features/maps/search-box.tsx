/**
 * The search box over the map. One field finds place names (when a place-name list is
 * installed), a typed position, British grid reference or Maidenhead locator, and the
 * person's own saved places and routes.
 */
import type { MarkerDto, NearestKind, TrackDto } from "@outpost/shared";
import { Crosshair, LocateFixed, MapPin, Route, Search, X } from "lucide-react";
import { type KeyboardEvent, type ReactNode, useEffect, useId, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { searchRowFocus } from "@/components/ui/input";
import { Spinner } from "@/components/ui/misc";
import { errorMessage } from "@/lib/api";
import { useDebounced } from "@/lib/use-debounced";
import { keepFieldFocus, useDismiss } from "@/lib/use-dismiss";
import { cn } from "@/lib/utils";
import { usePlaceSearch } from "./data";
import { formatDistance, type LatLon } from "./lib/geo";
import { iconOf } from "./lib/place-icons";
import { buildSearchResults, type SearchResult } from "./lib/search";
import { mapSurface, PlaceMark } from "./ui";

const icons: Record<SearchResult["kind"], typeof MapPin> = { coordinate: Crosshair, marker: MapPin, track: Route, place: MapPin };

/** The first row when the words ask for the nearest of a kind ("pharmacy", "A&E"): Maps' Nearest list, not a street of that name. */
export const NEAREST_TITLES: Record<NearestKind, string> = {
  hospital: "Nearest hospitals",
  pharmacy: "Nearest pharmacies",
  shelter: "Nearest shelters",
  water: "Nearest drinking water",
  fuel: "Nearest fuel",
};

export function SearchBox({
  markers,
  tracks,
  placesInstalled,
  getCenter,
  onChoose,
  onAddPlaceNames,
  onNearest,
  leading,
  trailing,
  className,
}: {
  markers: MarkerDto[];
  tracks: TrackDto[];
  /** False when no place-name list is installed: only positions and the person's own things can be found. */
  placesInstalled: boolean;
  /** The middle of the map now, for ranking and for distances. */
  getCenter: () => LatLon | null;
  onChoose: (result: SearchResult) => void;
  /** Opens the part of the downloads panel where place names are added. */
  onAddPlaceNames: () => void;
  /** Opens Maps' Nearest list for a kind; by default, `/maps?nearest=<kind>`. */
  onNearest?: (kind: NearestKind) => void;
  /** A control shown inside the field's left edge (the panel toggle). */
  leading?: ReactNode;
  /** A control shown inside the field's right edge (on a phone, the menu of the map's tools). */
  trailing?: ReactNode;
  className?: string;
}) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const query = useDebounced(text.trim(), 180);
  // The centre is read when the query changes, not on every pan: the list must not reshuffle under the pointer.
  // biome-ignore lint/correctness/useExhaustiveDependencies: deliberately refreshed per query only
  const center = useMemo(() => getCenter(), [query]);
  const search = usePlaceSearch(query, center ?? undefined);

  const results = useMemo(
    () =>
      buildSearchResults({
        query,
        // A slow answer for older text must not be shown against newer text.
        coordinate: search.data && search.data.query === query ? search.data.coordinate : null,
        otherReadings: search.data?.otherReadings,
        places: search.data?.places ?? [],
        markers,
        tracks,
        center,
      }),
    [query, search.data, markers, tracks, center],
  );

  const navigate = useNavigate();
  const nearest = search.data && search.data.query === query ? (search.data.nearest ?? null) : null;
  /** Every row of the list, the Nearest row first when there is one: what the arrow keys move through. */
  const rowCount = results.length + (nearest ? 1 : 0);
  const openNearest = (kind: NearestKind) => {
    setOpen(false);
    setText("");
    inputRef.current?.blur();
    if (onNearest) onNearest(kind);
    else navigate(`/maps?nearest=${kind}`);
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: a new list starts from its first row
  useEffect(() => setActive(0), [query]);

  const showList = open && query.length >= 2;
  const box = useRef<HTMLDivElement>(null);
  // Closed by a press or focus elsewhere, not by the field's blur: on an iPhone that came before the tap's click.
  useDismiss(box, open, () => setOpen(false));
  const choose = (result: SearchResult) => {
    setOpen(false);
    setText(result.title);
    inputRef.current?.blur();
    onChoose(result);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      if (text) {
        event.stopPropagation();
        setText("");
      }
      setOpen(false);
      return;
    }
    if (!showList || rowCount === 0) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setActive((current) => (current + (event.key === "ArrowDown" ? 1 : -1) + rowCount) % rowCount);
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (nearest && active === 0) return openNearest(nearest);
      const result = results[active - (nearest ? 1 : 0)];
      if (result) choose(result);
    }
  };

  const waiting = search.isFetching && query.length >= 2;
  const nothing = !waiting && rowCount === 0;
  const shift = nearest ? 1 : 0;

  return (
    <div ref={box} className={cn("relative", className)}>
      {/* Tall enough that the field inside its border is the 44 px a finger needs. */}
      <div
        className={cn(
          mapSurface,
          searchRowFocus,
          "flex h-11 items-center gap-1 max-md:h-[46px] md:pointer-coarse:h-[46px]",
          trailing ? "pr-0" : "pr-1",
          leading ? "pl-1" : "pl-3",
        )}
      >
        {leading}
        <Search aria-hidden className={cn("size-4 shrink-0 text-ink-muted", leading && "ml-1")} />
        <input
          ref={inputRef}
          type="search"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList && active < rowCount ? `${listId}-${active}` : undefined}
          aria-label="Search the map"
          placeholder="Place, coordinates, grid ref or locator"
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          // Still focused after a press elsewhere closed the list: a press on the field opens it again.
          onClick={() => setOpen(true)}
          onKeyDown={onKeyDown}
          autoComplete="off"
          spellCheck={false}
          className="h-full min-w-0 flex-1 bg-transparent px-2 text-body text-ink placeholder:text-ink-faint focus:outline-none [&::-webkit-search-cancel-button]:hidden"
        />
        {waiting ? <Spinner className="mr-2" label="Searching" /> : null}
        {text ? (
          <button
            type="button"
            aria-label="Clear the search"
            onClick={() => {
              setText("");
              inputRef.current?.focus();
            }}
            className="grid size-9 shrink-0 place-content-center rounded-control text-ink-muted hover:bg-surface-strong hover:text-ink max-md:size-[44px] md:pointer-coarse:size-[44px]"
          >
            <X className="size-4" />
          </button>
        ) : null}
        {trailing ? <div className="-my-px flex shrink-0 self-stretch border-l border-border">{trailing}</div> : null}
      </div>

      {/* Nothing yet while the first answer is on its way: no empty box under the field. */}
      {showList && !(waiting && rowCount === 0 && placesInstalled) ? (
        // The shadow and border on a box that does not scroll, the scrolling inside it, clipped. Without the clip,
        // Chromium left the map undrawn where the hidden part of a long list would have been: a blank panel the
        // height of the whole list hung under the results, over the map.
        <div className={cn(mapSurface, "absolute inset-x-0 top-full mt-1.5 overflow-hidden")} {...keepFieldFocus}>
          <div className="scroll-quiet max-h-[min(60dvh,26rem)] overflow-y-auto p-1 [clip-path:inset(0)]">
            {search.data?.notice && search.data.query === query ? (
              <p role="status" className="px-2.5 pt-1.5 pb-2 text-small text-ink-muted">
                {search.data.notice}
              </p>
            ) : null}
            <div id={listId} role="listbox" aria-label="Search results">
              {nearest ? (
                // biome-ignore lint/a11y/useFocusableInteractive: focus stays in the field; the list is driven through aria-activedescendant
                // biome-ignore lint/a11y/useKeyWithClickEvents: arrow keys and Enter are handled by the field
                <div
                  id={`${listId}-0`}
                  role="option"
                  aria-selected={active === 0}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => openNearest(nearest)}
                  onMouseMove={() => setActive(0)}
                  className={cn(
                    "flex cursor-pointer items-start gap-2.5 rounded-[4px] px-2.5 py-2 max-md:py-2.5 md:pointer-coarse:py-2.5",
                    active === 0 && "bg-surface-strong",
                  )}
                >
                  <LocateFixed aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium text-primary">{NEAREST_TITLES[nearest]}</span>
                    <span className="block text-micro text-ink-muted">With distances and directions, from the map's reference layers</span>
                  </span>
                </div>
              ) : null}
              {results.map((result, at) => {
                const index = at + shift;
                const Icon = icons[result.kind];
                return (
                  // biome-ignore lint/a11y/useFocusableInteractive: focus stays in the field; the list is driven through aria-activedescendant
                  // biome-ignore lint/a11y/useKeyWithClickEvents: arrow keys and Enter are handled by the field
                  <div
                    key={result.key}
                    id={`${listId}-${index}`}
                    role="option"
                    aria-selected={index === active}
                    // Keep focus in the field so the list does not close before the click lands.
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => choose(result)}
                    onMouseMove={() => setActive(index)}
                    className={cn(
                      "flex cursor-pointer items-start gap-2.5 rounded-[4px] px-2.5 py-2 max-md:py-2.5 md:pointer-coarse:py-2.5",
                      index === active && "bg-surface-strong",
                    )}
                  >
                    {result.kind === "marker" ? (
                      // A saved place as it is on the map: its icon, in its colour. That it is a favourite is in the words under its name.
                      <PlaceMark color={result.marker.color} icon={iconOf(result.marker)} className="-mx-[3px] -mt-px" />
                    ) : (
                      <Icon aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-muted" />
                    )}
                    {/* Names wrap rather than being cut short: the name is what is being chosen, and at large text on a phone
                      a coordinate was cut to "54.60000…" and its kind to "Coordinate…". */}
                    <span className="min-w-0 flex-1">
                      <span
                        className={cn(
                          "block text-ink [overflow-wrap:anywhere]",
                          result.kind === "coordinate" ? "font-mono text-[0.8125rem]" : "font-medium",
                        )}
                      >
                        {result.title}
                      </span>
                      <span className="block text-micro text-ink-muted [overflow-wrap:anywhere]">{result.detail}</span>
                    </span>
                    {result.distance !== null ? (
                      <span className="tabular shrink-0 pt-0.5 text-micro text-ink-muted">{formatDistance(result.distance)}</span>
                    ) : null}
                  </div>
                );
              })}
            </div>
            {search.isError ? (
              <p role="alert" className="px-2.5 py-2 text-small text-danger">
                {errorMessage(search.error)}
              </p>
            ) : nothing ? (
              <p className="px-2.5 py-2 text-small text-ink-muted">
                {placesInstalled
                  ? "Nothing matches. Try a different spelling, or type a position such as 53.068, -4.076, a grid reference such as SH 609 543, or a locator such as IO83QM."
                  : "None of your saved places or routes match."}
              </p>
            ) : null}
            {!placesInstalled ? (
              <div
                className={cn("px-2.5 py-2 text-small text-ink-muted", results.length > 0 || nothing ? "mt-1 border-t border-border" : "")}
              >
                Place names are not installed, so towns and hills cannot be found by name yet. Positions, grid references and locators still
                work.{" "}
                <button
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={onAddPlaceNames}
                  className="font-medium text-primary underline decoration-1 underline-offset-2 hover:decoration-2"
                >
                  Add place names
                </button>
              </div>
            ) : results.some((result) => result.kind === "place") ? (
              <p className="mt-1 border-t border-border px-2.5 pt-1.5 pb-1 text-micro text-ink-muted">
                Distances are from the middle of the map. {(search.data?.credits ?? ["Place names: GeoNames (CC BY 4.0)"]).join(". ")}.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
