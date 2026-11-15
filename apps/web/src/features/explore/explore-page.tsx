import {
  CATALOG_CATEGORIES,
  type CatalogAddResponse,
  type CatalogEntryDto,
  type CatalogRefreshSummary,
  type CatalogResponse,
} from "@outpost/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CircleAlert, RefreshCw, Search, WifiOff, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";
import { EmptyState, ErrorState, Notice, Page, PageHeader } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Segmented, Select, Skeleton } from "@/components/ui/misc";
import { ApiError, api, errorMessage } from "@/lib/api";
import { plural, timeAgo } from "@/lib/utils";
import { useDownloads } from "../downloads/use-downloads";
import { type CategoryChoice, countByCategory, filterEntries, type ShowFilter, type SortOrder, sortEntries } from "./catalog";
import { type CategoryItem, CategoryNav } from "./category-nav";
import { DownloadDialog } from "./download-dialog";
import { EntryCard, EntryCardSkeleton } from "./entry-card";
import { PackList } from "./packs";
import { useCatalog } from "./use-catalog";

const showOptions: Array<{ value: ShowFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "included", label: "Included" },
  { value: "installed", label: "Installed" },
  { value: "not_installed", label: "Not installed" },
];
const sortOptions: Array<{ value: SortOrder; label: string }> = [
  { value: "name", label: "By name" },
  { value: "smallest", label: "Smallest first" },
  { value: "largest", label: "Largest first" },
];

const grid = "grid grid-cols-[repeat(auto-fill,minmax(min(100%,21rem),1fr))] gap-4";

function refreshSummary(summary: CatalogRefreshSummary): string {
  const parts = [`${plural(summary.available, "collection")} confirmed with their current size and version`];
  if (summary.unavailable.length > 0) parts.push(`${summary.unavailable.length} no longer offered`);
  if (summary.unchecked.length > 0) parts.push(`${summary.unchecked.length} could not be checked this time`);
  return `${parts.join(", ")}.`;
}

/** Why the refresh did not happen. Being offline is ordinary here, so it is said calmly. */
function RefreshProblem({ error, onDismiss }: { error: unknown; onDismiss: () => void }) {
  const offline = error instanceof ApiError && (error.code === "offline" || error.isUnreachable);
  const dismiss = (
    <Button variant="ghost" size="icon-sm" aria-label="Dismiss" onClick={onDismiss} className="-my-1 -mr-1.5">
      <X />
    </Button>
  );
  return offline ? (
    <Notice
      tone="info"
      icon={<WifiOff />}
      title="The catalogue was not refreshed: there is no connection"
      action={dismiss}
      className="mb-6"
    >
      The list below still works from the last known details. Sizes marked “about” are estimates, and anything already installed opens as
      usual. Downloading needs the connection back.
    </Notice>
  ) : (
    <Notice tone="danger" icon={<CircleAlert />} title="The catalogue could not be refreshed" action={dismiss} className="mb-6">
      {errorMessage(error)}
    </Notice>
  );
}

