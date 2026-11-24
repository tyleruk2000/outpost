/**
 * "We're here now" for a portable household: where it is, from this device's location (asked
 * only on the press), a point chosen on the map, or a saved place. Nothing is fetched for
 * the new place: screens that use home say their figures are for the earlier one until a
 * person presses for new ones.
 */
import { type Bbox, type HereSource, type HouseholdDto, type HouseholdHereInput, type MarkerDto, parseCoordinates } from "@outpost/shared";
import { Crosshair, LocateFixed, MapPin } from "lucide-react";
import { lazy, Suspense, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Segmented, Select, Skeleton } from "@/components/ui/misc";
import { useCatalogue } from "@/features/layers/data";
import { useMapOverview, useMarkers, usePlaceSearch } from "@/features/maps/data";
import { pointFeature } from "@/features/propagation/map/layers";
import { errorMessage } from "@/lib/api";
import { notify } from "@/lib/notify";
import { deviceRegion } from "@/lib/region";
import { useDebounced } from "@/lib/use-debounced";
import { settle, useSetHere } from "./data";
import { useHome } from "./home";
import { positionName } from "./words";

const PlanMap = lazy(() => import("@/features/propagation/map/plan-map").then((module) => ({ default: module.PlanMap })));

export type HereChoice = HouseholdHereInput;

/** Where this device is, asked for now. Missing over plain http on another device: said in words. */
export function locateDevice(): Promise<{ lat: number; lon: number }> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator) || !window.isSecureContext) {
      reject(
        new Error(
          "Browsers only share a device's location with pages opened over HTTPS or on the device itself. Choose a point on the map or a saved place instead.",
        ),
      );
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (fix) => resolve({ lat: fix.coords.latitude, lon: fix.coords.longitude }),
      () => reject(new Error("This device could not say where it is. Choose a point on the map or a saved place instead.")),
      { enableHighAccuracy: true, maximumAge: 60_000, timeout: 30_000 },
    );
  });
}

/** An area round a point to open the map on: about a town's width. */
const around = (point: { lat: number; lon: number }, span = 0.08): Bbox => [
  point.lon - span * 1.6,
  point.lat - span,
  point.lon + span * 1.6,
  point.lat + span,
];

/**
 * Finding the place on the map: a box that takes a town's name (once place names are
 * installed), a postcode, coordinates, a grid reference or a locator, and the map itself,
 * opened on the household's country (else the device's region), to press. Nothing leaves
 * this Outpost: names are looked up in the place names it holds.
 */
function MapChooser({
  value,
  places,
  onPick,
}: {
  value: HereChoice | null;
  places: MarkerDto[];
  onPick: (pick: { lat: number; lon: number; name: string | null }) => void;
}) {
  const [query, setQuery] = useState("");
  const typed = useDebounced(query.trim(), 250);
  const coordinate = useMemo(() => parseCoordinates(typed), [typed]);
  const search = usePlaceSearch(coordinate ? "" : typed, undefined);
  const overview = useMapOverview();
  const placesInstalled = (overview.data?.places.length ?? 0) > 0;
  const catalogue = useCatalogue();
  const current = useHome();
  const region = current.country ?? deviceRegion();
  const countryBox = catalogue.data?.countries.find((country) => country.code === region)?.bbox ?? null;
  // A country that crosses the 180th meridian has a box the world's width: open on the world instead.
  const opening = countryBox && countryBox[2] - countryBox[0] < 180 ? countryBox : null;
  const [moved, setMoved] = useState<Bbox | null>(null);
  const fit = moved ?? (value ? around(value) : opening);
  const pin = useMemo(
    () => ({ type: "FeatureCollection" as const, features: value ? [pointFeature("pick", value.name || "Here", value)] : [] }),
    [value],
  );
  const found = coordinate ? [] : typed.length >= 2 && search.data?.query === typed ? search.data.places.slice(0, 6) : [];
  const take = (pick: { lat: number; lon: number; name: string | null }) => {
    onPick(pick);
    setMoved(around(pick));
    setQuery("");
  };
  return (
    <div className="grid gap-3">
      <Field
        label="Find the place"
        hint={
          placesInstalled
            ? "A town or village, a postcode, coordinates such as 47.8561, 12.1225, a grid reference or a locator. Or press the map."
            : "Coordinates such as 47.8561, 12.1225, a grid reference or a locator. Towns can be found by name once place names are added on Maps. Or press the map."
        }
      >
        {(ids) => (
          <Input
            {...ids}
            type="search"
            enterKeyHint="search"
            autoComplete="off"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              if (coordinate) take({ lat: coordinate.lat, lon: coordinate.lon, name: null });
              else if (found.length === 1) take({ lat: found[0]!.lat, lon: found[0]!.lon, name: found[0]!.name });
            }}
          />
        )}
      </Field>
      {coordinate || found.length > 0 || (typed.length >= 2 && search.data?.query === typed) ? (
        <ul aria-label="Places found" className="divide-y divide-border rounded-panel border border-border">
          {coordinate ? (
            <li>
              <button
                type="button"
                className="flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left text-small text-ink hover:bg-surface"
                onClick={() => take({ lat: coordinate.lat, lon: coordinate.lon, name: null })}
              >
                <MapPin aria-hidden className="size-4 shrink-0 text-ink-muted" />
                <span>
                  Use <span className="font-mono">{positionName({ lat: coordinate.lat, lon: coordinate.lon, name: null })}</span>
                </span>
              </button>
            </li>
          ) : found.length > 0 ? (
            found.map((place) => (
              <li key={place.id}>
                <button
                  type="button"
                  className="flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left text-small text-ink hover:bg-surface"
                  onClick={() => take({ lat: place.lat, lon: place.lon, name: place.name })}
                >
                  <MapPin aria-hidden className="size-4 shrink-0 text-ink-muted" />
                  <span className="min-w-0 [overflow-wrap:anywhere]">
                    <span className="font-medium">{place.name}</span>
                    <span className="text-ink-muted">
                      {" "}
                      · {[place.kindLabel, place.source === "os" ? place.admin1 : null, place.country].filter(Boolean).join(", ")}
                    </span>
                  </span>
                </button>
              </li>
            ))
          ) : (
            <li className="px-3 py-2 text-small text-ink-muted">
              {search.data?.notice ??
                (placesInstalled
                  ? "Nothing is called that. Try another spelling, or type the position."
                  : "Place names are not installed, so towns cannot be found by name yet. Type the position, or press the map.")}
            </li>
          )}
        </ul>
      ) : null}
      <Suspense fallback={<Skeleton className="h-72 sm:h-80" />}>
        <PlanMap
          label="Map: press the place to choose it"
          data={pin}
          places={places}
          fit={fit}
          fitMaxZoom={13}
          onPress={({ position, place }) => onPick({ lat: position.lat, lon: position.lon, name: place?.name ?? null })}
          className="h-72 overflow-hidden rounded-panel border border-border sm:h-80"
        />
      </Suspense>
    </div>
  );
}

