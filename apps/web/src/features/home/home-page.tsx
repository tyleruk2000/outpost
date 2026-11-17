/**
 * Home. A plain account of the library and the shortest way back into it: what you
 * have, what you were last doing, and anything happening right now. Written as
 * sentences and lists rather than tiles of numbers.
 */
import {
  type CollectionsResponse,
  type DocumentFacets,
  type DocumentListResponse,
  type DownloadsResponse,
  formatBytes,
  formatDuration,
  type NoteListResponse,
  type NoteTreeResponse,
} from "@outpost/shared";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, BookOpen, Compass, FileText, Map as MapIcon, NotebookText, Search, Upload } from "lucide-react";
import { type FormEvent, type ReactNode, useState } from "react";
import { Link, useNavigate } from "react-router";
import { Contour } from "@/components/contour";
import { StorageBar } from "@/components/storage-bar";
import { Progress, Skeleton } from "@/components/ui/misc";
import { BoardHomeLine } from "@/features/board/elsewhere";
import { api } from "@/lib/api";
import { useActiveJobs, useStorage } from "@/lib/queries";
import { timeAgo } from "@/lib/utils";
import { homeSummary } from "./home-summary";

function Block({ title, more, children }: { title: string; more?: { to: string; label: string }; children: ReactNode }) {
  return (
    <section className="mt-10 first:mt-0">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-lead font-semibold text-ink">{title}</h2>
        {more ? (
          <Link to={more.to} className="flex items-center gap-1 text-small text-primary hover:underline">
            {more.label}
          </Link>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function RowLink({ to, icon, title, meta }: { to: string; icon: ReactNode; title: ReactNode; meta?: ReactNode }) {
  return (
    <li>
      <Link to={to} className="group flex items-center gap-3 py-2.5 text-ink">
        <span className="grid w-5 shrink-0 place-content-center text-ink-muted [&_svg]:size-[17px]">{icon}</span>
        <span className="min-w-0 flex-1 truncate font-title text-body decoration-primary decoration-1 underline-offset-[0.22em] group-hover:underline">
          {title}
        </span>
        {meta ? <span className="tabular shrink-0 text-small text-ink-muted">{meta}</span> : null}
      </Link>
    </li>
  );
}

const firstSteps = [
  {
    to: "/library?upload=1",
    icon: Upload,
    title: "Add your documents",
    text: "PDFs, books, manuals and notes you already have. Their text becomes searchable, down to the page.",
  },
  {
    to: "/explore",
    icon: Compass,
    title: "Download a reference collection",
    text: "Wikipedia, first aid, repair guides and more, each chosen on its own and kept on storage you pick.",
  },
  {
    to: "/maps",
    icon: MapIcon,
    title: "Download a map",
    text: "A country, a mountain range, or any box you draw. It works with no signal.",
  },
  {
    to: "/notes?new=1",
    icon: NotebookText,
    title: "Write a page",
    text: "Plans, kit lists, things learned. Pages link to each other and to your documents.",
  },
];

export default function HomePage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const storage = useStorage();
  const jobs = useActiveJobs();
  const tree = useQuery({
    queryKey: ["notes", "tree"],
    queryFn: () => api.get<NoteTreeResponse>("/api/notes/tree"),
    select: (data) => data.notes.length,
  });
  const recent = useQuery({
    queryKey: ["notes", "recent", 6],
    queryFn: () => api.get<NoteListResponse>("/api/notes/recent", { limit: 6 }),
    select: (data) => data.notes,
  });
  const facets = useQuery({ queryKey: ["documents", "facets"], queryFn: () => api.get<DocumentFacets>("/api/documents/facets") });
  const documents = useQuery({
    queryKey: ["documents", "list", "home"],
    queryFn: () => api.get<DocumentListResponse>("/api/documents", { sort: "added", order: "desc", limit: 5 }),
    select: (data) => data.documents,
  });
  const collections = useQuery({
    queryKey: ["collections", "all"],
    queryFn: () => api.get<CollectionsResponse>("/api/collections"),
    // Home counts things as a person would: a PDF fetched from the catalogue is one of
    // their documents (listed above), and terrain is part of the map it shades.
    select: (data) => data.collections.filter((item) => item.kind !== "terrain" && !(item.kind === "file" && item.meta?.documentId)),
  });
  // The sentence at the top counts every collection, as the Library's Collections tab does.
  const collectionCount = useQuery({
    queryKey: ["collections", "all"],
    queryFn: () => api.get<CollectionsResponse>("/api/collections"),
    select: (data) => data.collections.length,
  });
  const downloads = useQuery({
    queryKey: ["downloads", "list"],
    queryFn: () => api.get<DownloadsResponse>("/api/downloads"),
    select: (data) => data.downloads.filter((download) => ["queued", "running", "verifying", "paused"].includes(download.state)),
  });

  const locations = storage.data?.locations ?? [];
  const connected = locations.filter((location) => location.status === "available");
  const free = connected.reduce((sum, location) => sum + (location.freeBytes ?? 0), 0);
  const counts = { documents: facets.data?.total, pages: tree.data, collections: collectionCount.data };
  const loaded = counts.documents !== undefined && counts.pages !== undefined && counts.collections !== undefined && storage.isSuccess;
  const empty = loaded && counts.documents === 0 && counts.pages === 0 && counts.collections === 0;
  const otherWork = (jobs.data ?? []).filter((job) => job.queue !== "download" && job.state === "running");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (query.trim()) navigate(`/search?q=${encodeURIComponent(query.trim())}`);
  };

  const summary = !loaded
    ? null
    : homeSummary(
        { documents: counts.documents ?? 0, pages: counts.pages ?? 0, collections: counts.collections ?? 0 },
        free,
        connected.length,
      );

  return (
    <>
      <div className="relative isolate overflow-hidden border-b border-border">
        <Contour
          seed={5}
          columns={120}
          rows={30}
          levels={13}
          className="absolute inset-0 -z-10 size-full [mask-image:linear-gradient(95deg,transparent_30%,black_88%)]"
        />
        <div className="mx-auto w-full max-w-[70rem] px-5 pt-10 pb-9 md:px-10 md:pt-14 md:pb-11">
          <h1 className="font-title text-display text-ink">Your library</h1>
          <div className="mt-3 max-w-[56ch] text-lead text-ink-muted">{summary ?? <Skeleton className="h-6 w-96 max-w-full" />}</div>
          <BoardHomeLine className="mt-2" />
          {/* biome-ignore lint/a11y/useSemanticElements: a form with role="search" is the search landmark every browser and screen reader knows */}
          <form onSubmit={submit} role="search" className="relative mt-6 max-w-[34rem]">
            <Search aria-hidden className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-ink-muted" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search everything you keep"
              aria-label="Search everything you keep"
              className="h-12 w-full rounded-panel border border-border-strong bg-page pr-4 pl-12 text-body text-ink placeholder:text-ink-faint hover:border-ink-faint focus-visible:border-focus focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/30 [&::-webkit-search-cancel-button]:hidden"
            />
          </form>
        </div>
      </div>

      <div className="mx-auto grid w-full max-w-[70rem] gap-x-16 gap-y-10 px-5 pt-9 pb-24 md:px-10 md:pb-16 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="min-w-0">
          {(downloads.data?.length ?? 0) > 0 || otherWork.length > 0 ? (
            <Block title="Happening now" more={{ to: "/downloads", label: "All downloads" }}>
              <ul className="divide-y divide-border border-y border-border">
                {downloads.data?.map((download) => (
                  <li key={download.id} className="py-3">
                    <div className="mb-1.5 flex items-baseline justify-between gap-4">
                      <span className="min-w-0 truncate text-small font-medium text-ink">{download.title}</span>
                      <span className="tabular shrink-0 text-small text-ink-muted">
                        {download.state === "paused"
                          ? "Paused"
                          : download.state === "verifying"
                            ? "Checking the file"
                            : download.totalBytes
                              ? `${formatBytes(download.receivedBytes)} of ${formatBytes(download.totalBytes)}${download.etaSeconds ? `, ${formatDuration(download.etaSeconds)} left` : ""}`
                              : (download.message ?? "Waiting")}
                      </span>
                    </div>
                    <Progress
                      value={download.totalBytes ? download.receivedBytes / download.totalBytes : undefined}
                      tone={download.state === "paused" ? "muted" : "lamp"}
                      label={`Downloading ${download.title}`}
                    />
                  </li>
                ))}
                {otherWork.map((job) => (
                  <li key={job.id} className="py-3">
                    <div className="mb-1.5 flex items-baseline justify-between gap-4">
                      <span className="min-w-0 truncate text-small font-medium text-ink">{job.title}</span>
                      <span className="shrink-0 text-small text-ink-muted">{job.progress.message}</span>
                    </div>
                    <Progress
                      value={job.progress.total ? job.progress.current / job.progress.total : undefined}
                      tone="lamp"
                      label={job.title}
                    />
                  </li>
                ))}
              </ul>
            </Block>
          ) : null}

          {empty ? (
            <Block title="Start here">
              <ol className="divide-y divide-border border-y border-border">
                {firstSteps.map((step) => (
                  <li key={step.to}>
                    <Link to={step.to} className="group flex items-start gap-4 py-4">
                      <step.icon aria-hidden className="mt-0.5 size-5 shrink-0 text-primary" strokeWidth={1.6} />
                      <span className="min-w-0 flex-1">
                        <span className="block font-title text-lead text-ink decoration-primary decoration-1 underline-offset-[0.22em] group-hover:underline">
                          {step.title}
                        </span>
                        <span className="mt-0.5 block max-w-[60ch] text-small text-ink-muted">{step.text}</span>
                      </span>
                      <ArrowRight
                        aria-hidden
                        className="mt-1 size-4 shrink-0 text-ink-faint transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-primary"
                      />
                    </Link>
                  </li>
                ))}
              </ol>
            </Block>
          ) : (
            <>
              {recent.data && recent.data.length > 0 ? (
                <Block title="Pick up where you left off" more={{ to: "/notes", label: "All pages" }}>
                  <ul className="divide-y divide-border border-y border-border">
                    {recent.data.map((note) => (
                      <RowLink
                        key={note.id}
                        to={`/notes/${note.id}`}
                        icon={note.icon ? <span className="text-[1.0625rem] leading-none">{note.icon}</span> : <NotebookText />}
                        title={note.title || <span className="text-ink-muted">Untitled</span>}
                        meta={timeAgo(note.lastViewedAt ?? note.updatedAt)}
                      />
                    ))}
                  </ul>
                </Block>
              ) : null}

              {documents.data && documents.data.length > 0 ? (
                <Block title="Recently added documents" more={{ to: "/library", label: "All documents" }}>
                  <ul className="divide-y divide-border border-y border-border">
                    {documents.data.map((document) => (
                      <RowLink
                        key={document.id}
                        to={`/library/documents/${document.id}`}
                        icon={<FileText />}
                        title={document.title}
                        meta={
                          document.extraction === "pending" || document.extraction === "running"
                            ? "Reading text"
                            : timeAgo(document.createdAt)
                        }
                      />
                    ))}
                  </ul>
                </Block>
              ) : null}

              {collections.data && collections.data.length > 0 ? (
                <Block title="Collections" more={{ to: "/explore", label: "Find more" }}>
                  <ul className="divide-y divide-border border-y border-border">
                    {collections.data.slice(0, 6).map((collection) => (
                      <RowLink
                        key={collection.id}
                        to={
                          collection.kind === "zim"
                            ? `/library/read/${collection.id}/`
                            : collection.kind === "map" || collection.kind === "terrain"
                              ? "/maps"
                              : `/library/collections/${collection.id}`
                        }
                        icon={collection.kind === "map" || collection.kind === "terrain" ? <MapIcon /> : <BookOpen />}
                        title={collection.title}
                        meta={collection.locationAvailable ? formatBytes(collection.sizeBytes) : "Drive disconnected"}
                      />
                    ))}
                  </ul>
                  {collections.data.length > 6 ? (
                    <p className="mt-2 text-small">
                      <Link to="/library?tab=collections" className="text-primary hover:underline">
                        See all {collections.data.length}
                      </Link>
                    </p>
                  ) : null}
                </Block>
              ) : null}
            </>
          )}
        </div>

        <aside aria-label="Storage" className="min-w-0">
          <Block title="Storage" more={{ to: "/storage", label: "Manage" }}>
            {storage.isPending ? (
              <div className="grid gap-4" aria-busy>
                <Skeleton className="h-8" />
                <Skeleton className="h-8" />
              </div>
            ) : (
              <ul className="grid gap-5">
                {locations.map((location) => (
                  <li key={location.id}>
                    <div className="mb-1.5 flex items-baseline justify-between gap-4 text-small">
                      <span className="min-w-0 truncate font-medium text-ink">{location.name}</span>
                      <span className="tabular shrink-0 text-ink-muted">
                        {location.status === "available" ? `${formatBytes(location.freeBytes)} free` : "Disconnected"}
                      </span>
                    </div>
                    <StorageBar location={location} usage={location.usage} />
                  </li>
                ))}
              </ul>
            )}
          </Block>
          {!empty && loaded ? (
            <Block title="Add to it">
              <ul className="grid gap-1 text-small">
                {firstSteps.map((step) => (
                  <li key={step.to}>
                    <Link to={step.to} className="flex items-center gap-2.5 py-1 text-ink hover:text-primary">
                      <step.icon aria-hidden className="size-4 text-ink-muted" strokeWidth={1.6} />
                      {step.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </Block>
          ) : null}
        </aside>
      </div>
    </>
  );
}
