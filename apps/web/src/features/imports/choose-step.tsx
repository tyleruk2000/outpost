/**
 * Step one: hand Outpost the files. A drop target with a file picker behind a real
 * button, upload progress as it happens, and below it the imports made before.
 */
import { formatBytes, type ImportDto, type ImportSummary } from "@outpost/shared";
import { CircleAlert, TriangleAlert, Upload } from "lucide-react";
import { type DragEvent, useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { Contour } from "@/components/contour";
import { ErrorState, Notice, Rows, Section } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Badge, Progress, Skeleton } from "@/components/ui/misc";
import { errorMessage } from "@/lib/api";
import { cn, plural, timeAgo } from "@/lib/utils";
import { SaveWebPage } from "../webpages/save-page";
import { ACCEPT_ATTRIBUTE, sortFiles, uploadImport, useRecentImports } from "./import-data";
import { describeState } from "./preview-model";

interface UploadProgress {
  label: string;
  bytes: number;
  fraction: number;
}

/** Files from a drop, and how many folders were among the dropped things (a browser cannot upload those as they are). */
function droppedFiles(transfer: DataTransfer): { files: File[]; folders: number } {
  const files: File[] = [];
  let folders = 0;
  for (const item of Array.from(transfer.items)) {
    if (item.kind !== "file") continue;
    if (item.webkitGetAsEntry?.()?.isDirectory) folders += 1;
    else {
      const file = item.getAsFile();
      if (file) files.push(file);
    }
  }
  return { files, folders };
}

const carriesFiles = (event: DragEvent) => event.dataTransfer.types.includes("Files");

function DropZone({ onUploaded }: { onUploaded: (dto: ImportDto) => void }) {
  const picker = useRef<HTMLInputElement>(null);
  const request = useRef<AbortController | null>(null);
  const [dragging, setDragging] = useState(false);
  const [upload, setUpload] = useState<UploadProgress>();
  const [refused, setRefused] = useState<string[]>([]);
  const [folders, setFolders] = useState(0);
  const [failure, setFailure] = useState<string>();

  // Leaving the screen mid-upload ends the upload; the server keeps nothing of a cut-off one.
  useEffect(() => () => request.current?.abort(), []);

  const start = async (chosen: File[], droppedFolders = 0) => {
    const { accepted, refused: notTaken } = sortFiles(chosen);
    setRefused(notTaken);
    setFolders(droppedFolders);
    setFailure(undefined);
    if (accepted.length === 0) return;

    const controller = new AbortController();
    request.current = controller;
    const label = accepted.length === 1 ? accepted[0]!.name : `${accepted[0]!.name} and ${accepted.length - 1} more`;
    const bytes = accepted.reduce((total, file) => total + file.size, 0);
    setUpload({ label, bytes, fraction: 0 });
    try {
      onUploaded(await uploadImport(accepted, (fraction) => setUpload({ label, bytes, fraction }), controller.signal));
    } catch (error) {
      if (!controller.signal.aborted) setFailure(errorMessage(error));
    } finally {
      request.current = null;
      setUpload(undefined);
    }
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    if (upload) return;
    const dropped = droppedFiles(event.dataTransfer);
    void start(dropped.files, dropped.folders);
  };

  return (
    <div className="grid gap-3">
      {/* biome-ignore lint/a11y/noStaticElementInteractions: dropping is an extra for mouse users; the button inside does the same from the keyboard */}
      <div
        onDragOver={(event) => {
          if (!carriesFiles(event)) return;
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
        }}
        onDrop={onDrop}
        className={cn(
          "relative isolate overflow-hidden rounded-panel border border-dashed px-6 py-10 transition-colors duration-150 md:px-10 md:py-12",
          dragging ? "border-primary bg-primary-soft" : "border-border-strong",
        )}
      >
        <Contour
          seed={11}
          className="absolute inset-0 -z-10 size-full opacity-70 [mask-image:linear-gradient(100deg,transparent_22%,black_80%)]"
        />
        <input
          ref={picker}
          type="file"
          multiple
          accept={ACCEPT_ATTRIBUTE}
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          data-testid="import-picker"
          onChange={(event) => {
            void start(Array.from(event.target.files ?? []));
            // Lets the same file be chosen again straight away.
            event.target.value = "";
          }}
        />

        {upload ? (
          <div className="max-w-[34rem]" aria-live="polite">
            <h2 className="font-title text-heading text-ink">Uploading {upload.label}</h2>
            <Progress value={upload.fraction} tone="lamp" label={`Uploading ${upload.label}`} className="mt-4" />
            <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
              <p className="tabular text-small text-ink-muted">
                {formatBytes(upload.bytes * upload.fraction)} of {formatBytes(upload.bytes)}
              </p>
              <Button size="sm" onClick={() => request.current?.abort()}>
                Cancel upload
              </Button>
            </div>
          </div>
        ) : (
          <div className="max-w-[46ch]">
            <h2 className="font-title text-heading text-ink">{dragging ? "Drop the files to upload them" : "Choose what to import"}</h2>
            <p className="mt-2 text-body text-ink-muted">Markdown, HTML, text or PDF files, or a ZIP of them, including a Notion export.</p>
            <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
              <Button variant="primary" onClick={() => picker.current?.click()}>
                <Upload /> Choose files
              </Button>
              <span className="text-small text-ink-muted max-md:hidden">or drop them here</span>
            </div>
          </div>
        )}
      </div>

      {failure ? (
        <Notice tone="danger" icon={<CircleAlert />} title="The upload did not go through">
          {failure}
        </Notice>
      ) : null}
      {folders > 0 ? (
        <Notice tone="warning" icon={<TriangleAlert />} title="A folder cannot be uploaded as it is">
          Compress the folder into a ZIP file first, then import the ZIP. Its sub-folders become sub-pages.
        </Notice>
      ) : null}
      {refused.length > 0 ? (
        <Notice
          tone="warning"
          icon={<TriangleAlert />}
          title={`${plural(refused.length, "file")} cannot be imported and ${refused.length === 1 ? "was" : "were"} not uploaded`}
        >
          <span className="break-words">{refused.slice(0, 6).join(", ")}</span>
          {refused.length > 6 ? ` and ${refused.length - 6} more` : ""}. Outpost imports Markdown, HTML, text, CSV and PDF files, and ZIP
          archives of them.
        </Notice>
      ) : null}

      <dl className="mt-2 grid max-w-[70ch] gap-x-8 gap-y-3 text-small sm:grid-cols-[auto_minmax(0,1fr)]">
        <dt className="font-medium text-ink">From Notion</dt>
        <dd className="text-ink-muted">
          In Notion, open Settings, then Export, and choose “Markdown &amp; CSV”. Import the ZIP it gives you, without unpacking it.
        </dd>
        <dt className="font-medium text-ink">A folder of notes</dt>
        <dd className="text-ink-muted">
          Compress the folder into a ZIP. Sub-folders become sub-pages, and pictures the notes show come along.
        </dd>
        <dt className="font-medium text-ink">Before anything is added</dt>
        <dd className="text-ink-muted">
          You see what would be created, what already exists and what cannot come across. Nothing changes until you say so.
        </dd>
      </dl>
    </div>
  );
}

