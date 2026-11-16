/**
 * HF coverage: where one transmitter is predicted to be heard, as a layer over the
 * offline map. The engine is asked about the centre of every cell of a grid; the screen
 * shades each cell by what came back and reads any one of them out in full.
 */
import {
  ANTENNA_PRESETS,
  antennaModelLabel,
  type Bbox,
  bandOf,
  COVERAGE_RESOLUTIONS,
  type CoverageArea,
  type CoverageQuantity,
  type CoverageResolution,
  type CoverageResult,
  coverageCellAt,
  coverageCellCentre,
  coverageClasses,
  coverageClassOf,
  coverageGrid,
  coverageValue,
  HF_BANDS,
  isHorizontalAntenna,
  type ModeId,
  modeById,
  NOISE_ENVIRONMENTS,
  type NoiseEnvironment,
  OPERATING_MODES,
  parseCoordinates,
  sMeter,
  toMaidenhead,
  utcLabel,
} from "@outpost/shared";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { EmptyState, Notice, Page, PageHeader, Rows, Section } from "@/components/page";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Progress, Segmented, Select, Skeleton } from "@/components/ui/misc";
import { CoverageGreyLine, coverageMoment, useCoverageGreyLine } from "@/features/maps/grey-line/coverage";
import { errorMessage } from "@/lib/api";
import { formatDateTime, formatNumber } from "@/lib/utils";
import { antennaOf, formOf, rememberForm, useEngines, usePlaces, useProfiles, wireHint } from "../data";
import { EngineNotReady } from "../engine-data";
import { CELL_OPACITY, coverageFeatures } from "../map/layers";
import type { PlanMapHandle } from "../map/plan-map";
import { PlaceInput } from "../place-field";
import { BasisNotice } from "../results";
import { quantityMeaning } from "./coverage-document";
import { CoverageExport } from "./coverage-export";
import {
  areaAround,
  areaOf,
  type CoverageForm,
  coverageRequestOf,
  EXAMPLE_AREA,
  emptyCoverageForm,
  exampleCoverageForm,
  fetchCoverage,
  rememberCoverageForm,
  rememberedCoverageForm,
  stopJob,
  useAskCoverage,
  useCoverageJob,
  useCoverageOverview,
  useRemoveCoverage,
  useSaveCoverage,
  useShades,
} from "./data";

const PlanMap = lazy(() => import("../map/plan-map").then((module) => ({ default: module.PlanMap })));

const QUANTITIES: Array<{ value: CoverageQuantity; label: string }> = [
  { value: "reliability", label: "Reliability" },
  { value: "snr", label: "Signal to noise" },
  { value: "signal", label: "Signal strength" },
];

const km = (value: number) => (value >= 100 ? `${Math.round(value)} km` : `${value.toFixed(1)} km`);
const areaBox = (area: CoverageArea): Bbox => [area.west, area.south, area.east, area.north];

/** What the grid of a resolution would be over an area, in words: the count and the size of a cell. */
function gridWords(area: CoverageArea, resolution: CoverageResolution): string {
  const grid = coverageGrid(area, resolution);
  return `${grid.columns} × ${grid.rows} = ${formatNumber(grid.columns * grid.rows)} cells, each about ${km(grid.cellWidthKm)} by ${km(grid.cellHeightKm)}`;
}

