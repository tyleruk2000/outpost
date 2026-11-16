/**
 * Step two: what changed, before anything is done. Each group is a list; each item
 * has its choice beside it and can be opened to read both versions. What the choices
 * add up to is said in sentences next to the button, which names exactly what it does.
 *
 * On a wide screen the summary sits beside the lists and stays in view; on a phone it
 * comes first, because a long list would otherwise push the button out of reach.
 */
import { formatBytes, type MergeAnalysis, type MergeChoice, type MergeDto, type MergeItem, mergeChoiceLabel } from "@outpost/shared";
import { ChevronRight, CircleAlert, Download, FileText, MapPin, Package, Route, StickyNote } from "lucide-react";
import { RadioGroup } from "radix-ui";
import { useId, useMemo, useState } from "react";
import { Notice, Rows, Section } from "@/components/page";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/misc";
import { errorMessage } from "@/lib/api";
import { cn, formatDate, plural } from "@/lib/utils";
import { Compare } from "./compare";
import { useMergeActions } from "./merge-data";
import {
  actionLabel,
  type Choices,
  choiceOf,
  contextLines,
  describeTally,
  type Group,
  groupItems,
  listKinds,
  tally,
  toCommitBody,
} from "./merge-model";

const KIND_ICON = { page: StickyNote, document: FileText, place: MapPin, track: Route, collection: Package } as const;
const SHOWN_AT_FIRST = 60;

const BASELINE_WORDS: Record<MergeAnalysis["baseline"], { title: string; body: string } | null> = {
  recorded: null,
  dates: {
    title: "This drive was made before drives kept a record of what they held",
    body: "So Outpost compared what is on it with what is here, and used dates to tell which side changed. Where the dates do not settle it, the item is listed as changed on both sides for you to decide, and moved pages are not followed.",
  },
  "other-library": {
    title: "This drive was made by a different Outpost",
    body: "Nothing on it is taken for an older copy of something here. Everything it holds that you do not have is offered as new.",
  },
};

/** When each side of a conflict last changed, in a sentence. */
function whenWords(item: MergeItem): string | null {
  if (item.change !== "conflict" || !item.homeUpdatedAt || !item.driveUpdatedAt) return null;
  const home = formatDate(item.homeUpdatedAt);
  const drive = formatDate(item.driveUpdatedAt);
  return home === drive ? `Changed at home and on the drive on ${home}.` : `Changed at home on ${home} and on the drive on ${drive}.`;
}

/** What sits at the end of a row: a size where files would be copied, otherwise when the drive's version was last changed. */
function trailingOf(item: MergeItem): string | null {
  if (item.change === "deleted" || item.change === "conflict" || item.change === "moved") return null;
  if (item.bytes !== null) return formatBytes(item.bytes);
  return item.driveUpdatedAt ? formatDate(item.driveUpdatedAt) : null;
}

/** A choice between two or three things, as radio buttons drawn as a row of pills that may wrap. */
function ChoicePills({ item, value, onChange }: { item: MergeItem; value: MergeChoice; onChange: (choice: MergeChoice) => void }) {
  return (
    <RadioGroup.Root
      value={value}
      onValueChange={(next) => onChange(next as MergeChoice)}
      aria-label={`What to do with “${item.title}”`}
      className="flex flex-wrap gap-1.5"
    >
      {item.choices.map((choice) => (
        <RadioGroup.Item
          key={choice}
          value={choice}
          className="h-8 rounded-full border border-border-strong bg-page px-3 text-small text-ink-muted transition-colors duration-150 hover:text-ink data-[state=checked]:border-primary data-[state=checked]:bg-primary-soft data-[state=checked]:font-semibold data-[state=checked]:text-primary-soft-ink max-md:h-11"
        >
          {mergeChoiceLabel(item, choice)}
        </RadioGroup.Item>
      ))}
    </RadioGroup.Root>
  );
}

