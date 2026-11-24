/**
 * Radio → Satellites (outpost-lr3t): all of LogBook73's satellite tracking, worked out in
 * this browser from the orbital elements the server keeps.
 *
 * - Passes: every amateur satellite's passes over Home (or any place) for the days
 *   ahead, by day, with when it rises, peaks and sets and in which directions.
 * - One satellite: where it is now and how it looks from here, its published
 *   transmitters with the Doppler-corrected frequencies now, its passes, and for the
 *   pass chosen the sky track and what to tune to from rise to set; printed or added to
 *   the library as a PDF, or drawn on the map. Elements can also be pasted in.
 * - Weather satellites: the next passes of those with a downlink, rated by height and
 *   by daylight.
 *
 * The elements are fetched only when "Get orbital elements" is pressed, and their age is
 * said plainly: passes drift by minutes within weeks.
 */
import {
  compassPoint,
  elementsAge,
  elementsAgeWarning,
  homeLabel,
  parseCoordinates,
  SATELLITE_GROUPS,
  SATELLITE_SOURCES,
  type SatelliteAbout,
  type SatelliteElements,
  type SatelliteGroup,
  type SatelliteTransmitter,
  type SatelliteWikipedia,
} from "@outpost/shared";
import { Download, Map as MapIcon, RefreshCw } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { Disclosure, EmptyState, ErrorState, Joined, Notice, Page, PageHeader, Rows, Section } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Checkbox, Segmented, Select, Skeleton, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/misc";
import { Table, TableHead, Td, Th, Tr } from "@/components/ui/table";
import { HomeAsOf, NoHome, useHome } from "@/features/households/home";
import { PdfActions } from "@/features/library/made/pdf-actions";
import { useMarkers } from "@/features/maps/data";
import { kitPdfOf, useKitPdf } from "@/features/print-kit/use-kit-pdf";
import type { PlaceField } from "@/features/propagation/data";
import { PlaceInput } from "@/features/propagation/place-field";
import { useLand } from "@/features/propagation/print/use-land";
import { LicenceLine, useRadioLicence } from "@/features/radio/licence";
import { useClockStyle } from "@/lib/clock";
import { usePageVisible } from "@/lib/page-visible";
import { deviceRegion, likelyPaperFor } from "@/lib/region";
import { cn, formatDate, plural, timeAgo } from "@/lib/utils";
import { AboutSatellite } from "./about-satellite";
import { ISS, inGroup, liveTransmitters, useFetchElements, useSatellites } from "./data";
import { type PassSheet, passDocument, passTitle } from "./document";
import {
  dopplerTuning,
  FLOOR_ELEVATION_DEG,
  type ObserverLocation,
  type Orbit,
  passSkyPath,
  predictPasses,
  type SatelliteState,
  type ScheduledPass,
  satelliteState,
  WORKABLE_ELEVATION_DEG,
} from "./engine";
import { sampleTrack } from "./ground-track";
import { GroundTrack } from "./ground-track-map";
import { byMain } from "./main-transmitter";
import { type ManualSatellite, parseManualElements } from "./manual";
import { useChosenSatellite } from "./map";
import { SatellitePicker } from "./satellite-picker";
import { SkyPlot } from "./sky-plot";
import { usePassSchedule } from "./use-schedule";
import { alwaysUpWords, bothTimes, countdown, dayWords, frequencyWords, geometryWords, lightAt, shiftWords, utcTime } from "./words";

const PATH = "/radio/satellites";
const BUCKET_MS = 300_000;
/** Passes listed at a time: a week of every amateur satellite is thousands. */
const PAGE_OF_PASSES = 40;
/** One satellite's passes listed before "Show all". */
const FIRST_PASSES = 5;
const WINDOWS = [
  { value: "24", label: "24 hours" },
  { value: "48", label: "2 days" },
  { value: "72", label: "3 days" },
  { value: "168", label: "7 days" },
] as const;
type WindowValue = (typeof WINDOWS)[number]["value"];

/** A satellite the screen can show: from the kept catalogue, or pasted in. */
interface Shown {
  noradId: number;
  name: string;
  epoch: number;
  groups: SatelliteGroup[];
  orbit: Orbit;
  manual: ManualSatellite | null;
}

const fromCatalogue = (satellite: SatelliteElements): Shown => ({
  noradId: satellite.noradId,
  name: satellite.name,
  epoch: satellite.epoch,
  groups: satellite.groups,
  orbit: satellite,
  manual: null,
});

/** "Now" for a screen in view: ticks while the page is visible, at the given step. */
function useNow(stepMs: number): Date {
  const visible = usePageVisible();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!visible) return;
    setNow(new Date());
    const timer = window.setInterval(() => setNow(new Date()), stepMs);
    return () => window.clearInterval(timer);
  }, [visible, stepMs]);
  return now;
}

// ── The elements and where they came from ───────────────────────────────────

