/**
 * A file inside a reference collection, shown over the page that linked to it.
 *
 * A PDF opens in Outpost's own viewer, read straight out of the archive. Any file shown
 * here can be added to the document library, where it is searchable page by page.
 */
import { type ArchiveFileState, formatBytes, type SaveArchiveFileResponse } from "@outpost/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, BookOpen, Check, LibraryBig, RotateCw } from "lucide-react";
import { lazy, Suspense, useRef, useState } from "react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { Skeleton, Tooltip } from "@/components/ui/misc";
import { api, errorMessage } from "@/lib/api";
import { ViewerToolbar } from "../library/document-toolbar";
import type { ViewerControls, ViewerState } from "../library/document-viewer";
import { fileTitle } from "./linked-files";

const PdfViewer = lazy(() => import("../library/pdf-viewer"));

/** A link or a list can name a file the collection was made without. */
const ARCHIVE_MISSING = {
  title: "This collection does not have that file",
  text: "The page or list that named it points to a file that was left out when the collection was made. Nothing is wrong with your library.",
};

export function ArchiveFile({
  collectionId,
  url,
  path,
  label,
  title,
  backLabel = "Back to the page",
  onClose,
}: {
  collectionId: string;
  /** Address of the file as the archive serves it. */
  url: string;
  /** Path of the file inside the book. */
  path: string;
  label: string;
  /** The title to give the document when it is added, where the collection's own list names it. */
  title?: string;
  backLabel?: string;
  onClose(): void;
}) {
  const client = useQueryClient();
  const [viewer, setViewer] = useState<ViewerState | null>(null);
  const controlsRef = useRef<ViewerControls>(null);
  const controls: ViewerControls = {
    zoomBy: (direction) => controlsRef.current?.zoomBy(direction),
    fit: () => controlsRef.current?.fit(),
    goToPage: (page) => controlsRef.current?.goToPage?.(page),
  };
  const isPdf = /\.pdf$/i.test(path);

  const kept = useQuery({
    queryKey: ["links", "archive", collectionId, [path]],
    queryFn: () => api.post<{ files: ArchiveFileState[] }>(`/api/kiwix/books/${collectionId}/files/check`, { paths: [path] }),
    select: (data) => data.files[0],
    // An "add all" may be copying this very file; ask again until it has.
    refetchInterval: (query) => (query.state.data?.files[0]?.state === "adding" ? 1500 : false),
  });
  const save = useMutation({
    mutationFn: () =>
      api.post<SaveArchiveFileResponse>(`/api/kiwix/books/${collectionId}/files/save`, {
        path,
        title: title ?? fileTitle({ kind: "archive", path, text: label }),
      }),
    onSuccess: () => {
      for (const key of ["links", "documents"]) void client.invalidateQueries({ queryKey: [key] });
      // A collection's own list of documents says which of them are in the library.
      void client.invalidateQueries({ queryKey: ["kiwix", "documents", collectionId] });
    },
  });
  const documentId = save.data?.document.id ?? (kept.data?.state === "saved" ? kept.data.documentId : undefined);

  return (
    <div className="absolute inset-0 flex flex-col bg-page">
      <div className="flex min-h-12 shrink-0 flex-wrap items-center gap-x-2 gap-y-1 border-b border-border px-2 py-1.5 md:px-3">
        <Button variant="ghost" size="sm" onClick={onClose}>
          <ArrowLeft /> {backLabel}
        </Button>
        <h2 className="min-w-0 flex-1 truncate text-small font-medium text-ink" title={label}>
          {label}
        </h2>
        {viewer ? <ViewerToolbar state={viewer} controls={controls} className="shrink-0 max-md:hidden" /> : null}
        {documentId ? (
          <Button asChild size="sm" variant="secondary">
            <Link to={`/library/documents/${documentId}`}>
              <Check /> In your library
            </Link>
          </Button>
        ) : (
          <Tooltip label="Copied from this collection; nothing is downloaded">
            <Button
              size="sm"
              variant="primary"
              loading={save.isPending || kept.data?.state === "adding"}
              disabled={kept.isPending}
              onClick={() => save.mutate()}
            >
              {save.isError ? (
                <>
                  <RotateCw /> Try again
                </>
              ) : (
                <>
                  <LibraryBig /> Add to library
                </>
              )}
            </Button>
          </Tooltip>
        )}
      </div>
      {save.isError ? (
        <p role="alert" className="border-b border-border bg-danger-soft px-4 py-2 text-small text-danger">
          Not added. {errorMessage(save.error)}
        </p>
      ) : null}
      {save.data?.status === "created" ? (
        <p role="status" className="border-b border-border bg-surface px-4 py-2 text-small text-ink-muted">
          Copied out of this collection into your library ({formatBytes(save.data.document.sizeBytes)}); nothing was downloaded. Its text is
          being read so that search can find it.
        </p>
      ) : null}
      {save.data?.status === "duplicate" ? (
        <p className="border-b border-border bg-surface px-4 py-2 text-small text-ink-muted">
          Your library already held this exact file, so nothing new was added.
        </p>
      ) : null}

      {isPdf ? (
        <Suspense
          fallback={
            <div className="flex min-h-0 flex-1 justify-center overflow-hidden bg-surface-strong p-4" aria-busy>
              <Skeleton className="h-[140%] w-full max-w-[52rem] rounded-none" />
            </div>
          }
        >
          <PdfViewer
            key={url}
            url={url}
            title={label}
            initialPage={1}
            downloadUrl={url}
            onState={setViewer}
            controls={controlsRef}
            missing={ARCHIVE_MISSING}
          />
        </Suspense>
      ) : (
        <div className="grid min-h-0 flex-1 place-items-center p-6">
          <div className="max-w-[30rem] text-center">
            <BookOpen aria-hidden className="mx-auto size-8 text-ink-muted" strokeWidth={1.4} />
            <h3 className="mt-3 font-title text-heading text-ink">An e-book inside this collection</h3>
            <p className="mt-2 text-small text-ink-muted">
              Add it to your library to read it there and to have its text searched with everything else you keep. It is copied from the
              collection on this device; no connection is needed.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
