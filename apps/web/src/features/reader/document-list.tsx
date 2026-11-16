/**
 * The documents of a collection that is a set of files with a list, and not a web site.
 *
 * Such a collection's own page draws its list with the help of storage the browser
 * keeps for a site. A page inside Outpost's sandbox has no such storage, so its list
 * stays empty. The server reads the list out of the collection instead, and this shows
 * it: every title is plain text, a PDF or e-book opens in Outpost's viewer, a recording
 * in a player, and anything else is handed to the browser.
 */
import {
  type ArchiveDocument,
  type ArchiveDocumentFile,
  type ArchiveDocumentsResponse,
  formatBytes,
  type SaveArchiveFileResponse,
} from "@outpost/shared";
import { keepPreviousData, useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AudioLines,
  BookOpen,
  Check,
  File,
  Files,
  FileText,
  Film,
  Hourglass,
  LibraryBig,
  type LucideIcon,
  RotateCw,
  X,
} from "lucide-react";
import { useMemo } from "react";
import { Link } from "react-router";
import { ErrorState, Page } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/misc";
import { api, errorMessage } from "@/lib/api";
import { formatNumber, plural } from "@/lib/utils";
import { AddToLibraryPanel, useFileSizes } from "./add-all";

/** How many documents are asked for at a time. */
export const DOCUMENTS_PER_PAGE = 100;

const encodePath = (path: string) => path.split("/").map(encodeURIComponent).join("/");

const kinds: Record<ArchiveDocumentFile["kind"], { label: string; icon: LucideIcon }> = {
  pdf: { label: "PDF", icon: FileText },
  epub: { label: "E-book", icon: BookOpen },
  audio: { label: "Sound recording", icon: AudioLines },
  video: { label: "Video", icon: Film },
  other: { label: "File", icon: File },
};

/** "PDF", "Video", or for a kind the reader cannot show, its extension: "ODS file". */
export function fileKindLabel(file: Pick<ArchiveDocumentFile, "kind" | "name">): string {
  if (file.kind !== "other") return kinds[file.kind].label;
  const extension = /\.([a-z0-9]{1,6})$/i.exec(file.name)?.[1];
  return extension ? `${extension.toUpperCase()} file` : "File";
}

/** Whether the reader can show the file itself, or can only hand it to the browser. */
export const opensInReader = (file: Pick<ArchiveDocumentFile, "kind">) => file.kind !== "other";

/** The files the library can keep as documents. */
const canBeKept = (file: Pick<ArchiveDocumentFile, "kind">) => file.kind === "pdf" || file.kind === "epub";

export function useDocumentList(collectionId: string, query: string, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: ["kiwix", "documents", collectionId, "list", query],
    queryFn: ({ pageParam }) =>
      api.get<ArchiveDocumentsResponse>(`/api/kiwix/books/${collectionId}/documents`, {
        q: query,
        offset: pageParam,
        limit: DOCUMENTS_PER_PAGE,
      }),
    initialPageParam: 0,
    getNextPageParam: (last) => {
      if (!last.list) return undefined;
      const next = last.list.offset + last.list.documents.length;
      return last.list.documents.length > 0 && next < last.list.matched ? next : undefined;
    },
    placeholderData: keepPreviousData,
    enabled,
  });
}

const Slash = () => (
  <span aria-hidden className="mx-2 text-border-strong">
    /
  </span>
);

/**
 * "Add to library" for one file, and what has become of it: being copied, waiting its
 * turn in an "add all", in the library, or not added, with the reason and a way to try again.
 */
function KeepFile({
  collectionId,
  file,
  title,
  named,
}: {
  collectionId: string;
  file: ArchiveDocumentFile;
  title?: string;
  named: string;
}) {
  const client = useQueryClient();
  const save = useMutation({
    mutationFn: () => api.post<SaveArchiveFileResponse>(`/api/kiwix/books/${collectionId}/files/save`, { path: file.path, title }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["kiwix", "documents", collectionId] });
      for (const key of ["links", "documents"]) void client.invalidateQueries({ queryKey: [key] });
    },
  });
  const documentId = save.data?.document.id ?? file.documentId;
  if (documentId) {
    return (
      <Button asChild size="sm" variant="ghost" className="max-md:h-11">
        <Link to={`/library/documents/${documentId}`} aria-label={`In your library: ${named}`}>
          <Check /> In your library
        </Link>
      </Button>
    );
  }
  if (file.adding === "waiting" && !save.isPending) {
    return (
      <p className="flex h-8 items-center gap-2 px-2.5 text-small text-ink-muted max-md:h-11">
        <Hourglass aria-hidden className="size-4 shrink-0" />
        <span>
          Waiting its turn<span className="sr-only">: {named}</span>
        </span>
      </p>
    );
  }
  const adding = save.isPending || file.adding === "now";
  // What the person just tried counts for more than what an earlier "add all" ran into.
  const problem = save.isError ? errorMessage(save.error) : save.isPending ? null : file.problem;
  return (
    <div className="flex flex-col items-end gap-1 max-md:items-start">
      <Button
        size="sm"
        variant="ghost"
        loading={adding}
        className="max-md:h-11"
        onClick={() => save.mutate()}
        aria-label={`${adding ? "Adding to library" : problem ? "Try again" : "Add to library"}: ${named}`}
      >
        {adding ? (
          "Adding…"
        ) : problem ? (
          <>
            <RotateCw /> Try again
          </>
        ) : (
          <>
            <LibraryBig /> Add to library
          </>
        )}
      </Button>
      {problem ? (
        <p role="alert" className="max-w-[22rem] text-small text-danger max-md:px-2.5">
          Not added. {problem}
        </p>
      ) : null}
    </div>
  );
}

