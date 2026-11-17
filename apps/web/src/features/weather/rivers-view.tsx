/**
 * River and sea levels near a weather place: the Environment Agency's stations, fetched
 * on a press and kept, each with its latest level and when it was measured; and a
 * station's own view with its last few days of readings, fetched on a press of its own.
 *
 * What is said about a level is the Agency's (its typical range) or labelled as
 * Outpost's (rising, steady or falling, by `levelTrend`). Nothing here is a forecast or
 * says that a place is safe, and every figure says when it was measured, so that a copy
 * kept for days is never read as current.
 */
import {
  ageWords,
  DATUM_SHORT,
  DATUM_WORDS,
  datumOf,
  distanceWords,
  FLOODLINE,
  freshness,
  type KeptCopy,
  latestReading,
  levelTrend,
  RANGE_WORDS,
  type RangeState,
  RIVER_DISTANCES_KM,
  type RiverLevelStation,
  rangeState,
  STATION_HISTORY_DAYS,
  type StationReadings,
  stationLiveUrl,
  stoppedReporting,
  type TrendResult,
  type WeatherPlace,
  type WeatherSourceInfo,
} from "@outpost/shared";
import { ChevronRight, CircleAlert, Clock, RefreshCw } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { BackLink, Joined, Notice } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/misc";
import { errorMessage } from "@/lib/api";
import { formatTimeOfDay } from "@/lib/clock";
import { formatDateTime, plural } from "@/lib/utils";
import { AgeLine, Credit } from "./age-line";
import { useSetRiversKm, useStationReadings } from "./data";
import { TimeLine } from "./time-chart";

const link = "text-primary underline underline-offset-2";

/** "1.09 m above Ordnance Datum". */
export const levelText = (value: number, unit: string): string => `${value.toFixed(2)} ${DATUM_SHORT[datumOf(unit)]}`;

/** "measured 11:15 (2 hours ago)" today, "measured 16 Nov 2026, 11:15 (a day ago)" before: when the Agency measured it, against now. */
export const measuredText = (t: number, now: number): string => {
  const ago = now - t < 60_000 ? "just now" : `${ageWords(Math.max(0, now - t))} ago`;
  const today = new Date(t).toDateString() === new Date(now).toDateString();
  return `measured ${today ? formatTimeOfDay(t) : formatDateTime(t)} (${ago})`;
};

/** "Rising 0.05 m over the 3 hours to 11:15 (Outpost's reading of the figures held)". */
export function trendText(trend: TrendResult): string {
  if (!trend.ok) return trend.reason;
  const span = ageWords(trend.to.t - trend.from.t);
  const size = Math.abs(trend.change).toFixed(2);
  const words =
    trend.direction === "steady" ? "Steady, less than 2 cm of change," : `${trend.direction === "rising" ? "Rising" : "Falling"} ${size} m`;
  return `${words} over the ${span} to the latest reading held.`;
}

/** The words every view of levels carries: whose figures these are, what they are not, and where to go instead. */
function WhatTheseAre() {
  return (
    <div className="mb-4 grid max-w-[70ch] gap-1 text-small text-ink">
      <p>
        These are the Environment Agency's measurements, not a forecast. A level within its typical range is not a promise that a place will
        not flood. Flood warnings are under{" "}
        <Link className={link} to="?view=flood">
          Flood
        </Link>
        .
      </p>
      <p>
        In an emergency, call 999. Floodline, the Environment Agency's line for flood advice, is{" "}
        <a className={link} href={`tel:${FLOODLINE.phone.replace(/\s/g, "")}`}>
          {FLOODLINE.phone}
        </a>
        , 24 hours a day.
      </p>
      <p className="text-ink-muted">
        England only: these are the Environment Agency's stations. Scotland (SEPA), Wales (Natural Resources Wales) and Northern Ireland
        publish their own, which Outpost does not fetch.
      </p>
    </div>
  );
}

