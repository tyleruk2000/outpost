/**
 * Choosing a point of a route on a phone: one field at the top of the screen, its rows under
 * it, the keyboard under them. A layer over the whole screen, mounted before it is needed and
 * shown and focused inside the press that opens it, so that iOS raises the keyboard once and
 * has nothing to pan: the field is the first thing on the screen. The list is the scroller,
 * with room at its foot for the keyboard, so the last row can always be brought above it.
 * No timers, and nothing resized.
 */
import type { MarkerDto, RoadDistanceUnit } from "@outpost/shared";
import { ArrowLeft, Crosshair, House, MapPin, Star, X } from "lucide-react";
import { type KeyboardEvent, type ReactNode, useEffect, useId, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { searchRowFocus } from "@/components/ui/input";
import { Spinner } from "@/components/ui/misc";
import { errorMessage } from "@/lib/api";
import { useDebounced } from "@/lib/use-debounced";
import { keepFieldFocus } from "@/lib/use-dismiss";
import { cn } from "@/lib/utils";
import { usePlaceSearch } from "../data";
import type { LatLon } from "../lib/geo";
import { buildSearchResults } from "../lib/search";
import { pointName } from "../road-route/point-field";
import type { RoutePointChoice } from "../road-route/words";
import type { Directions } from "./use-directions";
import { distanceFrom, type HomeStart, homeDetail, pointLabel, samePlace } from "./words";

const MAX_LISTED = 8;

/** How much of the foot of the screen the keyboard covers, from the visual viewport (0 where it cannot say). */
function useKeyboardInset(active: boolean): number {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!active || !viewport) return;
    const measure = () => setInset(Math.max(0, Math.round(window.innerHeight - viewport.height - viewport.offsetTop)));
    measure();
    viewport.addEventListener("resize", measure);
    viewport.addEventListener("scroll", measure);
    return () => {
      viewport.removeEventListener("resize", measure);
      viewport.removeEventListener("scroll", measure);
    };
  }, [active]);
  return inset;
}

interface Row {
  key: string;
  icon: ReactNode;
  title: string;
  detail?: string;
  distance?: string | null;
  choose: () => void;
  /** Choose on the map: in the primary colour, one line. */
  action?: boolean;
}

const iconClass = "mt-0.5 size-5 shrink-0";

