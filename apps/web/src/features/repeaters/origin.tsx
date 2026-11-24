/**
 * The place distances and bearings are measured from. Home (the current household's
 * saved place, or where a portable household was last said to be, named with its age)
 * until another is chosen: where the device is now, a saved place, a place found by
 * typing, or a point on the map (set by tapping a map on the screen).
 *
 * The choice is one short string, so that a screen can keep it in its address (the
 * Repeaters list does, so Back comes back to it) as well as in this browser:
 *
 * - `home`, `here`;
 * - `place:` and a saved place's id;
 * - `point:lat,lon` for a point tapped on a map;
 * - `at:lat,lon:name` for a place found by typing, or a repeater measured from.
 *
 * Older choices this browser may still hold ("none", "map" for the middle of the Maps
 * screen, "typed", "household-here") are read as Home.
 */
import { formatDecimal, homeLabel, type MarkerDto } from "@outpost/shared";
import { useEffect, useMemo, useState } from "react";
import { Field } from "@/components/ui/input";
import { Select } from "@/components/ui/misc";
import { useHome } from "@/features/households/home";
import { useMarkers } from "@/features/maps/data";
import { useStoredState } from "@/features/maps/hooks";
import { notify } from "@/lib/notify";
import type { LatLon } from "./data";
import { PlaceSearch } from "./place-search";

export type OriginValue =
  | { kind: "home" }
  | { kind: "here" }
  | { kind: "place"; id: string }
  | { kind: "point"; lat: number; lon: number }
  | { kind: "at"; lat: number; lon: number; name: string };

export const REPEATERS_ORIGIN_KEY = "outpost.repeaters.from";
const isString = (value: unknown): value is string => typeof value === "string" && value.length < 300;

const inRange = (lat: number, lon: number) => Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;

/** The choice written as one string. */
export function originText(value: OriginValue): string {
  switch (value.kind) {
    case "home":
    case "here":
      return value.kind;
    case "place":
      return `place:${value.id}`;
    case "point":
      return `point:${value.lat.toFixed(5)},${value.lon.toFixed(5)}`;
    case "at":
      return `at:${value.lat.toFixed(5)},${value.lon.toFixed(5)}:${value.name.slice(0, 120)}`;
  }
}

/** A string read back as a choice: anything not understood is Home. */
export function parseOrigin(text: string | null | undefined): OriginValue {
  if (!text) return { kind: "home" };
  if (text === "here") return { kind: "here" };
  if (text.startsWith("place:") && text.length > 6) return { kind: "place", id: text.slice(6) };
  const match = /^(point|at):(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)(?::(.+))?$/s.exec(text);
  if (match) {
    const lat = Number(match[2]);
    const lon = Number(match[3]);
    if (inRange(lat, lon)) {
      if (match[1] === "point") return { kind: "point", lat, lon };
      if (match[4]?.trim()) return { kind: "at", lat, lon, name: match[4].trim() };
    }
  }
  return { kind: "home" };
}

/** "a point on the map (51.46, -0.19)": the name of a tapped point, for saying what a distance is from. */
export const pointName = (position: LatLon) => `a point on the map (${formatDecimal(position.lat, position.lon, 2)})`;

/** Whether this page can ask the device where it is: browsers allow it only over HTTPS or on the device itself. */
export const canLocate = () => typeof navigator !== "undefined" && "geolocation" in navigator && window.isSecureContext;

export const LOCATE_NEEDS_HTTPS = "Needs Outpost opened over HTTPS (Settings › HTTPS)";

export interface Origin {
  value: OriginValue;
  /** Null when the place chosen has no position (yet), or Home is not set. */
  position: LatLon | null;
  /** "Home", "Hut by the tarn", "a point on the map (51.46, -0.19)": what the distance is from, for saying so. */
  name: string;
  set(value: OriginValue): void;
  markers: MarkerDto[];
  /** The current household's home, with what it is called; null when it has none. */
  home: { position: LatLon; name: string } | null;
  /** Set while the device is being asked where it is. */
  locating: boolean;
}

/** A choice kept in this browser under `key`, for a screen that keeps it nowhere else. */
export function useStoredOrigin(key: string): [string, (next: string) => void] {
  return useStoredState<string>(key, isString, "home");
}

/**
 * The place, from a choice kept by the caller (`state`). `given` is a position handed in
 * by the address (the map's centre card opens the Compass with one): it stands, as a point
 * on the map, until another is chosen.
 */
