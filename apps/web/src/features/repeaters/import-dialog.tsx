/**
 * Bringing in a file of repeaters: choose it, see how it was read and what would be
 * kept, correct the reading if need be, say what the list is and the date of its data,
 * and only then keep it. The same dialog brings an existing list up to date, and then
 * shows what would change and asks about anything the person had changed themselves.
 */
import {
  bandName,
  formatBytes,
  formatMHz,
  formatShift,
  MAX_REPEATER_FILE_BYTES,
  REPEATER_COLUMN_FIELD_NAMES,
  REPEATER_COLUMN_FIELDS,
  type RepeaterBand,
  type RepeaterColumnField,
  type RepeaterColumnMap,
  type RepeaterImportPreview,
  type RepeaterImportResult,
  type RepeaterListDto,
} from "@outpost/shared";
import { CircleAlert, CircleCheck, FileUp } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { Notice } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Checkbox, Select, Skeleton } from "@/components/ui/misc";
import { errorMessage } from "@/lib/api";
import { formatDate, formatNumber, plural } from "@/lib/utils";
import { type ImportChoices, previewImport, useImportRepeaters } from "./data";
import { accessParts, modesLine } from "./words";

const today = () => new Date().toISOString().slice(0, 10);
const dayOf = (timestamp: number) => new Date(timestamp).toISOString().slice(0, 10);

const NOT_USED = "-";

/** One line per column of the file: what it is read as, which the person can change. */
function ColumnsEditor({
  preview,
  disabled,
  onChange,
}: {
  preview: RepeaterImportPreview;
  disabled: boolean;
  onChange: (mapping: RepeaterColumnMap) => void;
}) {
  const fieldOf = (column: string) => REPEATER_COLUMN_FIELDS.find((field) => preview.mapping[field] === column);
  const options = [
    { value: NOT_USED, label: "Not used" },
    ...REPEATER_COLUMN_FIELDS.map((field) => ({ value: field as string, label: REPEATER_COLUMN_FIELD_NAMES[field] })),
  ];
  const set = (column: string, field: string) => {
    const next: RepeaterColumnMap = {};
    for (const [key, value] of Object.entries(preview.mapping) as Array<[RepeaterColumnField, string]>) {
      // A column is read as one thing, and one thing is read from one column.
      if (value !== column && key !== field) next[key] = value;
    }
    if (field !== NOT_USED) next[field as RepeaterColumnField] = column;
    onChange(next);
  };
  return (
    <ul className="divide-y divide-border border-y border-border">
      {preview.columns.map((column) => (
        <li key={column} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] items-center gap-3 py-1.5">
          <span className="min-w-0 truncate font-mono text-[0.8125rem] text-ink" title={column}>
            {column}
          </span>
          <Select
            aria-label={`Read the column “${column}” as`}
            value={fieldOf(column) ?? NOT_USED}
            onChange={(field) => set(column, field)}
            options={options}
            disabled={disabled}
          />
        </li>
      ))}
    </ul>
  );
}

