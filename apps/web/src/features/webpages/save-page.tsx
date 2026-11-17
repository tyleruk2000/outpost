/**
 * Save a web page: paste an address, look at what Outpost found there, save it.
 *
 * It is drawn in place, on the Library and on the Import screen, not in a dialog: the
 * address, what was found and the result are read together, and a save in progress
 * should not hold the rest of the screen hostage.
 *
 * Nothing is fetched until "Look at the page" is pressed, and that fetches the one page.
 * Pictures are fetched only on Save, and only if the box is ticked. A second copy of an
 * address is never made, and an earlier one never replaced, without a choice here.
 */
import type { JobDto, SavedCopy, SaveWebPageResult, WebPagePreview } from "@outpost/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, CircleAlert, CircleCheck, Info } from "lucide-react";
import { RadioGroup } from "radix-ui";
import { type FormEvent, type ReactNode, useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router";
import { Notice } from "@/components/page";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Checkbox, Progress, RadioItem } from "@/components/ui/misc";
import { ApiError, api, errorMessage } from "@/lib/api";
import { cn, formatDate, formatDateTime, formatNumber, plural } from "@/lib/utils";
import {
  creditLine,
  existingFrom,
  isFinished,
  keptLine,
  lookAtPage,
  picturesDetail,
  picturesLabel,
  refusalTitle,
  resultOf,
  savePage,
} from "./save-page-data";

const KEEP_BOTH = "keep-both";

/** One option of the choice about an earlier copy. Drawn as the Import screen draws its choices. */
function Choice({ value, title, detail }: { value: string; title: string; detail: string }) {
  const id = useId();
  return (
    <div className="flex items-start gap-3 py-2.5">
      <RadioItem id={id} value={value} aria-describedby={`${id}-detail`} />
      <label htmlFor={id} className="min-w-0 flex-1">
        <span className="block text-small font-medium text-ink">{title}</span>
        <span id={`${id}-detail`} className="block text-small text-ink-muted [overflow-wrap:anywhere]">
          {detail}
        </span>
      </label>
    </div>
  );
}

/** Asked whenever the address is already in the library. There is no default: the person decides. */
function EarlierCopies({ copies, value, onChange }: { copies: SavedCopy[]; value: string | undefined; onChange: (value: string) => void }) {
  const id = useId();
  const one = copies.length === 1;
  // Two copies made on one day are told apart by the time.
  const when = (copy: SavedCopy) => (one ? formatDate(copy.savedAt) : formatDateTime(copy.savedAt));
  return (
    <div className="mt-5">
      <p id={id} className="text-small font-semibold text-ink">
        This address is already in your library
      </p>
      <p id={`${id}-hint`} className="mt-0.5 text-small text-ink-muted">
        {one
          ? `You saved it on ${formatDate(copies[0]!.savedAt)}. Choose what happens to that copy.`
          : `You have ${copies.length} copies of it. Choose what happens to them.`}
      </p>
      <RadioGroup.Root
        value={value ?? ""}
        onValueChange={onChange}
        aria-labelledby={id}
        aria-describedby={`${id}-hint`}
        className="mt-1.5 divide-y divide-border border-y border-border"
      >
        <Choice
          value={KEEP_BOTH}
          title={one ? "Keep both" : "Keep them all"}
          detail={
            one
              ? "The earlier copy stays as it is, and this one is added beside it."
              : "The earlier copies stay as they are, and this one is added."
          }
        />
        {copies.slice(0, 5).map((copy) => (
          <Choice
            key={copy.documentId}
            value={copy.documentId}
            title={one ? "Replace the earlier copy" : `Replace the copy saved on ${when(copy)}`}
            detail={`“${copy.title}”, saved on ${when(copy)}, is deleted and this copy takes its place. Its tags and category are kept.`}
          />
        ))}
      </RadioGroup.Root>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="font-medium text-ink">{label}</dt>
      <dd className="min-w-0 max-w-[70ch] text-ink-muted">{children}</dd>
    </>
  );
}

