/** The words the Backup settings use for a schedule and for the backups kept under it. */
import { type BackupSchedule, type StoredBackup, weekdayName } from "@outpost/shared";
import { formatStoredTime } from "@/lib/clock";
import { formatDateTime, timeAgo } from "@/lib/utils";

/** "Every day at 03:00" / "Every Sunday at 03:00", or "at 3:00 am" where the 12-hour clock is in use. */
export function scheduleText(settings: BackupSchedule["settings"]): string {
  const time = formatStoredTime(settings.time);
  return settings.frequency === "weekly" ? `Every ${weekdayName(settings.weekday)} at ${time}` : `Every day at ${time}`;
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

/** When a scheduled backup that failed will be tried again. The wait doubles with each failure in a row, so no hour is promised. */
export function retryText(waiting: NonNullable<BackupSchedule["waiting"]>): string {
  return waiting.retryAt
    ? `It will be tried again ${formatDateTime(waiting.retryAt)}, and less often each time it fails.`
    : "It will be tried again later.";
}

/**
 * For a protected backup that today's passphrase does not open: which one does. Nothing
 * is said of the others, whose badge says it all.
 */
export function protectionText(backup: Pick<StoredBackup, "protected" | "currentPassphrase">): string | null {
  if (!backup.protected || backup.currentPassphrase !== false) return null;
  return "Opens with the passphrase that was in use when it was made, not the one in use now.";
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
