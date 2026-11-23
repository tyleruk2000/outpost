/**
 * Peak sun hours from Weather and hazards, for a place the person chooses: one of that
 * screen's places, one of their saved places, or a position they type. Where figures
 * are already held for the place (`kept[kind="solar"]` of `GET /api/weather`) they are
 * used as they are. Where none are, a press of its own fetches them: through the weather
 * module's one route that contacts the publishers, so the place joins that screen's list
 * and the copy is kept, counted and removed there like any other. Nothing is fetched
 * without that press, and what is sent is said beside the button. Figures go into the
 * plan only on a press, and figures already typed are replaced only after asking. The
 * plan records where they came from (`sunHoursSource`), so that the PDF says so.
 */
import {
  ageWords,
  type HouseholdHome,
  homeLabel,
  type KeptCopy,
  type MarkerDto,
  type PowerSunSource,
  parseCoordinates,
  type SolarData,
  type UpdateResponse,
  type WeatherPlace,
  type WeatherResponse,
} from "@outpost/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CloudSun, Download } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/misc";
import { useHome } from "@/features/households/home";
import { api, errorMessage } from "@/lib/api";

type Tilt = PowerSunSource["tilt"];

/** Under the weather screen's own key, so that a fetch there refreshes this. */
const useWeatherCache = () => useQuery({ queryKey: ["weather", "cache"], queryFn: () => api.get<WeatherResponse>("/api/weather") });

/** A place with a solar copy, and the copy. */
interface Offer {
  place: WeatherPlace;
  copy: KeptCopy<"solar">;
}

/** The twelve figures and the record of where they came from, for one place and tilt. */
export function fillFrom(offer: Offer, tilt: Tilt, now: number): { sunHours: Array<number | null>; source: PowerSunSource } {
  const data: SolarData = offer.copy.data;
  const series = tilt === "optimal" ? data.optimal : data.level;
  return {
    sunHours: Array.from({ length: 12 }, (_, month) => {
      const value = series[month];
      return value === null || value === undefined ? null : Math.round(value * 100) / 100;
    }),
    source: {
      kind: "pvgis",
      attribution: "PVGIS © European Communities, 2001-2026",
      place: offer.place.name,
      lat: offer.place.lat,
      lon: offer.place.lon,
      tilt,
      slope: tilt === "optimal" ? data.optimalSlope : null,
      firstYear: data.firstYear,
      lastYear: data.lastYear,
      databases: data.databases,
      fetchedAt: offer.copy.fetchedAt,
      filledAt: now,
      edited: false,
    },
  };
}

/** Saved places, under the Maps screen's own key, so that a place saved there is offered here. */
const useSavedPlaces = () =>
  useQuery({
    queryKey: ["maps", "markers"],
    queryFn: () => api.get<{ markers: MarkerDto[] }>("/api/maps/markers"),
    select: (data) => data.markers,
  });

/** Somewhere a person can choose: a place of the weather screen's, with its sun figures if it holds any, or a saved place not yet in that list. */
export interface SunChoice {
  key: string;
  name: string;
  lat: number;
  lon: number;
  /** The weather place, when it is one already. */
  placeId: string | null;
  /** The saved place to add to the weather list, when it is not. */
  markerId: string | null;
  isHome: boolean;
  copy: KeptCopy<"solar"> | null;
}

/** "Somewhere else": a position typed here. */
export const ELSEWHERE = "elsewhere";

/**
 * Every place offered, those with figures first, home first among them, then the weather
 * list's order, then saved places. `home` is the current household's home (left out: the
 * saved place with the home icon); a portable household's position is offered as a place
 * of its own, named with its age.
 */
