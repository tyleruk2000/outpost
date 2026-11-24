import { type DocumentFacets, type DocumentListResponse, type DocumentSort, type DocumentType, formatBytes } from "@outpost/shared";
import { keepPreviousData, useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDownUp, Globe, Plus, Search, Upload, X } from "lucide-react";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { toast } from "sonner";
import { EmptyState, ErrorState, Rows } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { useStorage } from "@/lib/queries";
import { cn, formatNumber, plural } from "@/lib/utils";
import { SaveWebPagePanel } from "../webpages/save-page";
import { useCollections } from "./collection-data";
import { isAudiobook, isBook } from "./collection-meta";
import { ChoiceMenu } from "./document-filter-menu";
import { clearFilters, type DocumentFilters, isFiltered, listQuery, PAGE_SIZE, readFilters, writeFilters } from "./document-filters";
import { ACCEPTED_FILES, documentKeys, SUPPORTED_TYPES, typeLabels } from "./document-meta";
import { DocumentRow, DocumentRowSkeleton } from "./document-row";
import { isSettled, uploadQueue, useUploadItems } from "./upload-queue";
import { UploadTray } from "./upload-tray";

// Audiobooks are listed by their own module: a book of many files is one line there.
const AudiobookList = lazy(() => import("../audiobooks/audiobook-list"));

const sortChoices: Array<{ value: DocumentSort; label: string }> = [
  { value: "added", label: "Recently added" },
  { value: "title", label: "Title, A to Z" },
  { value: "size", label: "Largest first" },
];

/** Files from a drop, leaving out folders: a browser hands those over as empty files that cannot be read. */
function droppedFiles(transfer: DataTransfer): { files: File[]; folders: number } {
  const files: File[] = [];
  let folders = 0;
  for (const item of Array.from(transfer.items)) {
    if (item.kind !== "file") continue;
    if (item.webkitGetAsEntry?.()?.isDirectory) {
      folders += 1;
      continue;
    }
    const file = item.getAsFile();
    if (file) files.push(file);
  }
  return { files, folders };
}

const carriesFiles = (event: DragEvent) => Boolean(event.dataTransfer?.types.includes("Files"));

/**
 * Tracks a drag of files over the window, so dropping anywhere on the Library adds them
 * (and never makes the browser navigate away to the dropped file).
 */