function DistanceChoice({ value }: { value: number }) {
  const set = useSetRiversKm();
  return (
    <div className="grid w-full gap-1.5 sm:w-56">
      <span className="text-small font-medium text-ink">Stations within</span>
      <Select
        aria-label="Stations within"
        value={String(value)}
        onChange={(next) => set.mutate(Number(next))}
        options={RIVER_DISTANCES_KM.map((km) => ({ value: String(km), label: distanceWords(km) }))}
      />
    </div>
  );
}

/** The state of a level in a few words, for a station's row: the full sentences are under "What the figures mean". */
const STATE_SHORT: Record<RangeState, string> = {
  above: "Above its typical range",
  within: "Within its typical range",
  below: "Below its typical range",
  tidal: "Tidal",
  "no-range": "No typical range given",
};

/** "steady", "rising 0.05 m", or nothing where the readings held cannot say. */
export function trendShort(trend: TrendResult): string | null {
  if (!trend.ok) return null;
  return trend.direction === "steady" ? "steady" : `${trend.direction} ${Math.abs(trend.change).toFixed(2)} m`;
}

/**
 * One station in three lines at most on a phone: the station and how far; the level, what it is
 * measured from and when; and its state in one line ("Within its typical range · steady").
 */
function StationRow({ station, fetchedAt, now }: { station: RiverLevelStation; fetchedAt: number; now: number }) {
  const latest = latestReading(station.recent);
  const stopped = latest !== null && stoppedReporting(station.recent, fetchedAt);
  const state = latest ? rangeState(station, latest.v) : station.tidal ? "tidal" : null;
  const parts = [
    state ? <span key="state">{STATE_SHORT[state]}</span> : null,
    latest ? trendShort(levelTrend(station.recent)) : null,
    stopped ? (
      <span key="stopped" className="text-warning">
        Not reporting
      </span>
    ) : null,
    station.status === "suspended" || station.status === "closed" ? (
      <span key="status" className="text-warning">
        {station.status === "suspended" ? "Suspended" : "Closed"}, the Agency says
      </span>
    ) : null,
  ];
  return (
    <li className="py-2.5" data-station={station.id}>
      <Link
        to={`?view=rivers&station=${encodeURIComponent(station.id)}`}
        className="flex min-h-11 items-center gap-2 rounded-control text-ink hover:text-primary focus-visible:outline-2 focus-visible:outline-focus"
      >
        <span className="min-w-0 flex-1">
          <span className="font-semibold">{station.label}</span>
          {station.river ? <span>, {station.river}</span> : null}
          <span className="text-ink-muted"> · {station.distanceKm} km away</span>
        </span>
        <ChevronRight aria-hidden className="size-4 shrink-0 text-ink-muted" />
      </Link>
      {latest ? (
        <p className="tabular text-small text-ink">
          {levelText(latest.v, station.unit)}, {measuredText(latest.t, now)}
        </p>
      ) : (
        <p className="text-small text-ink-muted">{station.readingsNote ?? "No reading is held for this station."}</p>
      )}
      <p className="text-small text-ink-muted">
        <Joined parts={parts} />
      </p>
    </li>
  );
}

