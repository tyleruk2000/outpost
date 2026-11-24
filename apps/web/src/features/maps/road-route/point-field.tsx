/**
 * One point of a road route: the start, a via point or the end. Chosen by typing (the
 * map's own search: saved places, place names installed, a typed position or grid
 * reference), from the saved places listed before anything is typed, or as the middle of
 * the map. A point pressed on the map ("Road route from here") arrives from outside.
 */
import { formatDecimal, type MarkerDto } from "@outpost/shared";
import { Crosshair, LocateFixed, MapPin, Star, X } from "lucide-react";
import { useId, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/misc";
import { errorMessage } from "@/lib/api";
import { useDebounced } from "@/lib/use-debounced";
import { keepFieldFocus, useDismiss } from "@/lib/use-dismiss";
import { usePlaceSearch } from "../data";
import { nearestFirst, whereIAmState } from "../directions/words";
import type { LatLon } from "../lib/geo";
import { buildSearchResults } from "../lib/search";
import type { RoutePointChoice } from "./words";

const MAX_LISTED = 8;

const row =
  "flex w-full items-start gap-2.5 px-3 py-2 text-left text-small hover:bg-surface-strong focus-visible:-outline-offset-2 max-md:min-h-11 md:pointer-coarse:min-h-11";

/** "Point at 51.29600, -0.33000": the name of a point that has none of its own. */
export const pointName = (position: LatLon) => `Point at ${formatDecimal(position.lat, position.lon, 4)}`;

export function PointField({
  label,
  value,
  onChange,
  onRemove,
  markers,
  getCenter,
}: {
  /** "From", "Via 1", "To". */
  label: string;
  value: RoutePointChoice | null;
  onChange: (point: RoutePointChoice | null) => void;
  /** A via point can be taken out; the start and end only cleared. */
  onRemove?: () => void;
  markers: readonly MarkerDto[];
  getCenter: () => LatLon | null;
}) {
  const inputId = useId();
  const listId = useId();
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  // The list closes on a choice, on Escape, and on a press or focus somewhere else; not on the field's blur,
  // which on an iPhone closed it under the finger (lib/use-dismiss.ts).
  useDismiss(box, open, () => setOpen(false));
  const query = useDebounced(text.trim(), 200);
  // biome-ignore lint/correctness/useExhaustiveDependencies: the centre is read once per query, so the list does not reshuffle
  const centre = useMemo(() => getCenter(), [query]);
  const search = usePlaceSearch(query, centre ?? undefined);
  const results = useMemo(
    () =>
      query.length >= 2
        ? buildSearchResults({
            query,
            coordinate: search.data && search.data.query === query ? search.data.coordinate : null,
            otherReadings: search.data?.otherReadings,
            places: search.data?.places ?? [],
            markers: [...markers],
            tracks: [],
            center: centre,
          }).filter((result) => result.position !== null)
        : [],
    [query, search.data, markers, centre],
  );
  // Before anything is typed: the saved places, the nearest to the middle of the map first (where the person is looking).
  const saved = useMemo(() => nearestFirst(markers, centre).slice(0, MAX_LISTED), [markers, centre]);
  // Where the device is, asked once on a press. Over plain http browsers will not say, and the row says why.
  const [finding, setFinding] = useState(false);
  const [hereError, setHereError] = useState<string | null>(null);
  const here = whereIAmState({
    supported: typeof navigator !== "undefined" && "geolocation" in navigator,
    secure: typeof window !== "undefined" && window.isSecureContext,
    finding,
  });
  const findHere = () => {
    setFinding(true);
    setHereError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setFinding(false);
        choose({ name: "Where you are", lat: position.coords.latitude, lon: position.coords.longitude, from: "map" });
      },
      () => {
        setFinding(false);
        setHereError("This device's location is not available. Choose on the map or type where you are.");
      },
      { enableHighAccuracy: true, timeout: 30_000, maximumAge: 60_000 },
    );
  };

  const choose = (point: RoutePointChoice) => {
    onChange(point);
    setText("");
    setOpen(false);
  };

  if (value) {
    return (
      <div className="grid grid-cols-[minmax(0,1fr)] gap-1">
        <span className="text-small font-medium text-ink">{label}</span>
        <div className="flex items-center gap-2 rounded-control border border-border bg-surface px-3 py-1.5">
          <MapPin aria-hidden className="size-4 shrink-0 text-ink-muted" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-small font-medium text-ink">{value.name}</span>
            <span className="tabular block font-mono text-micro text-ink-muted">{formatDecimal(value.lat, value.lon, 4)}</span>
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={onRemove ? `Remove ${label.toLowerCase()}` : `Change ${label.toLowerCase()}`}
            onClick={() => (onRemove ? onRemove() : onChange(null))}
            className="max-md:size-11 md:pointer-coarse:size-11"
          >
            <X />
          </Button>
        </div>
      </div>
    );
  }

  const listed = query.length >= 2 ? results.slice(0, MAX_LISTED) : [];
  return (
    // One track no wider than the form: with an auto track the longest detail of a suggestion ("Tidal water · Na h-Eileanan
    // an Iar, Scotland") set the width, and the rows and the middle-of-the-map button ran off the side of a phone.
    <div ref={box} className="grid grid-cols-[minmax(0,1fr)] gap-1">
      <label htmlFor={inputId} className="text-small font-medium text-ink">
        {label}
      </label>
      <div className="flex flex-wrap gap-2">
        <Input
          id={inputId}
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            setOpen(true);
            // On a phone the field goes to the top of the panel, its suggestions straight under it and clear of
            // the keyboard, once the keyboard has come up and the sheet has settled on it.
            if (window.matchMedia?.("(max-width: 47.99rem)").matches)
              window.setTimeout(() => box.current?.scrollIntoView?.({ block: "start" }), 300);
          }}
          // Still focused after a press elsewhere closed the list: a press on the field opens it again.
          onClick={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === "Escape" && open) {
              event.stopPropagation();
              setOpen(false);
            } else if (event.key === "Enter") {
              // Return takes the first suggestion for what is typed, and never sends the form round it (which emptied the field).
              event.preventDefault();
              const first = query === text.trim() ? listed[0] : undefined;
              if (first?.position)
                choose({
                  name: first.kind === "coordinate" ? pointName(first.position) : first.title,
                  lat: first.position.lat,
                  lon: first.position.lon,
                  from: first.kind === "marker" ? "place" : "search",
                });
            }
          }}
          placeholder="A postcode, place, grid ref or coordinates"
          autoComplete="off"
          spellCheck={false}
          aria-controls={open ? listId : undefined}
          aria-expanded={open}
          className="min-w-0 flex-[1_1_10rem]"
        />
        <Button
          aria-label={`${label}: the middle of the map`}
          onClick={() => {
            const at = getCenter();
            if (at) choose({ name: pointName(at), lat: at.lat, lon: at.lon, from: "centre" });
          }}
          className="max-md:size-11 max-md:px-0"
        >
          <Crosshair /> <span className="max-md:sr-only">Map centre</span>
        </Button>
        {onRemove ? (
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Remove ${label.toLowerCase()}`}
            onClick={onRemove}
            className="max-md:size-11 md:pointer-coarse:size-11"
          >
            <X />
          </Button>
        ) : null}
      </div>
      {open ? (
        <div id={listId} className="rounded-control border border-border bg-page" {...keepFieldFocus}>
          {query.length >= 2 ? (
            search.isError && listed.length === 0 ? (
              <div className="grid justify-items-start gap-2 px-3 py-2" role="alert">
                <p className="text-small text-danger">{errorMessage(search.error)}</p>
                <Button size="sm" onClick={() => void search.refetch()}>
                  Try again
                </Button>
              </div>
            ) : search.isFetching && listed.length === 0 ? (
              <p className="flex items-center gap-2 px-3 py-2 text-small text-ink-muted" role="status">
                <Spinner label="Searching" /> Searching
              </p>
            ) : listed.length === 0 ? (
              <p className="px-3 py-2 text-small text-ink-muted" role="status">
                Nothing found called that. Try a saved place, a town with place names installed, or coordinates such as 51.30, -0.33.
              </p>
            ) : (
              <ul aria-label={`Places for ${label.toLowerCase()}`} className="divide-y divide-border">
                {listed.map((result) => (
                  <li key={result.key}>
                    <button
                      type="button"
                      className={row}
                      onClick={() =>
                        result.position &&
                        choose({
                          name: result.kind === "coordinate" ? pointName(result.position) : result.title,
                          lat: result.position.lat,
                          lon: result.position.lon,
                          from: result.kind === "marker" ? "place" : "search",
                        })
                      }
                    >
                      <MapPin aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-muted" />
                      <span className="min-w-0">
                        <span className="block text-ink">{result.title}</span>
                        <span className="block truncate text-micro text-ink-muted">{result.detail}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )
          ) : (
            <>
              {here.state === "unavailable" ? (
                <p className="flex items-start gap-2.5 border-b border-border px-3 py-2 text-small text-ink-muted">
                  <LocateFixed aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-faint" />
                  <span className="min-w-0">
                    <span className="block font-medium">Where I am</span>
                    {here.reason}
                  </span>
                </p>
              ) : (
                <button type="button" className={`${row} border-b border-border`} onClick={findHere} disabled={finding}>
                  <LocateFixed aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />
                  <span className="min-w-0 text-ink">{finding ? "Finding where you are…" : "Where I am"}</span>
                </button>
              )}
              {hereError ? (
                <p className="border-b border-border px-3 py-2 text-small text-danger" role="alert">
                  {hereError}
                </p>
              ) : null}
            </>
          )}
          {query.length >= 2 ? null : saved.length > 0 ? (
            <ul aria-label="Saved places" className="divide-y divide-border">
              {saved.map((marker) => (
                <li key={marker.id}>
                  <button
                    type="button"
                    className={row}
                    onClick={() => choose({ name: marker.name, lat: marker.lat, lon: marker.lon, from: "place" })}
                  >
                    {marker.isFavorite ? (
                      <Star aria-hidden className="mt-0.5 size-4 shrink-0 text-lamp" />
                    ) : (
                      <MapPin aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-muted" />
                    )}
                    <span className="min-w-0 text-ink">{marker.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-3 py-2 text-small text-ink-muted">
              Type a place's name or coordinates, use the middle of the map, or press and hold (right-click) a point on the map.
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
