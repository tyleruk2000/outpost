/**
 * "Maps on this device": the download manager for maps. Lists installed regions and
 * place names with where they are stored, shows downloads in progress, and leads into
 * adding a region.
 */
import {
  ACTIVE_DOWNLOAD_STATES,
  type DownloadDto,
  formatBytes,
  type InstalledRegion,
  type MapOverview,
  type PlacesDataset,
} from "@outpost/shared";
import { type UseQueryResult, useQuery } from "@tanstack/react-query";
import { CircleAlert, Ellipsis, Plus, Scan, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { ErrorState, Notice } from "@/components/page";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { Badge, Select } from "@/components/ui/misc";
import { ChoiceList } from "@/features/downloads/choice-list";
import { DownloadControls, DownloadProgress } from "@/features/downloads/download-progress";
import { useDownloads } from "@/features/downloads/use-downloads";
import { KeepAreaSection } from "@/features/kept/keep-controls";
import { ReferenceDataSection } from "@/features/layers/dataset-manager";
import { formatNumber, plural } from "@/lib/utils";
import { type PlacesDatasetRequest, useRemovePlaces, useRemoveRegion, useStartPlaces } from "../data";
import { ImageryArea, SatelliteSection } from "../imagery/panel";
import { formatBboxSize } from "../lib/geo";
import { formatBuild } from "../lib/tracks";
import type { MapEngine } from "../map/engine";
import { RoadNetworksSection } from "../road-route/road-networks";
import { PanelHeading, PanelLoading } from "../ui";
import { AddRegion, detailLabel } from "./add-region";
import { DestinationPicker, useDestination } from "./destination";
import { isOsNamesDownload, OsNamesSection } from "./os-names";

/** What the panel was opened to do, when it was opened from elsewhere on the screen. */
export type OfflineIntent =
  | { type: "add"; presetId?: string }
  | { type: "places" }
  | { type: "imagery" }
  | { type: "reference" }
  | { type: "roads" }
  | null;

function ActiveDownloads({ downloads }: { downloads: DownloadDto[] }) {
  if (downloads.length === 0) return null;
  return (
    <ul className="divide-y divide-border border-y border-border" aria-label="Downloads in progress">
      {downloads.map((download) => (
        <li key={download.id} className="py-3">
          <div className="flex items-start justify-between gap-3">
            <p className="min-w-0 text-small font-medium text-ink">{download.title}</p>
          </div>
          <DownloadProgress download={download} className="mt-2" />
          <DownloadControls download={download} className="mt-1 -ml-2" />
        </li>
      ))}
    </ul>
  );
}

function RegionRow({ region, onShow }: { region: InstalledRegion; onShow: (() => void) | undefined }) {
  const [removing, setRemoving] = useState(false);
  const [choice, setChoice] = useState<"delete" | "keep">();
  const [needsChoice, setNeedsChoice] = useState(false);
  const remove = useRemoveRegion();
  const build = formatBuild(region.sourceBuild);
  const terrain = region.tileType === "terrain";
  const trouble = !region.available
    ? "The drive holding this is not connected"
    : region.status === "missing"
      ? "The file is missing"
      : region.status === "damaged"
        ? "The file is damaged"
        : region.status === "moving"
          ? "Being moved"
          : null;

  return (
    <li className="py-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h4 className="font-title text-body text-ink">{region.name}</h4>
          <p className="tabular mt-0.5 text-small text-ink-muted">
            {terrain ? "Terrain for hill shading" : detailLabel(region.maxZoom)}, zoom {region.minZoom} to {region.maxZoom}
          </p>
          <p className="tabular text-small text-ink-muted">
            {formatBboxSize(region.bounds)}, {formatBytes(region.sizeBytes)}
            {build ? `, map data from ${build}` : ""}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-small text-ink-muted">
            Kept on {region.locationName}
            {trouble ? (
              <Badge tone="warning">
                <CircleAlert aria-hidden /> {trouble}
              </Badge>
            ) : null}
          </p>
        </div>
        <Menu>
          <MenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${region.name}`}>
              <Ellipsis />
            </Button>
          </MenuTrigger>
          <MenuContent>
            <MenuItem disabled={!onShow} onSelect={() => onShow?.()}>
              <Scan /> Show on map
            </MenuItem>
            <MenuSeparator />
            <MenuItem
              danger
              onSelect={() => {
                setChoice(undefined);
                setNeedsChoice(false);
                setRemoving(true);
              }}
            >
              <Trash2 /> Remove
            </MenuItem>
          </MenuContent>
        </Menu>
      </div>
      <ConfirmDialog
        open={removing}
        onOpenChange={setRemoving}
        title={`Remove “${region.name}”?`}
        description={
          terrain
            ? "Hill shading will no longer be drawn for this area."
            : "The map will show only outlines here unless another installed region covers the area."
        }
        confirmLabel={choice === "delete" ? "Remove and delete the file" : choice === "keep" ? "Remove, keep the file" : "Remove"}
        loading={remove.isPending}
        onConfirm={() => {
          if (!choice) return setNeedsChoice(true);
          remove.mutate(
            { id: region.id, deleteFiles: choice === "delete" },
            {
              onSuccess: () => {
                setRemoving(false);
                toast.success(
                  choice === "delete"
                    ? `Removed “${region.name}” and deleted its file.`
                    : `Removed “${region.name}”. Its file was left on ${region.locationName}.`,
                );
              },
            },
          );
        }}
      >
        <ChoiceList
          label="What happens to the file"
          value={choice}
          onChange={(value) => {
            setChoice(value);
            setNeedsChoice(false);
          }}
          choices={[
            {
              value: "delete",
              title: "Delete the file",
              detail: region.available
                ? `Frees ${formatBytes(region.sizeBytes)} on ${region.locationName}`
                : `${region.locationName} is not connected, so the file cannot be deleted now`,
              disabled: !region.available,
            },
            { value: "keep", title: "Keep the file", detail: `Outpost stops using it; the file stays on ${region.locationName}` },
          ]}
        />
        {needsChoice ? (
          <p role="alert" className="mt-2 text-small text-danger">
            Choose what happens to the file first.
          </p>
        ) : null}
      </ConfirmDialog>
    </li>
  );
}

const MB = 1024 * 1024;
/** `bytes` is roughly what the download takes, to rule out a location with no room; a country's size is not known beforehand. */
const DATASET_CHOICES = [
  {
    value: "cities500",
    title: "Towns and cities of the world",
    detail: "Every place with more than 500 people",
    trailing: "about 13 MB",
    bytes: 13 * MB,
  },
  {
    value: "cities15000",
    title: "Larger towns and cities only",
    detail: "Places with more than 15,000 people",
    trailing: "about 3 MB",
    bytes: 3 * MB,
  },
  { value: "country", title: "One country in full", detail: "Villages, hills, lakes, passes and other named features", bytes: null },
] as const;

function PlaceNames({
  datasets: allDatasets,
  downloads: allDownloads,
  sectionRef,
}: {
  datasets: PlacesDataset[];
  downloads: DownloadDto[];
  sectionRef: React.RefObject<HTMLElement | null>;
}) {
  // Ordnance Survey's place names have a part of their own below (os-names.tsx).
  const datasets = allDatasets.filter((dataset) => dataset.source !== "os");
  const downloads = allDownloads.filter((download) => !isOsNamesDownload(download));
  const [choice, setChoice] = useState<(typeof DATASET_CHOICES)[number]["value"]>();
  const [country, setCountry] = useState<string>();
  const [removing, setRemoving] = useState<PlacesDataset>();
  const start = useStartPlaces();
  const remove = useRemovePlaces();
  const destination = useDestination(DATASET_CHOICES.find((item) => item.value === choice)?.bytes ?? null, "places");
  // The country list comes from the outline map's own file: no connection needed to choose.
  const countries = useQuery({
    queryKey: ["maps", "countries"],
    queryFn: async () => {
      const response = await fetch("/world/countries.json");
      if (!response.ok) throw new Error("The list of countries could not be read.");
      const data = (await response.json()) as { features: Array<{ properties: { name: string; iso: string | null } }> };
      return data.features
        .flatMap((feature) => (feature.properties.iso ? [{ value: feature.properties.iso, label: feature.properties.name }] : []))
        .sort((a, b) => a.label.localeCompare(b.label, "en"));
    },
    enabled: choice === "country",
    staleTime: Number.POSITIVE_INFINITY,
  });

  const dataset: PlacesDatasetRequest | null =
    choice === "country" ? (country ? { dataset: "country", country } : null) : choice ? { dataset: choice } : null;
  const request: PlacesDatasetRequest | null =
    dataset && destination.locationId ? { ...dataset, locationId: destination.locationId } : null;

  return (
    <section ref={sectionRef} className="scroll-mt-4" aria-label="Place names">
      <PanelHeading>Place names</PanelHeading>
      <p className="mt-1 text-small text-ink-muted">
        Lets the search box find towns, hills and lakes by name without a connection. From{" "}
        <a
          href="https://www.geonames.org"
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline decoration-1 underline-offset-2"
        >
          GeoNames
        </a>{" "}
        (CC BY 4.0).
      </p>

      {datasets.length > 0 ? (
        <ul className="mt-3 divide-y divide-border border-y border-border">
          {datasets.map((dataset) => (
            <li key={dataset.id} className="flex items-start gap-2 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-small font-medium text-ink">{dataset.name}</p>
                <p className="tabular text-small text-ink-muted">
                  {plural(dataset.count, "place")}, {formatBytes(dataset.sizeBytes)}
                </p>
              </div>
              <Button variant="ghost" size="icon-sm" aria-label={`Remove ${dataset.name}`} onClick={() => setRemoving(dataset)}>
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      ) : downloads.length === 0 ? (
        <p className="mt-3 text-small text-ink-muted">None installed. Coordinates and grid references can still be searched for.</p>
      ) : null}

      {downloads.length > 0 ? (
        <div className="mt-3">
          <ActiveDownloads downloads={downloads} />
        </div>
      ) : null}

      <div className="mt-4 grid gap-3">
        <h4 className="text-small font-semibold text-ink">Add place names</h4>
        <ChoiceList
          label="Add place names"
          value={choice}
          onChange={setChoice}
          choices={DATASET_CHOICES.map(({ bytes: _bytes, ...item }) => ({ ...item }))}
        />
        {choice === "country" ? (
          countries.isError ? (
            <ErrorState error={countries.error} onRetry={() => countries.refetch()} />
          ) : (
            <Select
              aria-label="Country"
              placeholder={countries.isPending ? "Reading the list of countries" : "Choose a country"}
              value={country}
              onChange={setCountry}
              options={countries.data ?? []}
              disabled={countries.isPending}
            />
          )
        ) : null}
        {/* Asked once something is chosen, directly above the button that starts the download. */}
        {choice ? (
          <div className="grid gap-2">
            <h5 className="text-small font-semibold text-ink">Where to keep them</h5>
            <DestinationPicker destination={destination} label="Where to keep the place names" approximate />
          </div>
        ) : null}
        <Button
          className="justify-self-start"
          disabled={!request}
          loading={start.isPending}
          onClick={() =>
            request &&
            start.mutate(request, {
              onSuccess: () => {
                destination.remember();
                toast.success(`Downloading place names to ${destination.location?.name ?? "the chosen location"}.`);
                setChoice(undefined);
              },
            })
          }
        >
          Download place names
        </Button>
      </div>
      <OsNamesSection datasets={allDatasets} downloads={allDownloads} />

      <ConfirmDialog
        open={Boolean(removing)}
        onOpenChange={(open) => !open && setRemoving(undefined)}
        title={`Remove “${removing?.name ?? ""}”?`}
        description={`Search will no longer find these ${removing ? formatNumber(removing.count) : ""} places by name. The list can be downloaded again at any time.`}
        confirmLabel="Remove place names"
        loading={remove.isPending}
        onConfirm={() => removing && remove.mutate(removing, { onSuccess: () => setRemoving(undefined) })}
      />
    </section>
  );
}

export function OfflinePanel({
  overview,
  engine,
  intent,
  onIntentHandled,
  onNeedMap,
  onNeedRoom,
}: {
  overview: UseQueryResult<MapOverview>;
  engine: MapEngine | null;
  intent: OfflineIntent;
  onIntentHandled: () => void;
  /** Asks the screen to uncover the map (on a phone, lowers the sheet). */
  onNeedMap: () => void;
  /** Asks the screen for as much room as it can give (on a phone, raises the sheet). */
  onNeedRoom: () => void;
}) {
  const downloads = useDownloads();
  const [adding, setAdding] = useState<{ presetId?: string } | null>(null);
  const placesRef = useRef<HTMLElement>(null);
  const imageryRef = useRef<HTMLElement>(null);
  const [choosingImagery, setChoosingImagery] = useState(false);
  const roadsRef = useRef<HTMLElement>(null);
  const [addingRoads, setAddingRoads] = useState(false);

  useEffect(() => {
    if (!intent) return;
    if (intent.type === "add") setAdding({ presetId: intent.presetId });
    if (intent.type === "imagery") {
      setAdding(null);
      window.setTimeout(() => imageryRef.current?.scrollIntoView({ block: "start" }), 0);
    }
    if (intent.type === "reference") {
      setAdding(null);
      window.setTimeout(() => document.getElementById("reference-data")?.scrollIntoView({ block: "start" }), 0);
    }
    if (intent.type === "roads") {
      setAdding(null);
      setAddingRoads(true);
      window.setTimeout(() => roadsRef.current?.scrollIntoView({ block: "start" }), 0);
    }
    if (intent.type === "places") {
      setAdding(null);
      // After the list has rendered: the section may not exist on the first pass.
      window.setTimeout(() => placesRef.current?.scrollIntoView({ block: "start" }), 0);
    }
    onIntentHandled();
  }, [intent, onIntentHandled]);

  if (adding) {
    return (
      <AddRegion
        engine={engine}
        initialPresetId={adding.presetId}
        onClose={() => setAdding(null)}
        onNeedMap={onNeedMap}
        onNeedRoom={onNeedRoom}
      />
    );
  }

  if (choosingImagery) {
    return <ImageryArea engine={engine} onClose={() => setChoosingImagery(false)} onNeedMap={onNeedMap} onNeedRoom={onNeedRoom} />;
  }

  if (overview.isPending) return <PanelLoading />;
  if (overview.isError) {
    return (
      <div className="p-4">
        <ErrorState error={overview.error} onRetry={() => overview.refetch()} />
      </div>
    );
  }

  const active = (downloads.data ?? []).filter(
    (download) => ACTIVE_DOWNLOAD_STATES.includes(download.state) || download.state === "failed",
  );
  const mapDownloads = active.filter((download) => download.kind === "map" || download.kind === "terrain");
  const placeDownloads = active.filter((download) => download.kind === "places");
  const { regions, places } = overview.data;
  const unreachable = regions.filter((region) => !region.available);

  return (
    <div className="scroll-quiet grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] content-start gap-6 overflow-y-auto px-4 py-4">
      <section aria-label="Maps on this device">
        <PanelHeading
          actions={
            regions.length > 0 || mapDownloads.length > 0 ? (
              <Button size="sm" onClick={() => setAdding({})}>
                <Plus /> Add a region
              </Button>
            ) : null
          }
        >
          Maps on this device
        </PanelHeading>

        {unreachable.length > 0 ? (
          <Notice tone="warning" icon={<CircleAlert />} className="mt-2">
            {unreachable.length === 1 ? `“${unreachable[0]!.name}” is` : `${unreachable.length} regions are`} on a drive that is not
            connected, so that part of the map shows only outlines. Reconnect the drive and it comes back by itself.
          </Notice>
        ) : null}

        {regions.length === 0 && mapDownloads.length === 0 ? (
          <div className="mt-1">
            <p className="text-small text-ink-muted">
              No detailed maps yet. Outpost draws coastlines and borders until a region is downloaded. Maps are downloaded one region at a
              time, so you keep only the areas you need, and they then work with no connection.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="primary" onClick={() => setAdding({})}>
                Choose your area
              </Button>
              <Button onClick={() => setAdding({ presetId: "world" })}>World overview (about 45 MB)</Button>
            </div>
          </div>
        ) : (
          <>
            {mapDownloads.length > 0 ? (
              <div className="mt-2">
                <ActiveDownloads downloads={mapDownloads} />
                <p className="mt-2 text-micro text-ink-muted">
                  Also listed under{" "}
                  <Link to="/downloads" className="text-primary underline decoration-1 underline-offset-2">
                    Downloads
                  </Link>
                  .
                </p>
              </div>
            ) : null}
            {regions.length > 0 ? (
              <ul className="mt-2 divide-y divide-border border-y border-border">
                {regions.map((region) => (
                  <RegionRow
                    key={region.id}
                    region={region}
                    onShow={engine ? () => engine.fitBounds(region.bounds, { maxZoom: Math.max(4, region.maxZoom - 1) }) : undefined}
                  />
                ))}
              </ul>
            ) : null}
          </>
        )}
      </section>

      <SatelliteSection engine={engine} onChooseArea={() => setChoosingImagery(true)} sectionRef={imageryRef} />
      <PlaceNames datasets={places} downloads={placeDownloads} sectionRef={placesRef} />
      <RoadNetworksSection mapRegions={regions} sectionRef={roadsRef} adding={addingRoads} onAddingChange={setAddingRoads} />
      <ReferenceDataSection engine={engine} />
      <KeepAreaSection engine={engine} />
    </div>
  );
}
