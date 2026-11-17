/**
 * Adding an audiobook: a zip of its chapters (as LibriVox offers it), or its audio
 * files chosen together. The files are sent with a progress bar; the server then
 * unpacks and files them as a job, which this follows to its end.
 */
import { type AudiobookAddResponse, type AudiobookAddResult, formatBytes, type JobDto } from "@outpost/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleAlert, CircleCheck, FileAudio } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router";
import { Notice } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/misc";
import { api, errorMessage, uploadWithProgress } from "@/lib/api";
import { useServerConnection, useServerEvent } from "@/lib/events";
import { plural } from "@/lib/utils";

/** What the picker offers. The server checks each file for itself. */
export const AUDIOBOOK_FILES = ".zip,.mp3,.m4a,.m4b,.aac,.ogg,.oga,.opus,.flac,.wav";

const isActive = (job: JobDto | undefined) => job?.state === "queued" || job?.state === "running" || job?.state === "paused";

function useJob(id: string | null) {
  const client = useQueryClient();
  const connected = useServerConnection();
  const key = ["jobs", "audiobook", id];
  const query = useQuery({
    queryKey: key,
    queryFn: () => api.get<{ job: JobDto }>(`/api/jobs/${id}`).then((data) => data.job),
    enabled: Boolean(id),
    // Only while the server's word cannot arrive, because the connection that carries it is down.
    refetchInterval: (state) => (!connected && isActive(state.state.data) ? 1500 : false),
  });
  useServerEvent("job.updated", ({ id: moved, data }) => {
    const job = data as JobDto | undefined;
    if (moved && moved === id && job?.state) client.setQueryData(key, job);
  });
  return query.data;
}

type Stage =
  | { at: "choosing" }
  | { at: "sending"; progress: number }
  | { at: "filing"; jobId: string }
  | { at: "refused"; message: string };

