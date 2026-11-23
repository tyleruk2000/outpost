import type { DocumentDto, DocumentResponse } from "@outpost/shared";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Download, PanelRight, Unplug, X } from "lucide-react";
import { lazy, type ReactNode, type Ref, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router";
import { ErrorState } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Skeleton, Tooltip } from "@/components/ui/misc";
import { AskAboutButton } from "@/features/chat/ask-about";
import { ReadingTextControl } from "@/features/settings/reading-text";
import { ApiError, api } from "@/lib/api";
import { useStorage } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { DocumentDetails } from "./document-details";
import { ImageViewer } from "./document-image";
import { documentKeys } from "./document-meta";
import { OcrTextView, ScanStrip, useDocumentOcr } from "./document-ocr";
import { TextViewer } from "./document-text";
import { ViewerToolbar } from "./document-toolbar";
import type { ViewerControls, ViewerState } from "./document-viewer";
import { ViewerMessage } from "./document-viewer-message";
import { chapterInAddress, useEpubBook } from "./epub-data";
import { EpubReader } from "./epub-reader";
import { HighlightLayer } from "./highlights/highlight-layer";
import { canHighlight } from "./highlights/highlights-data";
import { HighlightsPanel } from "./highlights/highlights-panel";

// pdf.js is large and only PDFs need it.
const PdfViewer = lazy(() => import("./pdf-viewer"));
// A recording is played, not shown: the audiobook player, with its book around it when it is a chapter.
const AudioViewer = lazy(() => import("../audiobooks/audio-viewer"));

const DETAILS_KEY = "outpost.document.details";
// Wide enough for the details to sit beside the document and the viewing controls to fit in the top bar.
// Narrower than this (a phone, or a tablet with the sidebar open) the details cover the document instead.
// Both are asked of the room in text, not only in pixels: with the text made large (Settings, Text size; a
// browser that enlarges text only) the bar would no longer hold the controls, which then go to the foot.
const DESKTOP_PX = 1024;
const DESKTOP_REM = 48;

function isDesktop(): boolean {
  const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  return window.innerWidth >= DESKTOP_PX && window.innerWidth / rem >= DESKTOP_REM;
}

function useIsDesktop(): boolean {
  const [matches, setMatches] = useState(isDesktop);
  useEffect(() => {
    const onChange = () => setMatches(isDesktop());
    onChange();
    window.addEventListener("resize", onChange);
    // The text size is the root's font size, set on its style attribute (lib/theme).
    const watch = new MutationObserver(onChange);
    watch.observe(document.documentElement, { attributes: true, attributeFilter: ["style"] });
    return () => {
      window.removeEventListener("resize", onChange);
      watch.disconnect();
    };
  }, []);
  return matches;
}

/** Whether the details panel is open. Remembered on wide screens; on a phone it covers the document, so it always starts closed. */
function useDetailsPanel(desktop: boolean): [open: boolean, setOpen: (open: boolean) => void] {
  const [wide, setWide] = useState(() => {
    try {
      return localStorage.getItem(DETAILS_KEY) !== "closed";
    } catch {
      return true;
    }
  });
  const [narrow, setNarrow] = useState(false);
  const setOpen = useCallback(
    (open: boolean) => {
      if (!desktop) return setNarrow(open);
      setWide(open);
      try {
        localStorage.setItem(DETAILS_KEY, open ? "open" : "closed");
      } catch {
        // Storage can be unavailable; the choice then lasts for this visit.
      }
    },
    [desktop],
  );
  return [desktop ? wide : narrow, setOpen];
}

/** The screen's frame: it fills the window exactly, because the viewer scrolls inside it rather than the page scrolling. */
function Frame({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-[calc(100dvh-3.25rem)] flex-col pb-[calc(3.25rem+env(safe-area-inset-bottom))] md:h-dvh md:pb-0">{children}</div>
  );
}

