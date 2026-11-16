/**
 * Bring back changes from a portable drive, in three steps: choose the drive, check
 * what changed, bring it back and read the record.
 *
 * The merge being worked on is named in the address (`/storage/merge?id=…`), so a
 * reload or a link from the list of earlier merges lands on the right step. The step
 * shown is decided by the merge's state on the server, never by what this tab remembers.
 */
import type { DriveSource, MergeDto } from "@outpost/shared";
import { formatBytes } from "@outpost/shared";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, CircleAlert, CircleCheck } from "lucide-react";
import { RadioGroup } from "radix-ui";
import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { ErrorState, Notice, Page, PageHeader, Rows, Section } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Progress, Skeleton } from "@/components/ui/misc";
import { errorMessage } from "@/lib/api";
import { cn, formatDate, formatDateTime, formatNumber } from "@/lib/utils";
import { FolderPicker, type PickedFolder } from "../storage/folder-picker";
import { mergeKeys, useDriveInspection, useMerge, useMergeActions, useMerges, useStartMerge } from "./merge-data";
import { PreviewStep } from "./preview-step";
import { ReportStep } from "./report-step";

const STEPS = ["Choose the drive", "Check what changed", "Bring it back"] as const;

function stepOf(merge: MergeDto | undefined): number {
  if (!merge || merge.state === "analysing") return 0;
  if (merge.state === "ready") return 1;
  if ((merge.state === "failed" || merge.state === "discarded") && !merge.report) return 0;
  return 2;
}

function StepList({ current }: { current: number }) {
  return (
    <ol className="mb-8 flex flex-wrap items-center gap-x-6 gap-y-2 border-y border-border py-3 text-small">
      {STEPS.map((label, index) => (
        <li
          key={label}
          aria-current={index === current ? "step" : undefined}
          className={cn("flex items-center gap-2", index === current ? "font-semibold text-ink" : "text-ink-muted")}
        >
          <span
            className={cn(
              "tabular grid size-5 place-content-center rounded-full text-micro",
              index < current ? "bg-primary text-primary-ink" : index === current ? "bg-ink text-page" : "border border-border-strong",
            )}
          >
            {index < current ? <Check aria-hidden className="size-3" strokeWidth={3} /> : index + 1}
          </span>
          {label}
          {index < current ? <span className="sr-only">(done)</span> : null}
        </li>
      ))}
    </ol>
  );
}

const STATE_WORDS: Record<MergeDto["state"], string> = {
  analysing: "Reading the drive",
  ready: "Waiting for your choices",
  merging: "Bringing changes back",
  completed: "Brought back",
  stopped: "Stopped part-way",
  failed: "Could not be read",
  discarded: "Set aside",
};

const sourceWords = (source: DriveSource): { title: string; detail: string } =>
  source.current
    ? { title: "The notes on the drive now", detail: `${formatBytes(source.databaseBytes)} to read` }
    : {
        title: `The notes it held before it was updated${source.setAsideAt ? ` on ${formatDate(Date.parse(source.setAsideAt))}` : ""}`,
        detail: `Kept on the drive in ${source.folder}. Choose this if the drive was updated before its changes were brought back.`,
      };

