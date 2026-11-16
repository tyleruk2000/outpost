/**
 * Step three, afterwards: the record. Everything the merge did, in words, with what
 * could not be done first. From here the drive can be updated to match home again, and
 * the merge can be undone from its own record.
 */
import type { MergeActionDto, MergeDto, MergeOutcome, MergeReport } from "@outpost/shared";
import { CircleAlert, CircleCheck, Undo2, Usb } from "lucide-react";
import { useId, useState } from "react";
import { Link } from "react-router";
import { Notice, Rows, Section } from "@/components/page";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Badge, Checkbox } from "@/components/ui/misc";
import { errorMessage } from "@/lib/api";
import { formatDateTime, plural } from "@/lib/utils";
import { useMergeActions } from "./merge-data";

const OUTCOME_WORDS: Record<MergeOutcome, string> = {
  added: "Added",
  updated: "Updated",
  copied: "Added beside home’s",
  trashed: "Moved to the trash",
  removed: "Removed",
  moved: "Moved",
  kept: "Kept as it was",
  already: "Already here",
  skipped: "Left alone",
  failed: "Not done",
};

const hrefOf = (action: MergeActionDto): string | null => {
  if (!action.homeItemId || action.outcome === "removed" || action.outcome === "failed") return null;
  if (action.kind === "page") return action.outcome === "trashed" ? null : `/notes/${action.homeItemId}`;
  if (action.kind === "document") return `/library/documents/${action.homeItemId}`;
  if (action.kind === "collection") return `/library/collections/${action.homeItemId}`;
  if (action.kind === "place") return `/maps?marker=${action.homeItemId}`;
  if (action.kind === "track") return `/maps?track=${action.homeItemId}`;
  return null;
};

function ActionRow({ action, undone }: { action: MergeActionDto; undone: boolean }) {
  const href = undone && action.undo === "done" ? null : hrefOf(action);
  const trouble = action.outcome === "failed" || action.outcome === "skipped";
  return (
    <li className="py-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="min-w-0 break-words text-small font-medium text-ink">
          {href ? (
            <Link to={href} className="underline decoration-border-strong underline-offset-2 hover:decoration-primary">
              {action.title}
            </Link>
          ) : (
            action.title
          )}
        </span>
        <Badge tone={trouble ? "warning" : "neutral"}>{OUTCOME_WORDS[action.outcome]}</Badge>
      </div>
      {action.message ? <p className="mt-0.5 text-small text-ink-muted">{action.message}</p> : null}
      {action.undoMessage ? <p className="mt-0.5 text-small text-ink">Undo: {action.undoMessage}</p> : null}
    </li>
  );
}

function sentence(report: MergeReport): string {
  const { counts } = report;
  const parts = [
    counts.added > 0 ? `${counts.added} added` : "",
    counts.updated > 0 ? `${counts.updated} updated` : "",
    counts.copied > 0 ? `${counts.copied} kept as both versions` : "",
    counts.moved > 0 ? `${counts.moved} moved` : "",
    counts.trashed > 0 ? `${counts.trashed} moved to the trash` : "",
    counts.removed > 0 ? `${counts.removed} removed` : "",
    counts.kept > 0 ? `${counts.kept} left as ${counts.kept === 1 ? "it was" : "they were"} at home` : "",
    counts.already > 0 ? `${counts.already} already here` : "",
  ].filter(Boolean);
  return parts.length > 0 ? `${parts.join(", ")}.` : "Nothing needed doing.";
}

