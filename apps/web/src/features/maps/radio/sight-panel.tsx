/**
 * The line-of-sight tool in the panel beside the map: the two ends, the antenna
 * heights and the frequency, the answer in words, the path drawn from the side, and
 * what the answer does and does not rest on.
 */
import { haversineMeters } from "@outpost/shared";
import { ArrowLeftRight, CircleAlert, CircleQuestionMark, X } from "lucide-react";
import { useRef, useState } from "react";
import { Notice } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Select, Skeleton } from "@/components/ui/misc";
import { errorMessage } from "@/lib/api";
import { formatPosition, type ReadoutFormat } from "../lib/coords";
import { formatBearing, formatDistanceWithMiles, initialBearing } from "../lib/geo";
import { locatorOf } from "./locator";
import { BANDS, type BandId, describeTerrain, formatFrequency, MAX_ANTENNA_METERS, MAX_MHZ, MIN_MHZ } from "./sight";
import { SIGHT_ICONS } from "./sight-card";
import { SightChart } from "./sight-chart";
import type { Sight, SightEnd, SightEndName } from "./use-sight";

const BAND_OPTIONS: Array<{ value: BandId; label: string }> = [
  ...BANDS.map((band) => ({ value: band.id, label: `${band.name} (${formatFrequency(band.mhz)})` })),
  { value: "other", label: "Another frequency" },
];

/** A number typed by hand. What is typed is kept as typed; a value is passed on only while it is one that can be used. */
function NumberField({
  label,
  value,
  min,
  max,
  unit,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  unit: string;
  onChange: (value: number) => void;
}) {
  const [text, setText] = useState(String(value));
  const usable = (entry: string) => {
    const number = Number(entry.replace(",", "."));
    return entry.trim() !== "" && Number.isFinite(number) && number >= min && number <= max ? number : null;
  };
  // Changed from outside to something other than what is typed (the ends were swapped): show the new value.
  const seen = useRef(value);
  if (value !== seen.current) {
    seen.current = value;
    if (usable(text) !== value) setText(String(value));
  }
  return (
    <Field label={label} error={usable(text) === null ? `From ${min} to ${max.toLocaleString("en-GB")} ${unit}.` : undefined}>
      {(ids) => (
        <div className="relative">
          <Input
            {...ids}
            inputMode="decimal"
            autoComplete="off"
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              const next = usable(event.target.value);
              if (next !== null) onChange(next);
            }}
            className="tabular pr-12"
          />
          <span aria-hidden className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-small text-ink-muted">
            {unit}
          </span>
        </div>
      )}
    </Field>
  );
}

