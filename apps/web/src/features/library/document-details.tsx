import { type DocumentDto, type DocumentFacets, type DocumentPatch, type DocumentResponse, formatBytes } from "@outpost/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, CircleAlert, Copy, RefreshCw, Trash2 } from "lucide-react";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Badge, Tooltip } from "@/components/ui/misc";
import { api, errorMessage } from "@/lib/api";
import { copyText } from "@/lib/clipboard";
import { notify } from "@/lib/notify";
import { cn, formatDateTime, formatNumber, plural } from "@/lib/utils";
import { CalibreBookDetails } from "./calibre/book-details";
import { useBookDetails } from "./calibre/calibre-data";
import { SavedField } from "./document-field";
import { documentKeys, isReading, kindOfDocument } from "./document-meta";
import { OcrDetails, useDocumentOcr } from "./document-ocr";
import { TagEditor } from "./document-tags";
import { MadeInOutpostLine } from "./made/made-in-outpost";

function Group({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={cn("border-t border-border px-5 py-5 first:border-t-0", className)}>
      <h3 className="mb-3 text-small font-semibold text-ink">{title}</h3>
      {children}
    </section>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border py-2 last:border-b-0">
      <dt className="shrink-0 text-small text-ink-muted">{label}</dt>
      <dd className="tabular min-w-0 text-right text-small break-words text-ink">{children}</dd>
    </div>
  );
}

function Checksum({ sha256 }: { sha256: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    if (!(await copyText(sha256))) return notify.error("The checksum could not be copied. Select it and copy it by hand.");
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="py-2">
      <dt className="flex items-center justify-between gap-2 text-small text-ink-muted">
        SHA-256
        <Tooltip label={copied ? "Copied" : "Copy checksum"}>
          <Button variant="ghost" size="icon-sm" aria-label="Copy the SHA-256 checksum" onClick={copy} className="-my-1.5 -mr-1.5">
            {copied ? <Check className="text-success" /> : <Copy />}
          </Button>
        </Tooltip>
      </dt>
      <dd className="mt-1 font-mono text-[0.8125rem] leading-snug break-all text-ink">{sha256}</dd>
    </div>
  );
}

function TextStatus({ document, onDocument }: { document: DocumentDto; onDocument: (document: DocumentDto) => void }) {
  const reading = isReading(document);
  const ocr = useDocumentOcr(document);
  const reextract = useMutation({
    mutationFn: () => api.post<DocumentResponse>(`/api/documents/${document.id}/reextract`),
    onSuccess: (data) => onDocument(data.document),
    onError: (error) => notify.error(errorMessage(error)),
  });

  return (
    <Group title="Text for search">
      {reading ? (
        <p className="flex items-center gap-2 text-small text-lamp-ink">
          <span aria-hidden className="size-2 shrink-0 rounded-[2px] bg-lamp" />
          Reading text…
        </p>
      ) : document.extraction === "done" ? (
        <p className="text-small text-ink-muted">
          Read and searchable: <span className="tabular text-ink">{plural(document.textChars, "character")}</span>
          {/* With some pages still unread scans, the text is not "on" every page. */}
          {document.pageCount
            ? document.scanPages > 0
              ? ` from a document of ${plural(document.pageCount, "page")}`
              : ` on ${plural(document.pageCount, "page")}`
            : ""}
          .
        </p>
      ) : document.extraction === "failed" ? (
        <p className="flex items-start gap-2 text-small text-danger">
          <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          The text could not be read.
        </p>
      ) : (
        <p className="text-small text-ink-muted">No searchable text. The document can still be opened and found by its title and tags.</p>
      )}
      {document.extractionDetail && !reading ? <p className="mt-1.5 text-small text-ink">{document.extractionDetail}</p> : null}
      {/* Reading the file again would stop OCR part-way, so it waits for that to finish. */}
      <Button
        size="sm"
        className="mt-3"
        onClick={() => reextract.mutate()}
        loading={reextract.isPending}
        disabled={reading || ocr.stage === "reading"}
      >
        {reextract.isPending ? null : <RefreshCw />} Read text again
      </Button>
      {reading ? null : <OcrDetails document={document} ocr={ocr} />}
    </Group>
  );
}

