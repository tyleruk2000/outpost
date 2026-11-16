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
import { ArrowLeft, Copy, ListChecks, Printer } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { ErrorState, Notice, Page, PageHeader, Section } from "@/components/page";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Select, Skeleton } from "@/components/ui/misc";
import { formatDate, timeAgo } from "@/lib/utils";
import { inputOf, usePlan, usePlanAction, useRemovePlan, useSavePlan } from "./data";
import { TemplateLicences } from "./licences";
import { CommsSection, NotesSection, PlacesSection, PowerSection, WhereSection } from "./more-sections";
import { ContactsSection, PeopleSection } from "./people-section";
import { StepsSection } from "./steps-section";
import { SuppliesSection } from "./supplies-section";
import { REVIEW_CHOICES } from "./words";

const SAVE_AFTER_MS = 700;

/** Keeps a draft of the plan and saves it a moment after the last change. */
function useDraft(response: EmergencyPlanResponse | undefined) {
  const save = useSavePlan(response?.plan.id ?? "");
  const [draft, setDraft] = useState<EmergencyPlanInput | null>(null);
  const pending = useRef<EmergencyPlanInput | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadedId = useRef<string | null>(null);
  useEffect(() => {
    if (response && loadedId.current !== response.plan.id) {
      loadedId.current = response.plan.id;
      setDraft(inputOf(response.plan));
    }
  }, [response]);
  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
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
        .mutateAsync({ ...waiting, name: waiting.name.trim(), emergencyNumber: waiting.emergencyNumber.trim(), body })
        .catch(() => undefined);
    }
  }, [save]);
  const flushRef = useRef(flush);
  flushRef.current = flush;
  useEffect(() => () => void flushRef.current(), []);
  const change = (next: EmergencyPlanInput) => {
    setDraft(next);
    pending.current = next;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flushRef.current(), SAVE_AFTER_MS);
  };
  const state =
    draft && !draft.name.trim()
      ? "unnamed"
      : draft && !draft.emergencyNumber.trim()
        ? "no-number"
        : pending.current || save.isPending
          ? "saving"
          : save.isError
            ? "failed"
            : "saved";
  return { draft, change, state, flush };
}

const STATE_WORDS: Record<string, string> = {
  unnamed: "Give the plan a name to save it.",
  "no-number": "Give the emergency number to save the plan.",
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
  const { draft, change, state, flush } = useDraft(response.data);
  const reviewed = usePlanAction(id, "reviewed");
  const copy = usePlanAction(id, "copy");
  const remove = useRemovePlan();
  const navigate = useNavigate();
  const [deleting, setDeleting] = useState(false);
  const opened = usePlanAction(id, "opened");
  // When it was last opened before this time, said once; opening it now is recorded by this press, not by reading it.
  const before = useRef<number | null | undefined>(undefined);
  if (before.current === undefined && response.data) before.current = response.data.plan.openedAt;
  const openedMutate = opened.mutate;
  useEffect(() => {
    if (response.isSuccess) openedMutate();
  }, [response.isSuccess, openedMutate]);

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
        <PageHeader title="Emergency plan" />
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
      <Link to="/prepare/plans" className="mb-2 inline-flex min-h-11 items-center gap-1.5 text-small text-primary">
        <ArrowLeft aria-hidden className="size-4" /> Emergency plans
      </Link>
      <PageHeader
        title={draft.name.trim() || "Emergency plan"}
        description={
          <>
            <span className="block">{planCaveat(draft.emergencyNumber)}</span>
            <span className="mt-1 block text-small" aria-live="polite">
              {STATE_WORDS[state]} Last opened {before.current ? timeAgo(before.current) : "never before"}; changed{" "}
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

      {review.due ? (
        <Notice
          tone="warning"
          title="Time to look this plan over"
          className="mb-6"
          action={
            <Button size="sm" loading={reviewed.isPending} onClick={() => reviewed.mutate()}>
              Mark as looked over
            </Button>
          }
        >
          Last looked over on {formatDate(plan.reviewedAt)}. People move and numbers change: check the contacts, the places and the
          supplies.
        </Notice>
      ) : null}

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
          <Field label="In your words" hint="Optional: “Storm”, “Chemical works alarm”.">
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
          <Button size="sm" variant="ghost" className="mt-2" loading={reviewed.isPending} onClick={() => reviewed.mutate()}>
            Mark as looked over today
          </Button>
        ) : null}
      </Section>

      <StepsSection steps={body.steps} templateId={draft.templateId} onChange={(steps) => setBody({ steps })} />
      <PeopleSection people={body.people} resolved={resolved} onChange={(people) => setBody({ people })} />
      <ContactsSection contacts={body.contacts} resolved={resolved} onChange={(contacts) => setBody({ contacts })} />
      <PlacesSection places={body.places} resolved={resolved} onChange={(places) => setBody({ places })} />
      <CommsSection comms={body.comms} resolved={resolved} onChange={(comms) => setBody({ comms })} />
      <SuppliesSection
        supplies={body.supplies}
        days={body.days}
        people={body.people.length}
        templateId={draft.templateId}
        planName={draft.name}
        onChange={(patch) => setBody(patch)}
      />
      <PowerSection powerPlanId={body.powerPlanId} onChange={(powerPlanId) => setBody({ powerPlanId })} />
      <WhereSection where={body.where} templateId={draft.templateId} onChange={(where) => setBody({ where })} />
      <NotesSection body={body} resolved={resolved} onChange={(patch) => setBody(patch)} />
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
        onConfirm={() => remove.mutate(id, { onSuccess: () => navigate("/prepare/plans") })}
      />
    </Page>
  );
}
