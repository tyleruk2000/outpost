/**
 * The three clean-ups, from the one that loses nothing to the one that loses everything.
 * Each says exactly what it removes and what it keeps, shows the real figures, and
 * waits for a confirmation that repeats them.
 */
import { type CleanupStatus, type DerivedStep, ERASE_CONFIRMATION, formatBytes } from "@outpost/shared";
import { CircleAlert, MonitorSmartphone } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Notice } from "@/components/page";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Checkbox, Skeleton } from "@/components/ui/misc";
import { errorMessage } from "@/lib/api";
import { plural } from "@/lib/utils";
import { useEraseEverything, usePlan, useRebuild, useRemoveDownloaded } from "./manage-data";
import { personalWords, planSentences, tallyText } from "./manage-text";
import { FileList, PlanSkeleton, PlanTables, RefusedNotice } from "./plan-summary";

function Rung({
  title,
  summary,
  removes,
  keeps,
  children,
}: {
  title: string;
  summary: string;
  removes: ReactNode[];
  keeps: ReactNode[];
  children: ReactNode;
}) {
  const id = `rung-${title.replace(/\W+/g, "-").toLowerCase()}`;
  return (
    <section aria-labelledby={id} className="grid gap-x-10 gap-y-4 border-t border-border py-8 first:border-t-0 lg:grid-cols-[17rem_1fr]">
      <div>
        <h2 id={id} className="text-lead font-semibold text-ink">
          {title}
        </h2>
        <p className="mt-1 text-small text-pretty text-ink-muted">{summary}</p>
      </div>
      <div className="grid max-w-[44rem] gap-4">
        <div className="grid gap-x-8 gap-y-3 text-small sm:grid-cols-2">
          <div>
            <h3 className="font-semibold text-ink">Removes</h3>
            <ul className="mt-1 grid gap-1 text-pretty text-ink">
              {removes.map((line, index) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: a fixed list of sentences
                <li key={index}>{line}</li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="font-semibold text-ink">Keeps</h3>
            <ul className="mt-1 grid gap-1 text-pretty text-ink-muted">
              {keeps.map((line, index) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: a fixed list of sentences
                <li key={index}>{line}</li>
              ))}
            </ul>
          </div>
        </div>
        {children}
      </div>
    </section>
  );
}

// ── Remove all downloaded content ──

function DownloadedSteps({ onClose }: { onClose: () => void }) {
  const [forget, setForget] = useState(false);
  const disconnected = forget ? "forget" : "leave";
  const plan = usePlan({ scope: "downloaded", disconnected });
  const remove = useRemoveDownloaded();
  const data = plan.data;
  const nothing = data ? data.changes === 0 && data.downloads.count === 0 : false;
  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(event) => {
        event.preventDefault();
        remove.mutate({ disconnected }, { onSuccess: onClose });
      }}
    >
      <DialogBody className="grid gap-4">
        {plan.isPending ? (
          <PlanSkeleton />
        ) : plan.isError ? (
          <Notice tone="danger" icon={<CircleAlert />}>
            {errorMessage(plan.error)}
          </Notice>
        ) : data ? (
          <>
            <div className="grid gap-1.5 text-small text-ink">
              {nothing ? (
                <p>There is no downloaded content to remove.</p>
              ) : (
                planSentences(data, { files: "delete", disconnected }).map((line) => <p key={line}>{line}</p>)
              )}
              {nothing ? null : (
                <p className="text-ink-muted">
                  This deletes files because you are asking it to. All of it came from the catalogue or a download and can be fetched again;
                  nothing of your own is touched.
                </p>
              )}
            </div>
            <PlanTables plan={data} />
            {data.disconnected.count > 0 ? (
              <div className="rounded-panel bg-warning-soft px-4 py-3 text-small">
                <p className="font-semibold text-warning">{tallyText(data.disconnected)} on a location that is not connected</p>
                <p className="mt-0.5 text-ink">
                  These files cannot be deleted from here and will be left behind, still listed in your library.
                </p>
                <FileList
                  files={data.disconnected.files.slice(0, 5)}
                  more={data.disconnected.count - Math.min(5, data.disconnected.files.length)}
                />
                <label htmlFor="forget-disconnected" className="mt-3 flex cursor-pointer items-start gap-2.5 text-ink">
                  <Checkbox
                    id="forget-disconnected"
                    checked={forget}
                    onCheckedChange={(checked) => setForget(checked === true)}
                    className="mt-0.5"
                  />
                  <span>Forget them as well. Outpost's records are removed; the files stay on the drive.</span>
                </label>
              </div>
            ) : null}
            <RefusedNotice refused={data.refused} />
          </>
        ) : null}
        {remove.isError ? (
          <Notice tone="danger" icon={<CircleAlert />}>
            {errorMessage(remove.error)}
          </Notice>
        ) : null}
      </DialogBody>
      <DialogFooter>
        <Button onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="danger" loading={remove.isPending} disabled={!data || nothing}>
          Remove downloaded content
        </Button>
      </DialogFooter>
    </form>
  );
}

