/**
 * Routine checks: a short list of things done every so often (rotate the water, run the
 * generator, test a restore), each with how often and when it was last done, ticked
 * when done. Starts from a suggested list the household edits. Home shows only what is
 * overdue, in one line. No notifications: Outpost cannot wake a phone, and says so.
 */
import { CHECK_LINK_IDS, CHECK_LINKS, type CheckLink, ROUTINE_CHECK_TEMPLATE, type RoutineCheck } from "@outpost/shared";
import { Check, Pencil, Plus, Trash2, Undo2 } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { EmptyState, ErrorState, Joined, Notice, Page, PageHeader, Rows, Section } from "@/components/page";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Select, Skeleton } from "@/components/ui/misc";
import { useDeviceName } from "@/features/board/data";
import { ForHousehold } from "@/features/households/for-household";
import { errorMessage } from "@/lib/api";
import { notify } from "@/lib/notify";
import { cn, plural } from "@/lib/utils";
import { useAddSuggested, useCheckDone, useRemoveCheck, useRoutineChecks, useSaveCheck } from "./data";
import { checkDueWords, everyWords } from "./words";

const DAY_MS = 24 * 60 * 60 * 1000;

/** A time as the day a date field holds, in this device's time zone: "2026-11-22". */
function dayOf(at: number): string {
  const date = new Date(at);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** A day from a date field as a time: midday there, or now if that is still to come today. */
function atOf(day: string): number {
  const [year, month, date] = day.split("-").map(Number);
  return Math.min(new Date(year!, month! - 1, date!, 12).getTime(), Date.now());
}

function CheckDialog({ check, onClose }: { check: RoutineCheck | "new"; onClose: () => void }) {
  const save = useSaveCheck();
  const editing = check === "new" ? null : check;
  const [name, setName] = useState(editing?.name ?? "");
  const [every, setEvery] = useState(String(editing?.everyDays ?? 30));
  const [note, setNote] = useState(editing?.note ?? "");
  const [link, setLink] = useState<CheckLink | "none">(editing?.link ?? "none");
  const deviceName = useDeviceName();
  const done = useCheckDone();
  // The day it was last done, as the date field holds it; empty for never.
  const [lastDone, setLastDone] = useState(editing?.lastDoneAt ? dayOf(editing.lastDoneAt) : "");
  const lastDoneChanged = editing !== null && lastDone !== (editing.lastDoneAt ? dayOf(editing.lastDoneAt) : "");
  const days = Number(every);
  const valid = name.trim() && Number.isInteger(days) && days >= 1 && days <= 3650;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!valid) return;
    save.mutate(
      {
        id: editing?.id ?? null,
        input: {
          name: name.trim(),
          everyDays: days,
          note: note.trim(),
          link: link === "none" ? null : link,
          ...(editing ? { baseUpdatedAt: editing.updatedAt } : {}),
        },
      },
      {
        onSuccess: (saved) => {
          if (!editing || !lastDoneChanged) return onClose();
          done.mutate(
            {
              id: editing.id,
              by: lastDone ? (editing.lastDoneBy ?? deviceName ?? "") : "",
              at: lastDone ? atOf(lastDone) : null,
              baseUpdatedAt: saved.updatedAt,
            },
            { onSuccess: onClose, onError: (error) => notify.error(errorMessage(error)) },
          );
        },
        onError: (error) => notify.error(errorMessage(error)),
      },
    );
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent title={editing ? "Change this check" : "Add a check"}>
        <form onSubmit={submit}>
          <DialogBody className="grid gap-4">
            <Field label="What to do">
              {(ids) => <Input {...ids} value={name} maxLength={120} onChange={(event) => setName(event.target.value)} />}
            </Field>
            <Field label="How often, in days" hint={Number.isInteger(days) && days >= 1 ? everyWords(days) : "From 1 to 3,650 days."}>
              {(ids) => (
                <Input
                  {...ids}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={3650}
                  value={every}
                  onChange={(event) => setEvery(event.target.value)}
                />
              )}
            </Field>
            <Field label="A note" optional>
              {(ids) => <Input {...ids} value={note} maxLength={1000} onChange={(event) => setNote(event.target.value)} />}
            </Field>
            {editing ? (
              <Field label="Last done" optional hint="Set it back if it was marked done by mistake, or clear it for never.">
                {(ids) => (
                  <Input
                    {...ids}
                    type="date"
                    max={dayOf(Date.now())}
                    value={lastDone}
                    onChange={(event) => setLastDone(event.target.value)}
                  />
                )}
              </Field>
            ) : null}
            <Field label="The screen it belongs to" optional>
              {(ids) => (
                <Select
                  id={ids.id}
                  value={link}
                  onChange={setLink}
                  options={[
                    { value: "none" as const, label: "None" },
                    ...CHECK_LINK_IDS.map((id) => ({ value: id, label: CHECK_LINKS[id].label })),
                  ]}
                />
              )}
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={!valid} loading={save.isPending || done.isPending}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CheckRow({
  check,
  expiring,
  onEdit,
  onRemove,
}: {
  check: RoutineCheck;
  expiring: number;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const name = useDeviceName();
  const done = useCheckDone();
  const now = Date.now();
  const link = check.link ? CHECK_LINKS[check.link] : null;
  const template = check.templateId ? ROUTINE_CHECK_TEMPLATE.find((entry) => entry.id === check.templateId) : undefined;
  const source = template?.source && template.everyDays === check.everyDays ? template.source : null;

  // What it was before "Done today" was pressed here: Undo stays on the row until the screen is left, not only for
  // the toast's few seconds. The date can also be set back, or cleared, under Change.
  const [before, setBefore] = useState<{ at: number | null; by: string | null } | null>(null);
  const undo = (previous: { at: number | null; by: string | null }, baseUpdatedAt: number) =>
    done.mutate(
      { id: check.id, by: previous.by ?? "", at: previous.at, baseUpdatedAt },
      {
        onSuccess: () => {
          setBefore(null);
          toast(`“${check.name}” is back as it was.`);
        },
        onError: (error) => notify.error(errorMessage(error)),
      },
    );
  const markDone = () =>
    done.mutate(
      { id: check.id, by: name ?? "", baseUpdatedAt: check.updatedAt },
      {
        onSuccess: (result) => {
          const previous = { at: check.lastDoneAt, by: check.lastDoneBy };
          setBefore(previous);
          toast.success(`Done: ${check.name}.`, {
            action: { label: "Undo", onClick: () => undo(previous, result.check.updatedAt) },
          });
          return result;
        },
        onError: (error) => notify.error(errorMessage(error)),
      },
    );

  return (
    <li className="flex flex-wrap items-start gap-x-4 gap-y-2 py-3">
      <div className="min-w-0 flex-1 basis-60">
        <p className={cn("text-body font-medium", check.overdue ? "text-warning" : "text-ink")}>{check.name}</p>
        <p className="text-small text-ink-muted">
          <Joined
            parts={[
              everyWords(check.everyDays),
              checkDueWords(check, now),
              check.link === "supplies" && check.templateId === "expiry" && expiring > 0
                ? `${plural(expiring, "item")} dated within 30 days`
                : null,
            ].filter(Boolean)}
          />
        </p>
        {check.note ? <p className="text-small text-ink-muted">{check.note}</p> : null}
        <p className="text-small text-ink-muted">
          {link ? (
            <Link to={link.to} className="text-primary underline underline-offset-2">
              {link.label}
            </Link>
          ) : null}
          {link && (source || template) ? " · " : null}
          {source ? (
            <>
              Interval from{" "}
              <a href={source.url} target="_blank" rel="noreferrer" className="text-primary underline underline-offset-2">
                {source.name}
              </a>
              , read {source.read}
            </>
          ) : template ? (
            "Outpost's suggestion"
          ) : null}
        </p>
      </div>
      {/* Wraps with large text on a small phone, where "Done today" and the two icons are wider than the screen. */}
      <div className="flex max-w-full flex-wrap items-center gap-1">
        <Button size="sm" variant={check.overdue ? "primary" : "secondary"} onClick={markDone} loading={done.isPending}>
          <Check aria-hidden /> Done today
        </Button>
        <Button variant="ghost" size="icon" aria-label={`Change “${check.name}”`} onClick={onEdit}>
          <Pencil />
        </Button>
        <Button variant="ghost" size="icon" aria-label={`Remove “${check.name}”`} onClick={onRemove}>
          <Trash2 />
        </Button>
        {before ? (
          <Button variant="link" size="sm" className="ml-2" onClick={() => undo(before, check.updatedAt)}>
            <Undo2 aria-hidden /> Undo “Done today”
          </Button>
        ) : null}
      </div>
    </li>
  );
}

export default function ChecksPage() {
  const checks = useRoutineChecks();
  const suggested = useAddSuggested();
  const remove = useRemoveCheck();
  const [editing, setEditing] = useState<RoutineCheck | "new" | null>(null);
  const [removing, setRemoving] = useState<RoutineCheck | null>(null);
  const list = checks.data?.checks ?? [];
  const overdue = list.filter((check) => check.overdue).length;
  const missingSuggestions = ROUTINE_CHECK_TEMPLATE.filter((template) => !list.some((check) => check.templateId === template.id)).length;
  const soon = list.filter((check) => !check.overdue && check.dueAt !== null && check.dueAt - Date.now() < 14 * DAY_MS).length;

  const addSuggested = () => suggested.mutate(undefined, { onError: (error) => notify.error(errorMessage(error)) });

  return (
    <Page width="reading">
      <PageHeader
        title="Routine checks"
        description="Being ready wears off quietly: stored water goes stale, batteries run flat, the generator is never started, the backup is never restored. Each check here has how often and when it was last done."
        actions={
          list.length > 0 ? (
            <Button variant="primary" onClick={() => setEditing("new")}>
              <Plus aria-hidden /> Add a check
            </Button>
          ) : null
        }
      />
      <ForHousehold className="-mt-6 mb-6" />

      {checks.isPending ? (
        <Skeleton className="h-64" />
      ) : checks.isError ? (
        <ErrorState error={checks.error} onRetry={() => void checks.refetch()} />
      ) : list.length === 0 ? (
        <EmptyState
          title="No checks yet"
          action={
            <>
              <Button onClick={() => setEditing("new")}>Add one of your own</Button>
              <Button variant="primary" onClick={addSuggested} loading={suggested.isPending}>
                Start from the suggested list
              </Button>
            </>
          }
        >
          The suggested list has {ROUTINE_CHECK_TEMPLATE.length} checks, from rotating stored water to testing a restore. Change any of them
          afterwards.
        </EmptyState>
      ) : (
        <>
          <p className="text-body text-ink">
            {overdue > 0 ? `${plural(overdue, "check")} overdue or never done.` : "Nothing is overdue."}
            {soon > 0 ? ` ${plural(soon, "more")} due in the next two weeks.` : ""}
          </p>
          <Section title="Checks" className="mt-6">
            <Rows aria-label="Routine checks">
              {list.map((check) => (
                <CheckRow
                  key={check.id}
                  check={check}
                  expiring={checks.data.expiringSupplies}
                  onEdit={() => setEditing(check)}
                  onRemove={() => setRemoving(check)}
                />
              ))}
            </Rows>
            {missingSuggestions > 0 ? (
              <Button variant="link" className="mt-3" onClick={addSuggested} loading={suggested.isPending}>
                Add the {plural(missingSuggestions, "suggested check")} not in the list
              </Button>
            ) : null}
          </Section>
        </>
      )}

      <Notice tone="info" className="mt-10">
        Outpost cannot wake a phone or send a reminder. Home says in one line what is overdue, and this screen says when each is next due.
        Only the stored water's interval comes from published guidance; the rest are Outpost's suggestions for a household to change.
      </Notice>

      {editing ? <CheckDialog key={editing === "new" ? "new" : editing.id} check={editing} onClose={() => setEditing(null)} /> : null}
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title="Remove this check?"
        description={removing ? `“${removing.name}” and the date it was last done.` : ""}
        confirmLabel="Remove the check"
        loading={remove.isPending}
        onConfirm={() =>
          removing &&
          remove.mutate(removing.id, { onSuccess: () => setRemoving(null), onError: (error) => notify.error(errorMessage(error)) })
        }
      />
    </Page>
  );
}
