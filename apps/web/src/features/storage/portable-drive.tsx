/**
 * Portable drives: take Outpost and part of the library away on a USB disk that starts
 * with a double-click on another computer. Three steps, because it is a sequence:
 * where it goes, what goes on it, then a look at exactly what will be written.
 */
import {
  type CollectionsResponse,
  type DocumentFacets,
  formatBytes,
  type JobDto,
  type PortablePlan,
  type PortablePlatform,
  type PortableRequest,
  type PortableStatus,
} from "@outpost/shared";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Check, CircleAlert, CircleCheck, TriangleAlert, Usb } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Notice, Section } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Checkbox, Progress, Skeleton, Switch } from "@/components/ui/misc";
import { api, errorMessage } from "@/lib/api";
import { cn, formatDate, plural } from "@/lib/utils";
import { FolderPicker, type PickedFolder } from "./folder-picker";

const steps = ["Where", "What to take", "Check and write"] as const;

function StepList({ current }: { current: number }) {
  return (
    <ol className="flex flex-wrap items-center gap-x-5 gap-y-1 border-b border-border px-5 py-3 text-small">
      {steps.map((label, index) => (
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
            {index < current ? <Check className="size-3" strokeWidth={3} /> : index + 1}
          </span>
          {label}
        </li>
      ))}
    </ol>
  );
}

function CheckRow({
  id,
  checked,
  disabled,
  onChange,
  title,
  detail,
  trailing,
}: {
  id: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
  title: string;
  detail?: string;
  trailing?: string;
}) {
  return (
    <li className="flex items-start gap-3 py-2.5">
      <Checkbox id={id} checked={checked} disabled={disabled} onCheckedChange={(value) => onChange(value === true)} className="mt-0.5" />
      <label htmlFor={id} className={cn("min-w-0 flex-1", disabled && "opacity-55")}>
        <span className="block text-small font-medium text-ink">{title}</span>
        {detail ? <span className="block text-small text-ink-muted">{detail}</span> : null}
      </label>
      {trailing ? <span className="tabular shrink-0 text-small text-ink-muted">{trailing}</span> : null}
    </li>
  );
}

function Fact({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-6 border-b border-border py-2 last:border-b-0">
      <dt className="text-small text-ink-muted">{label}</dt>
      <dd className={cn("tabular text-right text-small text-ink", strong && "font-semibold")}>{value}</dd>
    </div>
  );
}