const titleClass = "font-title text-lead text-ink decoration-primary decoration-1 underline-offset-[0.22em]";
const fileClass =
  "min-w-0 py-1 text-small break-words text-primary underline decoration-1 underline-offset-[0.2em] hover:decoration-2 max-md:py-2.5";

function DocumentRow({
  collectionId,
  contentBase,
  document,
  sizes,
  onOpen,
}: {
  collectionId: string;
  contentBase: string;
  document: ArchiveDocument;
  /** How large each file is, by its path, where the collection has said. */
  sizes: Map<string, number>;
  onOpen(file: ArchiveDocumentFile, document: ArchiveDocument): void;
}) {
  const only = document.files.length === 1 ? document.files[0] : undefined;
  const Icon = only ? kinds[only.kind].icon : Files;
  // A list that repeats the title as its description says nothing by it.
  const description = document.description && document.description !== document.title ? document.description : "";
  const address = (file: ArchiveDocumentFile) => `${contentBase}${encodePath(file.path)}`;
  // The title is the control, and reaches over the lines under it so that the whole entry can be pressed.
  const reach = "after:absolute after:inset-0 hover:underline";

  return (
    <li className="flex flex-wrap items-start gap-x-4 gap-y-1 py-4">
      <Icon aria-hidden className="mt-1 size-5 shrink-0 text-ink-muted max-md:hidden" strokeWidth={1.6} />
      <div className="relative min-w-0 flex-1 basis-64">
        <h2 className={titleClass}>
          {!only ? (
            document.title
          ) : opensInReader(only) ? (
            <button type="button" onClick={() => onOpen(only, document)} className={`text-left ${reach}`}>
              {document.title}
            </button>
          ) : (
            <a href={address(only)} target="_blank" rel="noopener noreferrer" className={reach}>
              {document.title}
            </a>
          )}
        </h2>
        <p className="mt-0.5 text-small text-ink-muted">
          {only ? fileKindLabel(only) : plural(document.files.length, "file")}
          {only && sizes.has(only.path) ? (
            <>
              <Slash />
              <span className="tabular">{formatBytes(sizes.get(only.path))}</span>
            </>
          ) : null}
          {document.author ? (
            <>
              <Slash />
              {document.author}
            </>
          ) : null}
          {only && !opensInReader(only) ? (
            <>
              <Slash />
              opens in a new tab
            </>
          ) : null}
        </p>
        {description ? <p className="mt-1 line-clamp-2 text-small leading-relaxed text-ink-muted">{description}</p> : null}
        {!only ? (
          <ul className="mt-2 space-y-1" aria-label={`Files of ${document.title}`}>
            {document.files.map((file) => (
              <li key={file.path} className="flex flex-wrap items-center gap-x-3">
                {opensInReader(file) ? (
                  <button type="button" onClick={() => onOpen(file, document)} className={`text-left ${fileClass}`}>
                    {file.name}
                  </button>
                ) : (
                  <a href={address(file)} target="_blank" rel="noopener noreferrer" className={fileClass}>
                    {file.name}
                  </a>
                )}
                <span className="text-micro text-ink-muted">
                  {fileKindLabel(file)}
                  {sizes.has(file.path) ? <span className="tabular">, {formatBytes(sizes.get(file.path))}</span> : null}
                  {opensInReader(file) ? "" : ", opens in a new tab"}
                </span>
                {canBeKept(file) ? (
                  <span className="ml-auto">
                    <KeepFile collectionId={collectionId} file={file} named={file.name} />
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      {only && canBeKept(only) ? (
        <div className="shrink-0 max-md:-ml-2.5 max-md:basis-full">
          <KeepFile collectionId={collectionId} file={only} title={document.title} named={document.title} />
        </div>
      ) : null}
    </li>
  );
}

export function DocumentList({
  collectionId,
  contentBase,
  description,
  query,
  covered = false,
  onClearQuery,
  onOpen,
  onShowOwnPage,
}: {
  collectionId: string;
  /** Address of the collection's content, ending in "/". */
  contentBase: string;
  /** What the collection says about itself. */
  description: string | null;
  /** The words typed into the reader's search box. */
  query: string;
  /** True while a file is open over the list: it keeps its place, but cannot be reached until the file is closed. */
  covered?: boolean;
  onClearQuery(): void;
  onOpen(file: ArchiveDocumentFile, document: ArchiveDocument): void;
  onShowOwnPage(): void;
}) {
  const found = useDocumentList(collectionId, query, true);
  const first = found.data?.pages[0]?.list;
  const documents = found.data?.pages.flatMap((page) => page.list?.documents ?? []) ?? [];
  const remaining = first ? first.matched - documents.length : 0;
  // Sizes are asked for a part of the list at a time, as the list itself is, and only for what can be added.
  const pages = found.data?.pages;
  const keepable = useMemo(
    () =>
      (pages ?? []).map((page) =>
        (page.list?.documents ?? []).flatMap((document) => document.files.filter(canBeKept).map((file) => file.path)).slice(0, 500),
      ),
    [pages],
  );
  const sizes = useFileSizes(collectionId, keepable);

  return (
    <div className="absolute inset-0 overflow-y-auto bg-page" inert={covered}>
      <Page width="reading" className="md:pt-8">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h1 className="font-title text-heading text-ink">{query ? `Documents matching “${query}”` : "Documents in this collection"}</h1>
          {query ? (
            <Button variant="ghost" size="sm" onClick={onClearQuery}>
              <X /> Show all documents
            </Button>
          ) : null}
        </div>
        {!query && description ? <p className="mt-1 text-body text-ink-muted">{description}</p> : null}

        {found.isPending ? (
          <div className="mt-6 grid gap-5" aria-busy>
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
          </div>
        ) : found.isError ? (
          <div className="mt-6">
            <ErrorState error={found.error} onRetry={() => found.refetch()} />
          </div>
        ) : !first ? (
          <p className="mt-4 text-ink-muted">This collection's list of documents cannot be shown right now.</p>
        ) : (
          <>
            <p className="tabular mt-1 text-small text-ink-muted" role="status">
              {first.total === 0
                ? "The collection's list is empty."
                : query
                  ? first.matched === 0
                    ? `None of the ${plural(first.total, "document")} has those words in its title, author or description. Try fewer or different ones.`
                    : `${formatNumber(first.matched)} of ${plural(first.total, "document")}`
                  : plural(first.total, "document")}
            </p>
            {first.total > 0 ? <AddToLibraryPanel collectionId={collectionId} query={query} /> : null}
            {documents.length > 0 ? (
              <ul className="mt-4 divide-y divide-border border-t border-border" aria-label="Documents">
                {documents.map((document) => (
                  <DocumentRow
                    key={document.id}
                    collectionId={collectionId}
                    contentBase={contentBase}
                    document={document}
                    sizes={sizes}
                    onOpen={onOpen}
                  />
                ))}
              </ul>
            ) : null}
            {found.hasNextPage ? (
              <div className="mt-5">
                <Button variant="secondary" loading={found.isFetchingNextPage} onClick={() => found.fetchNextPage()}>
                  Show {formatNumber(Math.min(DOCUMENTS_PER_PAGE, remaining))} more
                </Button>
              </div>
            ) : null}
            {first.truncated ? (
              <p className="mt-5 text-small text-ink-muted">
                The collection lists more documents than Outpost reads. Only the first {formatNumber(first.total)} are here.
              </p>
            ) : null}
            {first.skipped > 0 && !query ? (
              <p className="mt-5 text-small text-ink-muted">
                {plural(first.skipped, "entry", "entries")} in the collection's list {first.skipped === 1 ? "names" : "name"} no file that
                can be opened, and {first.skipped === 1 ? "is" : "are"} left out.
              </p>
            ) : null}
          </>
        )}

        <p className="mt-10 border-t border-border pt-4 text-small text-ink-muted">
          Outpost drew this list from the collection's own list of documents. The collection's page cannot draw it here.{" "}
          <Button variant="link" onClick={onShowOwnPage}>
            Show the collection's own page
          </Button>
        </p>
      </Page>
    </div>
  );
}
