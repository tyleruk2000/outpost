import type { SearchMode, SearchResponse, SearchResult } from "@outpost/shared";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Search as SearchIcon, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { EmptyState, ErrorState, Notice, Page } from "@/components/page";
import { Highlighted, kindMeta, kindOf } from "@/components/search-hit";
import { Button } from "@/components/ui/button";
import { Segmented, Skeleton } from "@/components/ui/misc";
import { api } from "@/lib/api";
import { cn, plural } from "@/lib/utils";
import { AnswerArea, AnswerHint } from "./answer";

const PAGE_SIZE = 20;

function ResultRow({ result }: { result: SearchResult }) {
  const kind = kindOf(result.kind);
  const context = [kind.label, result.collection, result.subtitle].filter(Boolean);
  return (
    <li className="py-5">
      <div className="flex items-baseline justify-between gap-4">
        <p className="flex min-w-0 flex-wrap items-center gap-x-2 text-small text-ink-muted">
          <kind.icon aria-hidden className="size-3.5 shrink-0" />
          {context.map((part, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed, ordered list of context parts
            <span key={index} className="truncate">
              {index > 0 ? (
                <span aria-hidden className="mr-2 text-border-strong">
                  /
                </span>
              ) : null}
              {part}
            </span>
          ))}
        </p>
        <span className="tabular shrink-0 text-micro text-ink-faint" title="Relevance, relative to the best match for this search">
          {Math.round(result.score * 100)}% match
        </span>
      </div>
      <h2 className="mt-1 font-title text-lead">
        <Link to={result.url} className="text-ink decoration-primary decoration-1 underline-offset-[0.22em] hover:underline">
          <Highlighted segments={result.titleSegments.length ? result.titleSegments : [{ text: result.title, hit: false }]} />
        </Link>
      </h2>
      {result.passages.length > 0 ? (
        <ul className="mt-2 grid gap-1.5">
          {result.passages.map((passage, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: passages have no identity beyond their order
            <li key={index} className="max-w-[78ch] text-small leading-relaxed text-ink-muted">
              {passage.page || passage.heading ? (
                <span className="mr-2 text-ink-faint">
                  {[passage.page ? `Page ${passage.page}` : null, passage.heading].filter(Boolean).join(", ")}
                </span>
              ) : null}
              <Highlighted segments={passage.segments} />
            </li>
          ))}
        </ul>
      ) : null}
      {result.tags.length > 0 ? <p className="mt-2 text-micro text-ink-faint">{result.tags.map((tag) => `#${tag}`).join("  ")}</p> : null}
    </li>
  );
}

