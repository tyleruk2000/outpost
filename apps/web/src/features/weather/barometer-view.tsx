/**
 * The barometer: pressure readings a person types (or brings in from a logger's file),
 * reduced to sea level, drawn over the last days, and the three-hour tendency in the
 * Met Office's words, with what a tendency is conventionally taken to suggest, quoted and
 * labelled as a rule of thumb.
 */
import {
  HEIGHT_RANGE,
  ISA,
  PRESSURE_RULES_OF_THUMB,
  type PressureUnit,
  pressureTendency,
  type ReadingImportResult,
  TENDENCY_SOURCE,
} from "@outpost/shared";
import { FileUp, Trash2 } from "lucide-react";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import { EmptyState, ErrorState, Notice } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Segmented, Skeleton } from "@/components/ui/misc";
import { ChartFrame } from "@/features/propagation/charts";
import { errorMessage } from "@/lib/api";
import { formatDateTime, plural } from "@/lib/utils";
import { deviceZone, useAddReading, useImportReadings, useReadings, useRemoveReading } from "./data";
import { TimeLine } from "./time-chart";

const HEIGHT_KEY = "outpost.weather.barometerHeight";
const DAY = 86_400_000;

/** The barometer's height is a per-device convenience: the same barometer is read from the same place. */
function storedHeight(): string {
  try {
    return localStorage.getItem(HEIGHT_KEY) ?? "0";
  } catch {
    return "0";
  }
}

/** "2026-11-16T09:30" for a datetime-local input, in the device's own time. */
const localInput = (at: number) => {
  const date = new Date(at - new Date(at).getTimezoneOffset() * 60_000);
  return date.toISOString().slice(0, 16);
};

