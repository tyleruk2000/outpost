/**
 * "Add all": copying many files of a reference collection into the document library.
 *
 * The copying is a job on the server, so it goes on when this page is closed. What is
 * here says what adding does before it is asked for (where the copies go, how much room
 * they take, that nothing comes from the internet), follows the job while it runs, and
 * says how it turned out.
 */
import {
  ARCHIVE_ADD_JOB,
  type ArchiveAddPlan,
  type ArchiveAddResult,
  type ArchiveAddScope,
  type ArchiveAddStatus,
  type ArchiveFileSizes,
  formatBytes,
  type JobDto,
  type StartArchiveAddResponse,
} from "@outpost/shared";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, CircleAlert, LibraryBig, Square, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { Notice } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/misc";
import { api, errorMessage } from "@/lib/api";
import { useServerConnection } from "@/lib/events";
import { notify } from "@/lib/notify";
import { cn, formatNumber, plural } from "@/lib/utils";

/** How long the account of an "add all" that went well stays on the screen without being asked for. */
const RECENT_MS = 30 * 60 * 1000;

const isActive = (job: JobDto | null | undefined) => job?.state === "queued" || job?.state === "running" || job?.state === "paused";

export function addResult(job: JobDto | null | undefined): ArchiveAddResult | undefined {
  const result = job?.result as Partial<ArchiveAddResult> | null | undefined;
  return result && typeof result.added === "number" && Array.isArray(result.failed) ? (result as ArchiveAddResult) : undefined;
}

// ── What the browser remembers: which finished job's account was put away ──

const dismissedKey = (collectionId: string) => `outpost.reader.added.${collectionId}`;

function readDismissed(collectionId: string): string | null {
  try {
    return window.localStorage.getItem(dismissedKey(collectionId));
  } catch {
    return null;
  }
}

function writeDismissed(collectionId: string, jobId: string): void {
  try {
    window.localStorage.setItem(dismissedKey(collectionId), jobId);
  } catch {
    // A browser that keeps nothing: the account comes back after a reload, which does no harm.
  }
}

// ── Data ──

/**
 * The "add all" of one collection: the one under way or the last that ended, and how to
 * start, stop and put it away. One that is under way is shown wherever the collection
 * is; how one turned out is shown only where it was asked for (`asked`: of the list of
 * documents, or of the files a page links to). With `enabled` false nothing is asked of
 * the server, for a place that has nothing to add.
 */
export function useAddAll(collectionId: string, asked: ArchiveAddResult["scope"], enabled = true) {
  const client = useQueryClient();
  const connected = useServerConnection();
  const status = useQuery({
    // Under "jobs", so that the server's word that a job moved refreshes it.
    queryKey: ["jobs", ARCHIVE_ADD_JOB, collectionId],
    queryFn: () => api.get<ArchiveAddStatus>(`/api/kiwix/books/${collectionId}/files/add-all`),
    select: (data) => data.job,
    // Only while that word cannot arrive, because the connection that carries it is down.
    refetchInterval: (query) => (!connected && isActive(query.state.data?.job) ? 1500 : false),
    retry: false,
    enabled,
  });
  const job = status.data ?? null;
  const [dismissed, setDismissed] = useState(() => readDismissed(collectionId));

  // Each file the job gets through changes what the lists around it should say.
  const step = job ? `${job.id}:${job.state}:${job.progress.current}` : "";
  // biome-ignore lint/correctness/useExhaustiveDependencies: the step is what changed; the rest is stable
  useEffect(() => {
    if (!step) return;
    void client.invalidateQueries({ queryKey: ["kiwix", "documents", collectionId] });
    for (const key of ["links", "documents"]) void client.invalidateQueries({ queryKey: [key] });
  }, [step]);

  const start = useMutation({
    mutationFn: (scope: ArchiveAddScope) => api.post<StartArchiveAddResponse>(`/api/kiwix/books/${collectionId}/files/add-all`, scope),
    onSuccess: (data) => {
      client.setQueryData<ArchiveAddStatus>(["jobs", ARCHIVE_ADD_JOB, collectionId], { job: data.job });
      void client.invalidateQueries({ queryKey: ["jobs"] });
      void client.invalidateQueries({ queryKey: ["kiwix", "documents", collectionId] });
      void client.invalidateQueries({ queryKey: ["links"] });
    },
  });
  const stop = useMutation({
    mutationFn: () => api.post(`/api/jobs/${job?.id}/cancel`),
    onSuccess: () => client.invalidateQueries({ queryKey: ["jobs"] }),
    onError: (error) => notify.error(errorMessage(error)),
  });

  const result = addResult(job);
  const trouble = job?.state === "failed" || Boolean(result && (result.stopped || result.failed.length + result.failedMore > 0));
  const recent = Boolean(job?.finishedAt && Date.now() - job.finishedAt < RECENT_MS);
  const here = !result || result.scope === asked;
  return {
    /** The job to show: under way, or ended and worth saying something about. */
    job: job && (isActive(job) || (here && job.id !== dismissed && (trouble || recent))) ? job : null,
    active: isActive(job),
    start,
    stop,
    dismiss: () => {
      if (!job) return;
      writeDismissed(collectionId, job.id);
      setDismissed(job.id);
    },
  };
}