function ItemRow({
  mergeId,
  item,
  choice,
  onChoose,
}: {
  mergeId: string;
  item: MergeItem;
  choice: MergeChoice;
  onChoose: (choice: MergeChoice) => void;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const Icon = KIND_ICON[item.kind];
  const ticked = item.choices.length === 2 && item.choices.includes("apply") && item.choices.includes("skip");
  const comparable = item.kind !== "collection" && item.change !== "moved";
  const when = whenWords(item);
  const lookLabel = item.change === "conflict" || item.change === "edited" ? "Compare the two versions" : "Show it";
  const trailing = trailingOf(item);

  const text = (
    <span className="block min-w-0">
      <span id={`${id}-title`} className="flex items-baseline gap-2 text-small font-medium text-ink">
        <Icon aria-hidden className="size-4 shrink-0 translate-y-[3px] text-ink-muted" strokeWidth={1.6} />
        <span className="min-w-0 break-words">{item.title}</span>
      </span>
      <span id={`${id}-more`} className="mt-0.5 block pl-6 text-small text-ink-muted">
        {item.context ? (
          <span className="block break-words">{item.kind === "page" && item.change !== "moved" ? `In ${item.context}` : item.context}</span>
        ) : null}
        {item.blocked ? <span className="block text-ink">{item.blocked}</span> : null}
        {when ? <span className="block">{when}</span> : null}
        {item.notes.map((note) => (
          <span key={note} className="block">
            {note}
          </span>
        ))}
      </span>
    </span>
  );

  return (
    <li className="py-3">
      <div className="flex items-start gap-3">
        {ticked && !item.blocked ? (
          <label htmlFor={id} className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-start gap-3 md:min-h-0">
            <Checkbox
              id={id}
              checked={choice === "apply"}
              onCheckedChange={(value) => onChoose(value === true ? "apply" : "skip")}
              aria-labelledby={`${id}-title`}
              aria-describedby={`${id}-more`}
              className="mt-0.5"
            />
            {text}
          </label>
        ) : (
          <div className="min-w-0 flex-1">{text}</div>
        )}
        {trailing && !item.blocked ? <span className="tabular shrink-0 text-small text-ink-muted">{trailing}</span> : null}
      </div>

      {!ticked && !item.blocked ? (
        <div className="mt-2.5 md:pl-6">
          <ChoicePills item={item} value={choice} onChange={onChoose} />
        </div>
      ) : null}
      {item.change === "deleted" && !item.blocked ? (
        <p className={cn("mt-1 pl-[54px] text-small", choice === "apply" ? "font-medium text-danger" : "text-ink-muted")}>
          {choice === "apply" ? (item.kind === "page" ? "Will go to the trash here too." : "Will be removed here too.") : "Stays at home."}
        </p>
      ) : null}

      {comparable && !item.blocked ? (
        <div className={cn("mt-1", ticked ? "pl-[54px]" : "pl-6")}>
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
            className="-ml-1 flex min-h-8 items-center gap-1 rounded-control px-1 text-small text-primary underline-offset-2 hover:underline max-md:min-h-11"
          >
            <ChevronRight aria-hidden className={cn("size-4 transition-transform duration-150", open && "rotate-90")} />
            {lookLabel}
          </button>
          {open ? (
            <div className="mt-2 rounded-panel border border-border p-3.5 md:p-4">
              <Compare mergeId={mergeId} item={item} />
            </div>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

function GroupSection({
  mergeId,
  group,
  choices,
  onChoose,
  onChooseAll,
}: {
  mergeId: string;
  group: Group;
  choices: Choices;
  onChoose: (item: MergeItem, choice: MergeChoice) => void;
  onChooseAll: (items: MergeItem[], choice: MergeChoice) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? group.items : group.items.slice(0, SHOWN_AT_FIRST);
  const tickable = group.id === "added" || group.id === "edited" || group.id === "deleted" || group.id === "collections";
  const allTicked = group.items.every((item) => choiceOf(item, choices) === "apply");
  // One choice for every conflict at once; an item that cannot take it keeps its own.
  const forAll: MergeChoice[] = group.id === "conflicts" && group.items.length > 1 ? ["both", "home", "drive"] : [];

  return (
    <Section
      title={
        <>
          {group.title} <span className="tabular font-normal text-ink-muted">{group.items.length}</span>
        </>
      }
      description={group.description}
      actions={
        tickable && group.items.length > 1 ? (
          <button
            type="button"
            className="text-small text-primary underline underline-offset-2 max-md:-mr-2 max-md:min-h-11 max-md:px-2"
            onClick={() => onChooseAll(group.items, allTicked ? "skip" : "apply")}
          >
            {allTicked ? "Untick all" : "Tick all"}
          </button>
        ) : undefined
      }
    >
      {forAll.length > 0 ? (
        <div className="mb-1 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-border py-2.5 text-small text-ink-muted">
          <span>For all {group.items.length}:</span>
          {forAll.map((choice) => (
            <Button key={choice} size="sm" variant="ghost" className="text-primary" onClick={() => onChooseAll(group.items, choice)}>
              {mergeChoiceLabel({ kind: "page", change: "conflict" }, choice)}
            </Button>
          ))}
        </div>
      ) : null}
      <Rows aria-label={group.title}>
        {shown.map((item) => (
          <ItemRow
            key={item.key}
            mergeId={mergeId}
            item={item}
            choice={choiceOf(item, choices)}
            onChoose={(choice) => onChoose(item, choice)}
          />
        ))}
      </Rows>
      {group.items.length > shown.length ? (
        <Button variant="ghost" size="sm" className="mt-2" onClick={() => setShowAll(true)}>
          Show all {group.items.length}
        </Button>
      ) : null}
    </Section>
  );
}

export function PreviewStep({ dto, analysis, onDiscarded }: { dto: MergeDto; analysis: MergeAnalysis; onDiscarded: () => void }) {
  const actions = useMergeActions(dto.id);
  const [choices, setChoices] = useState<Choices>({});
  const [confirming, setConfirming] = useState(false);
  const [discarding, setDiscarding] = useState(false);

  const groups = useMemo(() => groupItems(analysis.items), [analysis.items]);
  const result = useMemo(() => tally(analysis.items, choices), [analysis.items, choices]);
  const baseline = BASELINE_WORDS[analysis.baseline];
  const nothing = analysis.items.length === 0;
  const canCommit = result.changes > 0 || result.keep.length > 0;

  const choose = (item: MergeItem, choice: MergeChoice) => setChoices((current) => ({ ...current, [item.key]: choice }));
  const chooseAll = (items: MergeItem[], choice: MergeChoice) =>
    setChoices((current) => {
      const next = { ...current };
      for (const item of items) if (!item.blocked && item.choices.includes(choice)) next[item.key] = choice;
      return next;
    });
  const commit = (deletionsConfirmed: boolean) =>
    actions.commit.mutate(toCommitBody(analysis.items, choices, deletionsConfirmed), { onSettled: () => setConfirming(false) });
  const submit = () => {
    if (!canCommit) return;
    // Removing anything at home is asked for twice: once by the tick, once here, by name.
    if (result.remove.length > 0) setConfirming(true);
    else commit(false);
  };

  return (
    <div>
      <h2 className="font-title text-heading break-words text-ink">
        {nothing ? "Nothing to bring back" : `What changed on ${dto.driveLabel}`}
      </h2>
      <p className="mt-1 max-w-[65ch] text-body text-ink-muted">
        {analysis.driveWrittenAt ? `The drive was last written from here on ${formatDate(analysis.driveWrittenAt)}. ` : ""}
        {nothing
          ? "Everything on it is already here, or was changed only at home."
          : "Nothing has been changed yet, here or on the drive. The drive itself is never changed by this."}
      </p>

      {dto.error ? (
        <Notice tone="danger" icon={<CircleAlert />} className="mt-5 max-w-[65ch]">
          {dto.error}
        </Notice>
      ) : null}
      {baseline ? (
        <Notice tone="info" title={baseline.title} className="mt-5 max-w-[65ch]">
          {baseline.body}
        </Notice>
      ) : null}
      {analysis.warnings.map((warning) => (
        <Notice key={warning} tone="warning" icon={<CircleAlert />} className="mt-3 max-w-[65ch]">
          {warning}
        </Notice>
      ))}

      <div className="mt-8 grid gap-x-12 gap-y-10 lg:grid-cols-[minmax(0,1fr)_21rem]">
        {/* ── What will happen, and the button ── */}
        <aside className="grid content-start gap-5 lg:sticky lg:top-6 lg:order-last lg:self-start" aria-label="What will happen">
          {nothing ? null : (
            <div>
              <p className="text-small font-semibold text-ink">With the choices as they are</p>
              <ul className="mt-1.5 grid gap-1 text-small text-ink">
                {describeTally(result).map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              {result.bytes > 0 || analysis.attachments.count > 0 ? (
                <p className="tabular mt-2 text-small text-ink-muted">
                  {[
                    result.bytes > 0 ? `${formatBytes(result.bytes)} of files to copy` : "",
                    analysis.attachments.count > 0
                      ? `up to ${plural(analysis.attachments.count, "picture or file", "pictures and files")} from the pages (${formatBytes(analysis.attachments.bytes)})`
                      : "",
                  ]
                    .filter(Boolean)
                    .join(", and ")}
                  . Each is checked against its checksum.
                </p>
              ) : null}
            </div>
          )}

          {canCommit ? (
            <div className="border-y border-border py-3">
              <p className="text-small text-ink">
                <span className="font-semibold">A backup first?</span> It holds your notes and library records as they are now, so that this
                can be put back whatever happens.
              </p>
              <Button asChild variant="link" className="mt-1">
                <a href="/api/backup/download" download>
                  <Download aria-hidden /> Download a backup
                </a>
              </Button>
            </div>
          ) : null}

          {actions.commit.isError ? (
            <Notice tone="danger" icon={<CircleAlert />}>
              {errorMessage(actions.commit.error)}
            </Notice>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="primary"
              size="lg"
              disabled={!canCommit}
              loading={actions.commit.isPending}
              onClick={submit}
              className="max-sm:w-full"
            >
              {actionLabel(result)}
            </Button>
            <Button
              variant="ghost"
              loading={nothing && actions.discard.isPending}
              onClick={() => (nothing ? actions.discard.mutate(undefined, { onSuccess: onDiscarded }) : setDiscarding(true))}
              className="max-sm:w-full"
            >
              {nothing ? "Close" : "Not now"}
            </Button>
          </div>
        </aside>

        {/* ── The lists ── */}
        <div className="min-w-0">
          {groups.map((group) => (
            <GroupSection key={group.id} mergeId={dto.id} group={group} choices={choices} onChoose={choose} onChooseAll={chooseAll} />
          ))}
          {contextLines(analysis).length > 0 ? (
            <Section title="Not listed">
              <ul className="grid max-w-[65ch] gap-1 text-small text-ink-muted">
                {contextLines(analysis).map((line) => (
                  <li key={line}>{line}</li>
                ))}
                <li>Settings are not brought back: home keeps its own.</li>
              </ul>
            </Section>
          ) : null}
        </div>
      </div>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Remove ${listKinds(result.remove)} here?`}
        description={
          <>
            <p>You ticked these to be removed at home as they were on the drive:</p>
            <ul className="mt-2 grid gap-0.5 text-ink">
              {result.remove.slice(0, 12).map((item) => (
                <li key={item.key} className="break-words">
                  {item.title}
                </li>
              ))}
              {result.remove.length > 12 ? <li>and {result.remove.length - 12} more</li> : null}
            </ul>
            <p className="mt-2">
              Pages go to the trash in Notes and can be restored. Saved places and tracks can be put back by undoing this merge.
              {result.remove.some((item) => item.kind === "document") ? " A document’s file is deleted for good." : ""}
            </p>
          </>
        }
        confirmLabel={actionLabel(result)}
        onConfirm={() => commit(true)}
        loading={actions.commit.isPending}
      />
      <ConfirmDialog
        open={discarding}
        onOpenChange={setDiscarding}
        title="Leave these changes on the drive?"
        description="Nothing was changed, here or on the drive. You can look at the drive again whenever you like; everything on it will still be there."
        confirmLabel="Leave them for now"
        confirmVariant="primary"
        cancelLabel="Keep looking"
        onConfirm={() => actions.discard.mutate(undefined, { onSuccess: onDiscarded })}
        loading={actions.discard.isPending}
      />
    </div>
  );
}
