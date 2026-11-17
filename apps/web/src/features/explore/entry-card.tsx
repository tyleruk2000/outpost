import type { CatalogEntryDto, DownloadDto } from "@outpost/shared";
import { Check, CircleAlert, Download, Plus } from "lucide-react";
import { Fragment, type ReactNode, useEffect, useRef } from "react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/misc";
import { cn, formatNumber } from "@/lib/utils";
import { DownloadControls, DownloadProgress } from "../downloads/download-progress";
import { editionText, entryAction, entrySituation, isIncluded, kindText, languageName, licenceText, openTarget, sizeText } from "./catalog";

const Slash = () => (
  <span aria-hidden className="mx-2 text-border-strong">
    /
  </span>
);

function Facts({ parts }: { parts: ReactNode[] }) {
  const present = parts.filter(Boolean);
  return (
    <p className="mt-1 text-small text-ink-muted">
      {present.map((part, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: a fixed, ordered list of facts about one entry
        <Fragment key={index}>
          {/* A line may break before the slash: a long publisher and its neighbour are otherwise one word, too wide for a phone with large text. */}
          {index > 0 ? (
            <>
              <wbr />
              <Slash />
            </>
          ) : null}
          {part}
        </Fragment>
      ))}
    </p>
  );
}

/** The foot of the card: where the entry stands on this server, and the one thing to do next. */
function Standing({
  entry,
  download,
  adding,
  onDownload,
  onAdd,
}: {
  entry: CatalogEntryDto;
  download: DownloadDto | undefined;
  adding: boolean;
  onDownload: (entry: CatalogEntryDto) => void;
  onAdd: (entry: CatalogEntryDto) => void;
}) {
  const situation = entrySituation(entry);
  const included = isIncluded(entry);
  const action = entryAction(situation, included);
  const edition = editionText(entry);
  const row = "flex flex-wrap items-center justify-between gap-x-4 gap-y-2";

  if (situation === "queued" || situation === "downloading" || situation === "paused") {
    // The catalogue knows a download exists a moment before the downloads list does.
    if (!download)
      return (
        <p className="text-small text-ink-muted">
          {situation === "queued" ? "Waiting to start" : situation === "paused" ? "Paused" : "Downloading"}
        </p>
      );
    return (
      <div>
        <DownloadProgress download={download} />
        {action.kind === "manage" ? <DownloadControls download={download} className="mt-1.5 -mr-2 justify-end" /> : null}
      </div>
    );
  }

  if (situation === "failed") {
    return (
      <div className={cn(row, "items-start")}>
        <p className="flex min-w-0 flex-1 basis-56 items-start gap-2 text-small text-danger">
          <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>
            <span className="font-medium">The download stopped. </span>
            <span className="text-ink">{download?.error ?? "Retry it, or see Downloads for the reason."}</span>
          </span>
        </p>
        {action.kind === "retry" && download ? <DownloadControls download={download} /> : null}
      </div>
    );
  }

  if (situation === "installed" || situation === "update") {
    const open = (
      <Button asChild variant={situation === "update" ? "ghost" : "secondary"} size="sm">
        <Link to={openTarget(entry)} aria-label={`Open ${entry.name}`}>
          Open
        </Link>
      </Button>
    );
    return (
      <div className={cn(row, situation === "update" && "items-end")}>
        <div className="min-w-0 flex-1 basis-48 text-small">
          <p className="flex items-center gap-1.5 text-success">
            <Check aria-hidden className="size-4 shrink-0" />
            <span>
              {included ? "In your library" : "Installed"}
              {entry.installedVersion ? <span className="text-ink-muted">, version {entry.installedVersion}</span> : null}
            </span>
          </p>
          {situation === "update" && included ? (
            <p className="mt-0.5 text-ink">Version {entry.version} came with this version of Outpost.</p>
          ) : situation === "update" ? (
            <p className="mt-0.5 text-ink">
              Version {entry.version} is available, <span className="tabular">{sizeText(entry)}</span>.
            </p>
          ) : included ? (
            <p className="mt-0.5 text-ink-muted">Included with Outpost</p>
          ) : entry.availability === "unavailable" ? (
            <p className="mt-0.5 text-ink-muted">No longer offered at the source. Your copy keeps working.</p>
          ) : (
            <p className="tabular mt-0.5 text-ink-muted">{sizeText(entry)}</p>
          )}
        </div>
        <div className="ml-auto flex items-center gap-1">
          {open}
          {action.kind === "update" && included ? (
            <Button size="sm" loading={adding} onClick={() => onAdd(entry)} aria-label={`Update ${entry.name}`}>
              Update
            </Button>
          ) : action.kind === "update" ? (
            <Button size="sm" onClick={() => onDownload(entry)} aria-label={`Update ${entry.name}`}>
              <Download /> Update
            </Button>
          ) : null}
        </div>
      </div>
    );
  }

  if (situation === "unavailable") {
    return (
      <div className="text-small">
        <p className="font-medium text-ink">No longer offered at the source</p>
        {entry.unavailableReason ? <p className="mt-0.5 text-ink-muted">{entry.unavailableReason}</p> : null}
      </div>
    );
  }

  if (action.kind === "add") {
    // Already on this machine: no size to weigh up and nothing to fetch, so the state says that instead.
    return (
      <div className={row}>
        <p className="min-w-0 text-small text-ink-muted">
          <span className="block text-body font-semibold text-ink">Included with Outpost</span>
          No download needed{edition ? <span>. {edition}</span> : null}
        </p>
        <Button size="sm" loading={adding} onClick={() => onAdd(entry)} aria-label={`Add ${entry.name} to the library`}>
          {adding ? null : <Plus />} Add to library
        </Button>
      </div>
    );
  }

  return (
    <div className={row}>
      <p className="min-w-0 text-small text-ink-muted">
        <span className="tabular block text-body font-semibold text-ink">{sizeText(entry)}</span>
        {edition}
      </p>
      {action.kind === "download" ? (
        <Button size="sm" onClick={() => onDownload(entry)} aria-label={`Download ${entry.name}`}>
          <Download /> Download
        </Button>
      ) : null}
    </div>
  );
}

