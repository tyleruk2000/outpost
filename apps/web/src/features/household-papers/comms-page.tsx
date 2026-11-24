/**
 * Keeping in touch: the household's communication plan. For each situation, what to
 * try first and what next (primary, alternate, contingency, emergency), when to check
 * in and who to contact, built from what Outpost already holds: contacts, channels from
 * the list of frequencies, repeaters, mesh channels and saved places. Printed as a page
 * for each person, with what is theirs alone at the top.
 */
import {
  type CommsInput,
  type CommsPlan,
  type CommsResolved,
  type CommsSituation,
  type FrequencyEntry,
  PACE_LEVELS,
  PACE_MEANS,
  type PaceLevel,
  type PaceMeans,
  type PaceStep,
  type RepeaterListResponse,
} from "@outpost/shared";
import { RADIO_FREQUENCIES } from "@outpost/shared/radio-frequencies-data";
import { useQuery } from "@tanstack/react-query";
import { CircleAlert, Plus, Undo2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { LeaveGuard } from "@/components/leave-guard";
import { ErrorState, Notice, Page, PageHeader, Rows, Section } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Select, Skeleton } from "@/components/ui/misc";
import { useMarkers, useSupplies } from "@/features/emergency-plans/data";
import { move, RowTools, removeAt, replaceAt } from "@/features/emergency-plans/list-edit";
import { ContactPicker } from "@/features/emergency-plans/people-section";
import { ForHousehold } from "@/features/households/for-household";
import { PdfActions } from "@/features/library/made/pdf-actions";
import { useMesh } from "@/features/mesh/data";
import { prepareScreens } from "@/features/prepare/screens";
import { kitPdfOf, useKitPdf } from "@/features/print-kit/use-kit-pdf";
import { api, errorMessage } from "@/lib/api";
import { appLocale } from "@/lib/region";
import { useDebounced } from "@/lib/use-debounced";
import { localId } from "@/lib/utils";
import { CHECK_IN_PATH, channelKey, contactLines, stepText, TRANSMIT_KINDS } from "./comms-words";
import { useComms, useSaveComms } from "./data";
import { commsDocument } from "./kit-papers";
import { libraryQuestion, PaperPreview } from "./paper-pdf";
import { SAVE_BAR_ROOM, SaveBar } from "./save-bar";

const NONE = "none";
const shortDate = new Intl.DateTimeFormat(appLocale(), { day: "numeric", month: "short", year: "numeric" });
const ENTRIES: readonly FrequencyEntry[] = RADIO_FREQUENCIES.filter((entry) => TRANSMIT_KINDS.has(entry.kind) && entry.status !== "closed");

/** Whether this version of Outpost has the household check-in screen to link to. */
export const hasCheckIn = () => prepareScreens.some((screen) => screen.to === CHECK_IN_PATH);

const blankStep = (level: PaceLevel, means: PaceMeans): PaceStep => ({
  id: localId(),
  level,
  means,
  contactId: null,
  frequency: null,
  repeaterId: null,
  meshChannel: null,
  markerId: null,
  when: "",
  text: "",
});

/** Search the repeaters Outpost holds by call sign or place, and choose one. */
function RepeaterChoice({ value, label, onChange }: { value: string | null; label: string | null; onChange(id: string | null): void }) {
  const [q, setQ] = useState("");
  const asked = useDebounced(q.trim(), 250);
  const found = useQuery({
    queryKey: ["repeaters", "list", { q: asked, pick: true }],
    enabled: asked.length > 1,
    queryFn: ({ signal }) => api.get<RepeaterListResponse>("/api/repeaters", { q: asked, limit: 8, offset: 0 }, signal),
  });
  if (value)
    return (
      <p className="text-small text-ink">
        {label ?? "A repeater no longer in Outpost"}{" "}
        <Button size="sm" variant="ghost" onClick={() => onChange(null)}>
          Change
        </Button>
      </p>
    );
  return (
    <div className="grid gap-1.5">
      <Field label="Find a repeater" hint="By call sign or place, among the repeaters kept under Radio.">
        {(ids) => (
          <Input
            {...ids}
            value={q}
            type="search"
            enterKeyHint="search"
            autoComplete="off"
            onChange={(event) => setQ(event.target.value)}
            placeholder="GB3"
          />
        )}
      </Field>
      {found.data && found.data.repeaters.length > 0 ? (
        <ul className="divide-y divide-border border-y border-border" aria-label="Repeaters found">
          {found.data.repeaters.map((repeater) => (
            <li key={repeater.id}>
              <button
                type="button"
                className="min-h-11 w-full px-1 py-2 text-left text-small hover:bg-surface"
                onClick={() => onChange(repeater.id)}
              >
                {repeater.callsign} · {repeater.place || "no place"} ·{" "}
                <span className="tabular">{(repeater.outputHz / 1e6).toFixed(4)} MHz</span>
              </button>
            </li>
          ))}
        </ul>
      ) : asked.length > 1 && found.data ? (
        <p className="text-small text-ink-muted">No repeater matches “{asked}”.</p>
      ) : null}
    </div>
  );
}

