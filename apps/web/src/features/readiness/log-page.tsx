/**
 * The log of events: during a power cut or a flood, one line for each thing that
 * happened, stamped with the time and who wrote it, from any device. Linked to the plan
 * in use; check-ins from the board and steps ticked in plans can be shown beside it.
 * Prints as a PDF and writes to a page of Notes, for afterwards and for an insurer.
 */
import type { EventLogLine } from "@outpost/shared";
import { ClipboardList, NotebookPen, Pencil, ShieldCheck, Trash2 } from "lucide-react";
import { type FormEvent, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";
import { EmptyState, ErrorState, Joined, Page, PageHeader, Section } from "@/components/page";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Checkbox, Segmented, Skeleton, Switch } from "@/components/ui/misc";
import { ChooseName } from "@/features/board/compose";
import { useBoardSummary, useDeviceName } from "@/features/board/data";
import { libraryQuestion } from "@/features/household-papers/paper-pdf";
import { pdfOf, usePaperPdf } from "@/features/household-papers/use-paper-pdf";
import { PdfActions } from "@/features/library/made/pdf-actions";
import { type Block, toSheets } from "@/features/propagation/plans/document";
import { errorMessage } from "@/lib/api";
import { formatTimeOfDay, useClockStyle } from "@/lib/clock";
import { notify } from "@/lib/notify";
import { formatDate, plural } from "@/lib/utils";
import { useAddLine, useEditLine, useEventLog, useLogToNotes, useRemoveLine } from "./data";
import { fromLocalInput, localInput, logDay } from "./words";

type Span = "all" | "day" | "week";
const SPAN_MS: Record<Exclude<Span, "all">, number> = { day: 24 * 60 * 60 * 1000, week: 7 * 24 * 60 * 60 * 1000 };

/** The log as pages to print: a heading for each day, and a table of time, who and what. */
export function logBlocks(lines: EventLogLine[], now = Date.now()): Block[] {
  const blocks: Block[] = [
    { kind: "title", text: "Log of events" },
    { kind: "para", text: `Written down as it happened, in Outpost. Printed ${formatDate(now)}, ${formatTimeOfDay(now)}.` },
  ];
  let day = "";
  let rows: string[][] = [];
  const flush = () => {
    if (rows.length > 0) blocks.push({ kind: "table", head: ["Time", "Who", "What"], rows });
    rows = [];
  };
  for (const line of lines) {
    const heading = formatDate(line.at);
    if (heading !== day) {
      flush();
      blocks.push({ kind: "heading", text: heading });
      day = heading;
    }
    const what = line.kind === "tick" && line.planName ? `${line.text} (${line.planName})` : line.text;
    rows.push([formatTimeOfDay(line.at), line.author || "", what]);
  }
  flush();
  return blocks;
}

function LineRow({ line, onEdit, onRemove }: { line: EventLogLine; onEdit: () => void; onRemove: () => void }) {
  const icon =
    line.kind === "checkin" ? (
      <ShieldCheck aria-label="A check-in" className="mt-0.5 size-4 shrink-0 text-ink-muted" />
    ) : line.kind === "tick" ? (
      <ClipboardList aria-label="A step ticked in a plan" className="mt-0.5 size-4 shrink-0 text-ink-muted" />
    ) : (
      <span aria-hidden className="size-4 shrink-0" />
    );
  return (
    <li className="flex items-start gap-3 py-2.5">
      <time dateTime={new Date(line.at).toISOString()} className="tabular w-14 shrink-0 pt-px text-small font-medium text-ink">
        {formatTimeOfDay(line.at)}
      </time>
      {icon}
      <div className="min-w-0 flex-1">
        <p className="break-words text-ink">{line.text}</p>
        <p className="text-small text-ink-muted">
          <Joined
            parts={[
              line.author,
              line.kind === "checkin" ? "on the board" : null,
              line.planName && line.kind === "tick" ? line.planName : line.planName ? `during ${line.planName}` : null,
              line.edited ? `changed by ${line.edited.by}, ${formatDate(line.edited.at)} ${formatTimeOfDay(line.edited.at)}` : null,
            ].filter(Boolean)}
          />
        </p>
      </div>
      {line.kind === "entry" ? (
        <div className="flex shrink-0 gap-1">
          <Button variant="ghost" size="icon" aria-label={`Change “${line.text}”`} onClick={onEdit}>
            <Pencil />
          </Button>
          <Button variant="ghost" size="icon" aria-label={`Remove “${line.text}”`} onClick={onRemove}>
            <Trash2 />
          </Button>
        </div>
      ) : null}
    </li>
  );
}