export type AddAll = ReturnType<typeof useAddAll>;

/**
 * What an "add all" of this scope would do. Asking changes nothing. `key` tells one
 * scope, and one asker, from another; `fresh` asks again each time it is turned on,
 * for a figure of this moment such as free space.
 */
export function useAddPlan(
  collectionId: string,
  scope: ArchiveAddScope | null,
  key: unknown,
  options: { enabled?: boolean; fresh?: boolean } = {},
) {
  return useQuery({
    // Under the collection's documents, so that it is worked out again when one of them is added.
    queryKey: ["kiwix", "documents", collectionId, "plan", key],
    queryFn: () => {
      if (!scope) throw new Error("There is nothing to add.");
      return api.post<ArchiveAddPlan>(`/api/kiwix/books/${collectionId}/files/add-all/plan`, scope);
    },
    enabled: scope !== null && options.enabled !== false,
    retry: false,
    ...(options.fresh ? { staleTime: 0, gcTime: 0 } : {}),
  });
}

/** How large each of these files is, where the collection says. Asked for a part of the list at a time. */
export function useFileSizes(collectionId: string, groups: string[][]): Map<string, number> {
  const answers = useQueries({
    queries: groups.map((paths) => ({
      queryKey: ["kiwix", "sizes", collectionId, paths],
      queryFn: () => api.post<ArchiveFileSizes>(`/api/kiwix/books/${collectionId}/files/sizes`, { paths }),
      enabled: paths.length > 0,
      staleTime: Number.POSITIVE_INFINITY,
      retry: false,
    })),
  });
  // The answers are told apart by when each arrived: the array holding them is new on every render.
  const arrived = answers.map((answer) => answer.dataUpdatedAt).join(",");
  // biome-ignore lint/correctness/useExhaustiveDependencies: see above
  return useMemo(() => {
    const sizes = new Map<string, number>();
    for (const answer of answers)
      for (const file of answer.data?.files ?? []) if (file.sizeBytes !== null) sizes.set(file.path, file.sizeBytes);
    return sizes;
  }, [arrived]);
}

// ── Words ──

/** "212 MB", or "at least 212 MB" when some of the files did not say how large they are. */
export function planSize(plan: Pick<ArchiveAddPlan, "bytes" | "unsized" | "count">): string | null {
  if (plan.unsized >= plan.count) return null;
  return `${plan.unsized > 0 ? "at least " : ""}${formatBytes(plan.bytes)}`;
}

/**
 * Which of the documents an "add all" would add, in a few words: "all 17", "these 3" when
 * a search has narrowed the list, "the other 14" when some are in the library already.
 */
