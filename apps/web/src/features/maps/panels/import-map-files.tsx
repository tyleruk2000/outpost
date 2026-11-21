/**
 * Importing map files (GPX, KML, KMZ, GeoJSON), whether chosen with the file picker or
 * dropped on the map. Each file is read by the server first, and the dialog says what
 * it would make before anything is saved; afterwards it says what came out of each.
 */
import { formatBytes, type MapFilePreview, type MarkerDto, type TrackDto, type TrackImportResponse } from "@outpost/shared";
import { CircleAlert, CircleCheck } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { Joined, Notice } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Checkbox, Skeleton, Spinner } from "@/components/ui/misc";
import { errorMessage } from "@/lib/api";
import { plural } from "@/lib/utils";
import { importMapFile, previewMapFile } from "../data";
import { isGpxFile, previewParts } from "../lib/map-files";
import { trackFacts } from "../lib/tracks";
import { Fact } from "../ui";

type Preview = { state: "reading" } | { state: "ready"; preview: MapFilePreview } | { state: "failed"; message: string };

type ImportOutcome =
  | { file: File; state: "waiting" | "working" }
  | { file: File; state: "done"; result: TrackImportResponse }
  | { file: File; state: "failed"; message: string };

const fileKey = (file: File) => `${file.name}-${file.size}`;

function dialogTitle(files: File[] | null): string {
  if (!files) return "Import a file";
  const allGpx = files.every(isGpxFile);
  if (files.length === 1) return allGpx ? "Import a GPX file" : "Import a map file";
  return allGpx ? `Import ${files.length} GPX files` : `Import ${files.length} map files`;
}