export function choicesOf(
  weather: WeatherResponse | undefined,
  markers: MarkerDto[] | undefined,
  home?: HouseholdHome | null,
  now = Date.now(),
): SunChoice[] {
  if (!weather) return [];
  const places: SunChoice[] = weather.places.map((place) => ({
    key: `place:${place.id}`,
    name: place.name,
    lat: place.lat,
    lon: place.lon,
    placeId: place.id,
    markerId: place.markerId,
    isHome: place.isHome,
    copy: (weather.kept.find((each) => each.kind === "solar" && each.placeId === place.id) as KeptCopy<"solar"> | undefined) ?? null,
  }));
  const listed = new Set(weather.places.map((place) => place.markerId).filter((id) => id !== null));
  const saved: SunChoice[] = (markers ?? [])
    .filter((marker) => !listed.has(marker.id))
    .map((marker) => ({
      key: `marker:${marker.id}`,
      name: marker.name,
      lat: marker.lat,
      lon: marker.lon,
      placeId: null,
      markerId: marker.id,
      isHome: home === undefined ? marker.icon === "home" : home?.kind === "place" && home.id === marker.id,
      copy: null,
    }));
  if (home?.kind === "here")
    saved.push({
      key: "household-here",
      name: homeLabel(home, now),
      lat: home.lat,
      lon: home.lon,
      placeId: null,
      markerId: null,
      isHome: true,
      copy: null,
    });
  const rank = (choice: SunChoice) => (choice.copy ? 0 : 2) + (choice.isHome ? 0 : 1);
  return [...places.sort((a, b) => rank(a) - rank(b)), ...saved.sort((a, b) => Number(b.isHome) - Number(a.isHome))];
}