export function whichOnes(count: number, already: number, narrowed: boolean): string {
  const n = formatNumber(count);
  if (already > 0) return count === 1 ? "the other one" : `the other ${n}`;
  if (narrowed) return count === 1 ? "this one" : `these ${n}`;
  return count === 1 ? "it" : `all ${n}`;
}

/** How a finished "add all" turned out, as a heading and the sentences under it. */
export function addOutcome(job: JobDto, noun: string): { tone: "success" | "warning" | "danger"; title: string; lines: string[] } {
  const result = addResult(job);
  if (!result) {
    return job.state === "cancelled"
      ? { tone: "warning", title: "Adding was stopped before it began", lines: ["Nothing was added."] }
      : {
          tone: "danger",
          title: "Adding stopped with an error",
          lines: [job.error ?? "Something went wrong.", "What had been added by then is in your library."],
        };
  }
  const failed = result.failed.length + result.failedMore;
  const lines: string[] = [];
  if (result.added > 0) {
    lines.push(
      `${result.added === 1 ? "It is" : "They are"} on “${result.locationName}” (${formatBytes(result.addedBytes)}) and ${result.added === 1 ? "stays" : "stay"} there if this collection is removed. ${result.added === 1 ? "Its" : "Their"} text is being read so that search finds it.`,
    );
  }
  if (result.already > 0) {
    lines.push(
      `${plural(result.already, noun)} ${result.already === 1 ? "was" : "were"} in your library already and ${result.already === 1 ? "was" : "were"} not copied again.`,
    );
  }
  const notReached = `${plural(result.notReached, noun)} ${result.notReached === 1 ? "was" : "were"} not reached.`;
  if (result.stopped === "cancelled") lines.push(notReached);
  else if (result.stopped) lines.push(`${result.stoppedReason ?? "It could not go on."} ${notReached}`);
  const added = `Added ${plural(result.added, noun)} to your library`;
  if (result.stopped) {
    const why = {
      cancelled: "",
      space: ": no room left",
      storage: ": the storage location could not be written to",
      unreadable: ": the collection could not be read",
    }[result.stopped];
    return { tone: "warning", title: `Stopped after ${formatNumber(result.added)} of ${plural(result.wanted, noun)}${why}`, lines };
  }
  if (failed > 0) {
    return {
      tone: "warning",
      title: result.added > 0 ? `${added}; ${formatNumber(failed)} could not be added` : `${plural(failed, noun)} could not be added`,
      lines,
    };
  }
  if (result.added === 0) return { tone: "success", title: "Nothing new was added", lines };
  return { tone: "success", title: added, lines };
}

// ── What is shown ──

/**
 * An "add all" while it runs, with how far it has got and a way to stop it; then how it
 * turned out. What it could not add is tried again by the button that started it, which
 * by then offers only what is left.
 */
