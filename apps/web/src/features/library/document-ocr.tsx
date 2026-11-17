/**
 * Reading text from scanned pages and images (OCR), as the document screen shows it:
 * the offer, the progress of the background job, and the result with a plain note that
 * a machine read it and may have got words wrong.
 */
import type { DocumentDto, DocumentOcrResponse, DocumentResponse, DocumentTextResponse, JobDto, OcrStatus } from "@outpost/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ScanText, X } from "lucide-react";
import { useState } from "react";
import { ErrorState } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Progress, Skeleton } from "@/components/ui/misc";
import { api, errorMessage } from "@/lib/api";
import { notify } from "@/lib/notify";
import { useActiveJobs } from "@/lib/queries";
import { cn, formatNumber, plural } from "@/lib/utils";
import { documentKeys } from "./document-meta";

const OCR_JOB = "document.ocr";
const HIDDEN_KEY = "outpost.ocr.hidden";
/** Image types the server reads by OCR. An SVG is a drawing, not a picture of text. */
const READABLE_IMAGES = new Set(["png", "jpg", "jpeg", "gif", "webp"]);

/** Said wherever OCR is offered, so nobody starts it expecting a quick, exact copy. */
export const OCR_CAUTION = "Reading runs on this device. It is slow, and it makes mistakes.";

/** Where a document stands with OCR. */
export type OcrStage =
  /** Not a scan, or a type OCR does not read. */
  | "none"
  /** Has scanned pages nobody has read yet. */
  | "offer"
  /** A job is waiting for its turn or reading. */
  | "reading"
  /** Some scanned pages have been read and some have not. */
  | "partial"
  /** Every scanned page has been read. */
  | "read";

export const isOcrCandidate = (document: Pick<DocumentDto, "type" | "ext">) =>
  document.type === "pdf" || (document.type === "image" && READABLE_IMAGES.has(document.ext));

export function ocrStage(document: Pick<DocumentDto, "type" | "ext" | "scanPages" | "ocrPages">, job: JobDto | undefined): OcrStage {
  if (!isOcrCandidate(document)) return "none";
  if (job) return "reading";
  if (document.scanPages === 0) return "none";
  if (document.ocrPages === null) return "offer";
  return document.ocrPages < document.scanPages ? "partial" : "read";
}

/** What the action is called for this document, at this stage. The name stays the same wherever it appears. */
export function ocrActionLabel(document: Pick<DocumentDto, "type">, stage: OcrStage): string {
  const image = document.type === "image";
  if (stage === "partial") return "Read the remaining scanned pages";
  if (stage === "read") return image ? "Read the image again" : "Read the scanned pages again";
  return image ? "Read text from this image" : "Read text from the scanned pages";
}

export interface DocumentOcr {
  stage: OcrStage;
  /** The job reading this document now, if there is one. */
  job: JobDto | undefined;
  /** Undefined until the server has answered. */
  status: OcrStatus | undefined;
  /** True when this installation can run OCR. */
  available: boolean;
  /** True when some of this document's text came from OCR. */
  hasOcrText: boolean;
  start: () => void;
  starting: boolean;
  cancel: () => void;
  cancelling: boolean;
}

/**
 * OCR for one document. The job may have been started here, in another tab, or by the
 * "read automatically" setting, so it is found by its subject rather than remembered.
 */
