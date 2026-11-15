import { type CollectionDto, formatBytes } from "@outpost/shared";
import { CircleAlert, CircleArrowUp, Unplug } from "lucide-react";
import { Fragment, type ReactNode } from "react";
import { Link } from "react-router";
import { EmptyState, ErrorState, Rows } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/misc";
import { cn, plural, timeAgo } from "@/lib/utils";
import { useCollections } from "./collection-data";
import { type CollectionNote, chapterCount, collectionNote, filesReachable, groupCollections, openTarget } from "./collection-meta";

const Slash = () => (
  <span aria-hidden className="mx-2 text-border-strong">
    /
  </span>
);

const noteStyles: Record<CollectionNote["tone"], string> = {
  warning: "text-warning",
  danger: "text-danger",
  lamp: "text-lamp-ink",
  primary: "text-primary",
};

/** A collection's state in a list, shown only when it is something other than simply installed. */
export function CollectionNoteLine({ note, className }: { note: CollectionNote; className?: string }) {
  return (
    <p className={cn("flex items-start gap-2 text-small", noteStyles[note.tone], className)}>
      {note.kind === "moving" ? (
        <span aria-hidden className="mt-1.5 size-2 shrink-0 rounded-[2px] bg-lamp" />
      ) : note.kind === "disconnected" ? (
        <Unplug aria-hidden className="mt-0.5 size-4 shrink-0" />
      ) : note.kind === "update" ? (
        <CircleArrowUp aria-hidden className="mt-0.5 size-4 shrink-0" />
      ) : (
        <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
      )}
      <span>{note.text}</span>
    </p>
  );
}

/** One installed collection. The row opens its screen; "Read" goes straight into it. */
function CollectionRow({ collection }: { collection: CollectionDto }) {
  const note = collectionNote(collection);
  const target = openTarget(collection);
  const away = !collection.locationAvailable;
  const chapters = chapterCount(collection);
  const meta: ReactNode[] = [
    chapters ? plural(chapters, "chapter") : null,
    <span key="size" className="tabular">
      {formatBytes(collection.sizeBytes)}
    </span>,
    collection.version ? `Version ${collection.version}` : null,
    `On ${collection.locationName}`,
    `Installed ${timeAgo(collection.installedAt)}`,
  ].filter(Boolean);

  return (
    <li className="group relative -mx-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-control px-3 py-3.5 transition-colors duration-150 hover:bg-surface">
      <div className="min-w-0 flex-1 basis-64">
        <h3 className={cn("font-title text-lead", away ? "text-ink-muted" : "text-ink")}>
          {/* The link is stretched over the row; the "Read" button sits above it. */}
          <Link
            to={`/library/collections/${collection.id}`}
            className="decoration-primary decoration-1 underline-offset-[0.22em] after:absolute after:inset-0 after:rounded-control group-hover:underline"
          >
            {collection.title}
          </Link>
        </h3>
        <p className="mt-0.5 text-small text-ink-muted">
          {meta.map((part, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: a fixed, ordered list of facts about one collection
            <Fragment key={index}>
              {index > 0 ? <Slash /> : null}
              {part}
            </Fragment>
          ))}
        </p>
        {note ? <CollectionNoteLine note={note} className="mt-1.5" /> : null}
      </div>
      {target && filesReachable(collection) ? (
        <Button asChild size="sm" className="relative">
          <Link to={target.to} aria-label={`${target.label}: ${collection.title}`}>
            {target.label}
          </Link>
        </Button>
      ) : null}
    </li>
  );
}

function RowSkeleton() {
  return (
    <li className="grid gap-2 py-4" aria-hidden>
      <Skeleton className="h-5 w-72 max-w-full" />
      <Skeleton className="h-3.5 w-96 max-w-[80%]" />
    </li>
  );
}

/** The Collections tab of the Library: everything installed, under plain headings by kind. */
export default function CollectionsPanel() {
  const collections = useCollections();

  if (collections.isPending) {
    return (
      <div className="mt-6" aria-busy>
        <Skeleton className="h-4 w-56" />
        <ul className="mt-5 divide-y divide-border border-y border-border" aria-label="Loading collections">
          <RowSkeleton />
          <RowSkeleton />
          <RowSkeleton />
        </ul>
      </div>
    );
  }
  if (collections.isError) {
    return (
      <div className="mt-6">
        <ErrorState error={collections.error} onRetry={() => collections.refetch()} />
      </div>
    );
  }

  const all = collections.data;
  if (all.length === 0) {
    return (
      <EmptyState
        title="No collections installed yet"
        seed={9}
        className="mt-6"
        action={
          <>
            <Button asChild variant="primary">
              <Link to="/explore">Explore collections</Link>
            </Button>
            <Button asChild>
              <Link to="/maps">Download maps</Link>
            </Button>
          </>
        }
      >
        Encyclopedias, manuals and other reference collections you download appear here, along with the maps you keep. Each one works
        without a connection once it is installed.
      </EmptyState>
    );
  }

  const groups = groupCollections(all);
  const totalBytes = all.reduce((sum, item) => sum + item.sizeBytes, 0);

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="tabular text-small text-ink-muted">
          {plural(all.length, "collection")} installed, {formatBytes(totalBytes)} in all
        </p>
        <Button asChild>
          <Link to="/explore">Find more in Explore</Link>
        </Button>
      </div>

      {groups.map((group) => (
        <section key={group.id} className="mt-7 first-of-type:mt-4" aria-labelledby={`collections-${group.id}`}>
          <h2 id={`collections-${group.id}`} className="mb-2 text-lead font-semibold text-ink">
            {group.title}
          </h2>
          <Rows>
            {group.collections.map((collection) => (
              <CollectionRow key={collection.id} collection={collection} />
            ))}
          </Rows>
        </section>
      ))}
    </div>
  );
}