export function AddAllStatus({
  addAll,
  noun = "document",
  className,
}: {
  addAll: AddAll;
  /** What one of the things being added is called here. */
  noun?: string;
  className?: string;
}) {
  const { job } = addAll;
  if (!job) return null;

  if (isActive(job)) {
    const { current, total, message } = job.progress;
    const waiting = job.state !== "running";
    return (
      <section aria-label="Adding to your library" className={cn("rounded-panel border border-border bg-surface px-4 py-3.5", className)}>
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="min-w-0 flex-1 basis-48">
            <h2 className="text-small font-semibold text-ink">
              Adding {noun}s to your library
              {total ? (
                <span className="tabular font-normal text-ink-muted">
                  {" "}
                  · {formatNumber(Math.min(current, total))} of {formatNumber(total)}
                </span>
              ) : null}
            </h2>
            <p className="truncate text-small text-ink-muted" aria-live="polite">
              {job.state === "queued" ? "Waiting to start" : job.state === "paused" ? "Paused" : (message ?? "Working")}
            </p>
          </div>
          <Button size="sm" className="max-md:h-11" onClick={() => addAll.stop.mutate()} loading={addAll.stop.isPending}>
            {addAll.stop.isPending ? null : <Square />} Stop
          </Button>
        </div>
        <Progress
          value={waiting || !total ? (waiting ? 0 : null) : current / total}
          tone={waiting ? "muted" : "lamp"}
          label={`Adding ${noun}s to your library`}
          className="mt-3"
        />
        <p className="mt-2 text-small text-ink-muted">
          You can leave this page; it carries on, and shows under Downloads. Stopping keeps what has been added.
        </p>
      </section>
    );
  }

  const outcome = addOutcome(job, noun);
  const result = addResult(job);
  return (
    <Notice
      className={className}
      tone={outcome.tone}
      icon={outcome.tone === "success" ? <Check /> : <CircleAlert />}
      title={outcome.title}
      action={
        <Button variant="ghost" size="icon-sm" aria-label="Dismiss" onClick={addAll.dismiss} className="-my-1 -mr-1.5">
          <X />
        </Button>
      }
    >
      {outcome.lines.map((line) => (
        <p key={line}>{line}</p>
      ))}
      {result && result.failed.length > 0 ? (
        <ul className="mt-2 grid gap-1.5" aria-label={`Could not be added`}>
          {result.failed.map((item) => (
            <li key={item.path}>
              <span className="font-medium [overflow-wrap:anywhere]">{item.title}</span>: {item.reason}
            </li>
          ))}
          {result.failedMore > 0 ? <li>And {plural(result.failedMore, "other")}.</li> : null}
        </ul>
      ) : null}
      {result && result.added > 0 ? (
        <p className="mt-2">
          <Link to="/library" className="font-medium text-primary underline decoration-1 underline-offset-[0.2em] hover:decoration-2">
            Open your documents
          </Link>
        </p>
      ) : null}
    </Notice>
  );
}