function StepEditor({
  level,
  step,
  resolved,
  onChange,
}: {
  level: (typeof PACE_LEVELS)[number];
  step: PaceStep | undefined;
  resolved: CommsResolved;
  onChange(step: PaceStep | null): void;
}) {
  const [picking, setPicking] = useState(false);
  const mesh = useMesh();
  const markers = useMarkers(step?.means === "meet");
  const set = (patch: Partial<PaceStep>) => step && onChange({ ...step, ...patch });
  const entry = step?.frequency ? ENTRIES.find((each) => each.id === step.frequency?.entryId) : undefined;
  const summary = step ? stepText(step, resolved, ENTRIES) : null;
  return (
    <li className="grid gap-3 py-4">
      <div className="flex flex-wrap items-end gap-3">
        <Field label={level.label} hint={level.about} className="min-w-[min(100%,12rem)] flex-1">
          {(ids) => (
            <Select
              {...ids}
              value={step?.means ?? NONE}
              onChange={(value) =>
                value === NONE
                  ? onChange(null)
                  : onChange({
                      ...blankStep(level.id, value as PaceMeans),
                      id: step?.id ?? localId(),
                      when: step?.when ?? "",
                      text: step?.text ?? "",
                    })
              }
              options={[{ value: NONE, label: "Not set" }, ...PACE_MEANS.map((means) => ({ value: means.id, label: means.label }))]}
            />
          )}
        </Field>
        {step ? (
          <Field label="When" optional className="min-w-[min(100%,10rem)] flex-1">
            {(ids) => (
              <Input
                {...ids}
                value={step.when}
                maxLength={120}
                placeholder="On the hour, for five minutes"
                onChange={(event) => set({ when: event.target.value })}
              />
            )}
          </Field>
        ) : null}
      </div>
      {step && (step.means === "phone" || step.means === "text") ? (
        <div className="flex flex-wrap items-center gap-2 text-small">
          <span className="text-ink">
            {step.contactId ? contactLines([step.contactId], resolved)[0] : "Nobody chosen: whoever is listed below."}
          </span>
          <Button size="sm" onClick={() => setPicking(true)}>
            {step.contactId ? "Change" : "Choose from Contacts"}
          </Button>
          <ContactPicker
            open={picking}
            onOpenChange={setPicking}
            title="Who to call or text"
            typed={false}
            onPick={(picked) => set({ contactId: picked.contactId })}
          />
        </div>
      ) : null}
      {step?.means === "mesh" ? (
        <Field
          label="Mesh channel"
          hint={
            mesh.data && mesh.data.channels.length === 0 ? "No mesh radio is set up yet: set one up under Settings, Mesh radio." : undefined
          }
        >
          {(ids) => (
            <Select
              {...ids}
              value={step.meshChannel ?? NONE}
              onChange={(value) => set({ meshChannel: value === NONE ? null : value })}
              options={[
                { value: NONE, label: "Any" },
                ...(mesh.data?.channels ?? []).map((channel) => ({ value: channel.id, label: channel.label })),
                ...(step.meshChannel && !mesh.data?.channels.some((channel) => channel.id === step.meshChannel)
                  ? [{ value: step.meshChannel, label: "A channel no longer set up" }]
                  : []),
              ]}
            />
          )}
        </Field>
      ) : null}
      {step?.means === "radio" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Radio service"
            hint="From Outpost’s list of frequencies. Transmitting needs the rules or the licence of where you are."
          >
            {(ids) => (
              <Select
                {...ids}
                value={step.frequency?.entryId ?? NONE}
                onChange={(value) => {
                  const chosen = ENTRIES.find((each) => each.id === value);
                  set({
                    frequency: chosen
                      ? { entryId: chosen.id, channel: chosen.frequencies[0] ? channelKey(chosen.frequencies[0]) : "" }
                      : null,
                  });
                }}
                options={[{ value: NONE, label: "Choose one" }, ...ENTRIES.map((each) => ({ value: each.id, label: each.name }))]}
              />
            )}
          </Field>
          {entry ? (
            <Field label="Channel">
              {(ids) => (
                <Select
                  {...ids}
                  value={step.frequency?.channel ?? ""}
                  onChange={(value) => set({ frequency: { entryId: entry.id, channel: value } })}
                  options={entry.frequencies.map((frequency) => ({
                    value: channelKey(frequency),
                    label: frequency.channel ? `Channel ${frequency.channel}` : `${(frequency.khz / 1000).toFixed(4)} MHz`,
                  }))}
                />
              )}
            </Field>
          ) : null}
        </div>
      ) : null}
      {step?.means === "repeater" ? (
        <RepeaterChoice
          value={step.repeaterId}
          label={
            step.repeaterId && resolved.repeaters[step.repeaterId]
              ? (summary?.text ?? null)
              : step.repeaterId && resolved.repeaters[step.repeaterId] === undefined
                ? "Chosen; saved with the plan"
                : null
          }
          onChange={(repeaterId) => set({ repeaterId })}
        />
      ) : null}
      {step?.means === "meet" ? (
        <Field label="Where" hint="A saved place on the map, or describe it below.">
          {(ids) => (
            <Select
              {...ids}
              value={step.markerId ?? NONE}
              onChange={(value) => set({ markerId: value === NONE ? null : value })}
              options={[
                { value: NONE, label: "Described below" },
                ...(markers.data ?? []).map((marker) => ({ value: marker.id, label: marker.name || "Unnamed place" })),
              ]}
            />
          )}
        </Field>
      ) : null}
      {step ? (
        <Field label="In your words" optional>
          {(ids) => (
            <Input
              {...ids}
              value={step.text}
              maxLength={600}
              placeholder={step.means === "meet" ? "The church porch" : "Say who you are and where"}
              onChange={(event) => set({ text: event.target.value })}
            />
          )}
        </Field>
      ) : null}
      {summary?.missing ? (
        <p className="flex items-center gap-1.5 text-small text-warning">
          <CircleAlert aria-hidden className="size-4 shrink-0" /> {summary.missing[0]!.toUpperCase() + summary.missing.slice(1)}. Choose
          again.
        </p>
      ) : null}
    </li>
  );
}