function ChooseStep({ onStarted }: { onStarted: (merge: MergeDto) => void }) {
  const [folder, setFolder] = useState<PickedFolder>({ path: undefined, writable: false });
  const [source, setSource] = useState<string>();
  const inspection = useDriveInspection(folder.path);
  const start = useStartMerge();
  const merges = useMerges();
  const drive = inspection.data?.drive ?? null;
  const sources = drive?.sources ?? [];
  // biome-ignore lint/correctness/useExhaustiveDependencies: a different folder starts from its current notes again
  useEffect(() => setSource(undefined), [folder.path]);
  const chosen = sources.find((entry) => entry.folder === source) ?? sources.find((entry) => entry.current) ?? sources[0];

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,34rem)_minmax(0,1fr)] lg:gap-x-14">
      <div className="grid content-start gap-5">
        <div>
          <h2 className="font-title text-heading text-ink">Which drive?</h2>
          <p className="mt-1 text-body text-ink-muted">
            Plug the drive into this computer and open its Outpost folder, the one that holds “Start Outpost”. If Outpost is running from
            the drive, stop it first.
          </p>
        </div>
        <FolderPicker label="Folder on the drive" onChange={setFolder} pickOnly />

        <div aria-live="polite" className="grid gap-4">
          {!folder.path ? null : inspection.isPending ? (
            <Skeleton className="h-12" />
          ) : inspection.isError ? (
            <Notice tone="danger" icon={<CircleAlert />}>
              {errorMessage(inspection.error)}
            </Notice>
          ) : !drive ? (
            <Notice tone="info">{inspection.data?.problem ?? "This folder is not an Outpost drive."}</Notice>
          ) : (
            <>
              <Notice tone="success" icon={<CircleCheck />} title="This is an Outpost drive">
                {drive.updatedAt ? `Last written on ${formatDate(Date.parse(drive.updatedAt))}` : "Its date of writing is not recorded"}, by
                Outpost {drive.appVersion}.
              </Notice>
              {sources.length > 1 ? (
                <div>
                  <p id="merge-source" className="text-small font-semibold text-ink">
                    Which notes to read
                  </p>
                  <RadioGroup.Root
                    value={chosen?.folder}
                    onValueChange={setSource}
                    aria-labelledby="merge-source"
                    className="mt-1.5 divide-y divide-border border-y border-border"
                  >
                    {sources.map((entry) => {
                      const words = sourceWords(entry);
                      return (
                        <label
                          key={entry.folder}
                          htmlFor={`source-${entry.folder}`}
                          className="flex cursor-pointer items-start gap-3 py-2.5"
                        >
                          <RadioGroup.Item
                            id={`source-${entry.folder}`}
                            value={entry.folder}
                            className="relative mt-0.5 grid size-[18px] shrink-0 place-content-center rounded-full border-[1.5px] border-border-strong bg-page transition-colors before:absolute before:-inset-3 data-[state=checked]:border-primary"
                          >
                            <RadioGroup.Indicator className="block size-2.5 rounded-full bg-primary" />
                          </RadioGroup.Item>
                          <span className="min-w-0">
                            <span className="block text-small font-medium text-ink">{words.title}</span>
                            <span className="block text-small break-words text-ink-muted">{words.detail}</span>
                          </span>
                        </label>
                      );
                    })}
                  </RadioGroup.Root>
                </div>
              ) : null}
            </>
          )}
          {start.isError ? (
            <Notice tone="danger" icon={<CircleAlert />}>
              {errorMessage(start.error)}
            </Notice>
          ) : null}
        </div>

        <div>
          <Button
            variant="primary"
            size="lg"
            disabled={!drive || !chosen}
            loading={start.isPending}
            onClick={() => folder.path && start.mutate({ path: folder.path, source: chosen?.folder }, { onSuccess: onStarted })}
            className="max-sm:w-full"
          >
            Look for changes
          </Button>
          <p className="mt-3 text-small text-ink-muted">
            Looking changes nothing. Outpost copies the drive’s notes database to this computer to read it, and never writes to the drive.
          </p>
        </div>
      </div>

      <div className="min-w-0">
        <Section title="Earlier merges" description="The record of each is kept, and a merge can be undone from its record.">
          {merges.isPending ? (
            <div className="grid gap-2" aria-busy>
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
            </div>
          ) : merges.isError ? (
            <ErrorState error={merges.error} onRetry={() => merges.refetch()} />
          ) : merges.data.length === 0 ? (
            <p className="border-y border-border py-4 text-small text-ink-muted">Nothing has been brought back from a drive yet.</p>
          ) : (
            <Rows>
              {merges.data.map((merge) => (
                <li key={merge.id}>
                  <Link
                    to={`/storage/merge?id=${merge.id}`}
                    className="flex min-h-11 flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-2.5 hover:text-primary"
                  >
                    <span className="min-w-0 font-mono text-[0.8125rem] break-all text-ink">{merge.driveLabel}</span>
                    <span className="text-small text-ink-muted">
                      {merge.undoneAt ? "Undone" : STATE_WORDS[merge.state]}, {formatDateTime(merge.createdAt)}
                    </span>
                  </Link>
                </li>
              ))}
            </Rows>
          )}
        </Section>
      </div>
    </div>
  );
}

