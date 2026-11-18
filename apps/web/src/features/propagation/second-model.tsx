/**
 * "Compare with a second model (ITU P.533)": the same path run by the ITU's P.533
 * beside VOACAP, for each band and hour, with the difference stated.
 *
 * Optional, and only offered once the P.533 engine is built on this computer and its
 * maps are downloaded; until then one line says what is missing and how big it is.
 * Both models are run with isotropic antennas of 0 dBi, because P.533 has none of its
 * own; the prediction above, with the person's antennas, is VOACAP's and is not
 * changed. Nothing here says which model is right.
 */
import {
  formatBytes,
  type PredictionResult,
  type SecondModelCell,
  type SecondModelComparison,
  type SecondModelStatus,
  utcLabel,
} from "@outpost/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Notice, Section } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Progress, Select, Skeleton } from "@/components/ui/misc";
import { api, errorMessage } from "@/lib/api";
import { notify } from "@/lib/notify";
import { useStorage } from "@/lib/queries";

const statusKey = ["propagation", "second-model"] as const;

export const useSecondModel = () =>
  useQuery({
    queryKey: statusKey,
    queryFn: () => api.get<SecondModelStatus>("/api/radio/propagation/second-model"),
    // While the maps are downloading or the engine is being built, look again now and then; the end of it also says so.
    refetchInterval: (query) => (query.state.data?.engine.build.running ? 1_500 : query.state.data?.maps.downloading ? 5_000 : false),
  });

const one = (value: number) => `${value < 0 ? "−" : ""}${Math.abs(value).toFixed(1)}`;
const signed = (value: number) => `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value).toFixed(1)}`;
const openWord = (open: boolean) => (open ? "Open" : "Shut");

/**
 * The engine, where it is not built yet: a button that has Outpost build it, what that
 * is doing while it runs, why the last one failed, and where Outpost cannot, the script.
 */
function EngineSetup({ status }: { status: SecondModelStatus }) {
  const client = useQueryClient();
  const { build } = status.engine;
  const start = useMutation({
    mutationFn: () => api.post("/api/radio/propagation/second-model/engine/build", {}),
    onSuccess: () => client.invalidateQueries({ queryKey: statusKey }),
    onError: (error) => notify.error(errorMessage(error)),
  });
  if (build.running) {
    const { current, total, message } = build.progress ?? { current: null, total: null, message: null };
    return (
      <div className="mt-3 max-w-md" data-engine-build="running">
        <p className="text-small text-ink" aria-live="polite">
          Building the P.533 engine{message ? `: ${message.charAt(0).toLowerCase()}${message.slice(1)}` : ""}.
        </p>
        <Progress className="mt-1.5" value={total ? Math.min(1, (current ?? 0) / total) : null} label="Building the P.533 engine" />
        <p className="mt-1.5 text-small text-ink-muted">
          You can leave this page: it carries on, and the comparison is offered when it is done.
        </p>
      </div>
    );
  }
  if (!build.possible) {
    return (
      <p className="mt-1 text-small text-ink-muted">
        The ITU's software is not shipped with Outpost. It is built here from the ITU's own source:{" "}
        <code className="font-mono text-[0.8125rem]">node scripts/build-p533-engine.mjs</code>
        {build.reason ? <span className="mt-1 block">{build.reason}</span> : null}
      </p>
    );
  }
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2" data-engine-build="offered">
      {build.failed ? (
        <Notice tone="danger" className="w-full">
          The last build did not finish. {build.failed}
        </Notice>
      ) : null}
      <Button loading={start.isPending} onClick={() => start.mutate()}>
        Build the P.533 engine ({formatBytes(build.downloadBytes)})
      </Button>
      <p className="w-full text-small text-ink-muted">
        The ITU's software is not shipped with Outpost, so it is built here, once: Outpost fetches the ITU's own source and a compiler
        (wasi-sdk) when you press this and at no other time, checks both against recorded checksums, compiles, and keeps the result only if
        it is byte for byte the file it expects. It needs about {formatBytes(build.neededBytes)} free while it runs; the compiler is deleted
        afterwards. A few minutes on a small computer.
      </p>
    </div>
  );
}