/** What was found at the address, and the two choices there are before saving. */
function Found({
  preview,
  withPictures,
  onWithPictures,
  choice,
  onChoice,
}: {
  preview: WebPagePreview;
  withPictures: boolean;
  onWithPictures: (value: boolean) => void;
  choice: string | undefined;
  onChoice: (value: string) => void;
}) {
  const picturesId = useId();
  const credit = creditLine(preview);
  const redirected = preview.url !== preview.requestedUrl;
  return (
    <div className="mt-5 border-t border-border pt-5" data-testid="web-page-found">
      <h3 className="font-title text-lead break-words text-ink">{preview.title}</h3>
      {credit ? <p className="mt-0.5 text-small break-words text-ink-muted">{credit}</p> : null}
      <p className="mt-2.5 line-clamp-3 max-w-[70ch] text-small text-ink">{preview.excerpt}</p>

      <dl className="mt-4 grid gap-x-8 gap-y-2.5 text-small sm:grid-cols-[auto_minmax(0,1fr)]">
        <Fact label="From">
          <span className="font-mono text-[0.8125rem] break-all">{preview.url}</span>
          {redirected ? <span className="block">The address you gave leads here, and this is the address that is recorded.</span> : null}
        </Fact>
        <Fact label="Text">
          <span className="tabular">{plural(preview.words, "word")}</span>, with its headings, lists, tables and links. Scripts, styles,
          frames and forms are left behind.
        </Fact>
        <Fact label="Pictures">
          {preview.pictures.count === 0 ? (
            "None in the article that can be brought along."
          ) : (
            <span className="flex items-start gap-3">
              <Checkbox
                id={picturesId}
                checked={withPictures}
                onCheckedChange={(value) => onWithPictures(value === true)}
                aria-describedby={`${picturesId}-detail`}
                className="mt-0.5"
              />
              <span className="min-w-0">
                <label htmlFor={picturesId} className="block font-medium text-ink">
                  {picturesLabel(preview.pictures)}
                </label>
                <span id={`${picturesId}-detail`} className="block [overflow-wrap:anywhere]">
                  {picturesDetail(preview)}
                </span>
              </span>
            </span>
          )}
        </Fact>
      </dl>

      {preview.existing.length > 0 ? <EarlierCopies copies={preview.existing} value={choice} onChange={onChoice} /> : null}
    </div>
  );
}

/** Pictures that were not brought along, each with its reason, behind a line that says how many. */
function LeftOut({ result }: { result: SaveWebPageResult }) {
  const { skipped } = result.pictures;
  if (skipped.length === 0) return null;
  return (
    <details className="group mt-3 border-y border-border">
      <summary className="flex min-h-11 cursor-default items-center gap-2 py-2 text-small font-medium text-ink marker:content-none hover:text-primary [&::-webkit-details-marker]:hidden">
        <ChevronRight aria-hidden className="size-4 text-ink-muted transition-transform duration-150 group-open:rotate-90" />
        {plural(skipped.length, "picture")} {skipped.length === 1 ? "was" : "were"} left out
      </summary>
      <ul className="grid gap-2.5 pb-3">
        {skipped.map((picture) => (
          <li key={picture.url} className="text-small">
            <p className="text-ink">{picture.reason}</p>
            <p className="font-mono text-[0.8125rem] break-all text-ink-muted">{picture.url}</p>
          </li>
        ))}
      </ul>
    </details>
  );
}

function Saving({ job, onCancel, cancelling }: { job: JobDto | undefined; onCancel: () => void; cancelling: boolean }) {
  const { current = 0, total = null, message = null } = job?.progress ?? {};
  const waiting = !job || job.state === "queued";
  return (
    <div className="mt-5 border-t border-border pt-5" role="status">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4">
        <p className="text-small font-medium text-ink">{waiting ? "Waiting to save the page" : (message ?? "Saving the page")}</p>
        {total ? (
          <p className="tabular text-small text-ink-muted">
            {formatNumber(Math.min(current, total))} of {plural(total, "picture")}
          </p>
        ) : null}
      </div>
      <Progress value={waiting ? 0 : total ? current / total : null} tone={waiting ? "muted" : "lamp"} label="Saving the page" />
      <div className="mt-2 flex justify-end">
        <Button variant="ghost" size="sm" onClick={onCancel} loading={cancelling} className="-mr-2.5">
          Cancel
        </Button>
      </div>
    </div>
  );
}

function Outcome({ job, onAgain }: { job: JobDto; onAgain: () => void }) {
  const result = resultOf(job);
  const again = <Button onClick={onAgain}>Save another page</Button>;
  if (result) {
    const kept = keptLine(result);
    return (
      <div className="mt-5 border-t border-border pt-5">
        <Notice
          tone="success"
          icon={<CircleCheck />}
          title={result.replacedDocumentId ? "Saved in place of the earlier copy" : "Saved to your library"}
        >
          <span className="[overflow-wrap:anywhere]">“{result.title}” can now be read and searched with no connection.</span>
          {kept ? ` ${kept}` : ""}
        </Notice>
        {result.replaceError ? (
          <Notice tone="warning" icon={<CircleAlert />} title="The earlier copy is still in your library" className="mt-3">
            {result.replaceError}
          </Notice>
        ) : null}
        <LeftOut result={result} />
        <div className="mt-4 flex flex-wrap gap-2">
          <Button asChild variant="primary">
            <Link to={`/library/documents/${result.documentId}`}>Open the saved page</Link>
          </Button>
          {again}
        </div>
      </div>
    );
  }
  return (
    <div className="mt-5 border-t border-border pt-5">
      {job.state === "cancelled" ? (
        <Notice icon={<Info />} title="Saving was stopped">
          Nothing was kept.
        </Notice>
      ) : (
        <Notice tone="danger" icon={<CircleAlert />} title="This page was not saved">
          {job.error ?? "Something went wrong on the server."}
        </Notice>
      )}
      <div className="mt-4">{again}</div>
    </div>
  );
}

