/**
 * Files a reference page links to.
 *
 * An archive made from a web site often holds PDFs as well as pages, and a page may
 * also point at files the archive never captured. Either way a person should be able to
 * keep such a file as a document of their own. A file inside the archive is copied out
 * of it, with no connection needed. A file that is only on the internet is fetched
 * through the download manager.
 */
import {
  type ArchiveFileState,
  isSavableLink,
  type LinkState,
  type PageFile,
  type SaveArchiveFileResponse,
  type SaveLinkResponse,
  type SaveLinksResponse,
} from "@outpost/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Download, ExternalLink, FileDown, LibraryBig, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { Notice } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Checkbox, Progress, Skeleton } from "@/components/ui/misc";
import { api, errorMessage } from "@/lib/api";
import { plural } from "@/lib/utils";

export const fileKey = (file: PageFile) => (file.kind === "archive" ? `archive:${file.path}` : file.href);

/** The name to show for a file: the link's own words, or failing that the file's name. */
export function fileLabel(file: PageFile): string {
  if (file.text && !/^https?:\/\//i.test(file.text)) return file.text;
  const address = file.kind === "archive" ? file.path : file.href;
  const last = address.split(/[?#]/)[0]?.split("/").filter(Boolean).pop() ?? address;
  try {
    return decodeURIComponent(last);
  } catch {
    return last;
  }
}

/**
 * The title to give the document, when the link's words are good enough to be one.
 * "Part 2" or "PDF" says nothing once it is out of its page, so for those the title is
 * left to the file itself: its own title if it carries one, else its name.
 */
export function fileTitle(file: PageFile): string | undefined {
  const text = file.text.trim();
  if (text.length < 10 || /^https?:\/\//i.test(text)) return undefined;
  if (/^(part|section|chapter|volume|vol\.?|full text|pdf|download|here|click|view|file|read)\b/i.test(text)) return undefined;
  return text;
}

/** "irp.fas.org", or "3 websites" when the files are spread about. */
export function hostsOf(files: PageFile[]): string {
  const hosts = new Set<string>();
  for (const file of files) {
    if (file.kind !== "internet") continue;
    try {
      hosts.add(new URL(file.href).hostname);
    } catch {
      // Not an address; it will be refused when saving.
    }
  }
  const [only] = hosts;
  return hosts.size === 1 && only ? only : plural(hosts.size, "website");
}

type FileStatus = { state: "new" } | { state: "saved"; documentId: string } | { state: "saving"; downloadId: string };

/** Which of a page's files are already documents, or on their way. */
export function useFileStatus(collectionId: string, files: PageFile[]) {
  const paths = useMemo(() => files.flatMap((file) => (file.kind === "archive" ? [file.path] : [])), [files]);
  const urls = useMemo(() => files.flatMap((file) => (file.kind === "internet" ? [file.href] : [])), [files]);
  const inside = useQuery({
    queryKey: ["links", "archive", collectionId, paths],
    queryFn: () => api.post<{ files: ArchiveFileState[] }>(`/api/kiwix/books/${collectionId}/files/check`, { paths }),
    enabled: paths.length > 0,
  });
  const outside = useQuery({
    queryKey: ["links", "internet", urls],
    queryFn: () => api.post<{ links: LinkState[] }>("/api/links/check", { urls }),
    enabled: urls.length > 0,
    refetchInterval: (query) => (query.state.data?.links.some((link) => link.state === "saving") ? 4000 : false),
  });
  const status = useMemo(() => {
    const map = new Map<string, FileStatus>();
    for (const item of inside.data?.files ?? []) {
      if (item.state === "saved") map.set(`archive:${item.path}`, { state: "saved", documentId: item.documentId });
    }
    for (const item of outside.data?.links ?? []) {
      if (item.state === "saved") map.set(item.url, { state: "saved", documentId: item.documentId });
      else if (item.state === "saving") map.set(item.url, { state: "saving", downloadId: item.downloadId });
    }
    return map;
  }, [inside.data, outside.data]);
  const loading = (paths.length > 0 && inside.isPending) || (urls.length > 0 && outside.isPending);
  return { statusOf: (file: PageFile): FileStatus => status.get(fileKey(file)) ?? { state: "new" }, loading };
}

/** Shown when a link that leaves the library was pressed. */
export function ExternalLinkNotice({ href, foundIn, onDismiss }: { href: string; foundIn: string; onDismiss(): void }) {
  const client = useQueryClient();
  const savable = isSavableLink(href);
  const save = useMutation({
    mutationFn: () => api.post<SaveLinkResponse>("/api/links/save", { url: href, foundIn }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["downloads"] });
      void client.invalidateQueries({ queryKey: ["links"] });
    },
  });
  // A different link is a different question.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset is stable; only the address matters
  useEffect(() => save.reset(), [href]);
  const result = save.data;

  return (
    <Notice tone="info" icon={<ExternalLink />} className="rounded-none border-b border-border">
      <div className="flex flex-col gap-2.5 md:flex-row md:items-start md:gap-4">
        <div className="min-w-0 flex-1">
          <p>
            {savable
              ? "This file is not in the collection. It is on the internet at "
              : "That link leaves your library and needs the internet: "}
            <span className="font-mono text-[0.8125rem] break-all">{href}</span>
          </p>
          {result?.already === "saved" ? (
            <p className="mt-1 flex flex-wrap items-center gap-1.5 font-medium">
              <Check aria-hidden className="size-4" /> Already in your library.
              <Link to={`/library/documents/${result.document.id}`} className="underline underline-offset-2">
                Open it
              </Link>
            </p>
          ) : result ? (
            <p className="mt-1 font-medium">
              {result.already === "saving"
                ? "It is already on its way. "
                : "Fetching it now. It will be in your library when it finishes. "}
              <Link to={`/downloads/${result.download.id}`} className="underline underline-offset-2">
                See its progress
              </Link>
            </p>
          ) : save.isError ? (
            <p className="mt-1 font-medium text-danger">{errorMessage(save.error)}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          {savable && !result ? (
            <Button size="sm" variant="primary" loading={save.isPending} onClick={() => save.mutate()}>
              <Download /> Save to library
            </Button>
          ) : null}
          <Button asChild size="sm" variant="ghost">
            <a href={href} target="_blank" rel="noopener noreferrer">
              Open in a new tab
            </a>
          </Button>
          <Button size="icon-sm" variant="ghost" aria-label="Dismiss" onClick={onDismiss} className="max-md:ml-auto">
            <X />
          </Button>
        </div>
      </div>
    </Notice>
  );
}

/** A line under the reader's header when the page links to files, and the dialog to keep them. */
export function LinkedFiles({ collectionId, files, foundIn }: { collectionId: string; files: PageFile[]; foundIn: string }) {
  const [open, setOpen] = useState(false);
  const { statusOf, loading } = useFileStatus(collectionId, files);
  if (files.length === 0) return null;

  const fresh = files.filter((file) => statusOf(file).state === "new");
  const kept = files.length - fresh.length;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-border bg-surface px-3 py-2 text-small text-ink-muted md:px-4">
      <FileDown aria-hidden className="size-4 shrink-0" />
      <p className="min-w-0 flex-1">
        This page links to {plural(files.length, "file")}
        {!loading && kept > 0 ? `; ${kept === files.length ? "all" : kept} already in your library` : ""}.
      </p>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        {loading || fresh.length > 0 ? "Add them to your library" : "See them"}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        {open ? (
          <SaveFilesDialog
            collectionId={collectionId}
            files={files}
            statusOf={statusOf}
            loading={loading}
            foundIn={foundIn}
            onClose={() => setOpen(false)}
          />
        ) : null}
      </Dialog>
    </div>
  );
}

interface Outcome {
  added: number;
  queued: number;
  already: number;
  problems: Array<{ name: string; reason: string }>;
}

function SaveFilesDialog({
  collectionId,
  files,
  statusOf,
  loading,
  foundIn,
  onClose,
}: {
  collectionId: string;
  files: PageFile[];
  statusOf(file: PageFile): FileStatus;
  loading: boolean;
  foundIn: string;
  onClose(): void;
}) {
  const client = useQueryClient();
  const fresh = files.filter((file) => statusOf(file).state === "new");
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState<{ done: number; total: number; name: string }>();
  const chosen = fresh.filter((file) => !skipped.has(fileKey(file)));
  const inside = chosen.filter((file) => file.kind === "archive");
  const outside = chosen.filter((file) => file.kind === "internet");
  const anyOutside = files.some((file) => file.kind === "internet");
  const anyInside = files.some((file) => file.kind === "archive");

  const save = useMutation({
    mutationFn: async (): Promise<Outcome> => {
      const outcome: Outcome = { added: 0, queued: 0, already: 0, problems: [] };
      // Files in the archive are copied out one at a time: each is quick, and the count is honest.
      for (const [index, file] of inside.entries()) {
        if (file.kind !== "archive") continue;
        setProgress({ done: index, total: inside.length, name: fileLabel(file) });
        try {
          const result = await api.post<SaveArchiveFileResponse>(`/api/kiwix/books/${collectionId}/files/save`, {
            path: file.path,
            title: fileTitle(file),
          });
          if (result.status === "created") outcome.added += 1;
          else outcome.already += 1;
        } catch (error) {
          outcome.problems.push({ name: fileLabel(file), reason: errorMessage(error) });
        }
      }
      setProgress(undefined);
      if (outside.length > 0) {
        const links = outside.flatMap((file) => (file.kind === "internet" ? [{ url: file.href, title: fileTitle(file) }] : []));
        try {
          const result = await api.post<SaveLinksResponse>("/api/links/save-all", { foundIn, links });
          outcome.queued = result.queued.length;
          outcome.already += result.already;
          for (const item of result.refused) outcome.problems.push({ name: item.url, reason: item.reason });
        } catch (error) {
          outcome.problems.push({ name: `${plural(outside.length, "file")} on the internet`, reason: errorMessage(error) });
        }
      }
      return outcome;
    },
    onSettled: () => {
      for (const key of ["downloads", "links", "documents"]) void client.invalidateQueries({ queryKey: [key] });
    },
  });
  const toggle = (key: string, on: boolean) =>
    setSkipped((before) => {
      const next = new Set(before);
      if (on) next.delete(key);
      else next.add(key);
      return next;
    });

  if (save.data) {
    const { added, queued, already, problems } = save.data;
    return (
      <DialogContent title={added + queued > 0 ? "Added to your library" : "Nothing was added"}>
        <DialogBody className="space-y-3 text-small">
          {added > 0 ? (
            <p>
              {plural(added, "file")} {added === 1 ? "is" : "are"} now in your library, under Documents. Their text is being read so that
              search can find it; long files take a minute or two.
            </p>
          ) : null}
          {queued > 0 ? (
            <p>
              {plural(queued, "file")} {queued === 1 ? "is" : "are"} being fetched from the internet and will appear in your library as each
              one finishes.
            </p>
          ) : null}
          {already > 0 ? <p className="text-ink-muted">{plural(already, "file")} had been added before.</p> : null}
          {problems.length > 0 ? (
            <div>
              <p className="font-medium text-ink">{plural(problems.length, "file")} could not be added</p>
              <ul className="mt-1 space-y-1 text-ink-muted">
                {problems.map((item) => (
                  <li key={item.name}>
                    <span className="break-all text-ink">{item.name}</span>: {item.reason}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            Keep reading
          </Button>
          {queued > 0 ? (
            <Button asChild variant="secondary">
              <Link to="/downloads">See the downloads</Link>
            </Button>
          ) : null}
          {added > 0 ? (
            <Button asChild variant="primary">
              <Link to="/library">
                <LibraryBig /> Open your documents
              </Link>
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    );
  }

  const where =
    anyInside && anyOutside
      ? `Some are inside this collection and can be added with no connection. Others are on the internet, at ${hostsOf(files)}, and are fetched from there.`
      : anyOutside
        ? `They are on the internet, at ${hostsOf(files)}, not in this collection. Adding one fetches it from there.`
        : "They are inside this collection, so adding them needs no connection.";
  return (
    <DialogContent
      size="lg"
      title="Files this page links to"
      description={`${where} In your library each one opens in the document viewer and can be searched page by page.`}
    >
      <DialogBody className="px-0 py-0">
        {loading ? (
          <div className="space-y-3 px-5 py-4">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-5 w-1/2" />
            <Skeleton className="h-5 w-3/5" />
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {files.map((file) => {
              const key = fileKey(file);
              const status = statusOf(file);
              const id = `file-${key}`;
              return (
                <li key={key} className="flex items-start gap-3 px-5 py-3 max-md:py-3.5">
                  {status.state === "new" ? (
                    <Checkbox
                      id={id}
                      className="mt-0.5"
                      checked={!skipped.has(key)}
                      disabled={save.isPending}
                      onCheckedChange={(on) => toggle(key, on === true)}
                    />
                  ) : (
                    <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-success" />
                  )}
                  <div className="min-w-0 flex-1">
                    <label htmlFor={status.state === "new" ? id : undefined} className="block text-small font-medium text-ink">
                      {fileLabel(file)}
                    </label>
                    <p className="mt-0.5 text-micro break-all text-ink-muted">
                      {file.kind === "archive" ? "In this collection" : <span className="font-mono">{file.href}</span>}
                    </p>
                  </div>
                  {status.state === "saved" ? (
                    <Link
                      to={`/library/documents/${status.documentId}`}
                      className="shrink-0 text-small text-primary underline underline-offset-2"
                    >
                      In your library
                    </Link>
                  ) : status.state === "saving" ? (
                    <Link to={`/downloads/${status.downloadId}`} className="shrink-0 text-small text-primary underline underline-offset-2">
                      On its way
                    </Link>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </DialogBody>
      <DialogFooter className="justify-between">
        <div className="min-w-0 flex-1 text-small text-ink-muted">
          {progress ? (
            <div>
              <p className="truncate">
                Adding {progress.done + 1} of {progress.total}: {progress.name}
              </p>
              <Progress value={progress.done / progress.total} className="mt-1.5" label="Files added" />
            </div>
          ) : fresh.length === 0 && !loading ? (
            "All of these are already in your library."
          ) : outside.length > 0 ? (
            `${plural(outside.length, "file")} will be fetched from the internet.`
          ) : null}
        </div>
        <Button variant="secondary" onClick={onClose}>
          {save.isPending ? "Close" : "Cancel"}
        </Button>
        <Button variant="primary" disabled={chosen.length === 0 || loading} loading={save.isPending} onClick={() => save.mutate()}>
          <LibraryBig /> Add {plural(chosen.length, "file")}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