function DeleteDocument({ document, locationName, onDeleted }: { document: DocumentDto; locationName: string; onDeleted: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const client = useQueryClient();
  // With the drive away the file cannot be touched; only Outpost's record can go. A book read
  // where it lies in a Calibre folder is Calibre's file, so only the record goes there too.
  const inCalibre = useBookDetails(document.id).data?.inCalibreFolder === true;
  const forget = !document.locationAvailable || inCalibre;
  const remove = useMutation({
    mutationFn: () => api.delete(`/api/documents/${document.id}`, forget ? { forget: true } : undefined),
    onSuccess: () => {
      setConfirming(false);
      toast.success(
        forget
          ? `Removed “${document.title}” from Outpost. Its file was left on “${locationName}”.`
          : `Deleted “${document.title}” and its file.`,
      );
      client.removeQueries({ queryKey: documentKeys.detail(document.id) });
      void client.invalidateQueries({ queryKey: documentKeys.all });
      onDeleted();
    },
    onError: (error) => {
      setConfirming(false);
      notify.error(errorMessage(error));
    },
  });

  return (
    <Group title={forget ? "Remove" : "Delete"}>
      {inCalibre ? (
        <p className="mb-3 text-small text-ink-muted">
          This book is read from its Calibre folder, and Outpost does not change that folder. Removing it here leaves the file in Calibre.
        </p>
      ) : forget ? (
        <p className="mb-3 text-small text-ink-muted">
          “{locationName}” is not connected, so the original file cannot be deleted now. Reconnect it to delete the document and its file,
          or remove only Outpost's record and leave the file where it is.
        </p>
      ) : null}
      <Button variant="danger-ghost" size="sm" className="-ml-2.5" onClick={() => setConfirming(true)}>
        <Trash2 /> {forget ? "Remove from Outpost only" : "Delete document"}
      </Button>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={forget ? `Remove “${document.title}” from Outpost?` : `Delete “${document.title}”?`}
        description={
          forget ? (
            <>
              Outpost will forget this document, its details and the text it read. The original file ({document.originalName}) is not
              deleted: it stays on “{locationName}”.
            </>
          ) : (
            <>
              This deletes the document from Outpost <strong className="font-semibold text-ink">and deletes the original file</strong> (
              {document.originalName}, {formatBytes(document.sizeBytes)}) from “{locationName}”. It cannot be undone.
            </>
          )
        }
        confirmLabel={forget ? "Remove from Outpost only" : "Delete document and file"}
        onConfirm={() => remove.mutate()}
        loading={remove.isPending}
      />
    </Group>
  );
}

/** Everything known about a document besides its pages: what it is called and filed under, the facts of the file, and what can be done with it. */
export function DocumentDetails({
  document,
  locationName,
  onDeleted,
}: {
  document: DocumentDto;
  locationName: string;
  onDeleted: () => void;
}) {
  const client = useQueryClient();
  const facets = useQuery({ queryKey: documentKeys.facets, queryFn: () => api.get<DocumentFacets>("/api/documents/facets") });
  const kind = kindOfDocument(document);

  const accept = (updated: DocumentDto) => client.setQueryData<DocumentResponse>(documentKeys.detail(document.id), { document: updated });
  const save = async (patch: DocumentPatch) => {
    const data = await api.patch<DocumentResponse>(`/api/documents/${document.id}`, patch);
    accept(data.document);
    // The list and the filter counts show these fields too.
    void client.invalidateQueries({ queryKey: ["documents", "list"] });
    void client.invalidateQueries({ queryKey: documentKeys.facets });
  };

  return (
    <>
      <CalibreBookDetails documentId={document.id} title={document.title} />
      <Group title="About this document">
        {/* Said once, where the fields begin: each saves itself, and "Saved" shows beside it when it has. */}
        <p className="-mt-2 mb-3 text-small text-ink-muted">Each change is saved as you leave the field or press Enter.</p>
        <div className="grid gap-4">
          <SavedField label="Title" value={document.title} onSave={(title) => save({ title })} maxLength={300} />
          <SavedField
            label="Description"
            value={document.description}
            onSave={(description) => save({ description: description || null })}
            multiline
            maxLength={5000}
          />
          <SavedField
            label="Category"
            value={document.category}
            onSave={(category) => save({ category: category || null })}
            suggestions={facets.data?.categories.map((category) => category.name)}
            maxLength={100}
          />
          <TagEditor tags={document.tags} suggestions={facets.data?.tags.map((tag) => tag.name)} onChange={(tags) => save({ tags })} />
          <SavedField label="Author" value={document.author} onSave={(author) => save({ author: author || null })} maxLength={300} />
          <SavedField
            label="Source"
            value={document.source}
            onSave={(source) => save({ source: source || null })}
            placeholder="Where it came from"
            maxLength={1000}
          />
          <MadeInOutpostLine source={document.source} />
          <SavedField
            label="Language"
            value={document.language}
            onSave={(language) => save({ language: language || null })}
            placeholder="For example: en"
            maxLength={35}
          />
        </div>
      </Group>

      <Group title="File">
        <dl>
          <Fact label="File name">{document.originalName}</Fact>
          <Fact label="Type">{kind.label}</Fact>
          <Fact label="Size">{formatBytes(document.sizeBytes)}</Fact>
          {document.pageCount ? <Fact label="Pages">{formatNumber(document.pageCount)}</Fact> : null}
          <Fact label="Added">{formatDateTime(document.createdAt)}</Fact>
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-border py-2">
            <dt className="text-small text-ink-muted">Stored on</dt>
            <dd className="flex min-w-0 flex-wrap items-center justify-end gap-2 text-small text-ink">
              <span className="break-words">{locationName}</span>
              {document.locationAvailable ? (
                <Badge tone="success">
                  <Check aria-hidden /> Connected
                </Badge>
              ) : (
                <Badge tone="warning">
                  <CircleAlert aria-hidden /> Disconnected
                </Badge>
              )}
            </dd>
          </div>
          <Checksum sha256={document.sha256} />
        </dl>
      </Group>

      <TextStatus document={document} onDocument={accept} />

      <DeleteDocument document={document} locationName={locationName} onDeleted={onDeleted} />
    </>
  );
}
