/**
 * The two controls learning adds to the reader's bar: who is learning, and "Done" for
 * the page on show. Both are always there while an archive's page is open.
 */
import { Circle, CircleCheck } from "lucide-react";
import { useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/misc";
import { errorMessage } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useMarkDone, usePageProgress } from "./data";
import { chooseLearner, setRecording, useLearningDevice } from "./device";
import { DeviceLearnerSwitch } from "./learner-switch";
import type { LearningTracker } from "./tracker";

export function choose(name: string): void {
  chooseLearner(name);
  setRecording(true);
}

export function ReaderLearning({
  tracker,
  collectionId,
  watched,
}: {
  tracker: LearningTracker;
  collectionId: string;
  watched: { path: string; at: number } | null;
}) {
  const device = useLearningDevice();
  const { learner, page } = tracker;
  const progress = usePageProgress(learner, collectionId, page?.path ?? null);
  const mark = useMarkDone();
  const done = progress.data?.page?.doneAt != null;

  const set = (isDone: boolean, how: "marked" | "watched" = "marked") => {
    if (learner === null || !page) return;
    const input = { learner, collectionId, path: page.path, title: page.title, done: isDone, how };
    mark.mutate(input, {
      onSuccess: () => {
        if (!isDone) return;
        toast.success(
          how === "watched" ? `Counted as watched: ${page.title || "this page"}` : `Marked done: ${page.title || "this page"}`,
          {
            action: { label: "Undo", onClick: () => mark.mutate({ ...input, done: false }) },
          },
        );
      },
      onError: (error) => toast.error(errorMessage(error)),
    });
  };

  // The reader says a video on this page played to the end: counted as watched, once.
  // biome-ignore lint/correctness/useExhaustiveDependencies: acts on a new report only
  useEffect(() => {
    if (watched && page?.path === watched.path && !done && progress.isSuccess) set(true, "watched");
  }, [watched, progress.isSuccess]);

  if (!device.recording || learner === null) {
    return <DeviceLearnerSwitch onChoose={choose} />;
  }
  const label = done
    ? `Done: ${page?.title ?? "this page"}. Press to undo`
    : `Mark ${page?.title ? `“${page.title}”` : "this page"} as done`;
  return (
    <>
      <DeviceLearnerSwitch onChoose={choose} />
      <Tooltip label={done ? "Done. Press to undo" : "Mark this page done"}>
        <Button
          variant="ghost"
          size="icon"
          aria-label={label}
          aria-pressed={done}
          disabled={!page || progress.isPending}
          loading={mark.isPending}
          className={cn(done && "text-success hover:text-success")}
          onClick={() => set(!done)}
        >
          {mark.isPending ? null : done ? <CircleCheck /> : <Circle />}
        </Button>
      </Tooltip>
    </>
  );
}
