/**
 * Files a reference page links to.
 *
 * An archive made from a web site often holds PDFs as well as pages, and a page may
 * also point at files the archive never captured. Either way a person should be able to
 * keep such a file as a document of their own. A file inside the archive is copied out
 * of it, with no connection needed: one from the viewer it opens in, several by the same
 * job that adds every document of a collection that lists them (add-all.tsx). A file that
 * is only on the internet is fetched through the download manager.
 */
import {
  type ArchiveAddScope,
  type ArchiveFileState,
  formatBytes,
  isSavableLink,
  type LinkState,
  type PageFile,
  type SaveLinkResponse,
  type SaveLinksResponse,
} from "@outpost/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Download, ExternalLink, FileDown, Hourglass, LibraryBig, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { Notice } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Checkbox, Skeleton } from "@/components/ui/misc";
import { api, errorMessage } from "@/lib/api";
import { plural } from "@/lib/utils";
import { type AddAll, AddAllStatus, planSize, useAddAll, useAddPlan, useFileSizes } from "./add-all";

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

type FileStatus =
  | { state: "new" }
  | { state: "saved"; documentId: string }
  /** On its way from the internet. */
  | { state: "saving"; downloadId: string }
  /** Being copied out of the collection, or waiting its turn to be. */
  | { state: "adding"; turn: "now" | "waiting" };

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
      else if (item.state === "adding") map.set(`archive:${item.path}`, { state: "adding", turn: item.turn });
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
  const addAll = useAddAll(
    collectionId,
    "files",
    files.some((file) => file.kind === "archive"),
  );
  if (files.length === 0) return null;

  const fresh = files.filter((file) => statusOf(file).state === "new");
  const kept = files.filter((file) => statusOf(file).state === "saved").length;
  const progress = addAll.active ? addAll.job?.progress : undefined;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-border bg-surface px-3 py-2 text-small text-ink-muted md:px-4">
      <FileDown aria-hidden className="size-4 shrink-0" />
      <p className="min-w-0 flex-1">
        This page links to {plural(files.length, "file")}
        {!loading && kept > 0 ? `; ${kept === files.length ? "all" : kept} already in your library` : ""}.
        {progress?.total ? (
          <span className="tabular">
            {" "}
            Adding {Math.min(progress.current, progress.total)} of {progress.total} now.
          </span>
        ) : null}
      </p>
      <Button size="sm" variant="secondary" className="max-md:h-11" onClick={() => setOpen(true)}>
        {addAll.active ? "See how it is going" : loading || fresh.length > 0 ? "Add them to your library" : "See them"}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        {open ? (
          <SaveFilesDialog
            collectionId={collectionId}
            files={files}
            statusOf={statusOf}
            loading={loading}
            foundIn={foundIn}
            addAll={addAll}
            onClose={() => setOpen(false)}
          />
        ) : null}
      </Dialog>
    </div>
  );
}