function WorkingStep({ dto, onLeave }: { dto: MergeDto; onLeave: () => void }) {
  const actions = useMergeActions(dto.id);
  const merging = dto.state === "merging";
  const progress = dto.job?.progress;
  const known = progress?.total != null && progress.total > 0;
  const paused = dto.job?.state === "paused";
  const title = merging ? `Bringing changes back from ${dto.driveLabel}` : `Reading ${dto.driveLabel}`;
  return (
    <section className="max-w-[40rem]" aria-live="polite">
      <h2 className="font-title text-heading break-words text-ink">{title}</h2>
      <div className="mt-5 flex items-baseline justify-between gap-4">
        <p className="min-w-0 text-small font-medium break-words text-ink">
          {paused ? "Paused" : (progress?.message ?? "Waiting to start")}
        </p>
        {known ? (
          <p className="tabular shrink-0 text-small text-ink-muted">
            {merging
              ? `${formatNumber(progress.current)} of ${formatNumber(progress.total!)}`
              : `${formatBytes(progress.current)} of ${formatBytes(progress.total!)}`}
          </p>
        ) : null}
      </div>
      <Progress
        value={known ? progress.current / progress.total! : undefined}
        tone={paused ? "muted" : "lamp"}
        label={title}
        className="mt-2"
      />
      <p className="mt-4 text-small text-ink-muted">
        {merging
          ? "Keep the drive plugged in. You can leave this page; the work carries on. If you stop it, everything brought back so far stays whole and is listed, and the rest can be brought back later."
          : "Keep the drive plugged in. Nothing is changed yet, here or on the drive: Outpost is working out what is different so that you can check it first."}
      </p>
      {actions.stop.isError ? (
        <Notice tone="danger" icon={<CircleAlert />} className="mt-4">
          {errorMessage(actions.stop.error)}
        </Notice>
      ) : null}
      <div className="mt-6">
        <Button
          onClick={() => actions.stop.mutate(undefined, { onSuccess: merging ? undefined : onLeave })}
          loading={actions.stop.isPending}
        >
          {merging ? "Stop" : "Cancel"}
        </Button>
      </div>
    </section>
  );
}

const startAgain = (
  <Button asChild variant="primary">
    <Link to="/storage/merge">Look at a drive again</Link>
  </Button>
);

function MergeBody({ dto, onLeave }: { dto: MergeDto; onLeave: () => void }) {
  if (dto.state === "analysing" || dto.state === "merging") return <WorkingStep dto={dto} onLeave={onLeave} />;
  if (dto.state === "ready" && dto.analysis) return <PreviewStep dto={dto} analysis={dto.analysis} onDiscarded={onLeave} />;
  if (dto.state === "completed" || dto.state === "stopped") return <ReportStep dto={dto} report={dto.report} />;
  if (dto.state === "failed" && dto.report) {
    return (
      <div className="grid gap-5">
        <Notice tone="danger" icon={<CircleAlert />} title="The merge could not be finished" className="max-w-[46rem]">
          {dto.error ?? "Something went wrong on the server."} What it had done by then is listed below.
        </Notice>
        <ReportStep dto={{ ...dto, state: "stopped" }} report={dto.report} />
      </div>
    );
  }
  return (
    <div className="grid max-w-[40rem] gap-5">
      {dto.state === "discarded" ? (
        <Notice title="These changes were left on the drive">
          Nothing was changed, here or on the drive. Look at the drive again to bring them back.
        </Notice>
      ) : (
        <Notice tone="danger" icon={<CircleAlert />} title="This drive could not be read">
          {dto.error ?? "Something went wrong on the server."} Nothing was changed, here or on the drive.
        </Notice>
      )}
      <div>{startAgain}</div>
    </div>
  );
}

export default function MergePage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const client = useQueryClient();
  const id = params.get("id") ?? undefined;
  const current = useMerge(id);
  const toStart = () => navigate("/storage/merge");

  const onStarted = (merge: MergeDto) => {
    client.setQueryData(mergeKeys.detail(merge.id), merge);
    void client.invalidateQueries({ queryKey: mergeKeys.list });
    navigate(`/storage/merge?id=${merge.id}`);
  };

  return (
    <Page>
      <PageHeader
        title="Bring back changes from a drive"
        description="Bring home what you wrote and added while running Outpost from a portable drive. You see everything first, you choose what happens where both sides changed, and the drive itself is never changed."
        actions={
          <Button asChild variant="ghost">
            <Link to={id ? "/storage/merge" : "/storage"}>
              <ArrowLeft /> {id ? "All merges" : "Storage"}
            </Link>
          </Button>
        }
      />
      <StepList current={stepOf(id ? current.data : undefined)} />

      {!id ? (
        <ChooseStep onStarted={onStarted} />
      ) : current.isPending ? (
        <div className="grid max-w-[40rem] gap-4" aria-busy>
          <Skeleton className="h-7 w-2/3" />
          <Skeleton className="h-4" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-24" />
        </div>
      ) : current.isError ? (
        <div className="grid max-w-[40rem] gap-5">
          <ErrorState error={current.error} onRetry={() => current.refetch()} />
          <div>{startAgain}</div>
        </div>
      ) : (
        <MergeBody key={`${current.data.id}:${current.data.state}`} dto={current.data} onLeave={toStart} />
      )}
    </Page>
  );
}
