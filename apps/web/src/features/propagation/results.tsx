/**
 * A prediction, laid out to be read: where the figures come from, then one chosen hour
 * in words and numbers, then the day in charts, then the steep-path working, then the
 * provenance. Every number on it is one the engine returned; the sentences only say
 * what the numbers are.
 */
import {
  type AntennaSpec,
  approximateOn,
  COMPARISONS,
  type CompareWhat,
  dbwToDbm,
  HF_BANDS,
  MODEL_JOIN_NOTE,
  notModelledOn,
  type PredictionBasis,
  type PredictionHour,
  type PredictionResult,
  pathRunOn,
  RUN_LABELS,
  rankBands,
  secantLawMhz,
  sMeter,
  snrInBandwidth,
  steepPathGeometry,
  utcLabel,
  type WireOnFrequency,
  wireOn,
} from "@outpost/shared";
import { Info, TriangleAlert } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { Notice, Rows, Section } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Select, Skeleton } from "@/components/ui/misc";
import { errorMessage } from "@/lib/api";
import { APPROXIMATE_SIGN, ChartFrame, HourGrid, HourLines, NOT_MODELLED, percent, ShareBars } from "./charts";
import { useCompare, useListing } from "./data";
import { ComparisonExport } from "./prediction-export";

const BASIS_TITLE = {
  climatology: "A monthly median, with an old solar forecast",
  "recent-solar": "A monthly median, with a recent solar forecast",
  "own-measurement": "A monthly median, run at your own figure",
} as const;

/** What kind of knowledge an answer rests on and how old it is, said before any figure. */
export function BasisNotice({ basis, className }: { basis: PredictionBasis; className?: string }) {
  return (
    <Notice
      tone={basis.kind === "climatology" ? "warning" : "info"}
      icon={basis.kind === "climatology" ? <TriangleAlert /> : <Info />}
      title={BASIS_TITLE[basis.kind]}
      className={className}
    >
      {basis.summary}
      {basis.ssnLow !== null && basis.ssnHigh !== null
        ? ` The table's own range for the month is ${basis.ssnLow} to ${basis.ssnHigh}.`
        : ""}{" "}
      It is not a reading of the ionosphere today.
    </Notice>
  );
}

const db = (value: number, places = 0) => `${value.toFixed(places)} dB`;
const mhz = (value: number) => `${value.toFixed(value >= 10 ? 1 : 2)} MHz`;

function Fact({ term, children, note }: { term: string; children: ReactNode; note?: ReactNode }) {
  return (
    <li className="grid gap-x-6 gap-y-0.5 py-2.5 sm:grid-cols-[13rem_minmax(0,1fr)]">
      <span className="text-small text-ink-muted">{term}</span>
      <span className="min-w-0">
        <span className="tabular text-ink">{children}</span>
        {note ? <span className="mt-0.5 block text-small text-ink-muted">{note}</span> : null}
      </span>
    </li>
  );
}

/**
 * The hour at which the frequency asked about does best: by reliability, then by
 * signal-to-noise ratio. Where an antenna is not modelled on that frequency there is no
 * such hour, and it is the hour at which the best of the bands with figures does best.
 */
export function bestHour(result: PredictionResult): number {
  if (result.hours[0]?.asked.notModelled) {
    const best = (hour: PredictionHour) => Math.max(0, ...hour.bands.filter((cell) => !cell.notModelled).map((cell) => cell.reliability));
    return [...result.hours].sort((a, b) => best(b) - best(a) || Math.abs(a.utc - 12) - Math.abs(b.utc - 12))[0]!.utc;
  }
  return [...result.hours].sort((a, b) => b.asked.reliability - a.asked.reliability || b.asked.snrDbHz - a.asked.snrDbHz)[0]!.utc;
}

/** The wires of a stated length among the two antennas, with what each is at a frequency. */
export function wiresOn(
  request: PredictionResult["request"],
  atMhz: number,
): Array<{ whose: string; spec: AntennaSpec; wire: WireOnFrequency }> {
  const ends: Array<[string, AntennaSpec]> = [
    ["The transmitting antenna", request.txAntenna],
    ["The receiving antenna", request.rxAntenna],
  ];
  return ends.flatMap(([whose, spec]) => {
    const wire = wireOn(spec, atMhz);
    return wire ? [{ whose, spec, wire }] : [];
  });
}