export function DirectionsPicker({
  directions,
  markers,
  home,
  getCenter,
}: {
  directions: Directions;
  markers: readonly MarkerDto[];
  home: HomeStart | null;
  getCenter: () => LatLon | null;
}) {
  const { picker, points, pickerText: text, setPickerText: setText, units } = directions;
  const open = picker !== null;
  const listId = useId();
  const [active, setActive] = useState(0);
  const inset = useKeyboardInset(open);
  const query = useDebounced(text.trim(), 180);
  const label = picker ? (picker.adding ? `Stop ${picker.index}` : pointLabel(picker.index, points.length)) : "To";
  // Distances are from the start, or for the start itself from the end; failing both, from the middle of the map.
  // biome-ignore lint/correctness/useExhaustiveDependencies: read once per opening and query, so the list does not reshuffle
  const from = useMemo<LatLon | null>(() => {
    const start = picker?.index === 0 ? points.at(-1) : points[0];
    return start ?? (open ? getCenter() : null);
  }, [open, query, points]);
  const search = usePlaceSearch(open ? query : "", from ?? undefined);

  // biome-ignore lint/correctness/useExhaustiveDependencies: the first row is in hand again whenever the words change
  useEffect(() => setActive(0), [query]);

  const rows = useMemo<Row[]>(() => {
    if (!picker) return [];
    const take = (point: RoutePointChoice) => directions.choose(picker, point);
    const onMap: Row = {
      key: "on-map",
      icon: <Crosshair aria-hidden className={cn(iconClass, "text-primary")} />,
      title: "Choose on the map",
      choose: () => directions.startChoosing(picker),
      action: true,
    };
    if (query.length < 2) {
      const homeRow: Row[] =
        home && !markers.some((marker) => samePlace(marker, home))
          ? [
              {
                key: "home",
                icon: <House aria-hidden className={cn(iconClass, "text-ink-muted")} />,
                title: home.name,
                detail: homeDetail(home),
                distance: distanceFrom(from, home, units as RoadDistanceUnit),
                choose: () => take({ name: home.name, lat: home.lat, lon: home.lon, from: "place" }),
              },
            ]
          : [];
      const saved = [...markers]
        .sort((a, b) => Number(b.isFavorite) - Number(a.isFavorite) || a.name.localeCompare(b.name))
        .map(
          (marker): Row => ({
            key: `marker-${marker.id}`,
            icon: marker.isFavorite ? (
              <Star aria-hidden className={cn(iconClass, "text-lamp")} />
            ) : (
              <MapPin aria-hidden className={cn(iconClass, "text-ink-muted")} />
            ),
            title: marker.name,
            detail: marker.isFavorite ? "Saved place · favourite" : "Saved place",
            distance: distanceFrom(from, marker, units),
            choose: () => take({ name: marker.name, lat: marker.lat, lon: marker.lon, from: "place" }),
          }),
        );
      return [onMap, ...homeRow, ...saved];
    }
    const found = buildSearchResults({
      query,
      coordinate: search.data && search.data.query === query ? search.data.coordinate : null,
      otherReadings: search.data?.otherReadings,
      places: search.data?.places ?? [],
      markers: [...markers],
      tracks: [],
      center: from,
    })
      .filter((result) => result.position !== null)
      .slice(0, MAX_LISTED)
      .map(
        (result): Row => ({
          key: result.key,
          icon:
            result.kind === "marker" && result.marker.isFavorite ? (
              <Star aria-hidden className={cn(iconClass, "text-lamp")} />
            ) : result.kind === "coordinate" ? (
              <Crosshair aria-hidden className={cn(iconClass, "text-ink-muted")} />
            ) : (
              <MapPin aria-hidden className={cn(iconClass, "text-ink-muted")} />
            ),
          title: result.title,
          detail: result.detail,
          distance: result.position ? distanceFrom(from, result.position, units) : null,
          choose: () =>
            result.position &&
            take({
              name: result.kind === "coordinate" ? pointName(result.position) : result.title,
              lat: result.position.lat,
              lon: result.position.lon,
              from: result.kind === "marker" ? "place" : "search",
            }),
        }),
      );
    return [...found, onMap];
  }, [picker, query, search.data, markers, home, from, units, directions]);

  const searching = query.length >= 2 && search.isFetching;
  const failed = query.length >= 2 && search.isError && rows.length <= 1;
  const nothing = query.length >= 2 && !search.isFetching && !search.isError && rows.length <= 1;

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      directions.closePicker();
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (rows.length > 0) setActive((current) => (current + (event.key === "ArrowDown" ? 1 : -1) + rows.length) % rows.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      // Return chooses the row in hand: the first, until the arrows move it.
      if (query.length >= 2 || active > 0) rows[active]?.choose();
    }
  };

  const layer = (
    <div
      hidden={!open}
      role="dialog"
      aria-modal="true"
      aria-label={label === "To" ? "Where to?" : label === "From" ? "Where from?" : `${label}: where?`}
      className="fixed inset-0 z-(--z-dialog) flex flex-col bg-page md:hidden"
    >
      <div className="shrink-0 bg-spine pt-[env(safe-area-inset-top)] pr-[max(0.5rem,env(safe-area-inset-right))] pl-[max(0.25rem,env(safe-area-inset-left))]">
        <div className="flex h-[60px] items-center gap-1">
          <button
            type="button"
            aria-label="Back"
            onClick={() => directions.closePicker()}
            className="grid size-11 shrink-0 place-content-center rounded-control text-spine-ink hover:bg-spine-active focus-visible:outline-spine-ink"
          >
            <ArrowLeft aria-hidden className="size-5" strokeWidth={1.8} />
          </button>
          <div className={cn("flex h-11 min-w-0 flex-1 items-center gap-2 rounded-control bg-page pr-1 pl-3", searchRowFocus)}>
            <span aria-hidden className="shrink-0 text-small font-semibold text-ink-muted">
              {label}
            </span>
            <span aria-hidden className="h-5 w-px shrink-0 bg-border" />
            <input
              ref={directions.inputRef}
              type="search"
              role="combobox"
              aria-label={`${label}: place, coordinates or grid reference`}
              aria-expanded={open}
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={rows[active] && (query.length >= 2 || active > 0) ? `${listId}-${active}` : undefined}
              placeholder="Place, coordinates or grid ref"
              value={text}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={onKeyDown}
              autoComplete="off"
              autoCapitalize="words"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="search"
              className="h-full min-w-0 flex-1 bg-transparent text-body text-ink placeholder:text-ink-faint focus:outline-none [&::-webkit-search-cancel-button]:hidden"
            />
            {searching ? <Spinner delay label="Searching" className="shrink-0" /> : null}
            {text ? (
              <button
                type="button"
                aria-label="Clear"
                {...keepFieldFocus}
                onClick={() => setText("")}
                className="grid size-9 shrink-0 place-content-center rounded-control text-ink-muted hover:bg-surface-strong hover:text-ink"
              >
                <X aria-hidden className="size-4" />
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <div
        className="scroll-quiet min-h-0 flex-1 overflow-y-auto overscroll-contain"
        // The keyboard's height at the foot, so the last row can be brought above it.
        style={{ paddingBottom: `calc(${inset}px + env(safe-area-inset-bottom))` }}
        {...keepFieldFocus}
      >
        {failed ? (
          <div className="grid justify-items-start gap-2 border-b border-border px-4 py-3" role="alert">
            <p className="text-small text-danger">{errorMessage(search.error)}</p>
            <Button size="sm" onClick={() => void search.refetch()}>
              Try again
            </Button>
          </div>
        ) : nothing ? (
          <p className="border-b border-border px-4 py-3 text-small text-ink-muted" role="status">
            Nothing found called that. Try a saved place, a town with place names installed, or coordinates such as 51.30, -0.33.
          </p>
        ) : null}
        <div
          id={listId}
          role="listbox"
          aria-label={`Places for ${label.toLowerCase()}`}
          className="divide-y divide-border border-b border-border"
        >
          {rows.map((row, index) => (
            // biome-ignore lint/a11y/useFocusableInteractive: focus stays in the field; the list is driven through aria-activedescendant
            // biome-ignore lint/a11y/useKeyWithClickEvents: arrow keys and Enter are handled by the field
            <div
              key={row.key}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === active && (query.length >= 2 || active > 0)}
              onClick={row.choose}
              className={cn(
                "flex min-h-14 cursor-pointer items-center gap-3 px-4 py-2 hover:bg-surface active:bg-surface-strong",
                index === active && (query.length >= 2 || active > 0) && "bg-surface-strong",
                row.action && "min-h-12",
              )}
            >
              {row.icon}
              <span className="min-w-0 flex-1">
                <span className={cn("block text-body break-words", row.action ? "font-medium text-primary" : "font-semibold text-ink")}>
                  {row.title}
                </span>
                {row.detail ? <span className="block truncate text-small text-ink-muted">{row.detail}</span> : null}
              </span>
              {row.distance ? <span className="tabular shrink-0 text-small text-ink-muted">{row.distance}</span> : null}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
  return createPortal(layer, document.body);
}
