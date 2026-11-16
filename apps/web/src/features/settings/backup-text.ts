/** The words the Backup settings use for a schedule and for the backups kept under it. */
import { type BackupSchedule, type StoredBackup, weekdayName } from "@outpost/shared";
import { formatDateTime, timeAgo } from "@/lib/utils";

/** "Every day at 03:00" / "Every Sunday at 03:00". */
export function scheduleText(settings: BackupSchedule["settings"]): string {
  return settings.frequency === "weekly" ? `Every ${weekdayName(settings.weekday)} at ${settings.time}` : `Every day at ${settings.time}`;
}

/**
 * One or two plain sentences on where things stand: when the last backup was made, and
 * when the next is due. Why one that was due has not been made is said separately,
 * beside it, in the server's own words.
 */
export function backupSummary(schedule: BackupSchedule): string {
  if (!schedule.settings.locationId) return "Automatic backups are off.";
  const last = schedule.lastBackupAt ? `Last backup ${timeAgo(schedule.lastBackupAt)}.` : "No backup has been made yet.";
  if (schedule.active) return `${last} One is being made now.`;
  // While one is owed, "next" would be a promise the screen cannot keep.
  if (schedule.waiting || !schedule.nextRunAt) return last;
  return `${last} Next one ${formatDateTime(schedule.nextRunAt)}.`;
}

/** What is said above the reason a scheduled backup has not been made. */
export function waitingTitle(waiting: NonNullable<BackupSchedule["waiting"]>): string {
  const due = formatDateTime(waiting.dueAt);
  return waiting.reason === "failed" ? `The backup due ${due} failed` : `The backup due ${due} has not been made`;
}

export const kindText: Record<StoredBackup["kind"], string> = { scheduled: "Scheduled", manual: "Started by hand" };

export const checkText: Record<StoredBackup["check"], { label: string; tone: "success" | "warning" | "danger"; explain: string | null }> = {
  verified: { label: "Verified", tone: "success", explain: null },
  unverified: {
    label: "Not verified",
    tone: "warning",
    explain: "Its check did not finish or did not pass, or the file has changed since. It is not counted as a backup.",
  },
  unreadable: {
    label: "Cannot be read",
    tone: "danger",
    explain: "It has the name of a backup but does not read as one. Outpost leaves it alone.",
  },
};