function SituationEditor({
  situation,
  resolved,
  index,
  count,
  onChange,
  onMove,
  onRemove,
}: {
  situation: CommsSituation;
  resolved: CommsResolved;
  index: number;
  count: number;
  onChange(next: CommsSituation): void;
  onMove(by: -1 | 1): void;
  onRemove(): void;
}) {
  const [picking, setPicking] = useState(false);
  const setStep = (level: PaceLevel, step: PaceStep | null) =>
    onChange({ ...situation, steps: [...situation.steps.filter((each) => each.level !== level), ...(step ? [step] : [])] });
  return (
    <li className="rounded-panel border border-border p-4 md:p-5">
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Situation" className="min-w-[min(100%,12rem)] flex-1">
          {(ids) => (
            <Input
              {...ids}
              value={situation.name}
              maxLength={120}
              placeholder="Phones down"
              onChange={(event) => onChange({ ...situation, name: event.target.value })}
            />
          )}
        </Field>
        <RowTools name={situation.name || "situation"} first={index === 0} last={index === count - 1} onMove={onMove} onRemove={onRemove} />
      </div>
      <ul className="divide-y divide-border">
        {PACE_LEVELS.map((level) => (
          <StepEditor
            key={level.id}
            level={level}
            step={situation.steps.find((step) => step.level === level.id)}
            resolved={resolved}
            onChange={(step) => setStep(level.id, step)}
          />
        ))}
      </ul>
      <div className="grid gap-3 border-t border-border pt-4">
        <Field label="Check in" optional hint="When to try, in this situation.">
          {(ids) => (
            <Input
              {...ids}
              value={situation.checkIn}
              maxLength={120}
              placeholder="12:00 and 18:00"
              onChange={(event) => onChange({ ...situation, checkIn: event.target.value })}
            />
          )}
        </Field>
        <div>
          <p className="text-small font-medium text-ink">Who to contact, in order</p>
          {situation.contactIds.length === 0 ? <p className="text-small text-ink-muted">Nobody chosen yet.</p> : null}
          <ol className="mt-1 grid gap-1">
            {situation.contactIds.map((id, at) => (
              <li key={id} className="flex flex-wrap items-center justify-between gap-2 text-small">
                <span className="text-ink">
                  {at + 1}. {contactLines([id], resolved)[0]}
                </span>
                <RowTools
                  name={resolved.contacts[id]?.displayName ?? "contact"}
                  first={at === 0}
                  last={at === situation.contactIds.length - 1}
                  onMove={(by) => onChange({ ...situation, contactIds: move(situation.contactIds, at, by) })}
                  onRemove={() => onChange({ ...situation, contactIds: removeAt(situation.contactIds, at) })}
                />
              </li>
            ))}
          </ol>
          <Button size="sm" className="mt-2" onClick={() => setPicking(true)}>
            <Plus /> Add a contact
          </Button>
          <ContactPicker
            open={picking}
            onOpenChange={setPicking}
            title="Who to contact"
            typed={false}
            onPick={(picked) =>
              picked.contactId &&
              !situation.contactIds.includes(picked.contactId) &&
              onChange({ ...situation, contactIds: [...situation.contactIds, picked.contactId] })
            }
          />
        </div>
      </div>
    </li>
  );
}

