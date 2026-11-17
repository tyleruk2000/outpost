/**
 * "Place names for Great Britain": OS Open Names from Ordnance Survey, in the Offline
 * tab beside GeoNames' place names. Asks OS for the current edition and its size only
 * when "Check the size" is pressed; downloads it as a job; shows the edition held and
 * offers a newer one when OS has it. Removing it is one press, like other place names.
 */
import { type DownloadDto, formatBytes, type OsNamesCheck, type PlacesDataset } from "@outpost/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CircleAlert, Trash2 } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";
import { ErrorState } from "@/components/page";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Badge, Checkbox } from "@/components/ui/misc";
import { DownloadControls, DownloadProgress } from "@/features/downloads/download-progress";
import { api, errorMessage } from "@/lib/api";
import { notify } from "@/lib/notify";
import { formatNumber } from "@/lib/utils";
import { useRemovePlaces } from "../data";
import { DestinationPicker, useDestination } from "./destination";

/** Titles of OS Open Names downloads start with this (modules/maps/os-names/index.ts). */
export const OS_NAMES_TITLE = "Place names for Great Britain";

/** Room the names take in Outpost's database once read, measured on the October 2026 edition. */
const DATABASE_BYTES = { withRoads: 519_000_000, withoutRoads: 366_000_000 };

const OGL = "https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/";

export function isOsNamesDownload(download: DownloadDto): boolean {
  return download.kind === "places" && download.title.startsWith(OS_NAMES_TITLE);
}

function useCheck() {
  return useMutation({
    mutationFn: () => api.post<OsNamesCheck>("/api/maps/places/os-names/check", {}),
  });
}

function useStart() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (request: { locationId?: string; roads: boolean }) =>
      api.post<{ download: DownloadDto }>("/api/maps/places/os-names", request),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["downloads"] });
      void client.invalidateQueries({ queryKey: ["maps"] });
    },
    onError: (error) => notify.error(errorMessage(error)),
  });
}

