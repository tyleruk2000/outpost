import {
  type BackupSchedule,
  formatBytes,
  type NetworkShare,
  type StorageKind,
  type StorageLocation,
  type StorageUsage,
  shareAddress,
} from "@outpost/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, CircleAlert, Ellipsis, FolderInput, HardDrive, Network, Pencil, Plus, RefreshCw, Star, Trash2, Usb } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { EmptyState, ErrorState, Notice, Page, PageHeader, Section } from "@/components/page";
import { StorageBar, usageKinds } from "@/components/storage-bar";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { Badge, Skeleton } from "@/components/ui/misc";
import { api, errorMessage } from "@/lib/api";
import { notify } from "@/lib/notify";
import { useStorage } from "@/lib/queries";
import { plural, timeAgo } from "@/lib/utils";
import { manageLink } from "../manage/manage-data";
import { AddLocationDialog } from "./add-location-dialog";
import { DatabaseSection } from "./database-section";
import { KindDefaultsSection } from "./kind-defaults";
import { NetworkSharesSection, useShares } from "./network-shares";
import { PageVersionsSection } from "./page-versions-section";
import { PortableDriveSection } from "./portable-drive";

export const kindLabels: Record<StorageKind, { label: string; icon: typeof HardDrive }> = {
  internal: { label: "Internal", icon: HardDrive },
  external: { label: "External drive", icon: Usb },
  network: { label: "Network share", icon: Network },
  volume: { label: "Docker volume", icon: HardDrive },
};

type Location = StorageLocation & { usage: StorageUsage };

const GB = 1_000_000_000;

/** Under 2 GB, or under 2% of the drive, is left: said in words, not only by a bar that is nearly full. */
export function nearlyFull(location: Pick<StorageLocation, "freeBytes" | "totalBytes">): boolean {
  const free = location.freeBytes;
  const total = location.totalBytes;
  if (free === null || free === undefined || !total) return false;
  return free < 2 * GB || free / total < 0.02;
}

function UsageLegend({ usage, holdsBackups }: { usage: StorageUsage; holdsBackups: boolean }) {
  const present = usageKinds.filter((entry) => (usage.byKind[entry.kind]?.bytes ?? 0) > 0);
  if (present.length === 0)
    return (
      <p className="text-small text-ink-muted">
        {holdsBackups ? "None of the library is stored here yet." : "Nothing from Outpost is stored here yet."}
      </p>
    );
  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-1 text-small text-ink-muted">
      {present.map((entry) => {
        const bucket = usage.byKind[entry.kind]!;
        return (
          <li key={entry.kind} className="flex items-center gap-2">
            <span aria-hidden className="size-2.5 rounded-[2px]" style={{ background: entry.color }} />
            <span>{entry.label}</span>
            <span className="tabular text-ink">{formatBytes(bucket.bytes)}</span>
          </li>
        );
      })}
    </ul>
  );
}

