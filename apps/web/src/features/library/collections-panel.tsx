import { type CollectionDto, formatBytes } from "@outpost/shared";
import { CircleAlert, CircleArrowUp, Search, Unplug } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Link } from "react-router";
import { EmptyState, ErrorState, Joined, Rows } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/misc";
import { cn, plural, timeAgo } from "@/lib/utils";
import { useCollections } from "./collection-data";
import { type CollectionNote, chapterCount, collectionNote, filesReachable, groupCollections, openTarget } from "./collection-meta";

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
    <li className="group relative -mx-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-control px-3 py-3.5 transition-colors duration-(--duration-fast) hover:bg-surface">
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
          <Joined parts={meta} />
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

/** The words of a search, each of which must be somewhere in what a collection says of itself. */
export function matchesCollection(collection: CollectionDto, text: string): boolean {
  const words = text.toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const about = [collection.title, collection.description, collection.publisher, collection.category, collection.locationName]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase();
  return words.every((word) => about.includes(word));
}

/** The Collections tab of the Library: everything installed, under plain headings by kind. */
export default function CollectionsPanel() {
  const collections = useCollections();
  const [text, setText] = useState("");

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

  const found = all.filter((collection) => matchesCollection(collection, text));
  const searching = text.trim() !== "";
  const groups = groupCollections(found);
  const totalBytes = all.reduce((sum, item) => sum + item.sizeBytes, 0);

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="tabular text-small text-ink-muted" aria-live="polite">
          {searching
            ? `${found.length} of ${plural(all.length, "collection")} ${found.length === 1 ? "matches" : "match"}`
            : `${plural(all.length, "collection")} installed, ${formatBytes(totalBytes)} in all`}
        </p>
        <Button asChild>
          <Link to="/explore">Find more in Explore</Link>
        </Button>
      </div>

      {/* Looks through the names, descriptions, publishers and where each is kept. What is inside them is the Search page's. */}
      <div className="relative mt-4 max-w-md">
        <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-faint" />
        <Input
          type="search"
          aria-label="Search your collections by name"
          enterKeyHint="search"
          autoCapitalize="none"
          placeholder="Search your collections by name"
          className="pl-9"
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
      </div>

      {searching && found.length === 0 ? (
        <div className="mt-6 text-small text-ink-muted">
          <p>
            No collection is called anything like “{text.trim()}”. This looks at their names, descriptions and publishers; to look inside
            them, use{" "}
            <Link to={`/search?q=${encodeURIComponent(text.trim())}`} className="text-primary underline underline-offset-2">
              the Search page
            </Link>
            .
          </p>
          <Button className="mt-3" onClick={() => setText("")}>
            Show all collections
          </Button>
        </div>
      ) : null}

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