function ProblemsNote({ problems }: { problems: CatalogResponse["problems"] }) {
  return (
    <details className="mt-10 rounded-panel border border-border px-4 py-3 text-small text-ink-muted">
      <summary className="cursor-pointer rounded-control text-ink">
        {plural(problems.length, "catalogue entry", "catalogue entries")} could not be read and {problems.length === 1 ? "is" : "are"} not
        listed
      </summary>
      <ul className="mt-2 grid gap-1.5">
        {problems.map((problem, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: problems have no identity beyond their order
          <li key={index}>
            <span className="font-mono text-[0.8125rem] break-all text-ink">
              {[problem.file, problem.entryId].filter(Boolean).join(" → ")}
            </span>
            <span className="block">{problem.message}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}

function LoadingCatalogue() {
  return (
    <div className="lg:grid lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-x-10" aria-busy>
      <div className="grid content-start gap-3 max-lg:hidden">
        {[72, 88, 64, 80, 70, 84].map((width) => (
          <Skeleton key={width} style={{ width: `${width}%` }} />
        ))}
      </div>
      <div>
        <Skeleton className="h-9" />
        <ul className={`${grid} mt-6`}>
          <EntryCardSkeleton />
          <EntryCardSkeleton />
          <EntryCardSkeleton />
          <EntryCardSkeleton />
        </ul>
      </div>
    </div>
  );
}

export default function ExplorePage() {
  const catalog = useCatalog();
  const downloads = useDownloads();
  const client = useQueryClient();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState("");
  const [show, setShow] = useState<ShowFilter>("all");
  const [sort, setSort] = useState<SortOrder>("name");
  const [downloading, setDownloading] = useState<{ entry: CatalogEntryDto; open: boolean }>();

  const refresh = useMutation({
    mutationFn: () => api.post<CatalogRefreshSummary>("/api/catalog/refresh"),
    onSuccess: (summary) => {
      toast.success("Catalogue refreshed", { description: refreshSummary(summary) });
      return client.invalidateQueries({ queryKey: ["catalog"] });
    },
  });

  // Entries that ship with Outpost are copied into the library there and then: no network, nothing to confirm.
  const add = useMutation({
    mutationFn: (entry: CatalogEntryDto) => api.post<CatalogAddResponse>(`/api/catalog/entries/${encodeURIComponent(entry.id)}/add`),
    onSuccess: (response, entry) => {
      const target = response.documentId ? `/library/documents/${response.documentId}` : `/library/collections/${response.collectionId}`;
      toast.success(`“${entry.name}” is in your library`, {
        description: response.chapterCount
          ? `Its ${response.chapterCount} chapters are stored on this server and their text is searchable.`
          : "It is stored on this server and its text is searchable.",
        action: { label: "Open", onClick: () => navigate(target) },
      });
      void client.invalidateQueries({ queryKey: ["documents"] });
      void client.invalidateQueries({ queryKey: ["collections"] });
      return client.invalidateQueries({ queryKey: ["catalog"] });
    },
    onError: (error, entry) => toast.error(`“${entry.name}” could not be added`, { description: errorMessage(error) }),
  });

  const entries = catalog.data?.entries ?? [];
  const markedId = params.get("entry");
  const markedEntry = markedId ? entries.find((entry) => entry.id === markedId) : undefined;
  const requested = params.get("category");
  // A link to one entry opens its category unless the address names another.
  const packs = catalog.data?.packs ?? [];
  const category: CategoryChoice =
    requested === "packs" && packs.length > 0
      ? "packs"
      : (CATALOG_CATEGORIES.find((item) => item.slug === requested)?.slug ?? markedEntry?.category ?? "all");

  const setCategory = (next: CategoryChoice) =>
    setParams((current) => {
      const updated = new URLSearchParams(current);
      if (next === "all") updated.delete("category");
      else updated.set("category", next);
      updated.delete("entry");
      return updated;
    });

  const matching = useMemo(() => filterEntries(entries, { query, show }), [entries, query, show]);
  const counts = useMemo(() => countByCategory(matching), [matching]);
  const downloadById = useMemo(() => new Map((downloads.data ?? []).map((item) => [item.id, item])), [downloads.data]);

  const categories = catalog.data?.categories ?? [];
  const labelOf = (slug: string) => categories.find((item) => item.slug === slug)?.label ?? slug;
  const navItems: CategoryItem[] = [
    // Packs come first: they are the answer to "where do I start?".
    ...(packs.length > 0 ? [{ slug: "packs" as const, label: "Packs", count: packs.length }] : []),
    { slug: "all", label: "All collections", count: counts.all ?? 0 },
    // Maps are fetched by region on their own screen, so "0" beside them would be wrong.
    ...categories.map((item) => ({
      slug: item.slug,
      label: item.label,
      count: item.slug === "maps" && item.count === 0 ? null : (counts[item.slug] ?? 0),
    })),
  ];

  const filtered = query.trim() !== "" || show !== "all";
  const clearFilters = () => {
    setQuery("");
    setShow("all");
  };

  const inCategory = category === "all" || category === "packs" ? matching : matching.filter((entry) => entry.category === category);
  const shown = sortEntries(inCategory, sort);
  // By name, the whole catalogue reads best under its category headings; by size it is one ranked list.
  const grouped = category === "all" && sort === "name";
  const groups = grouped
    ? categories
        .map((item) => ({ ...item, entries: shown.filter((entry) => entry.category === item.slug) }))
        .filter((group) => group.entries.length > 0)
    : [{ slug: category, label: category === "all" || category === "packs" ? "All collections" : labelOf(category), entries: shown }];

  const card = (entry: CatalogEntryDto) => (
    <EntryCard
      key={entry.id}
      entry={entry}
      download={entry.downloadId ? downloadById.get(entry.downloadId) : undefined}
      adding={add.isPending && add.variables?.id === entry.id}
      marked={entry.id === markedId}
      categoryLabel={category === "all" && !grouped ? labelOf(entry.category) : undefined}
      onDownload={(chosen) => setDownloading({ entry: chosen, open: true })}
      onAdd={(chosen) => add.mutate(chosen)}
    />
  );

  const lastRefreshed = catalog.data?.lastRefreshedAt ?? null;
  const emptyMapsCategory = category === "maps" && (categories.find((item) => item.slug === "maps")?.count ?? 0) === 0;

  return (
    <Page>
      <PageHeader
        title="Explore"
        description="Reference collections you can keep on this server and read without a connection. Choose them one at a time; each shows its real size before anything is fetched. A few reference sheets are included with Outpost and need no download."
        actions={
          catalog.data ? (
            <div className="flex flex-col gap-1.5 md:items-end">
              <Button onClick={() => refresh.mutate()} loading={refresh.isPending}>
                {refresh.isPending ? null : <RefreshCw />} Refresh catalogue
              </Button>
              <p className="text-small text-ink-muted">
                {lastRefreshed
                  ? `Sizes and versions checked ${timeAgo(lastRefreshed)}`
                  : "Sizes are estimates until the catalogue is refreshed"}
              </p>
            </div>
          ) : null
        }
      />

      {refresh.isError ? <RefreshProblem error={refresh.error} onDismiss={() => refresh.reset()} /> : null}

      {catalog.isPending ? (
        <LoadingCatalogue />
      ) : catalog.isError ? (
        <ErrorState error={catalog.error} onRetry={() => catalog.refetch()} />
      ) : (
        <div className="lg:grid lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-x-10">
          <CategoryNav items={navItems} value={category} onChange={setCategory} />

          {category === "packs" ? (
            <div className="min-w-0 max-lg:mt-3">
              <h2 className="text-lead font-semibold text-ink">Packs</h2>
              <p className="mt-1 mb-4 max-w-[68ch] text-small text-ink-muted">
                A pack gathers the usual things for one purpose so that they can be fetched together. Everything in a pack is also listed on
                its own in the catalogue, with its publisher and licence. You choose what to leave out and where to keep it before anything
                starts.
              </p>
              <PackList packs={packs} entries={entries} />
            </div>
          ) : (
            <div className="min-w-0 max-lg:mt-3">
              {packs.length > 0 && category === "all" && !filtered ? (
                <p className="mb-4 text-small text-ink-muted">
                  Not sure where to start?{" "}
                  <button type="button" onClick={() => setCategory("packs")} className="text-primary underline underline-offset-2">
                    Packs
                  </button>{" "}
                  gather the usual things for a purpose, such as home preparedness, the hills, or radio.
                </p>
              ) : null}
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative min-w-56 flex-1 max-md:basis-full">
                  <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-muted" />
                  <Input
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Filter by name, publisher or topic"
                    aria-label="Filter collections"
                    className="pl-9 [&::-webkit-search-cancel-button]:hidden"
                  />
                </div>
                <Segmented label="Show" value={show} onChange={setShow} options={showOptions} className="max-md:hidden" />
                <div className="flex gap-3 max-md:basis-full [&>*]:min-w-0 [&>*]:flex-1">
                  <Select
                    aria-label="Show"
                    value={show}
                    onChange={setShow}
                    options={showOptions.map((option) => ({ ...option, label: option.value === "all" ? "Show all" : option.label }))}
                    className="md:hidden"
                  />
                  <Select aria-label="Sort" value={sort} onChange={setSort} options={sortOptions} className="md:w-40" />
                </div>
              </div>

              {filtered && !emptyMapsCategory && shown.length > 0 ? (
                <p className="mt-3 text-small text-ink-muted" role="status">
                  <span className="tabular">
                    {shown.length} of{" "}
                    {plural(
                      category === "all" ? entries.length : entries.filter((entry) => entry.category === category).length,
                      "collection",
                    )}
                  </span>{" "}
                  {shown.length === 1 ? "fits" : "fit"} the filter.{" "}
                  <button type="button" onClick={clearFilters} className="text-primary underline underline-offset-2">
                    Clear filters
                  </button>
                </p>
              ) : null}

              {emptyMapsCategory ? (
                <EmptyState
                  title="Maps are downloaded by region"
                  seed={5}
                  compact
                  className="mt-6"
                  action={
                    <Button asChild variant="primary">
                      <Link to="/maps">Open Maps</Link>
                    </Button>
                  }
                >
                  Offline maps are not single files in this catalogue. On the Maps screen you choose the regions you need, see their size,
                  and download just those.
                </EmptyState>
              ) : shown.length === 0 ? (
                <EmptyState
                  title={filtered ? "Nothing matches" : "Nothing in this category yet"}
                  compact
                  className="mt-6"
                  action={
                    <>
                      {filtered ? <Button onClick={clearFilters}>Clear filters</Button> : null}
                      {category !== "all" && (counts.all ?? 0) > 0 ? (
                        <Button onClick={() => setCategory("all")}>Show all categories</Button>
                      ) : null}
                    </>
                  }
                >
                  {filtered ? (
                    <>
                      No collection{category === "all" ? "" : ` in “${labelOf(category)}”`} fits{" "}
                      {query.trim() ? `“${query.trim()}”` : "this filter"}
                      {show === "installed"
                        ? " among those installed"
                        : show === "not_installed"
                          ? " among those not installed"
                          : show === "included"
                            ? " among those included with Outpost"
                            : ""}
                      .
                      {category !== "all" && (counts.all ?? 0) > 0
                        ? ` ${plural(counts.all ?? 0, "match", "matches")} in other categories.`
                        : ""}
                    </>
                  ) : (
                    "The catalogue has no entries here."
                  )}
                </EmptyState>
              ) : (
                groups.map((group) => (
                  <section key={group.slug} className="mt-8 first-of-type:mt-6" aria-labelledby={`category-${group.slug}`}>
                    <div className="mb-3 flex items-baseline gap-3">
                      <h2 id={`category-${group.slug}`} className="text-lead font-semibold text-ink">
                        {group.label}
                      </h2>
                      <p className="tabular text-small text-ink-muted">{group.entries.length}</p>
                    </div>
                    <ul className={grid}>{group.entries.map(card)}</ul>
                  </section>
                ))
              )}

              {catalog.data.problems.length > 0 ? <ProblemsNote problems={catalog.data.problems} /> : null}
            </div>
          )}
        </div>
      )}

      <DownloadDialog
        entry={downloading?.entry}
        open={Boolean(downloading?.open)}
        onOpenChange={(open) => setDownloading((current) => (current ? { ...current, open } : current))}
      />
    </Page>
  );
}