export function SunFromWeather({
  sunHours,
  source,
  onFill,
}: {
  sunHours: Array<number | null>;
  source: PowerSunSource | null | undefined;
  onFill: (sunHours: Array<number | null>, source: PowerSunSource) => void;
}) {
  const client = useQueryClient();
  const weather = useWeatherCache();
  const markers = useSavedPlaces();
  const current = useHome();
  const choices = choicesOf(weather.data, markers.data, current.isPending ? undefined : current.home);
  const [chosen, setChosen] = useState<string | undefined>(undefined);
  const [where, setWhere] = useState("");
  const [tilt, setTilt] = useState<Tilt>("optimal");
  const [asking, setAsking] = useState(false);
  const pvgis = weather.data?.sources.find((each) => each.id === "pvgis");

  /** Adds the place to the weather list if it is not in it, then asks PVGIS about it: the press that fetches. */
  const fetchFigures = useMutation({
    mutationFn: async (target: { placeId: string | null; markerId: string | null; name: string; lat: number; lon: number }) => {
      let placeId = target.placeId;
      if (!placeId) {
        const added = await api.post<{ place: WeatherPlace }>(
          "/api/weather/places",
          target.markerId ? { markerId: target.markerId } : { name: target.name, lat: target.lat, lon: target.lon },
        );
        placeId = added.place.id;
      }
      const answer = await api.post<UpdateResponse>("/api/weather/update", { kinds: ["solar"], placeIds: [placeId] });
      const failed = answer.outcomes.find((outcome) => !outcome.ok);
      if (failed || answer.outcomes.length === 0) {
        // The place is in the weather list all the same: choose it, so that pressing again asks about it and adds nothing twice.
        setChosen(`place:${placeId}`);
        throw new Error(failed?.message ?? "PVGIS gave no figures for this place.");
      }
      return placeId;
    },
    onSuccess: (placeId) => setChosen(`place:${placeId}`),
    onSettled: () => void client.invalidateQueries({ queryKey: ["weather"] }),
  });

  if (weather.isPending) return null;
  if (weather.isError)
    return (
      <p className="mb-3 text-small text-ink-muted">
        What Weather and hazards keeps could not be read just now, so its figures are not offered.
      </p>
    );

  const key = chosen ?? choices[0]?.key ?? ELSEWHERE;
  const choice = choices.find((each) => each.key === key);
  const elsewhere = key === ELSEWHERE || !choice;
  const typedPlace = elsewhere && where.trim() ? parseCoordinates(where) : null;
  const target = choice
    ? { placeId: choice.placeId, markerId: choice.markerId, name: choice.name, lat: choice.lat, lon: choice.lon }
    : typedPlace
      ? {
          placeId: null,
          markerId: null,
          name: `Solar panels, ${typedPlace.lat.toFixed(2)}, ${typedPlace.lon.toFixed(2)}`,
          lat: typedPlace.lat,
          lon: typedPlace.lon,
        }
      : null;
  const copy = choice?.copy ?? null;
  const now = weather.data?.now ?? Date.now();
  const typed = sunHours.some((value) => value !== null) && (!source || source.edited);
  const fill = () => {
    if (!choice || !copy) return;
    const offer: Offer = { place: weather.data!.places.find((place) => place.id === choice.placeId)!, copy };
    const { sunHours: figures, source: from } = fillFrom(offer, tilt, Date.now());
    onFill(figures, pvgis?.attribution ? { ...from, attribution: pvgis.attribution } : from);
  };
  const called = choice ? choice.name : target ? `${target.lat.toFixed(2)}, ${target.lon.toFixed(2)}` : "this place";

  return (
    <div className="mb-4 grid max-w-[70ch] grid-cols-[minmax(0,1fr)] gap-3 border-y border-border py-3">
      <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Select<string>
          aria-label="Where the panels are"
          value={key}
          onChange={(value) => {
            setChosen(value);
            fetchFigures.reset();
          }}
          options={[
            ...choices.map((each) => ({
              value: each.key,
              label: each.isHome ? `${each.name} (home)` : each.name,
              description: each.copy ? "Sun figures held" : each.placeId ? "No sun figures yet" : "A saved place: no sun figures yet",
            })),
            { value: ELSEWHERE, label: "Somewhere else", description: "Type coordinates, a grid reference or a locator" },
          ]}
        />
        {copy ? (
          <Select<Tilt>
            aria-label="Panels"
            value={tilt}
            onChange={setTilt}
            options={[
              {
                value: "optimal",
                label: `Facing south at ${copy.data.optimalSlope === null ? "the best tilt" : `${copy.data.optimalSlope}°, the best tilt`}`,
              },
              { value: "level", label: "Lying flat (level ground)" },
            ]}
          />
        ) : null}
      </div>
      {elsewhere ? (
        <div className="grid gap-1.5">
          <Input
            aria-label="Where the panels are: coordinates, a grid reference or a locator"
            value={where}
            onChange={(event) => {
              setWhere(event.target.value);
              fetchFigures.reset();
            }}
            placeholder="51.5074, -0.1278"
            autoComplete="off"
            spellCheck={false}
            className="font-mono"
          />
          {where.trim() && !typedPlace ? (
            <p className="text-small text-danger">
              That is not a position Outpost can read. Type coordinates, a grid reference or a locator.
            </p>
          ) : null}
        </div>
      ) : null}
      {choice && copy ? (
        <>
          <p className="text-small text-ink-muted">
            PVGIS's figures (European Commission Joint Research Centre) for {choice.name}, {choice.lat.toFixed(2)}, {choice.lon.toFixed(2)},
            averaged over {copy.data.firstYear} to {copy.data.lastYear} from {copy.data.databases}; fetched by Weather and hazards{" "}
            {Math.max(0, now - copy.fetchedAt) < 60_000 ? "just now" : `${ageWords(Math.max(0, now - copy.fetchedAt))} ago`}. Panels at
            another angle or facing elsewhere get a different figure; shading is not counted.
          </p>
          <div>
            <Button onClick={() => (typed ? setAsking(true) : fill())}>
              <CloudSun aria-hidden /> Fill in from Weather and hazards
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="text-small text-ink-muted">
            {target ? `No sun figures are held for ${called} yet. ` : "Say where the panels are. "}
            Fetching them asks PVGIS ({pvgis?.publisher ?? "European Commission Joint Research Centre"}
            {pvgis?.host ? `, ${pvgis.host}` : ""}) once, over the internet, sending only the place's latitude and longitude rounded to two
            decimal places; the answer is a few kilobytes and is kept. PVGIS covers {pvgis?.covers ?? "most of the world."}{" "}
            {choice?.placeId ? "" : "The place is added to the list on Weather and hazards, where the copy can be seen and removed."}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Button disabled={!target} loading={fetchFigures.isPending} onClick={() => target && fetchFigures.mutate(target)}>
              <Download aria-hidden /> Fetch sun hours for {called}
            </Button>
            <Link
              to="/prepare/weather?view=climate"
              className="inline-flex min-h-11 items-center text-small text-primary underline underline-offset-2 md:min-h-6 md:pointer-coarse:min-h-11"
            >
              Open Weather and hazards
            </Link>
          </div>
          {fetchFigures.isError ? (
            <p role="alert" className="text-small text-danger">
              The figures were not fetched. {errorMessage(fetchFigures.error)}
            </p>
          ) : null}
        </>
      )}
      <ConfirmDialog
        open={asking}
        onOpenChange={setAsking}
        title="Replace the figures typed in?"
        description={`The twelve months will be set to PVGIS's figures for ${called}. The figures there now will go.`}
        confirmLabel="Replace them"
        confirmVariant="primary"
        onConfirm={() => {
          fill();
          setAsking(false);
        }}
      />
    </div>
  );
}