function EditDialog({ line, name, onClose }: { line: EventLogLine | null; name: string; onClose: () => void }) {
  const edit = useEditLine();
  const [text, setText] = useState(line?.text ?? "");
  const [when, setWhen] = useState(line ? localInput(line.at) : "");
  const [problem, setProblem] = useState<string | null>(null);
  if (!line) return null;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const at = fromLocalInput(when);
    edit.mutate(
      { id: line.id, by: name, text, ...(at !== null && at !== line.at ? { at } : {}), baseUpdatedAt: line.updatedAt },
      {
        onSuccess: onClose,
        onError: (error) => setProblem(errorMessage(error)),
      },
    );
  };
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent title="Change this entry" description={`Written by ${line.author}. The log will say that ${name} changed it.`}>
        <form onSubmit={submit}>
          <DialogBody className="grid gap-4">
            <Field label="What happened">
              {(ids) => <Input {...ids} value={text} maxLength={1000} onChange={(event) => setText(event.target.value)} />}
            </Field>
            <Field label="When">
              {(ids) => <Input {...ids} type="datetime-local" value={when} onChange={(event) => setWhen(event.target.value)} />}
            </Field>
            {problem ? (
              <p role="alert" className="text-small text-danger">
                {problem}
              </p>
            ) : null}
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={edit.isPending}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AddLine({ name, planInUse }: { name: string; planInUse: { id: string; name: string } | null }) {
  const add = useAddLine();
  const [text, setText] = useState("");
  const [earlier, setEarlier] = useState(false);
  const [when, setWhen] = useState(() => localInput(Date.now()));
  const [linked, setLinked] = useState(true);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!text.trim()) return;
    const at = earlier ? fromLocalInput(when) : null;
    add.mutate(
      { author: name, text: text.trim(), ...(at !== null ? { at } : {}), planId: planInUse && linked ? planInUse.id : null },
      {
        onSuccess: () => {
          setText("");
          setEarlier(false);
        },
        onError: (error) => notify.error(errorMessage(error)),
      },
    );
  };

  return (
    <form onSubmit={submit} className="grid gap-3">
      <Field label="What happened" hint={`Stamped with the time${earlier ? " you give" : " now"} and your name, ${name}.`}>
        {(ids) => (
          <Input
            {...ids}
            value={text}
            maxLength={1000}
            placeholder="Power went off"
            onChange={(event) => setText(event.target.value)}
            autoComplete="off"
          />
        )}
      </Field>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-small text-ink">
        <div className="flex items-center gap-3">
          <span className="grid size-11 shrink-0 place-content-center md:size-6">
            <Checkbox id="log-earlier" checked={earlier} onCheckedChange={(next) => setEarlier(next === true)} />
          </span>
          <label htmlFor="log-earlier">It happened earlier</label>
        </div>
        {planInUse ? (
          <div className="flex items-center gap-3">
            <span className="grid size-11 shrink-0 place-content-center md:size-6">
              <Checkbox id="log-plan" checked={linked} onCheckedChange={(next) => setLinked(next === true)} />
            </span>
            <label htmlFor="log-plan">During {planInUse.name}</label>
          </div>
        ) : null}
      </div>
      {earlier ? (
        <Field label="When it happened">
          {(ids) => (
            <Input
              {...ids}
              type="datetime-local"
              value={when}
              max={localInput(Date.now())}
              onChange={(event) => setWhen(event.target.value)}
            />
          )}
        </Field>
      ) : null}
      <div>
        <Button type="submit" variant="primary" loading={add.isPending} disabled={!text.trim()}>
          Add to the log
        </Button>
      </div>
    </form>
  );
}

