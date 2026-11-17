/**
 * The contact log: what actually happened on the air, typed in or read from an ADIF
 * file, and how it compares with what the engine predicted for the same paths. The
 * comparison counts; it does not grade the engine.
 */
import {
  COMPARISON_LEVELS,
  COMPARISON_MAX_PATHS,
  COMPARISON_MIN_FOR_SHARES,
  type ComparisonResult,
  formatBytes,
  modeById,
  NOISE_ENVIRONMENTS,
  type NoiseEnvironment,
  OBSERVATION_OUTCOMES,
  type Observation,
  type ObservationEnd,
  type ObservationImport,
  type ObservationOutcome,
  parseCoordinates,
} from "@outpost/shared";
import { useQueryClient } from "@tanstack/react-query";
import { Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { EmptyState, ErrorState, Notice, Page, PageHeader, Rows, Section } from "@/components/page";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Progress, Select, Skeleton } from "@/components/ui/misc";
import { errorMessage } from "@/lib/api";
import { formatNumber, plural } from "@/lib/utils";
import { AntennaPicker, antennaChoices } from "../antenna-picker";
import { antennaOf, type PlaceField, useEngines, usePlaces, useProfiles } from "../data";
import { EngineNotReady } from "../engine-data";
import { PlaceInput } from "../place-field";
import {
  logKeys,
  monthWords,
  rememberedSsn,
  rememberSsn,
  stopImport,
  useAddObservation,
  useCompareLog,
  useImportAdif,
  useImportJob,
  useLog,
  useRemoveImport,
  useRemoveObservation,
  utcStamp,
} from "./data";

const OUTCOME_WORDS: Record<ObservationOutcome, string> = { contact: "Contact", heard: "Heard, no contact", failed: "Called, not heard" };

/** One end as it is listed: its callsign, and where its position came from or that it has none. */
function whereOf(end: ObservationEnd): string {
  if (end.lat === null || end.lon === null) return "no position";
  return end.from.startsWith("locator ") ? end.from.slice(8) : `${end.lat.toFixed(2)}, ${end.lon.toFixed(2)}`;
}

function endWords(end: ObservationEnd): string {
  return `${end.call || "No callsign"} (${whereOf(end)})`;
}

function End({ end }: { end: ObservationEnd }) {
  // The call is what a person looks for; its position stays on one line.
  return (
    <>
      <span className="text-ink">{end.call || "No callsign"}</span> <span className="whitespace-nowrap">({whereOf(end)})</span>
    </>
  );
}

function ImportSummary({ result }: { result: ObservationImport }) {
  const left = result.skipped.reduce((sum, item) => sum + item.count, 0);
  return (
    <Notice
      tone={result.imported > 0 ? "success" : "warning"}
      title={`${result.fileName}: ${plural(result.imported, "entry", "entries")} brought in`}
      className="mb-6"
    >
      <p className="tabular">
        {plural(result.records, "record")} in the file{result.adifVersion ? `, which says it is ADIF ${result.adifVersion}` : ""}
        {result.program ? `, written by ${result.program}` : ""}. {formatNumber(result.imported)} brought in,{" "}
        {formatNumber(result.duplicates)} already in the log, {formatNumber(left)} left out.
      </p>
      {result.skipped.length > 0 ? (
        <ul className="tabular mt-1.5 list-disc pl-5" aria-label="Records left out, by reason">
          {result.skipped.map((item) => (
            <li key={item.reason}>
              {item.reason}: {formatNumber(item.count)}
            </li>
          ))}
        </ul>
      ) : null}
      {result.notes.length > 0 ? (
        <ul className="tabular mt-1.5 list-disc pl-5" aria-label="Read with a loss">
          {result.notes.map((item) => (
            <li key={item.reason}>
              {item.reason}: {formatNumber(item.count)}
            </li>
          ))}
        </ul>
      ) : null}
    </Notice>
  );
}

type ImportOutcome = { kind: "done"; result: ObservationImport } | { kind: "refused"; message: string } | { kind: "stopped" };

const nowUtc = () => new Date().toISOString().slice(0, 16);