function useFileDrop(onFiles: (files: File[]) => void): boolean {
  const [over, setOver] = useState(false);
  const latest = useRef(onFiles);
  latest.current = onFiles;

  useEffect(() => {
    // dragenter and dragleave fire for every element crossed; the count says when the drag has really left.
    let depth = 0;
    const enter = (event: DragEvent) => {
      if (!carriesFiles(event)) return;
      depth += 1;
      setOver(true);
    };
    const leave = (event: DragEvent) => {
      if (!carriesFiles(event)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setOver(false);
    };
    const move = (event: DragEvent) => {
      if (!carriesFiles(event)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    };
    const drop = (event: DragEvent) => {
      if (!carriesFiles(event) || !event.dataTransfer) return;
      event.preventDefault();
      depth = 0;
      setOver(false);
      const { files, folders } = droppedFiles(event.dataTransfer);
      if (folders > 0) toast.message("Folders are not added as a whole. Open the folder and drop the files inside it.");
      if (files.length > 0) latest.current(files);
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragleave", leave);
    window.addEventListener("dragover", move);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("dragover", move);
      window.removeEventListener("drop", drop);
    };
  }, []);

  return over;
}

function NameFilter({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  const send = useRef(onChange);
  send.current = onChange;
  // What this field last put in the address. A change from anywhere else (Clear filters,
  // the back button) replaces what is typed; an echo of our own change must not.
  const sent = useRef(value);

  useEffect(() => {
    if (value !== sent.current) {
      sent.current = value;
      setDraft(value);
    }
  }, [value]);

  // Filter as the person types, without a request for every keystroke.
  useEffect(() => {
    const wanted = draft.trim();
    if (wanted === sent.current) return;
    const timer = window.setTimeout(() => {
      sent.current = wanted;
      send.current(wanted);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [draft]);

  return (
    <div className="relative min-w-[min(10rem,100%)] flex-1 md:max-w-72">
      <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-muted" />
      <Input
        ref={inputRef}
        type="search"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        enterKeyHint="search"
        autoCapitalize="none"
        placeholder="Filter by name"
        aria-label="Filter documents by name"
        className="pr-11 pl-9 text-body md:h-8 md:pr-9 md:pointer-fine:text-small md:pointer-coarse:h-11 [&::-webkit-search-cancel-button]:hidden"
      />
      {draft ? (
        <button
          type="button"
          aria-label="Clear the name filter"
          className="absolute top-1/2 right-1 grid size-7 -translate-y-1/2 place-content-center rounded-control text-ink-muted hover:text-ink max-md:right-0 max-md:size-11 md:pointer-coarse:right-0 md:pointer-coarse:size-11"
          onClick={() => {
            setDraft("");
            sent.current = "";
            onChange("");
            inputRef.current?.focus();
          }}
        >
          <X className="size-4" />
        </button>
      ) : null}
    </div>
  );
}

function summary(filters: DocumentFilters, facets: DocumentFacets | undefined, shown: number | undefined): string {
  if (!facets) return "";
  if (isFiltered(filters) && shown !== undefined) return `${formatNumber(shown)} of ${plural(facets.total, "document")}`;
  return `${plural(facets.total, "document")}, ${formatBytes(facets.totalBytes)}`;
}

/**
 * Books from the catalogue are kept whole under Collections, not as a document per
 * chapter in this list. Someone who has just added one should not find this tab
 * saying there is nothing here.
 */
function BooksPointer({ onShowAudiobooks }: { onShowAudiobooks: () => void }) {
  const collections = useCollections().data ?? [];
  const books = collections.filter((collection) => isBook(collection) && !isAudiobook(collection)).length;
  const audiobooks = collections.filter(isAudiobook).length;
  const audio = audiobooks > 0 ? <AudiobooksPointer count={audiobooks} onShow={onShowAudiobooks} /> : null;
  if (books === 0) return audio;
  return (
    <>
      <p className="mt-3 text-small text-ink-muted">
        {plural(books, "book")} from the catalogue {books === 1 ? "is" : "are"} kept whole, with {books === 1 ? "its" : "their"} chapters in
        order.{" "}
        <Link
          to="/library?tab=collections"
          className="font-medium text-primary underline decoration-1 underline-offset-[0.2em] hover:decoration-2"
        >
          See your books
        </Link>
      </p>
      {audio}
    </>
  );
}

/** Audiobooks of several files are kept whole too; the Type filter lists them together. */
function AudiobooksPointer({ count, onShow }: { count: number; onShow: () => void }) {
  return (
    <p className="mt-3 text-small text-ink-muted">
      {plural(count, "audiobook")} {count === 1 ? "is" : "are"} kept whole, with {count === 1 ? "its" : "their"} chapters in order.{" "}
      <button
        type="button"
        onClick={onShow}
        className="font-medium text-primary underline decoration-1 underline-offset-[0.2em] hover:decoration-2 max-md:min-h-11 md:pointer-coarse:min-h-11"
      >
        Show audiobooks
      </button>
    </p>
  );
}

export default function DocumentsPanel() {
  const [params, setParams] = useSearchParams();
  const client = useQueryClient();
  const filters = readFilters(params);
  const filtered = isFiltered(filters);
  const pickerRef = useRef<HTMLInputElement>(null);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const uploads = useUploadItems();
  const storage = useStorage();

  const facets = useQuery({ queryKey: documentKeys.facets, queryFn: () => api.get<DocumentFacets>("/api/documents/facets") });
  const key = { q: filters.q, type: filters.type, category: filters.category, tag: filters.tag, sort: filters.sort };
  const list = useInfiniteQuery({
    queryKey: documentKeys.list(key),
    queryFn: ({ pageParam, signal }) => api.get<DocumentListResponse>("/api/documents", listQuery(filters, pageParam), signal),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((sum, page) => sum + page.documents.length, 0);
      return last.documents.length === PAGE_SIZE && loaded < last.total ? loaded : undefined;
    },
    placeholderData: keepPreviousData,
  });

  const setFilters = (patch: Partial<DocumentFilters>, replace = false) =>
    setParams((current) => writeFilters(current, patch), { replace });
  const addFiles = (files: File[]) => uploadQueue.add(files);
  const openPicker = () => pickerRef.current?.click();
  const dragging = useFileDrop(addFiles);

  // The command palette's "Add documents" links here with ?upload=1.
  const wantsUpload = params.get("upload") === "1";
  useEffect(() => {
    if (!wantsUpload) return;
    // A browser only opens a file picker in answer to something the person just did. Arriving
    // from the palette counts; a reload or a pasted link does not, so the button is offered instead.
    if (navigator.userActivation && !navigator.userActivation.isActive) addButtonRef.current?.focus();
    else pickerRef.current?.click();
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete("upload");
        return next;
      },
      { replace: true },
    );
  }, [wantsUpload, setParams]);

  // The server announces new documents, but if that connection is down the list should still catch up.
  const settledCount = uploads.filter(isSettled).length;
  useEffect(() => {
    if (settledCount > 0) void client.invalidateQueries({ queryKey: documentKeys.all });
  }, [settledCount, client]);

  const documents = list.data?.pages.flatMap((page) => page.documents) ?? [];
  const total = list.data?.pages[0]?.total;
  const locationNames = new Map(storage.data?.locations.map((location) => [location.id, location.name]));
  const libraryEmpty = facets.data?.total === 0 && !filtered;

  const typeChoices = (facets.data?.types ?? []).map((entry) => ({
    value: entry.type,
    label: typeLabels[entry.type]?.plural ?? entry.type,
    count: entry.count,
  }));
  const categoryChoices = (facets.data?.categories ?? []).map((entry) => ({ value: entry.name, label: entry.name, count: entry.count }));
  const tagChoices = (facets.data?.tags ?? []).map((entry) => ({ value: entry.name, label: entry.name, count: entry.count }));

  const addButton = (
    <Button ref={addButtonRef} variant="primary" onClick={openPicker}>
      <Plus /> Add documents
    </Button>
  );

  // Saving a web page is the other way a document arrives. It is named in the address
  // (?save=page), so the command palette and the Import screen can lead straight to it.
  const savingPage = params.get("save") === "page";
  const setSavingPage = (open: boolean) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (open) next.set("save", "page");
        else next.delete("save");
        return next;
      },
      { replace: true },
    );
  // The row of the filter and the buttons: opened from there, the panel lies straight under the buttons (above the
  // Type and Sort rows, so that on a small phone the button and the address are in view together) and the screen
  // is scrolled to start at the row.
  const toolbarRef = useRef<HTMLDivElement>(null);
  const savePageButton = (
    <Button aria-expanded={savingPage} onClick={() => setSavingPage(!savingPage)}>
      <Globe /> Save a web page
    </Button>
  );

  return (
    <div className="relative mt-6">
      <input
        ref={pickerRef}
        type="file"
        multiple
        accept={ACCEPTED_FILES}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        data-testid="document-picker"
        onChange={(event) => {
          addFiles(Array.from(event.target.files ?? []));
          // Lets the same file be chosen again straight away.
          event.target.value = "";
        }}
      />

      {libraryEmpty ? null : (
        <>
          <div ref={toolbarRef} className="flex flex-wrap items-center gap-2 md:scroll-mt-4">
            <NameFilter value={filters.q} onChange={(q) => setFilters({ q }, true)} />
            <div className="flex flex-wrap gap-2 md:order-last md:ml-auto">
              {savePageButton}
              {addButton}
            </div>
            {savingPage ? (
              <SaveWebPagePanel onClose={() => setSavingPage(false)} opener={toolbarRef} className="mt-1 basis-full md:order-last" />
            ) : null}
            {/* The filters wrap onto a second line rather than scrolling sideways: Type, Category and Tag together are wider
                than a 320 px phone once a type is chosen. */}
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              {typeChoices.length > 1 || filters.type ? (
                <ChoiceMenu<DocumentType>
                  label="Type"
                  anyLabel="Any type"
                  value={filters.type}
                  choices={typeChoices}
                  onChange={(type) => setFilters({ type })}
                />
              ) : null}
              {categoryChoices.length > 0 || filters.category ? (
                <ChoiceMenu
                  label="Category"
                  anyLabel="Any category"
                  value={filters.category}
                  choices={categoryChoices}
                  onChange={(category) => setFilters({ category })}
                />
              ) : null}
              {tagChoices.length > 0 || filters.tag ? (
                <ChoiceMenu
                  label="Tag"
                  anyLabel="Any tag"
                  value={filters.tag}
                  choices={tagChoices}
                  onChange={(tag) => setFilters({ tag })}
                />
              ) : null}
            </div>
          </div>

          <div className="mt-5 flex min-h-8 flex-wrap items-center justify-between gap-x-4 gap-y-1">
            <p className="tabular text-small text-ink-muted" aria-live="polite">
              {filters.type === "audio" ? "" : summary(filters, facets.data, total)}
              {filtered && documents.length > 0 ? (
                <button
                  type="button"
                  className="ml-2 inline-flex min-h-6 items-center px-1 font-medium text-primary underline decoration-1 underline-offset-[0.2em] hover:decoration-2 pointer-coarse:min-h-11"
                  onClick={() => setParams((current) => clearFilters(current))}
                >
                  Clear filters
                </button>
              ) : null}
            </p>
            <ChoiceMenu<DocumentSort>
              label="Sort"
              value={filters.sort}
              choices={sortChoices}
              onChange={(sort) => setFilters({ sort: sort || "added" })}
              icon={<ArrowDownUp aria-hidden />}
              align="end"
            />
          </div>
        </>
      )}

      {savingPage && libraryEmpty ? <SaveWebPagePanel onClose={() => setSavingPage(false)} className="mb-6" /> : null}

      <UploadTray
        items={uploads}
        onAddAnyway={uploadQueue.addAnyway}
        onRetry={uploadQueue.retry}
        onCancel={uploadQueue.cancel}
        onDismiss={uploadQueue.clearSettled}
        className={libraryEmpty ? "mb-6" : "mt-3"}
      />

      {filters.type === "audio" ? null : <BooksPointer onShowAudiobooks={() => setFilters({ type: "audio" })} />}

      {filters.type === "audio" ? (
        <Suspense fallback={<p className="mt-3 text-small text-ink-muted">Loading audiobooks…</p>}>
          <AudiobookList q={filters.q} sort={filters.sort === "title" ? "title" : "added"} />
        </Suspense>
      ) : list.isPending || facets.isPending ? (
        <ul className="mt-3 divide-y divide-border border-y border-border" aria-busy aria-label="Loading documents">
          <DocumentRowSkeleton />
          <DocumentRowSkeleton />
          <DocumentRowSkeleton />
          <DocumentRowSkeleton />
        </ul>
      ) : list.isError ? (
        <div className="mt-3">
          <ErrorState error={list.error} onRetry={() => list.refetch()} />
        </div>
      ) : libraryEmpty ? (
        <EmptyState
          title="No documents yet"
          seed={7}
          action={
            <>
              {addButton}
              {savePageButton}
              {/* The buttons come straight after the first sentence, so that on a phone they are in view without scrolling;
                  then the way to something to read for a person with no files of their own, then the formats. */}
              <p className="mt-2 basis-full text-small text-ink-muted">
                No files to hand?{" "}
                <Link
                  to="/explore"
                  className="inline-flex min-h-6 items-center font-medium text-primary underline decoration-1 underline-offset-[0.2em] hover:decoration-2 max-md:min-h-11 md:pointer-coarse:min-h-11"
                >
                  Find something to read in Explore
                </Link>
                : encyclopedias, field manuals and books to download once and read here.
              </p>
              <p className="mt-1 basis-full text-small text-ink-muted">
                Or drop files anywhere on this screen. {SUPPORTED_TYPES} are supported.
              </p>
            </>
          }
        >
          <p>
            Add the manuals, books, papers and scans you want to keep. Outpost reads their text so that one search finds the page you need.
          </p>
        </EmptyState>
      ) : documents.length === 0 ? (
        <div className="mt-3 border-y border-border py-10">
          <h2 className="font-title text-heading text-ink">No documents match these filters</h2>
          <p className="mt-2 max-w-[52ch] text-ink-muted">Check the spelling, or look through everything again.</p>
          <Button className="mt-5" onClick={() => setParams((current) => clearFilters(current))}>
            Clear filters
          </Button>
        </div>
      ) : (
        <div className={cn("mt-3 transition-opacity", list.isPlaceholderData && "opacity-60")}>
          <Rows aria-label="Documents">
            {documents.map((document) => (
              <DocumentRow key={document.id} document={document} locationName={locationNames.get(document.locationId)} />
            ))}
          </Rows>
          {list.hasNextPage ? (
            <div className="mt-5 flex flex-wrap items-center gap-4">
              <Button onClick={() => list.fetchNextPage()} loading={list.isFetchingNextPage}>
                Show more
              </Button>
              <p className="tabular text-small text-ink-muted">
                Showing {formatNumber(documents.length)} of {formatNumber(total ?? documents.length)}
              </p>
            </div>
          ) : null}
        </div>
      )}

      {dragging ? (
        <div
          aria-hidden
          className="pointer-events-none absolute -inset-3 z-(--z-sticky) rounded-panel border-2 border-dashed border-primary bg-primary-soft/85"
        >
          <p className="sticky top-24 flex items-center justify-center gap-3 px-6 py-16 text-lead font-semibold text-primary-soft-ink">
            <Upload className="size-5" /> Drop to add to your library
          </p>
        </div>
      ) : null}
      <p className="sr-only" role="status">
        {dragging ? "Drop the files to add them to your library." : ""}
      </p>
    </div>
  );
}