function BackToLibrary({ cameFromLibrary, book }: { cameFromLibrary: boolean; book?: { to: string; title: string } }) {
  const navigate = useNavigate();
  // A chapter belongs to its book: back means the book's contents, wherever the reader came from.
  if (book) {
    return (
      <Button asChild variant="ghost" size="sm" className="shrink-0 max-md:size-11 max-md:px-0">
        <Link to={book.to} aria-label={`Back to the contents of ${book.title}`}>
          <ArrowLeft /> <span className="max-md:sr-only">Contents</span>
        </Link>
      </Button>
    );
  }
  const content = (
    <>
      <ArrowLeft /> <span className="max-md:sr-only">Library</span>
    </>
  );
  // Going back through history returns to the list exactly as it was left, filters and all.
  return cameFromLibrary ? (
    <Button
      variant="ghost"
      size="sm"
      className="shrink-0 max-md:size-11 max-md:px-0"
      onClick={() => navigate(-1)}
      aria-label="Back to Library"
    >
      {content}
    </Button>
  ) : (
    <Button asChild variant="ghost" size="sm" className="shrink-0 max-md:size-11 max-md:px-0">
      <Link to="/library" aria-label="Back to Library">
        {content}
      </Link>
    </Button>
  );
}

function LoadingScreen() {
  return (
    <Frame>
      <div className="flex h-12 items-center gap-3 border-b border-border px-4 max-md:h-13" aria-busy>
        <Skeleton className="size-5" />
        <Skeleton className="h-5 w-64 max-w-[50%]" />
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="flex flex-1 justify-center overflow-hidden bg-surface-strong p-4">
          <Skeleton className="h-[140%] w-full max-w-[52rem] rounded-none" />
        </div>
        <div className="w-80 shrink-0 border-l border-border p-5 max-lg:hidden">
          <div className="grid gap-5">
            {[0, 1, 2, 3].map((row) => (
              <div key={row} className="grid gap-2">
                <Skeleton className="h-3.5 w-20" />
                <Skeleton className="h-9" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </Frame>
  );
}

function Viewer({
  document,
  locationName,
  initialPage,
  onState,
  controls,
}: {
  document: DocumentDto;
  locationName: string;
  initialPage: number;
  onState: (state: ViewerState | null) => void;
  controls: Ref<ViewerControls>;
}) {
  const downloadUrl = `${document.fileUrl}?download=1`;
  const ocr = useDocumentOcr(document);
  // For a scan, the text OCR read can be shown in place of the pages.
  const [showingText, setShowingText] = useState(false);
  const textShown = showingText && ocr.hasOcrText;
  if (!document.locationAvailable) {
    return (
      <ViewerMessage icon={<Unplug />} title="This document's file is not available right now">
        <p>The file is on “{locationName}”, which is not connected. Reconnect it and the document will open here; nothing has been lost.</p>
        <p>
          You can still read and change its details.{" "}
          <Link to="/storage" className="font-medium text-primary underline decoration-1 underline-offset-[0.2em] hover:decoration-2">
            See storage locations
          </Link>
        </p>
      </ViewerMessage>
    );
  }
  const strip = <ScanStrip document={document} ocr={ocr} showingText={textShown} onShowText={setShowingText} />;
  if (textShown) {
    return (
      <>
        {strip}
        <OcrTextView document={document} />
      </>
    );
  }
  if (document.type === "pdf") {
    return (
      <>
        {strip}
        <Suspense
          fallback={
            <div className="flex min-h-0 flex-1 justify-center overflow-hidden bg-surface-strong p-4" aria-busy>
              <Skeleton className="h-[140%] w-full max-w-[52rem] rounded-none" />
            </div>
          }
        >
          <PdfViewer
            key={document.id}
            url={document.fileUrl}
            title={document.title}
            initialPage={initialPage}
            locationName={locationName}
            downloadUrl={downloadUrl}
            onState={onState}
            controls={controls}
          />
        </Suspense>
      </>
    );
  }
  if (document.type === "image")
    return (
      <>
        {strip}
        <ImageViewer
          key={document.id}
          url={document.fileUrl}
          title={document.title}
          downloadUrl={downloadUrl}
          onState={onState}
          controls={controls}
        />
      </>
    );
  if (document.type === "audio") {
    return (
      <Suspense fallback={<div className="flex-1" aria-busy />}>
        <AudioViewer key={document.id} document={document} />
      </Suspense>
    );
  }
  // A book is read chapter by chapter, drawn from what the server reads out of it.
  if (document.type === "epub") return <EpubReader key={document.id} document={document} downloadUrl={downloadUrl} />;
  // Keyed, so that going from one chapter to the next starts at the top of the new one.
  return <TextViewer key={document.id} document={document} downloadUrl={downloadUrl} />;
}

export default function DocumentPage() {
  const { id = "" } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const desktop = useIsDesktop();
  const [detailsOpen, setDetailsOpen] = useDetailsPanel(desktop);
  const [viewer, setViewer] = useState<ViewerState | null>(null);
  const controlsRef = useRef<ViewerControls>(null);
  const detailsRef = useRef<HTMLElement>(null);
  const readingRef = useRef<HTMLDivElement>(null);
  const cameFromLibrary = Boolean((location.state as { fromLibrary?: boolean } | null)?.fromLibrary);

  const query = useQuery({ queryKey: documentKeys.detail(id), queryFn: () => api.get<DocumentResponse>(`/api/documents/${id}`) });
  const storage = useStorage();
  const document = query.data?.document;
  const locationName = storage.data?.locations.find((entry) => entry.id === document?.locationId)?.name ?? "its storage location";

  // Inside an EPUB the screen is named by the chapter being read, as a chapter of a book from the catalogue is.
  const epubChapter = document?.type === "epub" ? chapterInAddress(params) : null;
  const epub = useEpubBook(id, epubChapter !== null);
  const title = (epubChapter !== null ? epub.data?.chapters[epubChapter - 1]?.title : undefined) ?? document?.title;

  useEffect(() => {
    if (!title) return;
    window.document.title = `${title} / Outpost`;
    return () => {
      window.document.title = "Outpost";
    };
  }, [title]);

  // ── The page in the address ──
  // ?page=N opens at that page (search results link this way) and follows the page being read.
  const urlPage = Math.max(1, Math.floor(Number(params.get("page")) || 1));
  // The page this screen last put in the address itself. Anything else there is a request to go to that page.
  const written = useRef(urlPage);
  const pending = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (urlPage === written.current) return;
    written.current = urlPage;
    controlsRef.current?.goToPage?.(urlPage);
  }, [urlPage]);
  // A page waiting to be written belongs to the document that was open when it was read.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when the document changes
  useEffect(() => () => window.clearTimeout(pending.current), [id]);

  const readingPage = viewer?.page;
  useEffect(() => {
    // Scrolling passes many pages quickly; write the one the person settles on.
    window.clearTimeout(pending.current);
    if (readingPage === undefined || readingPage === written.current) return;
    pending.current = window.setTimeout(() => {
      written.current = readingPage;
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          if (readingPage > 1) next.set("page", String(readingPage));
          else next.delete("page");
          return next;
        },
        // Replace, so Back leaves the document instead of stepping through every page; keep how we got here.
        { replace: true, state: location.state, preventScrollReset: true },
      );
    }, 250);
  }, [readingPage, setParams, location.state]);

  const toggleDetails = () => {
    const next = !detailsOpen;
    setDetailsOpen(next);
    // On a phone the panel covers the document; move there so the next thing read or tabbed to is the panel.
    if (next && !desktop) window.setTimeout(() => detailsRef.current?.focus(), 0);
  };

  if (query.isPending) return <LoadingScreen />;
  if (query.isError || !document) {
    const missing = query.error instanceof ApiError && query.error.status === 404;
    return (
      <Frame>
        <div className="flex h-12 items-center border-b border-border px-2 max-md:h-13">
          <BackToLibrary cameFromLibrary={cameFromLibrary} />
        </div>
        {missing ? (
          <ViewerMessage
            title="This document is not in your library"
            className="bg-page"
            actions={
              <Button asChild variant="primary">
                <Link to="/library">Go to the Library</Link>
              </Button>
            }
          >
            <p>
              It may have been deleted, or the address may be mistyped. Documents that are still here can be found in the Library or with
              search.
            </p>
          </ViewerMessage>
        ) : (
          <div className="max-w-[46rem] p-5 md:p-10">
            <ErrorState error={query.error} onRetry={() => query.refetch()} />
          </div>
        )}
      </Frame>
    );
  }

  // Inside a book, back means its contents: the collection of a book from the catalogue, the front page of an EPUB.
  const chapter = query.data?.chapter;
  const book = chapter
    ? { to: `/library/collections/${chapter.collectionId}`, title: chapter.bookTitle }
    : epubChapter !== null
      ? { to: `/library/documents/${document.id}`, title: epub.data?.title ?? document.title }
      : undefined;

  const controls: ViewerControls = {
    zoomBy: (direction) => controlsRef.current?.zoomBy(direction),
    fit: () => controlsRef.current?.fit(),
    goToPage: (page) => controlsRef.current?.goToPage?.(page),
  };
  const covered = detailsOpen && !desktop;
  // Text drawn by Outpost itself (not a PDF's pages, a picture or a recording) follows the reading choices.
  const readable = !["pdf", "image", "audio"].includes(document.type);
  // Passages are marked in a PDF, a Markdown document, and a chapter of an EPUB (not its front page).
  const markable = canHighlight(document.type) && (document.type !== "epub" || epubChapter !== null);

  return (
    <Frame>
      {/* With large text on a narrow screen the buttons go on to a second line rather than past the edge. */}
      <header className="flex min-h-12 shrink-0 flex-wrap items-center gap-x-1.5 border-b border-border bg-page pr-2 pl-1.5 max-md:min-h-13 md:pr-3 md:pl-2">
        <BackToLibrary cameFromLibrary={cameFromLibrary} book={book} />
        <span aria-hidden className="h-5 w-px shrink-0 bg-border max-md:hidden" />
        <h1 className="min-w-0 flex-1 basis-24 truncate font-title text-lead text-ink md:pl-2" title={title}>
          {title}
        </h1>
        {desktop && viewer ? <ViewerToolbar state={viewer} controls={controls} className="shrink-0" /> : null}
        {desktop && viewer ? <span aria-hidden className="h-5 w-px shrink-0 bg-border" /> : null}
        {readable ? <ReadingTextControl /> : null}
        <AskAboutButton kind="document" id={document.id} title={document.title} />
        <Tooltip
          label={document.locationAvailable ? "Download original" : "The original cannot be downloaded while its storage is disconnected"}
        >
          {document.locationAvailable ? (
            <Button asChild variant="ghost" size="icon-sm" className="max-md:size-11">
              <a href={`${document.fileUrl}?download=1`} aria-label="Download original">
                <Download />
              </a>
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Download original"
              aria-disabled
              className="cursor-not-allowed max-md:size-11"
            >
              <Download />
            </Button>
          )}
        </Tooltip>
        <Tooltip label={detailsOpen ? "Hide details" : "Show details"}>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Details"
            aria-expanded={detailsOpen}
            aria-controls="document-details"
            onClick={toggleDetails}
            className={cn("max-md:size-11", detailsOpen && "bg-primary-soft text-primary-soft-ink hover:bg-primary-soft")}
          >
            <PanelRight />
          </Button>
        </Tooltip>
      </header>

      <div className="relative flex min-h-0 flex-1">
        <div ref={readingRef} className="flex min-w-0 flex-1 flex-col" inert={covered}>
          <Viewer document={document} locationName={locationName} initialPage={urlPage} onState={setViewer} controls={controlsRef} />
          {markable ? <HighlightLayer documentId={document.id} area={readingRef} chapter={epubChapter} /> : null}
          {!desktop && viewer ? (
            <div className="flex min-h-12 shrink-0 items-center border-t border-border bg-page px-1.5 py-0.5">
              <ViewerToolbar state={viewer} controls={controls} spread />
            </div>
          ) : null}
        </div>

        {detailsOpen ? (
          <aside
            id="document-details"
            ref={detailsRef}
            tabIndex={-1}
            aria-label="Details"
            className={cn(
              "scroll-quiet overflow-y-auto bg-page focus:outline-none",
              desktop ? "w-80 shrink-0 border-l border-border" : "absolute inset-0 z-(--z-sticky)",
            )}
          >
            <div
              className={cn(
                "sticky top-0 z-(--z-sticky) flex h-12 items-center justify-between border-b border-border bg-page pr-2 pl-5",
                desktop && "hidden",
              )}
            >
              <h2 className="text-lead font-semibold text-ink">Details</h2>
              <Button
                variant="ghost"
                size="icon-sm"
                className="max-md:size-11"
                aria-label="Close details"
                onClick={() => setDetailsOpen(false)}
              >
                <X />
              </Button>
            </div>
            {/* A wrapper of their own, so the first group knows it is first and draws no line above itself. */}
            <div>
              <DocumentDetails
                document={document}
                locationName={locationName}
                onDeleted={() => (cameFromLibrary ? navigate(-1) : navigate("/library", { replace: true }))}
              />
              {canHighlight(document.type) ? <HighlightsPanel document={document} /> : null}
            </div>
          </aside>
        ) : null}
      </div>
    </Frame>
  );
}