export function RiversView({
  place,
  copy,
  history,
  source,
  now,
  riversKm,
  fetching,
  onFetch,
  stationId,
}: {
  place: WeatherPlace;
  copy: KeptCopy<"rivers"> | null;
  history: KeptCopy<"river-readings"> | null;
  source: WeatherSourceInfo | undefined;
  now: number;
  riversKm: number;
  fetching: boolean;
  onFetch: () => void;
  stationId: string | null;
}) {
  const station = stationId ? copy?.data.stations.find((candidate) => candidate.id === stationId) : undefined;
  if (stationId) {
    return station && copy ? (
      <StationView
        place={place}
        station={station}
        fetchedAt={copy.fetchedAt}
        held={history?.data.stations.find((entry) => entry.stationId === station.id) ?? null}
        source={source}
        now={now}
      />
    ) : (
      <div>
        <BackToRivers />
        <p className="text-body text-ink">That station is not among the river and sea levels kept for {place.name}. Fetch them again.</p>
      </div>
    );
  }
  const fetchButton = (
    <Button variant={copy ? "secondary" : "primary"} loading={fetching} onClick={onFetch}>
      <RefreshCw />
      {copy ? "Fetch again" : "Fetch river and sea levels"}
    </Button>
  );
  return (
    <div>
      <WhatTheseAre />
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <DistanceChoice value={riversKm} />
        {fetchButton}
      </div>
      {fetching ? (
        <p role="status" className="mb-4 text-small text-ink-muted">
          Asking the Environment Agency for the stations near {place.name}, then each station's latest readings…
        </p>
      ) : null}
      {!copy ? (
        <p className="text-body text-ink-muted">
          River and sea levels have not been fetched for {place.name} yet. Fetching asks the Environment Agency for its stations within{" "}
          {distanceWords(riversKm)}, then the latest readings of each of the nearest ten: usually under 60 kB in all.
        </p>
      ) : (
        <>
          <AgeLine copy={copy} source={source} now={now} />
          {copy.data.withinKm !== riversKm ? (
            <p className="mb-4 text-small text-ink-muted">
              This copy was fetched for stations within {copy.data.withinKm} km. Fetch again for {riversKm} km.
            </p>
          ) : null}
          {copy.data.stations.length === 0 ? (
            <p className="text-body text-ink">
              The Environment Agency listed no level station within {copy.data.withinKm} km of {place.name} when this was fetched. Its
              stations are in England only. A wider distance may find one.
            </p>
          ) : (
            <>
              <h3 className="text-body font-semibold text-ink">
                {plural(copy.data.stations.length, "station")} within {copy.data.withinKm} km, nearest first
              </h3>
              {copy.data.listed > copy.data.stations.length ? (
                <p className="text-small text-ink-muted">
                  The nearest {copy.data.stations.length} of {copy.data.listed} are kept.
                </p>
              ) : null}
              <ul className="mt-1 divide-y divide-border border-y border-border">
                {copy.data.stations.map((station) => (
                  <StationRow key={station.id} station={station} fetchedAt={copy.fetchedAt} now={now} />
                ))}
              </ul>
              <details className="mt-4 max-w-[70ch] text-small">
                <summary className="min-h-11 cursor-pointer py-2 font-medium text-primary">What the figures mean</summary>
                <div className="grid gap-2 text-ink">
                  <p>
                    A level is in metres above a fixed point, which the Agency names: Ordnance Datum (mAOD), the level heights on Ordnance
                    Survey maps are measured from, or the station's own datum (mASD), chosen for that gauge. Levels at two stations measured
                    from different points cannot be compared.
                  </p>
                  <p>
                    The typical range is the Agency's: its top is the level "exceeded … for 5% of the relevant data on record", its bottom
                    the level exceeded for 95%. A tidal level rises and falls with the tide and is not judged against one.
                  </p>
                  <p>
                    Rising, steady or falling is Outpost's reading of the readings held, not the Agency's: the latest against the earliest
                    in the three hours before it, at least 45 minutes apart; a change of under 2 cm is called steady. Where too few readings
                    are held to say, nothing is said.
                  </p>
                  <p>
                    Not reporting: the station's latest reading is much older than the moment the levels were fetched. A station's own page
                    says how much older, and what the Agency says about it.
                  </p>
                  <p>
                    The Agency measures usually every 15 minutes, but sends readings back "typically once or twice per day" except when
                    flood risk is higher, so a latest reading several hours old is ordinary.
                  </p>
                </div>
              </details>
            </>
          )}
        </>
      )}
      <Credit source={source} />
    </div>
  );
}

function BackToRivers() {
  return (
    <BackLink to="?view=rivers" className="mb-2">
      All river and sea levels
    </BackLink>
  );
}

