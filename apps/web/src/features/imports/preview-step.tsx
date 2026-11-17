/**
 * Step two: the plan. Everything that would be created, what already exists, what
 * cannot come across, and the few choices there are, before anything is written.
 *
 * On a wide screen the choices sit beside the plan and stay in view; on a phone they
 * come first, because a long tree would otherwise push the button out of reach.
 */
import {
  formatBytes,
  type ImportAnalysis,
  type ImportDto,
  type ImportDuplicatePolicy,
  type ImportItem,
  type ImportOptions,
} from "@outpost/shared";
import { CircleAlert, File as FileIcon } from "lucide-react";
import { RadioGroup } from "radix-ui";
import { type ReactNode, useId, useMemo, useState } from "react";
import { Notice, Rows, Section } from "@/components/page";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Checkbox, RadioItem } from "@/components/ui/misc";
import { errorMessage } from "@/lib/api";
import { cn, plural } from "@/lib/utils";
import { useImportActions } from "./import-data";
import { type ChosenParent, ParentPicker } from "./parent-picker";
import { Disclosure, Losses, PathText } from "./plan-parts";
import {
  actionLabel,
  buildPreviewTree,
  commitGate,
  describeTotals,
  fileLabel,
  groupByReason,
  outcomeOf,
  outcomeWords,
  sourceLabel,
} from "./preview-model";
import { PreviewTreeView } from "./preview-tree";

// ── Small parts ─────────────────────────────────────────────────────────────

/**
 * One option of a choice. Radix's radio group gives the arrow keys and the roles; the
 * look is the checkbox's, drawn from the same tokens, so it holds up in both themes.
 */
function Choice({
  value,
  title,
  detail,
  disabled,
  children,
}: {
  value: string;
  title: string;
  detail: string;
  disabled?: boolean;
  children?: ReactNode;
}) {
  const id = useId();
  return (
    <div className="py-2.5">
      <div className="flex items-start gap-3">
        <RadioItem id={id} value={value} disabled={disabled} aria-describedby={`${id}-detail`} />
        <label htmlFor={id} className={cn("min-w-0 flex-1", disabled && "opacity-60")}>
          <span className="block text-small font-medium text-ink">{title}</span>
          <span id={`${id}-detail`} className="block text-small text-ink-muted">
            {detail}
          </span>
        </label>
      </div>
      {children}
    </div>
  );
}

function ChoiceGroup<T extends string>({
  legend,
  hint,
  value,
  onChange,
  children,
}: {
  legend: string;
  hint?: string;
  value: T;
  onChange: (value: T) => void;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <div className="min-w-0">
      <p id={id} className="text-small font-semibold text-ink">
        {legend}
      </p>
      {hint ? (
        <p id={`${id}-hint`} className="mt-0.5 text-small text-ink-muted">
          {hint}
        </p>
      ) : null}
      <RadioGroup.Root
        value={value}
        onValueChange={(next) => onChange(next as T)}
        aria-labelledby={id}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className="mt-1.5 divide-y divide-border border-y border-border"
      >
        {children}
      </RadioGroup.Root>
    </div>
  );
}

function duplicatesHint(totals: ImportAnalysis["totals"]): string {
  const parts: string[] = [];
  if (totals.importedBefore > 0) parts.push(`${totals.importedBefore} came from an earlier import`);
  if (totals.sameContent > 0)
    parts.push(`${totals.sameContent} ${totals.sameContent === 1 ? "has" : "have"} the same title and text as a page you already have`);
  return `${parts.join(", and ")}.`;
}

// ── The plan, in sections ───────────────────────────────────────────────────

