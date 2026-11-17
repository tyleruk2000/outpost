/**
 * While a job works on the import: reading the upload, or creating the pages. The bar
 * shows the job's own numbers and nothing else; without numbers it only says that work
 * is going on.
 */
import type { ImportDto } from "@outpost/shared";
import { CircleAlert } from "lucide-react";
import { Notice } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/misc";
import { errorMessage } from "@/lib/api";
import { formatNumber } from "@/lib/utils";
import { useImportActions } from "./import-data";

interface Words {
  title: string;
  waiting: string;
  note: string;
  stop: string;
}

function wordsFor(dto: ImportDto): Words {
  if (dto.state === "importing") {
    return {
      title: `Importing “${dto.originalName}”`,
      waiting: "Getting ready",
      note: "You can leave this page; the import carries on. If you stop it, what has been imported so far stays, and you can finish later without anything being imported twice.",
      stop: "Stop importing",
    };
  }
  return {
    title: `Reading “${dto.originalName}”`,
    waiting: "Waiting to start",
    note: "Nothing is added to your notes yet. Outpost is working out what this upload contains, so you can check it first.",
    stop: "Cancel",
  };
}

export function WorkingStep({ dto, onLeave }: { dto: ImportDto; onLeave: () => void }) {
  const actions = useImportActions(dto.id);
  const words = wordsFor(dto);
  const progress = dto.job?.progress;
  const known = progress?.total != null && progress.total > 0;
  const paused = dto.job?.state === "paused";
  const importing = dto.state === "importing";
  // Stopping an import keeps it (it can be finished later); cancelling a read throws the upload away.
  const action = importing ? actions.stop : actions.discard;

  return (
    <section className="max-w-[40rem]">
      <h2 className="font-title text-heading break-words text-ink">{words.title}</h2>
      {/* Spoken: the stage, and a pause. The count and the page being made change with every page, and are read from the bar when asked. */}
      <p role="status" className="sr-only">
        {paused ? `${words.title}: paused` : words.title}
      </p>
      <div className="mt-5 flex items-baseline justify-between gap-4">
        <p className="text-small font-medium text-ink">{paused ? "Paused" : (progress?.message ?? words.waiting)}</p>
        {known ? (
          <p className="tabular shrink-0 text-small text-ink-muted">
            {formatNumber(progress.current)} of {formatNumber(progress.total!)}
          </p>
        ) : null}
      </div>
      <Progress
        value={known ? progress.current / progress.total! : undefined}
        tone={paused ? "muted" : "lamp"}
        label={words.title}
        className="mt-2"
      />
      <p className="mt-4 text-small text-ink-muted">{words.note}</p>

      {action.isError ? (
        <Notice tone="danger" icon={<CircleAlert />} className="mt-4">
          {errorMessage(action.error)}
        </Notice>
      ) : null}

      <div className="mt-6 flex flex-wrap gap-2">
        <Button onClick={() => action.mutate(undefined, { onSuccess: importing ? undefined : onLeave })} loading={action.isPending}>
          {words.stop}
        </Button>
      </div>
    </section>
  );
}