function editionLabel(edition: string | null): string {
  const match = /^(\d{4})-(\d{2})$/.exec(edition ?? "");
  if (!match) return edition ?? "";
  return new Date(Number(match[1]), Number(match[2]) - 1, 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

const link = "text-primary underline decoration-1 underline-offset-2";

export function OsNamesSection({ datasets, downloads }: { datasets: PlacesDataset[]; downloads: DownloadDto[] }) {
  const held = datasets.find((dataset) => dataset.source === "os");
  const active = downloads.filter(isOsNamesDownload);
  const check = useCheck();
  const start = useStart();
  const remove = useRemovePlaces();
  const [roads, setRoads] = useState(true);
  const [removing, setRemoving] = useState(false);
  const roadsId = useId();
  const offer = check.data;
  const wanted = Boolean(offer && (!offer.installed || offer.updateAvailable || offer.installed.edition !== offer.edition));
  // Only the zip goes to the storage location; the names are read into the database.
  const destination = useDestination(wanted && offer ? offer.sizeBytes : null);

  return (
    <section aria-label={OS_NAMES_TITLE} className="mt-5 grid gap-3">
      <div>
        <h4 className="text-small font-semibold text-ink">{OS_NAMES_TITLE}</h4>
        <p className="mt-1 text-small text-ink-muted">
          Ordnance Survey's OS Open Names: about three million towns, villages, hills, woods, lakes, streets and postcodes, so the search
          box finds a village, a hill or a postcode such as SY23 3BY. England, Scotland and Wales only: Northern Ireland, the Isle of Man
          and the Channel Islands are not covered.
        </p>
      </div>

      {held ? (
        <ul className="divide-y divide-border border-y border-border">
          <li className="flex items-start gap-2 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="text-small font-medium text-ink">OS Open Names, {editionLabel(held.edition)} edition</p>
              <p className="tabular text-small text-ink-muted">
                {formatNumber(held.count)} names{held.roads === false ? ", without streets" : ""}, {formatBytes(held.sizeBytes)} file
              </p>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-small text-ink-muted">
                Kept on {held.locationName}
                {!held.available ? (
                  <Badge tone="warning">
                    <CircleAlert aria-hidden /> Not connected; search still works
                  </Badge>
                ) : null}
              </p>
            </div>
            <Button variant="ghost" size="icon-sm" aria-label={`Remove ${held.name}`} onClick={() => setRemoving(true)}>
              <Trash2 />
            </Button>
          </li>
        </ul>
      ) : null}

      {active.length > 0 ? (
        <ul className="divide-y divide-border border-y border-border" aria-label="Place names for Great Britain on their way">
          {active.map((download) => (
            <li key={download.id} className="py-3">
              <p className="text-small font-medium text-ink">{download.title}</p>
              <DownloadProgress download={download} className="mt-2" />
              <DownloadControls download={download} className="mt-1 -ml-2" />
            </li>
          ))}
        </ul>
      ) : null}

      {check.isError ? <ErrorState error={check.error} onRetry={() => check.mutate()} /> : null}

      {offer && active.length === 0 ? (
        <div className="grid gap-3">
          <p className="tabular text-small text-ink">
            {wanted ? (
              <>
                {offer.installed ? "A newer edition is out: " : "Ordnance Survey offers the "}
                <span className="font-medium">{offer.editionLabel}</span> edition, a {formatBytes(offer.sizeBytes)} download from{" "}
                {offer.host}. Once read it takes about {formatBytes(roads ? DATABASE_BYTES.withRoads : DATABASE_BYTES.withoutRoads)} in
                Outpost's database. {offer.installed ? "It replaces the edition you have once it is in." : ""}
              </>
            ) : (
              <>You have the newest edition ({offer.editionLabel}). Ordnance Survey publishes a new one every three months.</>
            )}
          </p>
          {wanted ? (
            <>
              <div className="flex items-start gap-2">
                <Checkbox id={roadsId} checked={roads} onCheckedChange={(checked) => setRoads(checked === true)} className="mt-0.5" />
                <label htmlFor={roadsId} className="text-small text-ink">
                  Include streets and road numbers
                  <span className="block text-ink-muted">About 890,000 more names; leave out to save about 150 MB.</span>
                </label>
              </div>
              <div className="grid gap-2">
                <h5 className="text-small font-semibold text-ink">Where to keep the file</h5>
                <DestinationPicker destination={destination} label="Where to keep Ordnance Survey's place names" approximate />
              </div>
              <Button
                className="justify-self-start"
                disabled={!destination.locationId}
                loading={start.isPending}
                onClick={() =>
                  start.mutate(
                    { locationId: destination.locationId, roads },
                    {
                      onSuccess: () => {
                        destination.remember();
                        check.reset();
                        toast.success(`Downloading ${formatBytes(offer.sizeBytes)} of place names from Ordnance Survey.`);
                      },
                    },
                  )
                }
              >
                {offer.installed ? `Update to ${offer.editionLabel}` : `Download ${formatBytes(offer.sizeBytes)}`}
              </Button>
            </>
          ) : null}
        </div>
      ) : active.length === 0 ? (
        <div className="grid gap-1.5">
          <Button className="justify-self-start" loading={check.isPending} onClick={() => check.mutate()}>
            {held ? "Check for a newer edition" : "Check the size"}
          </Button>
          <p className="text-micro text-ink-muted">
            Asks Ordnance Survey (api.os.uk) for its current edition. Needs an internet connection.
          </p>
        </div>
      ) : null}

      <p className="text-micro text-ink-muted">
        {held ? `${held.credit}. ` : "Contains OS data © Crown copyright and database right. "}
        Free to use under the{" "}
        <a href={OGL} target="_blank" rel="noopener noreferrer" className={link}>
          Open Government Licence
        </a>
        ; no account is needed.
      </p>

      <ConfirmDialog
        open={removing}
        onOpenChange={setRemoving}
        title={`Remove “${held?.name ?? ""}”?`}
        description={`Search will no longer find these ${held ? formatNumber(held.count) : ""} names and postcodes. The file is deleted; it can be downloaded again at any time.`}
        confirmLabel="Remove place names"
        loading={remove.isPending}
        onConfirm={() => held && remove.mutate(held, { onSuccess: () => setRemoving(false) })}
      />
    </section>
  );
}
