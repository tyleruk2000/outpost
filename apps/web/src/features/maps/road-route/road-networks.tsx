/**
 * "Road networks for routes" in Offline maps: the countries (or parts of them) whose main
 * roads are installed for planning road routes, with the date of their data and their
 * size; adding one from Geofabrik's list (the countries the installed map regions cover
 * first), updating and removing. Adding is one download from Geofabrik, followed on the
 * Downloads screen too, and then a build on this device; after that, routing is offline.
 */
import {
  type DownloadDto,
  formatBytes,
  type InstalledRegion,
  type JobDto,
  type ReferenceRegionDto,
  type RoadNetworkDto,
  type RoadNetworksResponse,
} from "@outpost/shared";
import { CircleAlert, Ellipsis, Plus, RefreshCw, Search, Trash2, X } from "lucide-react";
import { type RefObject, useDeferredValue, useMemo, useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { ErrorState, Joined, Notice } from "@/components/page";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { Badge, Progress, Skeleton } from "@/components/ui/misc";
import { DownloadControls, DownloadProgress } from "@/features/downloads/download-progress";
import { useDownloads } from "@/features/downloads/use-downloads";
import { useReadRegions, useRegions } from "@/features/layers/data";
import { errorMessage } from "@/lib/api";
import { useActiveJobs } from "@/lib/queries";
import { formatDate, formatNumber } from "@/lib/utils";
import { countryName } from "../lib/search";
import { PanelHeading } from "../ui";
import { useInstallRoadNetwork, useRemoveRoadNetwork, useRoadCountries, useRoadNetworks, useUpdateRoadNetwork } from "./data";

const MAX_FOUND = 30;
const fold = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const link = "text-primary underline decoration-1 underline-offset-2";

/** "20 Nov 2026" from "2026-11-20". */
const dayOf = (date: string | null) => (date ? formatDate(Date.parse(`${date}T12:00:00Z`)) : null);

function NetworkRow({ network }: { network: RoadNetworkDto }) {
  const update = useUpdateRoadNetwork();
  const remove = useRemoveRoadNetwork();
  const [removing, setRemoving] = useState(false);
  const data = dayOf(network.dataDate);
  return (
    <li className="py-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h4 className="font-title text-body text-ink">{network.name}</h4>
          <p className="tabular mt-0.5 text-small text-ink-muted">
            <Joined
              parts={[
                countryName(network.country) ?? "",
                data ? `map data from ${data}` : "",
                formatBytes(network.sizeBytes),
                `${formatNumber(network.crossings)} ${network.crossings === 1 ? "crossing" : "crossings"}`,
              ].filter(Boolean)}
            />
          </p>
          <p className="text-small text-ink-muted">
            Added {formatDate(network.builtAt)} from {network.source === "Your file" ? "your own file" : "Geofabrik"}
            {network.extract.kept ? "; the extract is kept" : ""}
          </p>
          {!network.available ? (
            <Badge tone="warning" className="mt-1">
              <CircleAlert aria-hidden /> Its file is missing: update it to install it again
            </Badge>
          ) : null}
        </div>
        <Menu>
          <MenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Actions for ${network.name}`}
              className="max-md:size-11 md:pointer-coarse:size-11"
            >
              <Ellipsis />
            </Button>
          </MenuTrigger>
          <MenuContent>
            <MenuItem
              onSelect={() =>
                update.mutate(network.id, {
                  onSuccess: () =>
                    toast.success(
                      network.regionId
                        ? `Downloading ${network.name} again. The new network replaces this one when it is built.`
                        : `Reading ${network.name} again.`,
                    ),
                })
              }
            >
              <RefreshCw /> Update
            </MenuItem>
            <MenuSeparator />
            <MenuItem danger onSelect={() => setRemoving(true)}>
              <Trash2 /> Remove
            </MenuItem>
          </MenuContent>
        </Menu>
      </div>
      <ConfirmDialog
        open={removing}
        onOpenChange={setRemoving}
        title={`Remove “${network.name}”?`}
        description={`Routes can no longer be planned through it. Saved routes keep their directions. ${network.extract.kept ? "The kept extract stays where it is." : ""}`}
        confirmLabel="Remove network"
        loading={remove.isPending}
        onConfirm={() =>
          remove.mutate(network.id, {
            onSuccess: () => {
              setRemoving(false);
              toast.success(`Removed “${network.name}”.`);
            },
          })
        }
      />
    </li>
  );
}

/** A network on its way: the download (with its controls), then the build on this device. */
function Building({
  entry,
  downloads,
  jobs,
}: {
  entry: RoadNetworksResponse["building"][number];
  downloads: DownloadDto[];
  jobs: JobDto[];
}) {
  const download = downloads.find((each) => each.id === entry.jobId);
  const job = jobs.find((each) => each.id === entry.jobId);
  return (
    <li className="py-3">
      <p className="text-small font-medium text-ink">{entry.name}</p>
      {download ? (
        <>
          <DownloadProgress download={download} className="mt-2" />
          <DownloadControls download={download} className="mt-1 -ml-2" />
        </>
      ) : (
        <>
          <Progress
            className="mt-2"
            tone="lamp"
            value={job?.progress.total ? job.progress.current / job.progress.total : null}
            label={`Building the road network: ${entry.name}`}
          />
          <p className="mt-1 text-small text-ink-muted">{job?.progress.message ?? entry.message ?? "Reading the main roads"}</p>
        </>
      )}
    </li>
  );
}

function AddNetwork({
  installed,
  mapRegions,
  onClose,
}: {
  installed: RoadNetworkDto[];
  mapRegions: InstalledRegion[];
  onClose: () => void;
}) {
  const regions = useRegions(null);
  const read = useReadRegions();
  const install = useInstallRoadNetwork();
  const boxes = useMemo(() => mapRegions.filter((region) => region.tileType === "vector").map((region) => region.bounds), [mapRegions]);
  const covered = useRoadCountries(boxes);
  const [text, setText] = useState("");
  const typed = useDeferredValue(text.trim());
  const list = useMemo(() => regions.data?.regions ?? [], [regions.data]);
  const have = new Set(installed.map((network) => network.regionId).filter(Boolean));
  const suggested = useMemo(() => {
    const codes = covered.data ?? [];
    return codes.flatMap((code) => list.filter((region) => region.depth === 0 && region.country === code));
  }, [covered.data, list]);
  const found = useMemo(() => {
    if (!typed) return [];
    const needle = fold(typed);
    const hits = list.filter((region) => fold(region.name).includes(needle));
    return [
      ...hits.filter((region) => fold(region.name).startsWith(needle)),
      ...hits.filter((region) => !fold(region.name).startsWith(needle)),
    ].slice(0, MAX_FOUND);
  }, [typed, list]);
  const byId = useMemo(() => new Map(list.map((region) => [region.id, region])), [list]);

  const row = (region: ReferenceRegionDto) => {
    const parent = region.parent ? byId.get(region.parent)?.name : null;
    const already = have.has(region.id);
    return (
      <li key={region.id} className="flex items-center gap-3 py-1.5">
        <span className="min-w-0 flex-1 text-small">
          <span className="block text-ink">{region.depth === 0 ? `The whole of ${region.name}` : region.name}</span>
          {parent ? <span className="block text-micro text-ink-muted">{parent}</span> : null}
        </span>
        {already ? (
          <span className="text-small text-ink-muted">Installed</span>
        ) : (
          <Button
            size="sm"
            aria-label={`Add ${region.name}`}
            loading={install.isPending && install.variables && "regionId" in install.variables && install.variables.regionId === region.id}
            onClick={() =>
              install.mutate(
                { regionId: region.id },
                {
                  onSuccess: () => {
                    toast.success(`Downloading ${region.name} from Geofabrik. It is built into a network when it arrives.`);
                    onClose();
                  },
                },
              )
            }
            className="max-md:min-h-11 md:pointer-coarse:min-h-11"
          >
            Add
          </Button>
        )}
      </li>
    );
  };

  return (
    <div className="mt-2 grid gap-3 rounded-panel border border-border p-3">
      <div className="flex items-start justify-between gap-2">
        <h4 className="text-small font-semibold text-ink">Add a road network</h4>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Stop adding a network"
          onClick={onClose}
          className="max-md:size-11 md:pointer-coarse:size-11"
        >
          <X />
        </Button>
      </div>
      <p className="text-small text-ink-muted">
        Each country or region is one download from Geofabrik of its OpenStreetMap extract, from about 50 MB for Luxembourg to 2.2 GB for
        Great Britain and 5.1 GB for France. It is read for its main roads on this device and then deleted; the network kept is 1 to 2% of
        it (30 MB for Great Britain). Building takes minutes for a large country. After that, routes are planned offline. Install every
        country you will drive through; neighbours join at their borders by themselves.
      </p>
      {install.isError ? (
        <Notice tone="danger" icon={<CircleAlert />}>
          {errorMessage(install.error)}
        </Notice>
      ) : null}
      {regions.isPending ? (
        <Skeleton className="h-24" />
      ) : regions.isError ? (
        <ErrorState error={regions.error} onRetry={() => regions.refetch()} />
      ) : !regions.data.held ? (
        <div className="grid gap-2">
          <p className="text-small text-ink">
            Choosing a country needs Geofabrik's list of the extracts it publishes. Reading it asks download.geofabrik.de for one file of
            about 500 kB; the list is then kept on this device.
          </p>
          <div>
            <Button onClick={() => read.mutate()} loading={read.isPending}>
              Read the list of regions
            </Button>
          </div>
          {read.isError ? <p className="text-small text-danger">{errorMessage(read.error)}</p> : null}
        </div>
      ) : (
        <>
          {suggested.length > 0 ? (
            <section aria-label="For the map areas you have downloaded">
              <h5 className="text-micro font-semibold text-ink-muted">For the map areas you have downloaded</h5>
              <ul className="divide-y divide-border">{suggested.map(row)}</ul>
            </section>
          ) : (
            <p className="text-small text-ink-muted">
              {mapRegions.length === 0
                ? "No map regions are downloaded yet, so there is nothing to suggest. Find the country by name."
                : "Find the country by name."}
            </p>
          )}
          <div className="relative">
            <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-ink-muted" />
            <Input
              type="search"
              aria-label="Find a country or region"
              placeholder="Find a country or region"
              value={text}
              onChange={(event) => setText(event.target.value)}
              className="pl-8"
              autoComplete="off"
            />
          </div>
          {typed ? (
            found.length === 0 ? (
              <p className="text-small text-ink-muted">Nothing in Geofabrik's list is called that. Try the country's name in English.</p>
            ) : (
              <ul aria-label="Regions found" className="max-h-72 divide-y divide-border overflow-y-auto">
                {found.map(row)}
              </ul>
            )
          ) : null}
          <p className="text-micro text-ink-muted">
            Germany and a few other large countries are sent from another server and cannot be added whole: add their parts, which join.
          </p>
        </>
      )}
    </div>
  );
}

export function RoadNetworksSection({
  mapRegions,
  sectionRef,
  adding,
  onAddingChange,
}: {
  mapRegions: InstalledRegion[];
  sectionRef?: RefObject<HTMLElement | null>;
  adding: boolean;
  onAddingChange: (adding: boolean) => void;
}) {
  const networks = useRoadNetworks();
  const downloads = useDownloads();
  const jobs = useActiveJobs();
  const installed = networks.data?.networks ?? [];
  const building = networks.data?.building ?? [];

  return (
    <section ref={sectionRef} id="road-networks" aria-labelledby="road-networks-heading" className="scroll-mt-4">
      <PanelHeading
        actions={
          (installed.length > 0 || building.length > 0) && !adding ? (
            <Button size="sm" onClick={() => onAddingChange(true)}>
              <Plus /> Add a network
            </Button>
          ) : null
        }
      >
        <span id="road-networks-heading">Road networks for routes</span>
      </PanelHeading>
      {networks.isPending ? (
        <Skeleton className="mt-2 h-16" />
      ) : networks.isError ? (
        <ErrorState error={networks.error} onRetry={() => networks.refetch()} />
      ) : (
        <>
          {installed.length === 0 && building.length === 0 ? (
            <div className="mt-1">
              <p className="text-small text-ink-muted">
                The main roads of a country, for planning road routes on the map (Routes, Road route): a one-off download from Geofabrik
                (OpenStreetMap data, under the ODbL), after which routes are planned offline.
              </p>
              {!adding ? (
                <Button variant="primary" className="mt-3" onClick={() => onAddingChange(true)}>
                  Add a road network
                </Button>
              ) : null}
            </div>
          ) : null}
          {building.length > 0 ? (
            <ul aria-label="Road networks being added" className="mt-2 divide-y divide-border border-y border-border">
              {building.map((entry) => (
                <Building key={entry.jobId} entry={entry} downloads={downloads.data ?? []} jobs={jobs.data ?? []} />
              ))}
            </ul>
          ) : null}
          {building.some((entry) => (downloads.data ?? []).some((download) => download.id === entry.jobId)) ? (
            <p className="mt-2 text-micro text-ink-muted">
              Also listed under{" "}
              <Link to="/downloads" className={link}>
                Downloads
              </Link>
              .
            </p>
          ) : null}
          {installed.length > 0 ? (
            <ul aria-label="Road networks installed" className="mt-2 divide-y divide-border border-y border-border">
              {installed.map((network) => (
                <NetworkRow key={network.id} network={network} />
              ))}
            </ul>
          ) : null}
          {adding ? <AddNetwork installed={installed} mapRegions={mapRegions} onClose={() => onAddingChange(false)} /> : null}
          {installed.length > 0 ? <p className="mt-2 text-micro text-ink-muted">{networks.data.credit.line}</p> : null}
        </>
      )}
    </section>
  );
}