function ElementsStatus({ data, now }: { data: NonNullable<ReturnType<typeof useSatellites>["data"]>; now: Date }) {
  const fetch = useFetchElements();
  const [said, setSaid] = useState<string[]>([]);
  const [celestrak, satnogs] = data.sources;
  const details = data.sources.find((source) => source.id === "satnogs-satellites");
  const newest = data.satellites.reduce((max, satellite) => Math.max(max, satellite.epoch), 0);
  const age = newest ? elementsAge(newest, now.getTime()) : null;
  const button = (
    <Button
      variant={data.satellites.length === 0 ? "primary" : "secondary"}
      disabled={fetch.isPending || data.fetching}
      onClick={() => fetch.mutate(undefined, { onSuccess: (result) => setSaid(result.said) })}
    >
      <RefreshCw aria-hidden className={cn(fetch.isPending && "animate-spin motion-reduce:animate-none")} />
      {fetch.isPending || data.fetching ? "Getting orbital elements…" : "Get orbital elements"}
    </Button>
  );
  const what = (
    <>
      This asks CelesTrak for the orbital elements of the amateur, weather and crewed satellites (three small files) and SatNOGS DB for
      their transmitters (about 4 MB) and details (about 1.6 MB). Nothing else on this screen uses the internet except "Read about it on
      Wikipedia", and nothing is fetched on its own.
    </>
  );
  if (data.satellites.length === 0) {
    return (
      <EmptyState title="No orbital elements yet" action={button}>
        Passes are worked out on this device from each satellite's orbital elements, which need fetching once and then every week or two.{" "}
        {what}
        {celestrak?.error ? ` Last time: ${celestrak.error}` : ""}
      </EmptyState>
    );
  }
  const failed = (source: (typeof data.sources)[number] | undefined) =>
    Boolean(source?.error && source.triedAt && source.triedAt > (source.fetchedAt ?? 0));
  // Recent elements and nothing gone wrong: one line, opened for the detail, so the passes come first.
  const quiet = age === "fresh" && !failed(celestrak) && !failed(satnogs) && !failed(details);
  const content = (
    <>
      <p className="text-body text-ink">
        {plural(data.satellites.length, "satellite")}, from CelesTrak {celestrak?.fetchedAt ? timeAgo(celestrak.fetchedAt) : ""}; newest
        elements dated {formatDate(newest)}.{" "}
        {satnogs?.fetchedAt
          ? `${plural(satnogs.count, "transmitter")} from SatNOGS DB, ${timeAgo(satnogs.fetchedAt)}.`
          : "No transmitters from SatNOGS DB yet."}{" "}
        {details && !details.fetchedAt
          ? "Satellite details from SatNOGS DB (names, launch, countries) have never been fetched: the next press of Get orbital elements fetches them."
          : null}
      </p>
      {age === "old" || age === "very-old" || age === "ahead" ? (
        <Notice tone="warning" className="mt-3" title={age === "ahead" ? "Check the clock" : "These elements are getting old"}>
          {elementsAgeWarning(newest, now.getTime())}
        </Notice>
      ) : null}
      {celestrak?.error && celestrak.triedAt && celestrak.triedAt > (celestrak.fetchedAt ?? 0) ? (
        <Notice tone="danger" className="mt-3" title="The last fetch from CelesTrak did not work">
          {celestrak.error} The elements above are the ones kept before.
        </Notice>
      ) : null}
      {satnogs?.error && satnogs.triedAt && satnogs.triedAt > (satnogs.fetchedAt ?? 0) ? (
        <Notice tone="warning" className="mt-3" title="The last fetch from SatNOGS DB did not work">
          {satnogs.error}
        </Notice>
      ) : null}
      {details?.error && details.triedAt && details.triedAt > (details.fetchedAt ?? 0) ? (
        <Notice tone="warning" className="mt-3" title="The last fetch of satellite details from SatNOGS DB did not work">
          {details.error}
        </Notice>
      ) : null}
      {said.length > 0 ? (
        <ul className="mt-3 grid gap-1 text-small text-ink-muted" aria-live="polite">
          {said.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center gap-3">{button}</div>
      <p className="mt-2 text-small text-ink-muted">{what}</p>
    </>
  );
  if (quiet)
    return (
      <Disclosure
        className="mb-6 border-y border-border"
        summary={`Orbital elements up to date: ${plural(data.satellites.length, "satellite")}, newest dated ${formatDate(newest)}`}
      >
        {content}
      </Disclosure>
    );
  return (
    <Section title="Orbital elements" className="mb-8">
      {content}
    </Section>
  );
}

// ── Passes ──────────────────────────────────────────────────────────────────

function PassRowLine({ entry, now, onOpen }: { entry: ScheduledPass; now: Date; onOpen: () => void }) {
  const { pass, satellite, workable } = entry;
  const inView = pass.aos <= now && pass.los > now;
  const warning = elementsAge(satellite.epoch, now.getTime()) !== "fresh";
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="grid w-full gap-x-4 gap-y-1 py-3 text-left hover:bg-surface focus-visible:outline-2 focus-visible:outline-focus sm:grid-cols-[minmax(0,1fr)_auto]"
      >
        <span className="min-w-0">
          <span className="block text-lead text-ink">{satellite.name}</span>
          <span className="block text-small text-ink tabular">
            {bothTimes(pass.aos)} to {utcTime(pass.los)} UTC
          </span>
          <span className="block text-small text-ink-muted">
            <Joined
              parts={
                pass.alwaysUp
                  ? [alwaysUpWords(pass), workable ? null : "low pass"]
                  : [
                      `${compassPoint(pass.aosAzimuthDeg)} to ${compassPoint(pass.losAzimuthDeg)}`,
                      `${Math.round(pass.durationSeconds / 60)} min`,
                      workable ? null : "low pass",
                    ]
              }
            />
          </span>
          {warning ? (
            <span className="block text-small text-warning">
              Elements {Math.floor((now.getTime() - satellite.epoch) / 86_400_000)} days old: times may be off
            </span>
          ) : null}
        </span>
        <span className="text-small sm:text-right">
          {pass.alwaysUp ? null : (
            <span className="block text-ink tabular">
              <span className="text-small text-ink-muted">highest </span>
              <span className="text-lead">{Math.round(pass.maxElevationDeg)}°</span>
            </span>
          )}
          <span className={cn("block", inView ? "font-medium text-lamp-ink" : "text-ink-muted")}>
            {inView ? "Up now" : countdown(pass.aos, now)}
          </span>
        </span>
      </button>
    </li>
  );
}

function PassesTab({
  amateur,
  observer,
  now,
  onOpen,
}: {
  amateur: SatelliteElements[];
  observer: ObserverLocation;
  now: Date;
  onOpen: (noradId: number, aos: number) => void;
}) {
  const [hours, setHours] = useState<WindowValue>("24");
  const [query, setQuery] = useState("");
  const [workableOnly, setWorkableOnly] = useState(true);
  const [showing, setShowing] = useState(PAGE_OF_PASSES);
  const workableId = useId();
  const bucket = Math.floor(now.getTime() / BUCKET_MS);
  const from = useMemo(() => new Date(bucket * BUCKET_MS), [bucket]);
  const schedule = usePassSchedule(amateur, observer, from, { hours: Number(hours), minElevationDeg: FLOOR_ELEVATION_DEG });
  const needle = query.trim().toLowerCase();
  const visible = schedule.entries.filter(
    (entry) =>
      entry.pass.los > now &&
      (!workableOnly || entry.workable) &&
      (!needle || entry.satellite.name.toLowerCase().includes(needle) || String(entry.satellite.noradId).includes(needle)),
  );
  const days: Array<{ day: string; entries: ScheduledPass[] }> = [];
  for (const entry of visible.slice(0, showing)) {
    const day = dayWords(entry.pass.aos, now);
    if (days.at(-1)?.day === day) days.at(-1)?.entries.push(entry);
    else days.push({ day, entries: [entry] });
  }
  const workableCount = schedule.entries.filter((entry) => entry.workable).length;
  return (
    <>
      <div className="mb-4 flex flex-wrap items-end gap-4">
        <Field label="Find a satellite" className="min-w-[min(14rem,100%)] flex-1">
          {(ids) => (
            <Input
              {...ids}
              type="search"
              enterKeyHint="search"
              autoComplete="off"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setShowing(PAGE_OF_PASSES);
              }}
              placeholder="Name or NORAD number"
            />
          )}
        </Field>
        <Segmented
          label="How far ahead"
          value={hours}
          onChange={(next) => {
            setHours(next);
            setShowing(PAGE_OF_PASSES);
          }}
          options={WINDOWS.map((item) => ({ value: item.value, label: item.label }))}
        />
        <div className="flex min-h-11 items-center gap-2">
          <Checkbox
            id={workableId}
            checked={workableOnly}
            onCheckedChange={(next) => {
              setWorkableOnly(next === true);
              setShowing(PAGE_OF_PASSES);
            }}
          />
          <label htmlFor={workableId} className="flex items-center self-stretch text-small text-ink">
            Only passes {WORKABLE_ELEVATION_DEG}° high or more
          </label>
        </div>
      </div>
      <p className="mb-2 text-small text-ink-muted" role="status">
        {schedule.computing
          ? `Working out passes: ${schedule.done} of ${schedule.total} satellites…`
          : `${plural(schedule.entries.length, "pass", "passes")} of amateur satellites, ${workableCount} of them ${WORKABLE_ELEVATION_DEG}° high or more${
              visible.length > showing ? `; the first ${showing} shown` : ""
            }. Passes that never rise ${FLOOR_ELEVATION_DEG}° above the horizon are left out.`}
      </p>
      {schedule.computing && visible.length === 0 ? (
        <div className="grid gap-2">
          {[0, 1, 2, 3].map((index) => (
            <Skeleton key={index} className="h-16 w-full" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <p className="text-small text-ink-muted">
          {needle || workableOnly ? (
            <>
              No pass matches.{" "}
              <button
                type="button"
                className="text-primary underline underline-offset-2"
                onClick={() => {
                  setQuery("");
                  setWorkableOnly(false);
                }}
              >
                Show every pass
              </button>
            </>
          ) : (
            "No pass in this time. That is unusual: the elements may be very old, or the place may be wrong."
          )}
        </p>
      ) : (
        days.map((group) => (
          <section key={group.day} className="mb-6" aria-label={group.day}>
            <h3 className="sticky top-0 z-(--z-sticky) bg-page py-2 text-body font-semibold text-ink max-md:top-13">
              {group.day} <span className="font-normal text-ink-muted">{plural(group.entries.length, "pass", "passes")}</span>
            </h3>
            <Rows className="border-y border-border">
              {group.entries.map((entry) => (
                <PassRowLine
                  key={`${entry.satellite.noradId}-${entry.pass.aos.getTime()}`}
                  entry={entry}
                  now={now}
                  onOpen={() => onOpen(entry.satellite.noradId, entry.pass.aos.getTime())}
                />
              ))}
            </Rows>
          </section>
        ))
      )}
      {visible.length > showing ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => setShowing((count) => count + PAGE_OF_PASSES)}>
            Show {Math.min(PAGE_OF_PASSES, visible.length - showing)} more
          </Button>
          <span className="text-small text-ink-muted">
            {showing} of {plural(visible.length, "pass", "passes")} shown
          </span>
        </div>
      ) : null}
    </>
  );
}

// ── One satellite ─────────────────────────────────────────────────────────────

function Readout({ state, placeKnown }: { state: SatelliteState; placeKnown: boolean }) {
  const rows: Array<[string, ReactNode]> = [
    [
      "Over",
      `${Math.abs(state.lat).toFixed(2)}° ${state.lat >= 0 ? "N" : "S"}, ${Math.abs(state.lon).toFixed(2)}° ${state.lon >= 0 ? "E" : "W"}`,
    ],
    ["Height", `${Math.round(state.altitudeKm).toLocaleString("en-GB")} km`],
    ["Speed", `${state.velocityKmS.toFixed(2)} km/s`],
  ];
  if (placeKnown) {
    rows.push(
      ["Bearing", `${state.azimuthDeg.toFixed(1)}° ${compassPoint(state.azimuthDeg)}`],
      ["Elevation", `${state.elevationDeg >= 0 ? "" : "−"}${Math.abs(state.elevationDeg).toFixed(1)}°`],
      ["Distance", `${Math.round(state.rangeKm).toLocaleString("en-GB")} km`],
      [
        "Coming nearer",
        state.rangeRateKmS < 0
          ? `yes, at ${Math.abs(state.rangeRateKmS).toFixed(2)} km/s`
          : `no, going away at ${state.rangeRateKmS.toFixed(2)} km/s`,
      ],
    );
  }
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-small sm:grid-cols-[auto_1fr_auto_1fr]">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-ink-muted">{label}</dt>
          <dd className="text-ink tabular">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Transmitters({
  transmitters,
  state,
  placeKnown,
  licensed,
  metadata,
}: {
  transmitters: SatelliteTransmitter[];
  state: SatelliteState;
  placeKnown: boolean;
  licensed: boolean;
  metadata: "catalogue" | "manual" | "none";
}) {
  if (metadata === "manual")
    return (
      <p className="text-small text-ink-muted">
        Pasted elements carry no transmitters. Choose the satellite from the kept list to see SatNOGS DB's.
      </p>
    );
  if (transmitters.length === 0)
    return (
      <p className="text-small text-ink-muted">
        {metadata === "none"
          ? "No transmitters have been fetched from SatNOGS DB yet."
          : "SatNOGS DB lists no transmitter in use on this satellite."}
      </p>
    );
  return (
    <div>
      <Table label="Transmitters, with the frequencies corrected for Doppler now" stack>
        <TableHead>
          <Tr>
            <Th>What</Th>
            <Th numeric>Down: published, and to listen on now</Th>
            <Th numeric>Up: published{licensed ? ", and to send on now" : ""}</Th>
          </Tr>
        </TableHead>
        <tbody>
          {transmitters.map((transmitter) => {
            const tuned = dopplerTuning(state.rangeRateKmS, transmitter.downlinkLowHz, transmitter.uplinkLowHz);
            const up = placeKnown && state.elevationDeg > 0;
            return (
              <Tr key={transmitter.id} className="last:border-b-0">
                <Td label="What">
                  {transmitter.description}
                  <span className="block text-ink-muted">
                    <Joined
                      parts={[
                        transmitter.mode,
                        transmitter.type,
                        transmitter.invert ? "inverting" : null,
                        transmitter.baud ? `${transmitter.baud} baud` : null,
                      ]}
                    />
                  </span>
                </Td>
                <Td label="Down" numeric>
                  {transmitter.downlinkLowHz ? (
                    <span>
                      {frequencyWords(transmitter.downlinkLowHz)}
                      {transmitter.downlinkHighHz && transmitter.downlinkHighHz !== transmitter.downlinkLowHz
                        ? ` to ${frequencyWords(transmitter.downlinkHighHz)}`
                        : ""}
                      {up && tuned.downlinkHz ? (
                        <span className="block text-ink-muted">
                          now {frequencyWords(tuned.downlinkHz)} ({shiftWords(tuned.downlinkHz - transmitter.downlinkLowHz)})
                        </span>
                      ) : null}
                    </span>
                  ) : (
                    "none"
                  )}
                </Td>
                <Td label="Up" numeric>
                  {transmitter.uplinkLowHz ? (
                    <span>
                      {frequencyWords(transmitter.uplinkLowHz)}
                      {transmitter.uplinkHighHz && transmitter.uplinkHighHz !== transmitter.uplinkLowHz
                        ? ` to ${frequencyWords(transmitter.uplinkHighHz)}`
                        : ""}
                      {up && licensed && tuned.uplinkHz ? (
                        <span className="block text-ink-muted">
                          now {frequencyWords(tuned.uplinkHz)} ({shiftWords(tuned.uplinkHz - transmitter.uplinkLowHz)})
                        </span>
                      ) : null}
                    </span>
                  ) : (
                    "none"
                  )}
                </Td>
              </Tr>
            );
          })}
        </tbody>
      </Table>
      <p className="mt-2 text-small text-ink-muted">
        {placeKnown
          ? "The corrected frequencies are shown while the satellite is above the horizon here. A satellite coming nearer is heard higher than published."
          : "Choose a place to see the frequencies corrected for Doppler."}{" "}
        {licensed ? "" : "Sending to a satellite needs an amateur licence: uplinks are listed for reference."} From SatNOGS DB (CC BY-SA
        4.0); a transmitter listed as in use may still be off.
      </p>
    </div>
  );
}

/** MHz to a tenth of a kHz, with no unit: the unit is in the column's name, so the figure fits a phone. */
const mhz = (hz: number) => (hz / 1e6).toFixed(4);

/**
 * Where to point minute by minute through the pass, and, for a satellite with a downlink,
 * what to tune to: the main transmitter at first (a transponder or repeater before a
 * beacon), any other chosen from a list. Satellites with no live downlink keep the
 * look angles.
 */
function ThroughThePass({
  path,
  transmitters,
  licensed,
  alwaysUp = false,
}: {
  path: SatelliteState[];
  transmitters: SatelliteTransmitter[];
  licensed: boolean;
  /** Up all day (geostationary): a few looks through the day, not one a minute. */
  alwaysUp?: boolean;
}) {
  const choices = useMemo(() => byMain(transmitters), [transmitters]);
  const [chosenId, setChosenId] = useState<string | null>(null);
  const transmitter = choices.find((item) => item.id === chosenId) ?? choices[0] ?? null;
  // One line a minute from the rise to the set, each the look nearest that minute, no minute twice.
  const rows = useMemo(() => {
    // Times are written to the minute (cut, not rounded), so the first look in each written minute.
    const nearest = new Map<number, SatelliteState>();
    const ends = new Set([Math.floor(path[0]!.at.getTime() / 60_000), Math.floor(path.at(-1)!.at.getTime() / 60_000)]);
    for (const point of path.slice(1, -1)) {
      const minute = Math.floor(point.at.getTime() / 60_000);
      if (!ends.has(minute) && !nearest.has(minute)) nearest.set(minute, point);
    }
    if (alwaysUp) return path.filter((_, index) => index % 5 === 0);
    return [path[0]!, ...[...nearest.values()].sort((a, b) => a.at.getTime() - b.at.getTime()), path.at(-1)!];
  }, [path, alwaysUp]);
  const down = transmitter?.downlinkLowHz ?? null;
  const up = licensed ? (transmitter?.uplinkLowHz ?? null) : null;
  const named = (item: SatelliteTransmitter) => `${item.description}${item.mode ? `, ${item.mode}` : ""}`;
  return (
    <Disclosure
      summary={
        alwaysUp
          ? transmitter
            ? "Where to point and what to tune to, through the day"
            : "Where to point, through the day"
          : transmitter
            ? "Where to point and what to tune to, minute by minute"
            : "Where to point, minute by minute"
      }
      className="mt-4"
    >
      {choices.length > 1 && transmitter ? (
        <Field label="Transmitter" className="max-w-md">
          {(ids) => (
            <Select
              id={ids.id}
              value={transmitter.id}
              onChange={setChosenId}
              options={choices.map((item) => ({ value: item.id, label: named(item) }))}
            />
          )}
        </Field>
      ) : transmitter ? (
        <p className="text-ink-muted">For {named(transmitter)}.</p>
      ) : (
        <p className="text-ink-muted">No downlink in use is listed for this satellite: these are where to point only.</p>
      )}
      <Table label={transmitter ? "Look angles and frequencies through the pass" : "Look angles through the pass"}>
        <TableHead>
          <Tr>
            <Th numeric className="px-2">
              UTC
            </Th>
            <Th numeric className="px-2">
              Bearing
            </Th>
            <Th numeric className="px-2">
              Height
            </Th>
            {down ? (
              <Th numeric className="px-2">
                Listen on, MHz
              </Th>
            ) : null}
            {up ? (
              <Th numeric className="px-2">
                Send on, MHz
              </Th>
            ) : null}
          </Tr>
        </TableHead>
        <tbody>
          {rows.map((point) => {
            const tuned = dopplerTuning(point.rangeRateKmS, down, up);
            return (
              <Tr key={point.at.getTime()}>
                <Td numeric className="px-2 py-1.5">
                  {utcTime(point.at)}
                </Td>
                <Td numeric className="px-2 py-1.5 whitespace-nowrap">
                  {Math.round(point.azimuthDeg)}° {compassPoint(point.azimuthDeg)}
                </Td>
                <Td numeric className="px-2 py-1.5">
                  {Math.max(0, Math.round(point.elevationDeg))}°
                </Td>
                {down ? (
                  <Td numeric className="px-2 py-1.5">
                    {tuned.downlinkHz ? mhz(tuned.downlinkHz) : ""}
                  </Td>
                ) : null}
                {up ? (
                  <Td numeric className="px-2 py-1.5">
                    {tuned.uplinkHz ? mhz(tuned.uplinkHz) : ""}
                  </Td>
                ) : null}
              </Tr>
            );
          })}
        </tbody>
      </Table>
      {transmitter?.downlinkHighHz && transmitter.downlinkHighHz !== transmitter.downlinkLowHz ? (
        <p className="text-ink-muted">
          Worked out at the low edge of its passband, {frequencyWords(transmitter.downlinkLowHz!)}; elsewhere in it the shift is nearly the
          same.
        </p>
      ) : null}
    </Disclosure>
  );
}

function PasteDialog({
  open,
  onOpenChange,
  onUse,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUse: (satellite: ManualSatellite) => void;
}) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ManualSatellite | null>(null);
  const check = () => {
    try {
      setPreview(parseManualElements(text));
      setError(null);
    } catch (reason) {
      setPreview(null);
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Paste orbital elements"
        description="One two-line element set (TLE), or one OMM object as JSON or as KEY = VALUE lines. It stays in this tab: it is not sent to the server or kept."
      >
        <DialogBody className="grid gap-3">
          <Field label="Elements" error={error ?? undefined}>
            {(ids) => (
              <textarea
                {...ids}
                rows={8}
                value={text}
                spellCheck={false}
                onChange={(event) => {
                  setText(event.target.value);
                  setPreview(null);
                  setError(null);
                }}
                className="w-full rounded-control border border-border-strong bg-page p-2 font-mono text-small text-ink"
                placeholder={"ISS (ZARYA)\n1 25544U 98067A …\n2 25544 …"}
              />
            )}
          </Field>
          {preview ? (
            <Notice tone={preview.warnings.length ? "warning" : "success"} title={`${preview.name}, NORAD ${preview.noradId}`}>
              {preview.format}, dated {formatDate(preview.epoch)} {utcTime(preview.epoch)} UTC.{" "}
              {preview.warnings.join(" ") || "The elements start SGP4 and are recent."}
            </Notice>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          {preview ? (
            <Button
              variant="primary"
              onClick={() => {
                onUse(preview);
                onOpenChange(false);
              }}
            >
              Use these elements
            </Button>
          ) : (
            <Button variant="primary" onClick={check}>
              Check
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PassPdfDialog({
  open,
  onOpenChange,
  sheetOf,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sheetOf: () => PassSheet | null;
}) {
  // The pass as it was when the dialog opened: the screen's clock moves on, the paper does not.
  const latest = useRef(sheetOf);
  latest.current = sheetOf;
  const [sheet, setSheet] = useState<PassSheet | null>(null);
  useEffect(() => {
    setSheet(open ? latest.current() : null);
  }, [open]);
  const make = useCallback(() => passDocument(sheet as PassSheet, likelyPaperFor(deviceRegion())), [sheet]);
  const made = useKitPdf(sheet ? make : null, {
    title: sheet ? passTitle(sheet) : "Satellite pass",
    kind: "Satellite pass",
    from: { what: "Satellites", path: PATH },
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="This pass as a PDF"
        description="Where it crosses the sky and the ground below, where to point minute by minute and what to tune to, to take outside. Made on this device."
      >
        <DialogBody className="grid gap-3">
          {made.status === "making" ? <p className="text-small text-ink-muted">Making the PDF…</p> : null}
          {made.status === "failed" ? <Notice tone="danger">The PDF could not be made: {made.error}</Notice> : null}
          <PdfActions pdf={kitPdfOf(made)} />
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

function OneSatellite({
  satellites,
  transmitters,
  transmittersFetched,
  about,
  wikipedia,
  detailsFetched,
  observer,
  placeName,
  selected,
  onSelect,
  passAos,
  onPass,
  focusKey,
}: {
  satellites: SatelliteElements[];
  transmitters: SatelliteTransmitter[];
  transmittersFetched: boolean;
  about: SatelliteAbout[];
  wikipedia: SatelliteWikipedia[];
  detailsFetched: boolean;
  observer: ObserverLocation | null;
  placeName: string;
  selected: Shown | null;
  onSelect: (shown: Shown) => void;
  passAos: number | null;
  onPass: (aos: number | null) => void;
  /** Changes each time a pass or satellite is opened from another tab: the heading then takes the focus. */
  focusKey: number;
}) {
  const now = useNow(1000);
  const licence = useRadioLicence();
  const navigate = useNavigate();
  const { land } = useLand();
  const [, setChosen] = useChosenSatellite();
  const [group, setGroup] = useState<"all" | SatelliteGroup>("all");
  const [pasting, setPasting] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [allPasses, setAllPasses] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  // Opened from Passes or Weather satellites: to the satellite's name, so the place on the screen and the focus go together.
  useEffect(() => {
    if (focusKey === 0) return;
    heading.current?.focus({ preventScroll: true });
    heading.current?.scrollIntoView({ block: "start" });
  }, [focusKey]);
  const options = satellites.filter((satellite) => group === "all" || inGroup(satellite, group));
  const bucket = Math.floor(now.getTime() / BUCKET_MS);
  const passes = useMemo(() => {
    if (!selected || !observer) return [];
    try {
      return predictPasses(selected.orbit, observer, new Date(bucket * BUCKET_MS), 24, 18);
    } catch {
      return [];
    }
  }, [selected, observer, bucket]);
  const live = passes.filter((pass) => pass.los > now);
  const pass = (passAos !== null ? live.find((item) => Math.abs(item.aos.getTime() - passAos) < 60_000) : undefined) ?? live[0] ?? null;
  const path = useMemo(
    () => (selected && observer && pass ? passSkyPath(selected.orbit, observer, pass, 60) : []),
    [selected, observer, pass],
  );
  let state: SatelliteState | null = null;
  let failure: string | null = null;
  if (selected) {
    try {
      state = satelliteState(selected.orbit, observer ?? { lat: 0, lon: 0 }, now);
    } catch (reason) {
      failure = reason instanceof Error ? reason.message : String(reason);
    }
  }
  const own = selected && !selected.manual ? liveTransmitters(transmitters, selected.noradId) : [];
  const kept = selected && !selected.manual ? satellites.find((satellite) => satellite.noradId === selected.noradId) : undefined;
  const warning = selected ? elementsAgeWarning(selected.epoch, now.getTime()) : null;
  const sheetOf = (): PassSheet | null =>
    selected && pass && observer
      ? {
          name: selected.name,
          noradId: selected.noradId,
          epoch: selected.epoch,
          place: placeName,
          pass,
          path: passSkyPath(selected.orbit, observer, pass, pass.alwaysUp ? 2 : Math.max(2, Math.round(pass.durationSeconds / 60))),
          transmitters: byMain(own).concat(own.filter((item) => item.downlinkLowHz === null)),
          written: new Date(),
          licensed: licence.licensed,
          ground: {
            samples: pass.alwaysUp
              ? sampleTrack(
                  selected.orbit,
                  observer,
                  new Date(pass.tca.getTime() - 45 * 60_000),
                  new Date(pass.tca.getTime() + 45 * 60_000),
                )
              : sampleTrack(
                  selected.orbit,
                  observer,
                  new Date(pass.aos.getTime() - 45 * 60_000),
                  new Date(pass.los.getTime() + 45 * 60_000),
                ),
            home: observer,
            land,
          },
        }
      : null;
  // The first few passes, and the one chosen wherever it is in the list.
  const listed = allPasses ? live : live.filter((item, index) => index < FIRST_PASSES || item.aos.getTime() === pass?.aos.getTime());

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end gap-4">
        <Field label="Show" className="w-full sm:w-56">
          {(ids) => (
            <Select
              id={ids.id}
              value={group}
              onChange={setGroup}
              options={[
                { value: "all" as const, label: "Every kept satellite" },
                ...SATELLITE_GROUPS.map((item) => ({ value: item.id, label: item.label })),
              ]}
            />
          )}
        </Field>
        <Field label="Satellite" className="min-w-[min(16rem,100%)] flex-1">
          {(ids) => (
            <SatellitePicker
              id={ids.id}
              value={selected && !selected.manual ? String(selected.noradId) : undefined}
              placeholder={selected?.manual ? `${selected.name} (pasted)` : "Choose a satellite"}
              onChange={(value) => {
                const found = satellites.find((satellite) => String(satellite.noradId) === value);
                if (found) onSelect(fromCatalogue(found));
              }}
              choices={options.map((satellite) => ({
                value: String(satellite.noradId),
                name: satellite.name,
                noradId: satellite.noradId,
              }))}
            />
          )}
        </Field>
        <Button onClick={() => setPasting(true)}>Paste elements</Button>
      </div>
      <PasteDialog open={pasting} onOpenChange={setPasting} onUse={(manual) => onSelect({ ...manual, groups: [], manual })} />

      {!selected ? (
        <p className="text-small text-ink-muted">Choose a satellite.</p>
      ) : (
        <>
          <h2 ref={heading} tabIndex={-1} className="scroll-mt-16 font-title text-heading text-ink focus:outline-none md:scroll-mt-4">
            {selected.name}
          </h2>
          <p className="text-small text-ink-muted">
            <Joined
              parts={[
                `NORAD ${selected.noradId}`,
                `elements dated ${formatDate(selected.epoch)} ${utcTime(selected.epoch)} UTC`,
                selected.manual ? `pasted ${selected.manual.format}, not kept` : null,
              ]}
            />
          </p>
          {warning ? (
            <Notice tone="warning" className="mt-3">
              {warning}
            </Notice>
          ) : null}
          {failure ? (
            <Notice tone="danger" className="mt-3">
              {failure}
            </Notice>
          ) : null}

          <Section title="Passes in the next 24 hours" className="mt-6">
            {!observer ? (
              <p className="text-small text-ink-muted">Choose a place above to see passes.</p>
            ) : live.length === 0 ? (
              <p className="text-small text-ink-muted">No pass over {placeName} in the next 24 hours.</p>
            ) : (
              <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
                {pass ? (
                  <div className="lg:order-2">
                    <h3 className="text-body font-semibold text-ink">Sky track</h3>
                    <p className="mb-2 text-small text-ink-muted">
                      {pass.alwaysUp ? (
                        `${alwaysUpWords(pass)}: it does not rise or set.`
                      ) : (
                        <>
                          {pass.aos <= now ? "Up now. " : `${dayWords(pass.aos, now)}. `}Rises {bothTimes(pass.aos)}, highest{" "}
                          {Math.round(pass.maxElevationDeg)}° at {utcTime(pass.tca)} UTC, sets {utcTime(pass.los)} UTC.
                        </>
                      )}
                    </p>
                    <SkyPlot pass={pass} path={path} now={now} />
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button onClick={() => setPrinting(true)}>
                        <Download aria-hidden />
                        This pass as a PDF
                      </Button>
                      {!selected.manual ? (
                        <Button
                          onClick={() => {
                            setChosen(selected.noradId);
                            navigate(`/maps?satellite=${selected.noradId}`);
                          }}
                        >
                          <MapIcon aria-hidden />
                          Show on the map
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ) : null}
                <div className="lg:order-1">
                  <Rows className="border-y border-border" aria-label="Passes">
                    {listed.map((item) => {
                      const chosen = pass?.aos.getTime() === item.aos.getTime();
                      return (
                        <li key={item.aos.getTime()}>
                          <button
                            type="button"
                            aria-pressed={chosen}
                            onClick={() => onPass(item.aos.getTime())}
                            className={cn(
                              "w-full border-l-4 py-2.5 pl-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-focus",
                              chosen ? "border-primary bg-primary-soft" : "border-transparent hover:bg-surface",
                            )}
                          >
                            <span className={cn("block text-body text-ink tabular", chosen && "font-semibold")}>
                              {item.alwaysUp
                                ? "Up all the time"
                                : item.aos <= now
                                  ? "Up now"
                                  : `${dayWords(item.aos, now)}, ${bothTimes(item.aos)}`}
                            </span>
                            <span className="block text-small text-ink-muted">
                              <Joined
                                parts={
                                  item.alwaysUp
                                    ? [alwaysUpWords(item), chosen ? "shown" : null]
                                    : [
                                        `highest ${Math.round(item.maxElevationDeg)}°`,
                                        `${Math.round(item.durationSeconds / 60)} min`,
                                        `${compassPoint(item.aosAzimuthDeg)} to ${compassPoint(item.losAzimuthDeg)}`,
                                        chosen ? "shown" : null,
                                      ]
                                }
                              />
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </Rows>
                  {live.length > listed.length ? (
                    <Button variant="ghost" className="mt-2" onClick={() => setAllPasses(true)}>
                      Show all {live.length} passes
                    </Button>
                  ) : null}
                </div>
              </div>
            )}
            {pass && path.length > 0 ? (
              <ThroughThePass path={path} transmitters={own} licensed={licence.licensed} alwaysUp={pass.alwaysUp === true} />
            ) : null}
          </Section>

          {state ? (
            <Section
              title={
                !observer
                  ? "Where it is now"
                  : state.elevationDeg > 0
                    ? `Above the horizon at ${placeName} now`
                    : `Below the horizon at ${placeName} now`
              }
              className="mt-10"
            >
              <Readout state={state} placeKnown={observer !== null} />
              <GroundTrack orbit={selected.orbit} observer={observer} placeName={placeName} now={now} pass={pass} passes={live} />
            </Section>
          ) : null}
          {state ? (
            <Section title="Frequencies and modes" className="mt-10">
              <Transmitters
                transmitters={own}
                state={state}
                placeKnown={observer !== null}
                licensed={licence.licensed}
                metadata={selected.manual ? "manual" : transmittersFetched ? "catalogue" : "none"}
              />
            </Section>
          ) : null}
          {kept ? (
            <AboutSatellite
              noradId={kept.noradId}
              about={about.find((item) => item.noradId === kept.noradId) ?? null}
              elements={kept.elements}
              transmitters={transmitters.filter((item) => item.noradId === kept.noradId)}
              wikipedia={wikipedia.find((item) => item.noradId === kept.noradId) ?? null}
              detailsFetched={detailsFetched}
            />
          ) : null}
          <PassPdfDialog open={printing} onOpenChange={setPrinting} sheetOf={sheetOf} />
        </>
      )}
    </>
  );
}

// ── Weather satellites ──────────────────────────────────────────────────────

function WeatherTab({
  satellites,
  transmitters,
  observer,
  now,
  onOpen,
}: {
  satellites: SatelliteElements[];
  transmitters: SatelliteTransmitter[];
  observer: ObserverLocation;
  now: Date;
  onOpen: (noradId: number, aos: number) => void;
}) {
  const weather = useMemo(() => {
    const all = satellites.filter((satellite) => inGroup(satellite, "weather"));
    const withDownlink = all.filter((satellite) =>
      liveTransmitters(transmitters, satellite.noradId).some((item) => item.downlinkLowHz !== null),
    );
    return (withDownlink.length > 0 ? withDownlink : all).slice(0, 16);
  }, [satellites, transmitters]);
  const bucket = Math.floor(now.getTime() / BUCKET_MS);
  const from = useMemo(() => new Date(bucket * BUCKET_MS), [bucket]);
  const schedule = usePassSchedule(weather, observer, from, { hours: 12 });
  const shown = schedule.entries.filter((entry) => entry.pass.los > now).slice(0, 18);
  return (
    <>
      <p className="mb-3 text-small text-ink-muted" role="status">
        {schedule.computing
          ? `Working out passes: ${schedule.done} of ${schedule.total} satellites…`
          : `The next 12 hours of passes of ${plural(weather.length, "weather satellite")} with a downlink listed. Pictures need a receiver and decoding software; this only says when and where.`}
      </p>
      {shown.length === 0 && !schedule.computing ? (
        <p className="text-small text-ink-muted">No pass in the next 12 hours.</p>
      ) : (
        <Rows className="border-y border-border">
          {shown.map((entry) => {
            const downlink = liveTransmitters(transmitters, entry.satellite.noradId).find((item) => item.downlinkLowHz !== null);
            return (
              <li key={`${entry.satellite.noradId}-${entry.pass.aos.getTime()}`}>
                <button
                  type="button"
                  onClick={() => onOpen(entry.satellite.noradId, entry.pass.aos.getTime())}
                  className="w-full py-3 text-left hover:bg-surface focus-visible:outline-2 focus-visible:outline-focus"
                >
                  <span className="block text-lead text-ink">{entry.satellite.name}</span>
                  <span className="block text-small text-ink tabular">
                    {dayWords(entry.pass.aos, now)}, {bothTimes(entry.pass.aos)} to {utcTime(entry.pass.los)} UTC
                  </span>
                  <span className="block text-small text-ink-muted">
                    <Joined
                      parts={[
                        `${geometryWords(entry.pass.maxElevationDeg)}, highest ${Math.round(entry.pass.maxElevationDeg)}°`,
                        lightAt(observer.lat, observer.lon, entry.pass.tca),
                        downlink?.downlinkLowHz
                          ? `${frequencyWords(downlink.downlinkLowHz)}${downlink.mode ? ` ${downlink.mode}` : ""}`
                          : "downlink not listed",
                      ]}
                    />
                  </span>
                </button>
              </li>
            );
          })}
        </Rows>
      )}
    </>
  );
}

// ── The screen ──────────────────────────────────────────────────────────────

export default function SatellitesPage() {
  useClockStyle();
  const data = useSatellites();
  const markers = useMarkers();
  const now = useNow(30_000);
  // Seen from the current household's home: its saved place, or where it was last said to be (with its age).
  const homeOf = useHome();
  const home = homeOf.home;
  const [place, setPlace] = useState<PlaceField | null>(null);
  const field: PlaceField =
    place ??
    (home ? { text: `${home.lat.toFixed(5)}, ${home.lon.toFixed(5)}`, name: homeLabel(home, now.getTime()) } : { text: "", name: "" });
  const found = parseCoordinates(field.text);
  const lat = found?.lat;
  const lon = found?.lon;
  const observer = useMemo<ObserverLocation | null>(() => (lat !== undefined && lon !== undefined ? { lat, lon } : null), [lat, lon]);
  const placeName = field.name || (found ? `${found.lat.toFixed(3)}, ${found.lon.toFixed(3)}` : "");
  const [tab, setTab] = useState("passes");
  const [chosen, setChosen] = useChosenSatellite();
  const [selected, setSelected] = useState<Shown | null>(null);
  const [passAos, setPassAos] = useState<number | null>(null);
  const [focusKey, setFocusKey] = useState(0);
  const satellites = data.data?.satellites ?? [];
  const amateur = useMemo(() => satellites.filter((satellite) => inGroup(satellite, "amateur")), [satellites]);
  const current =
    selected ??
    (() => {
      const found =
        satellites.find((satellite) => satellite.noradId === chosen) ??
        satellites.find((satellite) => satellite.noradId === ISS) ??
        satellites[0];
      return found ? fromCatalogue(found) : null;
    })();
  const open = (noradId: number, aos: number) => {
    const found = satellites.find((satellite) => satellite.noradId === noradId);
    if (!found) return;
    setSelected(fromCatalogue(found));
    setChosen(noradId);
    setPassAos(aos);
    setTab("one");
    setFocusKey((key) => key + 1);
  };

  return (
    <Page width="wide">
      <PageHeader
        title="Satellites"
        description="When the amateur, weather and crewed satellites pass over, where they are now, and what to tune to through a pass. Worked out on this device."
      />
      <LicenceLine use="listen-and-transmit" className="mb-6" />

      {data.isPending ? (
        <div className="grid gap-3">
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : data.isError ? (
        <ErrorState error={data.error} onRetry={() => void data.refetch()} />
      ) : (
        <>
          <ElementsStatus data={data.data} now={now} />
          {satellites.length > 0 ? (
            <>
              <div className="mb-6 max-w-xl">
                <PlaceInput
                  label="Seen from"
                  what="the place to see the satellites from"
                  value={field}
                  onChange={setPlace}
                  places={markers.data ?? []}
                />
                {!home && !place && !homeOf.isPending ? <NoHome className="mt-1" /> : null}
                {home && !place ? <HomeAsOf home={home} now={now.getTime()} className="mt-1" /> : null}
              </div>
              <Tabs value={tab} onValueChange={setTab}>
                <TabsList aria-label="Satellites">
                  <TabsTrigger value="passes">Passes</TabsTrigger>
                  <TabsTrigger value="one">One satellite</TabsTrigger>
                  <TabsTrigger value="weather">Weather satellites</TabsTrigger>
                </TabsList>
                <TabsContent value="passes" className="pt-4">
                  {observer ? (
                    <PassesTab amateur={amateur} observer={observer} now={now} onOpen={open} />
                  ) : (
                    <p className="text-small text-ink-muted">Give a place above to see passes.</p>
                  )}
                </TabsContent>
                <TabsContent value="one" className="pt-4">
                  <OneSatellite
                    satellites={satellites}
                    transmitters={data.data.transmitters}
                    transmittersFetched={data.data.sources[1]?.fetchedAt != null}
                    about={data.data.about ?? []}
                    wikipedia={data.data.wikipedia ?? []}
                    detailsFetched={data.data.sources.find((source) => source.id === "satnogs-satellites")?.fetchedAt != null}
                    observer={observer}
                    placeName={placeName}
                    selected={current}
                    onSelect={(shown) => {
                      setSelected(shown);
                      setPassAos(null);
                      if (!shown.manual) setChosen(shown.noradId);
                    }}
                    passAos={passAos}
                    onPass={setPassAos}
                    focusKey={focusKey}
                  />
                </TabsContent>
                <TabsContent value="weather" className="pt-4">
                  {observer ? (
                    <WeatherTab satellites={satellites} transmitters={data.data.transmitters} observer={observer} now={now} onOpen={open} />
                  ) : (
                    <p className="text-small text-ink-muted">Give a place above to see passes.</p>
                  )}
                </TabsContent>
              </Tabs>
              <p className="mt-10 border-t border-border pt-3 text-small text-ink-muted">
                {SATELLITE_SOURCES.celestrak.attribution} {SATELLITE_SOURCES.satnogs.attribution}{" "}
                {SATELLITE_SOURCES["satnogs-satellites"].attribution} Positions and passes by SGP4 (satellite.js), worked out in this
                browser. Every time depends on this server's clock being right. How it works:{" "}
                <Link to="/help/satellites" className="text-primary underline underline-offset-2">
                  the Satellites guide
                </Link>
                .
              </p>
            </>
          ) : null}
        </>
      )}
    </Page>
  );
}