function Legend({ result, quantity, utcHour }: { result: CoverageResult; quantity: CoverageQuantity; utcHour: number }) {
  const classes = coverageClasses(quantity);
  const counts = useMemo(() => {
    const tally = { classes: classes.map(() => 0), below: 0, noPath: 0 };
    for (const cell of result.cells) {
      if (!cell) continue;
      const value = coverageValue(cell, quantity, utcHour, result.mode.requiredSnrDbHz);
      if (value === null) tally.noPath += 1;
      else {
        const level = coverageClassOf(classes, value);
        if (level < 0) tally.below += 1;
        else tally.classes[level]! += 1;
      }
    }
    return tally;
  }, [result, quantity, utcHour, classes]);
  const below = quantity === "reliability" ? "Under 10%" : quantity === "snr" ? "More than 20 dB short" : "Below S1";
  const { grid } = result;
  const cells = (count: number) => `${formatNumber(count)} ${count === 1 ? "cell" : "cells"}`;
  return (
    <div className="mt-3 text-small text-ink-muted">
      {result.approximate ? (
        // The map's every figure is approximate: said first in the legend, where the shades are read.
        <p data-approximate className="mb-2 max-w-[75ch] rounded-control border border-dashed border-ink px-3 py-2 text-ink">
          <strong className="font-semibold">≈ Approximate map.</strong> {result.approximate}
        </p>
      ) : null}
      <ul className="grid gap-x-6 gap-y-1 sm:grid-cols-2" aria-label="What the shades mean, and how many cells are in each at this hour">
        {[...classes.entries()].reverse().map(([index, item]) => (
          <li key={item.label} className="flex items-center gap-2">
            {/* Over the land colour and as see-through as a cell, so that it is the shade the map shows. */}
            <span aria-hidden className="size-4 shrink-0 overflow-hidden rounded-[3px] border border-border-strong bg-surface-strong">
              <span className="block size-full" style={{ background: `var(--chart-seq-${index + 1})`, opacity: CELL_OPACITY }} />
            </span>
            <span className="text-ink">{item.label}</span>
            <span className="tabular ml-auto">{cells(counts.classes[index]!)}</span>
          </li>
        ))}
        <li className="flex items-center gap-2">
          <span aria-hidden className="size-4 shrink-0 rounded-[3px] border border-dashed border-border-strong" />
          <span className="text-ink">{below}: no shade</span>
          <span className="tabular ml-auto">{cells(counts.below)}</span>
        </li>
        {counts.noPath > 0 ? (
          <li className="flex items-center gap-2">
            <span aria-hidden className="size-4 shrink-0 rounded-[3px] border border-dashed border-border-strong" />
            <span className="text-ink">No path found at this hour: no shade</span>
            <span className="tabular ml-auto">{cells(counts.noPath)}</span>
          </li>
        ) : null}
        {result.unanswered.length > 0 ? (
          <li className="flex items-center gap-2">
            <svg aria-hidden viewBox="0 0 16 16" className="size-4 shrink-0 rounded-[3px] border border-border-strong text-ink">
              <path d="M2 2 14 14M14 2 2 14" stroke="currentColor" strokeWidth="1.4" />
            </svg>
            <span className="text-ink">Not answered by the engine</span>
            <span className="tabular ml-auto">{cells(result.unanswered.length)}</span>
          </li>
        ) : null}
      </ul>
      <p className="mt-3 max-w-[75ch]">{quantityMeaning(result, quantity)}</p>
      <p className="mt-2 max-w-[75ch]">
        The grid is {grid.columns} × {grid.rows} cells of {grid.lonStep.toFixed(2)}° of longitude by {grid.latStep.toFixed(2)}° of latitude,
        about {km(grid.cellWidthKm)} by {km(grid.cellHeightKm)} in the middle of the area, inside the dashed line. Each cell is one answer
        from the engine, for a receiver at the cell's centre. Nothing is smoothed and nothing is filled in between cells.
      </p>
    </div>
  );
}