/**
 * One collection in the catalogue. A card, because it is an object picked from a set,
 * but a typographic one: its name, what it is, who publishes it and on what terms, then
 * its size and state with a single action.
 */
export function EntryCard({
  entry,
  download,
  adding = false,
  marked,
  categoryLabel,
  onDownload,
  onAdd,
}: {
  entry: CatalogEntryDto;
  download: DownloadDto | undefined;
  /** This entry is being copied into the library right now. */
  adding?: boolean;
  /** Arrived at from a link to this entry: scrolled to and outlined. */
  marked?: boolean;
  /** Shown when entries from several categories are mixed in one list. */
  categoryLabel?: string;
  onDownload: (entry: CatalogEntryDto) => void;
  /** Adds an entry that ships with Outpost; there is nothing to confirm, so no dialog. */
  onAdd: (entry: CatalogEntryDto) => void;
}) {
  const ref = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (marked) ref.current?.scrollIntoView({ block: "center" });
  }, [marked]);

  return (
    <li
      ref={ref}
      id={`entry-${entry.id}`}
      aria-current={marked ? "true" : undefined}
      className={cn(
        "flex min-w-0 flex-col rounded-panel border px-5 pt-4 pb-4",
        marked ? "border-primary bg-primary-soft/40 shadow-[0_0_0_1px_var(--primary)]" : "border-border",
      )}
    >
      <h3 className="font-title text-lead text-ink">{entry.name}</h3>
      <Facts
        parts={[
          entry.publisher,
          languageName(entry.language),
          kindText(entry),
          entry.articleCount && entry.articleCount > 1 ? (
            <span key="articles" className="tabular whitespace-nowrap">
              {formatNumber(entry.articleCount)} articles
            </span>
          ) : null,
          categoryLabel,
        ]}
      />
      <p className="mt-2.5 max-w-[68ch] text-small leading-relaxed text-ink">{entry.description}</p>
      <p className="mt-2 text-small text-ink-muted">{licenceText(entry)}</p>
      {entry.chapterCount && entry.licenseNote ? (
        // A book carries its author's own account of how it was reviewed; it is a line away, not hidden.
        <details className="mt-1.5 text-small text-ink-muted">
          <summary className="w-fit cursor-pointer rounded-control font-medium text-primary underline-offset-[0.2em] hover:underline">
            Who wrote it and how it was reviewed
          </summary>
          <p className="mt-1.5 max-w-[68ch] leading-relaxed text-ink">{entry.licenseNote}</p>
        </details>
      ) : null}
      <div className="mb-4" />
      <div className="mt-auto border-t border-border pt-3.5">
        <Standing entry={entry} download={download} adding={adding} onDownload={onDownload} onAdd={onAdd} />
      </div>
    </li>
  );
}

export function EntryCardSkeleton() {
  return (
    <li className="rounded-panel border border-border px-5 pt-4 pb-4" aria-hidden>
      <Skeleton className="h-6 w-3/5" />
      <Skeleton className="mt-2.5 h-3.5 w-2/5" />
      <Skeleton className="mt-4 h-3.5" />
      <Skeleton className="mt-2 h-3.5 w-4/5" />
      <div className="mt-5 flex items-center justify-between border-t border-border pt-3.5">
        <Skeleton className="h-3.5 w-20" />
        <Skeleton className="h-8 w-28" />
      </div>
    </li>
  );
}
