/**
 * The reader for reference collections (Wikipedia and other ZIM archives).
 *
 * Pages are shown in a sandboxed frame: they are copies of other people's web sites,
 * scripts included, and must not share Outpost's origin. The frame cannot be inspected
 * from here, so a small script the server adds to each page reports which article is
 * showing and hands over links that leave the library.
 *
 * A collection that is a set of documents with a list, and not a web site, is shown as
 * that list, drawn here from what the server read out of it (document-list.tsx): its own
 * page cannot draw it inside the sandbox.
 */
import {
  ARCHIVE_FILE,
  type ArchiveDocument,
  type ArchiveDocumentFile,
  type ArchiveDocumentsResponse,
  archiveFileKind,
  isSavableLink,
  type PageFile,
  type ReferenceBookResponse,
  type ReferenceSearchResponse,
  type ReferenceSuggestion,
} from "@outpost/shared";
import { keepPreviousData, useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { ArrowLeft, Files, House, Search, X } from "lucide-react";
import { type FormEvent, type KeyboardEvent, useEffect, useId, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router";
import { ErrorState, Notice, Page } from "@/components/page";
import { Highlighted } from "@/components/search-hit";
import { Button } from "@/components/ui/button";
import { Skeleton, Tooltip } from "@/components/ui/misc";
import { ReaderLearning } from "@/features/learning/reader-controls";
import { useLearningTracker } from "@/features/learning/tracker";
import { api } from "@/lib/api";
import { useDebounced } from "@/lib/use-debounced";
import { keepFieldFocus, useDismiss } from "@/lib/use-dismiss";
import { cn, formatNumber } from "@/lib/utils";
import { ArchiveFile } from "./archive-file";
import { ArchiveMedia } from "./archive-media";
import { DocumentList } from "./document-list";
import { ExternalLinkNotice, LinkedFiles } from "./linked-files";

/** How many full-text results are asked for at once (the server gives at most 50). */
const RESULTS_AT_ONCE = 30;

const encodePath = (path: string) => path.split("/").map(encodeURIComponent).join("/");

/** The address's query with a file of the collection open over the page, or with none. */
const withFile = (path: string | undefined) => (before: URLSearchParams) => {
  const next = new URLSearchParams(before);
  if (path === undefined) next.delete("file");
  else next.set("file", path);
  return next;
};
/** Marks a step in the history as a file opened from the reader, so that closing it can go back one step. */
const OPENED_HERE = { state: { openedHere: true } };

export default function ReaderPage() {
  const { collectionId = "", "*": routePath = "" } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  // What follows the "?" in the address, for the listener below, which outlives any one value of it.
  const search = useRef(location.search);
  search.current = location.search;
  const frameRef = useRef<HTMLIFrameElement>(null);
  /** The article the frame is showing, as last reported by the page itself. */
  const shownPath = useRef<string | null>(null);
  const [articleTitle, setArticleTitle] = useState<string>();
  const [external, setExternal] = useState<string>();
  // Files the page on show links to, inside the archive or out on the internet, as the page itself reports them.
  const [pageFiles, setPageFiles] = useState<PageFile[]>([]);
  // A file inside the archive that is open over the page: ?file=<its path in the book>.
  const [searchParams, setSearchParams] = useSearchParams();
  const openFile = searchParams.get("file") ?? undefined;
  const [fileLabels] = useState(() => new Map<string, string>());
  // Titles the collection's own list gives its files, for the document a file becomes when it is added.
  const [fileTitles] = useState(() => new Map<string, string>());
  // In a collection that lists documents: ?view=page shows its own page in place of Outpost's list.
  const ownPage = searchParams.get("view") === "page";
  // ?q=<words> arrives with a search result that leads to a document in such a list.
  const asked = searchParams.get("q");
  const [query, setQuery] = useState(asked ?? "");
  useEffect(() => {
    if (asked !== null) setQuery(asked);
  }, [asked]);
  const [searchFor, setSearchFor] = useState<string>();
  const [focused, setFocused] = useState(false);
  /** The title marked with the arrow keys in the list under the field; -1 for none, when Enter searches the full text. */
  const [active, setActive] = useState(-1);
  const searchBox = useRef<HTMLFormElement>(null);
  const listId = useId();
  // Closed by a press or focus outside the field and its list, not by the field's blur: Tab into the list, or a tap on
  // a row on an iPhone, used to lose the list before it could be used (lib/use-dismiss.ts).
  useDismiss(searchBox, focused, () => setFocused(false));
  const debounced = useDebounced(query.trim(), 160);

  const book = useQuery({
    queryKey: ["kiwix", "book", collectionId],
    queryFn: () => api.get<ReferenceBookResponse>(`/api/kiwix/books/${collectionId}`),
  });
  const contentBase = book.data?.book.contentBase;
  // Pages are framed at an address of their own (see `readerSecret` on the server); files
  // Outpost's own viewer opens, and links it shows, use the plain one.
  const frameBase = book.data?.book.frameBase ?? contentBase;
  const ready = book.data?.book.ready === true;

  // Whether this collection is a list of documents. Asked once; the frame waits for the answer,
  // so that a page which could only stay empty is never loaded just to be covered up.
  const shape = useQuery({
    queryKey: ["kiwix", "documents", collectionId, "shape"],
    queryFn: () => api.get<ArchiveDocumentsResponse>(`/api/kiwix/books/${collectionId}/documents`, { limit: 0 }),
    enabled: ready,
    staleTime: Number.POSITIVE_INFINITY,
  });
  const list = shape.data?.list ?? null;
  const deciding = ready && shape.isPending;
  /** On the page that would have drawn the list, which is where Outpost draws it. */
  const listMode = list !== null && (routePath === "" || routePath === list.home);
  const showDocuments = listMode && (!ownPage || query.trim() !== "");
  // Where the learner got to (features/learning): kept while an archive's own pages are on show.
  const learning = useLearningTracker(collectionId, ready && !deciding && !listMode);
  /** The frame was sent to the archive's first address: the next page it reports is the archive's first page. */
  const awaitingHome = useRef(false);
  const homePath = useRef<string | null>(null);
  const [watched, setWatched] = useState<{ path: string; at: number } | null>(null);

  // The frame's address is set once per deliberate navigation (opening the reader, a
  // search result, the home button). Links clicked inside the frame change the frame
  // on their own and are only mirrored into the address bar.
  const [frameSrc, setFrameSrc] = useState<string>();
  useEffect(() => {
    if (!frameBase) return;
    if (shownPath.current === routePath) return;
    shownPath.current = routePath;
    if (routePath === "") awaitingHome.current = true;
    setFrameSrc(`${frameBase}${encodePath(routePath)}`);
  }, [frameBase, routePath]);

  useEffect(() => {
    if (!contentBase || !frameBase) return;
    // What the page reports is its own address, which is the framed one.
    const basePath = new URL(frameBase, window.location.origin).pathname;
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frameRef.current?.contentWindow) return;
      const data = event.data as {
        type?: unknown;
        path?: unknown;
        title?: unknown;
        href?: unknown;
        links?: unknown;
        text?: unknown;
      } | null;
      // Everything below comes from the archive's page, which is not trusted: each field is checked before use.
      const insidePath = (pathname: unknown): string | undefined => {
        if (typeof pathname !== "string" || pathname.length > 3000 || !pathname.startsWith(basePath)) return undefined;
        try {
          const path = decodeURIComponent(pathname.slice(basePath.length));
          return ARCHIVE_FILE.test(path) && !path.split("/").includes("..") ? path : undefined;
        } catch {
          return undefined;
        }
      };
      /** A page of the same archive: its address inside it, or nothing. */
      const pageIn = (pathname: unknown): string | undefined => {
        if (typeof pathname !== "string" || pathname.length > 2000 || !pathname.startsWith(basePath)) return undefined;
        try {
          const path = decodeURIComponent(pathname.slice(basePath.length));
          return path.split("/").includes("..") || /\p{Cc}/u.test(path) ? undefined : path;
        } catch {
          return undefined;
        }
      };
      if (!data || typeof data !== "object") return;
      if (data.type === "outpost:reader" && typeof data.path === "string" && data.path.startsWith(basePath)) {
        let path: string;
        try {
          path = decodeURIComponent(data.path.slice(basePath.length));
        } catch {
          return;
        }
        if (typeof data.title === "string") setArticleTitle(data.title.slice(0, 200));
        if (awaitingHome.current) {
          awaitingHome.current = false;
          homePath.current = path;
        }
        learning.shown(path, typeof data.title === "string" ? data.title.slice(0, 200) : "");
        if (path !== shownPath.current) {
          // Another page: its links have not been reported yet.
          setPageFiles([]);
          setExternal(undefined);
          shownPath.current = path;
          // Only the page changed; what is open over it, and how it is being looked at, stay.
          navigate({ pathname: `/library/read/${collectionId}/${encodePath(path)}`, search: search.current }, { replace: true });
        }
      } else if (data.type === "outpost:external" && typeof data.href === "string" && /^https?:\/\//.test(data.href)) {
        setExternal(data.href.slice(0, 2000));
      } else if (data.type === "outpost:file") {
        const path = insidePath(data.path);
        if (!path) return;
        if (typeof data.text === "string" && data.text) fileLabels.set(path, data.text.slice(0, 200));
        setSearchParams(withFile(path), OPENED_HERE);
      } else if (data.type === "outpost:pages" && Array.isArray(data.links)) {
        // The other pages of the same archive this page links to, for "3 of 5 done in Fractions".
        const path = pageIn(data.path);
        if (path === undefined) return;
        const links = new Set<string>();
        for (const link of data.links.slice(0, 600)) {
          const inside = pageIn(link);
          if (inside !== undefined && inside !== path) links.add(inside);
        }
        learning.listed(path, [...links], path === homePath.current);
      } else if (data.type === "outpost:ended") {
        // A video on the page played to its end. Only ever taken as a claim about the page on show.
        const path = pageIn(data.path);
        const played = typeof (data as { played?: unknown }).played === "number" ? (data as { played: number }).played : 0;
        if (path !== undefined && path === shownPath.current && learning.ended(path, played)) setWatched({ path, at: Date.now() });
      } else if (data.type === "outpost:links" && Array.isArray(data.links)) {
        const found: PageFile[] = [];
        for (const item of data.links.slice(0, 300) as Array<{ href?: unknown; text?: unknown; inside?: unknown }>) {
          if (!item || typeof item.href !== "string") continue;
          const text = typeof item.text === "string" ? item.text.slice(0, 200) : "";
          if (item.inside === true) {
            const path = insidePath(item.href);
            if (path) found.push({ kind: "archive", path, text });
          } else if (item.href.length <= 2000 && isSavableLink(item.href)) {
            found.push({ kind: "internet", href: item.href, text });
          }
        }
        setPageFiles(found);
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [contentBase, frameBase, collectionId, navigate, setSearchParams, fileLabels, learning.shown, learning.listed, learning.ended]);

  const closeFile = () => {
    if ((location.state as { openedHere?: boolean } | null)?.openedHere) return navigate(-1);
    // Arrived at the file directly (a search result, a saved address): there is no step to go back to.
    setSearchParams(withFile(undefined), { replace: true });
  };
  const openListed = (file: ArchiveDocumentFile, document: ArchiveDocument) => {
    const alone = document.files.length === 1;
    fileLabels.set(file.path, alone ? document.title : `${document.title}: ${file.name}`);
    if (alone) fileTitles.set(file.path, document.title);
    setSearchParams(withFile(file.path), OPENED_HERE);
  };

  const suggestions = useQuery({
    queryKey: ["kiwix", "suggest", collectionId, debounced],
    queryFn: () => api.get<{ suggestions: ReferenceSuggestion[] }>(`/api/kiwix/books/${collectionId}/suggest`, { q: debounced }),
    enabled: focused && debounced.length > 1 && !searchFor && !listMode,
    placeholderData: keepPreviousData,
    select: (data) => data.suggestions,
  });
  // Thirty at a time, and "Show more" for the next thirty: "217 articles, showing the first 30" was a dead end.
  const results = useInfiniteQuery({
    queryKey: ["kiwix", "search", collectionId, searchFor],
    queryFn: ({ pageParam }) =>
      api.get<ReferenceSearchResponse>(`/api/kiwix/books/${collectionId}/search`, {
        q: searchFor,
        offset: pageParam,
        limit: RESULTS_AT_ONCE,
      }),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => {
      const shown = pages.reduce((sum, page) => sum + page.results.length, 0);
      return last.results.length > 0 && shown < last.total ? shown : undefined;
    },
    enabled: Boolean(searchFor),
  });
  const found = results.data?.pages.flatMap((page) => page.results) ?? [];
  const foundTotal = results.data?.pages[0]?.total ?? 0;

  /** The reader's address of an article. */
  const articleHref = (path: string) => `/library/read/${collectionId}/${encodePath(path)}`;
  /** Leaving the search and the list for an article opened in this tab. */
  const leaveSearch = () => {
    setSearchFor(undefined);
    setFocused(false);
    setQuery("");
    setExternal(undefined);
  };
  const open = (path: string) => {
    leaveSearch();
    navigate(articleHref(path));
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    // A list of documents is searched as it is typed into; there is no full text behind it to send the words to.
    if (query.trim() && !listMode) setSearchFor(query.trim());
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

  const showSuggestions = focused && !searchFor && !listMode && debounced.length > 1 && (suggestions.data?.length ?? 0) > 0;
  const titles = showSuggestions ? suggestions.data! : [];
  const marked = active >= 0 && active < titles.length ? active : -1;
  const onSearchKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      // First the list goes, then the words.
      if (showSuggestions) {
        // A search field's own Escape empties it: here the first one only closes the list.
        event.preventDefault();
        setFocused(false);
      } else {
        setSearchFor(undefined);
        setQuery("");
      }
      setActive(-1);
      return;
    }
    if (titles.length === 0) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      // From the field down to the first title and round again; up from the first back to the field.
      setActive((current) => {
        const next = (current < 0 && step < 0 ? titles.length : current) + step;
        return next >= titles.length || next < 0 ? -1 : next;
      });
    } else if (event.key === "Enter" && marked >= 0) {
      event.preventDefault();
      open(titles[marked]!.path);
    }
  };
  const searchLabel = listMode ? `Search the documents in ${title}` : `Search in ${title}`;
  const openKind = openFile && !openFile.split("/").includes("..") ? archiveFileKind(openFile) : undefined;
  const openLabel = openFile
    ? (fileLabels.get(openFile) ??
      pageFiles.find((file) => file.kind === "archive" && file.path === openFile)?.text ??
      openFile.split("/").pop() ??
      openFile)
    : "";
  const backLabel = listMode && !ownPage ? "Back to the list" : "Back to the page";
  const TitleTag = (book.data.book.ready && showDocuments) || searchFor ? "p" : "h1";

  return (
    <div className="flex h-dvh flex-col max-md:h-[calc(100dvh-3.25rem)] max-md:pb-[var(--mobile-nav-height,calc(3.5rem+env(safe-area-inset-bottom)))]">
      <header className="relative z-(--z-sticky) flex flex-wrap items-center gap-x-2 gap-y-2 md:gap-x-3 border-b border-border bg-page px-3 py-2 md:px-5">
        <Tooltip label="Back to your collections">
          <Button asChild variant="ghost" size="icon" aria-label="Back to your collections">
            <Link to="/library?tab=collections">
              <ArrowLeft />
            </Link>
          </Button>
        </Tooltip>
        <div className="min-w-0 flex-1 basis-20 md:basis-40">
          {/* The screen's main heading, unless the list or the search results over the page carry their own. */}
          <TitleTag className="truncate font-title text-body text-ink">{pageTitle ?? title}</TitleTag>
          {pageTitle ? <p className="truncate text-micro text-ink-muted">{title}</p> : null}
        </div>
        {/* biome-ignore lint/a11y/useSemanticElements: a form with role="search" is the search landmark every browser and screen reader knows */}
        <form ref={searchBox} onSubmit={submit} role="search" className="relative order-last w-full md:order-none md:w-80">
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-muted" />
          <input
            type="search"
            // A combobox whose list of titles drops under it; over a list of documents it filters the list instead.
            role="combobox"
            aria-expanded={showSuggestions}
            aria-controls={showSuggestions ? listId : undefined}
            aria-autocomplete={listMode ? "none" : "list"}
            aria-activedescendant={marked >= 0 ? `${listId}-${marked}` : undefined}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setSearchFor(undefined);
              setFocused(true);
              setActive(-1);
            }}
            onFocus={() => setFocused(true)}
            // Still focused after a press elsewhere closed the list: a press on the field opens it again.
            onClick={() => setFocused(true)}
            onKeyDown={onSearchKey}
            placeholder={listMode ? "Search these documents" : searchLabel}
            aria-label={searchLabel}
            enterKeyHint="search"
            autoCapitalize="none"
            disabled={!ready}
            className="h-9 w-full rounded-control border border-border-strong bg-page pr-3 pl-9 text-small text-ink placeholder:text-ink-faint focus-visible:border-focus focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus max-md:h-11 max-md:text-body md:pointer-coarse:h-11 md:pointer-coarse:text-body [&::-webkit-search-cancel-button]:hidden"
          />
          {showSuggestions ? (
            <div
              className="absolute inset-x-0 top-full z-(--z-dropdown) mt-1.5 max-h-80 overflow-y-auto rounded-panel border border-border bg-raised p-1 shadow-float"
              // A press anywhere on the list leaves focus in the field, so the keyboard stays up on a phone and the row's
              // click lands (Safari on an iPhone focuses nothing it taps).
              {...keepFieldFocus}
            >
              {/* A combobox's list (WAI-ARIA): focus stays in the field, the arrow keys mark a title, Enter opens it. */}
              <div id={listId} role="listbox" aria-label="Article titles">
                {titles.map((item, index) => (
                  // biome-ignore lint/a11y/useFocusableInteractive: focus stays in the field; the list is driven through aria-activedescendant
                  // biome-ignore lint/a11y/useKeyWithClickEvents: arrow keys and Enter are handled by the field
                  <div
                    key={item.path}
                    id={`${listId}-${index}`}
                    role="option"
                    aria-selected={index === marked}
                    onClick={() => open(item.path)}
                    onMouseMove={() => setActive(index)}
                    className={cn(
                      "flex min-h-9 cursor-pointer items-center rounded-[4px] px-2.5 py-1.5 text-small text-ink [overflow-wrap:anywhere] max-md:min-h-11 max-md:py-2.5 md:pointer-coarse:min-h-11",
                      index === marked && "bg-surface-strong",
                    )}
                  >
                    {item.title}
                  </div>
                ))}
              </div>
              <p className="border-t border-border px-2.5 pt-1.5 pb-1 text-micro text-ink-muted">
                <span className="pointer-coarse:hidden">Up and down choose a title; Enter alone searches the full text</span>
                <span className="hidden pointer-coarse:inline">The keyboard's Search key searches the full text</span>
              </p>
            </div>
          ) : null}
        </form>
        {ready && !deciding && !listMode && collectionId ? (
          <div className="flex items-center">
            <ReaderLearning tracker={learning} collectionId={collectionId} watched={watched} />
          </div>
        ) : null}
        <Tooltip label="First page of this collection">
          <Button variant="ghost" size="icon" aria-label="First page of this collection" onClick={() => open("")}>
            <House />
          </Button>
        </Tooltip>
      </header>

      {external ? <ExternalLinkNotice href={external} foundIn={title ?? ""} onDismiss={() => setExternal(undefined)} /> : null}
      {!external && !openFile && collectionId && !listMode ? (
        <LinkedFiles collectionId={collectionId} files={pageFiles} foundIn={title ?? ""} />
      ) : null}
      {listMode && ownPage && !showDocuments && !openFile ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-border bg-surface px-3 py-2 text-small text-ink-muted md:px-4">
          <Files aria-hidden className="size-4 shrink-0" />
          <p className="min-w-0 flex-1">This is the collection's own page. It cannot draw its list of documents here.</p>
          <Button size="sm" variant="secondary" onClick={() => open("")}>
            Show the documents
          </Button>
        </div>
      ) : null}
      {shape.data?.problem && !openFile ? (
        <div className="flex items-start gap-x-3 border-b border-border bg-surface px-3 py-2 text-small text-ink-muted md:px-4">
          <Files aria-hidden className="mt-0.5 size-4 shrink-0" />
          <p className="min-w-0 flex-1">{shape.data.problem} Its own page is shown instead, and its list may stay empty.</p>
        </div>
      ) : null}

      <div className="relative min-h-0 flex-1">
        {!book.data.book.ready ? (
          <Page width="reading">
            <Notice
              tone="warning"
              title="This collection cannot be read right now"
              action={
                <Button size="sm" loading={book.isFetching} onClick={() => book.refetch()}>
                  Try again
                </Button>
              }
            >
              {book.data.reason}
            </Notice>
          </Page>
        ) : deciding ? (
          <Page width="reading" aria-busy>
            <Skeleton className="h-8 w-64" />
            <Skeleton className="mt-6 h-64" />
          </Page>
        ) : (
          <>
            {frameSrc && !(listMode && !ownPage) ? (
              <iframe
                ref={frameRef}
                key={collectionId}
                src={frameSrc}
                title={title}
                // No allow-same-origin: the page gets an origin of its own and cannot reach Outpost.
                sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
                referrerPolicy="no-referrer"
                className={cn("size-full border-0 bg-white", (searchFor || showDocuments) && "invisible")}
              />
            ) : null}
            {showDocuments && contentBase && collectionId ? (
              <DocumentList
                collectionId={collectionId}
                contentBase={contentBase}
                description={book.data.book.description}
                query={debounced}
                covered={Boolean(openFile)}
                onClearQuery={() => setQuery("")}
                onOpen={openListed}
                onShowOwnPage={() => {
                  setQuery("");
                  setSearchParams({ view: "page" });
                }}
              />
            ) : null}
            {openFile && contentBase && collectionId && (openKind === "pdf" || openKind === "epub") ? (
              <ArchiveFile
                key={openFile}
                collectionId={collectionId}
                url={`${contentBase}${encodePath(openFile)}`}
                path={openFile}
                label={openLabel}
                title={fileTitles.get(openFile)}
                backLabel={backLabel}
                onClose={closeFile}
              />
            ) : null}
            {openFile && contentBase && (openKind === "audio" || openKind === "video") ? (
              <ArchiveMedia
                key={openFile}
                url={`${contentBase}${encodePath(openFile)}`}
                path={openFile}
                label={openLabel}
                backLabel={backLabel}
                onClose={closeFile}
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
                  ) : found.length === 0 ? (
                    <p className="mt-4 text-ink-muted">Nothing in {title} matches those words. Try fewer or different ones.</p>
                  ) : (
                    <>
                      <p className="tabular mt-1 text-small text-ink-muted" role="status">
                        {formatNumber(foundTotal)} article{foundTotal === 1 ? "" : "s"} in {title}
                        {foundTotal > found.length ? `, showing ${formatNumber(found.length)}` : ""}
                      </p>
                      <ol className="mt-3 divide-y divide-border">
                        {found.map((result) => (
                          // The whole row opens the article: the title's link is stretched over it. A link, so that it
                          // can be opened in a new tab as well.
                          <li
                            key={result.path}
                            className="group/row relative isolate py-4 [overflow-wrap:anywhere] before:absolute before:-inset-x-2 before:inset-y-0 before:-z-10 before:rounded-control before:transition-colors before:duration-(--duration-fast) hover:before:bg-surface has-[a:active]:before:bg-surface-strong"
                          >
                            <Link
                              to={articleHref(result.path)}
                              onClick={(event) => {
                                if (!event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && event.button === 0)
                                  leaveSearch();
                              }}
                              className="font-title text-lead text-ink decoration-primary decoration-1 underline-offset-[0.22em] after:absolute after:-inset-x-2 after:inset-y-0 after:rounded-control group-hover/row:underline focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-focus"
                            >
                              {result.title}
                            </Link>
                            {result.segments.length > 0 ? (
                              <p className="mt-1 line-clamp-3 text-small leading-relaxed text-ink-muted">
                                <Highlighted segments={result.segments} />
                              </p>
                            ) : null}
                          </li>
                        ))}
                      </ol>
                      {results.hasNextPage ? (
                        <Button className="mt-4" disabled={results.isFetchingNextPage} onClick={() => void results.fetchNextPage()}>
                          {results.isFetchingNextPage
                            ? "Finding more…"
                            : `Show ${Math.min(RESULTS_AT_ONCE, foundTotal - found.length)} more`}
                        </Button>
                      ) : null}
                      {results.isFetchNextPageError ? (
                        <p className="mt-2 text-small text-danger" role="alert">
                          The next results did not come. Try Show more again.
                        </p>
                      ) : null}
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
