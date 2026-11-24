/**
 * Saying where a station is: typed (coordinates, a grid reference, a locator, or the name
 * of a place among the place names installed for the map), chosen from the saved places,
 * or pressed on the offline map. Used wherever the planner takes a position.
 */
import { type MarkerDto, parseCoordinates, toMaidenhead } from "@outpost/shared";
import { MapPin } from "lucide-react";
import { lazy, Suspense, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Select, Skeleton } from "@/components/ui/misc";
import { usePlaceSearch } from "@/features/maps/data";
import { placeDetail } from "@/features/maps/lib/search";
import { errorMessage } from "@/lib/api";
import { useDebounced } from "@/lib/use-debounced";
import type { PlaceField } from "./data";
import { pointFeature } from "./map/layers";
import type { PlanMapHandle } from "./map/plan-map";

// The map library is large; it is fetched when a map is first opened.
const PlanMap = lazy(() => import("./map/plan-map").then((module) => ({ default: module.PlanMap })));

const written = (lat: number, lon: number) => `${lat.toFixed(4)}, ${lon.toFixed(4)}`;

/** A position as it is shown under a field or a pin: coordinates and the locator they fall in. */
export const placeLine = (lat: number, lon: number): string => `${written(lat, lon)} · ${toMaidenhead(lat, lon, 6) ?? ""}`;

interface Chosen {
  lat: number;
  lon: number;
  /** A saved place's name, when one was pressed. */
  name: string;
}

/**
 * The offline map, to press a place on. A press puts a pin down; pressing a saved place
 * takes its position and its name. Nothing is chosen until "Use this place".
 */