/** The first rows as they would be kept: enough to see whether the columns were read the right way round. */
function Sample({ preview }: { preview: RepeaterImportPreview }) {
  return (
    <div className="scroll-quiet overflow-x-auto border-y border-border">
      <table className="w-full min-w-[34rem] text-small">
        <caption className="sr-only">The first rows of the file as they would be kept</caption>
        <thead>
          <tr className="text-left text-ink-muted">
            {["Callsign", "Listen on", "Shift", "Access", "Modes", "Where"].map((heading) => (
              <th key={heading} scope="col" className="py-1.5 pr-3 font-medium">
                {heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {preview.sample.map((row) => (
            <tr key={row.line} className="align-top">
              <th scope="row" className="py-1.5 pr-3 text-left font-semibold text-ink">
                {row.callsign}
              </th>
              <td className="tabular py-1.5 pr-3 font-mono text-[0.8125rem] text-ink">{formatMHz(row.outputHz)}</td>
              <td className="tabular py-1.5 pr-3 text-ink">{formatShift(row.outputHz, row.inputHz)}</td>
              <td className="py-1.5 pr-3 text-ink">{accessParts(row).join(", ") || "None listed"}</td>
              <td className="py-1.5 pr-3 text-ink">{modesLine(row) || "Not listed"}</td>
              <td className="py-1.5 text-ink">
                {row.place || row.locator || "Not listed"}
                {row.lat === null ? <span className="block text-ink-muted">No position</span> : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Summary({ result, updating }: { result: RepeaterImportResult; updating: boolean }) {
  const parts = [
    result.added > 0 ? `${formatNumber(result.added)} added` : "",
    result.updated > 0 ? `${formatNumber(result.updated)} brought up to date` : "",
    result.unchanged > 0 ? `${formatNumber(result.unchanged)} unchanged` : "",
    result.removed > 0 ? `${formatNumber(result.removed)} removed, as they are no longer in the list` : "",
    result.keptEdits > 0 ? `${formatNumber(result.keptEdits)} that you had changed left as you have them` : "",
    result.replacedEdits > 0 ? `${formatNumber(result.replacedEdits)} that you had changed replaced with the list's` : "",
    result.skipped > 0 ? `${plural(result.skipped, "row")} of the file could not be kept` : "",
  ].filter(Boolean);
  return (
    <Notice
      tone="success"
      icon={<CircleCheck />}
      title={updating ? `“${result.list.name}” is up to date` : `“${result.list.name}” is imported`}
    >
      <p>
        {parts.join("; ")}. The data is dated {formatDate(result.list.dataDate)}.
      </p>
    </Notice>
  );
}

export function ImportDialog({
  open,
  onClose,
  list,
}: {
  open: boolean;
  onClose: () => void;
  /** The list being brought up to date. Without it, the file becomes a new list. */
  list?: RepeaterListDto | null;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<RepeaterImportPreview | null>(null);
  const [reading, setReading] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [source, setSource] = useState("");
  const [dataDate, setDataDate] = useState(today);
  const [replaceEdits, setReplaceEdits] = useState(false);
  const [keepGone, setKeepGone] = useState(false);
  const [showColumns, setShowColumns] = useState(false);
  const [result, setResult] = useState<RepeaterImportResult | null>(null);
  const commit = useImportRepeaters();
  const replaceId = useId();
  const goneId = useId();
  const request = useRef(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: opening the dialog starts afresh
  useEffect(() => {
    if (!open) return;
    setFile(null);
    setPreview(null);
    setProblem(null);
    setResult(null);
    setName(list?.name ?? "");
    setSource(list?.source ?? "");
    setDataDate(today());
    setReplaceEdits(false);
    setKeepGone(false);
    setShowColumns(false);
    commit.reset();
  }, [open, list?.id]);

  const read = async (chosen: File, mapping?: RepeaterColumnMap) => {
    const mine = ++request.current;
    setReading(true);
    setProblem(null);
    try {
      const next = await previewImport(chosen, { listId: list?.id, mapping: mapping as Record<string, string> | undefined });
      if (mine !== request.current) return;
      setPreview(next);
      // A file whose columns had to be guessed, or could not be, is shown with its columns open.
      if (next.format === "csv" || next.usable === 0) setShowColumns(true);
      if (!list && !name) setName(chosen.name.replace(/\.[a-z0-9]{1,5}$/i, ""));
    } catch (error) {
      if (mine !== request.current) return;
      setPreview(null);
      setProblem(errorMessage(error));
    } finally {
      if (mine === request.current) setReading(false);
    }
  };

  const choose = (chosen: File | undefined) => {
    if (!chosen) return;
    setResult(null);
    setPreview(null);
    if (chosen.size > MAX_REPEATER_FILE_BYTES) {
      setFile(null);
      setProblem(`That file is ${formatBytes(chosen.size)}. Outpost reads repeater files up to ${formatBytes(MAX_REPEATER_FILE_BYTES)}.`);
      return;
    }
    setFile(chosen);
    void read(chosen);
  };

  const save = () => {
    if (!file || !preview) return;
    const choices: ImportChoices = {
      mapping: preview.mapping as Record<string, string>,
      listId: list?.id,
      name: name.trim(),
      source: source.trim(),
      dataDate,
      edited: replaceEdits ? "replace" : "keep",
      gone: keepGone ? "keep" : "remove",
    };
    commit.mutate({ file, choices }, { onSuccess: setResult });
  };

  const plan = preview?.update ?? null;
  const bands = preview ? (Object.entries(preview.bands) as Array<[RepeaterBand, number]>).sort((a, b) => b[1] - a[1]) : [];
  const canSave = Boolean(file && preview && preview.usable > 0 && name.trim() && dataDate && !reading);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !commit.isPending && onClose()}>
      <DialogContent title={list ? `Bring “${list.name}” up to date` : "Import a list of repeaters"} size="lg">
        <DialogBody className="grid gap-5">
          {result ? (
            <Summary result={result} updating={Boolean(list)} />
          ) : (
            <>
              <div className="grid gap-2">
                <p className="text-small text-ink-muted">
                  {list
                    ? "Choose a newer copy of the same list. You are shown what would change before anything does."
                    : "Choose a CSV file you have: one of the lists the RSGB's ETCC offers, a file saved from CHIRP, an Outpost export, or any list with a row of headings. Nothing is kept until you have seen how it was read."}
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  <input
                    ref={input}
                    type="file"
                    accept=".csv,.txt,.tsv,text/csv,text/plain"
                    className="sr-only"
                    aria-label="File of repeaters"
                    onChange={(event) => {
                      choose(event.target.files?.[0]);
                      event.target.value = "";
                    }}
                  />
                  <Button onClick={() => input.current?.click()} disabled={commit.isPending}>
                    <FileUp /> {file ? "Choose another file" : "Choose a file"}
                  </Button>
                  {file ? (
                    <span className="min-w-0 text-small text-ink">
                      <span className="font-mono text-[0.8125rem] break-all">{file.name}</span>{" "}
                      <span className="tabular text-ink-muted">{formatBytes(file.size)}</span>
                    </span>
                  ) : null}
                </div>
              </div>

              {problem ? (
                <Notice tone="danger" icon={<CircleAlert />} title="This file could not be read">
                  {problem}
                </Notice>
              ) : null}
              {reading && !preview ? (
                <div className="grid gap-2" aria-busy>
                  <Skeleton className="h-5 w-2/3" />
                  <Skeleton className="h-24 w-full" />
                  <span className="sr-only">Reading the file</span>
                </div>
              ) : null}

              {preview ? (
                <>
                  <section className="grid gap-2" aria-label="How the file was read">
                    <p className="text-body text-ink">
                      Read as <span className="font-semibold">{preview.formatName}</span>.{" "}
                      <span className="tabular">
                        {formatNumber(preview.usable)} of {plural(preview.rows, "row")}
                      </span>{" "}
                      can be kept
                      {preview.usable > 0 ? (
                        <>
                          , <span className="tabular">{formatNumber(preview.withPosition)}</span> with a position
                        </>
                      ) : null}
                      .
                    </p>
                    {bands.length > 0 ? (
                      <p className="tabular text-small text-ink-muted">
                        {bands.map(([band, count]) => `${bandName(band)}: ${formatNumber(count)}`).join(" · ")}
                      </p>
                    ) : null}
                    {preview.warnings.map((warning) => (
                      <Notice key={warning} tone="warning" icon={<CircleAlert />}>
                        {warning}
                      </Notice>
                    ))}
                  </section>

                  {preview.sample.length > 0 ? (
                    <section className="grid gap-2">
                      <h3 className="text-small font-semibold text-ink">The first rows, as they would be kept</h3>
                      <Sample preview={preview} />
                      <p className="text-small text-ink-muted">
                        “Listen on” is the frequency the repeater transmits on. If it and the shift look the wrong way round, change which
                        column is the output below.
                      </p>
                    </section>
                  ) : null}

                  <section className="grid gap-2">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-small font-semibold text-ink">How the columns are read</h3>
                      <Button variant="ghost" size="sm" aria-expanded={showColumns} onClick={() => setShowColumns((shown) => !shown)}>
                        {showColumns ? "Hide" : "Show and change"}
                      </Button>
                    </div>
                    {showColumns ? (
                      <ColumnsEditor
                        preview={preview}
                        disabled={reading || commit.isPending}
                        onChange={(mapping) => file && void read(file, mapping)}
                      />
                    ) : null}
                  </section>

                  {preview.skippedCount > 0 ? (
                    <section className="grid gap-2">
                      <h3 className="text-small font-semibold text-ink">
                        {plural(preview.skippedCount, "row")} cannot be kept
                        {preview.skippedCount > preview.skipped.length ? ` (the first ${preview.skipped.length} are shown)` : ""}
                      </h3>
                      <ul className="scroll-quiet max-h-40 divide-y divide-border overflow-y-auto border-y border-border">
                        {preview.skipped.map((row) => (
                          <li key={row.line} className="py-1.5 text-small">
                            <span className="tabular text-ink-muted">Line {row.line}.</span> <span className="text-ink">{row.reason}</span>
                            <span className="block truncate font-mono text-[0.75rem] text-ink-muted">{row.text}</span>
                          </li>
                        ))}
                      </ul>
                    </section>
                  ) : null}

                  {plan ? (
                    <section className="grid gap-3" aria-label="What bringing the list up to date would do">
                      <h3 className="text-small font-semibold text-ink">What would change</h3>
                      <dl className="tabular grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-small">
                        {(
                          [
                            [plan.added, "new in the file: added"],
                            [plan.changed, "changed in the file: brought up to date"],
                            [plan.unchanged, "the same as before"],
                            [plan.gone, keepGone ? "no longer in the file: kept" : "no longer in the file: removed"],
                            [plan.editedSame + plan.editedGone, "changed by you: left as you have them"],
                            [plan.removedByYou, "removed by you: stay removed"],
                          ] as Array<[number, string]>
                        )
                          .filter(([count]) => count > 0)
                          .map(([count, label]) => (
                            <div key={label} className="contents">
                              <dt className="text-right font-semibold text-ink">{formatNumber(count)}</dt>
                              <dd className="text-ink-muted">{label}</dd>
                            </div>
                          ))}
                      </dl>
                      {plan.gone > 0 ? (
                        <div className="flex items-start gap-3">
                          <Checkbox
                            id={goneId}
                            checked={keepGone}
                            onCheckedChange={(checked) => setKeepGone(checked === true)}
                            className="mt-0.5"
                          />
                          <label htmlFor={goneId} className="text-small text-ink">
                            Keep the {plural(plan.gone, "entry", "entries")} that {plan.gone === 1 ? "is" : "are"} no longer in the file
                            <span className="block text-ink-muted">
                              A repeater that has left a list has usually closed. Keep them only if this file covers less than the last one
                              did.
                            </span>
                          </label>
                        </div>
                      ) : null}
                      {plan.editedDiffering > 0 ? (
                        <Notice
                          tone="info"
                          title={`${plural(plan.editedDiffering, "entry", "entries")} you changed ${plan.editedDiffering === 1 ? "differs" : "differ"} in this file`}
                        >
                          <p>
                            {plan.editedExamples.map((example) => `${example.callsign} (${formatMHz(example.outputHz)})`).join(", ")}
                            {plan.editedDiffering > plan.editedExamples.length ? " and others" : ""}. They are left as you have them unless
                            you say otherwise; what the list now says is kept beside each one.
                          </p>
                          <div className="mt-2 flex items-start gap-3">
                            <Checkbox
                              id={replaceId}
                              checked={replaceEdits}
                              onCheckedChange={(checked) => setReplaceEdits(checked === true)}
                              className="mt-0.5"
                            />
                            <label htmlFor={replaceId} className="text-small text-ink">
                              Replace my changes to {plan.editedDiffering === 1 ? "it" : "them"} with what the list now says
                            </label>
                          </div>
                        </Notice>
                      ) : null}
                    </section>
                  ) : null}

                  <section className="grid gap-4 sm:grid-cols-2" aria-label="What this list is">
                    <Field label="Name of the list">
                      {(ids) => <Input {...ids} value={name} onChange={(event) => setName(event.target.value)} maxLength={120} required />}
                    </Field>
                    <Field label="Who publishes it" hint="Shown wherever these repeaters are, so you know where each came from.">
                      {(ids) => (
                        <Input
                          {...ids}
                          value={source}
                          onChange={(event) => setSource(event.target.value)}
                          maxLength={200}
                          placeholder="RSGB ETCC, ukrepeater.net"
                        />
                      )}
                    </Field>
                    <Field
                      label="Date of the data"
                      hint="The day the file was made or fetched from its publisher. Outpost marks the list as it grows old."
                      className="sm:col-span-2 sm:max-w-[18rem]"
                    >
                      {(ids) => (
                        <Input
                          {...ids}
                          type="date"
                          value={dataDate}
                          max={today()}
                          onChange={(event) => setDataDate(event.target.value)}
                          required
                        />
                      )}
                    </Field>
                    {list ? (
                      <p className="text-small text-ink-muted sm:col-span-2">
                        The list as it stands is dated {formatDate(list.dataDate)} ({dayOf(list.dataDate)}).
                      </p>
                    ) : null}
                  </section>
                </>
              ) : null}
            </>
          )}
        </DialogBody>
        <DialogFooter>
          {result ? (
            <Button variant="primary" onClick={onClose}>
              Done
            </Button>
          ) : (
            <>
              <Button variant="ghost" onClick={onClose} disabled={commit.isPending}>
                Cancel
              </Button>
              <Button variant="primary" onClick={save} disabled={!canSave} loading={commit.isPending}>
                {list ? "Bring up to date" : preview && preview.usable > 0 ? `Import ${plural(preview.usable, "repeater")}` : "Import"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
