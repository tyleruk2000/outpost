import { type DocumentDto, formatBytes } from "@outpost/shared";
import { CircleAlert, Unplug } from "lucide-react";
import { Fragment, type ReactNode } from "react";
import { Link } from "react-router";
import { Skeleton } from "@/components/ui/misc";
import { cn, timeAgo } from "@/lib/utils";
import { isReading, kindLine, kindOfDocument } from "./document-meta";

const Slash = () => (
  <span aria-hidden className="mx-2 text-border-strong">
    /
  </span>
);

/** The state of a document's text, shown only when it is something other than "read and searchable". */
export function ExtractionNote({
  document,
  className,
}: {
  document: Pick<DocumentDto, "extraction" | "extractionDetail">;
  className?: string;
}) {
  if (isReading(document)) {
    return (
      <p className={cn("flex items-center gap-2 text-small text-lamp-ink", className)}>
        <span aria-hidden className="size-2 shrink-0 rounded-[2px] bg-lamp" />
        Reading text…
      </p>
    );
  }
  if (document.extraction === "failed") {
    return (
      <p className={cn("flex items-start gap-2 text-small text-danger", className)}>
        <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
        <span>
          Text could not be read<span className="text-ink">{document.extractionDetail ? `: ${document.extractionDetail}` : ""}</span>
        </span>
      </p>
    );
  }
  if (document.extraction === "unsupported") {
    return (
      <p className={cn("text-small text-ink-muted", className)} title={document.extractionDetail ?? undefined}>
        No searchable text
      </p>
    );
  }
  return null;
}

/** One document in the list. The whole row opens it. */
export function DocumentRow({ document, locationName }: { document: DocumentDto; locationName?: string }) {
  const kind = kindOfDocument(document);
  const away = !document.locationAvailable;
  const meta: ReactNode[] = [
    // A chapter is told apart from other chapters of the same name by its book.
    document.book ? `${document.book.title}${document.book.number ? `, chapter ${document.book.number}` : ""}` : null,
    kindLine(document),
    <span key="size" className="tabular md:hidden">
      {formatBytes(document.sizeBytes)}
    </span>,
    <span key="added" className="md:hidden">
      Added {timeAgo(document.createdAt)}
    </span>,
    document.category,
    document.tags.length > 0 ? document.tags.map((tag) => `#${tag}`).join("  ") : null,
  ].filter(Boolean);

  return (
    <li>
      <Link
        to={`/library/documents/${document.id}`}
        state={{ fromLibrary: true }}
        className="group -mx-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3.5 rounded-control px-3 py-3.5 transition-colors duration-150 hover:bg-surface md:grid-cols-[auto_minmax(0,1fr)_auto] md:gap-x-4"
      >
        <kind.icon aria-hidden className={cn("mt-1 size-5 shrink-0", away ? "text-ink-faint" : "text-ink-muted")} strokeWidth={1.6} />
        <div className="min-w-0">
          <h3
            className={cn(
              "font-title text-lead decoration-primary decoration-1 underline-offset-[0.22em] group-hover:underline",
              away ? "text-ink-muted" : "text-ink",
            )}
          >
            {document.title}
          </h3>
          <p className="mt-0.5 text-small text-ink-muted">
            {meta.map((part, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: a fixed, ordered list of facts about one document
              <Fragment key={index}>
                {index > 0 ? (
                  // The size and date move to their own column on wide screens, and take their separators with them.
                  <span className={typeof part === "object" ? "md:hidden" : undefined}>
                    <Slash />
                  </span>
                ) : null}
                {part}
              </Fragment>
            ))}
          </p>
          {away ? (
            <p className="mt-1.5 flex items-start gap-2 text-small text-warning">
              <Unplug aria-hidden className="mt-0.5 size-4 shrink-0" />
              <span>
                Unavailable
                <span className="text-ink">
                  : {locationName ? `“${locationName}” is not connected` : "its storage location is not connected"}
                </span>
              </span>
            </p>
          ) : null}
          <ExtractionNote document={document} className="mt-1.5" />
        </div>
        <div className="text-right text-small max-md:hidden">
          <p className="tabular pt-1 text-ink">{formatBytes(document.sizeBytes)}</p>
          <p className="mt-0.5 text-ink-muted">{timeAgo(document.createdAt)}</p>
        </div>
      </Link>
    </li>
  );
}

export function DocumentRowSkeleton() {
  return (
    <li className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 py-4" aria-hidden>
      <Skeleton className="mt-1 size-5" />
      <div className="grid gap-2">
        <Skeleton className="h-5 w-72 max-w-full" />
        <Skeleton className="h-3.5 w-48 max-w-[70%]" />
      </div>
    </li>
  );
}