function LocationRow({
  location,
  onlyOne,
  documentsElsewhere,
  share,
  backupsFolder,
}: {
  location: Location;
  onlyOne: boolean;
  documentsElsewhere: number;
  /** The network share this location lives on, when Outpost connected it. */
  share?: NetworkShare;
  /** The folder automatic backups are written to, when this is the location chosen for them. */
  backupsFolder: string | null;
}) {
  const client = useQueryClient();
  const [renaming, setRenaming] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [movingDocuments, setMovingDocuments] = useState(false);
  const [name, setName] = useState(location.name);
  const kind = kindLabels[location.kind];
  const available = location.status === "available";
  const items = Object.values(location.usage.byKind).reduce((sum, bucket) => sum + bucket.count, 0);

  const invalidate = () => client.invalidateQueries({ queryKey: ["storage"] });
  const update = useMutation({
    mutationFn: (patch: { name?: string; isDefault?: true }) => api.patch(`/api/storage/locations/${location.id}`, patch),
    onSuccess: () => {
      setRenaming(false);
      return invalidate();
    },
    onError: (error) => notify.error(errorMessage(error)),
  });
  const moveDocuments = useMutation({
    mutationFn: () => api.post<{ documents: number }>("/api/documents/move", { locationId: location.id }),
    onSuccess: (result) => {
      setMovingDocuments(false);
      toast.success(`Moving ${plural(result.documents, "document")} to “${location.name}”. Progress is under Downloads and tasks.`);
    },
    onError: (error) => notify.error(errorMessage(error)),
  });
  const remove = useMutation({
    mutationFn: () => api.delete(`/api/storage/locations/${location.id}`),
    onSuccess: () => {
      setRemoving(false);
      toast.success(`Removed “${location.name}” from Outpost. Its files were left in place.`);
      return invalidate();
    },
    onError: (error) => notify.error(errorMessage(error)),
  });

  return (
    <li className="py-5">
      <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
        <kind.icon aria-hidden className="mt-1 size-5 shrink-0 text-ink-muted" strokeWidth={1.6} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h3 className="text-lead font-semibold text-ink">{location.name}</h3>
            {location.isDefault ? (
              <Badge tone="primary">
                <Star aria-hidden /> Default for new downloads
              </Badge>
            ) : null}
            {available ? (
              <Badge tone="success">
                <Check aria-hidden /> Connected
              </Badge>
            ) : (
              <Badge tone="warning">
                <CircleAlert aria-hidden /> Disconnected
              </Badge>
            )}
          </div>
        </div>
        <Menu>
          <MenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" className="max-md:size-11" aria-label={`Actions for ${location.name}`}>
              <Ellipsis />
            </Button>
          </MenuTrigger>
          <MenuContent>
            <MenuItem onSelect={() => setRenaming(true)}>
              <Pencil /> Rename
            </MenuItem>
            {!location.isDefault && available ? (
              <MenuItem onSelect={() => update.mutate({ isDefault: true })}>
                <Star /> Make default
              </MenuItem>
            ) : null}
            {available && documentsElsewhere > 0 ? (
              <MenuItem onSelect={() => setMovingDocuments(true)}>
                <FolderInput /> Move documents here
              </MenuItem>
            ) : null}
            <MenuSeparator />
            <MenuItem danger disabled={onlyOne} onSelect={() => setRemoving(true)}>
              <Trash2 /> Remove from Outpost
            </MenuItem>
          </MenuContent>
        </Menu>
      </div>

      {/* Under the title, not beside it: on a phone the path gets the full width and a line of its own. */}
      <p className="mt-1 text-small text-ink-muted md:pl-9">
        {kind.label}
        <span className="mx-2 text-border-strong max-md:hidden" aria-hidden>
          /
        </span>
        <span className="font-mono text-[0.8125rem] break-all max-md:block">{location.path}</span>
      </p>

      <div className="mt-4 md:pl-9">
        {available ? (
          <>
            <StorageBar location={location} usage={location.usage} />
            <div className="mt-2.5 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1.5">
              <UsageLegend usage={location.usage} holdsBackups={backupsFolder !== null} />
              <p className="tabular text-small text-ink-muted">
                <span className="font-semibold text-ink">{formatBytes(location.freeBytes)}</span> free of {formatBytes(location.totalBytes)}
              </p>
            </div>
            {nearlyFull(location) ? (
              <Notice tone="warning" icon={<CircleAlert />} title="Almost full" className="mt-3">
                Only {formatBytes(location.freeBytes)} is left here. A download that does not fit is refused, so free up space or choose
                another location for it.{" "}
                <Link to={manageLink()} className="text-primary underline underline-offset-2">
                  Free up space
                </Link>
              </Notice>
            ) : null}
          </>
        ) : (
          <Notice tone="warning" icon={<CircleAlert />} title="This location cannot be reached">
            <p>
              {share
                ? `It is on the network share ${shareAddress(share)}, which is not connected. Reconnect it under Network shares below.`
                : location.statusDetail}
            </p>
            <p className="mt-1 text-ink-muted">
              {items > 0 ? `${plural(items, "item")} stored here ${items === 1 ? "is" : "are"} unavailable until it is back. ` : ""}
              Last seen {timeAgo(location.lastSeenAt)}. Your library records are kept
              {share ? "." : "; reconnect the drive and Outpost will pick it up, even at a different path."}
            </p>
          </Notice>
        )}
        {backupsFolder !== null ? (
          <p className="mt-2 text-small text-ink-muted">
            Automatic backups are kept here, in the folder <span className="font-mono text-[0.8125rem] text-ink">{backupsFolder}</span>.{" "}
            <Link to="/settings#automatic-backups" className="text-primary underline underline-offset-2">
              Backup settings
            </Link>
          </p>
        ) : null}
      </div>

      <Dialog open={renaming} onOpenChange={setRenaming}>
        <DialogContent title="Rename location" size="sm">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              update.mutate({ name: name.trim() });
            }}
          >
            <DialogBody>
              <Field label="Name">
                {(ids) => (
                  <Input {...ids} value={name} onChange={(event) => setName(event.target.value)} autoFocus maxLength={80} required />
                )}
              </Field>
            </DialogBody>
            <DialogFooter>
              <Button onClick={() => setRenaming(false)}>Cancel</Button>
              <Button type="submit" variant="primary" loading={update.isPending} disabled={!name.trim()}>
                Save name
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={movingDocuments}
        onOpenChange={setMovingDocuments}
        title={`Move documents to “${location.name}”?`}
        description={`${plural(documentsElsewhere, "document")} on other locations will be copied here. Each copy is checked against its checksum before the original is removed, and anything that cannot be moved stays where it is.`}
        confirmLabel="Move documents"
        confirmVariant="primary"
        onConfirm={() => moveDocuments.mutate()}
        loading={moveDocuments.isPending}
      />

      {items > 0 ? (
        // Said before the press: the server refuses to forget a location that still holds part of the library.
        <Dialog open={removing} onOpenChange={setRemoving}>
          <DialogContent title={`“${location.name}” still holds part of the library`} size="sm">
            <DialogBody>
              <p className="text-small text-ink-muted">
                Outpost stops using a location only when none of the library is on it, and it will not delete anything for you. Move what is
                here to another location, or remove it, under Manage and clean up. Then remove the location.
              </p>
            </DialogBody>
            <DialogFooter>
              <Button onClick={() => setRemoving(false)}>Close</Button>
              <Button variant="primary" asChild>
                <Link to={manageLink("installed")}>Manage and clean up</Link>
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : (
        <ConfirmDialog
          open={removing}
          onOpenChange={setRemoving}
          title={`Remove “${location.name}”?`}
          description={
            <>
              <p>
                Outpost will stop using this folder. Nothing in it is deleted, and you can add it again later to bring its contents back.
              </p>
              {backupsFolder !== null ? (
                <p className="mt-2">
                  Automatic backups are made here. They will stop until you choose another location for them in Settings; the backups
                  already in {backupsFolder} stay where they are.
                </p>
              ) : null}
            </>
          }
          confirmLabel="Remove location"
          onConfirm={() => remove.mutate()}
          loading={remove.isPending}
        />
      )}
    </li>
  );
}