interface Outcome {
  /** Files in the collection handed to the job that copies them. */
  started: number;
  /** Files on the internet handed to the download manager. */
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
  addAll,
  onClose,
}: {
  collectionId: string;
  files: PageFile[];
  statusOf(file: PageFile): FileStatus;
  loading: boolean;
  foundIn: string;
  addAll: AddAll;
  onClose(): void;
}) {
  const client = useQueryClient();
  const fresh = files.filter((file) => statusOf(file).state === "new");
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const chosen = fresh.filter((file) => !skipped.has(fileKey(file)));
  const inside = chosen.filter((file) => file.kind === "archive");
  const outside = chosen.filter((file) => file.kind === "internet");
  const anyOutside = files.some((file) => file.kind === "internet");
  const anyInside = files.some((file) => file.kind === "archive");

  // Files inside the collection are copied by a job on the server, so closing this page does not stop them.
  // The paths say which files are meant; the array holding them is new on every render.
  const insideKey = inside.map(fileKey).join("\n");
  // biome-ignore lint/correctness/useExhaustiveDependencies: see above
  const scope = useMemo<ArchiveAddScope | null>(() => {
    const named = inside.flatMap((file) => (file.kind === "archive" ? [{ path: file.path, title: fileTitle(file) }] : []));
    return named.length > 0 ? { kind: "files", files: named } : null;
  }, [insideKey]);
  const plan = useAddPlan(collectionId, scope, ["chosen", scope?.kind === "files" ? scope.files.map((file) => file.path) : null], {
    enabled: !addAll.active,
  });
  const insidePaths = useMemo(() => [files.flatMap((file) => (file.kind === "archive" ? [file.path] : [])).slice(0, 500)], [files]);
  const sizes = useFileSizes(collectionId, insidePaths);

  const save = useMutation({
    mutationFn: async (): Promise<Outcome> => {
      const outcome: Outcome = { started: 0, queued: 0, already: 0, problems: [] };
      if (scope) {
        try {
          const result = await addAll.start.mutateAsync(scope);
          // One was under way already: these wait for another press when it has finished.
          if (!result.already) outcome.started = inside.length;
        } catch (error) {
          outcome.problems.push({ name: `${plural(inside.length, "file")} in this collection`, reason: errorMessage(error) });
        }
      }
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

  const where =
    anyInside && anyOutside
      ? `Some are inside this collection: adding one copies it out, with nothing downloaded. Others are on the internet, at ${hostsOf(files)}, and are fetched from there.`
      : anyOutside
        ? `They are on the internet, at ${hostsOf(files)}, not in this collection. Adding one fetches it from there.`
        : "They are inside this collection: adding one copies it out into your library, and nothing is downloaded from the internet.";
  const size = plan.data ? planSize(plan.data) : null;
  const place = plan.data?.location;
  const refusal = plan.data?.refusal ?? null;
  const busy = save.isPending || (addAll.active && inside.length > 0);
  return (
    <DialogContent
      size="lg"
      title="Files this page links to"
      description={`${where} In your library each one opens in the document viewer and can be searched page by page.`}
    >
      <DialogBody className="px-0 py-0">
        {addAll.job || save.data ? (
          <div className="space-y-3 border-b border-border px-5 py-4 text-small">
            <AddAllStatus addAll={addAll} noun="file" />
            {save.data && save.data.queued > 0 ? (
              <p>
                {plural(save.data.queued, "file")} {save.data.queued === 1 ? "is" : "are"} being fetched from the internet and will appear
                in your library as each one finishes.{" "}
                <Link
                  to="/downloads"
                  className="font-medium text-primary underline decoration-1 underline-offset-[0.2em] hover:decoration-2"
                >
                  See the downloads
                </Link>
              </p>
            ) : null}
            {save.data && save.data.already > 0 ? (
              <p className="text-ink-muted">{plural(save.data.already, "file")} had been added before.</p>
            ) : null}
            {save.data && save.data.problems.length > 0 ? (
              <div role="alert">
                <p className="font-medium text-ink">Not everything could be added</p>
                <ul className="mt-1 space-y-1 text-ink-muted">
                  {save.data.problems.map((item) => (
                    <li key={item.name}>
                      <span className="break-all text-ink">{item.name}</span>: {item.reason}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
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
              const bytes = file.kind === "archive" ? sizes.get(file.path) : undefined;
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
                  ) : status.state === "saved" ? (
                    <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-success" />
                  ) : (
                    <Hourglass aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-muted" />
                  )}
                  <div className="min-w-0 flex-1">
                    <label htmlFor={status.state === "new" ? id : undefined} className="block text-small font-medium text-ink">
                      {fileLabel(file)}
                    </label>
                    <p className="mt-0.5 text-micro break-all text-ink-muted">
                      {file.kind === "archive" ? (
                        <>In this collection{bytes !== undefined ? <span className="tabular">, {formatBytes(bytes)}</span> : null}</>
                      ) : (
                        <span className="font-mono">{file.href}</span>
                      )}
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
                  ) : status.state === "adding" ? (
                    <span className="shrink-0 text-small text-ink-muted">{status.turn === "now" ? "Being added" : "Waiting its turn"}</span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </DialogBody>
      <DialogFooter className="justify-between">
        <div className="min-w-0 flex-1 text-small text-ink-muted max-md:basis-full">
          {refusal ? (
            <p role="alert" className="text-danger">
              {refusal}
            </p>
          ) : addAll.active && inside.length > 0 ? (
            "The rest can be added when the adding that is under way has finished."
          ) : fresh.length === 0 && !loading ? (
            files.some((file) => statusOf(file).state !== "saved") ? (
              "The others are on their way into your library."
            ) : (
              "All of these are already in your library."
            )
          ) : chosen.length > 0 ? (
            <p className="tabular">
              {inside.length > 0 && place
                ? `${plural(inside.length, "file")} ${inside.length === 1 ? "is" : "are"} copied onto “${place.name}”${size ? `: ${size}` : ""}${place.freeBytes !== null ? `, of ${formatBytes(place.freeBytes)} free` : ""}. `
                : ""}
              {outside.length > 0 ? `${plural(outside.length, "file")} will be fetched from the internet.` : ""}
            </p>
          ) : null}
        </div>
        <Button variant="secondary" onClick={onClose}>
          {save.data || addAll.job ? "Keep reading" : "Cancel"}
        </Button>
        <Button
          variant="primary"
          disabled={chosen.length === 0 || loading || Boolean(refusal) || (busy && !save.isPending)}
          loading={save.isPending}
          onClick={() => save.mutate()}
        >
          <LibraryBig /> {chosen.length > 0 ? `Add ${plural(chosen.length, "file")}` : "Add files"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