export function ReportStep({ dto, report }: { dto: MergeDto; report: MergeReport | null }) {
  const actions = useMergeActions(dto.id);
  const [undoing, setUndoing] = useState(false);
  const [removeDocuments, setRemoveDocuments] = useState(false);
  const removeId = useId();

  const all = report?.actions ?? [];
  const troubled = all.filter((action) => action.outcome === "failed" || action.outcome === "skipped");
  const done = all.filter((action) => !troubled.includes(action) && action.outcome !== "kept" && action.kind !== "attachment");
  const kept = all.filter((action) => action.outcome === "kept");
  const files = all.filter((action) => action.kind === "attachment");
  const undone = dto.undoneAt !== null;
  const stopped = dto.state === "stopped";
  const canUndo = !undone && all.some((action) => action.undo === "can");

  return (
    <div className="max-w-[46rem]">
      {undone ? (
        <Notice tone="info" icon={<Undo2 />} title={`This merge was undone on ${formatDateTime(dto.undoneAt!)}`}>
          Each line below says what became of it. The changes are still on the drive, and can be brought back again.
        </Notice>
      ) : stopped ? (
        <Notice tone="warning" icon={<CircleAlert />} title="Stopped part-way">
          {report ? sentence(report) : "Nothing had been done yet."} Your library is whole: each item was either brought back completely or
          not at all. To carry on, look at the drive again; what is already here is not brought back twice.
        </Notice>
      ) : (
        <Notice
          tone={troubled.length > 0 ? "warning" : "success"}
          icon={troubled.length > 0 ? <CircleAlert /> : <CircleCheck />}
          title={`Brought back from ${dto.driveLabel}`}
        >
          {report ? sentence(report) : "Nothing needed doing."}
          {troubled.length > 0
            ? ` ${plural(troubled.length, "item")} could not be done; ${troubled.length === 1 ? "it is" : "they are"} listed first.`
            : ""}{" "}
          Nothing on the drive was changed.
        </Notice>
      )}

      <div className="mt-5 flex flex-wrap gap-2">
        {!undone ? (
          <Button asChild variant="primary">
            <Link to={`/storage?update-drive=${encodeURIComponent(dto.drivePath)}`}>
              <Usb aria-hidden /> Update this drive
            </Link>
          </Button>
        ) : null}
        <Button asChild>
          <Link to="/storage/merge">{stopped || undone ? "Look at a drive again" : "Bring back from another drive"}</Link>
        </Button>
        {canUndo ? (
          <Button variant="ghost" onClick={() => setUndoing(true)}>
            <Undo2 aria-hidden /> Undo this merge
          </Button>
        ) : null}
      </div>
      {!undone ? (
        <p className="mt-3 max-w-[65ch] text-small text-ink-muted">
          The drive still holds what it held. Updating it writes home’s notes and library index to it, so the two match again; what the
          drive holds now is set aside in a dated folder on the drive, not deleted.
        </p>
      ) : null}
      {actions.undo.isError ? (
        <Notice tone="danger" icon={<CircleAlert />} className="mt-4">
          {errorMessage(actions.undo.error)}
        </Notice>
      ) : null}

      {troubled.length > 0 ? (
        <Section
          title={`Not done ${troubled.length}`}
          description="Home was left as it was for each of these. They are still on the drive."
        >
          <Rows>
            {troubled.map((action) => (
              <ActionRow key={action.seq} action={action} undone={undone} />
            ))}
          </Rows>
        </Section>
      ) : null}
      {done.length > 0 ? (
        <Section title={`What was done ${done.length}`}>
          <Rows>
            {done.map((action) => (
              <ActionRow key={action.seq} action={action} undone={undone} />
            ))}
          </Rows>
        </Section>
      ) : null}
      {kept.length > 0 ? (
        <Section
          title={`Left as it was at home ${kept.length}`}
          description="Your decisions are remembered: these are not asked about again unless the drive’s version changes."
        >
          <Rows>
            {kept.map((action) => (
              <ActionRow key={action.seq} action={action} undone={undone} />
            ))}
          </Rows>
        </Section>
      ) : null}
      {files.length > 0 ? (
        <p className="mt-6 text-small text-ink-muted">
          {plural(files.length, "picture or file", "pictures and files")} in the pages {files.length === 1 ? "was" : "were"} copied from the
          drive, each checked against its checksum.
        </p>
      ) : null}

      <ConfirmDialog
        open={undoing}
        onOpenChange={setUndoing}
        title="Undo this merge?"
        description={
          <>
            <p>
              Pages it added go to the trash. Pages and details it updated are put back as they were; a page you have changed since is left
              alone, and its earlier version is added beside it instead. Pages it moved to the trash are restored, and saved places and
              tracks are put back.
            </p>
            {report && report.cannotUndo > 0 ? (
              <p className="mt-2 text-ink">
                {plural(report.cannotUndo, "thing")} cannot be undone: a document that was removed is gone, and a collection that was copied
                in stays until you remove it in the Library.
              </p>
            ) : null}
            <p className="mt-2">Nothing on the drive is changed, so everything can be brought back again.</p>
          </>
        }
        confirmLabel="Undo this merge"
        onConfirm={() => actions.undo.mutate({ removeDocuments }, { onSettled: () => setUndoing(false) })}
        loading={actions.undo.isPending}
      >
        {report && report.documentsAdded > 0 ? (
          <label htmlFor={removeId} className="flex cursor-pointer items-start gap-3">
            <Checkbox
              id={removeId}
              checked={removeDocuments}
              onCheckedChange={(value) => setRemoveDocuments(value === true)}
              className="mt-0.5"
            />
            <span className="text-small text-ink">
              Also remove the {plural(report.documentsAdded, "document")} it copied into the library
              <span className="block text-ink-muted">Left unticked, they stay in the library.</span>
            </span>
          </label>
        ) : null}
      </ConfirmDialog>
    </div>
  );
}
