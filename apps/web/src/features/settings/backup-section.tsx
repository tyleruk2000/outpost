import type { BackupStatus } from "@outpost/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, RotateCcw, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Notice } from "@/components/page";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { ApiError, api, errorMessage } from "@/lib/api";
import { SettingRow, SettingsSection } from "./parts";

export function BackupSection() {
  const client = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [chosen, setChosen] = useState<File>();
  const status = useQuery({ queryKey: ["backup", "status"], queryFn: () => api.get<BackupStatus>("/api/backup/status") });
  const refresh = () => client.invalidateQueries({ queryKey: ["backup"] });

  const restore = useMutation({
    mutationFn: async (file: File) => {
      const response = await fetch("/api/backup/restore", { method: "POST", headers: { "X-Outpost-Request": "1", "Content-Type": "application/zip" }, body: file });
      const body = await response.json();
      if (!response.ok) throw new ApiError(response.status, body.error?.code ?? "http", body.error?.message ?? "The backup could not be read.");
      return body;
    },
    onSuccess: () => {
      setChosen(undefined);
      return refresh();
    },
    onError: (error) => {
      setChosen(undefined);
      toast.error(errorMessage(error));
    },
  });
  const cancel = useMutation({ mutationFn: () => api.delete("/api/backup/restore"), onSuccess: refresh });
  const restart = useMutation({
    mutationFn: () => api.post("/api/system/restart"),
    onSuccess: () => {
      toast.message("Outpost is restarting. This page will reconnect by itself.");
      window.setTimeout(() => window.location.reload(), 6000);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <SettingsSection
      id="backup"
      title="Backup"
      description="Notes, tags, saved places, settings and the library index. Collections, maps and original documents stay where they are stored and are not copied."
    >
      <SettingRow
        label="Save a backup"
        hint="One .zip file. Keep it somewhere other than this device."
        control={
          <Button asChild>
            <a href="/api/backup/download" download>
              <Download /> Download backup
            </a>
          </Button>
        }
      />
      <SettingRow
        label="Restore from a backup"
        hint="Replaces what this Outpost holds with the backup. What is here now is kept in a dated folder in the data directory."
        control={
          <>
            <Button onClick={() => fileRef.current?.click()} loading={restore.isPending}>
              <Upload /> Choose backup
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".zip,application/zip"
              className="sr-only"
              tabIndex={-1}
              aria-label="Backup file"
              onChange={(event) => {
                setChosen(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
          </>
        }
      />
      {status.data?.restorePending ? (
        <Notice
          tone="warning"
          icon={<RotateCcw />}
          title="A restore is waiting for a restart"
          action={
            <span className="flex shrink-0 gap-2">
              <Button size="sm" variant="ghost" onClick={() => cancel.mutate()} loading={cancel.isPending}>
                Cancel restore
              </Button>
              {status.data.supervised ? (
                <Button size="sm" variant="primary" onClick={() => restart.mutate()} loading={restart.isPending}>
                  Restart now
                </Button>
              ) : null}
            </span>
          }
        >
          {status.data.supervised
            ? "The backup has been checked. Restart Outpost to switch to it."
            : "The backup has been checked. Stop Outpost and start it again to switch to it."}
        </Notice>
      ) : null}
      {status.data && status.data.previousData.length > 0 ? (
        <p className="text-small text-ink-muted">
          Data from before earlier restores is kept in the data directory: <span className="font-mono text-[0.8125rem] text-ink">{status.data.previousData.join(", ")}</span>. Delete those folders yourself when you no longer need them.
        </p>
      ) : null}
      <ConfirmDialog
        open={Boolean(chosen)}
        onOpenChange={(open) => !open && setChosen(undefined)}
        title="Restore from this backup?"
        description={
          <>
            <span className="font-medium text-ink">{chosen?.name}</span> will replace the notes, settings and library index on this Outpost after a restart. The current data is kept in a dated folder, not deleted.
          </>
        }
        confirmLabel="Check and stage restore"
        confirmVariant="primary"
        loading={restore.isPending}
        onConfirm={() => chosen && restore.mutate(chosen)}
      />
    </SettingsSection>
  );
}
