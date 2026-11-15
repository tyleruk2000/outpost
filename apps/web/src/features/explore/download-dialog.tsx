import {
  type CatalogAddResponse,
  type CatalogDownloadResponse,
  type CatalogEntryDto,
  type DownloadsResponse,
  formatBytes,
} from "@outpost/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CircleAlert, WifiOff } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { Notice } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/misc";
import { ApiError, api, errorMessage } from "@/lib/api";
import { useStorage } from "@/lib/queries";
import { LocationPicker, locationProblem, preferredLocation } from "../downloads/location-picker";
import { downloadsKey } from "../downloads/use-downloads";
import { isIncluded, publishedDate, sizeText } from "./catalog";

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-6 border-b border-border py-2 last:border-b-0">
      <dt className="text-small text-ink-muted">{label}</dt>
      <dd className="tabular text-right text-small text-ink">{children}</dd>
    </div>
  );
}

/** Why the download could not start, in words that say what to do next. */
function StartError({ error, locationName }: { error: unknown; locationName: string | undefined }) {
  if (error instanceof ApiError && error.code === "insufficient_space") {
    const required = Number(error.details?.requiredBytes);
    const free = Number(error.details?.freeBytes);
    return (
      <Notice tone="warning" icon={<CircleAlert />} title={`Not enough room on ${locationName ? `“${locationName}”` : "that location"}`}>
        {Number.isFinite(required) && Number.isFinite(free)
          ? `This needs ${formatBytes(required)} and ${formatBytes(free)} is free. Choose another location, or free some space and try again.`
          : "Choose another location, or free some space and try again."}
      </Notice>
    );
  }
  if (error instanceof ApiError && (error.code === "offline" || error.isUnreachable)) {
    return (
      <Notice tone="info" icon={<WifiOff />}>
        {errorMessage(error)}
      </Notice>
    );
  }
  return (
    <Notice tone="danger" icon={<CircleAlert />}>
      {errorMessage(error)}
    </Notice>
  );
}

/** What the download stands in for: nothing, an older installed version, or an installed copy whose file has gone. */
type Replaces = "nothing" | "older" | "missing";

const verbs: Record<Replaces, string> = { nothing: "Download", older: "Update", missing: "Download again" };
/** The same steps for an entry that ships with Outpost, where nothing is downloaded. */
const includedVerbs: Record<Replaces, string> = { nothing: "Add to library", older: "Update", missing: "Add again" };
const verbFor = (entry: CatalogEntryDto, replaces: Replaces) => (isIncluded(entry) ? includedVerbs : verbs)[replaces];

