/**
 * Where, and on which clock: the place every part of the solar clock works for (the current
 * household's home: its saved place, or where a portable household was last said to be, with
 * its age; another saved place; or coordinates typed here) and the clock its answers are
 * written on (this device's zone, or "UTC+n" said by hand). Both are remembered on this
 * device as a preference, nothing more. Saved places come from the server; if it cannot
 * be reached, typed coordinates still work, because nothing else here needs it.
 */
import { formatDecimal, homeLabel, type MarkerDto, parseCoordinates } from "@outpost/shared";
import { useState } from "react";
import { Link } from "react-router";
import { Notice } from "@/components/page";
import { Field, Input } from "@/components/ui/input";
import { Select, Skeleton } from "@/components/ui/misc";
import { HomeAsOf, NoHome, useHome } from "@/features/households/home";
import { useMarkers } from "@/features/maps/data";
import { deviceZone } from "@/features/maps/lib/sun-text";
import { errorMessage } from "@/lib/api";
import { useText } from "../tools/kit";
import { readPref, writePref } from "../tools/kit/device-pref";
import { FIXED_OFFSETS, formatOffset, type ZoneChoice } from "./zone";

export interface ChosenPlace {
  lat: number;
  lon: number;
  /** What it is called: the saved place's name, or the coordinates. */
  name: string;
}

const TYPED = "typed";
/** A portable household's position: home, but not a saved place. */
const HERE = "home-here";
const PLACE_KEY = "solar-clock.place";
const ZONE_KEY = "solar-clock.zone";

export interface PlaceState {
  place: ChosenPlace | null;
  zone: ZoneChoice;
  picker: React.ReactNode;
}

