/**
 * Tools → Tide times: high and low water at the tide stations nearest a place, worked out
 * on the server from harmonic constants that ship with Outpost, for a day to a month
 * ahead, with no connection. The place and the clock are chosen as on the Solar clock
 * (and remembered with it); the station, the start day and the span here.
 */
import { isIsoDate, TIDE_MAX_DAYS, type TidePredictionResponse, type TideSource, type TideStationDto } from "@outpost/shared";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { ErrorState, Notice, Page, PageHeader, Rows, Section } from "@/components/page";
import { Field } from "@/components/ui/input";
import { Select, Skeleton } from "@/components/ui/misc";
import { formatShortDate } from "@/features/maps/lib/sun-text";
import { useClockStyle } from "@/lib/clock";
import { NoPlaceYet, usePlaceAndZone } from "../solar-clock/place";
import { clockAt, reading, type ZoneChoice, zoneWords } from "../solar-clock/zone";
import { useText } from "../tools/kit";
import { useTidePredictions, useTideStations } from "./data";
import { TideChart } from "./tide-chart";
import { FAR_KM, formatHeight, formatKm, midnightOn } from "./words";

const SPANS = [1, 3, 7, 14, TIDE_MAX_DAYS] as const;

export default function TidesPage() {
  const { place, zone, picker } = usePlaceAndZone();
  return (
    <Page width="reading">
      <PageHeader
        title="Tide times"
        description="High and low water at the tide stations nearest a place, worked out on this computer from each station's tidal constants, for days or weeks ahead with no internet."
      />
      <Notice tone="warning" title="Not for navigation" className="mb-6">
        These are the tides the moon and sun raise, and nothing else. Wind, air pressure and river flow (a storm surge) can hold the sea
        well above or below them, and the times can be out where the coast is far from the station. Use official tide tables and forecasts
        for anything where safety depends on the water.
      </Notice>
      <section aria-label="Place and clock" className="mb-8">
        {picker}
      </section>
      {place ? <Tides place={place} zone={zone} /> : <NoPlaceYet />}
    </Page>
  );
}

function Tides({ place, zone }: { place: { lat: number; lon: number; name: string }; zone: ZoneChoice }) {
  const stations = useTideStations(place);
  const [chosen, setChosen] = useState<string | null>(null);
  const list = stations.data?.stations ?? [];
  const station = list.find((each) => each.id === chosen) ?? list[0] ?? null;

  if (stations.isPending) {
    return (
      <div role="status" className="grid gap-3" aria-label="Finding the nearest tide stations">
        <Skeleton className="h-9" />
        <Skeleton className="h-48" />
      </div>
    );
  }
  if (stations.isError) return <ErrorState error={stations.error} onRetry={() => stations.refetch()} />;
  const { sources, nearest, reachKm } = stations.data;
  const credit = <Credit sources={sources} />;
  if (!station) {
    return (
      <>
        <NoStationNear place={place} nearest={nearest} reachKm={reachKm} held={sources.reduce((sum, each) => sum + each.count, 0)} />
        {credit}
      </>
    );
  }
  return (
    <>
      <Section title="Station" description="Tides are worked out for a station: a place where the tide was measured for years.">
        <Field label="Tide station" hint={`Stations within ${formatKm(reachKm)} of ${place.name}, nearest first.`}>
          {(ids) => (
            <Select
              id={ids.id}
              aria-describedby={ids["aria-describedby"]}
              value={station.id}
              onChange={setChosen}
              options={list.map((each) => ({ value: each.id, label: `${stationName(each)}, ${formatKm(each.distanceKm)} away` }))}
            />
          )}
        </Field>
        {station.distanceKm > FAR_KM ? (
          <Notice tone="warning" className="mt-3" title={`The station is ${formatKm(station.distanceKm)} from ${place.name}`}>
            The tide where you are may come earlier or later, and rise higher or lower, than at the station.
          </Notice>
        ) : null}
        {station.river ? (
          <Notice tone="warning" className="mt-3" title="A river gauge">
            The river's own flow bends the tide here: after heavy rain or a dry spell it can be well off these figures.
          </Notice>
        ) : null}
      </Section>
      <Predictions station={station} place={place} zone={zone} />
      {credit}
    </>
  );
}

/** Said plainly when no station is within reach: why, how far the nearest is, and what can be done. Nothing to download. */
function NoStationNear({
  place,
  nearest,
  reachKm,
  held,
}: {
  place: { name: string };
  nearest: TideStationDto | null;
  reachKm: number;
  held: number;
}) {
  return (
    <Notice title={`No tide data for the coast near ${place.name}`}>
      <p>
        {nearest
          ? `The nearest tide station Outpost holds is ${stationName(nearest)}, ${formatKm(nearest.distanceKm)} away. That is too far for its tides to be yours, so it is not offered.`
          : "This copy of Outpost holds no tidal constants."}{" "}
        Outpost offers stations within {formatKm(reachKm)}.
      </p>
      <p className="mt-2">
        If {place.name} is inland, there is no tide to show. If it is on a coast, save a place on the shore nearer a port on the Maps screen
        and choose it above, or use the tide tables of the country's hydrographic office.
      </p>
      <p className="mt-2">
        There is nothing to download: all {held.toLocaleString("en-GB")} stations Outpost knows about are already on this computer and work
        with no internet.
      </p>
    </Notice>
  );
}

