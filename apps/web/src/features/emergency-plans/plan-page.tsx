/**
 * One emergency plan, as the household writes it: what it is for, its steps, people,
 * places, supplies and links. Changes are saved a moment after they are made. From here
 * the plan is used ("Use now"), printed as cards, copied or deleted.
 */
import {
  EMERGENCY_NUMBERS,
  type EmergencyPlanInput,
  type EmergencyPlanResponse,
  PLAN_KINDS,
  type PlanBody,
  type PlanKind,
  planCaveat,
  reviewDue,
  sourcesOfPlan,
  templateById,
} from "@outpost/shared";
import { Copy, ListChecks, Printer, TriangleAlert } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Link, useLocation, useNavigate, useParams } from "react-router";
import { LeaveGuard } from "@/components/leave-guard";
import { ErrorState, JumpLinks, Notice, Page, PageHeader, Section } from "@/components/page";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Select, Skeleton } from "@/components/ui/misc";
import { BookPlansLine } from "@/features/household-book/book-line";
import { PlanIllustrations } from "@/features/nuclear/plan-illustrations";
import { formatDate, formatDateTime, timeAgo } from "@/lib/utils";
import { conflictOf, inputOf, usePlan, usePlanAction, useRemovePlan, useSavePlan } from "./data";
import { PlanHouseholdLine } from "./household-line";
import { TemplateLicences } from "./licences";
import { CommsSection, NotesSection, PlacesSection, PowerSection, WhereSection } from "./more-sections";
import { ContactsSection, PeopleSection } from "./people-section";
import { StepsSection } from "./steps-section";
import { SuppliesSection } from "./supplies-section";
import { REVIEW_CHOICES } from "./words";

const SAVE_AFTER_MS = 700;

/**
 * Keeps a draft of the plan and saves it a moment after the last change, with the
 * `updatedAt` it was based on. When another tab or device has saved the plan since,
 * the save is refused and saving stops until the person keeps their version or loads
 * the other one. A change made elsewhere while this draft has nothing unsaved is
 * followed instead.
 */
