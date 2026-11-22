import type { SearchMode, SearchResponse, SearchResult } from "@outpost/shared";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ChevronRight, LoaderCircle, Search as SearchIcon, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { findPlaces, type Place } from "@/components/find-places";
import { EmptyState, ErrorState, Notice, Page } from "@/components/page";
import { ScreensUnder } from "@/components/screens-under";
import { Highlighted, kindMeta, kindOf, resultHref } from "@/components/search-hit";
import { Button } from "@/components/ui/button";
import { Segmented, Skeleton } from "@/components/ui/misc";
import { findGuides, useGuideIndex } from "@/features/help/guide-places";
import { api } from "@/lib/api";
import { type ReferenceSearch, referenceProgress, referenceTrouble, useReferenceSearch } from "@/lib/reference-search";
import { cn, plural } from "@/lib/utils";
import { AnswerArea, AnswerHint } from "./answer";

const PAGE_SIZE = 20;
/** How many screens a search offers to go to, at most: the quick search's matching, on the search page. */
const PLACES_SHOWN = 3;

/**
 * The screens of Outpost that match the words, as the quick search finds them: "safe drinking water" offers
 * Tools: Water, which holds the treatment tables. Above the results, since it is a place to go, not a match.
 */
function GoTo({ places }: { places: Place[] }) {
  return (
    <section aria-labelledby="go-to" className="mt-4 max-w-[46rem]">
      <h2 id="go-to" className="text-small font-medium text-ink-muted">
        Go to
      </h2>
      <ul className="mt-1 divide-y divide-border border-y border-border">
        {places.map((place) => (
          <li key={place.to}>
            <Link to={place.to} className="group flex min-h-11 items-start gap-3 py-2.5 text-ink">
              <place.icon aria-hidden className="mt-0.5 size-[18px] shrink-0 text-ink-muted" strokeWidth={1.6} />
              <span className="min-w-0 flex-1">
                <span className="block font-medium group-hover:underline group-hover:decoration-primary group-hover:underline-offset-4">
                  {place.parent ? <span className="font-normal text-ink-muted">{place.parent.label}:</span> : null}
                  {place.parent ? " " : null}
                  {place.label}
                </span>
                {"about" in place && typeof place.about === "string" ? (
                  <span className="mt-0.5 line-clamp-2 block text-small text-ink-muted">{place.about}</span>
                ) : null}
              </span>
              <ChevronRight aria-hidden className="mt-1 size-4 shrink-0 text-ink-faint" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ResultRow({ result, heading: Heading = "h2" }: { result: SearchResult; heading?: "h2" | "h3" }) {
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
      <Heading className="mt-1 font-title text-lead">
        <Link to={resultHref(result)} className="text-ink decoration-primary decoration-1 underline-offset-[0.22em] hover:underline">
          <Highlighted segments={result.titleSegments.length ? result.titleSegments : [{ text: result.title, hit: false }]} />
        </Link>
      </Heading>
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

function Pager({ page, pages, onPage }: { page: number; pages: number; onPage: (page: number) => void }) {
  return (
    <nav aria-label="Result pages" className="mt-6 flex flex-wrap items-center gap-3">
      <Button disabled={page <= 1} onClick={() => onPage(page - 1)}>
        Previous
      </Button>
      <span className="tabular text-small text-ink-muted">
        Page {page} of {pages}
      </span>
      <Button disabled={page >= pages} onClick={() => onPage(page + 1)}>
        Next
      </Button>
    </nav>
  );
}

/** While collections are still answering: a quiet line that says so and how far it has got. */
function StillSearching({ reference, className }: { reference: ReferenceSearch; className?: string }) {
  return (
    <p className={cn("flex items-center gap-2 text-small text-ink-muted", className)}>
      <LoaderCircle aria-hidden className="size-3.5 shrink-0 animate-spin" />
      <span className="tabular">{referenceProgress(reference)}</span>
    </p>
  );
}

/** Which collections are missing from the results, and why. */
function ReferenceTrouble({ reference }: { reference: ReferenceSearch }) {
  if (reference.status !== "done") return null;
  return (
    <>
      {referenceTrouble(reference).map((sentence) => (
        <Notice key={sentence} tone="info" className="mt-3 max-w-[46rem]">
          {sentence}
        </Notice>
      ))}
    </>
  );
}

/**
 * One line under the count of a person's own results that says where the search of
 * reference collections has got to. It is there from the first results and always one
 * line high, so that nothing below it moves when the collections answer.
 */
function ReferenceLine({ reference, onShow }: { reference: ReferenceSearch; onShow: () => void }) {
  const found = reference.results.length;
  const missing = reference.missing.length;
  return (
    <p className="tabular mt-1 truncate text-small text-ink-muted" role="status">
      {reference.status !== "done" ? (
        referenceProgress(reference)
      ) : reference.problem ? (
        "Reference collections were not searched; the reason is below."
      ) : (
        <>
          {found > 0 ? (
            <button type="button" onClick={onShow} className="text-primary underline underline-offset-2">
              {plural(found, "article")} in reference collections
            </button>
          ) : (
            "No article in your reference collections matches"
          )}
          {missing > 0 ? `. ${plural(missing, "collection")} ${missing === 1 ? "is" : "are"} missing; see below.` : "."}
        </>
      )}
    </p>
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
        // Reference collections are asked separately (below), so that these results never wait on them.
        {
          q,
          kinds: kind || undefined,
          mode,
          limit: PAGE_SIZE,
          offset: kind === "reference" ? 0 : (page - 1) * PAGE_SIZE,
          reference: "later",
        },
        signal,
      ),
    enabled: q.trim().length > 0,
    placeholderData: keepPreviousData,
  });
  const reference = useReferenceSearch(q, search.data?.referenceToCome === true);

  const setParam = (key: string, value: string | undefined) =>
    setParams((current) => {
      const next = new URLSearchParams(current);
      if (value) next.set(key, value);
      else next.delete(key);
      if (key !== "page") next.delete("page");
      return next;
    });

  const data = search.data;
  const facets = Object.entries(data?.facets ?? {})
    .filter(([key]) => key !== "reference")
    // Most first, and what would have to be downloaded after every kind that is on this device.
    .sort((a, b) => Number(a[0] === "catalog") - Number(b[0] === "catalog") || b[1] - a[1]);
  // Reference comes last and is there from the first results, so the other tabs never move when its count arrives.
  const referenceTab = data?.referenceToCome || kind === "reference" || reference.results.length > 0;
  const referenceCount = reference.results.length > 0 || reference.status === "done" ? reference.results.length : undefined;
  // On "Everything", reference results follow a person's own. They count as something to show while they may still come.
  const referenceBelow = kind === "" && Boolean(data?.referenceToCome) && reference.status !== "idle";
  const trouble = referenceTrouble(reference);
  const referenceHasSomething = reference.status === "searching" || reference.results.length > 0 || trouble.length > 0;
  const referencePages = Math.max(1, Math.ceil(reference.results.length / PAGE_SIZE));
  const referencePage = Math.min(page, referencePages);
  // On "Everything", what would have to be downloaded is listed apart, last of all: after a person's own results and after
  // what the reference collections hold, which are on this device too. The server ranks it last as well (docs/search.md).
  const everything = kind === "";
  const own = data ? (everything ? data.results.filter((result) => result.kind !== "catalog") : data.results) : [];
  const toDownload = everything && data ? data.results.filter((result) => result.kind === "catalog") : [];
  // Added once the reference collections have answered, so that it never moves under a finger.
  const toDownloadShown = toDownload.length > 0 && !(referenceBelow && reference.status !== "done");
  const guides = useGuideIndex(everything && Boolean(q.trim()));
  const places = everything && page === 1 && q.trim() ? [...findPlaces(q), ...findGuides(q, guides)].slice(0, PLACES_SHOWN) : [];
  const semanticOffered = data && !data.warnings.some((warning) => warning.source === "semantic") && data.mode !== "keyword";

  return (
    <Page>
      <h1 className="sr-only">Search</h1>
      {/* The box, and beside it (under it on a phone) the screens under Search: How search works. */}
      <div className="flex flex-wrap items-center gap-x-8 gap-y-2">
        <div className="relative w-full max-w-[46rem] min-w-0 flex-[1_1_30rem]">
          <SearchIcon aria-hidden className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-ink-muted" />
          <input
            ref={inputRef}
            type="search"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Search everything you keep"
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
        <ScreensUnder parent="/search" />
      </div>

      <AnswerArea q={q} mode={mode} referenceResults={q.trim() ? reference.results.length : 0} />

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
          <AnswerHint />
        </EmptyState>
      ) : (
        <>
          <div className="mt-6 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-border">
            <div
              role="tablist"
              aria-label="Filter results"
              // One stop for Tab, and the arrow keys move along it, as tabs do everywhere else (WAI-ARIA tabs).
              onKeyDown={(event) => {
                const tabs = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
                const at = tabs.indexOf(event.target as HTMLButtonElement);
                if (at < 0) return;
                const to = { ArrowRight: at + 1, ArrowLeft: at - 1, Home: 0, End: tabs.length - 1 }[event.key];
                if (to === undefined) return;
                event.preventDefault();
                const next = tabs[(to + tabs.length) % tabs.length];
                next?.focus();
                next?.click();
              }}
              className="scroll-quiet -mb-px flex gap-5 overflow-x-auto"
            >
              {[
                ["", "Everything", undefined] as const,
                ...facets.map(([key, count]) => [key, kindMeta[key]?.plural ?? key, count] as const),
                ...(referenceTab ? [["reference", kindMeta.reference!.plural, referenceCount] as const] : []),
              ].map(([key, label, count]) => (
                <button
                  key={key || "all"}
                  type="button"
                  role="tab"
                  aria-selected={kind === key}
                  tabIndex={kind === key ? 0 : -1}
                  onClick={() => setParam("kind", key || undefined)}
                  className={cn(
                    "relative flex items-center gap-1.5 border-b-2 border-transparent pt-1 pb-2.5 text-small font-medium whitespace-nowrap text-ink-muted hover:text-ink max-md:min-h-11",
                    kind === key && "border-primary text-ink",
                  )}
                >
                  {label}
                  {count !== undefined ? (
                    <span className="tabular text-micro text-ink-faint">
                      <span className="sr-only">, </span>
                      {count}
                    </span>
                  ) : null}
                  {key === "reference" && reference.status === "searching" ? (
                    <LoaderCircle aria-hidden className="size-3 animate-spin text-ink-faint" />
                  ) : null}
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

          {places.length > 0 ? <GoTo places={places} /> : null}
          {kind === "reference" ? (
            <section aria-label="Reference results">
              {reference.results.length > 0 ? (
                <>
                  <p className="tabular mt-4 text-small text-ink-muted" role="status">
                    {plural(reference.results.length, "article")} in reference collections
                    {reference.status === "searching" ? " so far." : "."}
                  </p>
                  <ReferenceTrouble reference={reference} />
                  <ol className="mt-1 divide-y divide-border">
                    {reference.results.slice((referencePage - 1) * PAGE_SIZE, referencePage * PAGE_SIZE).map((result) => (
                      <ResultRow key={`${result.kind}:${result.entityId}`} result={result} />
                    ))}
                  </ol>
                  {reference.status === "searching" ? <StillSearching reference={reference} className="mt-2" /> : null}
                  {referencePages > 1 ? (
                    <Pager page={referencePage} pages={referencePages} onPage={(next) => setParam("page", String(next))} />
                  ) : null}
                </>
              ) : reference.status === "searching" || search.isPending ? (
                <StillSearching reference={reference} className="mt-6" />
              ) : (
                <div className="mt-8 max-w-[52ch]">
                  <h2 className="font-title text-heading">Nothing in your reference collections matches “{q}”</h2>
                  <p className="mt-2 text-ink-muted">Check the spelling, or try fewer or different words.</p>
                  <ReferenceTrouble reference={reference} />
                </div>
              )}
            </section>
          ) : search.isPending ? (
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
          ) : data && data.results.length === 0 && !(referenceBelow && referenceHasSomething) ? (
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
            <>
              <div className={cn("transition-opacity", search.isPlaceholderData && "opacity-60")}>
                {own.length === 0 ? (
                  <p className="mt-4 text-small text-ink-muted" aria-live="polite">
                    Nothing of your own matches “{data.query}”.
                  </p>
                ) : (
                  <p className="tabular mt-4 text-small text-ink-muted" aria-live="polite">
                    {plural(data.total, "result")}
                    {data.relaxed ? ". No single item had every word, so these match some of them." : ""}
                    <span className="text-ink-faint"> in {data.tookMs} ms. </span>
                    <Link
                      to={`/search/how-it-works?q=${encodeURIComponent(data.query)}`}
                      className="text-primary underline underline-offset-2"
                    >
                      How were these found?
                    </Link>
                  </p>
                )}
                {referenceBelow ? <ReferenceLine reference={reference} onShow={() => setParam("kind", "reference")} /> : null}
                {data.warnings.map((warning) => (
                  <Notice
                    key={warning.source}
                    tone="info"
                    className="mt-3 max-w-[46rem]"
                    action={
                      warning.source === "semantic" ? (
                        <Link to="/settings#semantic" className="text-primary underline underline-offset-2">
                          Set up search by meaning
                        </Link>
                      ) : undefined
                    }
                  >
                    {warning.message}
                  </Notice>
                ))}
                {own.length > 0 ? (
                  <ol className="mt-1 divide-y divide-border">
                    {own.map((result) => (
                      <ResultRow key={`${result.kind}:${result.entityId}`} result={result} />
                    ))}
                  </ol>
                ) : null}
                {data.total > PAGE_SIZE ? (
                  <Pager page={page} pages={Math.ceil(data.total / PAGE_SIZE)} onPage={(next) => setParam("page", String(next))} />
                ) : null}
              </div>
              {referenceBelow ? (
                // Always after a person's own results, and only ever added to at its end: nothing above it moves.
                <section aria-labelledby="reference-results" className="mt-8 border-t border-border pt-5">
                  <h2 id="reference-results" className="text-lead font-medium text-ink">
                    In reference collections
                  </h2>
                  <ReferenceTrouble reference={reference} />
                  {reference.best.length > 0 ? (
                    <>
                      <p className="mt-1 text-small text-ink-muted">The best match from each collection that has one.</p>
                      <ol className="divide-y divide-border">
                        {reference.best.map((result) => (
                          <ResultRow key={`${result.kind}:${result.entityId}`} result={result} heading="h3" />
                        ))}
                      </ol>
                    </>
                  ) : reference.status === "done" && trouble.length === 0 ? (
                    <p className="mt-2 text-small text-ink-muted">No article in your reference collections matches.</p>
                  ) : null}
                  {reference.status === "searching" ? <StillSearching reference={reference} className="mt-2" /> : null}
                  {reference.status === "done" && reference.results.length > reference.best.length ? (
                    <Button className="mt-4" onClick={() => setParam("kind", "reference")}>
                      See all {reference.results.length} reference results
                    </Button>
                  ) : null}
                </section>
              ) : null}
              {toDownloadShown ? (
                <section aria-labelledby="download-results" className="mt-8 border-t border-border pt-5">
                  <h2 id="download-results" className="text-lead font-medium text-ink">
                    Available to download
                  </h2>
                  <p className="mt-1 text-small text-ink-muted">Not on this device: each needs a connection to download first.</p>
                  <ol className="divide-y divide-border">
                    {toDownload.map((result) => (
                      <ResultRow key={`${result.kind}:${result.entityId}`} result={result} heading="h3" />
                    ))}
                  </ol>
                </section>
              ) : null}
            </>
          ) : null}
        </>
      )}
    </Page>
  );
}