// ── Clear and rebuild search data ──

function DerivedRung({ status, busy }: { status: CleanupStatus; busy: boolean }) {
  const { vectors, documents, reclaimableBytes, databaseBytes } = status.derived;
  const [steps, setSteps] = useState<ReadonlySet<DerivedStep>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const rebuild = useRebuild();
  const readable = documents.count - documents.unreachable;
  const choices: Array<{ step: DerivedStep; title: string; detail: string; disabled: boolean }> = [
    {
      step: "vectors",
      title: `Clear semantic vectors (${plural(vectors.count, "vector")}, about ${formatBytes(vectors.bytes)})`,
      detail:
        "Search by meaning finds nothing until they are built again from Settings, which means running every passage through the model once more. Keyword search is unaffected.",
      disabled: vectors.count === 0,
    },
    {
      step: "text",
      title: `Read the text of every document again (${plural(readable, "document")})`,
      detail: `Rebuilds extracted text and search passages from the original files, one document at a time. Each stays searchable by its old text until its new text is in, and text already read by OCR is kept.${documents.unreachable > 0 ? ` ${plural(documents.unreachable, "document")} on a location that is not connected will be skipped.` : ""}`,
      disabled: readable === 0,
    },
    {
      step: "compact",
      title: `Compact the database (${formatBytes(reclaimableBytes)} to give back, of ${formatBytes(databaseBytes)})`,
      detail:
        "Deleting things leaves empty space inside the database file. Compacting hands it back to the disk. Outpost stops answering while it runs: about a second for every 100 MB.",
      disabled: false,
    },
  ];
  return (
    <>
      <fieldset className="grid gap-3">
        <legend className="sr-only">What to clear or rebuild</legend>
        {choices.map((choice) => (
          <label key={choice.step} htmlFor={`derived-${choice.step}`} className="flex items-start gap-3 text-small">
            <Checkbox
              id={`derived-${choice.step}`}
              className="mt-0.5"
              disabled={choice.disabled}
              checked={steps.has(choice.step)}
              onCheckedChange={(checked) =>
                setSteps((current) => {
                  const next = new Set(current);
                  if (checked === true) next.add(choice.step);
                  else next.delete(choice.step);
                  return next;
                })
              }
            />
            <span>
              <span className={choice.disabled ? "font-medium text-ink-muted" : "font-medium text-ink"}>{choice.title}</span>
              <span className="block text-pretty text-ink-muted">{choice.detail}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <div>
        <Button onClick={() => setConfirming(true)} disabled={steps.size === 0 || busy}>
          Clear and rebuild
        </Button>
      </div>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Clear and rebuild search data?"
        description={
          <ul className="grid gap-1.5">
            {choices
              .filter((choice) => steps.has(choice.step))
              .map((choice) => (
                <li key={choice.step}>
                  <span className="font-medium text-ink">{choice.title}.</span> {choice.detail}
                </li>
              ))}
          </ul>
        }
        confirmLabel="Clear and rebuild"
        confirmVariant="primary"
        loading={rebuild.isPending}
        onConfirm={() =>
          rebuild.mutate([...steps], {
            onSuccess: () => {
              setConfirming(false);
              setSteps(new Set());
            },
          })
        }
      >
        {rebuild.isError ? <Notice tone="danger">{errorMessage(rebuild.error)}</Notice> : null}
      </ConfirmDialog>
    </>
  );
}

// ── Erase everything ──

function EraseSteps({ onClose }: { onClose: () => void }) {
  const plan = usePlan({ scope: "everything" });
  const erase = useEraseEverything();
  const [typed, setTyped] = useState("");
  const data = plan.data;
  const ready = typed.trim().toLowerCase() === ERASE_CONFIRMATION;
  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(event) => {
        event.preventDefault();
        if (ready) erase.mutate(typed, { onSuccess: onClose });
      }}
    >
      <DialogBody className="grid gap-4">
        {plan.isPending ? (
          <PlanSkeleton />
        ) : plan.isError ? (
          <Notice tone="danger" icon={<CircleAlert />}>
            {errorMessage(plan.error)}
          </Notice>
        ) : data ? (
          <>
            <div className="grid gap-1.5 text-small text-ink">
              <p>
                <span className="font-semibold">This cannot be undone.</span> It deletes files and erases your own work because you are
                asking it to.
              </p>
              {planSentences(data, { files: "delete", disconnected: "forget" }).map((line) => (
                <p key={line}>{line}</p>
              ))}
              {data.personal ? <p>{personalWords(data.personal)}</p> : null}
            </div>
            <PlanTables plan={data} />
            {data.disconnected.count + data.outside.count > 0 ? (
              <div className="rounded-panel bg-warning-soft px-4 py-3 text-small">
                <p className="font-semibold text-warning">
                  {plural(data.disconnected.count + data.outside.count, "file")} will be left where they are
                </p>
                <p className="mt-0.5 text-ink">
                  Outpost forgets these but does not delete them: they are on a location that is not connected, or outside the folders
                  Outpost itself made. Delete them by hand if you want them gone.
                </p>
                <FileList
                  files={[...data.disconnected.files, ...data.outside.files].slice(0, 8)}
                  more={
                    data.disconnected.count + data.outside.count - Math.min(8, data.disconnected.files.length + data.outside.files.length)
                  }
                />
              </div>
            ) : null}
            <div className="rounded-panel border border-border px-4 py-3 text-small">
              <p className="font-semibold text-ink">Make a backup first</p>
              <p className="mt-0.5 text-ink-muted">
                A backup holds your notes, their attachments, saved places, routes, contacts, chat conversations, repeaters, radio plans and
                logged contacts, supplies, and settings, and can be restored afterwards. It does not hold the files of documents you added:
                copy those yourself from the documents folder of each storage location if you want to keep them.
              </p>
              <Button asChild size="sm" className="mt-2.5">
                <a href="/api/backup/download" download>
                  Download a backup
                </a>
              </Button>
            </div>
            <Field label={`Type “${ERASE_CONFIRMATION}” to confirm`}>
              {(ids) => (
                <Input
                  {...ids}
                  value={typed}
                  onChange={(event) => setTyped(event.target.value)}
                  autoComplete="off"
                  autoCapitalize="off"
                  spellCheck={false}
                />
              )}
            </Field>
          </>
        ) : null}
        {erase.isError ? (
          <Notice tone="danger" icon={<CircleAlert />}>
            {errorMessage(erase.error)}
          </Notice>
        ) : null}
      </DialogBody>
      <DialogFooter>
        <Button onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="danger" loading={erase.isPending} disabled={!data || !ready}>
          Erase everything
        </Button>
      </DialogFooter>
    </form>
  );
}

export default function CleanupView({ status, loading }: { status: CleanupStatus | undefined; loading: boolean }) {
  const [removing, setRemoving] = useState(false);
  const [erasing, setErasing] = useState(false);
  if (loading || !status) {
    return loading ? (
      <div className="mt-6 grid gap-3" aria-busy>
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
      </div>
    ) : null;
  }
  const busy = status.active !== null;

  return (
    <div className="mt-2">
      {busy ? (
        <Notice className="mt-4" tone="info">
          A clean-up is under way. Another can be started when it has finished.
        </Notice>
      ) : null}

      <Rung
        title="Remove all downloaded content"
        summary="Frees the most space and loses nothing that cannot be fetched again."
        removes={[
          "Reference archives, maps, terrain and place names",
          "Catalogue sheets and books, with the documents they are in your library",
          "Downloads still under way or left unfinished, with their partial files",
        ]}
        keeps={[
          "Documents you added, your notes, saved places, routes, contacts, chat conversations, repeaters, radio plans and logged contacts, and supplies",
          "Archives and maps of your own that you pointed Outpost at",
          "Settings, storage locations and network shares",
        ]}
      >
        <div>
          <Button onClick={() => setRemoving(true)} disabled={busy}>
            Remove downloaded content
          </Button>
          <p className="mt-2 text-small text-ink-muted">Shows exactly what will go, by kind and by location, before anything is removed.</p>
        </div>
      </Rung>

      <Rung
        title="Clear and rebuild search data"
        summary="What Outpost works out from your library. Nothing you keep is lost; rebuilding costs time."
        removes={["Only what you tick below: semantic vectors, extracted text (read again straight away), or empty space in the database"]}
        keeps={[
          "Every document, collection, note, place, contact, conversation, repeater and setting",
          "The originals the text is read from",
        ]}
      >
        <DerivedRung status={status} busy={busy} />
      </Rung>

      <Rung
        title="Erase everything and start again"
        summary="The only clean-up that destroys things that cannot be downloaded again."
        removes={[
          "Everything the first clean-up removes",
          "Documents you added, files and all",
          "Your notes and their attachments, saved places, routes, contacts and settings",
          "Every chat conversation, and every repeater: the lists you imported and the ones you added or changed",
          "History, search data, and copies of earlier data set aside by a restore",
        ]}
        keeps={[
          "Storage locations, their marker files, network shares and remembered passwords",
          "Any file outside the folders Outpost made, and everything on a location that is not connected (it says where they are)",
          "Catalogue manifests of your own, and programs fetched for portable drives",
          "Backups already made on a storage location by automatic backups; they hold the notes being erased, so delete them in Settings first if you want them gone",
        ]}
      >
        {status.erase.allowed ? (
          <div>
            <Button variant="danger" onClick={() => setErasing(true)} disabled={busy}>
              Erase everything
            </Button>
            <p className="mt-2 text-small text-ink-muted">
              {status.erase.reason === "option"
                ? `Offered on every device because Outpost was started with ${status.erase.option}=true.`
                : "Offered here because you are at the computer Outpost runs on."}{" "}
              Asks you to type a phrase, and offers a backup first.
            </p>
          </div>
        ) : (
          <Notice tone="info" icon={<MonitorSmartphone />} title="Not offered on this device">
            <p>
              Outpost has no accounts, so it cannot tell who is asking. Erasing your own things can only be started at the computer Outpost
              runs on. Open Outpost there to do it.
            </p>
            <p className="mt-1 text-ink-muted">
              Whoever starts Outpost can allow it from every device by starting it with{" "}
              <span className="font-mono text-[0.8125rem]">{status.erase.option}=true</span>.
            </p>
          </Notice>
        )}
      </Rung>

      <Dialog open={removing} onOpenChange={setRemoving}>
        <DialogContent
          title="Remove all downloaded content"
          description="Read what will happen, then confirm. Nothing is removed until you do."
        >
          {removing ? <DownloadedSteps onClose={() => setRemoving(false)} /> : null}
        </DialogContent>
      </Dialog>
      <Dialog open={erasing} onOpenChange={setErasing}>
        <DialogContent title="Erase everything and start again" size="lg">
          {erasing ? <EraseSteps onClose={() => setErasing(false)} /> : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