export default function LogPage() {
  useClockStyle();
  const name = useDeviceName();
  const summary = useBoardSummary();
  const [span, setSpan] = useState<Span>("all");
  const [others, setOthers] = useState(true);
  // The start of the span is fixed when it is chosen, so that the key does not change on every render.
  const [from, setFrom] = useState<number | null>(null);
  const log = useEventLog(from, others);
  const toNotes = useLogToNotes();
  const remove = useRemoveLine();
  const navigate = useNavigate();
  const [editing, setEditing] = useState<EventLogLine | null>(null);
  const [removing, setRemoving] = useState<EventLogLine | null>(null);

  const chooseSpan = (next: Span) => {
    setSpan(next);
    setFrom(next === "all" ? null : Date.now() - SPAN_MS[next]);
  };

  const lines = log.data?.lines ?? [];
  const days = useMemo(() => {
    const groups: Array<{ day: string; lines: EventLogLine[] }> = [];
    for (const line of [...lines].reverse()) {
      const day = logDay(line.at);
      const last = groups.at(-1);
      if (last?.day === day) last.lines.push(line);
      else groups.push({ day, lines: [line] });
    }
    return groups;
  }, [lines]);

  const pages = useMemo(() => (lines.length > 0 ? toSheets(logBlocks(lines), "Log of events · Outpost") : null), [lines]);
  const created = useMemo(() => new Date(lines.at(-1)?.updatedAt ?? 0), [lines]);
  const fromPage = useMemo(() => ({ what: "the household's log of events", path: "/prepare/log" }), []);
  const printed = usePaperPdf(pages, {
    title: `Log of events, ${lines[0] ? formatDate(lines[0].at) : ""}`,
    kind: "Log of events",
    from: fromPage,
    created,
  });

  const writeToNotes = () =>
    toNotes.mutate(
      { ...(from ? { from } : {}), others },
      {
        onSuccess: (made) =>
          toast.success(`${plural(made.lines, "line")} written to “${made.note.title}” in Notes.`, {
            action: { label: "Open it", onClick: () => navigate(`/notes/${made.note.id}`) },
          }),
        onError: (error) => notify.error(errorMessage(error)),
      },
    );

  return (
    <Page width="reading">
      <PageHeader
        title="Log of events"
        description="What happened when, written down as it happens: power off 14:10, called the network operator 14:30, river at the step 16:00. From any device, for afterwards and for an insurer."
      />

      {name === null ? (
        <Section
          title="Who is using this device?"
          description="Kept on this device only, and written beside each line. The same name as on Messages."
        >
          <ChooseName people={summary.data?.people ?? []} current={null} />
        </Section>
      ) : log.data ? (
        <Section title="Add a line">
          <AddLine name={name} planInUse={log.data.planInUse} />
        </Section>
      ) : null}

      <Section title="The log" className="mt-10">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <Segmented
            label="Show"
            value={span}
            onChange={chooseSpan}
            options={[
              { value: "all", label: "Everything" },
              { value: "day", label: "Last day" },
              { value: "week", label: "Last week" },
            ]}
          />
          <div className="flex items-center gap-2 text-small text-ink">
            <Switch id="log-others" checked={others} onCheckedChange={setOthers} />
            <label htmlFor="log-others">With check-ins and ticked steps</label>
          </div>
        </div>

        {log.isPending ? (
          <Skeleton className="mt-4 h-48" />
        ) : log.isError ? (
          <div className="mt-4">
            <ErrorState error={log.error} onRetry={() => void log.refetch()} />
          </div>
        ) : lines.length === 0 ? (
          log.data.entries > 0 ? (
            <p className="mt-4 text-body text-ink-muted">
              Nothing in this span.{" "}
              <Button variant="link" onClick={() => chooseSpan("all")}>
                Show everything
              </Button>
            </p>
          ) : (
            <EmptyState compact level={3} title="Nothing written down yet">
              When something happens, write one line above. Check-ins and steps ticked in a plan show here too.
            </EmptyState>
          )
        ) : (
          <div className="mt-4 grid gap-6">
            {days.map((group) => (
              <section key={group.day} aria-label={group.day}>
                <h3 className="text-body font-semibold text-ink">{group.day}</h3>
                <ul className="mt-1 divide-y divide-border border-y border-border">
                  {group.lines.map((line) => (
                    <LineRow
                      key={`${line.kind}:${line.id}`}
                      line={line}
                      onEdit={() => setEditing(line)}
                      onRemove={() => setRemoving(line)}
                    />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </Section>

      {lines.length > 0 ? (
        <Section title="Keep it" description="What is shown above, oldest first.">
          <PdfActions pdf={pdfOf(printed)} lead="save" confirm={libraryQuestion(false)}>
            <Button onClick={writeToNotes} loading={toNotes.isPending}>
              <NotebookPen aria-hidden /> Write to a page of Notes
            </Button>
          </PdfActions>
          <p className="mt-3 text-small text-ink-muted">
            A line is stamped with Outpost's clock when it is added, unless you gave an earlier time. See also{" "}
            <Link to="/prepare/check-in" className="text-primary underline underline-offset-2">
              Check-in and roll call
            </Link>
            .
          </p>
        </Section>
      ) : null}

      {name && editing ? <EditDialog key={editing.id} line={editing} name={name} onClose={() => setEditing(null)} /> : null}
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title="Remove this line from the log?"
        description={removing ? `“${removing.text}”, written by ${removing.author}. It cannot be brought back.` : ""}
        confirmLabel="Remove the line"
        loading={remove.isPending}
        onConfirm={() =>
          removing &&
          remove.mutate(removing.id, {
            onSuccess: () => setRemoving(null),
            onError: (error) => notify.error(errorMessage(error)),
          })
        }
      />
    </Page>
  );
}
