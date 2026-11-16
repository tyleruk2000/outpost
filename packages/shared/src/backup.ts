import type { JobDto } from "./common.ts";

/**
 * Whether this request may do the things that replace or remove what a person keeps:
 * restore a backup, delete a stored one, or keep fewer of them. Outpost has no
 * accounts, so the rule is about where the request comes from, as it is for "erase
 * everything": the computer Outpost runs on, or anywhere if the start-up option is set.
 */
export interface BackupRight {
  allowed: boolean;
  reason: "local" | "option" | "remote";
  /** The start-up option that allows it from other devices. */
  option: string;
}

export interface BackupStatus {
  restorePending: boolean;
  /** Folders of data kept from before earlier restores. */
  previousData: string[];
  /** Outpost can restart itself here (Docker, or the portable launcher). */
  supervised: boolean;
  /** Whether this device may restore, delete stored backups, or keep fewer of them. */
  right: BackupRight;
}

export type BackupFrequency = "daily" | "weekly";

/** What a person chooses for automatic backups. Off until a location is chosen. */
export interface BackupScheduleSettings {
  /** The storage location backups are kept on, or null while automatic backups are off. */
  locationId: string | null;
  frequency: BackupFrequency;
  /** Time of day by the clock of the computer Outpost runs on, as "HH:MM". */
  time: string;
  /** Day of the week for a weekly backup: 0 is Sunday. */
  weekday: number;
  /** How many backups of each kind are kept. */
  keep: number;
}

export const BACKUP_KEEP_DEFAULT = 7;
export const BACKUP_KEEP_MAX = 60;

/** A scheduled backup that is due and has not been made. */
export interface BackupWaiting {
  /** When it should have run. */
  dueAt: number;
  /**
   * `not_connected`: the location was not connected. `location_removed`: it is no longer
   * one of this Outpost's locations. `failed`: a run was tried and failed.
   */
  reason: "not_connected" | "location_removed" | "failed";
  /** Why, in words written for a person. */
  message: string;
}

export interface BackupSchedule {
  settings: BackupScheduleSettings;
  /** The folder inside the location that backups are written to. */
  folder: string;
  /** The chosen location as it is now, or null when none is chosen or it has been removed. */
  location: { id: string; name: string; connected: boolean } | null;
  /** When the newest backup that passed its check was written to a location, by any means. */
  lastBackupAt: number | null;
  /** When the next scheduled backup is due, or null while automatic backups are off. */
  nextRunAt: number | null;
  waiting: BackupWaiting | null;
  /** The last run that failed, until one succeeds. */
  lastFailure: { at: number; message: string } | null;
  /** A backup that is queued or being written now. */
  active: JobDto | null;
  right: BackupRight;
}

/** How a stored backup was started. Each kind is counted separately when old ones are removed. */
export type StoredBackupKind = "scheduled" | "manual";

export interface StoredBackup {
  /** Its file name in the backup folder; also how it is addressed in the API. */
  name: string;
  kind: StoredBackupKind;
  createdAt: number;
  sizeBytes: number;
  /** The version of Outpost that made it, or null when the file cannot be read. */
  appVersion: string | null;
  /**
   * `verified`: read back after it was written, and the database inside passed its
   * check. `unverified`: written, but no record that it passed (the check failed, was
   * cut off, or the file has changed size since). `unreadable`: not readable as a backup.
   */
  check: "verified" | "unverified" | "unreadable";
  checkedAt: number | null;
}

export interface StoredBackupsResponse {
  /** False when no location is chosen or it is not connected; `reason` then says which. */
  available: boolean;
  reason: string | null;
  backups: StoredBackup[];
}

export interface BackupStagedResponse {
  staged: true;
  createdAt: string;
  appVersion: string;
  supervised: boolean;
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
export const weekdayName = (weekday: number): string => WEEKDAYS[weekday] ?? "Sunday";

/**
 * The scheduled time at or before `now`: the most recent moment a backup was due.
 * Times are local to whoever calls this; the server calls it with its own clock.
 */
export function previousBackupSlot(settings: Pick<BackupScheduleSettings, "frequency" | "time" | "weekday">, now: number): number {
  const [hours, minutes] = settings.time.split(":").map(Number) as [number, number];
  const slot = new Date(now);
  slot.setHours(hours, minutes, 0, 0);
  if (settings.frequency === "weekly") slot.setDate(slot.getDate() - ((slot.getDay() - settings.weekday + 7) % 7));
  if (slot.getTime() > now) slot.setDate(slot.getDate() - (settings.frequency === "weekly" ? 7 : 1));
  return slot.getTime();
}

/** The first scheduled time after `now`. */
export function nextBackupSlot(settings: Pick<BackupScheduleSettings, "frequency" | "time" | "weekday">, now: number): number {
  const previous = new Date(previousBackupSlot(settings, now));
  previous.setDate(previous.getDate() + (settings.frequency === "weekly" ? 7 : 1));
  return previous.getTime();
}