export function useOrigin(state: [string, (next: string) => void], given?: LatLon | null): Origin {
  const [stored, setStored] = state;
  const markers = useMarkers();
  const list = markers.data ?? [];
  const current = useHome();
  const [handed, setGiven] = useState<LatLon | null>(given ?? null);
  const value = handed ? ({ kind: "point", ...handed } as const) : parseOrigin(stored);
  const [here, setHere] = useState<LatLon | null>(null);
  const [locating, setLocating] = useState(false);

  const homeAt = current.home;
  const home = useMemo(
    () =>
      homeAt
        ? {
            position: { lat: homeAt.lat, lon: homeAt.lon },
            name: homeAt.kind === "here" ? homeLabel(homeAt, Date.now()) : homeAt.name || "Home",
          }
        : null,
    [homeAt],
  );

  const wantsHere = value.kind === "here";
  useEffect(() => {
    if (!wantsHere || here) return;
    if (!canLocate()) {
      notify.error(`Where this device is cannot be asked here. ${LOCATE_NEEDS_HTTPS}. Measuring from Home instead.`);
      setStored("home");
      return;
    }
    let cancelled = false;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (fix) => {
        if (cancelled) return;
        setHere({ lat: fix.coords.latitude, lon: fix.coords.longitude });
        setLocating(false);
      },
      () => {
        if (cancelled) return;
        notify.error("This device could not say where it is. Measuring from Home instead; choose a saved place or tap the map.");
        setLocating(false);
        setStored("home");
      },
      { enableHighAccuracy: true, maximumAge: 60_000, timeout: 30_000 },
    );
    return () => {
      cancelled = true;
    };
  }, [wantsHere, here, setStored]);

  let position: LatLon | null = null;
  let name = "";
  switch (value.kind) {
    case "home":
      position = home?.position ?? null;
      name = home?.name ?? "Home";
      break;
    case "here":
      position = here;
      name = "where you are";
      break;
    case "place": {
      const marker = list.find((item) => item.id === value.id);
      position = marker ? { lat: marker.lat, lon: marker.lon } : null;
      name = marker?.name ?? "a saved place";
      break;
    }
    case "point":
      position = { lat: value.lat, lon: value.lon };
      name = pointName(position);
      break;
    case "at":
      position = { lat: value.lat, lon: value.lon };
      name = value.name;
      break;
  }

  return {
    value,
    position,
    name,
    set: (next) => {
      setGiven(null);
      if (next.kind === "here") setHere(null);
      setStored(originText(next));
    },
    markers: list,
    home,
    locating,
  };
}

type PickerChoice = "home" | "here" | "place" | "search" | "point" | "at";

/**
 * Where to measure from: Home, where I am now, a saved place, a place found by typing, or
 * a point on the map. `onPoint` is given where the screen has a map to tap; it is called
 * when "A point on the map" is chosen, so a phone can show the map.
 */
export function OriginPicker({
  origin,
  label = "Measure from",
  onPoint,
  className,
}: {
  origin: Origin;
  label?: string;
  onPoint?: () => void;
  className?: string;
}) {
  // "A saved place" and "Search for a place…" need a second step before the place changes.
  const [pending, setPending] = useState<"place" | "search" | "point" | null>(null);
  const { value } = origin;
  const locatable = canLocate();
  const places = useMemo(
    () => [...origin.markers].sort((a, b) => Number(b.isFavorite) - Number(a.isFavorite) || a.name.localeCompare(b.name)).slice(0, 300),
    [origin.markers],
  );
  const shown: PickerChoice = pending ?? (value.kind === "place" ? "place" : value.kind);

  const options: Array<{ value: PickerChoice; label: string; description?: string; disabled?: boolean }> = [
    {
      value: "home",
      label: origin.home ? (origin.home.name === "Home" ? "Home" : `Home: ${origin.home.name}`) : "Home",
      description: origin.home ? undefined : "Not set yet: choose it on the Households page",
    },
    {
      value: "here",
      label: origin.locating ? "Where I am now (finding it)" : "Where I am now",
      description: locatable ? undefined : LOCATE_NEEDS_HTTPS,
      disabled: !locatable,
    },
    {
      value: "place",
      label: "A saved place",
      description: places.length === 0 ? "None saved yet: save one on Maps" : undefined,
      disabled: places.length === 0,
    },
    ...(value.kind === "at" && !pending ? [{ value: "at" as const, label: value.name }] : []),
    { value: "search", label: "Search for a place…" },
    ...(onPoint || value.kind === "point"
      ? [
          {
            value: "point" as const,
            label:
              value.kind === "point" && !pending ? `A point on the map (${formatDecimal(value.lat, value.lon, 2)})` : "A point on the map",
            description: onPoint ? "Tap the map to set it" : undefined,
          },
        ]
      : []),
  ];

  const choose = (next: PickerChoice) => {
    if (next === "home" || next === "here") {
      setPending(null);
      origin.set({ kind: next });
    } else if (next === "at") {
      setPending(null);
    } else if (next === "point") {
      setPending(value.kind === "point" ? null : "point");
      onPoint?.();
    } else if (next === "place") {
      // A saved place already chosen stays until another is.
      setPending(value.kind === "place" ? null : "place");
    } else {
      setPending("search");
    }
  };
  // The map was tapped, or a place found: the step is done.
  const settledAt = value.kind === "point" || value.kind === "at" ? originText(value) : null;
  useEffect(() => {
    if (settledAt) setPending((current) => (current === "point" ? null : current));
  }, [settledAt]);

  return (
    <div className={className ?? "grid gap-3 sm:grid-cols-2"}>
      <Field label={label}>{(ids) => <Select {...ids} value={shown} onChange={choose} options={options} />}</Field>
      {shown === "place" && places.length > 0 ? (
        <Field label="Saved place">
          {(ids) => (
            <Select<string>
              {...ids}
              value={value.kind === "place" ? value.id : undefined}
              placeholder="Choose a place"
              onChange={(id) => {
                setPending(null);
                origin.set({ kind: "place", id });
              }}
              options={places.map((place) => ({ value: place.id, label: place.name || "A saved place" }))}
            />
          )}
        </Field>
      ) : null}
      {shown === "search" ? (
        <PlaceSearch
          label="Place to measure from"
          markers={origin.markers}
          near={origin.home?.position ?? origin.position}
          autoFocus
          onChoose={(place) => {
            setPending(null);
            origin.set({ kind: "at", lat: place.lat, lon: place.lon, name: place.name });
          }}
        />
      ) : null}
      {shown === "point" && pending === "point" ? (
        <p className="self-end pb-2.5 text-small text-ink-muted">Tap the map where you want to measure from.</p>
      ) : null}
    </div>
  );
}