function EntryDialog({ onClose }: { onClose: () => void }) {
  const places = usePlaces();
  const add = useAddObservation();
  const [at, setAt] = useState(nowUtc);
  const [outcome, setOutcome] = useState<ObservationOutcome>("contact");
  const [txCall, setTxCall] = useState("");
  const [rxCall, setRxCall] = useState("");
  const [txPlace, setTxPlace] = useState<PlaceField>({ text: "", name: "" });
  const [rxPlace, setRxPlace] = useState<PlaceField>({ text: "", name: "" });
  const [frequency, setFrequency] = useState("");
  const [mode, setMode] = useState("SSB");
  const [power, setPower] = useState("");
  const [antenna, setAntenna] = useState("");
  const [sent, setSent] = useState("");
  const [received, setReceived] = useState("");
  const [notes, setNotes] = useState("");
  const [problem, setProblem] = useState<{ field: string; text: string } | null>(null);
  const error = (field: string) => (problem?.field === field ? problem.text : undefined);
  const first = outcome === "heard" ? "The station heard" : "Your station";
  const second = outcome === "heard" ? "Your station" : "The other station";

  const submit = () => {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(at)) return setProblem({ field: "at", text: "Give the date and the time, in UTC." });
    const position = (place: PlaceField, field: string) => {
      if (place.text.trim() === "") return { lat: null, lon: null };
      const found = parseCoordinates(place.text);
      if (!found) {
        setProblem({ field, text: "That is not a position: give coordinates, a grid reference or a locator, or leave it empty." });
        return undefined;
      }
      return { lat: found.lat, lon: found.lon };
    };
    const tx = position(txPlace, "tx");
    if (!tx) return;
    const rx = position(rxPlace, "rx");
    if (!rx) return;
    const mhz = frequency.trim() === "" ? Number.NaN : Number(frequency);
    if (!(mhz > 0)) return setProblem({ field: "frequency", text: "Give the frequency in megahertz." });
    if (!mode.trim()) return setProblem({ field: "mode", text: "Give the mode: SSB, CW, FT8." });
    const watts = power.trim() === "" ? null : Number(power);
    if (watts !== null && !(watts >= 0.1))
      return setProblem({ field: "power", text: "Give the power in watts, at least 0.1, or leave it empty." });
    setProblem(null);
    add.mutate(
      {
        at: `${at.slice(0, 16)}:00Z`,
        frequencyMhz: mhz,
        band: "",
        mode: mode.trim(),
        outcome,
        tx: { call: txCall.trim(), ...tx },
        rx: { call: rxCall.trim(), ...rx },
        powerWatts: watts,
        antenna: antenna.trim(),
        reportSent: sent.trim(),
        reportReceived: received.trim(),
        notes,
      },
      { onSuccess: onClose },
    );
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="lg" title="Log an entry" description="A contact, a station heard, or a call that got no answer. Times are UTC.">
        <DialogBody className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Date and time, UTC" error={error("at")}>
              {(ids) => <Input {...ids} type="datetime-local" value={at} onChange={(event) => setAt(event.target.value)} />}
            </Field>
            <Field label="What happened" hint={OBSERVATION_OUTCOMES.find((item) => item.id === outcome)?.meaning}>
              {(ids) => (
                <Select<ObservationOutcome>
                  {...ids}
                  value={outcome}
                  onChange={setOutcome}
                  options={OBSERVATION_OUTCOMES.map((item) => ({ value: item.id, label: item.label }))}
                />
              )}
            </Field>
            <Field label="Frequency, MHz" error={error("frequency")}>
              {(ids) => (
                <Input
                  {...ids}
                  value={frequency}
                  onChange={(event) => setFrequency(event.target.value)}
                  inputMode="decimal"
                  className="tabular"
                />
              )}
            </Field>
            <Field label="Mode" hint="As you would log it: SSB, CW, FT8, JS8." error={error("mode")}>
              {(ids) => <Input {...ids} value={mode} onChange={(event) => setMode(event.target.value)} maxLength={24} />}
            </Field>
          </div>
          <fieldset className="grid gap-3">
            <legend className="mb-2 text-small font-semibold text-ink">{first}, transmitting</legend>
            <Field label={`${first}: callsign`} optional>
              {(ids) => (
                <Input
                  {...ids}
                  value={txCall}
                  onChange={(event) => setTxCall(event.target.value)}
                  maxLength={20}
                  className="max-w-48 font-mono"
                />
              )}
            </Field>
            <PlaceInput
              label={`${first}: where`}
              what={first.toLowerCase()}
              value={txPlace}
              onChange={setTxPlace}
              places={places.data ?? []}
              error={error("tx")}
            />
          </fieldset>
          <fieldset className="grid gap-3">
            <legend className="mb-2 text-small font-semibold text-ink">{second}, receiving</legend>
            <Field label={`${second}: callsign`} optional>
              {(ids) => (
                <Input
                  {...ids}
                  value={rxCall}
                  onChange={(event) => setRxCall(event.target.value)}
                  maxLength={20}
                  className="max-w-48 font-mono"
                />
              )}
            </Field>
            <PlaceInput
              label={`${second}: where`}
              what={second.toLowerCase()}
              value={rxPlace}
              onChange={setRxPlace}
              places={places.data ?? []}
              error={error("rx")}
            />
            <p className="text-small text-ink-muted">
              A position may be left empty. An end with no position is kept as it is and left out of comparisons; Outpost never works a
              position out from a callsign.
            </p>
          </fieldset>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Transmitter power, watts" optional hint="Of the transmitting station. Leave empty if not known." error={error("power")}>
              {(ids) => (
                <Input
                  {...ids}
                  value={power}
                  onChange={(event) => setPower(event.target.value)}
                  inputMode="decimal"
                  className="tabular max-w-32"
                />
              )}
            </Field>
            <Field label="Antenna" optional>
              {(ids) => <Input {...ids} value={antenna} onChange={(event) => setAntenna(event.target.value)} maxLength={120} />}
            </Field>
            <Field label="Report sent" optional>
              {(ids) => (
                <Input {...ids} value={sent} onChange={(event) => setSent(event.target.value)} maxLength={20} className="max-w-32" />
              )}
            </Field>
            <Field label="Report received" optional>
              {(ids) => (
                <Input
                  {...ids}
                  value={received}
                  onChange={(event) => setReceived(event.target.value)}
                  maxLength={20}
                  className="max-w-32"
                />
              )}
            </Field>
          </div>
          <Field label="Notes" optional>
            {(ids) => <Textarea {...ids} rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={4000} />}
          </Field>
          {add.isError ? (
            <Notice tone="danger" title="Not added">
              {errorMessage(add.error)}
            </Notice>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={add.isPending} onClick={submit}>
            Add to the log
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type Levels = ComparisonResult["levels"];

/** Where the entries fell, by the engine's reliability: one table, for the entries with modelled figures or for the approximate ones. */
function LevelsTable({ levels, caption, shares }: { levels: Levels; caption: string; shares: boolean }) {
  const made = levels.reduce((sum, level) => sum + level.contact + level.heard, 0);
  const failed = levels.reduce((sum, level) => sum + level.failed, 0);
  const cell = (count: number, of: number) =>
    shares && of > 0 ? `${formatNumber(count)} (${Math.round((count / of) * 100)}%)` : formatNumber(count);
  return (
    <table className="tabular mt-3 w-full max-w-2xl text-small">
      <caption className="mb-1 text-left text-ink-muted">{caption}</caption>
      <thead>
        <tr className="border-b border-border-strong text-left text-ink-muted">
          <th scope="col" className="py-1.5 pr-3 font-medium">
            The engine's reliability
          </th>
          <th scope="col" className="px-3 py-1.5 text-right font-medium">
            Contacts made or stations heard
          </th>
          <th scope="col" className="py-1.5 pl-3 text-right font-medium">
            Calls not heard
          </th>
        </tr>
      </thead>
      <tbody>
        {COMPARISON_LEVELS.map((level) => {
          const counts = levels.find((item) => item.id === level.id) ?? { contact: 0, heard: 0, failed: 0 };
          return (
            <tr key={level.id} className="border-b border-border">
              <th scope="row" className="py-1.5 pr-3 text-left font-medium text-ink">
                {level.label}
              </th>
              <td className="px-3 py-1.5 text-right text-ink">{cell(counts.contact + counts.heard, made)}</td>
              <td className="py-1.5 pl-3 text-right text-ink">{cell(counts.failed, failed)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function Comparison({ result }: { result: ComparisonResult }) {
  // Entries on bands where an antenna is run as an approximation are counted apart (older answers have none).
  const rough = result.comparedApproximate ?? 0;
  const modelled = result.compared - rough;
  return (
    <div className="mt-5">
      <p className="tabular text-small text-ink">
        {formatNumber(result.compared)} of {plural(result.total, "entry", "entries")} could be compared with a prediction
        {rough > 0 ? `, ${formatNumber(rough)} of them against approximate figures` : ""}.
        {result.compared === 0 ? " There is nothing to count." : ""}
      </p>
      {modelled > 0 ? (
        <>
          <LevelsTable
            levels={result.levels}
            shares={modelled >= COMPARISON_MIN_FOR_SHARES}
            caption={`Where the entries fell, by the reliability the engine gave that path at that hour${rough > 0 ? " (the approximate ones are below)" : ""}`}
          />
          <p className="mt-2 max-w-[75ch] text-small text-ink-muted">
            {modelled >= COMPARISON_MIN_FOR_SHARES
              ? "Each percentage is a share of its own column, and the count beside it is what it rests on."
              : `With fewer than ${COMPARISON_MIN_FOR_SHARES} compared, no percentages are given: a share of a handful says nothing either way.`}
          </p>
        </>
      ) : null}
      {rough > 0 ? (
        <div data-approximate className="mt-5">
          <h3 className="text-body font-semibold text-ink">≈ Compared with approximate figures</h3>
          <p className="mt-0.5 max-w-[75ch] text-small text-ink-muted">
            On these entries' frequencies an antenna you chose is an end-fed wire the engine runs as its sloping long wire, whose level is
            unchecked. Comparing what happened with an approximate model says less, so they are counted apart and not mixed into the table
            above.
          </p>
          <LevelsTable
            levels={result.approximateLevels ?? []}
            shares={rough >= COMPARISON_MIN_FOR_SHARES}
            caption="Where the approximate entries fell, by the engine's approximate reliability"
          />
        </div>
      ) : null}
      {result.excluded.length > 0 ? (
        <div className="mt-5">
          <h3 className="text-body font-semibold text-ink">Left out of the comparison</h3>
          <ul
            className="tabular mt-1.5 grid max-w-[75ch] list-disc gap-1 pl-5 text-small text-ink-muted"
            aria-label="Entries left out, by reason"
          >
            {result.excluded.map((item) => (
              <li key={item.reason}>
                {item.reason}: {formatNumber(item.count)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="mt-5">
        <h3 className="text-body font-semibold text-ink">What this can and cannot show</h3>
        <ul className="mt-1.5 grid max-w-[75ch] list-disc gap-1 pl-5 text-small text-ink-muted">
          {result.reading.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>
      {result.rows.length > 0 ? (
        <div className="scroll-quiet mt-5 max-h-96 overflow-auto border-y border-border">
          <table className="tabular w-full min-w-[40rem] text-small">
            <caption className="sr-only">Each entry compared, with the engine's figures for it</caption>
            <thead className="sticky top-0 bg-page">
              <tr className="border-b border-border-strong text-left text-ink-muted">
                <th scope="col" className="py-1.5 pr-3 font-medium">
                  When
                </th>
                <th scope="col" className="px-3 py-1.5 font-medium">
                  From, to
                </th>
                <th scope="col" className="px-3 py-1.5 text-right font-medium">
                  MHz
                </th>
                <th scope="col" className="px-3 py-1.5 font-medium">
                  As
                </th>
                <th scope="col" className="px-3 py-1.5 text-right font-medium">
                  km
                </th>
                <th scope="col" className="px-3 py-1.5 text-right font-medium">
                  Engine's reliability
                </th>
                <th scope="col" className="py-1.5 pl-3 font-medium">
                  Logged as
                </th>
              </tr>
            </thead>
            <tbody>
              {result.rows.slice(0, 200).map((row) => (
                <tr key={row.id} className="border-b border-border">
                  <td className="whitespace-nowrap py-1.5 pr-3 text-ink">{utcStamp(row.at)}</td>
                  <td className="px-3 py-1.5 font-mono text-ink">
                    {row.txCall || "?"} to {row.rxCall || "?"}
                  </td>
                  <td className="px-3 py-1.5 text-right text-ink">{row.frequencyMhz.toFixed(2)}</td>
                  <td className="px-3 py-1.5 text-ink">{modeById(row.mode).label}</td>
                  <td className="px-3 py-1.5 text-right text-ink">{Math.round(row.distanceKm)}</td>
                  <td className="px-3 py-1.5 text-right text-ink">
                    {row.approximate ? (
                      <>
                        <span className="sr-only">approximately </span>
                        <span aria-hidden>≈</span>
                      </>
                    ) : null}
                    {Math.round(row.reliability * 100)}% at {String(row.utcHour).padStart(2, "0")}:00, SSN {row.ssn}
                  </td>
                  <td className="py-1.5 pl-3 text-ink">{OUTCOME_WORDS[row.outcome]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {result.rows.length > 200 ? (
        <p className="mt-1 text-small text-ink-muted">The first 200 of {formatNumber(result.rows.length)} compared are listed.</p>
      ) : null}
      <p className="tabular mt-3 text-small text-ink-muted">
        Worked out in {(result.tookMs / 1000).toFixed(1)} s by {result.engine.model}. At most {COMPARISON_MAX_PATHS} different paths are put
        to the engine at once, newest first.
      </p>
    </div>
  );
}

export default function LogPage() {
  // A screenful to begin with, so that the comparison below is not a long way down.
  const [limit, setLimit] = useState(25);
  const log = useLog(limit);
  const engines = useEngines();
  const profiles = useProfiles();
  const importAdif = useImportAdif();
  const removeEntry = useRemoveObservation();
  const removeImport = useRemoveImport();
  const compare = useCompareLog();
  const picker = useRef<HTMLInputElement>(null);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<Observation | null>(null);
  const [takingBack, setTakingBack] = useState<ObservationImport | null>(null);
  const [myAntenna, setMyAntenna] = useState("preset:low-dipole");
  const [theirAntenna, setTheirAntenna] = useState("preset:dipole-10m");
  const [noise, setNoise] = useState<NoiseEnvironment>("residential");
  const [power, setPower] = useState("");
  const [ssn, setSsn] = useState<Record<string, string>>(rememberedSsn);
  const [problem, setProblem] = useState("");
  const client = useQueryClient();
  // How the last import ended. A large file is a job, so its end comes from the job and not from the upload's answer.
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null);
  const [startedJob, setStartedJob] = useState<string | null>(null);
  const [settledJobs, setSettledJobs] = useState<readonly string[]>([]);
  // The job this screen started, or one found under way when the screen was opened part of the way through.
  const importJobId = [startedJob, log.data?.importing?.id].find((id) => id && !settledJobs.includes(id)) ?? null;
  const importJob = useImportJob(importJobId);
  const importState = importJob.data?.id === importJobId ? importJob.data?.state : undefined;
  const importResult = importJob.data?.result as { import?: ObservationImport } | null | undefined;
  const importError = importJob.data?.error;
  useEffect(() => {
    if (!importJobId || !importState || !["succeeded", "failed", "cancelled"].includes(importState)) return;
    setSettledJobs((current) => [...current, importJobId]);
    if (importState === "succeeded" && importResult?.import) setOutcome({ kind: "done", result: importResult.import });
    else if (importState === "cancelled") setOutcome({ kind: "stopped" });
    else setOutcome({ kind: "refused", message: importError ?? "The file could not be brought in." });
    void client.invalidateQueries({ queryKey: logKeys.all });
  }, [importJobId, importState, importResult, importError, client]);
  const importProgress = importJob.data?.progress;
  const importing = importAdif.isPending || importJobId !== null;

  const startImport = (file: File) => {
    setOutcome(null);
    importAdif.mutate(file, {
      onSuccess: (answer) => {
        if (answer.job) setStartedJob(answer.job.id);
        else setOutcome({ kind: "done", result: answer.import });
      },
      onError: (error) => setOutcome({ kind: "refused", message: errorMessage(error) }),
    });
  };

  const antennas = profiles.data?.antennas ?? [];
  const engine = engines.data?.[0];
  const antennaOptions = antennaChoices(antennas);

  const runCompare = () => {
    const mine = antennaOf(myAntenna, antennas);
    const theirs = antennaOf(theirAntenna, antennas);
    if (!mine || !theirs) return setProblem("Choose both antennas.");
    const watts = power.trim() === "" ? null : Number(power);
    if (watts !== null && !(watts >= 0.1)) return setProblem("Give the power to assume in watts, at least 0.1, or leave it empty.");
    const ssnByMonth: Record<string, number> = {};
    for (const [month, text] of Object.entries(ssn)) {
      if (text.trim() === "") continue;
      const value = Number(text);
      if (!(value >= 0 && value <= 300)) return setProblem(`Give a smoothed sunspot number between 0 and 300 for ${monthWords(month)}.`);
      ssnByMonth[month] = value;
    }
    setProblem("");
    rememberSsn(ssn);
    compare.mutate({ myAntenna: mine.spec, theirAntenna: theirs.spec, noise, defaultPowerWatts: watts, ssnByMonth });
  };

  const actions = (
    <>
      <Button onClick={() => setAdding(true)}>Log an entry</Button>
      <Button variant="primary" loading={importing} onClick={() => picker.current?.click()}>
        <Upload aria-hidden />
        Import an ADIF file
      </Button>
      <input
        ref={picker}
        type="file"
        accept=".adi,.adif,text/plain"
        className="sr-only"
        aria-label="ADIF file to import"
        tabIndex={-1}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) startImport(file);
        }}
      />
    </>
  );

  return (
    <Page>
      <PageHeader
        title="Contact log"
        description="What actually happened on the air: contacts, stations heard, and calls that got no answer. Typed in, or read from your logging program's ADIF file, and set beside what the engine predicted for the same paths."
        actions={log.data && log.data.total > 0 ? actions : undefined}
      />
      {importJobId ? (
        <div className="mb-6 flex flex-wrap items-center gap-3" aria-live="polite">
          <div className="min-w-40 flex-1">
            <Progress
              tone="lamp"
              label="Log read"
              value={importProgress?.total ? (importProgress.current ?? 0) / importProgress.total : null}
            />
            <p className="tabular mt-1.5 text-small text-ink-muted">
              {importJob.data?.title ?? "A contact log"}:{" "}
              {importState === "running" && importProgress?.total
                ? `${formatBytes(importProgress.current ?? 0)} of ${formatBytes(importProgress.total)} read.`
                : "waiting its turn."}{" "}
              None of it is in the log until all of it is.
            </p>
          </div>
          <Button size="sm" onClick={() => void stopImport(importJobId).catch(() => undefined)}>
            Stop
          </Button>
        </div>
      ) : outcome?.kind === "refused" ? (
        <Notice tone="danger" title="Nothing was imported" className="mb-6">
          {outcome.message}
        </Notice>
      ) : outcome?.kind === "stopped" ? (
        <Notice tone="warning" title="The import was stopped" className="mb-6">
          Nothing from the file is in the log. Import it again to bring it in.
        </Notice>
      ) : outcome?.kind === "done" ? (
        <ImportSummary result={outcome.result} />
      ) : null}

      {log.isPending ? (
        <div className="grid gap-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : log.isError ? (
        <ErrorState error={log.error} onRetry={() => void log.refetch()} />
      ) : log.data.total === 0 ? (
        <EmptyState title="Nothing is logged yet" action={actions}>
          Log a contact as you make it, or import the ADIF file your logging program exports. Once there are entries with a position at both
          ends, they can be set beside what the engine predicted.
        </EmptyState>
      ) : (
        <>
          <Section title="Entries" description={`${plural(log.data.total, "entry", "entries")}, newest first. Times are UTC.`}>
            <Rows className="border-y border-border">
              {log.data.observations.map((item) => (
                <li key={item.id} className="flex items-start justify-between gap-3 py-2.5">
                  <span className="min-w-0">
                    <span className="tabular block text-ink">
                      {utcStamp(item.at)} · {item.frequencyMhz === null ? item.band : `${item.frequencyMhz.toFixed(3)} MHz`} · {item.mode} ·{" "}
                      {OUTCOME_WORDS[item.outcome]}
                    </span>
                    <span className="block font-mono text-small text-ink-muted">
                      <End end={item.tx} /> to <End end={item.rx} />
                    </span>
                    <span className="tabular block text-small text-ink-muted">
                      {[
                        item.powerWatts === null ? null : `${item.powerWatts} W`,
                        item.antenna || null,
                        item.reportSent ? `sent ${item.reportSent}` : null,
                        item.reportReceived ? `received ${item.reportReceived}` : null,
                        item.propMode ? `logged as ${item.propMode}` : null,
                        item.notes ? item.notes.split("\n")[0] : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                  <Button
                    size="sm"
                    variant="danger-ghost"
                    aria-label={`Delete the entry of ${utcStamp(item.at)} with ${item.rx.call || item.tx.call || "no callsign"}`}
                    onClick={() => setDeleting(item)}
                  >
                    Delete
                  </Button>
                </li>
              ))}
            </Rows>
            {log.data.total > log.data.observations.length ? (
              <Button className="mt-3" loading={log.isFetching} onClick={() => setLimit((current) => Math.min(500, current + 100))}>
                Show more ({formatNumber(log.data.observations.length)} of {formatNumber(log.data.total)} shown)
              </Button>
            ) : null}
          </Section>

          {log.data.imports.length > 0 ? (
            <Section title="Files imported" description="Taking a file back removes the entries it brought in, and nothing else.">
              <Rows className="border-y border-border">
                {log.data.imports.map((item) => (
                  <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                    <span className="min-w-0">
                      <span className="block truncate text-ink">{item.fileName}</span>
                      <span className="tabular block text-small text-ink-muted">
                        Imported {utcStamp(item.createdAt)}. {plural(item.records, "record")}: {formatNumber(item.imported)} brought in,{" "}
                        {formatNumber(item.duplicates)} already in the log,{" "}
                        {formatNumber(item.skipped.reduce((sum, skipped) => sum + skipped.count, 0))} left out.
                      </span>
                    </span>
                    <Button size="sm" variant="danger-ghost" onClick={() => setTakingBack(item)} aria-label={`Take back ${item.fileName}`}>
                      Take back
                    </Button>
                  </li>
                ))}
              </Rows>
            </Section>
          ) : null}

          <Section
            title="Compare with predictions"
            description="Each entry that can be compared is put to the engine as a path, at its own month, hour and frequency. The log does not say what antenna or noise the other stations had, so those are assumed, the same for all."
          >
            <EngineNotReady engine={engine} title="The propagation engine cannot run, so nothing can be compared" className="mb-4" />
            <div className="grid gap-x-8 gap-y-4 md:grid-cols-2">
              <Field label="Your antenna">
                {(ids) => <AntennaPicker {...ids} value={myAntenna} onChange={setMyAntenna} choices={antennaOptions} />}
              </Field>
              <Field label="Antenna assumed at every other station">
                {(ids) => <AntennaPicker {...ids} value={theirAntenna} onChange={setTheirAntenna} choices={antennaOptions} />}
              </Field>
              <Field label="Noise assumed at every receiver">
                {(ids) => (
                  <Select<NoiseEnvironment>
                    {...ids}
                    value={noise}
                    onChange={setNoise}
                    options={NOISE_ENVIRONMENTS.map((item) => ({ value: item.id, label: item.label }))}
                  />
                )}
              </Field>
              <Field label="Power to assume where the log gives none, watts" optional hint="Leave empty to leave those entries out.">
                {(ids) => (
                  <Input
                    {...ids}
                    value={power}
                    onChange={(event) => setPower(event.target.value)}
                    inputMode="decimal"
                    className="tabular max-w-32"
                  />
                )}
              </Field>
            </div>
            {compare.data && compare.data.monthsWithoutSsn.length > 0 ? (
              <fieldset className="mt-5">
                <legend className="text-small font-semibold text-ink">Months the solar table does not reach</legend>
                <p className="mt-0.5 max-w-[75ch] text-small text-ink-muted">
                  The table holds NOAA's forecast, not past months. Give the smoothed sunspot number for a month and its entries are
                  compared at that number; left empty, they stay out. Outpost does not ship past sunspot numbers (their licence does not
                  allow it).
                </p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {compare.data.monthsWithoutSsn.map((item) => (
                    <Field key={item.month} label={`${monthWords(item.month)} (${plural(item.count, "entry", "entries")})`}>
                      {(ids) => (
                        <Input
                          {...ids}
                          value={ssn[item.month] ?? ""}
                          onChange={(event) => setSsn((current) => ({ ...current, [item.month]: event.target.value }))}
                          inputMode="decimal"
                          className="tabular max-w-32"
                        />
                      )}
                    </Field>
                  ))}
                </div>
              </fieldset>
            ) : null}
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button variant="primary" loading={compare.isPending} disabled={engine ? !engine.ready : false} onClick={runCompare}>
                {compare.data ? "Compare again" : "Compare"}
              </Button>
              {problem ? (
                <p role="alert" className="text-small text-danger">
                  {problem}
                </p>
              ) : null}
            </div>
            {compare.isError ? (
              <Notice tone="danger" title="Nothing was compared" className="mt-4">
                {errorMessage(compare.error)}
              </Notice>
            ) : compare.isPending ? (
              <Skeleton className="mt-5 h-40 w-full" />
            ) : compare.data ? (
              <Comparison result={compare.data} />
            ) : null}
          </Section>
        </>
      )}

      {log.data ? (
        <p className="mt-10 max-w-[75ch] text-small text-ink-muted">
          ADIF files are read as version {log.data.adif.version} of the specification describes the .adi form ({log.data.adif.source}, read{" "}
          {log.data.adif.read}). Fields read: <span className="font-mono">{log.data.adif.fields.join(", ")}</span>. A position is taken only
          from a latitude and longitude or a locator of four characters or more that the file states. The same contact (minute, callsigns,
          band and mode) is never added twice. The XML form (.adx) is not read. Positions for comparison can also be{" "}
          <Link to="/radio/propagation" className="text-primary underline underline-offset-2">
            tried one path at a time in the planner
          </Link>
          .
        </p>
      ) : null}

      {adding ? <EntryDialog onClose={() => setAdding(false)} /> : null}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete this entry?"
        description={
          deleting
            ? `The entry of ${utcStamp(deleting.at)} (${endWords(deleting.tx)} to ${endWords(deleting.rx)}) will be removed from the log.`
            : ""
        }
        confirmLabel="Delete"
        loading={removeEntry.isPending}
        onConfirm={() => deleting && removeEntry.mutate(deleting.id, { onSuccess: () => setDeleting(null) })}
      />
      <ConfirmDialog
        open={takingBack !== null}
        onOpenChange={(open) => !open && setTakingBack(null)}
        title="Take this file back?"
        description={
          takingBack
            ? `The ${plural(takingBack.imported, "entry", "entries")} that “${takingBack.fileName}” brought in will be removed from the log. Entries typed in or from other files are not touched, and the file itself is not Outpost's to delete.`
            : ""
        }
        confirmLabel="Take back"
        loading={removeImport.isPending}
        onConfirm={() => takingBack && removeImport.mutate(takingBack.id, { onSuccess: () => setTakingBack(null) })}
      />
    </Page>
  );
}