function useDraft(response: EmergencyPlanResponse | undefined, reload: () => Promise<EmergencyPlanResponse | undefined>) {
  const base = useRef(0);
  const save = useSavePlan(response?.plan.id ?? "", (saved) => {
    base.current = Math.max(base.current, saved.plan.updatedAt);
  });
  const [draft, setDraft] = useState<EmergencyPlanInput | null>(null);
  const [conflict, setConflict] = useState<{ updatedAt: number; name: string } | null>(null);
  const [choosing, setChoosing] = useState(false);
  const latest = useRef<EmergencyPlanInput | null>(null);
  latest.current = draft;
  const stopped = useRef(false);
  stopped.current = conflict !== null;
  const pending = useRef<EmergencyPlanInput | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadedId = useRef<string | null>(null);
  /** Replaces the draft with a version from the server, forgetting what was not saved. */
  const adopt = useCallback((fresh: EmergencyPlanResponse) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    pending.current = null;
    base.current = fresh.plan.updatedAt;
    setDraft(inputOf(fresh.plan));
    setConflict(null);
  }, []);
  useEffect(() => {
    if (!response) return;
    if (loadedId.current !== response.plan.id) {
      loadedId.current = response.plan.id;
      adopt(response);
    } else if (response.plan.updatedAt > base.current && !pending.current && !save.isPending && !stopped.current) {
      adopt(response);
    }
  }, [response, adopt, save.isPending]);
  /** Saves in turn: a second save sent before the first is answered would carry a base the first has made old. */
  const queue = useRef<Promise<void>>(Promise.resolve());
  const send = useCallback(async () => {
    // A person who has not chosen a side yet has not agreed to overwrite anything.
    if (stopped.current) return;
    const waiting = pending.current;
    // A plan always has a name, and a step always has words: what is half-typed waits for the next change.
    if (waiting?.name.trim() && waiting.emergencyNumber.trim()) {
      pending.current = null;
      const body: PlanBody = {
        ...waiting.body,
        steps: waiting.body.steps.filter((step) => step.text.trim()),
        supplies: waiting.body.supplies.filter((supply) => supply.name.trim()),
      };
      await save
        .mutateAsync({
          ...waiting,
          name: waiting.name.trim(),
          emergencyNumber: waiting.emergencyNumber.trim(),
          body,
          baseUpdatedAt: base.current,
        })
        .catch((error: unknown) => {
          const newer = conflictOf(error);
          if (!newer) return;
          // Nothing typed is lost: it goes again when the person keeps it.
          pending.current = pending.current ?? waiting;
          stopped.current = true;
          setConflict(newer);
        });
    }
  }, [save]);
  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    queue.current = queue.current.then(send);
    return queue.current;
  }, [send]);
  const flushRef = useRef(flush);
  flushRef.current = flush;
  useEffect(() => () => void flushRef.current(), []);
  const change = (next: EmergencyPlanInput) => {
    setDraft(next);
    pending.current = next;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flushRef.current(), SAVE_AFTER_MS);
  };
  /** Saves this draft over the other version, built on that version's time. */
  const keepMine = () => {
    if (!conflict || !latest.current) return;
    base.current = Math.max(base.current, conflict.updatedAt);
    pending.current = latest.current;
    stopped.current = false;
    setConflict(null);
    void flushRef.current();
  };
  /** Loads the other version into the draft. */
  const takeTheirs = async () => {
    setChoosing(true);
    try {
      const fresh = await reload();
      if (fresh) adopt(fresh);
    } finally {
      setChoosing(false);
    }
  };
  const state = conflict
    ? "conflict"
    : draft && !draft.name.trim()
      ? "unnamed"
      : draft && !draft.emergencyNumber.trim()
        ? "no-number"
        : pending.current || save.isPending
          ? "saving"
          : save.isError
            ? "failed"
            : "saved";
  return { draft, change, state, flush, conflict, choosing, keepMine, takeTheirs };
}

/** The parts of a plan, in the order they are on the page, for the list at its top. */
const PARTS = [
  { id: "plan-what", label: "What it is for" },
  { id: "plan-steps", label: "Steps" },
  { id: "household", label: "The household" },
  { id: "plan-contacts", label: "Who to contact" },
  { id: "plan-places", label: "Where to meet" },
  { id: "plan-phones", label: "If the phones fail" },
  { id: "plan-supplies", label: "Supplies" },
  { id: "plan-power", label: "Power" },
  { id: "plan-where", label: "Where things are" },
  { id: "plan-notes", label: "Notes and links" },
] as const;

/** One part of the plan, with an address to jump to; it keeps the space a section has above it. */
function Part({ id, children }: { id: string; children: ReactNode }) {
  return (
    <div id={id} className="mt-10 scroll-mt-16 first:mt-0 md:scroll-mt-6 [&>section]:mt-0">
      {children}
    </div>
  );
}

/** The states in which leaving would lose what was typed: it cannot be sent as it is. */
const UNSENT = ["conflict", "unnamed", "no-number", "failed"];

const STATE_WORDS: Record<string, string> = {
  unnamed: "Give the plan a name to save it.",
  "no-number": "Give the emergency number to save the plan.",
  conflict: "Not saved: this plan was changed somewhere else.",
  saving: "Saving…",
  failed: "The last change was not saved.",
  saved: "Saved.",
};