/** The place and the clock, and the controls that choose them. */
export function usePlaceAndZone(): PlaceState {
  const markers = useMarkers();
  const current = useHome();
  const [key, setKeyState] = useState<string | null>(() => readPref(PLACE_KEY));
  const setKey = (next: string) => {
    setKeyState(next);
    writePref(PLACE_KEY, next);
  };
  const [typed, setTyped] = useText("solar-clock.typed", "");
  const [zoneKey, setZoneKeyState] = useState<string>(() => readPref(ZONE_KEY) ?? "device");
  const setZoneKey = (next: string) => {
    setZoneKeyState(next);
    writePref(ZONE_KEY, next);
  };

  const list: MarkerDto[] = markers.data ?? [];
  // The current household's home: a saved place, or a portable household's position.
  const here = current.home?.kind === "here" ? current.home : null;
  const homeId = current.home?.kind === "place" ? current.home.id : null;
  const home = homeId ? (list.find((marker) => marker.id === homeId) ?? null) : null;
  const saved = [...list].sort((a, b) => (a.id === home?.id ? -1 : b.id === home?.id ? 1 : a.name.localeCompare(b.name)));
  // What was chosen last time, if it is still there; else home, else the first saved place, else typing.
  const known = key === TYPED || (key === HERE && here !== null) || saved.some((marker) => `marker:${marker.id}` === key);
  const chosen = known ? (key as string) : home ? `marker:${home.id}` : here ? HERE : saved[0] ? `marker:${saved[0].id}` : TYPED;
  const usingTyped = chosen === TYPED || (markers.isError && chosen !== HERE);
  const typedPoint = typed.trim() ? parseCoordinates(typed) : null;
  const marker = usingTyped ? undefined : saved.find((each) => `marker:${each.id}` === chosen);
  const usingHere = !usingTyped && chosen === HERE && here !== null;

  const place: ChosenPlace | null = marker
    ? { lat: marker.lat, lon: marker.lon, name: marker.name || "Unnamed place" }
    : usingHere && here
      ? { lat: here.lat, lon: here.lon, name: here.name }
      : usingTyped && typedPoint
        ? { lat: typedPoint.lat, lon: typedPoint.lon, name: formatDecimal(typedPoint.lat, typedPoint.lon, 4) }
        : null;

  const device = deviceZone();
  const zone: ZoneChoice =
    zoneKey.startsWith("fixed:") && Number.isFinite(Number(zoneKey.slice(6)))
      ? { kind: "fixed", minutes: Number(zoneKey.slice(6)) }
      : { kind: "device", zone: device };

  const typedError =
    typed.trim() && !typedPoint ? "Not a position Outpost reads. Try 51.4779, -0.0015, or TQ 38900 77400, or IO91xl." : undefined;

  const picker = (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2">
      <div className="grid min-w-0 gap-3">
        {markers.isPending ? (
          <div className="grid gap-1.5">
            <span className="text-small font-medium text-ink">Place</span>
            <Skeleton className="h-9 max-md:h-11" aria-label="Loading saved places" />
          </div>
        ) : markers.isError ? (
          <Notice tone="warning" title="Saved places could not be read">
            {errorMessage(markers.error)} Type the coordinates instead: nothing else here needs the server.{" "}
            <button type="button" onClick={() => markers.refetch()} className="font-medium underline underline-offset-2">
              Try again
            </button>
          </Notice>
        ) : (
          <Field label="Place" hint={saved.length === 0 ? undefined : "A saved place from the map, or coordinates typed here."}>
            {(ids) => (
              <Select
                id={ids.id}
                aria-describedby={ids["aria-describedby"]}
                value={chosen}
                onChange={setKey}
                options={[
                  ...(here ? [{ value: HERE, label: homeLabel(here, Date.now()) }] : []),
                  ...saved.map((each) => ({
                    value: `marker:${each.id}`,
                    label:
                      each.id === home?.id && each.name.trim().toLowerCase() !== "home"
                        ? `Home: ${each.name || "Unnamed place"}`
                        : each.name || "Unnamed place",
                  })),
                  { value: TYPED, label: "Coordinates typed here" },
                ]}
              />
            )}
          </Field>
        )}
        {!markers.isPending && !markers.isError && !current.isPending && !home && !here ? <NoHome /> : null}
        {usingHere ? <HomeAsOf home={here} /> : null}
        {usingTyped ? (
          <Field
            label="Coordinates"
            error={typedError}
            hint={!typedError ? "Decimal degrees, degrees and minutes, a British grid reference or a Maidenhead locator." : undefined}
          >
            {(ids) => (
              <Input
                {...ids}
                type="text"
                autoComplete="off"
                spellCheck={false}
                placeholder="51.4779, -0.0015"
                value={typed}
                onChange={(event) => setTyped(event.target.value)}
                className="font-mono"
              />
            )}
          </Field>
        ) : null}
        {place ? <p className="font-mono text-small text-ink-muted">{formatDecimal(place.lat, place.lon, 4)}</p> : null}
      </div>
      <Field
        label="Clocks here keep"
        hint={
          zone.kind === "device"
            ? "This device's time zone, with summer time from its own zone data."
            : "A fixed offset from UTC: include summer time in it if the clocks are on summer time."
        }
      >
        {(ids) => (
          <Select
            id={ids.id}
            aria-describedby={ids["aria-describedby"]}
            value={zone.kind === "device" ? "device" : `fixed:${zone.minutes}`}
            onChange={setZoneKey}
            options={[
              { value: "device", label: `This device's zone (${device.replace(/_/g, " ")})` },
              ...FIXED_OFFSETS.map((minutes) => ({ value: `fixed:${minutes}`, label: `${formatOffset(minutes)}, set by hand` })),
            ]}
          />
        )}
      </Field>
    </div>
  );

  return { place, zone, picker };
}

/** Said where a part needs a place and has none yet. */
export function NoPlaceYet() {
  return (
    <p className="text-body text-ink-muted">
      Choose a place above, or type its coordinates, to work this out. To use your home, mark it on{" "}
      <Link to="/maps" className="text-primary underline underline-offset-2">
        Maps
      </Link>{" "}
      with the home icon, or choose it on the{" "}
      <Link to="/prepare/households" className="text-primary underline underline-offset-2">
        Households
      </Link>{" "}
      page.
    </p>
  );
}