/** What a wire is on a band, in the list of bands: the length, and how it was run. */
function wireState(spec: AntennaSpec, wire: WireOnFrequency): string {
  if (spec.kind === "end-fed-horizontal") {
    if (wire.state === "half-wave") return `about a half-wave. ${RUN_LABELS.halfWave}`;
    if (wire.state === "approximate") return `longer than a half-wave. ${RUN_LABELS.approximate}`;
    return `shorter than a half-wave. ${RUN_LABELS.notModelled}: no figure`;
  }
  return wire.state === "half-wave" ? "about a half-wave" : "not a half-wave; run as a wire of this length";
}

/**
 * Whether a level wire's bands, side by side, mix the two models: some run as VOACAP's
 * dipole and some as its sloping long wire. Where they do, the step between them is said
 * beside the bands, not in a footnote.
 */
export function mixesModels(request: PredictionResult["request"]): boolean {
  const states = HF_BANDS.flatMap((band) =>
    [request.txAntenna, request.rxAntenna].map((spec) => (spec.kind === "end-fed-horizontal" ? wireOn(spec, band.mhz)?.state : undefined)),
  );
  return states.includes("half-wave") && states.includes("approximate");
}

/** Runs of consecutive hours in which the share is at or above a level, as "08:00 to 16:00". */
export function windows(hours: PredictionHour[], level: number): string[] {
  const runs: string[] = [];
  let start: number | null = null;
  for (let index = 0; index <= hours.length; index++) {
    const open = index < hours.length && hours[index]!.asked.reliability >= level;
    if (open && start === null) start = index;
    if (!open && start !== null) {
      runs.push(start === index - 1 ? utcLabel(hours[start]!.utc) : `${utcLabel(hours[start]!.utc)} to ${utcLabel(hours[index - 1]!.utc)}`);
      start = null;
    }
  }
  return runs;
}

/** What the chosen hour's figures say, in sentences. Nothing is concluded that the figures do not state. */
function Reading({ result, hour }: { result: PredictionResult; hour: PredictionHour }) {
  const cell = hour.asked;
  const f = mhz(cell.mhz);
  const noMode = result.mode.requiredSnrDbHz === null;
  const ranked = rankBands(hour);
  const better = ranked[0] && ranked[0].cell.reliability >= cell.reliability + 0.1 ? ranked[0] : null;
  const good = windows(result.hours, 0.5);
  return (
    <div className="max-w-[70ch] space-y-2 text-body text-ink">
      {cell.approximate ? (
        <p data-approximate>
          <strong className="font-semibold">Approximate figures for {f}.</strong> An antenna is a level wire longer than a half-wave here,
          run as VOACAP's sloping long wire laid level, whose level is unchecked: read every figure below as approximate.
        </p>
      ) : null}
      {cell.path === null ? (
        <p>
          At {utcLabel(hour.utc)} UTC the engine finds no way for {f} to reach the receiver.
        </p>
      ) : (
        <p>
          At {utcLabel(hour.utc)} UTC the path's MUF is {mhz(hour.mufMhz)}, and {f} is below it on {percent(cell.mufDays)} of the days of
          the month.{" "}
          {noMode ? (
            <>The median signal-to-noise ratio is {db(cell.snrDbHz)} in 1 Hz. Give the ratio your mode needs to get a reliability.</>
          ) : (
            <>
              {result.mode.label} reaches the {db(result.mode.requiredSnrDbHz!, 1)} (in 1 Hz) it is taken to need on{" "}
              <strong className="font-semibold">{percent(cell.reliability)}</strong> of days; the median is {db(cell.snrDbHz)},{" "}
              {cell.snrDbHz >= result.mode.requiredSnrDbHz! ? "above" : "below"} it by{" "}
              {db(Math.abs(cell.snrDbHz - result.mode.requiredSnrDbHz!))}.
            </>
          )}
        </p>
      )}
      {hour.reply && !noMode ? (
        <p>
          The reply reaches it on {percent(hour.reply.reliability)} of days. A contact needs both directions, so it can be expected on no
          more than {percent(Math.min(cell.reliability, hour.reply.reliability))} of days, and that is before interference, operators and
          equipment are counted.
        </p>
      ) : null}
      {!noMode && better ? (
        <p>
          At this hour {better.band.label} ({mhz(better.band.mhz)}) does better: {percent(better.cell.reliability)}
          {better.cell.approximate ? ", an approximate figure" : ""}.
        </p>
      ) : null}
      {!noMode ? (
        <p className="text-ink-muted">
          {good.length > 0
            ? `Through the day ${f} reaches half the days or more at ${good.join(", ")} UTC.`
            : `At no hour of the day does ${f} reach half the days with ${result.mode.label}.`}
        </p>
      ) : null}
    </div>
  );
}

