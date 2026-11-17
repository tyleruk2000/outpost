/**
 * Learning progress under Storage, Manage and clean up: what is kept, removed one
 * learner at a time or all together. Erasing everything removes it too.
 */
import { type LearnerSummary, learnerLabel } from "@outpost/shared";
import { CircleAlert } from "lucide-react";
import { useState } from "react";
import { ErrorState, Notice } from "@/components/page";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/misc";
import { errorMessage } from "@/lib/api";
import { plural, timeAgo } from "@/lib/utils";
import { useLearners, useRemoveProgress } from "./data";

export function LearningCleanup({ busy }: { busy: boolean }) {
  const learners = useLearners();
  const remove = useRemoveProgress();
  const [asking, setAsking] = useState<LearnerSummary | "everyone" | null>(null);
  if (learners.isPending) return <Skeleton className="h-16" />;
  if (learners.isError) return <ErrorState error={learners.error} onRetry={() => learners.refetch()} />;
  const list = learners.data.learners;
  const pages = list.reduce((sum, learner) => sum + learner.pages, 0);
  if (list.length === 0) return <p className="text-small text-ink-muted">No learning progress is kept.</p>;
  const whom = asking === "everyone" ? "everyone" : asking ? learnerLabel(asking.name) : "";
  return (
    <>
      <p className="tabular text-small text-ink">
        Kept for {plural(list.length, "learner")}: {plural(pages, "page")} in all.
      </p>
      <ul className="divide-y divide-border border-y border-border" aria-label="Learners">
        {list.map((learner) => (
          <li key={learner.name} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5">
            <div className="min-w-0 flex-1 basis-48 text-small">
              <p className="font-medium text-ink">{learnerLabel(learner.name)}</p>
              <p className="tabular text-ink-muted">
                {plural(learner.pages, "page")} in {plural(learner.courses, "collection")}, last {timeAgo(learner.lastAt)}
              </p>
            </div>
            <Button
              size="sm"
              variant="danger-ghost"
              disabled={busy}
              onClick={() => setAsking(learner)}
              aria-label={`Remove ${learnerLabel(learner.name)}'s progress`}
            >
              Remove
            </Button>
          </li>
        ))}
      </ul>
      <div>
        <Button onClick={() => setAsking("everyone")} disabled={busy}>
          Remove everyone's progress
        </Button>
      </div>
      <ConfirmDialog
        open={asking !== null}
        onOpenChange={(open) => (open ? undefined : setAsking(null))}
        title={asking === "everyone" ? "Remove everyone's learning progress?" : `Remove ${whom}'s learning progress?`}
        description={
          asking === "everyone"
            ? `Every page recorded for ${plural(list.length, "learner")} (${plural(pages, "page")}), what was marked done and the time spent, and what Outpost learned of the collections' topic pages. This cannot be undone.`
            : asking
              ? `${plural(asking.pages, "page")} in ${plural(asking.courses, "collection")}, what was marked done and the time spent. Other learners' progress is not touched. This cannot be undone.`
              : ""
        }
        confirmLabel="Remove"
        loading={remove.isPending}
        onConfirm={() =>
          asking &&
          remove.mutate(asking === "everyone" ? { everyone: true } : { learner: asking.name }, { onSuccess: () => setAsking(null) })
        }
      >
        {remove.isError ? (
          <Notice tone="danger" icon={<CircleAlert />}>
            {errorMessage(remove.error)}
          </Notice>
        ) : null}
      </ConfirmDialog>
    </>
  );
}