export function useDocumentOcr(document: DocumentDto): DocumentOcr {
  const client = useQueryClient();
  const candidate = isOcrCandidate(document);
  const status = useQuery({
    queryKey: documentKeys.ocr,
    queryFn: () => api.get<OcrStatus>("/api/ocr"),
    enabled: candidate,
    staleTime: 60_000,
  });
  const active = useActiveJobs();
  const job = candidate ? active.data?.find((entry) => entry.type === OCR_JOB && entry.subject === `document:${document.id}`) : undefined;
  const stage = ocrStage(document, job);

  const start = useMutation({
    // Reading "again" replaces what OCR found before; otherwise only unread pages are read.
    mutationFn: () => api.post<DocumentOcrResponse>(`/api/documents/${document.id}/ocr`, { redo: stage === "read" }),
    onSuccess: (data) => {
      client.setQueryData<DocumentResponse>(documentKeys.detail(document.id), { document: data.document });
      void client.invalidateQueries({ queryKey: ["jobs"] });
    },
    onError: (error) => notify.error(errorMessage(error)),
  });
  const cancel = useMutation({
    mutationFn: () => api.post(`/api/jobs/${job?.id}/cancel`),
    onSuccess: () => client.invalidateQueries({ queryKey: ["jobs"] }),
    onError: (error) => notify.error(errorMessage(error)),
  });

  return {
    stage,
    job,
    status: status.data,
    available: status.data?.available === true,
    hasOcrText: (document.ocrPages ?? 0) > 0 && document.textChars > 0,
    start: () => start.mutate(),
    starting: start.isPending,
    cancel: () => cancel.mutate(),
    cancelling: cancel.isPending,
  };
}

