import { formatBytes, type StorageBrowseResponse, type StorageKind } from "@outpost/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, CornerLeftUp, Folder, FolderPlus } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Notice } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Select, Skeleton, Switch } from "@/components/ui/misc";
import { api, errorMessage } from "@/lib/api";

const kinds: Array<{ value: StorageKind; label: string; description: string }> = [
  { value: "external", label: "External drive", description: "USB disk or SSD that may be unplugged" },
  { value: "network", label: "Network share", description: "NAS mounted over SMB or NFS" },
  { value: "internal", label: "Internal", description: "A folder on this device's own disk" },
  { value: "volume", label: "Docker volume", description: "A named volume managed by Docker" },
];

export function AddLocationDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const client = useQueryClient();
  const [path, setPath] = useState<string | undefined>();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<StorageKind>("external");
  const [makeDefault, setMakeDefault] = useState(false);
  const [newFolder, setNewFolder] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setPath(undefined);
      setName("");
      setKind("external");
      setMakeDefault(false);
      setNewFolder(null);
    }
  }, [open]);

  const browse = useQuery({
    queryKey: ["storage", "browse", path ?? null],
    queryFn: () => api.get<StorageBrowseResponse>("/api/storage/browse", { path }),
    enabled: open,
  });

  const add = useMutation({
    mutationFn: (target: string) => api.post("/api/storage/locations", { name: name.trim(), path: target, kind, makeDefault }),
    onSuccess: () => {
      toast.success(`Added “${name.trim()}”.`);
      onOpenChange(false);
      return client.invalidateQueries({ queryKey: ["storage"] });
    },
  });

  const listing = browse.data;
  const atRoots = listing?.path === null;
  const folderName = newFolder?.trim();
  const target = listing?.path ? (folderName ? `${listing.path}/${folderName}` : listing.path) : undefined;
  const canSubmit = Boolean(target && name.trim() && (listing?.writable || folderName));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Add a storage location" description="Pick the folder Outpost should use. A small marker file is written there so the drive is recognised when it is reconnected." size="lg">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (target) add.mutate(target);
          }}
          className="flex min-h-0 flex-1 flex-col"
        >
          <DialogBody className="grid gap-5">
            <div>
              <div className="mb-1.5 flex items-center justify-between gap-3">
                <span className="text-small font-medium text-ink">Folder</span>
                {listing?.path ? (
                  <span className="tabular text-small text-ink-muted">
                    {listing.freeBytes !== null ? `${formatBytes(listing.freeBytes)} free of ${formatBytes(listing.totalBytes)}` : ""}
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
                    <Button variant="ghost" size="sm" onClick={() => setNewFolder(newFolder === null ? "" : null)}>
                      <FolderPlus /> New folder
                    </Button>
                  ) : null}
                </div>
                <ul className="scroll-quiet max-h-56 overflow-y-auto p-1" aria-label="Folders">
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
                            onChange={(event) => setNewFolder(event.target.value)}
                            placeholder="Name of the new folder"
                            aria-label="Name of the new folder"
                            autoFocus
                            maxLength={100}
                            className="h-8"
                          />
                        </li>
                      ) : null}
                      {listing!.entries.length === 0 && newFolder === null ? (
                        <li className="px-3 py-4 text-small text-ink-muted">{atRoots ? "No storage roots are reachable on this server." : "No folders inside this one. You can use it as it is, or make a new folder."}</li>
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
              {listing?.path && !listing.writable && !folderName ? <p className="mt-1 text-small text-warning">Outpost cannot write to this folder. Check its permissions, or pick another.</p> : null}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Name" hint="How this location is shown in Outpost.">
                {(ids) => <Input {...ids} value={name} onChange={(event) => setName(event.target.value)} placeholder="Field SSD" maxLength={80} required />}
              </Field>
              <Field label="Kind" hint="Used for labels and warnings only.">
                {(ids) => <Select {...ids} value={kind} onChange={setKind} options={kinds} />}
              </Field>
            </div>

            <label className="flex items-center justify-between gap-4">
              <span>
                <span className="block text-small font-medium text-ink">Use for new downloads</span>
                <span className="block text-small text-ink-muted">You can still choose a different location for any single download.</span>
              </span>
              <Switch checked={makeDefault} onCheckedChange={setMakeDefault} aria-label="Use for new downloads" />
            </label>

            {add.isError ? <Notice tone="danger">{errorMessage(add.error)}</Notice> : null}
          </DialogBody>
          <DialogFooter>
            <Button onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={!canSubmit} loading={add.isPending}>
              Add location
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
