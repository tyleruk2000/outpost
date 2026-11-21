/**
 * Weather and hazards, under Preparedness: a cache with its age always in view.
 *
 * Nothing here is fetched by itself. "Update now" asks the publishers for the places in
 * the list; a person may tick "also update when I open this screen", which is off until
 * they do, and then each opening of this screen is one such press. Everything shown
 * says when it was fetched and what it covers, and says so in words when it is old or
 * has run out. Views are chosen by `?view=` so that each has an address.
 */
import { type KeptCopy, LIVE_KINDS, type UpdateOutcome, type WeatherKind } from "@outpost/shared";
import { RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { toast } from "sonner";
import { EmptyState, ErrorState, Notice, Page, PageHeader } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Checkbox, Segmented, Select, Skeleton, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/misc";
import { errorMessage } from "@/lib/api";
import { notify } from "@/lib/notify";
import { plural } from "@/lib/utils";
import { AlertsView } from "./alerts-view";
import { BarometerView } from "./barometer-view";
import { ClimateView } from "./climate-view";
import { useSetUpdateOnOpen, useUpdate, useWeather } from "./data";
import { ForecastView } from "./forecast-view";
import { FloodView, WarningsView } from "./hazards-view";
import { KeptView } from "./kept-view";
import { PlacesView } from "./places-view";
import { RiversView } from "./rivers-view";
import type { TempUnit, WindUnit } from "./words";

const VIEWS = ["forecast", "warnings", "world", "flood", "rivers", "climate", "barometer", "places", "kept"] as const;
type View = (typeof VIEWS)[number];
const WIND_KEY = "outpost.weather.wind";
const TEMP_KEY = "outpost.weather.temp";

/** A per-device preference: kept in the browser, wrapped because storage may be refused. */
function preference<T extends string>(key: string, allowed: readonly T[], fallback: T): [T, (next: T) => void] {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(key);
  } catch {
    // Not kept on this device; the default stands.
  }
  const value = allowed.includes(stored as T) ? (stored as T) : fallback;
  return [
    value,
    (next) => {
      try {
        localStorage.setItem(key, next);
      } catch {
        // As above.
      }
    },
  ];
}

const KIND_WORDS: Record<WeatherKind, string> = {
  forecast: "the forecast",
  warnings: "the UK's warnings",
  flood: "flood warnings",
  rivers: "river and sea levels",
  "river-readings": "a station's readings",
  climate: "climate averages",
  solar: "sunshine figures",
  gdacs: "GDACS's disasters worldwide",
  quakes: "the USGS's earthquakes",
  meteoalarm: "MeteoAlarm's warnings",
  nws: "the National Weather Service's alerts",
  "space-weather": "today's space weather",
};

function outcomeSentence(outcome: UpdateOutcome): string {
  return `${KIND_WORDS[outcome.kind][0]!.toUpperCase()}${KIND_WORDS[outcome.kind].slice(1)}${outcome.placeName ? ` for ${outcome.placeName}` : ""}: ${outcome.message}`;
}