/** The three ways of saying where a portable household is, with the place chosen so far. */
export function HereChooser({
  value,
  onChange,
  sources = ["device", "map", "place"],
  nameHint = "Such as the campsite or the car park, so the place says what it is.",
}: {
  value: HereChoice | null;
  onChange: (value: HereChoice | null) => void;
  /** The ways offered, in this order: a home place leaves out "a saved place", chosen from the list beside it. */
  sources?: readonly HereSource[];
  nameHint?: string;
}) {
  const [how, setHow] = useState<HereSource>(value?.source ?? sources[0] ?? "device");
  const [locating, setLocating] = useState(false);
  const markers = useMarkers();
  const places: MarkerDto[] = markers.data ?? [];

  const locate = () => {
    setLocating(true);
    locateDevice()
      .then((fix) => onChange({ ...fix, name: value?.source === "device" ? (value.name ?? null) : null, source: "device" }))
      .catch((error) => notify.error(errorMessage(error)))
      .finally(() => setLocating(false));
  };

  return (
    <div className="grid gap-4">
      <div className="grid gap-1.5">
        <span className="text-small font-medium text-ink">Where it is from</span>
        <Segmented<HereSource>
          label="Where it is from"
          value={how}
          onChange={setHow}
          options={(
            [
              { value: "device", label: "This device", icon: <LocateFixed aria-hidden /> },
              { value: "map", label: "Find or press on the map", icon: <Crosshair aria-hidden /> },
              { value: "place", label: "A saved place", icon: <MapPin aria-hidden /> },
            ] as const
          ).filter((option) => sources.includes(option.value))}
          className="justify-self-start"
        />
      </div>
      {how === "device" ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={locate} loading={locating}>
            <LocateFixed /> Use this device's location
          </Button>
          <span className="text-small text-ink-muted">The browser asks first. Nothing is sent anywhere else.</span>
        </div>
      ) : null}
      {how === "map" ? (
        <MapChooser
          value={value}
          places={places}
          onPick={(pick) => onChange({ lat: pick.lat, lon: pick.lon, name: pick.name ?? value?.name ?? null, source: "map" })}
        />
      ) : null}
      {how === "place" ? (
        places.length === 0 ? (
          <p className="text-small text-ink-muted">No saved places yet. Save one on the Maps screen, or use this device or the map.</p>
        ) : (
          <Field label="Saved place">
            {(ids) => (
              <Select<string>
                {...ids}
                value={
                  value?.source === "place" ? places.find((place) => place.lat === value.lat && place.lon === value.lon)?.id : undefined
                }
                placeholder="Choose a place"
                onChange={(id) => {
                  const place = places.find((entry) => entry.id === id);
                  if (place) onChange({ lat: place.lat, lon: place.lon, name: place.name, source: "place" });
                }}
                options={places.map((place) => ({ value: place.id, label: place.name || "A saved place" }))}
              />
            )}
          </Field>
        )
      ) : null}
      {value ? (
        <div className="grid gap-3 border-t border-border pt-3">
          <p className="text-small text-ink" data-testid="here-chosen">
            Chosen: <span className="font-mono">{positionName({ ...value, name: null })}</span>
          </p>
          <Field label="Name for this place" optional hint={nameHint}>
            {(ids) => (
              <Input
                {...ids}
                value={value.name ?? ""}
                maxLength={120}
                onChange={(event) => onChange({ ...value, name: event.target.value })}
              />
            )}
          </Field>
        </div>
      ) : null}
    </div>
  );
}

/** The dialog behind each "We're here now" button. */
export function HereDialog({
  household,
  open,
  onOpenChange,
}: {
  household: HouseholdDto;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [choice, setChoice] = useState<HereChoice | null>(null);
  const save = useSetHere(household.id);
  const close = (next: boolean) => {
    if (!next) setChoice(null);
    onOpenChange(next);
  };
  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent
        title={`Where ${household.name} is now`}
        description="Used by every screen that works from home. Forecasts, tides and passes for the new place are fetched only when you ask for them."
      >
        <DialogBody>
          <HereChooser value={choice} onChange={setChoice} />
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => close(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!choice}
            loading={save.isPending}
            onClick={() => {
              if (!choice) return;
              settle(
                save,
                { ...choice, name: choice.name?.trim() || null },
                {
                  onSuccess: () => {
                    toast.success(`${household.name} is here now.`);
                    close(false);
                  },
                  onError: (error) => notify.error(errorMessage(error)),
                },
              );
            }}
          >
            We're here now
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