function StationView({
  place,
  station,
  fetchedAt,
  held,
  source,
  now,
}: {
  place: WeatherPlace;
  station: RiverLevelStation;
  fetchedAt: number;
  held: StationReadings | null;
  source: WeatherSourceInfo | undefined;
  now: number;
}) {
  const fetch = useStationReadings();
  const [failed, setFailed] = useState<string | null>(null);
  const latest = latestReading(held?.readings.length ? held.readings : station.recent);
  const state = latest ? rangeState(station, latest.v) : null;
  const live = stationLiveUrl(station.rloiId);
  const datum = datumOf(station.unit);
  const fresh = held ? freshness({ kind: "river-readings", fetchedAt: held.fetchedAt, validUntil: null }, now) : null;
  const typical =
    station.typicalLow !== null && station.typicalHigh !== null ? { low: station.typicalLow, high: station.typicalHigh } : null;
  const perDay = Math.round(86_400 / (station.periodS ?? 900));
  const press = () =>
    fetch.mutate(
      { placeId: place.id, stationId: station.id },
      { onSuccess: () => setFailed(null), onError: (error) => setFailed(errorMessage(error)) },
    );

  return (
    <div>
      <BackToRivers />
      <h2 className="font-title text-heading text-ink">{station.label}</h2>
      <p className="text-body text-ink-muted">
        {[station.river, station.town].filter(Boolean).join(", ")}
        {station.river || station.town ? " · " : ""}
        {station.distanceKm} km from {place.name}
        {station.tidal ? " · tidal" : ""}
      </p>
      <p className="mt-2 max-w-[70ch] text-small text-ink">
        Levels here are {DATUM_WORDS[datum]} ({station.unit}).
      </p>

      <div className="mt-4 grid max-w-[70ch] gap-1">
        {latest ? (
          <p className="tabular text-body text-ink">
            Latest held: {levelText(latest.v, station.unit)}, {measuredText(latest.t, now)}.
          </p>
        ) : (
          <p className="text-body text-ink-muted">{station.readingsNote ?? "No reading is held for this station."}</p>
        )}
        {state ? (
          <p className="text-small text-ink">
            {RANGE_WORDS[state]}
            {typical ? ` (${typical.low.toFixed(2)} to ${typical.high.toFixed(2)} m)` : ""}.
          </p>
        ) : null}
        <p className="text-small text-ink-muted">{trendText(levelTrend(held?.readings.length ? held.readings : station.recent))}</p>
        {station.maxOnRecord ? (
          <p className="tabular text-small text-ink">
            Highest on record: {station.maxOnRecord.value.toFixed(2)} m
            {station.maxOnRecord.at ? `, ${formatDateTime(station.maxOnRecord.at)}` : ""}.
          </p>
        ) : (
          <p className="text-small text-ink-muted">The Agency publishes no highest level on record for this station.</p>
        )}
        {station.highestRecent ? (
          <p className="tabular text-small text-ink-muted">
            Highest in recent years (typically the last five), as the Agency gives it: {station.highestRecent.value.toFixed(2)} m
            {station.highestRecent.at ? `, ${formatDateTime(station.highestRecent.at)}` : ""}.
          </p>
        ) : null}
        {station.status === "suspended" || station.status === "closed" ? (
          <p className="text-small text-warning">
            The Agency marks this station {station.status}
            {station.statusReason ? `: “${station.statusReason}”` : "."}
          </p>
        ) : null}
      </div>

      <section aria-labelledby="station-days" className="mt-8">
        <h3 id="station-days" className="text-body font-semibold text-ink">
          The last {STATION_HISTORY_DAYS} days
        </h3>
        <div className="mt-2 mb-3 flex flex-wrap items-center gap-3">
          <Button variant={held ? "secondary" : "primary"} loading={fetch.isPending} onClick={press}>
            <RefreshCw />
            {held ? "Fetch again" : `Fetch the last ${STATION_HISTORY_DAYS} days`}
          </Button>
          {!held ? (
            <span className="text-small text-ink-muted">
              About {(perDay * STATION_HISTORY_DAYS).toLocaleString("en-GB")} readings, about{" "}
              {Math.max(1, Math.round((perDay * STATION_HISTORY_DAYS * 240) / 1000))} kB.
            </span>
          ) : null}
        </div>
        {failed ? (
          <Notice tone="warning" title="The readings could not be fetched" className="mb-3">
            {failed} {held ? "What was kept before is still kept, with its age." : ""}
          </Notice>
        ) : null}
        {held && fresh ? (
          <div className="grid grid-cols-1 gap-3">
            <p
              data-freshness={fresh.state}
              className={
                fresh.state === "old"
                  ? "flex items-start gap-1.5 text-small font-semibold text-warning"
                  : "flex items-start gap-1.5 text-small text-ink-muted"
              }
            >
              {fresh.state === "old" ? (
                <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              ) : (
                <Clock className="mt-0.5 size-4 shrink-0" aria-hidden />
              )}
              <span>
                {fresh.state === "old"
                  ? `Fetched ${fresh.age}: these readings are old, and levels may have changed since.`
                  : `Fetched ${fresh.age}.`}{" "}
                {held.readings.length > 0
                  ? `${plural(held.readings.length, "reading")}, from ${formatDateTime(held.readings[0]!.t)} to ${formatDateTime(held.readings.at(-1)!.t)}.`
                  : ""}
              </span>
            </p>
            {held.readings.length === 0 ? (
              <p className="text-body text-ink">The Agency gave no readings for this station over the last {STATION_HISTORY_DAYS} days.</p>
            ) : (
              <>
                <TimeLine
                  points={held.readings.map((reading) => ({ t: reading.t, value: reading.v }))}
                  name={`Level at ${station.label}, ${DATUM_SHORT[datum]}, the last ${STATION_HISTORY_DAYS} days as fetched`}
                  format={(value) => `${value.toFixed(2)} m`}
                  band={typical}
                  rules={
                    station.maxOnRecord
                      ? [{ value: station.maxOnRecord.value, label: `Highest on record ${station.maxOnRecord.value.toFixed(2)} m` }]
                      : []
                  }
                  minSpan={0.2}
                  height={190}
                />
                <ul className="flex flex-wrap gap-x-5 gap-y-1 text-small text-ink" aria-label="Key">
                  <li className="flex items-center gap-2">
                    <span aria-hidden className="h-0.5 w-5 rounded-full" style={{ background: "var(--chart-1)" }} /> Level
                  </li>
                  {typical ? (
                    <li className="flex items-center gap-2">
                      <span aria-hidden className="size-3.5 rounded-sm" style={{ background: "var(--chart-seq-1)" }} /> Typical range, the
                      Agency's
                    </li>
                  ) : null}
                  {station.maxOnRecord ? (
                    <li className="flex items-center gap-2">
                      <span aria-hidden className="w-5 border-t-2 border-dashed" style={{ borderColor: "var(--chart-axis)" }} /> Highest on
                      record
                    </li>
                  ) : null}
                </ul>
                <details className="text-small">
                  <summary className="min-h-11 cursor-pointer py-2 font-medium text-primary">The readings as a table</summary>
                  <div className="max-h-96 overflow-y-auto">
                    <table className="tabular w-full max-w-md text-left">
                      <thead>
                        <tr className="border-b border-border text-ink-muted">
                          <th scope="col" className="py-1 pr-4 font-medium">
                            Measured
                          </th>
                          <th scope="col" className="py-1 font-medium">
                            Level, {station.unit}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...held.readings].reverse().map((reading) => (
                          <tr key={reading.t} className="border-b border-border">
                            <th scope="row" className="py-1 pr-4 font-normal text-ink">
                              {formatDateTime(reading.t)}
                            </th>
                            <td className="py-1 text-ink">{reading.v}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              </>
            )}
          </div>
        ) : !failed ? (
          <p className="text-body text-ink-muted">The last {STATION_HISTORY_DAYS} days have not been fetched for this station.</p>
        ) : null}
      </section>

      <p className="mt-8 text-small text-ink">
        The list of stations was fetched {formatDateTime(fetchedAt)}.{" "}
        {live ? (
          <>
            The Agency's own page for this station is{" "}
            <a className={link} href={live} target="_blank" rel="noreferrer">
              {live.replace(/^https:\/\//, "")}
            </a>
            .
          </>
        ) : null}
      </p>
      <Credit source={source} />
    </div>
  );
}