export function BarometerView() {
  const readings = useReadings();
  const add = useAddReading();
  const remove = useRemoveReading();
  const [unit, setUnit] = useState<PressureUnit>("hPa");
  const [value, setValue] = useState("");
  const [height, setHeight] = useState(storedHeight);
  const [when, setWhen] = useState(() => localInput(Date.now()));
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    const number = Number(value.replace(",", "."));
    const metres = Number(height.replace(",", "."));
    const takenAt = new Date(when).getTime();
    if (!value.trim() || !Number.isFinite(number) || number <= 0) return setError("Give the pressure the barometer shows.");
    if (!Number.isFinite(metres) || metres < HEIGHT_RANGE.min || metres > HEIGHT_RANGE.max)
      return setError(`Give the barometer's height above sea level, between ${HEIGHT_RANGE.min} and ${HEIGHT_RANGE.max} m.`);
    if (!Number.isFinite(takenAt)) return setError("Give the date and time of the reading.");
    try {
      localStorage.setItem(HEIGHT_KEY, String(metres));
    } catch {
      // Remembering the height is a convenience; without it the field starts at nought.
    }
    add.mutate(
      { takenAt, value: number, unit, heightM: metres, note },
      {
        onSuccess: () => {
          setValue("");
          setNote("");
          setWhen(localInput(Date.now()));
          toast.success("Reading kept.");
        },
        onError: (failure) => setError(errorMessage(failure)),
      },
    );
  };

  const list = readings.data ?? [];
  const newest = list.length > 0 ? list[list.length - 1]!.takenAt : 0;
  const recent = list.filter((reading) => reading.takenAt >= newest - 3 * DAY);
  const tendency = pressureTendency(list);

  return (
    <div className="grid gap-10">
      <form onSubmit={submit} className="grid max-w-xl gap-4" aria-label="Add a reading" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Pressure the barometer shows">
            {(ids) => <Input {...ids} inputMode="decimal" value={value} onChange={(event) => setValue(event.target.value)} />}
          </Field>
          <div className="grid gap-1.5">
            <span className="text-small font-medium text-ink">Unit</span>
            <Segmented
              label="Unit"
              value={unit}
              onChange={setUnit}
              options={[
                { value: "hPa", label: "hPa (mb)" },
                { value: "inHg", label: "inHg" },
              ]}
            />
          </div>
          <Field label="Height of the barometer above sea level, m" hint="Kept on this device for the next reading.">
            {(ids) => <Input {...ids} inputMode="decimal" value={height} onChange={(event) => setHeight(event.target.value)} />}
          </Field>
          <Field label="When">
            {(ids) => <Input {...ids} type="datetime-local" value={when} onChange={(event) => setWhen(event.target.value)} />}
          </Field>
        </div>
        <Field label="Note (optional)">
          {(ids) => <Input {...ids} value={note} maxLength={400} onChange={(event) => setNote(event.target.value)} />}
        </Field>
        {error ? (
          <Notice tone="danger" className="max-w-xl">
            {error}
          </Notice>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" variant="primary" loading={add.isPending}>
            Keep this reading
          </Button>
          <Button type="button" variant="ghost" onClick={() => setImporting(true)}>
            <FileUp />
            Bring in a CSV file
          </Button>
        </div>
      </form>

      {readings.isPending ? (
        <div className="grid gap-2" role="status" aria-label="Loading readings">
          <Skeleton className="h-40" />
          <Skeleton className="h-12" />
        </div>
      ) : readings.isError ? (
        <ErrorState error={readings.error} onRetry={() => void readings.refetch()} />
      ) : list.length === 0 ? (
        <EmptyState compact seed={7} title="No readings yet">
          Type what your barometer shows every few hours, or bring in a logger's CSV file. With two readings about three hours apart, the
          tendency appears here in the Met Office's terms.
        </EmptyState>
      ) : (
        <>
          <section aria-labelledby="tendency-heading">
            <h3 id="tendency-heading" className="text-body font-semibold text-ink">
              The tendency over three hours
            </h3>
            {tendency.ok ? (
              <p className="mt-1 text-lead text-ink" data-testid="tendency">
                {tendency.tendency.words[0]!.toUpperCase() + tendency.tendency.words.slice(1)}:{" "}
                <span className="tabular">
                  {tendency.tendency.rounded > 0 ? "+" : ""}
                  {tendency.tendency.rounded.toFixed(1)} hPa
                </span>{" "}
                <span className="text-body text-ink-muted">
                  from {formatDateTime(tendency.tendency.from.takenAt)}
                  {tendency.tendency.from.interpolated ? " (worked out between two readings)" : ""} to{" "}
                  {formatDateTime(tendency.tendency.to.takenAt)}.
                </span>
              </p>
            ) : (
              <p className="mt-1 text-body text-ink-muted">{tendency.reason}</p>
            )}
            <details className="mt-3 max-w-[70ch] text-small">
              <summary className="min-h-11 cursor-pointer py-2 font-medium text-primary">The words, and the rule of thumb</summary>
              <p className="text-ink">
                The words are the Met Office's for a change in three hours: slowly 0.1 to 1.5 hPa; rising or falling 1.6 to 3.5; quickly 3.6
                to 6.0; very rapidly more than 6.0. "Now rising" or "now falling" means it had gone the other way, or held steady, earlier
                in the three hours. Source:{" "}
                <a className="text-primary underline underline-offset-2" href={TENDENCY_SOURCE.url} target="_blank" rel="noreferrer">
                  {TENDENCY_SOURCE.name}
                </a>
                , read {TENDENCY_SOURCE.read}.
              </p>
              <p className="mt-3 font-semibold text-ink">A rule of thumb, not a forecast</p>
              <ul className="mt-1 grid gap-2">
                {PRESSURE_RULES_OF_THUMB.map((rule) => (
                  <li key={rule.quote} className="text-ink">
                    <q className="font-title">{rule.quote}</q>{" "}
                    <a className="text-ink-muted underline underline-offset-2" href={rule.url} target="_blank" rel="noreferrer">
                      {rule.source}
                    </a>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-ink-muted">
                One barometer cannot tell which of these is happening. A forecast or warning is the thing to act on.
              </p>
              <p className="mt-3 font-semibold text-ink">How a reading is reduced to sea level</p>
              <p className="mt-1 text-ink">
                p₀ = p × (1 − {ISA.L}·h / {ISA.T0})<sup>−{ISA.exponent}</sup>, the International Standard Atmosphere's relation between
                pressure and height (ICAO; the same as the US Standard Atmosphere 1976 below 11 km). It assumes the standard atmosphere's
                temperature, so it gives what an altimeter setting (QNH) would: good to a fraction of a hectopascal up to a few hundred
                metres, less so higher up and in very cold or hot weather. The Met Office reduces with the temperature at the station.
              </p>
            </details>
          </section>

          <ChartFrame title="Pressure at sea level over the last three days of readings" reading={`${plural(recent.length, "reading")}.`}>
            <TimeLine
              marks
              name="Pressure at sea level, hPa"
              points={recent.map((reading) => ({ t: reading.takenAt, value: reading.seaLevelHpa }))}
              format={(hpa) => hpa.toFixed(0)}
            />
          </ChartFrame>

          <section aria-labelledby="readings-heading">
            <h3 id="readings-heading" className="text-body font-semibold text-ink">
              Readings, newest first
            </h3>
            <ul className="mt-1 divide-y divide-border border-y border-border">
              {[...list]
                .reverse()
                .slice(0, 50)
                .map((reading) => (
                  <li key={reading.id} className="flex items-center gap-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="tabular text-body text-ink">
                        {reading.seaLevelHpa.toFixed(1)} hPa at sea level{" "}
                        <span className="text-ink-muted">
                          ({reading.value} {reading.unit} at {reading.heightM} m)
                        </span>
                      </p>
                      <p className="text-small text-ink-muted">
                        {formatDateTime(reading.takenAt)}
                        {reading.origin === "file" ? ", from a file" : ""}
                        {reading.note ? `. ${reading.note}` : ""}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove the reading of ${formatDateTime(reading.takenAt)}`}
                      onClick={() => remove.mutate(reading.id)}
                    >
                      <Trash2 />
                    </Button>
                  </li>
                ))}
            </ul>
            {list.length > 50 ? <p className="mt-2 text-small text-ink-muted">The 50 newest of {list.length} are listed.</p> : null}
          </section>
        </>
      )}
      {importing ? <ImportDialog defaultUnit={unit} defaultHeight={height} onClose={() => setImporting(false)} /> : null}
    </div>
  );
}

function ImportDialog({ defaultUnit, defaultHeight, onClose }: { defaultUnit: PressureUnit; defaultHeight: string; onClose: () => void }) {
  const run = useImportReadings();
  const [text, setText] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [unit, setUnit] = useState<PressureUnit>(defaultUnit);
  const [height, setHeight] = useState(defaultHeight);
  const [preview, setPreview] = useState<ReadingImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const notes = preview ? preview.rows.filter((row) => row.notes.length > 0) : [];

  /** A preview read with another unit or height no longer says what Add would do. */
  const change =
    <T,>(set: (next: T) => void) =>
    (next: T) => {
      set(next);
      setPreview(null);
    };

  const ask = (apply: boolean, body = text) => {
    if (body === null) return;
    setError(null);
    const heightM = Number(height.trim().replace(",", "."));
    if (!Number.isFinite(heightM) || heightM < HEIGHT_RANGE.min || heightM > HEIGHT_RANGE.max)
      return setError(`Give the height above sea level for rows that give none, between ${HEIGHT_RANGE.min} and ${HEIGHT_RANGE.max} m.`);
    run.mutate(
      { text: body, unit, heightM, zone: deviceZone(), apply },
      {
        onSuccess: (result) => {
          if (apply) {
            toast.success(`${plural(result.added, "reading")} added.`);
            onClose();
          } else setPreview(result);
        },
        onError: (failure) => setError(errorMessage(failure)),
      },
    );
  };
  const fresh = preview ? preview.rows.filter((row) => !row.duplicate).length : 0;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        title="Bring in readings from a CSV file"
        description="A row for each reading, with a header naming a time column and a pressure column. A unit and a height column are read where there are any."
      >
        <DialogBody className="grid gap-4">
          <Field label="File">
            {(ids) => (
              <Input
                {...ids}
                type="file"
                accept=".csv,text/csv,text/plain"
                className="py-1.5"
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  if (file.size > 4 * 1024 * 1024) return setError("That file is larger than 4 MB.");
                  let body: string;
                  try {
                    body = await file.text();
                  } catch {
                    return setError("That file could not be opened. Choose it again.");
                  }
                  setName(file.name);
                  setText(body);
                  ask(false, body);
                }}
              />
            )}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <span className="text-small font-medium text-ink">Unit, where the file gives none</span>
              <Segmented
                label="Unit where the file gives none"
                value={unit}
                onChange={change(setUnit)}
                options={[
                  { value: "hPa", label: "hPa (mb)" },
                  { value: "inHg", label: "inHg" },
                ]}
              />
            </div>
            <Field label="Height above sea level, m, where the file gives none">
              {(ids) => <Input {...ids} inputMode="decimal" value={height} onChange={(event) => change(setHeight)(event.target.value)} />}
            </Field>
          </div>
          {text !== null ? (
            <Button variant="secondary" onClick={() => ask(false)} loading={run.isPending && !preview}>
              Read it again with these
            </Button>
          ) : null}
          {error ? <Notice tone="danger">{error}</Notice> : null}
          {preview ? (
            <div className="text-small" role="status">
              <p className="text-ink">
                {name}: {plural(preview.rows.length, "reading")} read
                {preview.rows.length - fresh > 0 ? `, ${preview.rows.length - fresh} of them already kept` : ""}
                {preview.problems.length > 0 ? `; ${plural(preview.problems.length, "row")} could not be read` : ""}. Times with no zone are
                read as this device's ({deviceZone()}).
              </p>
              {preview.problems.length > 0 ? (
                <ul className="mt-2 max-h-40 overflow-y-auto text-ink-muted">
                  {preview.problems.slice(0, 50).map((problem) => (
                    <li key={problem.line}>
                      Line {problem.line}: {problem.message}
                    </li>
                  ))}
                </ul>
              ) : null}
              {notes.length > 0 ? (
                <>
                  <p id="numbers-read" className="mt-2 text-ink">
                    Numbers that were not written plainly, and how they were read:
                  </p>
                  <ul aria-labelledby="numbers-read" className="mt-1 max-h-40 overflow-y-auto text-ink-muted">
                    {notes.slice(0, 50).map((row) => (
                      <li key={row.line}>
                        Line {row.line}: {row.notes.join(" ")}
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
            </div>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!preview || fresh === 0} loading={run.isPending && !!preview} onClick={() => ask(true)}>
            {preview ? `Add ${plural(fresh, "reading")}` : "Add readings"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