function countsLine(entry: ImportSummary): string {
  const counts = entry.counts;
  if (!counts) return entry.state === "failed" && entry.error ? entry.error : formatBytes(entry.sizeBytes);
  const parts: string[] = [];
  if (counts.created > 0) parts.push(`${plural(counts.created, "page")} created`);
  if (counts.updated > 0) parts.push(`${plural(counts.updated, "page")} replaced`);
  if (counts.documents > 0) parts.push(`${plural(counts.documents, "PDF")} added`);
  if (counts.skipped > 0) parts.push(`${counts.skipped} left out`);
  if (counts.failed > 0) parts.push(`${counts.failed} failed`);
  return parts.length > 0 ? parts.join(", ") : "Nothing was added";
}

function RecentImports() {
  const recent = useRecentImports();
  if (recent.isPending) {
    return (
      <div className="grid gap-3" aria-busy>
        <Skeleton className="h-11" />
        <Skeleton className="h-11" />
      </div>
    );
  }
  if (recent.isError) return <ErrorState error={recent.error} onRetry={() => recent.refetch()} />;
  if (recent.data.length === 0)
    return <p className="text-small text-ink-muted">Nothing has been imported yet. Imports you make are listed here with their reports.</p>;

  return (
    <Rows>
      {recent.data.map((entry) => {
        const partial = (entry.counts?.failed ?? 0) > 0 || (entry.state === "failed" && (entry.counts?.created ?? 0) > 0);
        const state = describeState(entry.state, partial);
        const open = entry.state === "ready" ? "Continue" : entry.counts ? "Open report" : "Open";
        return (
          <li key={entry.id} className="flex items-center gap-4 py-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                {/* The button at the row's end is the way in from the keyboard; this is the larger target for a pointer. */}
                <Link
                  to={`/import?id=${entry.id}`}
                  tabIndex={-1}
                  className="min-w-0 truncate text-body font-medium text-ink underline-offset-2 hover:underline"
                >
                  {entry.originalName}
                </Link>
                <Badge tone={state.tone}>{state.label}</Badge>
              </div>
              <p className="mt-0.5 line-clamp-2 text-small text-ink-muted">
                <span className="tabular">{countsLine(entry)}</span>
                <span className="mx-2 text-border-strong" aria-hidden>
                  /
                </span>
                {timeAgo(entry.createdAt)}
              </p>
            </div>
            <Button asChild variant="ghost" size="sm" className="max-md:h-11">
              <Link to={`/import?id=${entry.id}`} aria-label={`${open}: ${entry.originalName}`}>
                {open}
              </Link>
            </Button>
          </li>
        );
      })}
    </Rows>
  );
}

export function ChooseStep({ onUploaded }: { onUploaded: (dto: ImportDto) => void }) {
  return (
    <>
      <DropZone onUploaded={onUploaded} />
      <Section
        title="Save a web page"
        description="Keep a readable copy of one page in your library, to read and search with no connection."
      >
        <SaveWebPage className="max-w-[46rem]" />
      </Section>
      <Section title="Recent imports">
        <RecentImports />
      </Section>
    </>
  );
}