export default function SearchPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const kind = params.get("kind") ?? "";
  const mode = (params.get("mode") as SearchMode | null) ?? undefined;
  const page = Math.max(1, Number(params.get("page")) || 1);
  const [draft, setDraft] = useState(q);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => setDraft(q), [q]);

  // Search as the person types, without filling the history with half-typed words.
  useEffect(() => {
    if (draft === q) return;
    const timer = window.setTimeout(() => {
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          if (draft) next.set("q", draft);
          else next.delete("q");
          next.delete("page");
          return next;
        },
        { replace: true },
      );
    }, 220);
    return () => window.clearTimeout(timer);
  }, [draft, q, setParams]);

  const search = useQuery({
    queryKey: ["search", "page", q, kind, mode ?? "", page],
    queryFn: ({ signal }) =>
      api.get<SearchResponse>(
        "/api/search",
        { q, kinds: kind || undefined, mode, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE },
        signal,
      ),
    enabled: q.trim().length > 0,
    placeholderData: keepPreviousData,
  });

  const setParam = (key: string, value: string | undefined) =>
    setParams((current) => {
      const next = new URLSearchParams(current);
      if (value) next.set(key, value);
      else next.delete(key);
      if (key !== "page") next.delete("page");
      return next;
    });

  const data = search.data;
  const facets = Object.entries(data?.facets ?? {}).sort((a, b) => b[1] - a[1]);
  const semanticOffered = data && !data.warnings.some((warning) => warning.source === "semantic") && data.mode !== "keyword";

  return (
    <Page>
      <h1 className="sr-only">Search</h1>
      <div className="relative max-w-[46rem]">
        <SearchIcon aria-hidden className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-ink-muted" />
        <input
          ref={inputRef}
          type="search"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Search documents, pages, collections and maps"
          aria-label="Search your library"
          // biome-ignore lint/a11y/noAutofocus: the search screen exists to be typed into
          autoFocus
          className="h-13 w-full rounded-panel border border-border-strong bg-page pr-12 pl-12 text-lead text-ink placeholder:text-ink-faint hover:border-ink-faint focus-visible:border-focus focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/30 [&::-webkit-search-cancel-button]:hidden"
        />
        {draft ? (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Clear search"
            className="absolute top-1/2 right-3 -translate-y-1/2"
            onClick={() => {
              setDraft("");
              inputRef.current?.focus();
            }}
          >
            <X />
          </Button>
        ) : null}
      </div>

      <AnswerArea q={q} mode={mode} referenceResults={q.trim() ? (data?.facets.reference ?? 0) : 0} />

      {!q.trim() ? (
        <EmptyState title="One search for everything you keep" seed={11} className="mt-8">
          <p>
            Type a word or a question. Results come from your documents (down to the page), your notes, installed collections and saved
            places.
          </p>
          <ul className="mt-4 grid gap-1.5 text-small">
            <li>
              <span className="font-mono text-[0.8125rem] text-ink">"clove hitch"</span> finds the exact phrase
            </li>
            <li>
              <span className="font-mono text-[0.8125rem] text-ink">water -chlorine</span> leaves out a word
            </li>
            <li>
              <span className="font-mono text-[0.8125rem] text-ink">54.4542, -3.2116</span> or{" "}
              <span className="font-mono text-[0.8125rem] text-ink">NY 215 072</span> opens the map there
            </li>
          </ul>
          <p className="mt-5 text-small">
            <Link to="/search/how-it-works" className="text-primary underline underline-offset-2">
              See how search works, step by step
            </Link>
          </p>
          <AnswerHint />
        </EmptyState>
      ) : (
        <>
          <div className="mt-6 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-border">
            <div role="tablist" aria-label="Filter results" className="scroll-quiet -mb-px flex gap-5 overflow-x-auto">
              {[
                ["", "Everything", undefined] as const,
                ...facets.map(([key, count]) => [key, kindMeta[key]?.plural ?? key, count] as const),
              ].map(([key, label, count]) => (
                <button
                  key={key || "all"}
                  type="button"
                  role="tab"
                  aria-selected={kind === key}
                  onClick={() => setParam("kind", key || undefined)}
                  className={cn(
                    "flex items-center gap-1.5 border-b-2 border-transparent pt-1 pb-2.5 text-small font-medium whitespace-nowrap text-ink-muted hover:text-ink",
                    kind === key && "border-primary text-ink",
                  )}
                >
                  {label}
                  {count !== undefined ? <span className="tabular text-micro text-ink-faint">{count}</span> : null}
                </button>
              ))}
            </div>
            {semanticOffered || mode ? (
              <Segmented
                label="How to search"
                value={mode ?? data?.mode ?? "keyword"}
                onChange={(next) => setParam("mode", next)}
                className="mb-2"
                options={[
                  { value: "hybrid", label: "Best of both" },
                  { value: "keyword", label: "Exact words" },
                  { value: "semantic", label: "By meaning" },
                ]}
              />
            ) : null}
          </div>

          {search.isPending ? (
            <div className="mt-6 grid gap-7" aria-busy>
              {[0, 1, 2].map((row) => (
                <div key={row} className="grid gap-2">
                  <Skeleton className="h-3 w-40" />
                  <Skeleton className="h-5 w-80 max-w-full" />
                  <Skeleton className="h-3 w-full max-w-[36rem]" />
                </div>
              ))}
            </div>
          ) : search.isError ? (
            <div className="mt-6">
              <ErrorState error={search.error} onRetry={() => search.refetch()} />
            </div>
          ) : data && data.results.length === 0 ? (
            <div className="mt-8 max-w-[52ch]">
              <h2 className="font-title text-heading">Nothing matches “{data.query}”</h2>
              <p className="mt-2 text-ink-muted">
                Check the spelling, try fewer or different words, or clear the filter. If you expected a document here, its text may still
                be processing: see{" "}
                <Link to="/downloads" className="text-primary underline underline-offset-2">
                  Downloads
                </Link>
                .
              </p>
            </div>
          ) : data ? (
            <div className={cn("transition-opacity", search.isPlaceholderData && "opacity-60")}>
              <p className="tabular mt-4 text-small text-ink-muted" aria-live="polite">
                {plural(data.total, "result")}
                {data.relaxed ? ". No single item had every word, so these match some of them." : ""}
                <span className="text-ink-faint"> in {data.tookMs} ms. </span>
                <Link to={`/search/how-it-works?q=${encodeURIComponent(data.query)}`} className="text-primary underline underline-offset-2">
                  How were these found?
                </Link>
              </p>
              {data.warnings.map((warning) => (
                <Notice key={warning.source} tone="info" className="mt-3 max-w-[46rem]">
                  {warning.message}
                </Notice>
              ))}
              <ol className="mt-1 divide-y divide-border">
                {data.results.map((result) => (
                  <ResultRow key={`${result.kind}:${result.entityId}`} result={result} />
                ))}
              </ol>
              {data.total > PAGE_SIZE ? (
                <nav aria-label="Result pages" className="mt-6 flex items-center gap-3">
                  <Button disabled={page <= 1} onClick={() => setParam("page", String(page - 1))}>
                    Previous
                  </Button>
                  <span className="tabular text-small text-ink-muted">
                    Page {page} of {Math.ceil(data.total / PAGE_SIZE)}
                  </span>
                  <Button disabled={page * PAGE_SIZE >= data.total} onClick={() => setParam("page", String(page + 1))}>
                    Next
                  </Button>
                </nav>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </Page>
  );
}
