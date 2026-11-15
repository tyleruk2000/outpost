import { formatBytes, type StorageBrowseResponse } from "@outpost/shared";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, CornerLeftUp, Folder, FolderPlus } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/misc";
import { api, errorMessage } from "@/lib/api";

export interface PickedFolder {
  /** Absolute path of the chosen folder, including a new folder name if one was typed. */
  path: string | undefined;
  /** The chosen folder can be written to, or will be created inside one that can. */
  writable: boolean;
  /** The chosen folder already is an Outpost storage location. */
  locationId?: string;
}

/**
 * Browses the folders the server allows (its storage roots, and nothing outside them)
 * and lets the person choose one or name a new one inside it.
 */
export function FolderPicker({
  label,
  onChange,
  newFolderSuggestion,
}: {
  label: string;
  onChange: (picked: PickedFolder) => void;
  newFolderSuggestion?: string;
}) {
  const [path, setPath] = useState<string | undefined>();
  const [newFolder, setNewFolder] = useState<string | null>(null);

  const browse = useQuery({
    queryKey: ["storage", "browse", path ?? null],
    queryFn: () => api.get<StorageBrowseResponse>("/api/storage/browse", { path }),
  });

  const listing = browse.data;
  const atRoots = listing?.path === null;
  const folderName = newFolder?.trim();
  const target = listing?.path ? (folderName ? `${listing.path}/${folderName}` : listing.path) : undefined;
  const writable = Boolean(listing?.writable);

  // biome-ignore lint/correctness/useExhaustiveDependencies: onChange identity is the caller's business
  useEffect(() => {
    onChange({ path: target, writable });
  }, [target, writable]);

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <span className="text-small font-medium text-ink">{label}</span>
        {listing?.path && listing.freeBytes !== null ? (
          <span className="tabular text-small text-ink-muted">
            {formatBytes(listing.freeBytes)} free of {formatBytes(listing.totalBytes)}
          </span>
        ) : null}
      </div>
      <div className="rounded-control border border-border-strong">
        <div className="flex items-center gap-2 border-b border-border bg-surface px-3 py-2">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Up one folder"
            disabled={atRoots || browse.isPending}
            onClick={() => {
              setNewFolder(null);
              setPath(listing?.parent ?? undefined);
            }}
          >
            <CornerLeftUp />
          </Button>
          <span className="min-w-0 flex-1 truncate font-mono text-[0.8125rem] text-ink">{listing?.path ?? "Storage roots"}</span>
          {!atRoots && listing?.writable ? (
            <Button variant="ghost" size="sm" onClick={() => setNewFolder(newFolder === null ? (newFolderSuggestion ?? "") : null)}>
              <FolderPlus /> New folder
            </Button>
          ) : null}
        </div>
        <ul className="scroll-quiet max-h-52 overflow-y-auto p-1" aria-label="Folders">
          {browse.isPending ? (
            <li className="grid gap-1.5 p-2">
              <Skeleton />
              <Skeleton className="w-2/3" />
            </li>
          ) : browse.isError ? (
            <li className="p-3 text-small text-danger">{errorMessage(browse.error)}</li>
          ) : (
            <>
              {newFolder !== null ? (
                <li className="flex items-center gap-2.5 px-2.5 py-1.5">
                  <FolderPlus aria-hidden className="size-4 text-primary" />
                  <Input
                    value={newFolder}
                    onChange={(event) => setNewFolder(event.target.value.replace(/[/\\:*?"<>|]/g, ""))}
                    placeholder="Name of the new folder"
                    aria-label="Name of the new folder"
                    autoFocus
                    maxLength={100}
                    className="h-8"
                  />
                </li>
              ) : null}
              {listing!.entries.length === 0 && newFolder === null ? (
                <li className="px-3 py-4 text-small text-ink-muted">
                  {atRoots
                    ? "No storage roots are reachable on this server."
                    : "No folders inside this one. You can use it as it is, or make a new folder."}
                </li>
              ) : null}
              {listing!.entries.map((entry) => (
                <li key={entry.path}>
                  <button
                    type="button"
                    onClick={() => {
                      setNewFolder(null);
                      setPath(entry.path);
                    }}
                    className="flex w-full items-center gap-2.5 rounded-[4px] px-2.5 py-1.5 text-left text-small text-ink hover:bg-surface-strong max-md:py-2.5"
                  >
                    <Folder aria-hidden className="size-4 shrink-0 text-ink-muted" />
                    <span className="min-w-0 flex-1 truncate">{atRoots ? entry.path : entry.name}</span>
                    {entry.locationId ? <span className="text-micro text-ink-faint">Outpost location</span> : null}
                    <ChevronRight aria-hidden className="size-4 text-ink-faint" />
                  </button>
                </li>
              ))}
            </>
          )}
        </ul>
      </div>
      {target ? (
        <p className="mt-1.5 text-small text-ink-muted">
          Outpost will use <span className="font-mono text-[0.8125rem] break-all text-ink">{target}</span>
        </p>
      ) : (
        <p className="mt-1.5 text-small text-ink-muted">Open a folder to choose it.</p>
      )}
      {listing?.path && !listing.writable ? (
        <p className="mt-1 text-small text-warning">Outpost cannot write to this folder. Check its permissions, or pick another.</p>
      ) : null}
    </div>
  );
}
