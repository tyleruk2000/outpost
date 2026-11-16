import {
  BACKUP_KEEP_MAX,
  type BackupSchedule,
  type BackupScheduleSettings,
  type BackupStagedResponse,
  formatBytes,
  type JobDto,
  type StoredBackup,
  type StoredBackupsResponse,
  weekdayName,
} from "@outpost/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, CircleAlert, DatabaseBackup, Download, Ellipsis, RotateCcw, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ErrorState, Notice, Rows } from "@/components/page";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { Badge, Progress, Segmented, Select, Skeleton } from "@/components/ui/misc";
import { api, errorMessage } from "@/lib/api";
import { useServerEvent } from "@/lib/events";
import { useStorage } from "@/lib/queries";
import { formatDateTime } from "@/lib/utils";
import { backupSummary, checkText, kindText, retryText, scheduleText, waitingTitle } from "./backup-text";
import { NumberSetting, SettingRow, SettingsSection } from "./parts";

const OFF = "off";
/** Monday first, as the week is written here. */
const DAYS = [1, 2, 3, 4, 5, 6, 0];

/** A time of day that saves when the person leaves the field or presses Enter. */
function TimeSetting({ id, value, disabled, onSave }: { id: string; value: string; disabled: boolean; onSave: (value: string) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(draft)) return setDraft(value);
    if (draft !== value) onSave(draft);
  };
  return (
    <Input
      id={id}
      type="time"
      value={draft}
      disabled={disabled}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => event.key === "Enter" && (event.target as HTMLInputElement).blur()}
      className="tabular w-36"
    />
  );
}

/**
 * Backups made on a schedule and kept on a storage location: where, how often and how
 * many, how things stand, and the backups that are there now.
 */