function Warnings({ items }: { items: ImportItem[] }) {
  const withWarnings = items.filter((item) => item.warnings.length > 0);
  if (withWarnings.length === 0) return null;
  const total = withWarnings.reduce((sum, item) => sum + item.warnings.length, 0);
  return (
    <Section title="Warnings">
      <Disclosure summary={`${plural(total, "warning")} on ${plural(withWarnings.length, "page")}`}>
        <ul className="grid gap-3">
          {withWarnings.slice(0, 200).map((item) => (
            <li key={item.path}>
              <p className="text-small font-medium text-ink">{item.title}</p>
              <ul className="mt-0.5 list-disc pl-5 text-small text-ink-muted">
                {item.warnings.map((warning) => (
                  <li key={warning} className="break-words">
                    {warning}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
        {withWarnings.length > 200 ? (
          <p className="mt-3 text-small text-ink-muted">
            And {plural(withWarnings.length - 200, "more page")}. The report after the import counts them all.
          </p>
        ) : null}
      </Disclosure>
    </Section>
  );
}

function LeftOut({ skipped, ignored }: { skipped: ImportItem[]; ignored: number }) {
  if (skipped.length === 0 && ignored === 0) return null;
  const groups = groupByReason(skipped.map((item) => ({ ...item, reason: item.reason ?? "It is left out." })));
  return (
    <Section title="Files that are left out">
      {skipped.length > 0 ? (
        <Disclosure summary={plural(skipped.length, "file")}>
          <ul className="grid gap-3">
            {groups.map((group) => (
              <li key={group.reason}>
                <p className="text-small text-ink">{group.reason}</p>
                <p className="mt-0.5">
                  {group.entries.slice(0, 12).map((item, index) => (
                    <span key={item.path}>
                      {index > 0 ? <span className="text-ink-muted">, </span> : null}
                      <PathText path={item.path} />
                    </span>
                  ))}
                  {group.entries.length > 12 ? (
                    <span className="text-small text-ink-muted"> and {group.entries.length - 12} more</span>
                  ) : null}
                </p>
              </li>
            ))}
          </ul>
        </Disclosure>
      ) : null}
      {ignored > 0 ? (
        <p className="mt-2 text-small text-ink-muted">
          {plural(ignored, "hidden or system file")} (such as .DS_Store) {ignored === 1 ? "was" : "were"} passed over.
        </p>
      ) : null}
    </Section>
  );
}

// ── The step ────────────────────────────────────────────────────────────────

export function PreviewStep({ dto, analysis, onDiscarded }: { dto: ImportDto; analysis: ImportAnalysis; onDiscarded: () => void }) {
  const actions = useImportActions(dto.id);
  const parentFieldId = useId();
  const confirmId = useId();
  const [parent, setParent] = useState<ChosenParent | null>(null);
  const [duplicates, setDuplicates] = useState<ImportDuplicatePolicy>("skip");
  const [pdfs, setPdfs] = useState<ImportOptions["pdfs"]>("library");
  const [replaceConfirmed, setReplaceConfirmed] = useState(false);
  const [discarding, setDiscarding] = useState(false);

  const tree = useMemo(() => buildPreviewTree(analysis.items), [analysis.items]);
  const { totals } = analysis;
  const options: ImportOptions = { parentId: parent?.id ?? null, duplicates, pdfs, replaceConfirmed };
  const outcome = outcomeOf(analysis, options);
  const gate = commitGate(analysis, options);
  const existing = totals.importedBefore + totals.sameContent;
  const hasPages = totals.pages + totals.databases > 0;
  // "Created" would promise too much when some of the pages are already here and may be left alone.
  const treeTitle = existing > 0 ? "Pages in this upload" : "What will be created";

  const chooseDuplicates = (policy: ImportDuplicatePolicy) => {
    setDuplicates(policy);
    // The confirmation belongs to one decision; changing the decision withdraws it.
    setReplaceConfirmed(false);
  };

  return (
    <div>
      <div className="max-w-[70ch]">
        <h2 className="font-title text-heading break-words text-ink">{dto.originalName}</h2>
        <p className="mt-1 text-body text-ink-muted">
          {sourceLabel(analysis.source, totals)}: <span className="tabular text-ink">{describeTotals(totals)}</span>,{" "}
          {formatBytes(totals.bytes)} in all.
          {existing > 0 ? ` ${existing} of these pages ${existing === 1 ? "is" : "are"} already in your notes.` : ""}
        </p>
      </div>

      {analysis.problems.map((problem) => (
        <Notice key={problem} tone="danger" icon={<CircleAlert />} title="This upload cannot be imported" className="mt-5 max-w-[70ch]">
          {problem}
        </Notice>
      ))}

      <div className="mt-8 grid gap-x-12 gap-y-10 lg:grid-cols-[minmax(0,1fr)_21rem]">
        {/* ── Choices ── */}
        <form
          className="grid content-start gap-7 lg:sticky lg:top-6 lg:order-last lg:self-start"
          onSubmit={(event) => {
            event.preventDefault();
            if (gate.allowed) actions.commit.mutate(options);
          }}
        >
          {hasPages ? (
            <div className="grid gap-1.5">
              <label htmlFor={parentFieldId} className="text-small font-semibold text-ink">
                Put the pages under
              </label>
              <ParentPicker id={parentFieldId} value={parent} onChange={setParent} />
            </div>
          ) : null}

          {existing > 0 ? (
            <ChoiceGroup
              legend={`${plural(existing, "page")} already in your notes`}
              hint={duplicatesHint(totals)}
              value={duplicates}
              onChange={chooseDuplicates}
            >
              <Choice value="skip" title="Leave them as they are" detail="Only pages you do not have yet are imported." />
              <Choice value="copy" title="Import them again as copies" detail="You will then have each of these pages twice." />
              <Choice
                value="replace"
                disabled={totals.importedBefore === 0}
                title="Replace them with the imported versions"
                detail={
                  totals.importedBefore === 0
                    ? "Not possible here: none of these came from an earlier import, and pages you wrote yourself are never overwritten."
                    : `Overwrites the ${plural(totals.importedBefore, "page")} from the earlier import. Changes made to ${totals.importedBefore === 1 ? "it" : "them"} since are lost.${
                        totals.sameContent > 0
                          ? ` The ${totals.sameContent} you wrote yourself ${totals.sameContent === 1 ? "is" : "are"} left alone.`
                          : ""
                      }`
                }
              >
                {duplicates === "replace" ? (
                  <div className="mt-2.5 ml-[30px] flex items-start gap-3 rounded-panel bg-warning-soft p-3">
                    <Checkbox
                      id={confirmId}
                      checked={replaceConfirmed}
                      onCheckedChange={(value) => setReplaceConfirmed(value === true)}
                      className="mt-0.5"
                    />
                    <label htmlFor={confirmId} className="text-small font-medium text-ink">
                      Yes, overwrite {plural(outcome.replace, "existing page")}
                    </label>
                  </div>
                ) : null}
              </Choice>
            </ChoiceGroup>
          ) : null}

          {totals.documents > 0 ? (
            <ChoiceGroup legend={plural(totals.documents, "PDF")} value={pdfs} onChange={setPdfs}>
              <Choice
                value="library"
                title="Add to the library"
                detail="They become documents you can read and search. Pages that link to one link to its library copy."
              />
              <Choice value="skip" title="Leave them out" detail="A PDF that a page links to is still attached to that page." />
            </ChoiceGroup>
          ) : null}

          <div className="grid gap-3">
            {analysis.problems.length === 0 ? (
              <div className="border-t border-border pt-3">
                <p className="text-small font-semibold text-ink">When you import</p>
                <ul className="mt-1 grid gap-0.5 text-small text-ink-muted">
                  {outcomeWords(outcome, parent?.title ?? null).map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {!gate.allowed && analysis.problems.length === 0 ? (
              <p role="status" className="text-small text-ink-muted">
                {gate.reason}
              </p>
            ) : null}
            {actions.commit.isError ? (
              <Notice tone="danger" icon={<CircleAlert />}>
                {errorMessage(actions.commit.error)}
              </Notice>
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="submit"
                variant="primary"
                size="lg"
                disabled={!gate.allowed}
                loading={actions.commit.isPending}
                className="max-sm:w-full"
              >
                {actionLabel(outcome)}
              </Button>
              <Button variant="ghost" onClick={() => setDiscarding(true)} className="max-sm:w-full">
                Discard this upload
              </Button>
            </div>
          </div>
        </form>

        {/* ── The plan ── */}
        <div className="min-w-0">
          {tree.size > 0 ? (
            <Section
              title={treeTitle}
              description={`${describeTotals({ ...totals, attachments: 0, documents: 0 })}, in this order. Sub-pages are shown inside their page.`}
            >
              <PreviewTreeView tree={tree} policy={duplicates} label={treeTitle} />
            </Section>
          ) : null}

          {tree.documents.length > 0 ? (
            <Section title={pdfs === "library" ? "PDFs for the library" : "PDFs that are left out"}>
              <Rows>
                {tree.documents.slice(0, 50).map((item) => (
                  <li key={item.path} className="flex items-center gap-3 py-2.5">
                    <FileIcon aria-hidden className="size-4 shrink-0 text-ink-muted" strokeWidth={1.6} />
                    <span className="min-w-0 flex-1 break-words text-small text-ink">{fileLabel(item.path)}</span>
                    <span className="tabular shrink-0 text-small text-ink-muted">{formatBytes(item.sizeBytes)}</span>
                  </li>
                ))}
              </Rows>
              {tree.documents.length > 50 ? (
                <p className="mt-2 text-small text-ink-muted">And {plural(tree.documents.length - 50, "more PDF")}.</p>
              ) : null}
            </Section>
          ) : null}

          <Losses unsupported={analysis.unsupported} converted={analysis.converted} />
          <Warnings items={analysis.items} />
          <LeftOut skipped={tree.skipped} ignored={totals.ignored} />
        </div>
      </div>

      <ConfirmDialog
        open={discarding}
        onOpenChange={setDiscarding}
        title={`Discard “${dto.originalName}”?`}
        description="The uploaded copy is removed from Outpost. Nothing was added to your notes, and the file on your own device is not touched."
        confirmLabel="Discard upload"
        onConfirm={() => actions.discard.mutate(undefined, { onSuccess: onDiscarded })}
        loading={actions.discard.isPending}
      />
    </div>
  );
}