/** Says what is about to be copied, how much room it takes and where, and starts it. */
export function AddAllDialog({
  open,
  onOpenChange,
  collectionId,
  scope,
  planKey,
  narrowed,
  addAll,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  collectionId: string;
  scope: ArchiveAddScope;
  /** Tells one scope from another, for remembering its plan. */
  planKey: unknown;
  /** True when a search has narrowed the list, so that "these" is meant and not all of them. */
  narrowed: boolean;
  addAll: AddAll;
}) {
  // Asked again as the dialog opens: free space is of this moment.
  const plan = useAddPlan(collectionId, scope, ["asked", planKey], { enabled: open, fresh: true });
  const data = plan.data;
  const size = data ? planSize(data) : null;
  const place = data?.location;
  const count = data?.count ?? 0;
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset is stable; opening is what matters
  useEffect(() => {
    if (open) addAll.start.reset();
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? (
        <DialogContent
          title={
            data
              ? count > 0
                ? `Add ${narrowed ? "these " : ""}${plural(count, "document")} to your library?`
                : "Nothing to add"
              : "Add to your library"
          }
        >
          <DialogBody className="space-y-3 text-small leading-relaxed text-ink">
            {plan.isPending ? (
              <p className="text-ink-muted" aria-busy>
                Asking the collection how large they are…
              </p>
            ) : plan.isError ? (
              <p role="alert" className="text-danger">
                {errorMessage(plan.error)}
              </p>
            ) : count === 0 ? (
              <p>
                {data!.already > 0
                  ? `${data!.already === 1 ? "The one document here that can be added is" : `All ${formatNumber(data!.already)} documents here that can be added are`} in your library already.`
                  : "None of these is a PDF or an e-book, which are the kinds the library keeps."}
              </p>
            ) : (
              <>
                <p>
                  {count === 1 ? "It is" : "They are"} copied out of this collection
                  {place ? (
                    <>
                      {" "}
                      onto “{place.name}”
                      {size ? (
                        <>
                          : <span className="tabular font-medium">{size}</span>
                          {place.freeBytes !== null ? <span className="tabular">, of {formatBytes(place.freeBytes)} free</span> : null}
                        </>
                      ) : null}
                    </>
                  ) : null}
                  . Nothing is downloaded from the internet. The collection keeps its own copy, so this space is used a second time.
                </p>
                {data!.already > 0 ? (
                  <p className="text-ink-muted">
                    {plural(data!.already, "document")} {data!.already === 1 ? "is" : "are"} in your library already and will be left alone.
                  </p>
                ) : null}
                <p className="text-ink-muted">
                  The text of each is then read in turn, so that search finds it to the page: a few seconds for most, longer for a book.{" "}
                  {data!.ocrAuto
                    ? "Pages that are scans are read by OCR after that, which is much slower."
                    : "Pages that are scans are not read; a document that has some offers OCR on its own page."}
                </p>
                <p className="text-ink-muted">
                  It carries on if you close this page, and can be stopped here or under Downloads. What has been added stays in your
                  library, also if this collection is removed later.
                </p>
                {data!.refusal ? (
                  <Notice tone="warning" icon={<CircleAlert />} title="There is not room for them">
                    {data!.refusal}
                  </Notice>
                ) : null}
              </>
            )}
            {addAll.start.isError ? (
              <p role="alert" className="text-danger">
                {errorMessage(addAll.start.error)}
              </p>
            ) : null}
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              {count > 0 ? "Cancel" : "Close"}
            </Button>
            {count > 0 ? (
              <Button
                variant="primary"
                disabled={Boolean(data?.refusal)}
                loading={addAll.start.isPending}
                onClick={() => addAll.start.mutate(scope, { onSuccess: () => onOpenChange(false) })}
              >
                <LibraryBig /> Add {plural(count, "document")}
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

/**
 * Above a collection's list of documents: what "Add to library" does, the one action
 * that adds every document showing, and the adding that is under way or just ended.
 */
export function AddToLibraryPanel({ collectionId, query }: { collectionId: string; query: string }) {
  const [asking, setAsking] = useState(false);
  const addAll = useAddAll(collectionId, "list");
  const scope = useMemo<ArchiveAddScope>(() => (query ? { kind: "list", q: query } : { kind: "list" }), [query]);
  const plan = useAddPlan(collectionId, scope, ["shown", query]);
  const data = plan.data;
  // A collection of recordings only has nothing the library keeps, and nothing to explain.
  if (data && data.count + data.already === 0) return addAll.job ? <AddAllStatus addAll={addAll} className="mt-4" /> : null;

  const size = data ? planSize(data) : null;
  const place = data?.location;
  const count = data?.count ?? 0;
  const which = whichOnes(count, data?.already ?? 0, Boolean(query));
  return (
    <div className="mt-4">
      <p className="max-w-[62ch] text-small leading-relaxed text-ink-muted">
        <span className="font-medium text-ink">Add to library</span> copies a document out of this collection into your library
        {place ? ` on “${place.name}”` : ""}, where it is searched to the page and shows with your other documents. Nothing is downloaded
        from the internet.{" "}
        {data && count > 0 && size ? (
          <span className="tabular">
            The collection keeps its copy, so adding {which} uses {size} more
            {place?.freeBytes != null ? ` (${formatBytes(place.freeBytes)} free)` : ""}.
          </span>
        ) : data && count === 0 ? (
          <span>
            {data.already === 1
              ? "The one here that can be added is"
              : `All ${formatNumber(data.already)} ${query ? "showing" : "here"} are`}{" "}
            in your library, and stay{data.already === 1 ? "s" : ""} there if this collection is removed.
          </span>
        ) : (
          "The collection keeps its copy, so the space is used a second time."
        )}
      </p>
      {addAll.job ? <AddAllStatus addAll={addAll} className="mt-3" /> : null}
      {count > 0 && !addAll.active ? (
        <div className="mt-3">
          <Button variant="secondary" onClick={() => setAsking(true)}>
            <LibraryBig /> Add {which} to library
          </Button>
        </div>
      ) : null}
      <AddAllDialog
        open={asking}
        onOpenChange={setAsking}
        collectionId={collectionId}
        scope={scope}
        planKey={query}
        narrowed={Boolean(query)}
        addAll={addAll}
      />
    </div>
  );
}