function Setup({ status }: { status: SecondModelStatus }) {
  const client = useQueryClient();
  const locations = useStorage();
  const [locationId, setLocationId] = useState<string | undefined>(undefined);
  const available = (locations.data?.locations ?? []).filter((location) => location.status === "available");
  const chosen = locationId ?? available.find((location) => location.isDefault)?.id ?? available[0]?.id;
  const download = useMutation({
    mutationFn: () => api.post("/api/radio/propagation/second-model/maps/download", { locationId: chosen }),
    onSuccess: () => {
      toast.success("Fetching the P.533 maps. Progress is under Downloads.");
      void client.invalidateQueries({ queryKey: statusKey });
    },
    onError: (error) => notify.error(errorMessage(error)),
  });
  return (
    <div className="max-w-[75ch]">
      <p className="text-body text-ink">{status.line}</p>
      {!status.engine.built ? <EngineSetup status={status} /> : null}
      {!status.maps.installed ? (
        status.maps.downloading ? (
          <p className="mt-2 text-small text-ink-muted">The maps are downloading. Progress is under Downloads.</p>
        ) : (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {available.length > 1 ? (
              <div className="w-full sm:w-64">
                <Select
                  aria-label="Where to keep the P.533 maps"
                  value={chosen}
                  onChange={setLocationId}
                  options={available.map((location) => ({ value: location.id, label: location.name }))}
                />
              </div>
            ) : null}
            <Button loading={download.isPending} onClick={() => download.mutate()}>
              Download the P.533 maps ({formatBytes(status.maps.bytes)})
            </Button>
            <p className="w-full text-small text-ink-muted">
              {status.maps.files} files from the ITU's repository, fetched when you press this and at no other time. {status.terms}
            </p>
          </div>
        )
      ) : null}
    </div>
  );
}