export function SaveWebPage({ className, autoFocus }: { className?: string; autoFocus?: boolean }) {
  const client = useQueryClient();
  const fieldId = useId();
  const looking = useRef<AbortController | null>(null);
  const [address, setAddress] = useState("");
  const [preview, setPreview] = useState<WebPagePreview>();
  const [withPictures, setWithPictures] = useState(true);
  const [choice, setChoice] = useState<string>();
  const [confirming, setConfirming] = useState(false);
  const [jobId, setJobId] = useState<string>();

  // Leaving the screen while a page is being looked at ends the look: nobody is waiting for it.
  useEffect(() => () => looking.current?.abort(), []);

  const look = useMutation({
    mutationFn: (url: string) => {
      looking.current?.abort();
      const controller = new AbortController();
      looking.current = controller;
      return lookAtPage(url, controller.signal);
    },
    onSuccess: (found) => {
      setPreview(found);
      setChoice(undefined);
      setWithPictures(found.pictures.count > 0);
    },
  });

  const save = useMutation({
    mutationFn: () => {
      if (!preview) throw new Error("There is no page to save yet.");
      return savePage({
        url: preview.requestedUrl,
        previewId: preview.previewId,
        pictures: withPictures && preview.pictures.count > 0,
        ...(choice === KEEP_BOTH ? { keepBoth: true } : choice ? { replaceDocumentId: choice } : {}),
      });
    },
    onSuccess: ({ job }) => {
      client.setQueryData(["jobs", "detail", job.id], { job });
      setConfirming(false);
      setJobId(job.id);
    },
    onError: (error) => {
      setConfirming(false);
      // Someone saved the same address in the meantime: the question is now asked.
      const existing = existingFrom(error);
      if (existing && preview) {
        setPreview({ ...preview, existing });
        setChoice(undefined);
      }
    },
  });

  const followed = useQuery({
    queryKey: ["jobs", "detail", jobId],
    queryFn: () => api.get<{ job: JobDto }>(`/api/jobs/${jobId}`),
    enabled: Boolean(jobId),
    select: (data) => data.job,
    // Job events refresh this too; the timer covers a dropped event connection.
    refetchInterval: (query) => (query.state.data && isFinished(query.state.data.job) ? false : 1000),
  });
  const job = jobId ? followed.data : undefined;
  const finished = job ? isFinished(job) : false;
  useEffect(() => {
    if (finished) void client.invalidateQueries({ queryKey: ["documents"] });
  }, [finished, client]);

  const cancel = useMutation({
    mutationFn: () => api.post(`/api/jobs/${jobId}/cancel`),
    onSettled: () => client.invalidateQueries({ queryKey: ["jobs"] }),
  });

  const startOver = () => {
    setJobId(undefined);
    setPreview(undefined);
    setChoice(undefined);
    setAddress("");
    look.reset();
    save.reset();
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const typed = address.trim();
    if (!typed || look.isPending) return;
    setPreview(undefined);
    save.reset();
    look.mutate(typed);
  };

  const stopLooking = () => {
    looking.current?.abort();
    look.reset();
  };

  const busy = Boolean(jobId);
  const replacing = preview?.existing.find((copy) => copy.documentId === choice);
  const undecided = Boolean(preview && preview.existing.length > 0 && !choice);
  // A mistyped address is the field's own error; anything else is about the page.
  const lookError = look.isError && !(look.error instanceof DOMException) ? look.error : undefined;
  const fieldError = lookError instanceof ApiError && lookError.code === "bad_request" ? lookError.message : undefined;
  const saveError = save.isError && !existingFrom(save.error) ? save.error : undefined;

  // What was found, or why nothing was, appears under the field: on a phone that is below the
  // fold and under the tab bar, so it is brought into view as it appears.
  const results = useRef<HTMLDivElement>(null);
  const showing = lookError && !fieldError ? "refused" : preview && !busy ? `found ${preview.previewId}` : busy ? `job ${finished}` : "";
  useEffect(() => {
    if (showing) results.current?.scrollIntoView({ block: "nearest" });
  }, [showing]);

  return (
    <div className={className}>
      <form onSubmit={submit} className="grid gap-1.5">
        <label htmlFor={fieldId} className="text-small font-medium text-ink">
          Address of the page
        </label>
        <div className="flex gap-2 max-sm:flex-col">
          <Input
            id={fieldId}
            autoFocus={autoFocus}
            type="text"
            inputMode="url"
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="https://example.org/an-article"
            value={address}
            disabled={busy}
            aria-invalid={fieldError ? true : undefined}
            aria-describedby={`${fieldId}-hint${fieldError ? ` ${fieldId}-error` : ""}`}
            onChange={(event) => {
              setAddress(event.target.value);
              // What was found belongs to the address it was found at.
              if (preview) setPreview(undefined);
              if (look.isError) look.reset();
            }}
            className="min-w-0 font-mono text-small sm:flex-1"
          />
          {look.isPending ? (
            <Button type="button" onClick={stopLooking}>
              Stop
            </Button>
          ) : (
            <Button type="submit" variant={preview ? "secondary" : "primary"} disabled={busy || !address.trim()}>
              Look at the page
            </Button>
          )}
        </div>
        {fieldError ? (
          <p id={`${fieldId}-error`} role="alert" className="text-small text-danger">
            {fieldError}
          </p>
        ) : null}
        <p id={`${fieldId}-hint`} className="max-w-[70ch] text-small text-ink-muted">
          Outpost fetches this one page and nothing it links to, and keeps nothing until you save. It is a copy for your own reading: the
          page still belongs to whoever published it.
        </p>
      </form>

      {look.isPending ? (
        <div className="mt-4" role="status">
          <p className="mb-2 text-small font-medium text-ink">Fetching the page</p>
          <Progress label="Fetching the page" tone="lamp" />
        </div>
      ) : null}

      <div ref={results} className="scroll-mt-20 scroll-mb-24">
        {lookError && !fieldError ? (
          <Notice tone="danger" icon={<CircleAlert />} title={refusalTitle(lookError)} className="mt-4">
            {errorMessage(lookError)}
          </Notice>
        ) : null}

        {preview && !busy ? (
          <>
            <Found preview={preview} withPictures={withPictures} onWithPictures={setWithPictures} choice={choice} onChoice={setChoice} />
            {saveError ? (
              <Notice tone="danger" icon={<CircleAlert />} title="This page was not saved" className="mt-4">
                {errorMessage(saveError)}
              </Notice>
            ) : null}
            <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
              <Button
                variant="primary"
                disabled={undecided}
                loading={save.isPending && !confirming}
                onClick={() => (replacing ? setConfirming(true) : save.mutate())}
              >
                {replacing ? "Replace with this copy" : "Save page"}
              </Button>
              {undecided ? <p className="text-small text-ink-muted">Choose what happens to the earlier copy first.</p> : null}
            </div>
          </>
        ) : null}

        {busy && !finished ? <Saving job={job} onCancel={() => cancel.mutate()} cancelling={cancel.isPending} /> : null}
        {busy && job && finished ? <Outcome job={job} onAgain={startOver} /> : null}
      </div>

      <ConfirmDialog
        open={confirming && Boolean(replacing)}
        onOpenChange={setConfirming}
        title="Replace the earlier copy?"
        description={
          replacing ? (
            <>
              <span className="[overflow-wrap:anywhere]">“{replacing.title}”</span>, saved on {formatDateTime(replacing.savedAt)}, will be
              deleted from your library once the page as it is now has been saved in its place. Its tags and category are kept. This cannot
              be undone.
            </>
          ) : null
        }
        confirmLabel="Replace copy"
        cancelLabel="Keep the earlier copy"
        loading={save.isPending}
        onConfirm={() => save.mutate()}
      />
    </div>
  );
}

/** The panel as the Library shows it: framed, with a name and a way to put it away. */
export function SaveWebPagePanel({ onClose, className }: { onClose: () => void; className?: string }) {
  return (
    <section aria-label="Save a web page" className={cn("overflow-hidden rounded-panel border border-border", className)}>
      <header className="flex min-h-11 items-center justify-between gap-3 border-b border-border bg-surface py-1 pr-2 pl-4">
        <h2 className="text-small font-medium text-ink">Save a web page</h2>
        <Button variant="ghost" size="sm" onClick={onClose}>
          Close
        </Button>
      </header>
      <SaveWebPage autoFocus className="px-4 py-4" />
    </section>
  );
}