export function AddAudiobookDialog({
  open,
  onOpenChange,
  librivox,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Set from Explore: the LibriVox book whose zip the person downloaded. */
  librivox?: { id: string; title: string; zipName: string };
}) {
  const client = useQueryClient();
  const picker = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const [files, setFiles] = useState<File[]>([]);
  const [title, setTitle] = useState("");
  const [stage, setStage] = useState<Stage>({ at: "choosing" });
  const abort = useRef<AbortController | null>(null);
  const job = useJob(stage.at === "filing" ? stage.jobId : null);
  const result = job?.state === "succeeded" ? (job.result as AudiobookAddResult | null) : null;

  const reset = () => {
    setFiles([]);
    setTitle("");
    setStage({ at: "choosing" });
  };
  const close = (next: boolean) => {
    if (!next) {
      abort.current?.abort();
      if (stage.at !== "filing" || !isActive(job)) reset();
    }
    onOpenChange(next);
  };

  const send = async () => {
    const form = new FormData();
    if (title.trim()) form.append("title", title.trim());
    for (const file of files) form.append("files", file, file.name);
    const controller = new AbortController();
    abort.current = controller;
    setStage({ at: "sending", progress: 0 });
    try {
      const response = await uploadWithProgress<AudiobookAddResponse>(
        `/api/audiobooks${librivox ? `?librivoxId=${encodeURIComponent(librivox.id)}` : ""}`,
        form,
        (progress) => setStage({ at: "sending", progress }),
        controller.signal,
      );
      setStage({ at: "filing", jobId: response.job.id });
    } catch (error) {
      if (controller.signal.aborted) setStage({ at: "choosing" });
      else setStage({ at: "refused", message: errorMessage(error) });
    }
  };

  // Once filed, the lists that show audiobooks are fetched again.
  const filed = result && stage.at === "filing" ? stage.jobId : null;
  useEffect(() => {
    if (!filed) return;
    for (const key of [["documents"], ["collections"], ["catalog", "audiobooks"]]) void client.invalidateQueries({ queryKey: key });
  }, [filed, client]);

  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  const zips = files.filter((file) => file.name.toLowerCase().endsWith(".zip")).length;
  const mixed = zips > 1 || (zips === 1 && files.length > 1);
  const busy = stage.at === "sending" || (stage.at === "filing" && (!job || isActive(job)));
  const failed = stage.at === "filing" && job?.state === "failed";
  const done = Boolean(result);

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent
        title={librivox ? `Add “${librivox.title}”` : "Add an audiobook"}
        description={
          librivox
            ? `Choose the zip you downloaded from LibriVox (${librivox.zipName}). It is unpacked into chapters and kept on this server.`
            : "Choose a zip of a book's chapters, as LibriVox offers them, or the book's audio files together. They become one audiobook with its chapters in order."
        }
      >
        <DialogBody className="grid gap-4">
          <input
            ref={picker}
            type="file"
            multiple={!librivox}
            accept={librivox ? ".zip" : AUDIOBOOK_FILES}
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            data-testid="audiobook-picker"
            onChange={(event) => {
              setFiles(Array.from(event.target.files ?? []));
              setStage({ at: "choosing" });
              event.target.value = "";
            }}
          />
          {stage.at === "choosing" || stage.at === "refused" ? (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <Button onClick={() => picker.current?.click()}>
                  <FileAudio /> {files.length > 0 ? "Choose again" : librivox ? "Choose the zip" : "Choose files"}
                </Button>
                {files.length > 0 ? (
                  <p className="tabular min-w-0 text-small text-ink-muted">
                    {files.length === 1 ? files[0]!.name : plural(files.length, "file")}, {formatBytes(totalBytes)}
                  </p>
                ) : (
                  <p className="text-small text-ink-muted">MP3, M4A, M4B, AAC, Ogg, Opus, FLAC or WAV, or a zip of them.</p>
                )}
              </div>
              {librivox ? null : (
                <div className="grid gap-1.5">
                  <label htmlFor={titleId} className="text-small font-medium text-ink">
                    Title <span className="font-normal text-ink-muted">(optional)</span>
                  </label>
                  <Input id={titleId} value={title} onChange={(event) => setTitle(event.target.value)} maxLength={300} />
                  <p className="text-small text-ink-muted">Left empty, the title comes from the files' own tags, or else the zip's name.</p>
                </div>
              )}
              {mixed ? <Notice tone="warning" icon={<CircleAlert />} title="Choose one zip, or audio files, not both" /> : null}
              {stage.at === "refused" ? (
                <Notice tone="danger" icon={<CircleAlert />} title="Nothing was added">
                  {stage.message}
                </Notice>
              ) : null}
            </>
          ) : null}

          {stage.at === "sending" ? (
            <div className="grid gap-2">
              <p className="tabular text-small text-ink">
                Sending {formatBytes(totalBytes)} to Outpost, {Math.round(stage.progress * 100)}%
              </p>
              <Progress value={stage.progress} label="Sending the files" />
            </div>
          ) : null}

          {stage.at === "filing" && !done && !failed ? (
            <div className="grid gap-2">
              <p className="text-small text-ink">
                {job?.progress.message ? `${job.progress.message}…` : "Unpacking and filing the chapters…"}
              </p>
              <Progress label="Filing the chapters" />
              <p className="text-small text-ink-muted">This carries on if you close this window.</p>
            </div>
          ) : null}

          {failed ? (
            <Notice tone="danger" icon={<CircleAlert />} title="Nothing was added">
              {job?.error ?? "The files could not be filed."}
            </Notice>
          ) : null}

          {result?.collectionId ? (
            <div className="grid gap-3">
              <Notice tone="success" icon={<CircleCheck />} title={`“${result.title}” is in your library`}>
                {plural(result.chapters ?? 0, "chapter")}, in order.{" "}
                <Link
                  to={`/library/collections/${result.collectionId}`}
                  onClick={() => close(false)}
                  className="font-medium text-primary underline underline-offset-2"
                >
                  Listen
                </Link>
              </Notice>
              {result.leftOut && result.leftOut.length > 0 ? (
                <div>
                  <p className="text-small text-ink">Left out of the zip:</p>
                  <ul className="mt-1 grid gap-0.5 text-small text-ink-muted">
                    {result.leftOut.slice(0, 20).map((item) => (
                      <li key={item.path} className="break-all">
                        {item.path}: {item.reason}
                      </li>
                    ))}
                    {result.leftOut.length > 20 ? <li>and {result.leftOut.length - 20} more</li> : null}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}
        </DialogBody>
        <DialogFooter>
          {done || failed ? (
            <>
              <Button onClick={reset}>Add another</Button>
              <Button variant="primary" onClick={() => close(false)}>
                Done
              </Button>
            </>
          ) : (
            <>
              <Button onClick={() => close(false)}>{stage.at === "sending" ? "Stop" : busy ? "Close" : "Cancel"}</Button>
              <Button variant="primary" onClick={send} disabled={files.length === 0 || mixed || busy} loading={busy}>
                Add audiobook
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