function Wizard({ status, onClose }: { status: PortableStatus; onClose: () => void }) {
  const [step, setStep] = useState(0);
  const [folder, setFolder] = useState<PickedFolder>({ path: undefined, writable: false });
  const [platforms, setPlatforms] = useState<PortablePlatform[]>(() => (status.thisComputer ? [status.thisComputer] : ["win-x64"]));
  const [allDocuments, setAllDocuments] = useState(true);
  const [collectionIds, setCollectionIds] = useState<string[]>([]);
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [jobId, setJobId] = useState<string>();

  const collections = useQuery({ queryKey: ["collections", "all"], queryFn: () => api.get<CollectionsResponse>("/api/collections") });
  const facets = useQuery({ queryKey: ["documents", "facets"], queryFn: () => api.get<DocumentFacets>("/api/documents/facets") });

  const installed = collections.data?.collections ?? [];
  // Reference collections are only readable with kiwix-serve beside them.
  const takesReference = installed.some((item) => item.kind === "zim" && collectionIds.includes(item.id));
  const request = useMemo<PortableRequest>(
    () => ({
      targetPath: folder.path ?? "",
      platforms,
      collectionIds,
      documents: allDocuments ? "all" : "none",
      reader: takesReference,
      replaceExisting,
    }),
    [folder.path, platforms, collectionIds, allDocuments, takesReference, replaceExisting],
  );

  const plan = useQuery({
    queryKey: ["portable", "plan", request],
    queryFn: () => api.post<PortablePlan>("/api/portable/plan", request),
    enabled: step === 2 && Boolean(folder.path) && !jobId,
    staleTime: 0,
    gcTime: 0,
  });

  const start = useMutation({
    mutationFn: () => api.post<{ job: JobDto }>("/api/portable/build", request),
    onSuccess: (data) => setJobId(data.job.id),
  });

  const job = useQuery({
    queryKey: ["jobs", "detail", jobId],
    queryFn: () => api.get<{ job: JobDto }>(`/api/jobs/${jobId}`),
    enabled: Boolean(jobId),
    select: (data) => data.job,
    refetchInterval: (query) => (["succeeded", "failed", "cancelled"].includes(query.state.data?.job.state ?? "") ? false : 1500),
  });
  const cancel = useMutation({ mutationFn: () => api.post(`/api/jobs/${jobId}/cancel`) });

  const toggle = <T,>(list: T[], value: T, on: boolean) => (on ? [...new Set([...list, value])] : list.filter((item) => item !== value));
  const data = plan.data;
  const blocked = !data || data.problems.length > 0 || (data.target.isOutpostDrive && !replaceExisting);

  // ── While writing, and afterwards ──
  if (jobId) {
    const current = job.data;
    const fraction = current?.progress.total ? current.progress.current / current.progress.total : undefined;
    const finished = current?.state === "succeeded";
    const stopped = current?.state === "failed" || current?.state === "cancelled";
    return (
      <>
        <DialogBody className="grid gap-5">
          {finished ? (
            <>
              <Notice tone="success" icon={<CircleCheck />} title="The drive is ready">
                Eject it before unplugging it. On another computer, open the folder and start Outpost:
              </Notice>
              <dl>
                <Fact label="Mac" value="Double-click “Start Outpost.command”" />
                <Fact label="Windows" value="Double-click “Start Outpost.bat”" />
                <Fact label="Linux" value="Run “sh start-outpost.sh” in a terminal" />
              </dl>
              <p className="text-small text-ink-muted">
                A README on the drive repeats this. Notes and documents added while running from the drive are saved on the drive; they are
                not sent back here.
              </p>
            </>
          ) : stopped ? (
            <Notice
              tone="danger"
              icon={<CircleAlert />}
              title={current?.state === "cancelled" ? "Writing was cancelled" : "The drive could not be finished"}
            >
              {current?.error ?? "Files already copied are still on the drive. Writing it again continues from there."}
            </Notice>
          ) : (
            <div>
              <div className="mb-2 flex items-baseline justify-between gap-4">
                <p className="text-small font-medium text-ink">{current?.progress.message ?? "Getting ready"}</p>
                {current?.progress.total ? (
                  <p className="tabular text-small text-ink-muted">
                    {formatBytes(current.progress.current)} of {formatBytes(current.progress.total)}
                  </p>
                ) : null}
              </div>
              <Progress value={fraction} tone="lamp" label="Writing the drive" />
              <p className="mt-3 text-small text-ink-muted">
                Keep the drive plugged in. You can close this window; the work carries on and shows under Downloads.
              </p>
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          {finished || stopped ? (
            <Button variant="primary" onClick={onClose}>
              Done
            </Button>
          ) : (
            <>
              <Button onClick={() => cancel.mutate()} loading={cancel.isPending}>
                Cancel writing
              </Button>
              <Button onClick={onClose}>Close</Button>
            </>
          )}
        </DialogFooter>
      </>
    );
  }

  return (
    <>
      <StepList current={step} />
      <DialogBody className="grid gap-5">
        {step === 0 ? (
          <>
            <FolderPicker label="Folder on the drive" onChange={setFolder} newFolderSuggestion="Outpost" />
            <p className="text-small text-ink-muted">
              Choose an empty folder, make a new one, or pick a folder that is already an Outpost drive to update it. Outpost writes only
              inside this folder. exFAT is the best format for a drive used on Mac, Windows and Linux.
            </p>
          </>
        ) : null}

        {step === 1 ? (
          <>
            <fieldset>
              <legend className="text-small font-semibold text-ink">Computers it should start on</legend>
              <p className="mt-0.5 text-small text-ink-muted">
                Each adds a small program that runs Outpost there, about 50 MB to download once and 110 MB on the drive.
              </p>
              <ul className="mt-1 divide-y divide-border border-y border-border">
                {status.platforms.map((item) => (
                  <CheckRow
                    key={item.platform}
                    id={`platform-${item.platform}`}
                    checked={platforms.includes(item.platform)}
                    onChange={(on) => setPlatforms((list) => toggle(list, item.platform, on))}
                    title={item.platform === status.thisComputer ? `${item.label} (like this one)` : item.label}
                    trailing={item.cached ? "Ready" : `Downloads from ${status.runtimeSource}`}
                  />
                ))}
              </ul>
            </fieldset>

            <fieldset>
              <legend className="text-small font-semibold text-ink">What goes on it</legend>
              <p className="mt-0.5 text-small text-ink-muted">Your notes, tags, saved places and settings always come along.</p>
              <div className="mt-3 flex items-center justify-between gap-4 border-y border-border py-2.5">
                <span id="portable-documents">
                  <span className="block text-small font-medium text-ink">All documents</span>
                  <span className="block text-small text-ink-muted">
                    {facets.data ? `${plural(facets.data.total, "document")}, ${formatBytes(facets.data.totalBytes)}` : "Counting…"}
                  </span>
                </span>
                <Switch checked={allDocuments} onCheckedChange={setAllDocuments} aria-labelledby="portable-documents" />
              </div>

              {collections.isPending ? (
                <div className="mt-3 grid gap-2" aria-busy>
                  <Skeleton />
                  <Skeleton className="w-2/3" />
                </div>
              ) : installed.length === 0 ? (
                <p className="mt-3 text-small text-ink-muted">
                  No collections or maps are installed yet. You can make a drive now and update it after downloading some.
                </p>
              ) : (
                <>
                  <div className="mt-4 flex items-baseline justify-between gap-4">
                    <span className="text-small font-medium text-ink">Collections and maps</span>
                    <button
                      type="button"
                      className="text-small text-primary underline underline-offset-2"
                      onClick={() =>
                        setCollectionIds(
                          collectionIds.length === installed.length
                            ? []
                            : installed.filter((item) => item.locationAvailable).map((item) => item.id),
                        )
                      }
                    >
                      {collectionIds.length === installed.length ? "Choose none" : "Choose all"}
                    </button>
                  </div>
                  <ul className="mt-1 divide-y divide-border border-y border-border">
                    {installed.map((item) => (
                      <CheckRow
                        key={item.id}
                        id={`collection-${item.id}`}
                        checked={collectionIds.includes(item.id)}
                        disabled={!item.locationAvailable || item.status !== "installed"}
                        onChange={(on) => setCollectionIds((list) => toggle(list, item.id, on))}
                        title={item.title}
                        detail={
                          !item.locationAvailable
                            ? `On ${item.locationName}, which is not connected`
                            : item.status !== "installed"
                              ? `Not available: ${item.status}`
                              : undefined
                        }
                        trailing={formatBytes(item.sizeBytes)}
                      />
                    ))}
                  </ul>
                </>
              )}
            </fieldset>
          </>
        ) : null}

        {step === 2 ? (
          plan.isPending ? (
            <div className="grid gap-2" aria-busy>
              <Skeleton className="h-9" />
              <Skeleton className="h-9" />
              <Skeleton className="h-9" />
            </div>
          ) : plan.isError ? (
            <Notice tone="danger" icon={<CircleAlert />} title="This folder cannot be used">
              {errorMessage(plan.error)}
            </Notice>
          ) : data ? (
            <>
              <dl>
                <Fact label="Folder" value={data.target.path} />
                <Fact label="Starts on" value={data.runtimes.map((runtime) => runtime.label).join(", ")} />
                <Fact
                  label="Documents"
                  value={
                    data.documents.count === 0
                      ? "None"
                      : `${plural(data.documents.count, "document")}, ${formatBytes(data.documents.bytes)}`
                  }
                />
                <Fact
                  label="Collections and maps"
                  value={
                    data.collections.length === 0
                      ? "None"
                      : `${data.collections.length}, ${formatBytes(data.collections.reduce((sum, item) => sum + item.bytes, 0))}`
                  }
                />
                {data.reader.length > 0 ? (
                  <Fact
                    label="Reader for reference collections"
                    value={
                      data.reader.some((item) => item.supported)
                        ? `Included for ${data.reader
                            .filter((item) => item.supported)
                            .map((item) => item.label)
                            .join(", ")}`
                        : "Not available for the chosen computers"
                    }
                  />
                ) : null}
                <Fact label="Still to write" value={formatBytes(data.bytesToWrite)} strong />
                <Fact label="Free on the drive" value={formatBytes(data.target.freeBytes)} />
              </dl>
              {data.problems.map((problem) => (
                <Notice key={problem} tone="danger" icon={<CircleAlert />}>
                  {problem}
                </Notice>
              ))}
              {data.warnings.map((warning) => (
                <Notice key={warning} tone="warning" icon={<TriangleAlert />}>
                  {warning}
                </Notice>
              ))}
              {data.target.isOutpostDrive ? (
                <div className="flex items-start gap-3 rounded-panel border border-border p-3.5">
                  <Checkbox
                    id="replace-existing"
                    checked={replaceExisting}
                    onCheckedChange={(value) => setReplaceExisting(value === true)}
                    className="mt-0.5"
                  />
                  <label htmlFor="replace-existing" className="text-small text-ink">
                    <span className="font-medium">Replace the notes and library index on this drive</span>
                    <span className="mt-0.5 block text-ink-muted">
                      It was last written on {data.target.lastWritten ? formatDate(Date.parse(data.target.lastWritten)) : "an earlier date"}
                      . Anything added while running from the drive since then is not merged; what the drive holds now is moved into a dated
                      folder on the drive, not deleted.
                    </span>
                  </label>
                </div>
              ) : null}
              {start.isError ? <Notice tone="danger">{errorMessage(start.error)}</Notice> : null}
            </>
          ) : null
        ) : null}
      </DialogBody>
      <DialogFooter className="justify-between">
        <Button variant="ghost" onClick={step === 0 ? onClose : () => setStep(step - 1)}>
          {step === 0 ? "Cancel" : "Back"}
        </Button>
        {step < 2 ? (
          <Button
            variant="primary"
            disabled={step === 0 ? !folder.path || !folder.writable : platforms.length === 0}
            onClick={() => setStep(step + 1)}
          >
            Continue
          </Button>
        ) : (
          <Button variant="primary" disabled={blocked} loading={start.isPending} onClick={() => start.mutate()}>
            Write drive
          </Button>
        )}
      </DialogFooter>
    </>
  );
}

export function PortableDriveSection() {
  const [open, setOpen] = useState(false);
  const status = useQuery({ queryKey: ["portable", "status"], queryFn: () => api.get<PortableStatus>("/api/portable/status") });

  // A fresh wizard each time it is opened.
  const [session, setSession] = useState(0);
  useEffect(() => {
    if (open) setSession((value) => value + 1);
  }, [open]);

  return (
    <Section
      title="Take it with you"
      description="Put Outpost and part of your library on a USB drive that runs on another computer with nothing to install."
    >
      <div className="flex max-w-[70ch] flex-wrap items-start gap-x-6 gap-y-3">
        <p className="min-w-64 flex-1 text-small text-ink-muted">
          {status.data?.runningFromDrive
            ? "This Outpost is running from a portable drive. You can make another drive from it."
            : "The drive holds its own copy of the app, your notes, and the documents, collections and maps you choose. Plug it in, double-click, and it opens in the browser, with no network needed."}
        </p>
        <Button onClick={() => setOpen(true)} disabled={!status.data}>
          <Usb /> Make a portable drive
        </Button>
      </div>
      {status.data && !status.data.packagedAppAvailable ? (
        <Notice tone="info" className="mt-4 max-w-[70ch]">
          This Outpost is running from source code, so it has no packaged app to copy yet. Run{" "}
          <span className="font-mono text-[0.8125rem]">node scripts/build-app.mjs</span> once, then come back.
        </Notice>
      ) : null}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Make a portable drive" size="lg">
          {status.data ? <Wizard key={session} status={status.data} onClose={() => setOpen(false)} /> : null}
        </DialogContent>
      </Dialog>
    </Section>
  );
}