export function SightPanel({
  sight,
  format,
  mapReady,
  onDone,
  onOpenOffline,
}: {
  sight: Sight;
  format: ReadoutFormat;
  /** False when the map could not be drawn, so there is nowhere to choose a point. */
  mapReady: boolean;
  onDone: () => void;
  /** Opens the part of the panel where terrain is downloaded. */
  onOpenOffline: () => void;
}) {
  const { from, to, picking, settings, setSettings, profile, result, samples, reading } = sight;
  // The locator is given beside the position, so the position is never a second locator.
  const shown = format === "maidenhead" ? "decimal" : format;
  const Icon = reading ? SIGHT_ICONS[reading.tone] : CircleQuestionMark;
  const distance = from && to ? haversineMeters(from.position.lat, from.position.lon, to.position.lat, to.position.lon) : null;

  const end = (label: "A" | "B", value: SightEnd | null, which: SightEndName) => (
    <div className="flex items-start gap-3 border-b border-border py-2">
      {/* The same lettered dot as marks this end on the map. */}
      <dt className="mt-0.5 grid size-5 shrink-0 place-content-center rounded-full bg-ink text-micro font-semibold text-page">
        <span className="sr-only">Point </span>
        {label}
      </dt>
      <dd className="tabular min-w-0 flex-1 text-small text-ink">
        {value ? (
          <>
            {value.name ? <span className="block truncate font-medium">{value.name}</span> : null}
            <span className="block font-mono text-[0.8125rem]">{locatorOf(value.position)}</span>
            <span className="block font-mono text-[0.8125rem] text-ink-muted">
              {formatPosition(value.position.lat, value.position.lon, shown).text}
            </span>
          </>
        ) : (
          <span className="text-ink-muted">{picking === which ? "Being chosen on the map" : "Not chosen yet"}</span>
        )}
      </dd>
      {mapReady && picking !== which ? (
        <Button
          size="sm"
          variant="ghost"
          aria-label={`${value ? "Move" : "Choose"} point ${label}`}
          onClick={() => sight.pick(which)}
          className="-my-1 shrink-0"
        >
          {value ? "Move" : "Choose"}
        </Button>
      ) : null}
    </div>
  );

  return (
    <section aria-label="Line of sight" className="flex min-h-0 flex-1 flex-col">
      {/* On a phone with the sheet lowered this line is all of the tool that shows in it: its one title, and what puts it down. */}
      <div
        data-sheet-peek
        className="sticky top-0 z-[1] flex min-h-11 shrink-0 items-center justify-between gap-2 border-b border-border bg-page pr-2 pl-4 max-md:min-h-[3.25rem]"
      >
        <h2 className="text-body font-semibold text-ink">Line of sight</h2>
        <Button variant="ghost" size="icon-sm" aria-label="Stop checking line of sight" onClick={onDone}>
          <X />
        </Button>
      </div>
      <div className="scroll-quiet grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] content-start gap-4 overflow-y-auto px-4 py-3">
        {picking ? (
          <p className="text-small text-ink-muted" aria-live="polite">
            {picking === "from"
              ? "Click or tap the map where the first antenna is: point A."
              : "Now click or tap where the other antenna is: point B."}{" "}
            Pressing a saved place puts the point exactly on it.
          </p>
        ) : null}

        <dl className="border-t border-border">
          {end("A", from, "from")}
          {end("B", to, "to")}
          {from && to && distance !== null ? (
            <>
              <div className="flex items-baseline justify-between gap-3 border-b border-border py-2">
                <dt className="shrink-0 text-small text-ink-muted">Distance</dt>
                <dd className="tabular text-right text-small text-ink">{formatDistanceWithMiles(distance)}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3 border-b border-border py-2">
                <dt className="shrink-0 text-small text-ink-muted">Bearing</dt>
                <dd className="tabular text-right text-small text-ink">
                  <span className="block">A to B {formatBearing(initialBearing(from.position, to.position))}</span>
                  <span className="block">B to A {formatBearing(initialBearing(to.position, from.position))}</span>
                </dd>
              </div>
            </>
          ) : null}
        </dl>

        <div className="grid grid-cols-2 gap-x-3 gap-y-3">
          <NumberField
            label="Antenna at A"
            value={settings.antennaFrom}
            min={0}
            max={MAX_ANTENNA_METERS}
            unit="m"
            onChange={(antennaFrom) => setSettings((current) => ({ ...current, antennaFrom }))}
          />
          <NumberField
            label="Antenna at B"
            value={settings.antennaTo}
            min={0}
            max={MAX_ANTENNA_METERS}
            unit="m"
            onChange={(antennaTo) => setSettings((current) => ({ ...current, antennaTo }))}
          />
          <p className="col-span-2 -mt-1.5 text-small text-ink-muted">Height above the ground each antenna stands on.</p>
          <Field label="Band" className={settings.band === "other" ? "" : "col-span-2"}>
            {(ids) => (
              <Select
                {...ids}
                value={settings.band}
                onChange={(band) => setSettings((current) => ({ ...current, band }))}
                options={BAND_OPTIONS}
              />
            )}
          </Field>
          {settings.band === "other" ? (
            <NumberField
              label="Frequency"
              value={settings.otherMHz}
              min={MIN_MHZ}
              max={MAX_MHZ}
              unit="MHz"
              onChange={(otherMHz) => setSettings((current) => ({ ...current, otherMHz }))}
            />
          ) : null}
        </div>

        {!from || !to ? null : profile.isPending ? (
          <div className="grid gap-3" aria-busy>
            <Skeleton className="h-20" />
            <Skeleton className="h-44" />
            <span className="sr-only">Reading the ground between the two points</span>
          </div>
        ) : profile.isError ? (
          <Notice
            tone="danger"
            icon={<CircleAlert />}
            title="The ground between these points could not be read"
            action={
              <Button size="sm" variant="ghost" onClick={() => profile.refetch()}>
                Try again
              </Button>
            }
          >
            {errorMessage(profile.error)}
          </Notice>
        ) : reading && result ? (
          <>
            <Notice tone={reading.tone} icon={<Icon />} title={reading.title}>
              {reading.sentences.map((sentence) => (
                <p key={sentence} className="mt-1.5 first:mt-0">
                  {sentence}
                </p>
              ))}
              {result.verdict === "no-terrain" || result.verdict === "end-unknown" || result.verdict === "incomplete" ? (
                <Button size="sm" className="mt-2.5" onClick={onOpenOffline}>
                  Offline maps
                </Button>
              ) : null}
            </Notice>
            {samples ? (
              <SightChart
                samples={samples}
                mark={reading.mark}
                tone={reading.tone}
                midBulgeMeters={result.midBulgeMeters}
                onScrub={sight.setScrub}
              />
            ) : null}
            <div className="grid gap-1.5 border-t border-border pt-3 text-small text-ink-muted">
              <p className="font-medium text-ink">What this is, and is not</p>
              <p>
                A check of geometry against terrain alone, at {formatFrequency(sight.frequencyMHz)}. The terrain knows nothing of buildings,
                trees or masts.
              </p>
              {profile.data?.terrain ? <p>{describeTerrain(profile.data)}</p> : null}
              <p>
                Nothing here predicts signal strength or coverage. A clear path can still be a poor one, and a blocked one can still be
                worked.
              </p>
            </div>
          </>
        ) : null}
      </div>
      <footer className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-3">
        <Button disabled={!from || !to} onClick={sight.swap}>
          <ArrowLeftRight /> Swap A and B
        </Button>
        <Button variant="ghost" disabled={!from && !to} onClick={sight.restart}>
          Start again
        </Button>
        <Button variant="ghost" onClick={onDone} className="ml-auto">
          Done
        </Button>
      </footer>
    </section>
  );
}