function Sources({ templateId }: { templateId: string | null }) {
  const sources = sourcesOfPlan(templateId);
  const template = templateById(templateId);
  if (!template) return null;
  return (
    <Section title="Where the template's words come from" description={`This plan was started from the template “${template.name}”.`}>
      <TemplateLicences sources={sources} />
      <ul className="divide-y divide-border border-y border-border text-small">
        {sources.map((source) => (
          <li key={source.id} className="py-2">
            <span className="block text-ink">
              {source.publisher}, “{source.title}”
            </span>
            <span className="block break-all text-ink-muted">{source.url}</span>
            <span className="block text-ink-muted">
              {source.pageDate}. Read on {source.checked}.{source.country === "US" ? " United States guidance, for comparison." : ""}
            </span>
          </li>
        ))}
      </ul>
      {template.prompts.length > 0 ? (
        <div className="mt-4">
          <h3 className="text-body font-semibold text-ink">For you to decide</h3>
          <p className="mt-0.5 text-small text-ink-muted">No official guidance found covers these, so the template leaves them to you.</p>
          <ul className="mt-2 list-disc pl-5 text-small text-ink">
            {template.prompts.map((prompt) => (
              <li key={prompt} className="py-0.5">
                {prompt}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Section>
  );
}

export default function EmergencyPlanPage() {
  const { id = "" } = useParams();
  const response = usePlan(id);
  const { draft, change, state, flush, conflict, choosing, keepMine, takeTheirs } = useDraft(response.data, async () => {
    const fresh = await response.refetch();
    return fresh.data;
  });
  const reviewed = usePlanAction(id, "reviewed");
  const copy = usePlanAction(id, "copy");
  const remove = useRemovePlan();
  const navigate = useNavigate();
  const [deleting, setDeleting] = useState(false);
  // Deleted: what was typed went with it, so leaving asks nothing.
  const [gone, setGone] = useState(false);
  const opened = usePlanAction(id, "opened");
  // When it was last opened before this time, said once for each plan shown (a copy is shown in the same page);
  // opening it now is recorded by this press, not by reading it.
  const before = useRef<{ id: string; at: number | null } | null>(null);
  if (response.data && before.current?.id !== response.data.plan.id)
    before.current = { id: response.data.plan.id, at: response.data.plan.openedAt };
  const openedMutate = opened.mutate;
  useEffect(() => {
    if (response.isSuccess) openedMutate();
  }, [response.isSuccess, openedMutate]);
  // A link to a part of the plan (from the cards: "#household") is followed once the plan is on the page.
  const { hash, search } = useLocation();
  const fromBook = new URLSearchParams(search).get("from") === "book";
  const shown = draft !== null;
  useEffect(() => {
    if (shown && hash) document.getElementById(hash.slice(1))?.scrollIntoView?.();
  }, [shown, hash]);

  if (response.isPending || (response.data && !draft)) {
    return (
      <Page width="reading">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="mt-8 h-40 w-full" />
        <Skeleton className="mt-6 h-64 w-full" />
      </Page>
    );
  }
  if (response.isError || !draft || !response.data) {
    return (
      <Page width="reading">
        <PageHeader back={{ to: "/prepare/plans", label: "Emergency plans" }} title="Emergency plan" />
        <ErrorState error={response.error} onRetry={() => void response.refetch()} />
        <p className="mt-4 text-small">
          <Link to="/prepare/plans" className="text-primary underline underline-offset-2">
            All emergency plans
          </Link>
        </p>
      </Page>
    );
  }
  const { plan, resolved } = response.data;
  const body = draft.body;
  const setBody = (patch: Partial<PlanBody>) => change({ ...draft, body: { ...body, ...patch } });
  const review = reviewDue(plan, Date.now());

  return (
    <Page width="reading">
      <PageHeader
        back={{ to: "/prepare/plans", label: "Emergency plans" }}
        title={draft.name.trim() || "Emergency plan"}
        description={
          <>
            <span className="block">{planCaveat(draft.emergencyNumber)}</span>
            <span className="mt-1 block text-small" aria-live="polite">
              {STATE_WORDS[state]} Last opened {before.current?.at ? timeAgo(before.current.at) : "never before"}; changed{" "}
              {timeAgo(plan.updatedAt)}.
            </span>
          </>
        }
        actions={
          <>
            <Button asChild variant="primary">
              <Link to={`/prepare/plans/${id}/use`} onClick={() => void flush()}>
                <ListChecks aria-hidden /> Use now
              </Link>
            </Button>
            <Button asChild>
              <Link to={`/prepare/plans/${id}/cards`} onClick={() => void flush()}>
                <Printer aria-hidden /> Cards to print
              </Link>
            </Button>
          </>
        }
      />
      <PlanHouseholdLine household={response.data.household} className="-mt-6 mb-6" />

      {fromBook ? (
        <Notice tone="info" title="Made for the household book" className="mb-4">
          <p>Change it to fit your household. It goes in the book in full.</p>
          <Button asChild size="sm" className="mt-3">
            <Link to="/prepare/book?step=readiness" onClick={() => void flush()}>
              Back to the household book
            </Link>
          </Button>
        </Notice>
      ) : null}
      <BookPlansLine planId={id} className="mb-4" />
      {conflict ? (
        <Notice tone="warning" icon={<TriangleAlert />} title="This plan was changed somewhere else" className="mb-6">
          <p>
            Another tab or device saved a newer version at {formatDateTime(conflict.updatedAt)}. Your version is still here, unsaved, and
            nothing has been overwritten. Choose which one to keep.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="primary" disabled={choosing} onClick={keepMine}>
              Keep my version
            </Button>
            <Button size="sm" loading={choosing} onClick={() => void takeTheirs()}>
              Load the other version
            </Button>
          </div>
        </Notice>
      ) : null}

      {review.due ? (
        <Notice
          tone="warning"
          title="Time to look this plan over"
          className="mb-6"
          action={
            <Button loading={reviewed.isPending} onClick={() => reviewed.mutate()}>
              Mark as looked over
            </Button>
          }
        >
          Last looked over on {formatDate(plan.reviewedAt)}. People move and numbers change: check the contacts, the places and the
          supplies.
        </Notice>
      ) : null}

      {/* The parts of the plan as links, at its top: on a phone the plan is long, and a part is a press away. */}
      <JumpLinks label="Parts of this plan" items={[...PARTS]} className="mt-0" />

      <Part id="plan-what">
        <Section title="What it is for">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name" className="sm:col-span-2" error={draft.name.trim() ? undefined : "Give the plan a name."}>
              {(ids) => (
                <Input {...ids} value={draft.name} maxLength={120} onChange={(event) => change({ ...draft, name: event.target.value })} />
              )}
            </Field>
            <Field label="Kind">
              {(ids) => (
                <Select<PlanKind>
                  {...ids}
                  value={draft.kind}
                  onChange={(kind) => change({ ...draft, kind })}
                  options={PLAN_KINDS.map((kind) => ({ value: kind.id, label: kind.label }))}
                />
              )}
            </Field>
            <Field label="In your words" optional hint="Such as “Storm” or “Chemical works alarm”.">
              {(ids) => (
                <Input
                  {...ids}
                  value={draft.kindText}
                  maxLength={80}
                  onChange={(event) => change({ ...draft, kindText: event.target.value })}
                />
              )}
            </Field>
            <Field
              label="Emergency services number"
              hint={`It differs by country: ${EMERGENCY_NUMBERS.map((entry) => `${entry.number} ${entry.where}`).join("; ")}.`}
              error={draft.emergencyNumber.trim() ? undefined : "Give the number."}
            >
              {(ids) => (
                <Input
                  {...ids}
                  className="tabular"
                  inputMode="tel"
                  value={draft.emergencyNumber}
                  maxLength={20}
                  onChange={(event) => change({ ...draft, emergencyNumber: event.target.value })}
                />
              )}
            </Field>
            <Field label="Ask to look it over" hint={`Last looked over on ${formatDate(plan.reviewedAt)}.`}>
              {(ids) => (
                <Select<string>
                  {...ids}
                  value={draft.reviewEveryDays === null ? "never" : String(draft.reviewEveryDays)}
                  onChange={(value) => change({ ...draft, reviewEveryDays: value === "never" ? null : Number(value) })}
                  options={[
                    ...REVIEW_CHOICES,
                    ...(draft.reviewEveryDays !== null && !REVIEW_CHOICES.some((choice) => choice.value === String(draft.reviewEveryDays))
                      ? [{ value: String(draft.reviewEveryDays), label: `Every ${draft.reviewEveryDays} days` }]
                      : []),
                  ]}
                />
              )}
            </Field>
          </div>
          {!review.due ? (
            <Button variant="ghost" className="mt-2" loading={reviewed.isPending} onClick={() => reviewed.mutate()}>
              Mark as looked over today
            </Button>
          ) : null}
        </Section>
      </Part>

      <Part id="plan-steps">
        <StepsSection steps={body.steps} templateId={draft.templateId} onChange={(steps) => setBody({ steps })} />
      </Part>
      <Part id="household">
        <PeopleSection
          people={body.people}
          resolved={resolved}
          householdId={response.data.household?.id}
          onChange={(people) => setBody({ people })}
        />
      </Part>
      <Part id="plan-contacts">
        <ContactsSection contacts={body.contacts} resolved={resolved} onChange={(contacts) => setBody({ contacts })} />
      </Part>
      <Part id="plan-places">
        <PlacesSection places={body.places} resolved={resolved} onChange={(places) => setBody({ places })} />
      </Part>
      <Part id="plan-phones">
        <CommsSection comms={body.comms} resolved={resolved} onChange={(comms) => setBody({ comms })} />
      </Part>
      <Part id="plan-supplies">
        <SuppliesSection
          supplies={body.supplies}
          days={body.days}
          people={body.people.length}
          templateId={draft.templateId}
          planName={draft.name}
          onChange={(patch) => setBody(patch)}
        />
      </Part>
      <Part id="plan-power">
        <PowerSection powerPlanId={body.powerPlanId} onChange={(powerPlanId) => setBody({ powerPlanId })} />
      </Part>
      <Part id="plan-where">
        <WhereSection where={body.where} templateId={draft.templateId} onChange={(where) => setBody({ where })} />
      </Part>
      <Part id="plan-notes">
        <NotesSection body={body} resolved={resolved} onChange={(patch) => setBody(patch)} />
      </Part>
      <PlanIllustrations links={body.links} resolved={resolved} onChange={(links) => setBody({ links })} />
      <Sources templateId={draft.templateId} />

      <Section title="This plan">
        <div className="flex flex-wrap gap-2">
          <Button
            loading={copy.isPending}
            onClick={async () => {
              await flush();
              copy.mutate(undefined, { onSuccess: (made) => navigate(`/prepare/plans/${made.plan.id}`) });
            }}
          >
            <Copy aria-hidden /> Make a copy
          </Button>
          <Button variant="danger-ghost" onClick={() => setDeleting(true)}>
            Delete plan
          </Button>
        </div>
      </Section>
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title="Delete this plan?"
        description={`“${plan.name}” will be deleted, with its steps, people, places and supplies list. Contacts, saved places and the supplies themselves are not touched.`}
        confirmLabel="Delete plan"
        loading={remove.isPending}
        onConfirm={() =>
          remove.mutate(id, {
            onSuccess: () => {
              flushSync(() => setGone(true));
              navigate("/prepare/plans");
            },
          })
        }
      />
      {/* A change waiting to be saved is sent on leaving; one that cannot be (no name, a newer version elsewhere, a failed
          save) is asked about. Reloading or closing the tab asks while anything at all is unsent. */}
      <LeaveGuard when={!gone && UNSENT.includes(state)} beforeUnload={!gone && state !== "saved"} what="the changes to this plan" />
    </Page>
  );
}