function Credit({ sources }: { sources: TideSource[] }) {
  return (
    <p className="mt-10 text-small text-ink-muted">
      Tidal constants from{" "}
      {sources.map((source, i) => (
        <span key={source.id}>
          {i > 0 ? (i === sources.length - 1 ? " and " : ", ") : null}
          <a href={source.url} className="text-primary underline underline-offset-2">
            {source.name}
          </a>{" "}
          ({source.count.toLocaleString("en-GB")} stations; {source.licence.replace(/;.*/, "")}; read on {formatShortDate(source.read)}{" "}
          {source.read.slice(0, 4)})
        </span>
      ))}
      . How they are used:{" "}
      <Link to="/help/tides" className="text-primary underline underline-offset-2">
        Tide times
      </Link>
      .
    </p>
  );
}

function stationName(station: TideStationDto): string {
  const name = station.state && !station.name.includes(station.state) ? `${station.name}, ${station.state}` : station.name;
  return station.river ? `${name} (river)` : name;
}

function Predictions({ station, place, zone }: { station: TideStationDto; place: { lat: number; lon: number }; zone: ZoneChoice }) {
  const today = reading(zone, Date.now()).date;
  // The start day is not remembered: a day chosen last week would be in the past by now.
  const [startText, setStartText] = useState("");
  const [spanText, setSpanText] = useText("tides.days", "7");
  const start = isIsoDate(startText) ? startText : today;
  const days = SPANS.includes(Number(spanText) as (typeof SPANS)[number]) ? Number(spanText) : 7;
  const from = midnightOn(start, zone);
  const predictions = useTidePredictions(station.id, from, days, place);

  return (
    <Section title="High and low water" description={`Times on ${zoneWords(zone, from)}.`}>
      <div className="mb-5 grid gap-4 sm:grid-cols-2">
        <Field label="From" hint="Today if left empty.">
          {(ids) => (
            <input
              {...ids}
              type="date"
              value={startText}
              onChange={(event) => setStartText(event.target.value)}
              className="h-9 w-full rounded-control border border-border-strong bg-page px-3 text-body text-ink focus-visible:border-focus focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus max-md:h-11"
            />
          )}
        </Field>
        <Field label="For">
          {(ids) => (
            <Select
              id={ids.id}
              aria-describedby={ids["aria-describedby"]}
              value={String(days)}
              onChange={setSpanText}
              options={SPANS.map((n) => ({ value: String(n), label: n === 1 ? "1 day" : `${n} days` }))}
            />
          )}
        </Field>
      </div>
      {predictions.isPending ? (
        <div role="status" className="grid gap-3" aria-label="Working out the tides">
          <Skeleton className="h-56" />
          <Skeleton className="h-32" />
        </div>
      ) : predictions.isError ? (
        <ErrorState error={predictions.error} onRetry={() => predictions.refetch()} />
      ) : (
        <Answer data={predictions.data} zone={zone} />
      )}
    </Section>
  );
}

function Answer({ data, zone }: { data: TidePredictionResponse; zone: ZoneChoice }) {
  const style = useClockStyle();
  const datum =
    data.station.datum === "MLLW"
      ? "Heights are above mean lower low water, the level US charts measure depths from."
      : data.station.source === "ticon"
        ? "Heights are above mean sea level at the gauge, not a chart datum: a depth on a chart is measured from a lower level."
        : "Heights are above mean sea level: NOAA gives no chart datum for this station.";
  const byDay = useMemo(() => {
    const days = new Map<string, TidePredictionResponse["turns"]>();
    for (const turn of data.turns) {
      const date = reading(zone, turn.t).date;
      days.set(date, [...(days.get(date) ?? []), turn]);
    }
    return [...days.entries()];
  }, [data.turns, zone]);
  const highs = data.turns.filter((turn) => turn.kind === "high");
  const lows = data.turns.filter((turn) => turn.kind === "low");
  const range =
    highs.length && lows.length
      ? `Highs from ${formatHeight(Math.min(...highs.map((t) => t.h)))} to ${formatHeight(Math.max(...highs.map((t) => t.h)))}; lows from ${formatHeight(Math.min(...lows.map((t) => t.h)))} to ${formatHeight(Math.max(...lows.map((t) => t.h)))}.`
      : "";

  if (data.turns.length === 0) {
    return (
      <Notice title="No high or low water in this time">
        The tide here turns less often than once in the span asked for. Choose more days.
      </Notice>
    );
  }
  return (
    <>
      <h3 className="text-body font-semibold text-ink">Height of the tide at {data.station.name}</h3>
      <p className="mb-2 text-small text-ink-muted">
        {range} {datum}
      </p>
      <TideChart curve={data.curve} turns={data.turns} zone={zone} name={`Height of the tide at ${data.station.name}`} />
      <div className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-6">
        {byDay.map(([date, turns]) => (
          <div key={date}>
            <h3 className="mb-1 text-small font-semibold text-ink">{formatDayHeading(date)}</h3>
            <Rows>
              {turns.map((turn) => (
                <li key={turn.t} className="flex flex-wrap items-baseline justify-between gap-x-4 py-2 text-body">
                  <span className="tabular min-w-24 shrink-0 text-ink">{clockAt(turn.t, zone, style)}</span>
                  <span className="min-w-0 flex-1 text-ink">{turn.kind === "high" ? "High water" : "Low water"}</span>
                  <span className="tabular text-ink">{formatHeight(turn.h)}</span>
                </li>
              ))}
            </Rows>
          </div>
        ))}
      </div>
    </>
  );
}

const weekday = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" });
/** "Friday 15 January". */
function formatDayHeading(date: string): string {
  return weekday.format(new Date(`${date}T00:00:00Z`)).replace(",", "");
}
