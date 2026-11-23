/**
 * Place names for search: GeoNames' lists of the world's towns, or one country in full, and
 * Ordnance Survey's names for Great Britain. Lists what is held, what is on its way, and adds
 * more; opened from Map data (the whole world's place names, or Maps' search when it has no
 * names to search).
 */
import { type DownloadDto, formatBytes, type PlacesDataset } from "@outpost/shared";
import { useQuery } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ErrorState } from "@/components/page";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog, DialogBody, DialogContent } from "@/components/ui/dialog";
import { Select } from "@/components/ui/misc";
import { ChoiceList } from "@/features/downloads/choice-list";
import { DownloadControls, DownloadProgress } from "@/features/downloads/download-progress";
import { useDownloads } from "@/features/downloads/use-downloads";
import { formatNumber, plural } from "@/lib/utils";
import { type PlacesDatasetRequest, useMapOverview, useRemovePlaces, useStartPlaces } from "../data";
import { DestinationPicker, useDestination } from "../panels/destination";
import { isOsNamesDownload, OsNamesSection } from "../panels/os-names";

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

export function PlaceNames({
  datasets: allDatasets,
  downloads: allDownloads,
  sectionRef,
}: {
  datasets: PlacesDataset[];
  downloads: DownloadDto[];
  sectionRef?: React.RefObject<HTMLElement | null>;
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

/** The place names part, in a dialog of its own. */
export function PlaceNamesDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const overview = useMapOverview();
  const downloads = useDownloads();
  const placeDownloads = (downloads.data ?? []).filter(
    (download) => download.kind === "places" && ["queued", "running", "paused", "verifying", "failed"].includes(download.state),
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Place names" size="lg">
        <DialogBody>
          {overview.isError ? (
            <ErrorState error={overview.error} onRetry={() => overview.refetch()} />
          ) : (
            <PlaceNames datasets={overview.data?.places ?? []} downloads={placeDownloads} />
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
