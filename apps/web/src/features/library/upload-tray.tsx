import { formatBytes } from "@outpost/shared";
import { Check, CircleAlert, Files, FileUp, X } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/misc";
import { plural } from "@/lib/utils";
import { isSettled, type UploadItem } from "./upload-queue";

/** "Adding 5 files, 2 finished" while working; "3 added, 1 already in your library, 1 not added" after. */
export function summariseUploads(items: UploadItem[]): string {
  const count = (state: UploadItem["state"]) => items.filter((item) => item.state === state).length;
  const finished = items.filter(isSettled).length;
  if (finished < items.length) return `Adding ${plural(items.length, "file")}, ${finished} finished`;
  const refused = count("rejected") + count("failed");
  return [
    count("created") ? `${count("created")} added` : null,
    count("duplicate") ? `${count("duplicate")} already in your library` : null,
    refused ? `${refused} not added` : null,
  ]
    .filter(Boolean)
    .join(", ");
}

function DocumentLink({ item }: { item: UploadItem }) {
  if (!item.document) return null;
  return (
    <Link
      to={`/library/documents/${item.document.id}`}
      state={{ fromLibrary: true }}
      className="font-medium text-primary underline decoration-1 underline-offset-[0.2em] hover:decoration-2"
    >
      {item.document.title}
    </Link>
  );
}

function Outcome({ item }: { item: UploadItem }): ReactNode {
  switch (item.state) {
    case "queued":
      return <p className="text-ink-muted">Waiting for its turn</p>;
    case "uploading": {
      // All bytes sent, no answer yet: the server is checking and filing the file.
      const sent = item.progress >= 1;
      return (
        <div className="mt-1.5 flex items-center gap-3">
          <Progress value={sent ? null : item.progress} label={`Sending ${item.file.name}`} className="max-w-64" />
          <span className="tabular shrink-0 text-ink-muted">{sent ? "Checking the file" : `${Math.round(item.progress * 100)}%`}</span>
        </div>
      );
    }
    case "created":
      return (
        <p className="text-ink-muted">
          Added as <DocumentLink item={item} />
        </p>
      );
    case "duplicate":
      return (
        <p className="text-ink-muted">
          Already in your library as <DocumentLink item={item} />
        </p>
      );
    case "rejected":
    case "failed":
      return <p className="text-ink">{item.reason}</p>;
  }
}

const icons: Record<UploadItem["state"], ReactNode> = {
  queued: <FileUp className="text-ink-faint" />,
  uploading: <FileUp className="text-ink-muted" />,
  created: <Check className="text-success" />,
  duplicate: <Files className="text-ink-muted" />,
  rejected: <CircleAlert className="text-danger" />,
  failed: <CircleAlert className="text-danger" />,
};

function UploadRow({
  item,
  onAddAnyway,
  onRetry,
  onCancel,
}: {
  item: UploadItem;
  onAddAnyway: () => void;
  onRetry: () => void;
  onCancel: () => void;
}) {
  return (
    <li className="flex items-start gap-3 px-4 py-3 text-small" data-state={item.state}>
      <span aria-hidden className="mt-0.5 shrink-0 [&_svg]:size-4">
        {icons[item.state]}
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex items-baseline gap-3">
          <span className="truncate font-medium text-ink">{item.file.name}</span>
          <span className="tabular shrink-0 text-micro text-ink-muted">{formatBytes(item.file.size)}</span>
        </p>
        <Outcome item={item} />
      </div>
      {item.state === "duplicate" ? (
        <Button size="sm" onClick={onAddAnyway}>
          Add anyway
        </Button>
      ) : item.state === "failed" ? (
        <Button size="sm" onClick={onRetry}>
          Try again
        </Button>
      ) : !isSettled(item) ? (
        <Button variant="ghost" size="icon-sm" aria-label={`Cancel ${item.file.name}`} onClick={onCancel}>
          <X />
        </Button>
      ) : null}
    </li>
  );
}

/** What is happening to the files just added: progress for each, then what the server made of it. */
export function UploadTray({
  items,
  onAddAnyway,
  onRetry,
  onCancel,
  onDismiss,
  className,
}: {
  items: UploadItem[];
  onAddAnyway: (id: string) => void;
  onRetry: (id: string) => void;
  onCancel: (id: string) => void;
  onDismiss: () => void;
  className?: string;
}) {
  if (items.length === 0) return null;
  const settled = items.every(isSettled);
  return (
    <section aria-label="Files being added" className={className}>
      <div className="overflow-hidden rounded-panel border border-border">
        <header className="flex min-h-11 items-center justify-between gap-3 border-b border-border bg-surface py-1 pr-2 pl-4">
          <p className="tabular text-small font-medium text-ink" role="status">
            {summariseUploads(items)}
          </p>
          {settled ? (
            <Button variant="ghost" size="sm" onClick={onDismiss}>
              Dismiss
            </Button>
          ) : null}
        </header>
        <ul className="scroll-quiet max-h-80 divide-y divide-border overflow-y-auto">
          {items.map((item) => (
            <UploadRow
              key={item.id}
              item={item}
              onAddAnyway={() => onAddAnyway(item.id)}
              onRetry={() => onRetry(item.id)}
              onCancel={() => onCancel(item.id)}
            />
          ))}
        </ul>
      </div>
    </section>
  );
}