/** One cell read out in full: where it is and every figure the map holds for it at the chosen hour. */
function CellReading({
  result,
  index,
  utcHour,
  onPlanner,
}: {
  result: CoverageResult;
  index: number;
  utcHour: number;
  onPlanner: (position: { lat: number; lon: number }) => void;
}) {
  const centre = coverageCellCentre(result.grid, index);
  const cell = result.cells[index] ?? null;
  const where = `${centre.lat.toFixed(2)}, ${centre.lon.toFixed(2)} (${toMaidenhead(centre.lat, centre.lon, 6) ?? ""})`;
  const tx = result.request.tx.name || "the transmitter";
  if (!cell) {
    const reason = result.unanswered.find((item) => item.index === index)?.reason ?? "The engine gave no answer for this place.";
    return (
      <div aria-live="polite">
        <h3 className="text-body font-semibold text-ink">The cell at {where}</h3>
        <p className="mt-1 text-small text-ink">Not answered. {reason} Nothing is shown for it.</p>
      </div>
    );
  }
  const at = utcHour - 1;
  const reliability = cell.reliability ? cell.reliability[at] : null;
  const snr = cell.snrDbHz[at] ?? null;
  const signal = cell.signalDbw[at] ?? null;
  const needs = result.mode.requiredSnrDbHz;
  const over = snr !== null && needs !== null ? snr - needs : null;
  return (
    <div aria-live="polite">
      <h3 className="text-body font-semibold text-ink">
        The cell at {where}, at {utcLabel(utcHour)} UTC
      </h3>
      <p className="tabular mt-1 text-small text-ink-muted">
        {km(cell.distanceKm)} from {tx}, on a bearing of {Math.round(cell.bearingDeg)}°.
      </p>
      {snr === null || signal === null ? (
        <p className="mt-2 text-small text-ink">
          The engine found no way for the signal to arrive at this hour, so there are no figures for it.
        </p>
      ) : (
        <dl className="tabular mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-small">
          <dt className="text-ink-muted">Reliability</dt>
          <dd className="text-ink">
            {reliability === null || reliability === undefined
              ? "No figure: the mode has no stated requirement"
              : `${Math.round(reliability * 100)}% of days`}
          </dd>
          <dt className="text-ink-muted">Signal to noise</dt>
          <dd className="text-ink">
            {snr.toFixed(1)} dB in 1 Hz, median
            {over === null ? "" : `: ${Math.abs(over).toFixed(1)} dB ${over >= 0 ? "over" : "short of"} what ${result.mode.label} needs`}
          </dd>
          <dt className="text-ink-muted">Signal</dt>
          <dd className="text-ink">
            {signal.toFixed(1)} dBW, median ({sMeter(signal)})
          </dd>
        </dl>
      )}
      <Button size="sm" className="mt-3" onClick={() => onPlanner(centre)}>
        Open this path in the planner
      </Button>
    </div>
  );
}