export function AutomaticBackups() {
  const client = useQueryClient();
  const storage = useStorage();
  const schedule = useQuery({ queryKey: ["backup", "schedule"], queryFn: () => api.get<BackupSchedule>("/api/backup/schedule") });
  const refresh = () => client.invalidateQueries({ queryKey: ["backup"] });
  // A location coming or going, and each step of a backup under way, change what is said here.
  useServerEvent("storage.changed", () => void refresh());
  useServerEvent("job.updated", ({ data }) => {
    if ((data as JobDto | undefined)?.type === "backup.run") void refresh();
  });

  const save = useMutation({
    mutationFn: (patch: Partial<BackupScheduleSettings>) => api.patch<BackupSchedule>("/api/backup/schedule", patch),
    onSuccess: (data) => {
      client.setQueryData(["backup", "schedule"], data);
      return client.invalidateQueries({ queryKey: ["backup", "stored"] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const run = useMutation({
    mutationFn: () => api.post<{ job: JobDto }>("/api/backup/run"),
    onSuccess: refresh,
    onError: (error) => toast.error(errorMessage(error)),
  });

  const data = schedule.data;
  const settings = data?.settings;
  const on = Boolean(settings?.locationId);
  const locations = storage.data?.locations ?? [];
  const busy = save.isPending;

  return (
    <SettingsSection
      id="automatic-backups"
      title="Automatic backups"
      description="The same backup, made on a schedule and kept on storage you choose. Each one is read back and checked after it is written."
    >
      {schedule.isPending ? (
        <div className="grid gap-4" aria-busy>
          <Skeleton className="h-5 w-64" />
          <Skeleton className="h-9 w-full" />
        </div>
      ) : schedule.isError || !data || !settings ? (
        <ErrorState error={schedule.error} onRetry={() => schedule.refetch()} />
      ) : (
        <>
          {on ? (
            <div>
              <p className="text-small text-ink">{backupSummary(data)}</p>
              {data.active ? (
                <div className="mt-2">
                  <Progress tone="lamp" label="Backup" />
                  <p className="mt-1.5 text-small text-ink-muted">
                    {data.active.state === "paused" ? "Paused" : (data.active.progress.message ?? "Waiting for its turn")}
                  </p>
                </div>
              ) : null}
            </div>
          ) : null}

          {data.waiting ? (
            <Notice
              tone={data.waiting.reason === "failed" ? "danger" : "warning"}
              icon={<CircleAlert aria-hidden />}
              title={waitingTitle(data.waiting)}
            >
              {data.waiting.message}
              {data.waiting.reason === "failed" ? ` ${retryText(data.waiting)}` : ""}
            </Notice>
          ) : data.lastFailure && !data.active ? (
            <Notice tone="danger" icon={<CircleAlert aria-hidden />} title={`A backup failed on ${formatDateTime(data.lastFailure.at)}`}>
              {data.lastFailure.message}
            </Notice>
          ) : null}

          <SettingRow
            htmlFor="backup-location"
            label="Keep backups on"
            hint={
              <>
                Outpost writes them to a folder named <span className="font-mono text-[0.8125rem] text-ink">{data.folder}</span> on the
                location you choose, and nowhere else. A backup holds your notes, saved places and settings as they are, not encrypted:
                anyone who can open that folder can read them, so choose storage you trust.
              </>
            }
            control={
              <Select
                id="backup-location"
                value={settings.locationId ?? OFF}
                disabled={busy}
                onChange={(value) => save.mutate({ locationId: value === OFF ? null : value })}
                className="w-64 max-w-full"
                options={[
                  { value: OFF, label: "Off", description: on ? "Backups already made stay where they are" : undefined },
                  ...(settings.locationId && !data.location
                    ? [{ value: settings.locationId, label: "A location that was removed", disabled: true }]
                    : []),
                  ...locations.map((location) => ({
                    value: location.id,
                    label: location.name,
                    description: location.status === "available" ? undefined : "Not connected",
                    disabled: location.status !== "available" && location.id !== settings.locationId,
                  })),
                ]}
              />
            }
          />

          {on ? (
            <>
              <SettingRow
                label="How often"
                hint={`${scheduleText(settings)}, by the clock of the computer Outpost runs on. If Outpost is off or the location is not connected then, the backup is made as soon as both are back.`}
                control={
                  <span className="flex flex-wrap items-center justify-end gap-2">
                    <Segmented
                      label="How often"
                      value={settings.frequency}
                      onChange={(frequency) => save.mutate({ frequency })}
                      options={[
                        { value: "daily", label: "Daily" },
                        { value: "weekly", label: "Weekly" },
                      ]}
                    />
                    {settings.frequency === "weekly" ? (
                      <Select
                        aria-label="Day of the week"
                        value={String(settings.weekday)}
                        disabled={busy}
                        onChange={(value) => save.mutate({ weekday: Number(value) })}
                        className="w-36"
                        options={DAYS.map((day) => ({ value: String(day), label: weekdayName(day) }))}
                      />
                    ) : null}
                  </span>
                }
              />
              <SettingRow
                htmlFor="backup-time"
                label="Time"
                control={<TimeSetting id="backup-time" value={settings.time} disabled={busy} onSave={(time) => save.mutate({ time })} />}
              />
              <SettingRow
                htmlFor="backup-keep"
                label="How many to keep"
                hint={
                  <>
                    The newest {settings.keep} scheduled {settings.keep === 1 ? "backup" : "backups"} and the newest {settings.keep} started
                    by hand are kept. Older ones are deleted after each backup; no other file in the folder is ever touched.
                    {data.right.allowed ? "" : " Keeping fewer can only be set at the computer Outpost runs on."}
                  </>
                }
                control={
                  <NumberSetting
                    id="backup-keep"
                    value={settings.keep}
                    min={1}
                    max={BACKUP_KEEP_MAX}
                    disabled={busy}
                    onSave={(keep) => save.mutate({ keep })}
                    unit="of each"
                  />
                }
              />
              <SettingRow
                label="Make one now"
                hint="Does not change when the next scheduled one is made."
                control={
                  <Button
                    onClick={() => run.mutate()}
                    loading={run.isPending}
                    disabled={Boolean(data.active) || !data.location?.connected}
                    title={data.location?.connected ? undefined : "The location is not connected"}
                  >
                    <DatabaseBackup /> Back up now
                  </Button>
                }
              />
              {data.location ? <StoredBackups schedule={data} locationName={data.location.name} /> : null}
            </>
          ) : null}
        </>
      )}
    </SettingsSection>
  );
}

/** The backups on the chosen location: download one, restore one, delete one. */
function StoredBackups({ schedule, locationName }: { schedule: BackupSchedule; locationName: string }) {
  const client = useQueryClient();
  const stored = useQuery({ queryKey: ["backup", "stored"], queryFn: () => api.get<StoredBackupsResponse>("/api/backup/stored") });
  const [restoring, setRestoring] = useState<StoredBackup>();
  const [deleting, setDeleting] = useState<StoredBackup>();
  const refresh = () => client.invalidateQueries({ queryKey: ["backup"] });
  const allowed = schedule.right.allowed;

  const restore = useMutation({
    mutationFn: (backup: StoredBackup) => api.post<BackupStagedResponse>(`/api/backup/stored/${encodeURIComponent(backup.name)}/restore`),
    onSuccess: (staged) => {
      setRestoring(undefined);
      toast.success(
        staged.supervised
          ? "The backup has been checked. Restart Outpost to switch to it."
          : "The backup has been checked. Stop Outpost and start it again to switch to it.",
      );
      return refresh();
    },
    onError: (error) => {
      setRestoring(undefined);
      toast.error(errorMessage(error));
    },
  });
  const remove = useMutation({
    mutationFn: (backup: StoredBackup) => api.delete(`/api/backup/stored/${encodeURIComponent(backup.name)}`),
    onSuccess: () => {
      setDeleting(undefined);
      return refresh();
    },
    onError: (error) => {
      setDeleting(undefined);
      toast.error(errorMessage(error));
    },
  });

  const backups = stored.data?.backups ?? [];
  return (
    <div>
      <h3 className="text-small font-medium text-ink">Backups on {locationName}</h3>
      {stored.isPending ? (
        <div className="mt-3 grid gap-3" aria-busy>
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : stored.isError ? (
        <div className="mt-3">
          <ErrorState error={stored.error} onRetry={() => stored.refetch()} />
        </div>
      ) : !stored.data.available ? (
        <p className="mt-1 text-small text-ink-muted">They cannot be listed now. {stored.data.reason}</p>
      ) : backups.length === 0 ? (
        <p className="mt-1 text-small text-ink-muted">
          None yet. The first is made at the next scheduled time, or now if you choose <span className="text-ink">Back up now</span>.
        </p>
      ) : (
        <>
          <Rows className="mt-3">
            {backups.map((backup) => {
              const check = checkText[backup.check];
              const made = formatDateTime(backup.createdAt);
              return (
                <li key={backup.name} className="flex items-start gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="tabular text-small font-medium text-ink">{made}</span>
                      <Badge tone={check.tone}>
                        {backup.check === "verified" ? <Check aria-hidden /> : <CircleAlert aria-hidden />} {check.label}
                      </Badge>
                    </p>
                    <p className="tabular mt-0.5 text-small text-ink-muted">
                      {kindText[backup.kind]}
                      <span aria-hidden> · </span>
                      {formatBytes(backup.sizeBytes)}
                      {backup.appVersion ? (
                        <>
                          <span aria-hidden> · </span>
                          made by Outpost {backup.appVersion}
                        </>
                      ) : null}
                    </p>
                    {check.explain ? <p className="mt-0.5 text-small text-ink-muted">{check.explain}</p> : null}
                  </div>
                  <Menu>
                    <MenuTrigger asChild>
                      <Button variant="ghost" size="icon-sm" className="max-md:size-11" aria-label={`Actions for the backup of ${made}`}>
                        <Ellipsis />
                      </Button>
                    </MenuTrigger>
                    <MenuContent>
                      <MenuItem asChild>
                        <a href={`/api/backup/stored/${encodeURIComponent(backup.name)}/download`} download={backup.name}>
                          <Download /> Download
                        </a>
                      </MenuItem>
                      {allowed && backup.check !== "unreadable" ? (
                        <MenuItem onSelect={() => setRestoring(backup)}>
                          <RotateCcw /> Restore this one
                        </MenuItem>
                      ) : null}
                      {allowed ? (
                        <>
                          <MenuSeparator />
                          <MenuItem danger onSelect={() => setDeleting(backup)}>
                            <Trash2 /> Delete
                          </MenuItem>
                        </>
                      ) : null}
                    </MenuContent>
                  </Menu>
                </li>
              );
            })}
          </Rows>
          {allowed ? null : (
            <p className="mt-2 text-small text-ink-muted">Restoring and deleting are offered at the computer Outpost runs on.</p>
          )}
        </>
      )}

      <ConfirmDialog
        open={Boolean(restoring)}
        onOpenChange={(open) => !open && setRestoring(undefined)}
        title="Restore from this backup?"
        description={
          <>
            The backup of <span className="font-medium text-ink">{restoring ? formatDateTime(restoring.createdAt) : ""}</span> will replace
            the notes, settings and library index on this Outpost after a restart. Anything added since then will no longer be here. The
            current data is kept in a dated folder, not deleted.
          </>
        }
        confirmLabel="Check and stage restore"
        confirmVariant="primary"
        loading={restore.isPending}
        onConfirm={() => restoring && restore.mutate(restoring)}
      />
      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(undefined)}
        title="Delete this backup?"
        description={
          <>
            The backup of <span className="font-medium text-ink">{deleting ? formatDateTime(deleting.createdAt) : ""}</span> (
            {formatBytes(deleting?.sizeBytes)}) will be deleted from {locationName}. This cannot be undone.
          </>
        }
        confirmLabel="Delete backup"
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting)}
      />
    </div>
  );
}