function HourTable({ comparison, hour }: { comparison: SecondModelComparison; hour: number }) {
  const at = comparison.hours[hour - 1]!;
  const required = comparison.requiredSnrDbHz !== null;
  return (
    <div className="mt-4">
      <p className="mb-1 text-small font-medium text-ink">
        At {utcLabel(hour)} UTC, each model's own figures (V: VOACAP, P: P.533). The difference is P.533's signal less VOACAP's, given only
        where both have the path open.
      </p>
      <div className="scroll-quiet overflow-x-auto">
        <table className="tabular w-full min-w-max text-small">
          <caption className="sr-only">At {utcLabel(hour)} UTC, each model's own figures</caption>
          <thead>
            <tr className="border-b border-border text-ink-muted">
              <th scope="col" className="py-1 pr-3 text-left font-medium">
                Band
              </th>
              <th scope="col" className="px-2 py-1 text-left font-medium">
                Path, V / P
              </th>
              <th scope="col" className="px-2 py-1 text-right font-medium">
                MUF, MHz, V / P
              </th>
              <th scope="col" className="px-2 py-1 text-right font-medium">
                Signal, dBW, V / P
              </th>
              <th scope="col" className="px-2 py-1 text-right font-medium">
                Difference, dB
              </th>
              <th scope="col" className="px-2 py-1 text-right font-medium">
                SNR in 1 Hz, dB, V / P
              </th>
              {required ? (
                <>
                  <th scope="col" className="px-2 py-1 text-right font-medium">
                    VOACAP reliability
                  </th>
                  <th scope="col" className="py-1 pl-2 text-right font-medium">
                    P.533 basic circuit reliability
                  </th>
                </>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {at.cells.map((cell: SecondModelCell, index) => (
              <tr key={cell.mhz} className="border-b border-border">
                <th scope="row" className="whitespace-nowrap py-1 pr-3 text-left font-medium text-ink">
                  {comparison.rows[index]!.label}
                </th>
                <td className={`px-2 py-1 ${cell.agreeOnOpen ? "text-ink" : "font-semibold text-warning"}`}>
                  {openWord(cell.voacap.open)} / {openWord(cell.p533.open)}
                </td>
                <td className="px-2 py-1 text-right text-ink">
                  {one(cell.voacap.mufMhz)} / {one(cell.p533.mufMhz)}
                </td>
                <td className="px-2 py-1 text-right text-ink">
                  {one(cell.voacap.signalDbw)} / {one(cell.p533.signalDbw)}
                </td>
                <td className="px-2 py-1 text-right text-ink">
                  {cell.voacap.open && cell.p533.open ? signed(cell.difference.signalDb) : "–"}
                </td>
                <td className="px-2 py-1 text-right text-ink">
                  {one(cell.voacap.snrDbHz)} / {one(cell.p533.snrDbHz)}
                </td>
                {required ? (
                  <>
                    <td className="px-2 py-1 text-right text-ink">
                      {cell.voacap.reliability === null ? "–" : `${Math.round(cell.voacap.reliability * 100)}% of days`}
                    </td>
                    <td className="py-1 pl-2 text-right text-ink">
                      {cell.p533.basicCircuitReliabilityPercent === null ? "–" : `${Math.round(cell.p533.basicCircuitReliabilityPercent)}%`}
                    </td>
                  </>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Whether each model has the path open, band by band through the day. */
function OpenGrid({ comparison, hour, onHour }: { comparison: SecondModelComparison; hour: number; onHour: (hour: number) => void }) {
  const mark = (cell: SecondModelCell) =>
    cell.voacap.open && cell.p533.open ? "both" : !cell.voacap.open && !cell.p533.open ? "neither" : cell.voacap.open ? "voacap" : "p533";
  const symbol = { both: "●", neither: "·", voacap: "V", p533: "P" } as const;
  const words = { both: "open in both", neither: "shut in both", voacap: "open in VOACAP only", p533: "open in P.533 only" } as const;
  return (
    <div className="mt-4">
      <p className="mb-1 text-small text-ink-muted">
        Open or shut by hour (UTC): ● open in both, · shut in both, V open in VOACAP only, P open in P.533 only. Press an hour to read it.
      </p>
      <div className="scroll-quiet overflow-x-auto">
        <table className="tabular w-full min-w-max text-small">
          <caption className="sr-only">Open or shut by hour (UTC), each band, both models</caption>
          <thead>
            <tr className="border-b border-border text-ink-muted">
              <th scope="col" className="py-1 pr-3 text-left font-medium">
                Band
              </th>
              {comparison.hours.map((item) => (
                <th key={item.utc} scope="col" className="p-0 text-center font-medium">
                  <button
                    type="button"
                    aria-pressed={item.utc === hour}
                    aria-label={`${utcLabel(item.utc)} UTC`}
                    onClick={() => onHour(item.utc)}
                    className={`min-h-11 min-w-7 rounded-control px-0.5 focus-visible:outline-2 focus-visible:outline-focus ${
                      item.utc === hour ? "bg-surface-strong font-semibold text-ink" : ""
                    }`}
                  >
                    {String(item.utc).padStart(2, "0")}
                  </button>
                </th>
              ))}
              <th scope="col" className="py-1 pl-3 text-right font-medium">
                Agree
              </th>
              <th scope="col" className="py-1 pl-3 text-right font-medium">
                P.533 signal less VOACAP's, open in both
              </th>
            </tr>
          </thead>
          <tbody>
            {comparison.rows.map((row, index) => (
              <tr key={row.mhz} className="border-b border-border">
                <th scope="row" className="whitespace-nowrap py-1 pr-3 text-left font-medium text-ink">
                  {row.label}
                </th>
                {comparison.hours.map((item) => {
                  const kind = mark(item.cells[index]!);
                  return (
                    <td
                      key={item.utc}
                      title={`${row.label} at ${utcLabel(item.utc)}: ${words[kind]}`}
                      className={`text-center ${kind === "voacap" || kind === "p533" ? "font-semibold text-warning" : "text-ink"} ${item.utc === hour ? "bg-surface-strong" : ""}`}
                    >
                      <span aria-hidden="true">{symbol[kind]}</span>
                      <span className="sr-only">{words[kind]}</span>
                    </td>
                  );
                })}
                <td className="py-1 pl-3 text-right text-ink">{row.hoursAgreeOnOpen} of 24 h</td>
                <td className="py-1 pl-3 text-right text-ink">
                  {row.signalDifferenceDb
                    ? row.signalDifferenceDb.min === row.signalDifferenceDb.max
                      ? `${signed(row.signalDifferenceDb.min)} dB`
                      : `${signed(row.signalDifferenceDb.min)} to ${signed(row.signalDifferenceDb.max)} dB`
                    : "no hour open in both"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Answer({ comparison, hour, onHour }: { comparison: SecondModelComparison; hour: number; onHour: (hour: number) => void }) {
  return (
    <div>
      <Notice title="Both models with isotropic antennas, 0 dBi">
        P.533 has no antenna models, so this comparison runs both with isotropic antennas at both ends. Your own antennas are in the
        prediction above, which is VOACAP's. Neither model is the right answer.
      </Notice>
      <OpenGrid comparison={comparison} hour={hour} onHour={onHour} />
      <HourTable comparison={comparison} hour={hour} />
      <ul className="mt-4 max-w-[75ch] list-disc space-y-1.5 pl-5 text-small text-ink-muted">
        {comparison.notes.slice(1).map((note) => (
          <li key={note}>{note}</li>
        ))}
        <li>
          Both at sunspot number {comparison.basis.ssn}, {comparison.noise.label.toLowerCase()} noise (P.372 "{comparison.noise.p533}" for
          P.533), {Math.round(comparison.distanceKm)} km.
        </li>
        <li>
          {comparison.engines.voacap.model}, checksum {comparison.engines.voacap.sha256.slice(0, 12)}…; {comparison.engines.p533.model},{" "}
          {comparison.engines.p533.implementation}, checksum {comparison.engines.p533.sha256.slice(0, 12)}…. Terms of P.533:{" "}
          {comparison.engines.p533.licence}
        </li>
        <li>
          {comparison.cached ? "Found already worked out" : "Worked out just now"}. Data:{" "}
          {comparison.datasets.map((item) => `${item.id} ${item.version}`).join("; ")}.
        </li>
      </ul>
    </div>
  );
}

export function SecondModel({ result, hour, onHour }: { result: PredictionResult; hour: number; onHour: (hour: number) => void }) {
  const status = useSecondModel();
  const [wanted, setWanted] = useState(false);
  const compare = useMutation({
    mutationFn: (request: PredictionResult["request"]) =>
      api.post<SecondModelComparison>("/api/radio/propagation/second-model/compare", request),
  });
  // biome-ignore lint/correctness/useExhaustiveDependencies: asked again only when the prediction changes or the comparison is wanted
  useEffect(() => {
    if (wanted && status.data?.offered) compare.mutate(result.request);
  }, [result.key, wanted, status.data?.offered]);

  return (
    <Section
      title="Compare with a second model (ITU P.533)"
      description="The same path, month, sunspot number, power, noise and requirement, worked out by the ITU's P.533 beside VOACAP."
      actions={
        status.data?.offered ? (
          <Button aria-pressed={wanted} onClick={() => setWanted((value) => !value)}>
            {wanted ? "Hide the comparison" : "Compare with a second model (ITU P.533)"}
          </Button>
        ) : undefined
      }
    >
      {status.isPending ? (
        <Skeleton className="h-10 w-full" />
      ) : status.isError ? (
        <Notice tone="danger" title="Whether the second model is set up could not be read">
          {errorMessage(status.error)}
        </Notice>
      ) : !status.data.offered ? (
        <Setup status={status.data} />
      ) : !wanted ? (
        <p className="max-w-[75ch] text-small text-ink-muted">
          Runs both with isotropic antennas, since P.533 has no antenna models. Your prediction above stays VOACAP's.
        </p>
      ) : compare.isPending ? (
        <div aria-busy="true">
          <p className="mb-2 text-small text-ink-muted">Running both models for this path…</p>
          <Skeleton className="h-48 w-full" />
        </div>
      ) : compare.isError ? (
        <Notice tone="danger" title="P.533 gave no answer">
          {errorMessage(compare.error)} The prediction above is VOACAP's and is not affected.
        </Notice>
      ) : compare.data ? (
        <Answer comparison={compare.data} hour={hour} onHour={onHour} />
      ) : null}
    </Section>
  );
}