export default function CoveragePage() {
  const navigate = useNavigate();
  const [form, setForm] = useState<CoverageForm>(rememberedCoverageForm);
  const [problem, setProblem] = useState<{ field: keyof CoverageForm; problem: string } | null>(null);
  const [result, setResult] = useState<CoverageResult | null>(null);
  const [quantity, setQuantity] = useState<CoverageQuantity>("reliability");
  const [utcHour, setUtcHour] = useState(12);
  const [selected, setSelected] = useState<number | null>(null);
  const [readText, setReadText] = useState("");
  const [readProblem, setReadProblem] = useState("");
  const [jobId, setJobId] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [stopped, setStopped] = useState(false);
  const [map, setMap] = useState<PlanMapHandle | null>(null);
  const [shown, setShown] = useState<Bbox | null>(null);
  const [fit, setFit] = useState<Bbox | null>(null);
  const [saveName, setSaveName] = useState<string | null>(null);
  const [removing, setRemoving] = useState<{ id: string; name: string } | null>(null);
  const [opening, setOpening] = useState<string | null>(null);

  const [greyLine, setGreyLine] = useCoverageGreyLine();
  const engines = useEngines();
  const profiles = useProfiles();
  const places = usePlaces();
  const overview = useCoverageOverview();
  const ask = useAskCoverage();
  const job = useCoverageJob(jobId);
  const save = useSaveCoverage();
  const remove = useRemoveCoverage();

  useEffect(() => rememberCoverageForm(form), [form]);
  const set = <K extends keyof CoverageForm>(key: K, value: CoverageForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    if (problem?.field === key) setProblem(null);
  };
  const antennas = profiles.data?.antennas ?? [];
  const engine = engines.data?.[0];
  const fieldError = (field: keyof CoverageForm) => (problem?.field === field ? problem.problem : undefined);

  const show = useCallback((coverage: CoverageResult) => {
    setResult(coverage);
    setSelected(null);
    setReadProblem("");
    setFailure(null);
    setStopped(false);
    if (coverage.mode.requiredSnrDbHz === null) setQuantity((current) => (current === "signal" ? current : "signal"));
    setFit(areaBox(coverage.request.area));
  }, []);

  // The job, once it ends: the map is fetched by the key it left, or the reason it has none is said.
  const state = job.data?.state;
  const finishedKey = state === "succeeded" ? ((job.data?.result as { key?: string } | null)?.key ?? null) : null;
  useEffect(() => {
    if (!jobId || !state) return;
    if (state === "succeeded" && finishedKey) {
      setJobId(null);
      fetchCoverage(finishedKey)
        .then(show)
        .catch((error) => setFailure(errorMessage(error)));
    } else if (state === "failed") {
      setJobId(null);
      setFailure(job.data?.error ?? "The coverage map could not be worked out.");
    } else if (state === "cancelled") {
      setJobId(null);
      setStopped(true);
    }
  }, [jobId, state, finishedKey, job.data?.error, show]);

  const found = parseCoordinates(form.tx.text);
  const txKey = found ? `${found.lat.toFixed(2)},${found.lon.toFixed(2)}` : "";
  // The map goes to the transmitter when one is given, so that the area on screen is around it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: moves when the position changes, not on every keystroke of the same place
  useEffect(() => {
    if (found && !result) setFit(areaBox(areaAround(found.lat, found.lon)));
  }, [txKey]);

  /** The area a grid would be laid over now: what the map shows, or a box round the transmitter when there is no map. */
  const area = useMemo<CoverageArea | null>(() => {
    if (shown) return areaOf(shown);
    return found ? areaAround(found.lat, found.lon) : null;
  }, [shown, found]);

  const run = (next: CoverageForm = form, over: CoverageArea | null = map ? areaOf(map.bounds()) : area) => {
    if (!over) {
      setProblem({ field: "resolution", problem: "The area on the map is too small for a grid. Zoom out, then try again." });
      return;
    }
    const built = coverageRequestOf(next, antennas, over);
    if ("problem" in built) {
      setProblem(built);
      return;
    }
    setProblem(null);
    setFailure(null);
    setStopped(false);
    ask.mutate(built.request, {
      onSuccess: (answer) => {
        if (answer.coverage) show(answer.coverage);
        else setJobId(answer.job.id);
      },
      onError: (error) => setFailure(errorMessage(error)),
    });
  };

  const shades = useShades();
  const data = useMemo(
    () => (result ? coverageFeatures(result, { quantity, utcHour, shades, selected }) : undefined),
    [result, quantity, utcHour, shades, selected],
  );

  const working = ask.isPending || jobId !== null;
  const progress = job.data?.progress;
  const quantities = result?.mode.requiredSnrDbHz === null ? QUANTITIES.filter((item) => item.value === "signal") : QUANTITIES;
  const antennaOptions = [
    ...antennas.map((antenna) => ({
      value: antenna.id,
      label: antenna.name,
      description: antennaModelLabel(antenna.kind, antenna.lengthM),
    })),
    ...ANTENNA_PRESETS.map((preset) => ({ value: `preset:${preset.id}`, label: preset.name, description: "Generic" })),
  ];
  const txAntenna = antennaOf(form.txAntennaId, antennas);
  const turns = txAntenna ? isHorizontalAntenna(txAntenna.spec.kind) : false;
  /** An antenna refused for the frequency is no longer refused once the frequency changes. */
  const clearWireProblem = () => {
    if (problem?.field === "txAntennaId" || problem?.field === "rxAntennaId") setProblem(null);
  };
  // A wire of a stated length: what it is on the frequency in the form, said before a map is asked for.
  const wireNote = (id: string) => {
    const chosen = antennaOf(id, antennas);
    return chosen ? wireHint(chosen.spec, form.frequencyMhz)?.note : undefined;
  };

  const toPlanner = (position: { lat: number; lon: number }) => {
    if (!result) return;
    const { request } = result;
    rememberForm(
      formOf(
        {
          tx: request.tx,
          rx: { name: "Coverage cell", lat: Number(position.lat.toFixed(2)), lon: Number(position.lon.toFixed(2)) },
          date: request.date,
          powerWatts: request.powerWatts,
          txAntenna: request.txAntenna,
          rxAntenna: request.rxAntenna,
          noise: request.noise,
          frequencyMhz: request.frequencyMhz,
          mode: request.mode,
          solar: request.solar,
        },
        bandOf(request.frequencyMhz)?.id ?? "other",
        antennas,
      ),
    );
    navigate("/radio/propagation");
  };

  if (engines.isPending) {
    return (
      <Page>
        <PageHeader title="HF coverage" />
        <Skeleton className="h-96 w-full" />
      </Page>
    );
  }

  return (
    <Page>
      <PageHeader
        title="HF coverage"
        description="Where one transmitter is predicted to be heard, over the offline map. VOACAP is asked about every cell of a grid, for each hour of the day. A monthly median for planning, not a reading of today's conditions."
        actions={
          <Button asChild variant="ghost">
            <Link to="/radio/propagation">One path, in the planner</Link>
          </Button>
        }
      />
      <EngineNotReady engine={engine} title="The propagation engine cannot run, so no coverage can be worked out" className="mb-6">
        Outpost does not estimate coverage any other way.
      </EngineNotReady>

      {/* One column that may be narrower than what is in it: the two fields side by side would otherwise hold the
          form at their own widths, which on a phone with large text is wider than the screen. */}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-x-10 gap-y-8 lg:grid-cols-[21rem_minmax(0,1fr)]">
        <form
          className="grid grid-cols-[minmax(0,1fr)] content-start gap-4"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            run();
          }}
        >
          <PlaceInput
            label="Transmitter"
            what="the transmitter"
            value={form.tx}
            onChange={(value) => set("tx", value)}
            places={places.data ?? []}
            error={fieldError("tx")}
          />
          <Field label="Date (UTC)" hint="The model works by month: every day of a month gets the same map.">
            {(ids) => (
              <Input {...ids} type="date" value={form.date} onChange={(event) => set("date", event.target.value)} className="max-w-48" />
            )}
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Band">
              {(ids) => (
                <Select
                  {...ids}
                  value={form.band}
                  onChange={(id) => {
                    const band = HF_BANDS.find((item) => item.id === id);
                    setForm((current) => ({ ...current, band: id, frequencyMhz: band ? String(band.mhz) : current.frequencyMhz }));
                    clearWireProblem();
                  }}
                  options={[
                    ...HF_BANDS.map((band) => ({ value: band.id, label: band.label, description: `${band.mhz} MHz` })),
                    { value: "other", label: "Another frequency" },
                  ]}
                />
              )}
            </Field>
            <Field label="Frequency, MHz" error={fieldError("frequencyMhz")}>
              {(ids) => (
                <Input
                  {...ids}
                  value={form.frequencyMhz}
                  onChange={(event) => {
                    const text = event.target.value;
                    setForm((current) => ({ ...current, frequencyMhz: text, band: bandOf(Number(text))?.id ?? "other" }));
                    if (problem?.field === "frequencyMhz") setProblem(null);
                    clearWireProblem();
                  }}
                  inputMode="decimal"
                  className="tabular"
                />
              )}
            </Field>
          </div>
          <Field label="Mode" hint={modeById(form.mode).meaning}>
            {(ids) => (
              <Select<ModeId>
                {...ids}
                value={form.mode}
                onChange={(value) => set("mode", value)}
                options={OPERATING_MODES.map((item) => ({ value: item.id, label: item.label }))}
              />
            )}
          </Field>
          <Field label="Transmitter power, watts" error={fieldError("powerWatts")}>
            {(ids) => (
              <Input
                {...ids}
                value={form.powerWatts}
                onChange={(event) => set("powerWatts", event.target.value)}
                inputMode="decimal"
                className="tabular max-w-32"
              />
            )}
          </Field>
          <Field label="Transmitting antenna" hint={wireNote(form.txAntennaId)} error={fieldError("txAntennaId")}>
            {(ids) => <Select {...ids} value={form.txAntennaId} onChange={(value) => set("txAntennaId", value)} options={antennaOptions} />}
          </Field>
          {turns ? (
            <Field
              label="Its broadside faces, degrees"
              hint="Empty turns the antenna towards each cell in turn, which shows the best it can do in every direction and not the pattern of one fixed wire."
              error={fieldError("txBearing")}
            >
              {(ids) => (
                <Input
                  {...ids}
                  value={form.txBearing}
                  onChange={(event) => set("txBearing", event.target.value)}
                  inputMode="decimal"
                  placeholder={txAntenna?.spec.broadsideDeg === null ? "" : String(txAntenna?.spec.broadsideDeg ?? "")}
                  className="tabular max-w-32"
                />
              )}
            </Field>
          ) : null}
          <Field
            label="Antenna assumed at every receiver"
            hint={`The same antenna in every cell, turned towards the transmitter.${wireNote(form.rxAntennaId) ? ` ${wireNote(form.rxAntennaId)}` : ""}`}
            error={fieldError("rxAntennaId")}
          >
            {(ids) => <Select {...ids} value={form.rxAntennaId} onChange={(value) => set("rxAntennaId", value)} options={antennaOptions} />}
          </Field>
          <Field label="Noise assumed at every receiver" hint="Man-made noise. Atmospheric and galactic noise come from the engine's maps.">
            {(ids) => (
              <Select<NoiseEnvironment>
                {...ids}
                value={form.noise}
                onChange={(value) => set("noise", value)}
                options={NOISE_ENVIRONMENTS.map((item) => ({
                  value: item.id,
                  label: item.label,
                  description: `${item.dbwAt3Mhz} dBW in 1 Hz at 3 MHz`,
                }))}
              />
            )}
          </Field>
          <Field label="Sunspot number" hint="The one figure about the Sun the engine takes. Neither is a reading of today's conditions.">
            {(ids) => (
              <Select
                {...ids}
                value={form.solar}
                onChange={(value) => set("solar", value)}
                options={[
                  { value: "table", label: "NOAA's forecast for the month", description: "From the solar cycle table installed" },
                  { value: "manual", label: "A sunspot number of my own" },
                ]}
              />
            )}
          </Field>
          {form.solar === "manual" ? (
            <Field label="Smoothed sunspot number" error={fieldError("ssn")}>
              {(ids) => (
                <Input
                  {...ids}
                  value={form.ssn}
                  onChange={(event) => set("ssn", event.target.value)}
                  inputMode="decimal"
                  className="tabular max-w-32"
                />
              )}
            </Field>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setForm(emptyCoverageForm());
                setProblem(null);
              }}
            >
              Clear the form
            </Button>
          </div>
        </form>

        <div className="min-w-0">
          <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
            <div className="min-w-0">
              <p className="text-small font-medium text-ink">Grid over the area the map shows</p>
              <Segmented<CoverageResolution>
                label="Grid"
                className="mt-1.5"
                value={form.resolution}
                onChange={(value) => set("resolution", value)}
                options={COVERAGE_RESOLUTIONS.map((item) => ({ value: item.id, label: item.label }))}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="primary"
                loading={ask.isPending}
                disabled={working || (engine ? !engine.ready : false)}
                onClick={() => run()}
              >
                Work out coverage
              </Button>
              {result ? (
                <Button
                  onClick={() => setSaveName(`${result.request.tx.name}, ${result.request.frequencyMhz} MHz, ${result.request.date}`)}
                >
                  Save this map
                </Button>
              ) : null}
            </div>
          </div>
          <p className="tabular mt-2 text-small text-ink-muted">
            {area
              ? `${result ? "A new grid over what the map shows now" : "Over what the map shows now"}: ${gridWords(area, form.resolution)}. One run of the engine for each.`
              : "Zoom out: the area on the map is too small to cut into cells."}
          </p>
          {problem ? (
            <p role="alert" className="mt-2 text-small text-danger">
              {problem.field === "resolution" ? problem.problem : `Not sent: ${problem.problem}`}
            </p>
          ) : null}

          {jobId ? (
            <div className="mt-3 flex flex-wrap items-center gap-3" aria-live="polite">
              <div className="min-w-40 flex-1">
                <Progress tone="lamp" label="Cells worked out" value={progress?.total ? (progress.current ?? 0) / progress.total : null} />
                <p className="tabular mt-1.5 text-small text-ink-muted">
                  {progress?.total
                    ? `${formatNumber(progress.current ?? 0)} of ${formatNumber(progress.total)} cells`
                    : "Waiting for the engine"}
                </p>
              </div>
              <Button size="sm" onClick={() => void stopJob(jobId).catch(() => undefined)}>
                Stop
              </Button>
            </div>
          ) : null}
          {failure ? (
            <Notice tone="danger" title="No coverage map was made" className="mt-3">
              {failure}
            </Notice>
          ) : null}
          {stopped ? (
            <Notice title="Stopped" className="mt-3">
              The grid was stopped before it finished. Nothing of it was kept, and no part of it is shown.
            </Notice>
          ) : null}

          {result ? (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
              {quantities.length > 1 ? (
                <Segmented<CoverageQuantity> label="What the map shows" value={quantity} onChange={setQuantity} options={quantities} />
              ) : (
                <p className="text-small text-ink-muted">
                  Signal strength only: {result.mode.label} has no stated requirement, so there is no reliability to show.
                </p>
              )}
              <div className="flex items-center gap-1">
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="An hour earlier"
                  onClick={() => setUtcHour((hour) => (hour === 1 ? 24 : hour - 1))}
                >
                  <ChevronLeft />
                </Button>
                <label className="flex h-11 items-center gap-2 text-small text-ink">
                  <span className="tabular w-[5.5rem] font-medium">{utcLabel(utcHour)} UTC</span>
                  <input
                    type="range"
                    min={1}
                    max={24}
                    step={1}
                    value={utcHour}
                    onChange={(event) => setUtcHour(Number(event.target.value))}
                    aria-label="Hour, UTC"
                    aria-valuetext={`${utcLabel(utcHour)} UTC`}
                    className="h-11 w-36 accent-primary sm:w-48"
                  />
                </label>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="An hour later"
                  onClick={() => setUtcHour((hour) => (hour === 24 ? 1 : hour + 1))}
                >
                  <ChevronRight />
                </Button>
              </div>
              <CoverageGreyLine on={greyLine} onChange={setGreyLine} date={result.request.date} utcHour={utcHour} />
            </div>
          ) : null}

          <Suspense fallback={<Skeleton className="mt-3 h-[min(56dvh,34rem)] lg:h-[min(70dvh,34rem)] w-full" />}>
            <PlanMap
              label={result ? "HF coverage over the offline map" : "The offline map: the area it shows is the area a grid is laid over"}
              className="mt-3 h-[min(56dvh,34rem)] lg:h-[min(70dvh,34rem)]"
              data={data}
              greyLineAt={result && greyLine ? coverageMoment(result.request.date, utcHour) : null}
              fit={fit}
              onReady={setMap}
              onMoved={setShown}
              onPress={({ position }) => {
                if (!result) return;
                const index = coverageCellAt(result.grid, position.lat, position.lon);
                setSelected(index);
                setReadProblem(index === null ? "That place is outside the area that was worked out." : "");
              }}
            />
          </Suspense>

          {result ? (
            <>
              <Legend result={result} quantity={quantity} utcHour={utcHour} />
              <CoverageExport result={result} quantity={quantity} utcHour={utcHour} />
              <Section
                title="Read a cell"
                description="Press a cell on the map, or give a place, to read every figure the map holds for it."
              >
                <form
                  className="flex flex-wrap items-end gap-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const place = parseCoordinates(readText);
                    if (!place) {
                      setReadProblem("Give coordinates (52.49, -1.89), a grid reference or a locator (IO92BL).");
                      return;
                    }
                    const index = coverageCellAt(result.grid, place.lat, place.lon);
                    setSelected(index);
                    setReadProblem(index === null ? "That place is outside the area that was worked out." : "");
                  }}
                >
                  <Field label="A place" className="min-w-0 flex-1 basis-56">
                    {(ids) => (
                      <Input
                        {...ids}
                        value={readText}
                        onChange={(event) => setReadText(event.target.value)}
                        placeholder="52.49, -1.89"
                        autoComplete="off"
                        spellCheck={false}
                        className="font-mono"
                      />
                    )}
                  </Field>
                  <Button type="submit">Read this place</Button>
                </form>
                {readProblem ? (
                  <p role="alert" className="mt-2 text-small text-danger">
                    {readProblem}
                  </p>
                ) : null}
                <div className="mt-4 border-t border-border pt-4">
                  {selected === null ? (
                    <p className="text-small text-ink-muted">No cell chosen yet.</p>
                  ) : (
                    <CellReading result={result} index={selected} utcHour={utcHour} onPlanner={toPlanner} />
                  )}
                </div>
              </Section>

              <Section title="What this map rests on">
                <BasisNotice basis={result.basis} />
                <dl className="mt-4 grid gap-x-6 gap-y-2 text-small sm:grid-cols-[auto_1fr]">
                  <dt className="text-ink-muted">Asked</dt>
                  <dd className="tabular text-ink">
                    {result.request.tx.name} ({result.request.tx.lat}, {result.request.tx.lon}), {result.request.frequencyMhz} MHz,{" "}
                    {result.mode.label}, {result.request.powerWatts} W, for {result.request.date}
                  </dd>
                  <dt className="text-ink-muted">Transmitting antenna</dt>
                  <dd className="text-ink">{result.antennas.tx}</dd>
                  <dt className="text-ink-muted">At every receiver</dt>
                  <dd className="text-ink">
                    {result.antennas.rx}; {NOISE_ENVIRONMENTS.find((item) => item.id === result.request.noise)?.label.toLowerCase()} noise
                  </dd>
                  <dt className="text-ink-muted">Engine</dt>
                  <dd className="text-ink">
                    {result.engine.model}, run by {result.engine.implementation}
                  </dd>
                  <dt className="text-ink-muted">Data</dt>
                  <dd className="font-mono text-ink">{result.datasets.map((item) => `${item.id} ${item.version}`).join("; ")}</dd>
                  <dt className="text-ink-muted">Worked out</dt>
                  <dd className="tabular text-ink">
                    {formatDateTime(result.computedAt)}, in {(result.tookMs / 1000).toFixed(1)} s on this computer (
                    {formatNumber(result.cells.length)} cells)
                  </dd>
                </dl>
                <ul className="mt-4 grid max-w-[75ch] list-disc gap-1.5 pl-5 text-small text-ink-muted">
                  {result.limits.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </Section>
            </>
          ) : working ? null : (
            <EmptyState
              title="No coverage map yet"
              className="mt-6"
              action={
                <Button
                  variant="primary"
                  // Its words wrap on a narrow phone with large text, where on one line they were wider than the screen.
                  className="h-auto min-h-9 max-w-full py-2 whitespace-normal max-md:h-auto max-md:min-h-11"
                  disabled={engine ? !engine.ready : false}
                  onClick={() => {
                    const example = exampleCoverageForm();
                    setForm(example);
                    setFit(areaBox(EXAMPLE_AREA));
                    run(example, EXAMPLE_AREA);
                  }}
                >
                  Try London on 40 m, over Britain and Ireland
                </Button>
              }
            >
              Say where the transmitter is, move the map to the area you care about, and press Work out coverage. The grid is laid over
              whatever the map shows.
            </EmptyState>
          )}
        </div>
      </div>

      {overview.isError ? (
        <Notice tone="danger" title="The saved coverage maps could not be listed" className="mt-10">
          {errorMessage(overview.error)}
        </Notice>
      ) : overview.data && overview.data.saved.length > 0 ? (
        <Section
          title="Saved coverage maps"
          description="Each is shown with the figures it was saved with. They are not worked out again when opened."
        >
          <Rows className="border-y border-border">
            {overview.data.saved.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                <span className="min-w-0">
                  <span className="block truncate text-ink">{item.name}</span>
                  <span className="tabular block text-small text-ink-muted">
                    {item.request.frequencyMhz} MHz, {modeById(item.request.mode).label}, {item.request.powerWatts} W, for{" "}
                    {item.request.date} at sunspot number {item.ssn}. {formatNumber(item.cells)} cells, worked out{" "}
                    {formatDateTime(item.computedAt)}.
                  </span>
                </span>
                <span className="flex gap-2">
                  <Button
                    size="sm"
                    loading={opening === item.id}
                    onClick={() => {
                      setOpening(item.id);
                      fetchCoverage(item.key)
                        .then((coverage) => {
                          show(coverage);
                          window.scrollTo({ top: 0 });
                        })
                        .catch((error) => setFailure(errorMessage(error)))
                        .finally(() => setOpening(null));
                    }}
                  >
                    Open
                  </Button>
                  <Button size="sm" variant="danger-ghost" onClick={() => setRemoving({ id: item.id, name: item.name })}>
                    Delete
                  </Button>
                </span>
              </li>
            ))}
          </Rows>
        </Section>
      ) : null}

      {saveName !== null && result ? (
        <Dialog open onOpenChange={(open) => !open && setSaveName(null)}>
          <DialogContent
            title="Save this map"
            description="The map is kept under this name with the figures it has now. It is not worked out again when you open it."
          >
            <DialogBody>
              <Field label="Name">
                {(ids) => <Input {...ids} value={saveName} onChange={(event) => setSaveName(event.target.value)} maxLength={120} />}
              </Field>
            </DialogBody>
            <DialogFooter>
              <Button onClick={() => setSaveName(null)}>Cancel</Button>
              <Button
                variant="primary"
                loading={save.isPending}
                onClick={() =>
                  save.mutate({ name: saveName.trim() || "Coverage map", key: result.key }, { onSuccess: () => setSaveName(null) })
                }
              >
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title="Delete this saved coverage map?"
        description={`“${removing?.name ?? ""}” will be removed from the list, with its figures. Nothing else is deleted.`}
        confirmLabel="Delete"
        loading={remove.isPending}
        onConfirm={() => removing && remove.mutate(removing.id, { onSuccess: () => setRemoving(null) })}
      />
    </Page>
  );
}
