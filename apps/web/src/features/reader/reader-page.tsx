/**
 * The reader for reference collections (Wikipedia and other ZIM archives).
 *
 * Pages are shown in a sandboxed frame: they are copies of other people's web sites,
 * scripts included, and must not share Outpost's origin. The frame cannot be inspected
 * from here, so a small script the server adds to each page reports which article is
 * showing and hands over links that leave the library.
 */
import type { ReferenceBookResponse, ReferenceSearchResponse, ReferenceSuggestion } from "@outpost/shared";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ArrowLeft, ExternalLink, House, Search, X } from "lucide-react";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { ErrorState, Notice, Page } from "@/components/page";
import { Highlighted } from "@/components/search-hit";
import { Button } from "@/components/ui/button";
import { Skeleton, Tooltip } from "@/components/ui/misc";
import { api } from "@/lib/api";
import { cn, formatNumber } from "@/lib/utils";

const encodePath = (path: string) => path.split("/").map(encodeURIComponent).join("/");

function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export default function ReaderPage() {
  const { collectionId = "", "*": routePath = "" } = useParams();
  const navigate = useNavigate();
  const frameRef = useRef<HTMLIFrameElement>(null);
  /** The article the frame is showing, as last reported by the page itself. */
  const shownPath = useRef<string | null>(null);
  const [articleTitle, setArticleTitle] = useState<string>();
  const [external, setExternal] = useState<string>();
  const [query, setQuery] = useState("");
  const [searchFor, setSearchFor] = useState<string>();
  const [focused, setFocused] = useState(false);
  const debounced = useDebounced(query.trim(), 160);

  const book = useQuery({
    queryKey: ["kiwix", "book", collectionId],
    queryFn: () => api.get<ReferenceBookResponse>(`/api/kiwix/books/${collectionId}`),
    // The address carries a token that expires; refresh it well within its lifetime.
    refetchInterval: 6 * 60 * 60 * 1000,
  });
  const contentBase = book.data?.book.contentBase;

  // The frame's address is set once per deliberate navigation (opening the reader, a
  // search result, the home button). Links clicked inside the frame change the frame
  // on their own and are only mirrored into the address bar.
  const [frameSrc, setFrameSrc] = useState<string>();
  useEffect(() => {
    if (!contentBase) return;
    if (shownPath.current === routePath) return;
    shownPath.current = routePath;
    setFrameSrc(`${contentBase}${encodePath(routePath)}`);
  }, [contentBase, routePath]);

  useEffect(() => {
    if (!contentBase) return;
    const basePath = new URL(contentBase, window.location.origin).pathname;
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frameRef.current?.contentWindow) return;
      const data = event.data as { type?: unknown; path?: unknown; title?: unknown; href?: unknown } | null;
      if (!data || typeof data !== "object") return;
      if (data.type === "outpost:reader" && typeof data.path === "string" && data.path.startsWith(basePath)) {
        let path: string;
        try {
          path = decodeURIComponent(data.path.slice(basePath.length));
        } catch {
          return;
        }
        if (typeof data.title === "string") setArticleTitle(data.title.slice(0, 200));
        if (path !== shownPath.current) {
          shownPath.current = path;
          navigate(`/library/read/${collectionId}/${encodePath(path)}`, { replace: true });
        }
      } else if (data.type === "outpost:external" && typeof data.href === "string" && /^https?:\/\//.test(data.href)) {
        setExternal(data.href.slice(0, 2000));
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [contentBase, collectionId, navigate]);

  const suggestions = useQuery({
    queryKey: ["kiwix", "suggest", collectionId, debounced],
    queryFn: () => api.get<{ suggestions: ReferenceSuggestion[] }>(`/api/kiwix/books/${collectionId}/suggest`, { q: debounced }),
    enabled: focused && debounced.length > 1 && !searchFor,
    placeholderData: keepPreviousData,
    select: (data) => data.suggestions,
  });
  const results = useQuery({
    queryKey: ["kiwix", "search", collectionId, searchFor],
    queryFn: () => api.get<ReferenceSearchResponse>(`/api/kiwix/books/${collectionId}/search`, { q: searchFor, limit: 30 }),
    enabled: Boolean(searchFor),
  });

  const open = (path: string) => {
    setSearchFor(undefined);
    setFocused(false);
    setQuery("");
    setExternal(undefined);
    navigate(`/library/read/${collectionId}/${encodePath(path)}`);
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (query.trim()) setSearchFor(query.trim());
  };

  const title = book.data?.book.title;
  const pageTitle = useMemo(() => (articleTitle && articleTitle !== title ? articleTitle : undefined), [articleTitle, title]);
  useEffect(() => {
    document.title = [pageTitle, title, "Outpost"].filter(Boolean).join(" / ");
    return () => {
      document.title = "Outpost";
    };
  }, [pageTitle, title]);

  if (book.isPending) {
    return (
      <Page width="reading" aria-busy>
        <Skeleton className="h-8 w-64" />
        <Skeleton className="mt-6 h-64" />
      </Page>
    );
  }
  if (book.isError) {
    return (
      <Page width="reading">
        <ErrorState error={book.error} onRetry={() => book.refetch()} />
        <p className="mt-4 text-small">
          <Link to="/library?tab=collections" className="text-primary underline underline-offset-2">
            Back to your collections
          </Link>
        </p>
      </Page>
    );
  }

  const showSuggestions = focused && !searchFor && debounced.length > 1 && (suggestions.data?.length ?? 0) > 0;

  return (
    <div className="flex h-dvh flex-col max-md:h-[calc(100dvh-3.25rem)] max-md:pb-14">
      <header className="relative z-(--z-sticky) flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border bg-page px-3 py-2 md:px-5">
        <Tooltip label="Back to your collections">
          <Button asChild variant="ghost" size="icon" aria-label="Back to your collections">
            <Link to="/library?tab=collections">
              <ArrowLeft />
            </Link>
          </Button>
        </Tooltip>
        <div className="min-w-0 flex-1 basis-40">
          <p className="truncate font-title text-body text-ink">{pageTitle ?? title}</p>
          {pageTitle ? <p className="truncate text-micro text-ink-muted">{title}</p> : null}
        </div>
        {/* biome-ignore lint/a11y/useSemanticElements: a form with role="search" is the search landmark every browser and screen reader knows */}
        <form onSubmit={submit} role="search" className="relative order-last w-full md:order-none md:w-80">
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-muted" />
          <input
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setSearchFor(undefined);
            }}
            onFocus={() => setFocused(true)}
            onBlur={() => window.setTimeout(() => setFocused(false), 150)}
            onKeyDown={(event) => {
              if (event.key !== "Escape") return;
              setSearchFor(undefined);
              setQuery("");
            }}
            placeholder={`Search in ${title}`}
            aria-label={`Search in ${title}`}
            disabled={!book.data.book.ready}
            className="h-9 w-full rounded-control border border-border-strong bg-page pr-3 pl-9 text-small text-ink placeholder:text-ink-faint focus-visible:border-focus focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/30 max-md:h-11 [&::-webkit-search-cancel-button]:hidden"
          />
          {showSuggestions ? (
            <ul
              className="absolute inset-x-0 top-full z-(--z-dropdown) mt-1.5 max-h-80 overflow-y-auto rounded-panel border border-border bg-raised p-1 shadow-float"
              aria-label="Article titles"
            >
              {suggestions.data!.map((item) => (
                <li key={item.path}>
                  <button
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => open(item.path)}
                    className="block w-full truncate rounded-[4px] px-2.5 py-1.5 text-left text-small text-ink hover:bg-surface-strong max-md:py-2.5"
                  >
                    {item.title}
                  </button>
                </li>
              ))}
              <li className="border-t border-border px-2.5 pt-1.5 pb-1 text-micro text-ink-muted">Press Enter to search the full text</li>
            </ul>
          ) : null}
        </form>
        <Tooltip label="First page of this collection">
          <Button variant="ghost" size="icon" aria-label="First page of this collection" onClick={() => open("")}>
            <House />
          </Button>
        </Tooltip>
      </header>

      {external ? (
        <Notice
          tone="info"
          icon={<ExternalLink />}
          className="rounded-none border-b border-border"
          action={
            <span className="flex shrink-0 items-center gap-1">
              <Button asChild size="sm" variant="ghost">
                <a href={external} target="_blank" rel="noopener noreferrer">
                  Open in a new tab
                </a>
              </Button>
              <Button size="icon-sm" variant="ghost" aria-label="Dismiss" onClick={() => setExternal(undefined)}>
                <X />
              </Button>
            </span>
          }
        >
          That link leaves your library and needs the internet: <span className="font-mono text-[0.8125rem] break-all">{external}</span>
        </Notice>
      ) : null}

      <div className="relative min-h-0 flex-1">
        {!book.data.book.ready ? (
          <Page width="reading">
            <Notice tone="warning" title="This collection cannot be read right now">
              {book.data.reason}
            </Notice>
          </Page>
        ) : (
          <>
            {frameSrc ? (
              <iframe
                ref={frameRef}
                key={collectionId}
                src={frameSrc}
                title={title}
                // No allow-same-origin: the page gets an origin of its own and cannot reach Outpost.
                sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
                referrerPolicy="no-referrer"
                className={cn("size-full border-0 bg-white", searchFor && "invisible")}
              />
            ) : null}
            {searchFor ? (
              <div className="absolute inset-0 overflow-y-auto bg-page">
                <Page width="reading" className="md:pt-8">
                  <div className="flex items-baseline justify-between gap-4">
                    <h1 className="font-title text-heading">Results for “{searchFor}”</h1>
                    <Button variant="ghost" size="sm" onClick={() => setSearchFor(undefined)}>
                      <X /> Back to the page
                    </Button>
                  </div>
                  {results.isPending ? (
                    <div className="mt-6 grid gap-5" aria-busy>
                      <Skeleton className="h-10" />
                      <Skeleton className="h-10" />
                      <Skeleton className="h-10" />
                    </div>
                  ) : results.isError ? (
                    <div className="mt-6">
                      <ErrorState error={results.error} onRetry={() => results.refetch()} />
                    </div>
                  ) : results.data.results.length === 0 ? (
                    <p className="mt-4 text-ink-muted">Nothing in {title} matches those words. Try fewer or different ones.</p>
                  ) : (
                    <>
                      <p className="tabular mt-1 text-small text-ink-muted">
                        {formatNumber(results.data.total)} article{results.data.total === 1 ? "" : "s"} in {title}
                        {results.data.total > results.data.results.length ? `, showing the first ${results.data.results.length}` : ""}
                      </p>
                      <ol className="mt-3 divide-y divide-border">
                        {results.data.results.map((result) => (
                          <li key={result.path} className="py-4">
                            <button
                              type="button"
                              onClick={() => open(result.path)}
                              className="font-title text-lead text-ink decoration-primary decoration-1 underline-offset-[0.22em] hover:underline"
                            >
                              {result.title}
                            </button>
                            {result.segments.length > 0 ? (
                              <p className="mt-1 line-clamp-3 text-small leading-relaxed text-ink-muted">
                                <Highlighted segments={result.segments} />
                              </p>
                            ) : null}
                          </li>
                        ))}
                      </ol>
                    </>
                  )}
                </Page>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