function readHidden(): string[] {
  try {
    const stored = JSON.parse(localStorage.getItem(HIDDEN_KEY) ?? "[]") as unknown;
    return Array.isArray(stored) ? stored.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

/** Whether the person has put the offer away for this document. Remembered in this browser. */
function useHiddenOffer(documentId: string): [hidden: boolean, hide: () => void] {
  const [hidden, setHidden] = useState(() => readHidden().includes(documentId));
  const hide = () => {
    setHidden(true);
    try {
      // Only the most recent few hundred are kept; an old one simply offers again.
      localStorage.setItem(HIDDEN_KEY, JSON.stringify([...readHidden().filter((id) => id !== documentId), documentId].slice(-300)));
    } catch {
      // Storage can be unavailable; the choice then lasts for this visit.
    }
  };
  return [hidden, hide];
}

/**
 * Progress of the job while it waits and reads, with the way to stop it. `stacked` is
 * for the narrow details panel, where the button goes under the bar instead of beside the words.
 */
export function OcrProgress({ ocr, stacked, className }: { ocr: DocumentOcr; stacked?: boolean; className?: string }) {
  const { job } = ocr;
  if (!job) return null;
  const waiting = job.state === "queued";
  const paused = job.state === "paused";
  const { current, total, message } = job.progress;
  const fraction = total ? Math.min(1, current / total) : undefined;
  const heading = paused ? "Paused" : waiting ? "Waiting for its turn to be read" : (message ?? "Reading the text");
  const stop = (
    <Button
      variant="ghost"
      size="sm"
      onClick={ocr.cancel}
      loading={ocr.cancelling}
      className={stacked ? "mt-1.5 -ml-2.5" : "-my-1 -mr-2.5"}
    >
      Stop reading
    </Button>
  );
  return (
    <div className={className} role="status">
      <div className="mb-1.5 flex items-center justify-between gap-x-4">
        <p className={cn("flex min-w-0 items-center gap-2 text-small", waiting || paused ? "text-ink-muted" : "text-lamp-ink")}>
          {waiting || paused ? null : <span aria-hidden className="size-2 shrink-0 rounded-[2px] bg-lamp" />}
          {heading}
        </p>
        {stacked ? null : stop}
      </div>
      <Progress value={waiting ? 0 : fraction} tone={waiting || paused ? "muted" : "lamp"} label={job.title} />
      {stacked ? stop : null}
    </div>
  );
}

/**
 * The band above a scanned PDF or an image: the offer to read it, the reading under
 * way, or the note that its text came from OCR with a way to see that text.
 */
export function ScanStrip({
  document,
  ocr,
  showingText,
  onShowText,
}: {
  document: DocumentDto;
  ocr: DocumentOcr;
  showingText: boolean;
  onShowText: (show: boolean) => void;
}) {
  const [hidden, hide] = useHiddenOffer(document.id);
  const { stage } = ocr;
  const image = document.type === "image";
  const offering = (stage === "offer" || stage === "partial") && ocr.available;
  // Nothing to say: not a scan, OCR is not part of this installation, or it found nothing to show.
  if (stage === "none" || (!offering && stage !== "reading" && !ocr.hasOcrText)) return null;
  if (stage === "offer" && hidden) return null;

  const band = "shrink-0 border-b border-border bg-page px-4 py-2.5 md:px-5";

  if (stage === "reading") {
    return (
      <div className={band}>
        <OcrProgress ocr={ocr} className="max-w-[44rem]" />
      </div>
    );
  }

  const toggle = ocr.hasOcrText ? (
    <Button size="sm" variant={showingText ? "secondary" : "soft"} onClick={() => onShowText(!showingText)} aria-pressed={showingText}>
      {showingText ? (image ? "Show the picture" : "Show the pages") : "Show the text"}
    </Button>
  ) : null;
  const action = offering ? (
    <Button size="sm" onClick={ocr.start} loading={ocr.starting}>
      {ocr.starting ? null : <ScanText />} {ocrActionLabel(document, stage)}
    </Button>
  ) : null;

  let said: string;
  if (stage === "offer") {
    said = image
      ? "If this picture has writing in it, Outpost can read it so that it can be searched."
      : document.textChars === 0
        ? "These pages are pictures of text, so they cannot be searched yet."
        : `${plural(document.scanPages, "page")} of this PDF ${document.scanPages === 1 ? "is a picture" : "are pictures"} of text and cannot be searched yet.`;
  } else if (stage === "partial") {
    said = `${formatNumber(document.ocrPages ?? 0)} of ${plural(document.scanPages, "scanned page")} ${document.ocrPages === 1 ? "has" : "have"} been read by OCR and may contain mistakes.`;
  } else {
    said = image
      ? "The text of this image was read by OCR and may contain mistakes."
      : `The text of ${plural(document.ocrPages ?? 0, "scanned page")} was read by OCR and may contain mistakes.`;
  }

  return (
    <div className={cn(band, "flex flex-wrap items-center gap-x-4 gap-y-2")}>
      <div className="min-w-0 flex-1 basis-64 text-small">
        <p className="text-ink">{said}</p>
        {/* Why reading stopped part-way is in the details; here it would only repeat the line above. */}
        {document.ocrDetail && stage !== "partial" ? <p className="text-ink-muted">{document.ocrDetail}</p> : null}
        {stage === "offer" ? <p className="text-ink-muted">{OCR_CAUTION}</p> : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {toggle}
        {action}
        {stage === "offer" ? (
          <Button variant="ghost" size="icon-sm" aria-label="Hide this offer" onClick={hide}>
            <X />
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/**
 * The text of a scanned PDF or an image, page by page. Shown in place of the pages
 * when asked for; each part read by OCR says so.
 */
export function OcrTextView({ document }: { document: DocumentDto }) {
  const text = useQuery({
    queryKey: documentKeys.text(document.id),
    queryFn: () => api.get<DocumentTextResponse>(`/api/documents/${document.id}/text`),
  });
  const sections = text.data?.sections.filter((section) => section.text.trim()) ?? [];
  const image = document.type === "image";

  return (
    <section
      // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrolling region must be reachable by keyboard
      tabIndex={0}
      aria-label={`Text of ${document.title}`}
      className="scroll-quiet min-h-0 flex-1 overflow-y-auto bg-page focus-visible:outline-offset-[-2px]"
    >
      <div className="max-w-[48rem] px-5 pt-6 pb-16 md:px-10 md:pt-8">
        <p className="mb-8 border-b border-border pb-4 text-small text-ink-muted">
          {image
            ? "This is what OCR read in the picture. It may contain mistakes; the picture itself is the record."
            : "This is the text of the pages, without their layout. Pages marked “read by OCR” were read from a picture of the page and may contain mistakes; the pages themselves are the record."}
        </p>
        {text.isPending ? (
          <div className="grid gap-3" aria-busy>
            <Skeleton className="h-7 w-40 max-w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
          </div>
        ) : text.isError ? (
          <ErrorState error={text.error} onRetry={() => text.refetch()} />
        ) : sections.length === 0 ? (
          <p className="text-ink-muted">No text has been read from this document.</p>
        ) : (
          <article className="prose">
            {sections.map((section, index) => (
              <section
                // biome-ignore lint/suspicious/noArrayIndexKey: sections have no identity beyond their order
                key={index}
                className="[contain-intrinsic-size:auto_24rem] [content-visibility:auto] [&>*+*]:mt-[0.85em]"
              >
                {section.page ? (
                  // The reading styles set a heading's top margin; the first page needs none.
                  <h2 className={cn("flex flex-wrap items-baseline gap-x-3", index === 0 && "mt-0!")}>
                    Page {section.page}
                    {section.ocr ? (
                      <>
                        <span className="sr-only">, </span>
                        <span className="font-sans text-small font-normal text-ink-muted">read by OCR</span>
                      </>
                    ) : null}
                  </h2>
                ) : null}
                {section.text
                  .split(/\n{2,}/)
                  .filter((paragraph) => paragraph.trim())
                  .map((paragraph, paragraphIndex) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: paragraphs have no identity beyond their order
                    <p key={paragraphIndex} className="whitespace-pre-wrap">
                      {paragraph}
                    </p>
                  ))}
              </section>
            ))}
          </article>
        )}
      </div>
    </section>
  );
}

/**
 * OCR in the details panel, under "Text for search": what was read, what is left, the
 * action, or the reason there is none.
 */
export function OcrDetails({ document, ocr }: { document: DocumentDto; ocr: DocumentOcr }) {
  const { stage } = ocr;
  if (stage === "none") return null;
  const image = document.type === "image";
  const read = document.ocrPages ?? 0;
  const languages = ocr.status?.languages
    .filter((language) => language.selected)
    .map((language) => language.name)
    .join(", ");

  return (
    <div className="mt-4 border-t border-border pt-4">
      {stage === "reading" ? (
        <OcrProgress ocr={ocr} stacked />
      ) : (
        <>
          {ocr.hasOcrText ? (
            <p className="text-small text-ink-muted">
              {image ? "The text of this image" : `The text of ${plural(read, "scanned page")}`} was read by OCR, which makes mistakes: some
              words may be wrong or missing.
            </p>
          ) : stage === "offer" && document.textChars > 0 ? (
            // A PDF with nothing but scans has already been described just above.
            <p className="text-small text-ink-muted">
              {plural(document.scanPages, "page")} of this PDF {document.scanPages === 1 ? "is a picture" : "are pictures"} of text and
              cannot be searched yet.
            </p>
          ) : null}
          {document.ocrDetail ? <p className="mt-1.5 text-small text-ink">{document.ocrDetail}</p> : null}
          {ocr.status && !ocr.available ? (
            <p className="mt-1.5 text-small text-ink-muted">{ocr.status.reason}</p>
          ) : ocr.status ? (
            <>
              <Button size="sm" className="mt-3" onClick={ocr.start} loading={ocr.starting} disabled={!document.locationAvailable}>
                {ocr.starting ? null : <ScanText />} {ocrActionLabel(document, stage)}
              </Button>
              <p className="mt-2 text-small text-ink-muted">
                {stage === "read" ? "Reading again runs on this device and is slow." : OCR_CAUTION}
                {languages ? ` Language: ${languages}.` : ""}
              </p>
            </>
          ) : (
            <Skeleton className="mt-3 h-8 w-56 max-w-full" />
          )}
        </>
      )}
    </div>
  );
}