function DownloadForm({
  entry,
  replaces,
  onClose,
  onStarted,
}: {
  entry: CatalogEntryDto;
  replaces: Replaces;
  onClose: () => void;
  onStarted?: (response: CatalogDownloadResponse) => void;
}) {
  const client = useQueryClient();
  const storage = useStorage();
  const [chosen, setChosen] = useState<string>();
  const isUpdate = replaces === "older";
  const included = isIncluded(entry);

  const start = useMutation({
    mutationFn: (locationId: string) =>
      api.post<CatalogDownloadResponse | CatalogAddResponse>(
        `/api/catalog/entries/${encodeURIComponent(entry.id)}/${included ? "add" : "download"}`,
        { locationId },
      ),
    onSuccess: (response) => {
      if (!("download" in response)) {
        // Copied from Outpost's own files: it is in the library already, with no download to follow.
        toast.success(`“${entry.name}” is in your library`);
        void client.invalidateQueries({ queryKey: ["catalog"] });
        void client.invalidateQueries({ queryKey: ["collections"] });
        void client.invalidateQueries({ queryKey: ["documents"] });
        onClose();
        return;
      }
      client.setQueryData<DownloadsResponse>(downloadsKey, (current) =>
        current ? { downloads: [response.download, ...current.downloads.filter((item) => item.id !== response.download.id)] } : current,
      );
      void client.invalidateQueries({ queryKey: ["catalog"] });
      void client.invalidateQueries({ queryKey: ["downloads"] });
      onStarted?.(response);
      onClose();
    },
  });

  // Starting resolves the exact size; if that showed the location to be too small, use the figure from then on.
  const exactBytes =
    start.error instanceof ApiError && start.error.code === "insufficient_space" ? Number(start.error.details?.requiredBytes) : Number.NaN;
  const requiredBytes = Number.isFinite(exactBytes) ? exactBytes : entry.sizeBytes;
  const approximate = !Number.isFinite(exactBytes) && entry.sizeIsEstimate;

  const locations = storage.data?.locations ?? [];
  const usable = (id: string | undefined) => {
    const location = locations.find((item) => item.id === id);
    return location && locationProblem(location, requiredBytes) === null ? location : undefined;
  };
  const selected = usable(chosen) ?? usable(preferredLocation(locations, requiredBytes));
  const date = publishedDate(entry);
  const edition = entry.version ? `Version ${entry.version}${date ? `, published ${date}` : ""}` : date ? `Published ${date}` : null;

  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(event) => {
        event.preventDefault();
        if (selected) start.mutate(selected.id);
      }}
    >
      <DialogBody className="grid gap-5">
        <dl>
          <Fact label="Size">{sizeText(entry)}</Fact>
          {isUpdate && entry.installedVersion ? <Fact label="Installed now">Version {entry.installedVersion}</Fact> : null}
          {edition ? <Fact label={isUpdate ? "New edition" : "Edition"}>{edition}</Fact> : null}
        </dl>
        {entry.sizeIsEstimate ? (
          <p className="-mt-3 text-small text-ink-muted">
            The size is the catalogue’s estimate. The exact figure is checked against the free space when the download starts.
          </p>
        ) : null}

        <div>
          <p className="mb-1.5 text-small font-semibold text-ink" id="download-location-label">
            Save to
          </p>
          {storage.isPending ? (
            <div className="grid gap-2" aria-busy>
              <Skeleton className="h-9" />
              <Skeleton className="h-9" />
            </div>
          ) : storage.isError ? (
            <Notice tone="danger">{errorMessage(storage.error)}</Notice>
          ) : locations.length === 0 ? (
            <p className="text-small text-ink-muted">
              There is no storage location yet.{" "}
              <Link to="/storage" className="text-primary underline underline-offset-2">
                Add one in Storage
              </Link>
              .
            </p>
          ) : (
            <>
              <LocationPicker
                label="Save to"
                locations={locations}
                value={selected?.id}
                onChange={setChosen}
                requiredBytes={requiredBytes}
                approximate={approximate}
              />
              {selected ? null : (
                <p className="mt-2 text-small text-warning">
                  <span className="text-ink">No connected location has room for this. Free some space, or </span>
                  <Link to="/storage" className="text-primary underline underline-offset-2">
                    add a location in Storage
                  </Link>
                  <span className="text-ink">.</span>
                </p>
              )}
            </>
          )}
        </div>

        {included ? (
          <p className="text-small text-ink">
            This is included with Outpost, so nothing is downloaded.
            {isUpdate ? " The edition in your library is replaced by the newer one, and its file is removed." : ""}
          </p>
        ) : isUpdate ? (
          <p className="text-small text-ink">
            The version installed now stays in place and readable while the new one downloads. It is removed, with its file, only after the
            new version has been checked and installed.
          </p>
        ) : replaces === "missing" ? (
          <p className="text-small text-ink">
            This takes the place of the copy whose file is missing, once it has been downloaded, checked and installed.
          </p>
        ) : null}

        <div className="grid gap-1 text-small text-ink-muted">
          <p>
            <span className="font-medium text-ink">Licence:</span> {entry.license}
          </p>
          {entry.licenseNote ? <p>{entry.licenseNote}</p> : null}
          <p>
            <span className="font-medium text-ink">Attribution:</span> {entry.attribution}
          </p>
          {entry.homepage ? (
            <p>
              <span className="font-medium text-ink">Source:</span>{" "}
              <a
                href={entry.homepage}
                target="_blank"
                rel="noreferrer noopener"
                className="break-all text-primary underline underline-offset-2"
              >
                {entry.homepage.replace(/^https?:\/\//, "").replace(/\/$/, "")}
              </a>
            </p>
          ) : null}
        </div>

        {start.isError ? (
          <StartError error={start.error} locationName={locations.find((item) => item.id === start.variables)?.name} />
        ) : null}
      </DialogBody>
      <DialogFooter>
        <Button onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="primary" loading={start.isPending} disabled={!selected}>
          {verbFor(entry, replaces)}
        </Button>
      </DialogFooter>
    </form>
  );
}

/**
 * The step between choosing a collection and fetching it: how big it is, where it will
 * go, and under which terms it is published. Also used to update an installed one.
 */
export function DownloadDialog({
  entry,
  open,
  onOpenChange,
  onStarted,
  replaces,
}: {
  /** The entry being downloaded; kept by the caller while the dialog closes so the words do not vanish mid-animation. */
  entry: CatalogEntryDto | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStarted?: (response: CatalogDownloadResponse) => void;
  /** Defaults to "older" for an installed entry and "nothing" otherwise. */
  replaces?: Replaces;
}) {
  if (!entry) return null;
  const standsFor = replaces ?? (entry.status === "installed" ? "older" : "nothing");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={
          isIncluded(entry) && standsFor === "nothing"
            ? `Add “${entry.name}” to the library`
            : `${verbFor(entry, standsFor)} “${entry.name}”`
        }
        description={`${entry.publisher}. ${entry.description}`}
      >
        {/* A fresh form each time, so an old error or choice never carries over. */}
        {open ? (
          <DownloadForm key={entry.id} entry={entry} replaces={standsFor} onClose={() => onOpenChange(false)} onStarted={onStarted} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