function Compare({ result, hour, onHour }: { result: PredictionResult; hour: number; onHour: (hour: number) => void }) {
  const [what, setWhat] = useState<CompareWhat>("seasons");
  const compare = useCompare();
  const chosen = COMPARISONS.find((item) => item.id === what)!;
  // biome-ignore lint/correctness/useExhaustiveDependencies: asked again only when the prediction or the choice changes
  useEffect(() => {
    if (result.mode.requiredSnrDbHz !== null) compare.mutate({ base: result.request, what });
  }, [result.key, what]);
  if (result.mode.requiredSnrDbHz === null) return null;
  return (
    <ChartFrame title={`${mhz(result.request.frequencyMhz)} with one thing changed`} reading={chosen.reading}>
      <div className="mb-3 max-w-xs">
        <Select<CompareWhat>
          aria-label="What to change"
          value={what}
          onChange={setWhat}
          options={COMPARISONS.map((item) => ({ value: item.id, label: item.label }))}
        />
      </div>
      {compare.isPending ? (
        <Skeleton className="h-40 w-full" />
      ) : compare.isError ? (
        <Notice tone="danger">{errorMessage(compare.error)}</Notice>
      ) : compare.data ? (
        <HourGrid
          name={`Reliability of ${mhz(result.request.frequencyMhz)} by hour: ${chosen.label.toLowerCase()}`}
          hour={hour}
          onHour={onHour}
          rowHeight={20}
          rows={compare.data.series.map((series) => ({
            label: series.label,
            values: series.reliability,
            detail: series.notModelled
              ? `no figure on ${mhz(result.request.frequencyMhz)}`
              : `${series.approximate ? "approximate, " : ""}midday foF2 ${series.foF2[11]!.toFixed(1)} MHz`,
            notModelled: series.notModelled,
            approximate: series.approximate,
          }))}
        />
      ) : null}
      {compare.data && !compare.isPending && !compare.isError ? <ComparisonExport result={result} comparison={compare.data} /> : null}
    </ChartFrame>
  );
}

function Listing({ result }: { result: PredictionResult }) {
  const listing = useListing();
  const { request } = result;
  const leftOff = [request.frequencyMhz, ...HF_BANDS.map((band) => band.mhz)].some(
    (value) => notModelledOn(request.txAntenna, request.rxAntenna, value) !== null,
  );
  const ownPages = [request.frequencyMhz, ...HF_BANDS.map((band) => band.mhz)].some(
    (value) => pathRunOn(request.txAntenna, request.rxAntenna, value) === "approximate",
  );
  return (
    <div className="mt-3">
      {listing.data && leftOff ? (
        <p className="mb-2 max-w-[75ch] text-small text-ink-muted">
          The frequencies an antenna is not modelled on are left off this page: the page has no way to say that a column is not this
          antenna.
        </p>
      ) : null}
      {listing.data && ownPages ? (
        <p className="mb-2 max-w-[75ch] text-small text-ink-muted">
          Each frequency on which a level wire is run as the sloping long wire has a file of its own, so it is a page of its own, headed by
          Outpost as approximate.
        </p>
      ) : null}
      {listing.data ? (
        <section
          aria-label="The page VOACAP prints for this path"
          className="max-h-96 overflow-auto rounded-panel border border-border bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          // biome-ignore lint/a11y/noNoninteractiveTabindex: a box that scrolls must be reachable to be scrolled with the keyboard
          tabIndex={0}
        >
          <pre className="p-3 font-mono text-[0.75rem] leading-snug text-ink">{listing.data.listing}</pre>
        </section>
      ) : (
        <Button variant="secondary" size="sm" loading={listing.isPending} onClick={() => listing.mutate(result.request)}>
          Show the page VOACAP prints
        </Button>
      )}
      {listing.isError ? <p className="mt-2 text-small text-danger">{errorMessage(listing.error)}</p> : null}
    </div>
  );
}