export default function CommsPage() {
  const comms = useComms();
  const supplies = useSupplies();
  const save = useSaveComms();
  const [draft, setDraft] = useState<CommsPlan | null>(null);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const checkIn = hasCheckIn();
  const data = comms.data;

  useEffect(() => {
    if (data && (!draft || (!dirty && data.plan.updatedAt !== draft.updatedAt))) setDraft(data.plan);
  }, [data, draft, dirty]);

  const members = useMemo(() => (supplies.data?.household.members ?? []).filter((member) => member.kind === "person"), [supplies.data]);
  const change = (patch: Partial<CommsPlan>) => {
    setDraft((current) => (current ? { ...current, ...patch } : current));
    setDirty(true);
  };
  const noteOf = (memberId: string) => draft?.people.find((person) => person.memberId === memberId)?.note ?? "";
  const setNote = (memberId: string, name: string, note: string) => {
    if (!draft) return;
    const others = draft.people.filter((person) => person.memberId !== memberId);
    const before = draft.people.find((person) => person.memberId === memberId);
    change({ people: note ? [...others, { id: before?.id ?? localId(), memberId, name, note }] : others });
  };

  const submit = () => {
    if (!draft) return;
    setError(null);
    const { updatedAt, ...body } = draft;
    const input: CommsInput = {
      ...body,
      situations: body.situations.map((situation) => ({ ...situation, name: situation.name.trim() || "A situation" })),
      baseUpdatedAt: comms.data?.plan.updatedAt ?? null,
    };
    save.mutate(input, {
      onSuccess: (data) => {
        setDraft(data.plan);
        setDirty(false);
        toast("The communication plan is saved.");
      },
      onError: (failure) => setError(`${errorMessage(failure)} Nothing was saved.`),
    });
  };

  // Printed from what is saved, a page for each person in the household (or one for everyone).
  const saved = comms.data;
  const people = useMemo(() => {
    if (!saved) return [];
    const listed = members.map(
      (member) =>
        saved.plan.people.find((person) => person.memberId === member.id) ?? {
          id: member.id,
          memberId: member.id,
          name: member.name || "Unnamed",
          note: "",
        },
    );
    const others = saved.plan.people.filter((person) => !members.some((member) => member.id === person.memberId));
    return [...listed, ...others];
  }, [saved, members]);
  const created = useMemo(() => new Date(saved?.plan.updatedAt ?? 0), [saved?.plan.updatedAt]);
  // Nothing to print until the plan is saved; dated by its saving, so the same plan made twice is the same file.
  const make = useMemo(
    () =>
      saved && saved.plan.updatedAt !== null
        ? () => commsDocument({ plan: saved.plan, resolved: saved.resolved, people, entries: ENTRIES, checkIn, made: created })
        : null,
    [saved, people, checkIn, created],
  );
  const from = useMemo(() => ({ what: "the household's communication plan", path: "/prepare/keeping-in-touch" }), []);
  const printed = useKitPdf(make, {
    title: `Keeping in touch, ${shortDate.format(created)}`,
    kind: "Communication plan",
    from,
  });

  return (
    <Page width="reading" className={SAVE_BAR_ROOM}>
      <PageHeader
        title="Keeping in touch"
        description="The household's communication plan: for each situation, what to try first and what next, when to check in, and who to contact. A page for each person to print or keep on the phone."
      />
      <ForHousehold className="-mt-6 mb-8" />
      {!data || !draft ? (
        comms.isError ? (
          <ErrorState error={comms.error} onRetry={() => void comms.refetch()} />
        ) : (
          <Skeleton className="h-64" />
        )
      ) : (
        <>
          <p className="max-w-[65ch] text-small text-ink-muted">
            Primary, alternate, contingency, emergency: the order to try things in, agreed in advance, so that nobody has to guess what the
            others will do.{" "}
            {checkIn ? (
              <>
                When Outpost can be reached,{" "}
                <Link to={CHECK_IN_PATH} className="text-primary underline underline-offset-2">
                  send a check-in
                </Link>{" "}
                as well.
              </>
            ) : null}{" "}
            Each person’s{" "}
            <Link to="/prepare/grab-cards" className="text-primary underline underline-offset-2">
              grab card
            </Link>{" "}
            carries the first steps.
          </p>

          <Section title="Everyone checks in" className="mt-8">
            <Field label="When" optional hint="Whatever the situation: “Every day at 12:00, for ten minutes”.">
              {(ids) => (
                <Input {...ids} value={draft.checkIns} maxLength={600} onChange={(event) => change({ checkIns: event.target.value })} />
              )}
            </Field>
          </Section>

          <Section
            title="Situations"
            description="Start with the likely ones: phones down, away from home when it happens, home cannot be used."
          >
            {draft.situations.length === 0 ? <p className="mb-3 text-small text-ink-muted">No situations yet.</p> : null}
            <ul className="grid gap-4">
              {draft.situations.map((situation, index) => (
                <SituationEditor
                  key={situation.id}
                  situation={situation}
                  resolved={data.resolved}
                  index={index}
                  count={draft.situations.length}
                  onChange={(next) => change({ situations: replaceAt(draft.situations, index, next) })}
                  onMove={(by) => change({ situations: move(draft.situations, index, by) })}
                  onRemove={() => change({ situations: removeAt(draft.situations, index) })}
                />
              ))}
            </ul>
            <Button
              className="mt-4"
              onClick={(event) => {
                const list = event.currentTarget.previousElementSibling;
                change({
                  situations: [
                    ...draft.situations,
                    { id: localId(), name: draft.situations.length === 0 ? "Phones down" : "", steps: [], checkIn: "", contactIds: [] },
                  ],
                });
                // The new situation's name takes the focus, which brings it into view (owner's review, 24 Nov 2026).
                requestAnimationFrame(() => list?.lastElementChild?.querySelector<HTMLElement>("input")?.focus());
              }}
            >
              <Plus /> Add a situation
            </Button>
          </Section>

          <Section title="Each person" description="What is theirs alone goes at the top of their page: “Wait at the school office”.">
            {members.length === 0 ? (
              <p className="text-small text-ink-muted">
                The household's people are kept under{" "}
                <Link to="/prepare/households" className="text-primary underline underline-offset-2">
                  Preparedness › Households
                </Link>
                . Add its people there for a page each; until then one page is printed for everyone.
              </p>
            ) : (
              <Rows>
                {members.map((member) => (
                  <li key={member.id} className="py-3">
                    <Field label={member.name || "Unnamed"} optional>
                      {(ids) => (
                        <Input
                          {...ids}
                          value={noteOf(member.id)}
                          maxLength={600}
                          onChange={(event) => setNote(member.id, member.name || "Unnamed", event.target.value)}
                        />
                      )}
                    </Field>
                  </li>
                ))}
              </Rows>
            )}
          </Section>

          <Section title="Notes">
            <Field label="Anything else everyone should know" optional>
              {(ids) => (
                <Textarea
                  {...ids}
                  rows={3}
                  value={draft.notes}
                  maxLength={4000}
                  onChange={(event) => change({ notes: event.target.value })}
                />
              )}
            </Field>
          </Section>

          <LeaveGuard when={dirty} what="the changes to the plan" />
          <SaveBar stuck={dirty}>
            <Button variant="primary" loading={save.isPending} disabled={!dirty} onClick={submit}>
              Save
            </Button>
            <span className="text-small text-ink-muted" role="status">
              {dirty ? "Changes not saved yet." : draft.updatedAt ? `Saved ${shortDate.format(draft.updatedAt)}.` : ""}
            </span>
            {dirty ? (
              <Button
                variant="ghost"
                onClick={() => {
                  setDraft(data.plan);
                  setDirty(false);
                }}
              >
                <Undo2 /> Undo changes
              </Button>
            ) : null}
          </SaveBar>
          {error ? (
            <Notice tone="danger" icon={<CircleAlert />}>
              {error}
            </Notice>
          ) : null}

          <Section title="Print" description="As saved, a page for each person. A printed copy does not change when the plan does.">
            {make ? (
              <div className="grid gap-4">
                <PdfActions pdf={kitPdfOf(printed)} lead="save" confirm={libraryQuestion(false)} />
                <PaperPreview made={printed} />
              </div>
            ) : (
              <p className="text-small text-ink-muted">Save the plan to print it.</p>
            )}
          </Section>
        </>
      )}
    </Page>
  );
}
