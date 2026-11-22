/**
 * The place distances and bearings are measured from: a saved place, the middle of the
 * map as it was last left, where the device is, or a position or locator typed in. Until
 * one is chosen it is the current household's home (its saved place, or where a portable
 * household was last said to be, named with its age), if it has one. The choice is
 * remembered in this browser.
 */
import { type HouseholdHome, homeLabel, type MarkerDto, parseCoordinateReadings } from "@outpost/shared";
import { useEffect, useMemo, useState } from "react";
import { Field, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/misc";
import { useHome } from "@/features/households/home";
import { useMarkers } from "@/features/maps/data";
import { useStoredState } from "@/features/maps/hooks";
import { type CameraView, isCameraView, readStored, STORAGE_KEYS } from "@/features/maps/lib/view";
import { notify } from "@/lib/notify";
import type { LatLon } from "./data";

/** "none", "map", "here", "typed", "household-here" (a portable household's position), "place:" and the id of a saved place, or "home" before anything is chosen. */
type OriginChoice = string;

const KEY = "outpost.repeaters.from";
const TYPED_KEY = "outpost.repeaters.fromTyped";
const isString = (value: unknown): value is string => typeof value === "string" && value.length < 200;

export interface Origin {
  /** Null when no place is chosen, or the one chosen cannot be found yet. */
  position: LatLon | null;
  /** "the middle of the map", "Hut by the tarn": what the distance is from, for saying so. */
  name: string;
  choice: OriginChoice;
  setChoice(choice: OriginChoice): void;
  typed: string;
  setTyped(text: string): void;
  /** What is wrong with what was typed, if anything. */
  typedProblem: string | null;
  markers: MarkerDto[];
  /** The current household's position when it is portable and has one: offered as a choice. */
  homeHere: HouseholdHome | null;
  /** Set while the device is being asked where it is. */
  locating: boolean;
}

/** The middle of the map as the Maps screen last left it, if it has ever been opened in this browser. */
export const lastMapCentre = (): LatLon | null => {
  const view = readStored<CameraView | null>(STORAGE_KEYS.view, (value): value is CameraView => isCameraView(value), null);
  return view ? { lat: view.lat, lon: view.lon } : null;
};

/**
 * `keys` names where this browser remembers the choice, so that another screen (Tools →
 * Compass) can use the same chooser and remember its own.
 */
export function useOrigin(initial?: LatLon | null, keys: { choice: string; typed: string } = { choice: KEY, typed: TYPED_KEY }): Origin {
  const markers = useMarkers();
  const [stored, setChoice] = useStoredState<OriginChoice>(keys.choice, isString, "home");
  const [typed, setTyped] = useStoredState(keys.typed, isString, "");
  const list = markers.data ?? [];
  const current = useHome();
  const homeHere = current.home?.kind === "here" ? current.home : null;
  const homeId = current.home?.kind === "place" ? current.home.id : null;
  const home = homeId ? list.find((item) => item.id === homeId) : undefined;
  const choice = stored === "home" ? (home ? `place:${home.id}` : homeHere ? "household-here" : "none") : stored;
  const [here, setHere] = useState<LatLon | null>(null);
  const [locating, setLocating] = useState(false);
  /** A place handed in by the address (the map's "open the list" link): it stands until another is chosen. */
  const [given, setGiven] = useState<LatLon | null>(initial ?? null);

  useEffect(() => {
    if (choice !== "here" || given || here) return;
    if (!("geolocation" in navigator) || !window.isSecureContext) {
      notify.error(
        "Browsers only share a device's location with pages opened over HTTPS or on the device itself. Turn on Settings → HTTPS on your network, then open Outpost at its https address.",
      );
      setChoice("none");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (fix) => {
        setHere({ lat: fix.coords.latitude, lon: fix.coords.longitude });
        setLocating(false);
      },
      () => {
        notify.error("This device could not say where it is. Choose a saved place, or type a position or a locator.");
        setLocating(false);
        setChoice("none");
      },
      { enableHighAccuracy: true, maximumAge: 60_000, timeout: 30_000 },
    );
  }, [choice, given, here, setChoice]);

  const reading = useMemo(() => (typed.trim() ? (parseCoordinateReadings(typed)[0] ?? null) : null), [typed]);
  const marker = choice.startsWith("place:") ? list.find((item) => item.id === choice.slice(6)) : undefined;

  let position: LatLon | null = null;
  let name = "";
  if (given) {
    position = given;
    name = "the middle of the map";
  } else if (choice === "map") {
    position = lastMapCentre();
    name = "the middle of the map";
  } else if (choice === "here") {
    position = here;
    name = "where you are";
  } else if (choice === "typed") {
    position = reading ? { lat: reading.lat, lon: reading.lon } : null;
    name = reading?.locator ?? typed.trim();
  } else if (choice === "household-here" && homeHere) {
    position = { lat: homeHere.lat, lon: homeHere.lon };
    name = homeLabel(homeHere, Date.now());
  } else if (marker) {
    position = { lat: marker.lat, lon: marker.lon };
    name = marker.name;
  }

  return {
    position,
    name,
    choice: given ? "map" : choice,
    setChoice: (next) => {
      setGiven(null);
      if (next === "here") setHere(null);
      setChoice(next);
    },
    typed,
    setTyped,
    typedProblem: choice === "typed" && typed.trim() && !reading ? "Not a position or a locator. Try 54.46, -3.09 or IO84KM." : null,
    markers: list,
    homeHere,
    locating,
  };
}

/** The control that chooses the place, with a box for a typed position when that is the choice. */
export function OriginPicker({ origin, label = "Distance from" }: { origin: Origin; label?: string }) {
  const places = [...origin.markers]
    .sort((a, b) => Number(b.isFavorite) - Number(a.isFavorite) || a.name.localeCompare(b.name))
    .slice(0, 200);
  const options = [
    { value: "none", label: "No place" },
    { value: "map", label: "The middle of the map" },
    { value: "here", label: origin.locating ? "Where I am (finding it)" : "Where I am" },
    { value: "typed", label: "A position or locator" },
    ...(origin.homeHere ? [{ value: "household-here", label: homeLabel(origin.homeHere, Date.now()) }] : []),
    ...places.map((place) => ({ value: `place:${place.id}`, label: place.name })),
  ];
  // A saved place that has since been deleted shows as no place rather than as a blank.
  const value = options.some((option) => option.value === origin.choice) ? origin.choice : "none";
  return (
    <>
      <Field label={label}>{(ids) => <Select {...ids} value={value} onChange={origin.setChoice} options={options} />}</Field>
      {origin.choice === "typed" ? (
        <Field label="Position or locator" error={origin.typedProblem ?? undefined} className="col-span-2 lg:col-span-1">
          {(ids) => (
            <Input
              {...ids}
              value={origin.typed}
              onChange={(event) => origin.setTyped(event.target.value)}
              placeholder="IO84KM or 54.46, -3.09"
              autoComplete="off"
              spellCheck={false}
              className="font-mono text-small"
            />
          )}
        </Field>
      ) : null}
    </>
  );
}