export default function StoragePage() {
  const storage = useStorage();
  const shares = useShares();
  // Only to say which location holds the automatic backups.
  const schedule = useQuery({ queryKey: ["backup", "schedule"], queryFn: () => api.get<BackupSchedule>("/api/backup/schedule") });
  const backupsAt = schedule.data?.settings.locationId ?? null;
  const client = useQueryClient();
  const [adding, setAdding] = useState(false);
  const refresh = useMutation({
    mutationFn: () => api.post<{ locations: StorageLocation[] }>("/api/storage/refresh"),
    onSuccess: (result) => {
      // Said either way: a press that changes nothing on screen still needs an answer.
      const away = result.locations.filter((location) => location.status !== "available").length;
      if (away === 0)
        toast.success(result.locations.length === 1 ? "Checked: the location is connected." : "Checked: every location is connected.");
      else toast.warning(`Checked: ${plural(away, "location")} cannot be reached.`);
      return client.invalidateQueries({ queryKey: ["storage"] });
    },
    onError: (error) => notify.error(errorMessage(error)),
  });

  const locations = storage.data?.locations ?? [];
  const totals = usageKinds
    .map((entry) => ({
      ...entry,
      bytes: locations.reduce((sum, location) => sum + (location.usage.byKind[entry.kind]?.bytes ?? 0), 0),
      count: locations.reduce((sum, location) => sum + (location.usage.byKind[entry.kind]?.count ?? 0), 0),
    }))
    .filter((entry) => entry.count > 0);

  return (
    <Page>
      <PageHeader
        title="Storage"
        under="/storage"
        description="Choose where your library lives. Large collections and maps can sit on an external drive or a network share; Outpost keeps its own database on this device."
        actions={
          <>
            <Button onClick={() => refresh.mutate()} loading={refresh.isPending}>
              {refresh.isPending ? null : <RefreshCw />} Check drives
            </Button>
            <Button variant="primary" onClick={() => setAdding(true)}>
              <Plus /> Add location
            </Button>
          </>
        }
      />

      {storage.isPending ? (
        <div className="grid gap-6" aria-busy>
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      ) : storage.isError ? (
        <ErrorState error={storage.error} onRetry={() => storage.refetch()} />
      ) : locations.length === 0 ? (
        <EmptyState
          title="No storage location yet"
          action={
            <Button variant="primary" onClick={() => setAdding(true)}>
              Add location
            </Button>
          }
        >
          Add a folder for Outpost to keep documents, collections and maps in.
        </EmptyState>
      ) : (
        <>
          <ul className="divide-y divide-border border-y border-border">
            {locations.map((location) => (
              <LocationRow
                key={location.id}
                location={location}
                onlyOne={locations.length === 1}
                share={shares.data?.shares.find(
                  (share) => share.status !== "connected" && share.locations.some((entry) => entry.id === location.id),
                )}
                backupsFolder={backupsAt === location.id ? (schedule.data?.folder ?? null) : null}
                documentsElsewhere={locations
                  .filter((other) => other.id !== location.id)
                  .reduce((sum, other) => sum + (other.usage.byKind.document?.count ?? 0), 0)}
              />
            ))}
          </ul>

          {locations.length > 1 ? <KindDefaultsSection locations={locations} /> : null}

          <NetworkSharesSection />

          <Section
            title="What is taking the space"
            description="Across every location, by kind of content."
            actions={
              <Link
                to={manageLink()}
                className="inline-flex min-h-6 items-center text-small text-primary underline underline-offset-2 max-md:min-h-11"
              >
                Free up space
              </Link>
            }
          >
            {totals.length === 0 ? (
              <p className="text-small text-ink-muted">
                Your library is empty. Space used will be listed here as you add documents, collections and maps.
              </p>
            ) : (
              <div className="@container">
                <table className="w-full max-w-xl text-small">
                  <thead className="sr-only">
                    <tr>
                      <th>Kind</th>
                      <th>Items</th>
                      <th>Size</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border border-y border-border">
                    {totals.map((entry) => (
                      <tr key={entry.kind}>
                        <td className="py-2.5 pr-4">
                          <span className="flex items-center gap-2.5 text-ink">
                            <span aria-hidden className="size-2.5 shrink-0 rounded-[2px]" style={{ background: entry.color }} />
                            {entry.label}
                          </span>
                          {/* Where three columns do not fit (a phone with large text: rem here follows the text), the count goes under the kind. */}
                          <span className="tabular block pl-5 text-ink-muted @min-[20rem]:hidden">{plural(entry.count, "item")}</span>
                        </td>
                        <td className="tabular py-2.5 pr-4 text-right text-ink-muted @max-[20rem]:hidden">{plural(entry.count, "item")}</td>
                        <td className="tabular py-2.5 text-right font-medium whitespace-nowrap text-ink">{formatBytes(entry.bytes)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          <DatabaseSection />

          <PageVersionsSection />

          <PortableDriveSection />

          <Section title="Where Outpost can look">
            <div className="max-w-[70ch] space-y-2 text-small text-ink-muted">
              <p>
                A storage location has to be inside one of the storage roots set when the server was started. On this installation those
                are:
              </p>
              <ul className="space-y-1">
                {storage.data.roots.map((root) => (
                  <li key={root} className="font-mono text-[0.8125rem] break-all text-ink">
                    {root}
                  </li>
                ))}
              </ul>
              {shares.data?.mode === "macos" ? (
                <p>
                  A drive plugged into this Mac appears under <span className="font-mono text-[0.8125rem] text-ink">/Volumes</span>, and so
                  does a share connected under Network shares above. Outpost never stores a share’s password; if you ask for it to be
                  remembered, it goes in this Mac’s Keychain.
                </p>
              ) : (
                <p>
                  Mount the share or drive under one of them (with Docker, add it as a volume in{" "}
                  <span className="font-mono text-[0.8125rem]">compose.yaml</span>), then add it here. Outpost never stores share passwords;
                  the operating system or Docker handles the mount.
                </p>
              )}
            </div>
          </Section>
        </>
      )}

      <AddLocationDialog open={adding} onOpenChange={setAdding} />
    </Page>
  );
}
