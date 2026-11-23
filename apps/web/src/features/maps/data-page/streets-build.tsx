/**
 * Streets for routes on Map data: building them from kept country files, said plainly
 * before it starts (about an hour for Great Britain on a Raspberry Pi 5, the memory it
 * takes, what it writes to the disk it works on), with the choice to work on another
 * storage location to spare an SD card; and the one line shown where the optional streets
 * service is not installed, saying what it is and how to turn it on.
 *
 * Nothing is downloaded: the streets are built on this device from files already kept.
 */
import { formatBytes, type StreetsCountryFile, type StreetsEstimate } from "@outpost/shared";
import { CircleAlert } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { Notice } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Checkbox, Skeleton } from "@/components/ui/misc";
import { ChoiceList } from "@/features/downloads/choice-list";
import { errorMessage } from "@/lib/api";
import { useStorage } from "@/lib/queries";
import { useBuildStreets, useStreetsEstimate, useStreetsStatus } from "../road-route/streets-data";
import { dayText } from "./words";

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
    `The streets then take ${formatBytes(estimate.resultBytes)}.`,
  ];
}

const OWN = "own";

export function StreetsBuildDialog({
  open,
  onOpenChange,
  country,
  onKeepFile,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The country (two letters) whose row asked, to choose its files first. */
  country: string | null;
  /** Opens keeping a country file, for a country with none kept. */
  onKeepFile: (country: string | null) => void;
}) {
  const status = useStreetsStatus();
  const storage = useStorage();
  const build = useBuildStreets();
  const files = status.data?.countryFiles ?? [];
  const [chosen, setChosen] = useState<string[]>([]);
  const [where, setWhere] = useState<string>(OWN);
  const headingId = useId();

  // Each time it opens: the asking country's files chosen, or the only one there is.
  // biome-ignore lint/correctness/useExhaustiveDependencies: once for each opening, when the files are known
  useEffect(() => {
    if (!open || !status.data) return;
    const mine = files.filter((file) => country && file.country === country).map((file) => file.regionId);
    setChosen(mine.length > 0 ? mine : files.length === 1 ? [files[0]!.regionId] : []);
    setWhere(OWN);
    build.reset();
  }, [open, status.data === undefined]);

  const estimate = useStreetsEstimate(open ? chosen : []);
  const places = useMemo(
    () => (storage.data?.locations ?? []).filter((location) => location.status === "available" && location.kind !== "internal"),
    [storage.data],
  );
  const toggle = (file: StreetsCountryFile, on: boolean) =>
    setChosen((current) => (on ? [...current, file.regionId] : current.filter((each) => each !== file.regionId)));

  const start = () =>
    build.mutate(
      { regions: chosen, ...(where !== OWN ? { workLocationId: where } : {}) },
      {
        onSuccess: (answer) => {
          onOpenChange(false);
          const name = answer.estimate?.regions.map((region) => region.name).join(" and ") ?? "the files chosen";
          toast.success(`Building streets for ${name}: ${buildTimeText(answer.estimate?.minutes ?? 60)}. Progress is in the row.`);
        },
      },
    );

  const busy = status.data?.build && status.data.build.state !== "failed";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Add streets for routes"
        description="Door-to-door, walking and cycling routes and reachable areas, built on this device from a kept country file. Nothing is downloaded."
      >
        <DialogBody className="grid gap-4">
          {status.isPending ? (
            <div className="grid gap-2" aria-busy>
              <Skeleton className="h-10" />
              <Skeleton className="h-24" />
            </div>
          ) : status.isError ? (
            <Notice tone="danger" icon={<CircleAlert />} title="Streets for routes could not be read">
              {errorMessage(status.error)}
            </Notice>
          ) : files.length === 0 ? (
            <div className="grid justify-items-start gap-2">
              <p className="text-small text-ink">
                Streets are built from a country file kept on this device, and none is kept yet. Keep one first, then come back here.
              </p>
              <Button
                variant="primary"
                onClick={() => {
                  onOpenChange(false);
                  onKeepFile(country);
                }}
              >
                Keep a country file
              </Button>
            </div>
          ) : (
            <>
              <section aria-labelledby={headingId} className="grid gap-2">
                <h3 id={headingId} className="text-small font-semibold text-ink">
                  Countries
                </h3>
                <ul className="divide-y divide-border border-y border-border">
                  {files.map((file) => {
                    const id = `streets-file-${file.regionId.replace(/\W+/g, "-")}`;
                    return (
                      <li key={file.regionId} className="flex items-start gap-3 py-2.5 max-md:py-3">
                        <Checkbox
                          id={id}
                          checked={chosen.includes(file.regionId)}
                          onCheckedChange={(next) => toggle(file, next === true)}
                          className="mt-0.5"
                        />
                        <label htmlFor={id} className="flex min-w-0 flex-1 cursor-pointer flex-wrap justify-between gap-x-4">
                          <span className="text-small font-medium text-ink">{file.name}</span>
                          <span className="tabular text-small text-ink-muted">
                            {formatBytes(file.bytes)}
                            {file.dataDate ? `, data from ${dayText(file.dataDate)}` : ""}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
                {files.length > 1 ? (
                  <p className="text-small text-ink-muted">Several are joined into one set, which replaces the streets in use.</p>
                ) : null}
              </section>

              {chosen.length === 0 ? (
                <p className="text-small text-ink-muted">Choose a country to see what building its streets takes.</p>
              ) : estimate.isError ? (
                <Notice tone="danger" icon={<CircleAlert />}>
                  {errorMessage(estimate.error)}
                </Notice>
              ) : !estimate.data ? (
                <Skeleton className="h-24" aria-busy />
              ) : (
                <section aria-label="What it takes" className="grid gap-1.5" data-testid="streets-estimate">
                  <h3 className="text-small font-semibold text-ink">What it takes</h3>
                  {estimate.data.measured ? null : (
                    <Notice tone="warning" icon={<CircleAlert />} title="The figures are guesses">
                      Nothing this size has been built on a Raspberry Pi yet.
                    </Notice>
                  )}
                  {/* The server's own sentences: the time, what it writes, the room and the memory, and anything to beware of. */}
                  <ul className="grid list-disc gap-1 pl-5 text-small text-ink">
                    {(estimate.data.warnings.length > 0 ? estimate.data.warnings : estimateLines(estimate.data)).map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </section>
              )}

              {places.length > 0 ? (
                <section className="grid gap-1.5">
                  <h3 className="text-small font-semibold text-ink">Where it works</h3>
                  <p className="text-small text-ink-muted">
                    An SD card wears with every write. Working on the NAS or a USB disk spares it; the streets are copied back when done.
                  </p>
                  <ChoiceList
                    label="Where it works"
                    value={where}
                    onChange={setWhere}
                    choices={[
                      { value: OWN, title: "This device's own disk", detail: "Where the streets are kept" },
                      ...places.map((place) => ({
                        value: place.id,
                        title: place.name,
                        detail: place.freeBytes !== null ? `${formatBytes(place.freeBytes)} free` : undefined,
                      })),
                    ]}
                  />
                </section>
              ) : null}

              {busy ? <p className="text-small text-ink">A build is under way already: it can be stopped from its row.</p> : null}
              {build.isError ? (
                <p role="alert" className="text-small text-danger">
                  {errorMessage(build.error)}
                </p>
              ) : null}
            </>
          )}
        </DialogBody>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          {files.length > 0 ? (
            <Button variant="primary" onClick={start} loading={build.isPending} disabled={chosen.length === 0 || Boolean(busy)}>
              Build streets
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Where the optional streets service is not installed: what it would add, and how to turn it on. */
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
