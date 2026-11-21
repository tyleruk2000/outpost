/**
 * Settings, Updates: what version this is, what updating can do on this kind of
 * installation, and a newer release from the release page, an upload, or a file on a
 * storage location (a USB stick). Installing is the host's update service's work; this
 * screen hands it over and reports what it did.
 */
import { formatBytes, type InstallKind, type JobDto, type ReleaseFileOnStorage, type UpdateStatus } from "@outpost/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleAlert, Download, RefreshCw, RotateCcw, Trash2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { ErrorState, Notice } from "@/components/page";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Progress, Select, Skeleton } from "@/components/ui/misc";
import { ApiError, api, errorMessage } from "@/lib/api";
import { useServerEvent } from "@/lib/events";
import { notify } from "@/lib/notify";
import { formatDateTime } from "@/lib/utils";
import { SettingRow, SettingsSection } from "./parts";

/** What updating from here can do, said plainly for each kind of installation. */
export const installText: Record<InstallKind, { title: string; body: string }> = {
  "docker-helper": {
    title: "Docker, with the update service",
    body: "Outpost checks a release, makes a backup, and hands it to the update service on this computer, which starts the new version and goes back to this one if it does not start healthy within three minutes.",
  },
  docker: {
    title: "Docker, without the update service",
    body: "A container cannot replace itself, so Outpost can check a release here but not install it. On a Raspberry Pi, run deploy/pi/install.sh again to add the update service. Otherwise, load the image on the host yourself: the steps are in the guide.",
  },
  portable: {
    title: "The portable app",
    body: "Outpost cannot replace the app it is running from. Copy the new portable app over the old one while Outpost is stopped; your library on the drive is kept.",
  },
  source: {
    title: "Run from a copy of the source",
    body: "Update the checkout (git pull, then pnpm install) and start Outpost again. Nothing here installs anything.",
  },
};