export function Results({ result, hour, onHour }: { result: PredictionResult; hour: number; onHour: (hour: number) => void }) {
  const at = result.hours[hour - 1]!;
  const cell = at.asked;
  const { mode } = result;
  const { request } = result;
  const f = mhz(request.frequencyMhz);
  const required = mode.requiredSnrDbHz;
  // An antenna that is a wire of a stated length: what it is on the frequency asked about and on each band.
  const wires = wiresOn(request, request.frequencyMhz);
  const hasWire = wires.length > 0;
  const askedNotModelled = cell.notModelled === true;
  const askedApproximate = cell.approximate === true;
  const approx = (text: string) => (askedApproximate ? `${text} (approximate)` : text);
  const bandsWithout = HF_BANDS.filter((_band, index) => at.bands[index]?.notModelled);
  const bandsWith = HF_BANDS.filter((_band, index) => !at.bands[index]?.notModelled);
  /** "0.47 wavelengths": the wire's length on a band, or both wires' when each end has one. */
  const wireLengths = (atMhz: number) =>
    wiresOn(request, atMhz)
      .map(({ wire }) => wire.wavelengths.toFixed(2))
      .join(" and ");

  const sweepRows = useMemo(() => {
    const asked = Math.round(result.request.frequencyMhz);
    const { txAntenna, rxAntenna } = result.request;
    return [...result.sweepMhz]
      .map((value, index) => ({
        label: `${value} MHz`,
        values: result.hours.map((h) => (required === null ? null : h.sweepReliability[index]!)),
        marked: value === asked,
        mhz: value,
        notModelled: pathRunOn(txAntenna, rxAntenna, value) === "not-modelled",
        approximate: pathRunOn(txAntenna, rxAntenna, value) === "approximate",
      }))
      .reverse();
  }, [result, required]);
  const sweepPartly = sweepRows.some((row) => row.notModelled);
  const sweepApproximate = sweepRows.some((row) => row.approximate);
  const bandsApproximate = HF_BANDS.filter((_band, index) => at.bands[index]?.approximate);
  const top = result.sweepMhz[result.sweepMhz.length - 1]!;
  const geometry = steepPathGeometry(
    result.path.distanceKm,
    cell.virtualHeightKm > 0 ? cell.virtualHeightKm : at.ionosphere.virtualHeightF2Km,
  );
  const secant = secantLawMhz(at.ionosphere.foF2, geometry.incidenceDeg);
  const modeColors = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)"];
  const withFigure = result.modes.map((item, index) => ({ item, index })).filter(({ item }) => item.requiredSnrDbHz !== null);

  return (
    <div>
      <BasisNotice basis={result.basis} />
      {askedNotModelled ? (
        <Notice tone="warning" icon={<TriangleAlert />} title={`No figure for ${f}: an antenna is not modelled there`} className="mt-4">
          {notModelledOn(request.txAntenna, request.rxAntenna, request.frequencyMhz)}{" "}
          {bandsWith.length > 0
            ? `The bands below that have figures are ${bandsWith.map((band) => band.label).join(", ")}. Choose one of them, or another antenna, to see a day on this path.`
            : "None of the amateur bands has figures with this antenna. Choose another antenna, or ask about a frequency the wire is a half-wave on."}
        </Notice>
      ) : null}
      {askedApproximate ? (
        <Notice tone="warning" icon={<TriangleAlert />} title={`Approximate figures for ${f}`} className="mt-4">
          {approximateOn(request.txAntenna, request.rxAntenna, request.frequencyMhz)} Neither this model nor the dipole has been checked
          against a real antenna here; the figures are the engine's, labelled approximate wherever they are shown.
        </Notice>
      ) : null}

      <Section
        title={`${result.request.tx.name} to ${result.request.rx.name}`}
        description={`${result.path.distanceKm.toFixed(0)} km, bearing ${Math.round(result.path.bearingDeg)}° out and ${Math.round(result.path.backBearingDeg)}° back. ${result.path.txLocator} to ${result.path.rxLocator}.`}
      >
        {askedNotModelled ? (
          <p className="max-w-[70ch] text-body text-ink">
            At {utcLabel(hour)} UTC the path's MUF is {mhz(at.mufMhz)}. Nothing is said here about {f}: the engine has no model of this
            antenna on that frequency, and a figure from a different antenna would not be a prediction for this one.
          </p>
        ) : (
          <Reading result={result} hour={at} />
        )}
      </Section>

      <Section title="Frequency against time" description="Pick an hour on any chart and the figures below follow it.">
        <ChartFrame
          title={
            required === null
              ? "No reliability without a figure for the mode"
              : `Share of days ${mode.label} gets through, at every frequency and hour`
          }
          reading={`Each cell is one whole megahertz at one hour UTC. The line is the MUF: above it the path is open on fewer than half the days. ${f} is the row in bold.${sweepApproximate ? ` A row marked ${APPROXIMATE_SIGN} in a dashed frame has approximate figures: an antenna is a level wire longer than a half-wave there.` : ""}${sweepPartly ? " A hatched row is a frequency an antenna is not modelled on: it has no figure, which is not the same as a poor one." : ""}`}
        >
          <HourGrid
            name={`Reliability of ${mode.label} from 2 to 30 MHz by hour`}
            rows={sweepRows}
            hour={hour}
            onHour={onHour}
            rowHeight={11}
            labelEvery={4}
            line={{
              label: "the MUF",
              rowAt: result.hours.map((h) => (h.mufMhz > top + 0.5 ? null : Math.max(0, top + 0.5 - h.mufMhz))),
              describe: (h) => `MUF ${mhz(result.hours[h - 1]!.mufMhz)}`,
            }}
          />
        </ChartFrame>
      </Section>

      {askedNotModelled ? null : (
        <Section title={`${f} at ${utcLabel(hour)} UTC`}>
          <Rows className="border-y border-border">
            <Fact
              term="Reliability"
              note="The share of the month's days on which the signal-to-noise ratio reaches what the mode needs. Not the chance of completing a contact."
            >
              {required === null ? "No figure: the mode has no requirement set" : approx(`${percent(cell.reliability)} for ${mode.label}`)}
            </Fact>
            <Fact
              term="Signal-to-noise ratio"
              note={`On the worst tenth of days ${db(cell.snrLowDb, 0)} lower, on the best tenth ${db(cell.snrUpDb, 0)} higher.${required === null ? "" : ` ${mode.label} is taken to need ${db(required, 1)} in 1 Hz.`}`}
            >
              {db(cell.snrDbHz)} in 1 Hz, which is {db(snrInBandwidth(cell.snrDbHz, 2500))} in 2500 Hz
              {required === null ? "" : `: a margin of ${(cell.snrDbHz - required).toFixed(0)} dB on the median day`}
              {askedApproximate ? " (approximate)" : ""}
            </Fact>
            <Fact term="Signal at the receiver" note="The S-meter figure follows the convention that S9 is −73 dBm; real meters seldom do.">
              {dbwToDbm(cell.signalDbw).toFixed(0)} dBm ({sMeter(cell.signalDbw)}), a field of {cell.fieldDbuV.toFixed(0)} dB above 1 µV/m
            </Fact>
            <Fact term="Noise at the receiver">{dbwToDbm(cell.noiseDbwHz).toFixed(0)} dBm in 1 Hz</Fact>
            <Fact term="How it gets there" note="Hops and the layer that returns the signal, as the engine names it.">
              {cell.path === null
                ? "No path found"
                : `${cell.path}, leaving at ${cell.takeoffDeg.toFixed(0)}° above the horizon, returned from a virtual height of ${cell.virtualHeightKm.toFixed(0)} km`}
            </Fact>
            <Fact
              term="Usable frequencies"
              note="MUF: open on half the days. FOT: on nine days in ten. HPF: on one day in ten. LUF: the lowest whole megahertz at which the mode reaches 90% reliability."
            >
              MUF {mhz(at.mufMhz)}, FOT {mhz(at.fotMhz)}, HPF {mhz(at.hpfMhz)}, LUF{" "}
              {sweepPartly
                ? "not given: an antenna is modelled on only part of the range, so the lowest frequency that works cannot be found"
                : at.lufMhz === null
                  ? "none reaches 90%"
                  : mhz(at.lufMhz)}
            </Fact>
            <Fact term="Antenna gain at that angle">
              {approx(`${cell.txGainDbi.toFixed(1)} dBi transmitting, ${cell.rxGainDbi.toFixed(1)} dBi receiving`)}
            </Fact>
            {wires.map(({ whose, wire }) => (
              <Fact
                key={whose}
                term={`${whose} on ${f}`}
                note="The matching unit's loss is not modelled: take it off as feedline loss in a profile."
              >
                {wire.note}
              </Fact>
            ))}
          </Rows>
          <div className="mt-6 grid gap-8 lg:grid-cols-2">
            <ChartFrame
              title={`Reliability of ${f} through the day`}
              reading={at.reply ? "Both directions. A contact needs both." : undefined}
            >
              <HourLines
                name={`Reliability of ${f} by hour`}
                hour={hour}
                onHour={onHour}
                domain={[0, 100]}
                format={(value) => `${Math.round(value)}%`}
                series={[
                  {
                    label: `${result.request.tx.name} to ${result.request.rx.name}`,
                    color: "var(--chart-1)",
                    values: result.hours.map((h) => (required === null ? null : h.asked.reliability * 100)),
                  },
                  ...(at.reply
                    ? [
                        {
                          label: "The reply",
                          color: "var(--chart-2)",
                          values: result.hours.map((h) => (required === null ? null : h.reply!.reliability * 100)),
                        },
                      ]
                    : []),
                ]}
              />
            </ChartFrame>
            <ChartFrame
              title="Signal-to-noise ratio through the day"
              reading="The line is the median day; the band runs from the worst tenth of days to the best."
            >
              <HourLines
                name={`Signal-to-noise ratio of ${f} in 1 Hz by hour`}
                hour={hour}
                onHour={onHour}
                format={(value) => `${Math.round(value)} dB`}
                series={[{ label: "Median", color: "var(--chart-1)", values: result.hours.map((h) => h.asked.snrDbHz) }]}
                band={{
                  label: "worst to best tenth of days",
                  low: result.hours.map((h) => h.asked.snrDbHz - h.asked.snrLowDb),
                  high: result.hours.map((h) => h.asked.snrDbHz + h.asked.snrUpDb),
                }}
                level={required === null ? undefined : { value: required, label: `${mode.label} needs ${required.toFixed(0)} dB` }}
              />
            </ChartFrame>
            <ChartFrame
              title="Signal and noise power"
              reading="Median power at the receiver: the whole signal, and the noise in each hertz of bandwidth."
            >
              <HourLines
                name={`Signal and noise power at the receiver on ${f} by hour`}
                hour={hour}
                onHour={onHour}
                format={(value) => `${Math.round(value)} dBm`}
                series={[
                  { label: "Signal", color: "var(--chart-1)", values: result.hours.map((h) => dbwToDbm(h.asked.signalDbw)) },
                  { label: "Noise in 1 Hz", color: "var(--chart-2)", values: result.hours.map((h) => dbwToDbm(h.asked.noiseDbwHz)) },
                ]}
              />
            </ChartFrame>
            <ChartFrame
              title={`Modes on ${f}`}
              reading="The same signal against what each mode is taken to need. The requirements are not measured on one basis; see the notes under Modes."
            >
              <HourLines
                name={`Reliability of each mode on ${f} by hour`}
                hour={hour}
                onHour={onHour}
                domain={[0, 100]}
                format={(value) => `${Math.round(value)}%`}
                series={withFigure.slice(0, 4).map(({ item, index }, order) => ({
                  label: item.label,
                  color: modeColors[order]!,
                  values: result.hours.map((h) => (h.modeReliability[index] ?? 0) * 100),
                }))}
              />
            </ChartFrame>
          </div>
        </Section>
      )}

      <Section
        title="Bands"
        description={
          required === null
            ? undefined
            : `${mode.label} on one frequency near the middle of each amateur band. Your licence decides which you may use.`
        }
      >
        {mixesModels(request) && required !== null ? (
          <Notice tone="info" icon={<Info />} title="Two of VOACAP's models side by side" className="mb-4">
            {`The level wire is VOACAP's dipole on ${HF_BANDS.filter(
              (_band, index) => !at.bands[index]?.approximate && !at.bands[index]?.notModelled,
            )
              .map((band) => band.label)
              .join(", ")} and an approximation on ${bandsApproximate.map((band) => band.label).join(", ")}. ${MODEL_JOIN_NOTE}`}
          </Notice>
        ) : null}
        {required === null ? (
          <Notice>Give the signal-to-noise ratio your mode needs to compare the bands.</Notice>
        ) : (
          <div className="grid gap-8 lg:grid-cols-2">
            <ChartFrame title={`Best bands at ${utcLabel(hour)} UTC`}>
              <ShareBars
                name={`Bands ranked by reliability at ${utcLabel(hour)} UTC`}
                rows={rankBands(at).map(({ band, cell: c }) => ({
                  label: band.label,
                  share: c.reliability,
                  detail: c.notModelled
                    ? `${mhz(band.mhz)}, wire ${wireLengths(band.mhz)} λ`
                    : `${c.approximate ? "Approximate. " : ""}${mhz(band.mhz)}, ${c.path ?? "no path"}, ${db(c.snrDbHz)}${hasWire ? `, wire ${wireLengths(band.mhz)} λ` : ""}`,
                  marked: band.mhz === result.request.frequencyMhz,
                  notModelled: c.notModelled,
                  approximate: c.approximate,
                }))}
              />
            </ChartFrame>
            <ChartFrame title="Bands through the day">
              <HourGrid
                name={`Reliability of ${mode.label} on each band by hour`}
                hour={hour}
                onHour={onHour}
                rowHeight={18}
                rows={HF_BANDS.map((band, index) => ({
                  label: band.label,
                  detail: mhz(band.mhz),
                  values: result.hours.map((h) => h.bands[index]!.reliability),
                  marked: band.mhz === result.request.frequencyMhz,
                  notModelled: at.bands[index]!.notModelled,
                  approximate: at.bands[index]!.approximate,
                }))}
              />
            </ChartFrame>
          </div>
        )}
        {hasWire ? (
          <div className="mt-6">
            <h3 className="text-body font-semibold text-ink">The wire on each band</h3>
            <p className="mt-0.5 max-w-[75ch] text-small text-ink-muted">
              {bandsApproximate.length > 0
                ? `The figures on ${bandsApproximate.map((band) => band.label).join(", ")} are approximate. `
                : ""}
              {bandsWithout.length > 0
                ? `No figure is given on ${bandsWithout.map((band) => band.label).join(", ")}: a band that is ${NOT_MODELLED} is not a band that does badly. `
                : ""}
              The length is in wavelengths at the frequency that stands for the band.
              {mixesModels(request) ? ` ${MODEL_JOIN_NOTE}` : ""}
            </p>
            <Rows className="mt-2 border-y border-border" aria-label="The wire on each band">
              {HF_BANDS.map((band) => (
                <li key={band.id} className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-3 py-2 text-small">
                  <span className={band.mhz === request.frequencyMhz ? "tabular font-semibold text-ink" : "tabular text-ink-muted"}>
                    {band.label}
                  </span>
                  <span className="min-w-0 text-ink">
                    {wiresOn(request, band.mhz).map(({ whose, spec, wire }) => (
                      <span key={whose} className="block">
                        <span className="tabular">{wire.wavelengths.toFixed(2)}</span> wavelengths, {wireState(spec, wire)}
                        {wires.length > 1 ? ` (${whose.toLowerCase()}, ${spec.lengthM} m)` : ""}
                      </span>
                    ))}
                  </span>
                </li>
              ))}
            </Rows>
          </div>
        ) : null}
      </Section>

      <Section
        title="The steep path (NVIS)"
        description="Three different things, kept apart: whether the geometry allows it, how strong the signal is against the noise, and how often that is enough."
      >
        <Rows className="border-y border-border">
          <Fact
            term="1. Geometry (secant law)"
            note="A check with a triangle and one number from the engine's map. It ignores the Earth's magnetic field, the layer's thickness and absorption, and is not the prediction."
          >
            foF2 over the middle of the path is {mhz(at.ionosphere.foF2)}. A single hop of {result.path.distanceKm.toFixed(0)} km off a
            height of {(cell.virtualHeightKm > 0 ? cell.virtualHeightKm : at.ionosphere.virtualHeightF2Km).toFixed(0)} km leaves at{" "}
            {geometry.elevationDeg.toFixed(0)}° and meets the layer {geometry.incidenceDeg.toFixed(0)}° from the vertical, so the layer
            returns up to about {mhz(secant)}. {f} is {result.request.frequencyMhz <= secant ? "under" : "over"} that.
          </Fact>
          <Fact
            term="2. Signal against noise"
            note="From the engine: path loss (absorption is inside it and is not given separately), antenna gain at the take-off angle, and noise."
          >
            {askedNotModelled ? (
              `No figure: an antenna is not modelled on ${f}.`
            ) : (
              <>
                Median {db(cell.snrDbHz)} in 1 Hz, with a total loss of {db(cell.lossDb)} and {cell.txGainDbi.toFixed(1)} dBi from the
                transmitting antenna at {cell.takeoffDeg.toFixed(0)}°{askedApproximate ? ", all approximate" : ""}.
              </>
            )}
          </Fact>
          <Fact term="3. Reliability" note="From the engine: how the ratio and the MUF vary from day to day within the month.">
            {askedNotModelled
              ? `No figure: an antenna is not modelled on ${f}.`
              : required === null
                ? "No figure without a requirement for the mode."
                : `${approx(`${percent(cell.reliability)} of days for ${mode.label}`)}; the path is open at ${f} on ${percent(cell.mufDays)} of days.`}
          </Fact>
        </Rows>
        <div className="mt-6 grid gap-8 lg:grid-cols-2">
          <ChartFrame
            title="What the ionosphere overhead returns"
            reading={`foF2 is the highest frequency returned straight down. The dashed level is ${f}.`}
          >
            <HourLines
              name="MUF, FOT and foF2 by hour"
              hour={hour}
              onHour={onHour}
              format={(value) => `${value.toFixed(1)} MHz`}
              series={[
                { label: "MUF", color: "var(--chart-1)", values: result.hours.map((h) => h.mufMhz) },
                { label: "FOT", color: "var(--chart-2)", values: result.hours.map((h) => h.fotMhz) },
                { label: "foF2", color: "var(--chart-3)", values: result.hours.map((h) => h.ionosphere.foF2) },
              ]}
              level={{ value: result.request.frequencyMhz, label: f }}
            />
          </ChartFrame>
          {askedNotModelled ? null : <Compare result={result} hour={hour} onHour={onHour} />}
        </div>
      </Section>

      <Section
        title="Modes"
        description="What each mode is taken to need, and where the figure comes from. Change the figure for your own mode in the form."
      >
        <Rows className="border-y border-border">
          {result.modes.map((item, index) => (
            <Fact key={item.id} term={item.label} note={item.source}>
              {item.requiredSnrDb === null
                ? "No figure assumed"
                : `${item.requiredSnrDb} dB in ${item.referenceBandwidthHz} Hz, which is ${item.requiredSnrDbHz} dB in 1 Hz.${askedNotModelled ? "" : ` At ${utcLabel(hour)} UTC: ${percent(at.modeReliability[index] ?? null)} of days`}`}
            </Fact>
          ))}
        </Rows>
      </Section>

      <Section title="Where these figures come from">
        <Rows className="border-y border-border">
          <Fact term="Engine" note={`Licence of the program: ${result.engine.licence}. Checksum ${result.engine.sha256.slice(0, 16)}…`}>
            {result.engine.model}, run by {result.engine.implementation}
          </Fact>
          <Fact term="Data">{result.datasets.map((dataset) => `${dataset.id} ${dataset.version}`).join("; ")}</Fact>
          <Fact term="Antennas" note={result.antennas.rx}>
            {result.antennas.tx}
          </Fact>
          <Fact term="This answer" note={`Key ${result.key}`}>
            {result.cached ? "Found already worked out" : "Worked out just now"},{" "}
            {new Date(result.computedAt).toISOString().slice(0, 16).replace("T", " ")} UTC
          </Fact>
        </Rows>
        <Listing result={result} />
        <h3 className="mt-6 text-body font-semibold text-ink">Before relying on it</h3>
        <ul className="mt-2 max-w-[75ch] list-disc space-y-1.5 pl-5 text-small text-ink-muted">
          {result.limits.map((limit) => (
            <li key={limit}>{limit}</li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
