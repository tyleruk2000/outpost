/**
 * Walking and cycling inside Add a place: what building it takes, said plainly once it is ticked
 * (about an hour for a large country on a Raspberry Pi 5, the memory, what it writes to the disk it
 * works on), with the choice to work on another storage location to spare an SD card; and the one
 * line shown where the optional add-on is not installed, saying what it is and how to turn it on.
 *
 * Nothing more is downloaded for it: it is built on this device from the place's source file,
 * which is kept (and downloaded first where it is not held).
 */
import { formatBytes, type StreetsEstimate, type StreetsEstimateRequest } from "@outpost/shared";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { CircleAlert, Hourglass } from "lucide-react";
import { useMemo } from "react";
import { Link } from "react-router";
import { Notice } from "@/components/page";
import { Skeleton } from "@/components/ui/misc";
import { ChoiceList } from "@/features/downloads/choice-list";
import { api, errorMessage } from "@/lib/api";
import { useStorage } from "@/lib/queries";
import { streetsKeys, useStreetsStatus } from "../road-route/streets-data";

/** "about an hour", "about 3 hours", "about 2 minutes". */
export function buildTimeText(minutes: number): string {
  if (minutes < 1.5) return "about a minute";
  if (minutes < 50) return `about ${Math.round(minutes)} minutes`;
  if (minutes < 90) return "about an hour";
  return `about ${Math.round(minutes / 60)} hours`;
}

/** The figures of a build, each in a plain sentence. */
export function estimateLines(estimate: StreetsEstimate): string[] {
  return [
    `Takes ${buildTimeText(estimate.minutes)} on a Raspberry Pi 5, less on a faster computer. Routes keep working meanwhile.`,
    `Uses about ${formatBytes(estimate.memoryBytes)} of memory while it builds.`,
    `Writes about ${formatBytes(estimate.writtenBytes)} to the disk it works on, and needs ${formatBytes(estimate.freeSpaceBytes)} free there.`,
    `Walking and cycling then take ${formatBytes(estimate.resultBytes)}.`,
  ];
}

/** The cost line of the tick: built here, from the source file, which is downloaded first where not held. */
export function walkCostLine(name: string, fileBytes: number | null, held: boolean): string {
  if (held)
    return "Built on this device from the kept source file: nothing to download. About an hour on a Raspberry Pi 5 for a large country.";
  return `Needs ${name}'s source file${fileBytes ? `, ${formatBytes(fileBytes)}` : ""}: downloaded and kept first, then built on this device (about an hour on a Raspberry Pi 5 for a large country).`;
}

/** Where a build works: Outpost's own disk, or another location to spare an SD card. */
export const OWN = "own";

/**
 * What building walking and cycling takes, once ticked: the server's own sentences (time on a
 * Raspberry Pi 5, memory, what it writes and the room it needs), and where it works.
 */
export function WalkDetails({
  request,
  where,
  onWhere,
}: {
  /** The kept files' regions, and those on their way with their size; null until Check size has found the sizes. */
  request: StreetsEstimateRequest | null;
  where: string;
  onWhere: (where: string) => void;
}) {
  const storage = useStorage();
  const status = useStreetsStatus();
  /** Another build under way: this one cannot start until it has finished, and waits for it. */
  const under = status.data?.build && status.data.build.state !== "failed" ? status.data.build : null;
  const key = request ? JSON.stringify(request) : "";
  const estimate = useQuery({
    queryKey: streetsKeys.estimate(key),
    queryFn: () => api.post<StreetsEstimate>("/api/streets/tiles/estimate", request),
    enabled: request !== null && request.regions.length + (request.coming?.length ?? 0) > 0,
    placeholderData: keepPreviousData,
    staleTime: Number.POSITIVE_INFINITY,
  });
  const places = useMemo(
    () => (storage.data?.locations ?? []).filter((location) => location.status === "available" && location.kind !== "internal"),
    [storage.data],
  );
  return (
    // Indented under its tick, except where the column is narrow for the text (a phone at large text): rem here follows the text.
    <div className="@container">
      <div className="grid gap-3 pb-3 pl-8 @max-[18rem]:pl-0">
        {under ? (
          <Notice
            tone="info"
            icon={<Hourglass />}
            title={under.state === "building" ? "Another build is under way" : "Another build is waiting"}
          >
            Walking and cycling {under.name ? `for ${under.name} ` : ""}
            {under.state === "building" ? "are being built now" : "are waiting to be built"}, and only one build runs at a time. This one
            waits behind it and starts by itself; Offline maps and Downloads and tasks show it waiting, and it can be cancelled there.
          </Notice>
        ) : null}
        {request === null ? (
          <p className="text-small text-ink-muted">What building it takes is said once Check size has found the source file's size.</p>
        ) : estimate.isError ? (
          <Notice tone="danger" icon={<CircleAlert />}>
            {errorMessage(estimate.error)}
          </Notice>
        ) : !estimate.data ? (
          <Skeleton className="h-20" aria-busy />
        ) : (
          <section aria-label="What building it takes" className="grid gap-1.5" data-testid="streets-estimate">
            {estimate.data.measured ? null : (
              <Notice tone="warning" icon={<CircleAlert />} title="The figures are guesses">
                Nothing this size has been built on a Raspberry Pi yet.
              </Notice>
            )}
            <ul className="grid list-disc gap-1 pl-5 text-small text-ink">
              {(estimate.data.warnings.length > 0 ? estimate.data.warnings : estimateLines(estimate.data)).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </section>
        )}
        {places.length > 0 ? (
          <section className="grid gap-1.5">
            <h4 className="text-small font-semibold text-ink">Where it works</h4>
            <p className="text-small text-ink-muted">
              An SD card wears with every write. Working on the NAS or a USB disk spares it; walking and cycling are copied back when done.
            </p>
            <ChoiceList
              label="Where it works"
              value={where}
              onChange={onWhere}
              choices={[
                { value: OWN, title: "This device's own disk", detail: "Where walking and cycling are kept" },
                ...places.map((place) => ({
                  value: place.id,
                  title: place.name,
                  detail: place.freeBytes !== null ? `${formatBytes(place.freeBytes)} free` : undefined,
                })),
              ]}
            />
          </section>
        ) : null}
      </div>
    </div>
  );
}

/** Where the optional add-on is not installed: what it would add, and how to turn it on. */
export function StreetsNotInstalled() {
  return (
    <p className="max-w-[70ch] text-small text-ink-muted">
      Door-to-door, walking and cycling routes and street-level reachable areas come with an optional add-on, not part of this installation.{" "}
      <Link to="/help/deployment#h-street-routes" className="text-primary underline underline-offset-2">
        How to turn it on
      </Link>
    </p>
  );
}