export function ImportMapFilesDialog({
  files,
  onClose,
  onShow,
}: {
  files: File[] | null;
  onClose: () => void;
  onShow: (track: TrackDto | null, markers: MarkerDto[]) => void;
}) {
  const waypointsId = useId();
  const [waypoints, setWaypoints] = useState(false);
  const [previews, setPreviews] = useState<Preview[]>([]);
  const [outcomes, setOutcomes] = useState<ImportOutcome[] | null>(null);

  // A new set of files starts a new import: each is read by the server, one after another.
  useEffect(() => {
    setOutcomes(null);
    setWaypoints(false);
    if (!files) {
      setPreviews([]);
      return;
    }
    let current: Preview[] = files.map(() => ({ state: "reading" }));
    setPreviews(current);
    let stopped = false;
    void (async () => {
      for (const [index, file] of files.entries()) {
        let next: Preview;
        try {
          next = { state: "ready", preview: await previewMapFile(file) };
        } catch (error) {
          next = { state: "failed", message: errorMessage(error) };
        }
        if (stopped) return;
        current = current.map((item, position) => (position === index ? next : item));
        setPreviews(current);
      }
    })();
    return () => {
      stopped = true;
    };
  }, [files]);

  const reading = previews.some((preview) => preview.state === "reading");
  const readable = files?.filter((_, index) => previews[index]?.state === "ready") ?? [];
  const anyGpx = files?.some((file, index) => isGpxFile(file) && previews[index]?.state === "ready") ?? false;

  const run = async () => {
    if (!files) return;
    // A file the server could not read is not sent again: it is reported as it was found.
    let current: ImportOutcome[] = files.map((file, index) => {
      const preview = previews[index];
      return preview?.state === "failed" ? { file, state: "failed", message: preview.message } : { file, state: "waiting" };
    });
    const set = (index: number, outcome: ImportOutcome) => {
      current = current.map((item, position) => (position === index ? outcome : item));
      setOutcomes(current);
    };
    setOutcomes(current);
    for (const [index, file] of files.entries()) {
      if (current[index]?.state === "failed") continue;
      set(index, { file, state: "working" });
      try {
        set(index, { file, state: "done", result: await importMapFile(file, waypoints) });
      } catch (error) {
        set(index, { file, state: "failed", message: errorMessage(error) });
      }
    }
  };

  const working = outcomes?.some((outcome) => outcome.state === "waiting" || outcome.state === "working") ?? false;
  const finished = outcomes !== null && !working;
  const firstDone = outcomes?.find((outcome): outcome is Extract<ImportOutcome, { state: "done" }> => outcome.state === "done");

  return (
    <Dialog open={files !== null} onOpenChange={(open) => !open && !working && onClose()}>
      <DialogContent title={dialogTitle(files)} size="md">
        <DialogBody className="grid gap-4">
          {outcomes === null ? (
            <>
              <ul className="divide-y divide-border border-y border-border">
                {files?.map((file, index) => {
                  const preview = previews[index];
                  return (
                    <li key={fileKey(file)} className="grid gap-1 py-2 text-small">
                      <div className="flex items-baseline justify-between gap-4">
                        <span className="min-w-0 font-mono text-[0.8125rem] break-all text-ink">{file.name}</span>
                        <span className="tabular shrink-0 text-ink-muted">{formatBytes(file.size)}</span>
                      </div>
                      {preview?.state === "ready" ? (
                        <p className="text-ink-muted">
                          <Joined parts={previewParts(preview.preview, waypoints)} />
                        </p>
                      ) : preview?.state === "failed" ? (
                        <p className="flex items-start gap-1.5 text-danger">
                          <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
                          <span>{preview.message}</span>
                        </p>
                      ) : (
                        <Skeleton className="h-5 w-2/3" aria-label="Reading the file" />
                      )}
                    </li>
                  );
                })}
              </ul>
              {readable.length > 0 ? (
                <p className="text-small text-ink-muted">
                  {readable.length === 1 ? "It is added" : "Each is added"} beside what you have saved. Nothing already on the map is
                  changed or replaced.
                </p>
              ) : null}
              {anyGpx ? (
                <div className="flex items-start gap-3">
                  <Checkbox
                    id={waypointsId}
                    checked={waypoints}
                    onCheckedChange={(checked) => setWaypoints(checked === true)}
                    className="mt-0.5"
                  />
                  <label htmlFor={waypointsId} className="text-small text-ink">
                    Also save its waypoints as places
                    <span className="block text-ink-muted">
                      Named points in a GPX file (a summit, a car park) become saved places you can search for and edit. Points in KML and
                      GeoJSON files always do.
                    </span>
                  </label>
                </div>
              ) : null}
            </>
          ) : (
            <ul className="grid gap-3">
              {outcomes.map((outcome) => (
                <li key={fileKey(outcome.file)}>
                  {outcome.state === "done" ? (
                    <Notice
                      tone="success"
                      icon={<CircleCheck />}
                      title={outcome.result.track ? outcome.result.track.name : outcome.file.name}
                    >
                      {outcome.result.track ? (
                        <dl className="mt-1">
                          {trackFacts(outcome.result.track).map((fact) => (
                            <Fact key={fact.label} label={fact.label}>
                              {fact.value}
                            </Fact>
                          ))}
                          {outcome.result.outlines ? <Fact label="Outlines">{plural(outcome.result.outlines, "outline")}</Fact> : null}
                          {outcome.result.markers.length > 0 ? (
                            <Fact label="Places saved">{plural(outcome.result.markers.length, "place")}</Fact>
                          ) : null}
                        </dl>
                      ) : (
                        <p>
                          This file holds no track or route.{" "}
                          {plural(outcome.result.markers.length, isGpxFile(outcome.file) ? "waypoint" : "point")} from it{" "}
                          {outcome.result.markers.length === 1 ? "was" : "were"} saved as places.
                        </p>
                      )}
                    </Notice>
                  ) : outcome.state === "failed" ? (
                    <Notice tone="danger" icon={<CircleAlert />} title={`${outcome.file.name} was not imported`}>
                      {outcome.message}
                    </Notice>
                  ) : (
                    <p className="flex items-center gap-2.5 text-small text-ink-muted">
                      {outcome.state === "working" ? <Spinner label="Importing" /> : <span className="size-4" />}
                      <span className="font-mono text-[0.8125rem] break-all">{outcome.file.name}</span>
                      {outcome.state === "working" ? "Saving" : "Waiting"}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </DialogBody>
        <DialogFooter>
          {outcomes === null ? (
            <>
              <Button onClick={onClose}>Cancel</Button>
              <Button variant="primary" onClick={run} disabled={reading || readable.length === 0}>
                Import
              </Button>
            </>
          ) : (
            <>
              <Button onClick={onClose} disabled={working}>
                {finished && firstDone ? "Close" : "Done"}
              </Button>
              {finished && firstDone ? (
                <Button variant="primary" onClick={() => onShow(firstDone.result.track, firstDone.result.markers)}>
                  Show on the map
                </Button>
              ) : null}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