export default function WeatherPage() {
  const [params, setParams] = useSearchParams();
  const asked = params.get("view");
  const view: View = VIEWS.includes(asked as View) ? (asked as View) : "forecast";
  const weather = useWeather();
  const update = useUpdate();
  const setOnOpen = useSetUpdateOnOpen();
  const [failures, setFailures] = useState<UpdateOutcome[]>([]);
  const [chosenPlace, setChosenPlace] = useState<string | null>(null);
  const [wind, setWindState] = useState<WindUnit>(() => preference<WindUnit>(WIND_KEY, ["kmh", "mph"], "kmh")[0]);
  const [temp, setTempState] = useState<TempUnit>(() => preference<TempUnit>(TEMP_KEY, ["c", "f"], "c")[0]);
  const openedOnce = useRef(false);

  const setView = (next: string) =>
    setParams(
      (current) => {
        const copy = new URLSearchParams(current);
        if (next === "forecast") copy.delete("view");
        else copy.set("view", next);
        copy.delete("station");
        return copy;
      },
      { replace: true },
    );

  const runUpdate = (kinds: WeatherKind[], placeIds?: string[]) =>
    update.mutate(
      { kinds, placeIds },
      {
        onSuccess: ({ outcomes }) => {
          const failed = outcomes.filter((outcome) => !outcome.ok);
          setFailures(failed);
          const done = outcomes.length - failed.length;
          if (failed.length === 0) toast.success(`Updated: ${plural(done, "copy", "copies")} fetched.`);
          else if (done > 0)
            toast.message(`${plural(done, "copy", "copies")} fetched; ${failed.length} could not be. What was kept before is still kept.`);
        },
        onError: (error) => notify.error(errorMessage(error)),
      },
    );

  const places = weather.data?.places ?? [];
  const liveKinds = places.length > 0 ? LIVE_KINDS : (["warnings"] as WeatherKind[]);

  // The one fetch not from a button: with the tick on, opening this screen is the press. Once per visit.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs once, when the cache has first arrived
  useEffect(() => {
    if (!weather.data || openedOnce.current) return;
    openedOnce.current = true;
    if (weather.data.updateOnOpen) runUpdate(weather.data.places.length > 0 ? LIVE_KINDS : ["warnings"]);
  }, [weather.data]);

  const noPlace = places.length === 0 && view !== "places" && view !== "barometer" && view !== "warnings" && view !== "world";
  const place =
    places.find((candidate) => candidate.id === chosenPlace) ?? places.find((candidate) => candidate.isHome) ?? places[0] ?? null;
  const kept = weather.data?.kept ?? [];
  const now = Date.now();
  const copyOf = <K extends WeatherKind>(kind: K, placeId: string | null) =>
    (kept.find((copy) => copy.kind === kind && copy.placeId === placeId) as KeptCopy<K> | undefined) ?? null;
  const source = (kind: WeatherKind) => weather.data?.sources.find((candidate) => candidate.kind === kind);

  return (
    <Page width="wide">
      <PageHeader
        title="Weather and hazards"
        description="Forecasts, warnings, flood warnings and river levels fetched when you press, and kept here for when there is no connection. Each says how old it is."
        actions={
          <Button size="lg" variant="primary" loading={update.isPending} onClick={() => runUpdate(liveKinds)} disabled={!weather.data}>
            <RefreshCw />
            Update now
          </Button>
        }
      />

      {weather.isPending ? (
        <div className="grid gap-3" role="status" aria-label="Loading weather">
          <Skeleton className="h-9 w-full max-w-md" />
          {[0, 1, 2].map((row) => (
            <Skeleton key={row} className="h-16" />
          ))}
        </div>
      ) : weather.isError ? (
        <ErrorState error={weather.error} onRetry={() => void weather.refetch()} />
      ) : (
        <>
          <div className="mb-6 grid gap-3">
            <div className="max-w-[70ch] text-small text-ink">
              <label htmlFor="on-open" className="flex min-h-11 cursor-pointer items-center gap-3">
                <Checkbox
                  checked={weather.data.updateOnOpen}
                  onCheckedChange={(checked) => setOnOpen.mutate(checked === true)}
                  id="on-open"
                  aria-describedby="on-open-hint"
                />
                Also update when I open this screen
              </label>
              <span id="on-open-hint" className="block pl-[calc(1.125rem+0.75rem)] text-ink-muted">
                Off unless ticked. When ticked, every opening of this screen, on any device, asks the publishers listed under Kept and
                sources, as Update now does.
              </span>
            </div>
            {failures.length > 0 ? (
              <Notice tone="warning" title="Not everything could be updated">
                <ul className="grid gap-0.5">
                  {failures.map((outcome) => (
                    <li key={`${outcome.kind}-${outcome.placeId}`}>{outcomeSentence(outcome)}</li>
                  ))}
                </ul>
                <p className="mt-1">What was kept before is still kept, with its age.</p>
              </Notice>
            ) : null}
          </div>

          {noPlace ? (
            <EmptyState
              seed={11}
              title="Choose a place for forecasts"
              action={
                <Button variant="primary" onClick={() => setView("places")}>
                  Choose a place
                </Button>
              }
            >
              Forecasts and flood data are fetched for saved places you choose. The UK's warnings and the barometer need no place.
            </EmptyState>
          ) : null}

          <div className={`mb-4 flex flex-wrap items-end gap-3${noPlace ? " mt-6" : ""}`}>
            {places.length > 1 ? (
              <div className="grid w-full gap-1.5 sm:w-64">
                <span className="text-small font-medium text-ink">Place</span>
                <Select
                  aria-label="Place"
                  value={place?.id}
                  onChange={setChosenPlace}
                  options={places.map((candidate) => ({
                    value: candidate.id,
                    label: candidate.isHome ? `${candidate.name} (home)` : candidate.name,
                  }))}
                />
              </div>
            ) : null}
            <Segmented
              label="Wind speed in"
              value={wind}
              onChange={(next) => {
                setWindState(next);
                preference<WindUnit>(WIND_KEY, ["kmh", "mph"], "kmh")[1](next);
              }}
              options={[
                { value: "kmh", label: "km/h" },
                { value: "mph", label: "mph" },
              ]}
            />
            <Segmented
              label="Temperature in"
              value={temp}
              onChange={(next) => {
                setTempState(next);
                preference<TempUnit>(TEMP_KEY, ["c", "f"], "c")[1](next);
              }}
              options={[
                { value: "c", label: "°C" },
                { value: "f", label: "°F" },
              ]}
            />
          </div>

          <Tabs value={view} onValueChange={setView}>
            {/* What is opened most first: what the weather will do and what is warned of, then levels and the barometer
                read on the day; the climate of the months, the places and the sources after. On a phone the names wrap
                to two lines, and the first holds the first three or four. */}
            <TabsList className="mb-6" aria-label="Weather and hazards">
              <TabsTrigger value="forecast">Forecast</TabsTrigger>
              <TabsTrigger value="warnings">Warnings</TabsTrigger>
              <TabsTrigger value="world">Worldwide</TabsTrigger>
              <TabsTrigger value="flood">Flood</TabsTrigger>
              <TabsTrigger value="rivers">River and sea levels</TabsTrigger>
              <TabsTrigger value="barometer">Barometer</TabsTrigger>
              <TabsTrigger value="climate">Climate</TabsTrigger>
              <TabsTrigger value="places">Places</TabsTrigger>
              <TabsTrigger value="kept">Kept and sources</TabsTrigger>
            </TabsList>
            <TabsContent value="forecast">
              {place ? (
                copyOf("forecast", place.id) ? (
                  <ForecastView copy={copyOf("forecast", place.id)!} source={source("forecast")} now={now} wind={wind} temp={temp} />
                ) : (
                  <p className="text-body text-ink-muted">
                    No forecast has been fetched for {place.name} yet. Press Update now when there is a connection.
                  </p>
                )
              ) : null}
            </TabsContent>
            <TabsContent value="warnings">
              <WarningsView copy={copyOf("warnings", null)} place={place} source={source("warnings")} now={now} />
            </TabsContent>
            <TabsContent value="world">
              <AlertsView
                plan={weather.data.alerts ?? { home: null, country: null, countryName: null, national: null }}
                copyOf={(kind) => copyOf(kind, null)}
                sources={weather.data.sources}
                now={now}
                fetching={update.isPending}
                onFetch={(kinds) => runUpdate(kinds)}
              />
            </TabsContent>
            <TabsContent value="flood">
              {place ? <FloodView copy={copyOf("flood", place.id)} source={source("flood")} now={now} /> : null}
            </TabsContent>
            <TabsContent value="rivers">
              {place ? (
                <RiversView
                  place={place}
                  copy={copyOf("rivers", place.id)}
                  history={copyOf("river-readings", place.id)}
                  source={source("rivers")}
                  now={now}
                  riversKm={weather.data.riversKm}
                  fetching={update.isPending}
                  onFetch={() => runUpdate(["rivers"], [place.id])}
                  stationId={params.get("station")}
                />
              ) : null}
            </TabsContent>
            <TabsContent value="climate">
              {place ? (
                <ClimateView
                  climate={copyOf("climate", place.id)}
                  solar={copyOf("solar", place.id)}
                  sources={weather.data.sources}
                  now={now}
                  temp={temp}
                  fetching={update.isPending}
                  onFetch={() => runUpdate(["climate", "solar"], [place.id])}
                />
              ) : null}
            </TabsContent>
            <TabsContent value="barometer">
              <BarometerView homeLat={places.find((candidate) => candidate.isHome)?.lat ?? null} />
            </TabsContent>
            <TabsContent value="places">
              <PlacesView places={places} />
            </TabsContent>
            <TabsContent value="kept">
              <KeptView kept={kept} places={places} sources={weather.data.sources} now={now} />
            </TabsContent>
          </Tabs>
        </>
      )}
    </Page>
  );
}