async function sendRelease(file: File): Promise<{ job: JobDto }> {
  const response = await fetch("/api/update/upload", {
    method: "POST",
    headers: { "X-Outpost-Request": "1", "Content-Type": "application/vnd.outpost.update" },
    body: file,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new ApiError(
      response.status,
      body.error?.code ?? "http",
      body.error?.message ?? "The release file was not accepted.",
      body.error?.details,
    );
  return body;
}

export function UpdateSection() {
  const client = useQueryClient();
  const status = useQuery({ queryKey: ["update", "status"], queryFn: () => api.get<UpdateStatus>("/api/update/status") });
  const files = useQuery({
    queryKey: ["update", "files"],
    queryFn: () => api.get<{ files: ReleaseFileOnStorage[] }>("/api/update/files"),
    enabled: Boolean(status.data?.keyed),
  });
  const refresh = () => client.invalidateQueries({ queryKey: ["update"] });
  useServerEvent("job.updated", ({ data }) => {
    if ((data as JobDto | undefined)?.type?.startsWith("update.")) void refresh();
  });
  useServerEvent("storage.changed", () => void client.invalidateQueries({ queryKey: ["update", "files"] }));
  const fileRef = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState<string>();
  const [confirming, setConfirming] = useState(false);

  const onError = (error: unknown) => notify.error(errorMessage(error));
  const check = useMutation({
    mutationFn: () => api.post<UpdateStatus>("/api/update/check"),
    onSuccess: (data) => client.setQueryData(["update", "status"], data),
    onError,
  });
  const fetchRelease = useMutation({ mutationFn: () => api.post("/api/update/download"), onSuccess: refresh, onError });
  const upload = useMutation({ mutationFn: sendRelease, onSuccess: refresh, onError });
  const fromStorage = useMutation({
    mutationFn: (file: ReleaseFileOnStorage) =>
      api.post("/api/update/from-storage", { locationId: file.locationId, relPath: file.relPath }),
    onSuccess: refresh,
    onError,
  });
  const apply = useMutation({
    mutationFn: () => api.post("/api/update/apply"),
    onSuccess: () => {
      setConfirming(false);
      toast.success("Backing up, then handing the update to the update service. Outpost restarts on its own.");
      return refresh();
    },
    onError: (error) => {
      setConfirming(false);
      onError(error);
    },
  });
  const discard = useMutation({ mutationFn: () => api.delete("/api/update/staged"), onSuccess: refresh, onError });
  const restoreBefore = useMutation({
    mutationFn: () => api.post("/api/update/restore-before"),
    onSuccess: () => {
      toast.success("The backup from before the update is checked and waits for a restart (Settings, Backup).");
      return client.invalidateQueries({ queryKey: ["backup"] });
    },
    onError,
  });

  const data = status.data;
  const stored = files.data?.files ?? [];
  const key = (file: ReleaseFileOnStorage) => `${file.locationId}/${file.relPath}`;
  const chosen = stored.find((file) => key(file) === picked) ?? stored[0];
  const busy = Boolean(data?.active) || Boolean(data?.waiting);
  const allowed = data?.right.allowed ?? false;

  return (
    <SettingsSection
      id="updates"
      title="Updates"
      description="A newer version from the release page, or from a release file for a house with no internet. Each is checked against Outpost's release key before anything is installed."
    >
      {status.isPending ? (
        <div className="grid gap-3" aria-busy>
          <Skeleton className="h-5 w-64" />
          <Skeleton className="h-9 w-full" />
        </div>
      ) : status.isError || !data ? (
        <ErrorState error={status.error} onRetry={() => status.refetch()} />
      ) : (
        <>
          <div>
            <p className="text-small text-ink">
              This is Outpost <span className="tabular font-medium">{data.current}</span>. {installText[data.install].title}.
            </p>
            <p className="mt-0.5 text-small text-ink-muted">{installText[data.install].body}</p>
          </div>

          {data.lastResult ? (
            <Notice
              tone={data.lastResult.outcome === "ok" ? "success" : "warning"}
              icon={data.lastResult.outcome === "ok" ? undefined : <CircleAlert aria-hidden />}
              title={
                data.lastResult.outcome === "ok"
                  ? `Updated to ${data.lastResult.release} on ${formatDateTime(data.lastResult.at)}`
                  : data.lastResult.outcome === "rolled-back"
                    ? `The update to ${data.lastResult.release} was undone`
                    : `The update to ${data.lastResult.release} was not installed`
              }
              action={
                data.lastResult.outcome === "rolled-back" && data.lastResult.backupName && allowed ? (
                  <Button size="sm" onClick={() => restoreBefore.mutate()} loading={restoreBefore.isPending}>
                    <RotateCcw /> Restore the backup from before
                  </Button>
                ) : undefined
              }
            >
              {data.lastResult.message}
              {data.lastResult.outcome === "rolled-back"
                ? " The new version may have changed the database as it started; if anything looks wrong, restore the backup made just before."
                : ""}
            </Notice>
          ) : null}

          {!data.keyed ? (
            <Notice tone="info" icon={<CircleAlert aria-hidden />} title="Releases cannot be checked yet">
              This build has no release key, so no release can be checked and nothing can be installed from here. Update the way this
              installation is updated by hand.
            </Notice>
          ) : (
            <>
              {data.waiting ? (
                <Notice
                  tone={data.waiting.silent ? "warning" : "info"}
                  icon={<CircleAlert aria-hidden />}
                  title={`Installing Outpost ${data.waiting.release}`}
                >
                  {data.waiting.silent
                    ? `Handed to the update service at ${formatDateTime(data.waiting.since)}, and it has not answered. See that it is installed (deploy/pi/install.sh) and look at its log: journalctl -u outpost-update.`
                    : "The update service is loading the new version. Outpost stops and starts again on its own; this page reconnects when it is back."}
                </Notice>
              ) : null}
              {data.active ? (
                <div>
                  <Progress tone="lamp" label={data.active.title} />
                  <p className="mt-1.5 text-small text-ink-muted">{data.active.progress.message ?? "Waiting for its turn"}</p>
                </div>
              ) : null}

              {data.staged ? (
                <div className="grid gap-2">
                  <p className="text-small text-ink">
                    Outpost <span className="tabular font-medium">{data.staged.release}</span> is checked and ready
                    {data.staged.publishedAt ? `, published ${data.staged.publishedAt.slice(0, 10)}` : ""}: signed by the release key, and
                    its image ({formatBytes(data.staged.bytes)}) matches its checksum.
                  </p>
                  {data.staged.notes ? <p className="text-small text-ink-muted">{data.staged.notes}</p> : null}
                  <div className="flex flex-wrap gap-2">
                    {data.install === "docker-helper" && allowed ? (
                      <Button variant="primary" onClick={() => setConfirming(true)} disabled={busy}>
                        Install {data.staged.release}
                      </Button>
                    ) : null}
                    <Button variant="ghost" onClick={() => discard.mutate()} disabled={Boolean(data.waiting)} loading={discard.isPending}>
                      <Trash2 /> Remove it
                    </Button>
                  </div>
                  {data.install === "docker" ? (
                    <p className="text-small text-ink-muted">
                      To install it by hand on the host:{" "}
                      <span className="font-mono text-[0.8125rem] text-ink [overflow-wrap:anywhere]">
                        docker load -i image.tar.gz, then OUTPOST_IMAGE={data.staged.image} in .env and docker compose up -d --no-build
                      </span>
                      . The image is in the update folder of Outpost's data volume.
                    </p>
                  ) : null}
                </div>
              ) : null}

              {allowed ? null : (
                <p className="text-small text-ink-muted">
                  Updating replaces the program everyone uses, so it is offered at the computer Outpost runs on, or anywhere when Outpost
                  was started with {data.right.option}=true.
                </p>
              )}

              <SettingRow
                label="From the release page"
                hint={
                  data.latest
                    ? data.latest.release
                      ? data.latest.newer
                        ? `Outpost ${data.latest.release} is out. Checked ${formatDateTime(data.latest.at)}.`
                        : `This is the newest release. Checked ${formatDateTime(data.latest.at)}.`
                      : `The release page could not be checked: ${data.latest.message}`
                    : "Needs the internet. Outpost asks only when you press, and nothing is fetched until you choose to."
                }
                control={
                  data.latest?.newer && allowed && !data.staged ? (
                    <Button onClick={() => fetchRelease.mutate()} loading={fetchRelease.isPending} disabled={busy}>
                      <Download /> Fetch {data.latest.release?.release}
                    </Button>
                  ) : (
                    <Button onClick={() => check.mutate()} loading={check.isPending}>
                      {check.isPending ? null : <RefreshCw />} Check for a newer version
                    </Button>
                  )
                }
              />

              {allowed ? (
                <>
                  <SettingRow
                    label="From a release file"
                    hint="A file ending .outpost-update, for this kind of computer. It is checked before it is kept."
                    control={
                      <>
                        <Button onClick={() => fileRef.current?.click()} loading={upload.isPending} disabled={busy}>
                          <Upload /> Choose a file
                        </Button>
                        <input
                          ref={fileRef}
                          type="file"
                          accept=".outpost-update"
                          className="sr-only"
                          aria-label="Release file"
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            event.target.value = "";
                            if (file) upload.mutate(file);
                          }}
                        />
                      </>
                    }
                  />
                  <SettingRow
                    htmlFor="update-stored"
                    label="From a USB stick or other storage"
                    hint={
                      stored.length === 0
                        ? "None found. Put the file at the top of a connected storage location, or in a folder named outpost-updates on it."
                        : "Release files found on connected storage locations."
                    }
                    control={
                      stored.length === 0 ? null : (
                        <span className="flex flex-wrap items-center justify-end gap-2">
                          <Select
                            id="update-stored"
                            className="w-64 max-w-full"
                            value={chosen ? key(chosen) : undefined}
                            onChange={setPicked}
                            options={stored.map((file) => ({
                              value: key(file),
                              label: file.relPath.split("/").at(-1) ?? file.relPath,
                              description: `${file.locationName}, ${formatBytes(file.bytes)}`,
                            }))}
                          />
                          <Button onClick={() => chosen && fromStorage.mutate(chosen)} loading={fromStorage.isPending} disabled={busy}>
                            Check it
                          </Button>
                        </span>
                      )
                    }
                  />
                </>
              ) : null}
            </>
          )}
        </>
      )}

      <ConfirmDialog
        open={confirming}
        onOpenChange={(open) => !open && !apply.isPending && setConfirming(false)}
        title={`Install Outpost ${data?.staged?.release ?? ""}?`}
        description="A backup is made first and kept in Outpost's data folder. Outpost then stops for a minute or two while the new version starts; everyone using it is cut off meanwhile. If the new version does not start healthy within three minutes, this version is started again."
        confirmLabel="Back up and install"
        confirmVariant="primary"
        loading={apply.isPending}
        onConfirm={() => apply.mutate()}
      />
    </SettingsSection>
  );
}