export function PlacePicker({
  what,
  start,
  places,
  onChoose,
  onClose,
}: {
  /** "the transmitter", "the receiver", "this station". */
  what: string;
  start: { lat: number; lon: number } | null;
  places: MarkerDto[];
  onChoose: (place: PlaceField) => void;
  onClose: () => void;
}) {
  const [chosen, setChosen] = useState<Chosen | null>(start ? { ...start, name: "" } : null);
  const [map, setMap] = useState<PlanMapHandle | null>(null);
  const data = useMemo(
    () => ({ type: "FeatureCollection" as const, features: chosen ? [pointFeature("pick", chosen.name || "Here", chosen)] : [] }),
    [chosen],
  );
  // Opens around the place already given, so that a small correction does not start from a map of a continent.
  const fit = useMemo(
    () => (start ? ([start.lon - 3, start.lat - 1.5, start.lon + 3, start.lat + 1.5] as [number, number, number, number]) : null),
    [start],
  );
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        size="xl"
        title={`Choose where ${what} is`}
        description="Press the map to put the place there, or press one of your saved places to use it by name."
      >
        <DialogBody className="grid gap-3">
          <Suspense fallback={<Skeleton className="h-[min(42dvh,30rem)] md:h-[min(56dvh,30rem)] w-full" />}>
            <PlanMap
              label={`Map for choosing where ${what} is`}
              className="h-[min(42dvh,30rem)] md:h-[min(56dvh,30rem)]"
              data={data}
              places={places}
              fit={fit}
              onReady={setMap}
              onPress={({ position, place }) =>
                setChosen(place ? { lat: place.lat, lon: place.lon, name: place.name } : { ...position, name: "" })
              }
            />
          </Suspense>
          <p className="tabular min-h-6 font-mono text-small text-ink" aria-live="polite">
            {chosen ? `${chosen.name ? `${chosen.name} · ` : ""}${placeLine(chosen.lat, chosen.lon)}` : "No place chosen yet."}
          </p>
        </DialogBody>
        <DialogFooter>
          <Button
            className="mr-auto"
            disabled={!map}
            onClick={() => {
              if (!map) return;
              const [west, south, east, north] = map.bounds();
              setChosen({ lat: (south + north) / 2, lon: (((((west + east) / 2 + 540) % 360) + 360) % 360) - 180, name: "" });
            }}
          >
            Use the middle of the map
          </Button>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!chosen}
            onClick={() => {
              if (!chosen) return;
              onChoose({ text: `${chosen.lat.toFixed(5)}, ${chosen.lon.toFixed(5)}`, name: chosen.name });
              onClose();
            }}
          >
            Use this place
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Places called what was typed, from the place names installed for the map: "Keswick" as well as "NY 26 23". */
function PlaceNameMatches({ text, label, onChange }: { text: string; label: string; onChange: (value: PlaceField) => void }) {
  const query = useDebounced(text, 250);
  const search = usePlaceSearch(query, undefined);
  const places = search.data && search.data.query === query ? search.data.places.slice(0, 4) : [];
  if (query.length < 3 || search.isPending) return null;
  if (search.isError) return <p className="text-small text-danger">{errorMessage(search.error)}</p>;
  if (places.length === 0)
    return (
      <p className="text-small text-ink-muted" role="status">
        No place called “{query}” among the place names on this Outpost. Type coordinates, a grid reference or a locator, or choose on the
        map. Place names are added on Maps › Offline maps.
      </p>
    );
  return (
    <ul aria-label={`${label}: places called “${query}”`} className="divide-y divide-border rounded-control border border-border">
      {places.map((place) => (
        <li key={place.id}>
          <button
            type="button"
            className="flex min-h-11 w-full flex-col justify-center px-3 py-1.5 text-left hover:bg-surface focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus"
            onClick={() => onChange({ text: `${place.lat.toFixed(5)}, ${place.lon.toFixed(5)}`, name: place.name })}
          >
            <span className="text-small font-medium text-ink">{place.name}</span>
            <span className="text-micro text-ink-muted">{placeDetail(place)}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

export function PlaceInput({
  label,
  what,
  value,
  onChange,
  places,
  error,
}: {
  label: string;
  /** How the place is spoken of in the map's title: "the transmitter". */
  what: string;
  value: PlaceField;
  onChange: (value: PlaceField) => void;
  places: MarkerDto[];
  error?: string;
}) {
  const [picking, setPicking] = useState(false);
  const found = parseCoordinates(value.text);
  const hint = found
    ? `${placeLine(found.lat, found.lon)}${value.name ? ` · ${value.name}` : ""}`
    : "A place name, coordinates (51.5074, -0.1278), a grid reference or a locator (IO91WM).";
  return (
    <Field label={label} hint={hint} error={error}>
      {(ids) => (
        // One column that may be narrower than what is in it: a saved place's chooser asks for 12rem, which at
        // large text is wider than a small phone, and an automatic column would grow to that and take the page with it.
        <div className="grid grid-cols-[minmax(0,1fr)] gap-2">
          <Input
            {...ids}
            value={value.text}
            onChange={(event) => onChange({ text: event.target.value, name: "" })}
            placeholder="51.5074, -0.1278"
            inputMode="text"
            autoComplete="off"
            spellCheck={false}
            className="font-mono"
          />
          <div className="flex flex-wrap gap-2">
            {places.length > 0 ? (
              <Select
                aria-label={`${label}: choose a saved place`}
                value={undefined}
                placeholder="Or choose a saved place"
                className="min-w-0 flex-1 basis-[min(12rem,100%)]"
                onChange={(id) => {
                  const place = places.find((item) => item.id === id);
                  if (place) onChange({ text: `${place.lat.toFixed(5)}, ${place.lon.toFixed(5)}`, name: place.name });
                }}
                options={places.map((place) => ({ value: place.id, label: place.name }))}
              />
            ) : null}
            <Button
              type="button"
              onClick={() => setPicking(true)}
              aria-label={`${label}: choose on the map`}
              className="h-auto min-h-9 max-w-full py-2 whitespace-normal max-md:h-auto max-md:min-h-11"
            >
              <MapPin aria-hidden />
              Choose on the map
            </Button>
          </div>
          {!found && value.text.trim().length >= 3 ? <PlaceNameMatches text={value.text.trim()} label={label} onChange={onChange} /> : null}
          {picking ? (
            <PlacePicker
              what={what}
              start={found ? { lat: found.lat, lon: found.lon } : null}
              places={places}
              onChoose={onChange}
              onClose={() => setPicking(false)}
            />
          ) : null}
        </div>
      )}
    </Field>
  );
}
