/**
 * The status screen's lines: each thing that can go wrong with the device Outpost runs
 * on, how it stands, and what to do about it, in plain words. The figures come from the
 * modules that own them (storage, database, backups, jobs) and from the system
 * (`hardware.ts`); the event-loop delay from `vitals.ts`.
 */
import type { DatabaseStatus, DeviceCheck, RestoreTestResult, StorageLocation } from "@outpost/shared";
import { formatBytes } from "@outpost/shared";
import type { CardWear, Memory, Temperature, Throttling } from "./hardware.ts";

const DAY = 24 * 60 * 60 * 1000;

/** "12 minutes", "5 hours", "3 days": how long ago, in the largest unit that fits. */
export function ageWords(ms: number): string {
  const minutes = Math.max(0, Math.round(ms / 60_000));
  if (minutes < 1) return "less than a minute";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} hour${hours === 1 ? "" : "s"}`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"}`;
}

const percent = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

/** Below this much free a location gets a word of warning; below the reserve, writing to it stops. */
const LOW_FREE_BYTES = 2_000_000_000;
const LOW_FREE_SHARE = 0.05;

export function storageChecks(locations: StorageLocation[], reserveBytes: number): DeviceCheck[] {
  return locations.map((location): DeviceCheck => {
    const base = {
      id: `storage:${location.id}`,
      group: "storage" as const,
      title: location.name,
      link: { to: "/storage", label: "Storage" },
    };
    const network = location.kind === "network";
    if (location.status !== "available") {
      return {
        ...base,
        state: location.isDefault ? "problem" : "attention",
        summary: location.statusDetail ?? (network ? "The network share is not answering." : "Not connected."),
        advice: network
          ? "See that the NAS or the computer sharing it is switched on and on the same network. Outpost picks the location up again by itself as soon as it answers."
          : location.isDefault
            ? "This is where new downloads go. Connect the drive again, or choose another location as the default on the Storage screen."
            : "Connect the drive again. What is kept on it is unavailable until then; nothing has been lost.",
      };
    }
    const free = location.freeBytes;
    const total = location.totalBytes;
    const room =
      free !== null && total
        ? `${formatBytes(free)} free of ${formatBytes(total)} (${percent(free, total)}% free)`
        : "Free space not known";
    const answering = network ? "The network share is answering. " : "Connected. ";
    if (free !== null && free < reserveBytes)
      return {
        ...base,
        state: "problem",
        summary: `${answering}${room}.`,
        advice: `Nothing more can be written here: Outpost always leaves ${formatBytes(reserveBytes)} free. Free some space under Storage, Manage and clean up, or move collections to another location.`,
      };
    if (free !== null && total && free < LOW_FREE_BYTES && free / total < LOW_FREE_SHARE)
      return {
        ...base,
        state: "attention",
        summary: `${answering}${room}.`,
        advice: "Space is running low. Large downloads may not fit; Storage, Manage and clean up shows what takes the most room.",
      };
    return { ...base, state: "good", summary: `${answering}${room}.`, advice: null };
  });
}

export function databaseCheck(database: DatabaseStatus): DeviceCheck {
  const base = { id: "database", group: "data" as const, title: "Database", link: { to: "/storage", label: "Storage" } };
  const size = `${formatBytes(database.file.bytes + database.file.walBytes)}`;
  const check = database.lastCheck;
  if (check && !check.ok)
    return {
      ...base,
      state: "problem",
      summary: `${size}. The last check, ${ageWords(Date.now() - check.at)} ago, found damage.`,
      advice:
        "Restore the last backup from before the damage (Settings, Backup), or run the full check again on the Storage screen to see what it finds.",
    };
  if (database.disk.low)
    return {
      ...base,
      state: "problem",
      summary: `${size}. The drive it is on has ${formatBytes(database.disk.freeBytes)} free.`,
      advice: "The database needs room to write. Free space on the drive Outpost keeps its data on.",
    };
  if (database.schema.state === "ahead")
    return {
      ...base,
      state: "attention",
      summary: `${size}. It was last opened by a newer version of Outpost.`,
      advice: "Update Outpost to the version that wrote it, or some things may not show.",
    };
  // Never "Fine" for a file nobody has checked: it is said to be not checked yet, with the check offered.
  if (!check)
    return {
      ...base,
      state: "unchecked",
      summary: `${size}. Not checked for damage yet.`,
      advice: "A check reads the whole file and takes a moment; everything carries on as usual while it runs.",
    };
  return {
    ...base,
    state: "good",
    summary: `${size}. Last checked ${ageWords(Date.now() - check.at)} ago: no damage found.`,
    advice: null,
  };
}

/** A backup older than this gets a word: a little over the schedule's own gap, or a week with none. */
function oldAfter(frequency: BackupOverview["frequency"]): number {
  return frequency === "daily" ? 2 * DAY : frequency === "weekly" ? 8 * DAY : 7 * DAY;
}

/** What the status screen is told about backups on a schedule. */
export interface BackupOverview {
  frequency: "daily" | "weekly" | null;
  locationName: string | null;
  missing: { dueAt: number } | null;
  away: { dueAt: number; locationName: string; madeAt: number | null } | null;
  kept: { at: number; verified: number; newestAt: number | null; oldestAt: number | null } | null;
  restoreTest: RestoreTestResult | null;
}

const NO_SCHEDULE: BackupOverview = { frequency: null, locationName: null, missing: null, away: null, kept: null, restoreTest: null };

export function backupCheck(
  stored: DatabaseStatus["backup"],
  downloadedAt: number | null,
  now: number,
  overview: BackupOverview = NO_SCHEDULE,
): DeviceCheck {
  const base = { id: "backup", group: "data" as const, title: "Last backup", link: { to: "/settings#backup", label: "Settings, Backup" } };
  const last = Math.max(stored.lastAt ?? 0, downloadedAt ?? 0) || null;
  const where = overview.locationName ?? "a storage location";
  const kept =
    overview.kept && overview.kept.verified > 0 && overview.kept.oldestAt !== null
      ? ` ${overview.kept.verified} kept on ${where}, the oldest ${ageWords(now - overview.kept.oldestAt)} old.`
      : "";
  // The location was away when a backup was due, and it has not been made since.
  if (overview.missing && overview.locationName)
    return {
      ...base,
      state: "attention",
      summary: `The backup due ${ageWords(now - overview.missing.dueAt)} ago was not made: ${overview.locationName} was not connected.${
        last === null ? "" : ` The last backup was ${ageWords(now - last)} ago.`
      }`,
      advice: `It is made as soon as ${overview.locationName} is back, and nothing is written anywhere else meanwhile. See that the NAS or drive is switched on and connected.`,
    };
  if (last === null)
    return {
      ...base,
      state: "attention",
      summary: "No backup has been made.",
      advice:
        "A backup holds your pages, places, settings and library records. Save one from Settings, Backup, or have one made every night on another drive under Automatic backups.",
    };
  const how = last === stored.lastAt ? `to ${where}` : "downloaded to a device";
  const age = now - last;
  const late =
    overview.away?.madeAt && now - overview.away.madeAt < oldAfter(overview.frequency)
      ? ` It was made late: ${overview.away.locationName} was not connected when it was due.`
      : "";
  const schedule = stored.scheduled ? ` Made ${overview.frequency === "weekly" ? "every week" : "every night"}.` : "";
  const summary = `${ageWords(age)} ago, ${how}.${schedule}${kept}${late}`;
  if (age > oldAfter(overview.frequency))
    return {
      ...base,
      state: "attention",
      summary,
      advice: stored.scheduled
        ? "Scheduled backups have not been made for longer than they should have been. Settings, Automatic backups says why."
        : "Make a new one, or have them made on a schedule under Settings, Automatic backups.",
    };
  return { ...base, state: "good", summary, advice: null };
}

/** A restore test older than this gets a word: what was true of last season's backups says little about tonight's. */
const RESTORE_TEST_OLD_MS = 90 * DAY;

export function restoreTestCheck(overview: BackupOverview, now: number): DeviceCheck | null {
  // Nothing to test until backups are kept on a location.
  if (overview.frequency === null && overview.restoreTest === null) return null;
  const base = {
    id: "restore-test",
    group: "data" as const,
    title: "Restore tested",
    link: { to: "/settings#automatic-backups", label: "Settings, Automatic backups" },
  };
  const test = overview.restoreTest;
  if (!test)
    return {
      ...base,
      state: "attention",
      summary: "No backup has been test-restored yet.",
      advice:
        "Open the newest backup with Test a restore in its menu. It is read into a scratch copy and counted; nothing here is changed.",
    };
  const ago = ageWords(now - test.at);
  if (!test.ok)
    return {
      ...base,
      state: "problem",
      summary: `${ago} ago, the backup of ${ageWords(now - test.backupCreatedAt)} ago did not restore: ${test.problem ?? "it could not be read."}`,
      advice: "Make a new backup with Back up now and test that one. If it fails too, see that the drive or NAS it is on is sound.",
    };
  const counts = test.counts.map((entry) => `${entry.inBackup} ${entry.what.toLowerCase()}`).join(", ");
  const summary = `${ago} ago, on the backup of ${ageWords(now - test.backupCreatedAt)} ago: it opened and its database is sound. It holds ${counts}.`;
  if (now - test.at > RESTORE_TEST_OLD_MS)
    return { ...base, state: "attention", summary, advice: "Test the newest backup again: it takes a minute and changes nothing." };
  return { ...base, state: "good", summary, advice: null };
}

export function cardChecks(cards: CardWear[]): DeviceCheck[] {
  return cards.map((card): DeviceCheck => {
    const base = { id: `card:${card.device}`, group: "device" as const, title: card.type === "SD" ? "SD card" : "Memory card", link: null };
    if (card.lifeUsedPercent === null && card.reserve === null)
      return {
        ...base,
        state: "unknown",
        summary: `${card.type === "SD" ? "SD cards do not report their wear" : "This card does not report its wear"}, so how worn it is cannot be said.`,
        advice:
          "Cards wear out with writing and can fail without warning. Keep backups on another drive, and keep large collections on an SSD.",
      };
    const [from, to] = card.lifeUsedPercent ?? [null, null];
    const used = from === null ? "" : `About ${from} to ${to}% of its life used, by its own estimate. `;
    const reserve =
      card.reserve === "urgent"
        ? "90% of its spare blocks are used."
        : card.reserve === "warning"
          ? "80% of its spare blocks are used."
          : card.reserve === "normal"
            ? "Its spare blocks are fine."
            : "";
    const state = card.reserve === "urgent" ? "problem" : card.reserve === "warning" || (to ?? 0) >= 90 ? "attention" : "good";
    return {
      ...base,
      state,
      summary: `${used}${reserve}`.trim(),
      advice: state === "good" ? null : "Make a backup now, and plan to move Outpost's data to a new card or an SSD.",
    };
  });
}

export function memoryCheck(memory: Memory): DeviceCheck {
  const base = { id: "memory", group: "device" as const, title: "Memory", link: null };
  const outpost = `Outpost uses ${formatBytes(memory.processBytes)}`;
  if (memory.limitBytes !== null && memory.usedInLimitBytes !== null) {
    const share = memory.usedInLimitBytes / memory.limitBytes;
    const summary = `${outpost}; its container ${formatBytes(memory.usedInLimitBytes)} of the ${formatBytes(memory.limitBytes)} it is allowed.`;
    if (share > 0.9)
      return {
        ...base,
        state: "attention",
        summary,
        advice:
          "Near the container's limit, the system stops Outpost and Docker starts it again. Raise OUTPOST_MEMORY_LIMIT in the .env file if this happens while indexing or searching by meaning.",
      };
    return { ...base, state: "good", summary, advice: null };
  }
  if (!memory.availableKnown)
    return {
      ...base,
      state: "unknown",
      summary: `${outpost}, of the ${formatBytes(memory.totalBytes)} the computer has. This system does not say how much more programs could be given: it counts files it keeps in memory, which it gives back when asked, as used.`,
      advice: null,
    };
  const summary = `${outpost}. ${formatBytes(memory.availableBytes)} of ${formatBytes(memory.totalBytes)} is free for programs.`;
  if (memory.availableBytes / memory.totalBytes < 0.1)
    return {
      ...base,
      state: "attention",
      summary,
      advice:
        "The computer is short of memory and may slow down. Close other programs on it, or turn off search by meaning if it is not used.",
    };
  return { ...base, state: "good", summary, advice: null };
}

export function temperatureCheck(temperature: Temperature | null, throttling: Throttling | null): DeviceCheck {
  const base = { id: "temperature", group: "device" as const, title: "Temperature", link: null };
  if (!temperature) return { ...base, state: "unknown", summary: "This system does not say how warm the processor is.", advice: null };
  const summary = `${temperature.celsius.toFixed(1)} °C at the processor.`;
  // Raspberry Pi: the cores are slowed between 80 °C and 85 °C, and the graphics too at 85 °C (see hardware.ts).
  if (temperature.celsius >= 85 || throttling?.throttledNow)
    return {
      ...base,
      state: "problem",
      summary: `${summary} It is being slowed down to cool.`,
      advice: "Give it air: a case with a fan or a heatsink, out of the sun, not in a closed cupboard.",
    };
  if (temperature.celsius >= 80)
    return {
      ...base,
      state: "attention",
      summary: `${summary} Hot enough to be slowed down.`,
      advice: "Give it air: a case with a fan or a heatsink, out of the sun, not in a closed cupboard.",
    };
  return { ...base, state: "good", summary, advice: null };
}

export function powerCheck(throttling: Throttling | null): DeviceCheck | null {
  if (!throttling) return null;
  const base = { id: "power", group: "device" as const, title: "Power supply", link: null };
  if (throttling.underVoltageNow)
    return {
      ...base,
      state: "problem",
      summary: "The power supply is not giving enough now.",
      advice:
        "Use the official power supply for this Raspberry Pi and a short, thick cable. Too little power slows it down and can damage what is being written to the card.",
    };
  if (throttling.underVoltageSinceStart)
    return {
      ...base,
      state: "attention",
      summary: "The power dipped too low at some point since the Pi started.",
      advice: "Use the official power supply and a short, thick cable, especially with a drive plugged in.",
    };
  return { ...base, state: "good", summary: "Enough power since the Pi started.", advice: null };
}

export function jobsCheck(counts: { running: number; queued: number; paused: number; failedToday: number }): DeviceCheck {
  const base = {
    id: "jobs",
    group: "work" as const,
    title: "Background work",
    link: { to: "/downloads", label: "Downloads and tasks" },
  };
  const parts = [
    counts.running > 0 ? `${counts.running} running` : null,
    counts.queued > 0 ? `${counts.queued} waiting` : null,
    counts.paused > 0 ? `${counts.paused} paused` : null,
  ].filter(Boolean);
  const summary = parts.length > 0 ? `${parts.join(", ")}.` : "Nothing running.";
  if (counts.failedToday > 0)
    return {
      ...base,
      state: "attention",
      summary: `${summary} ${counts.failedToday} failed in the last day.`,
      advice: "Each failed download says why on the Downloads and tasks screen, with a button to try again.",
    };
  return { ...base, state: "good", summary, advice: null };
}

/** A hold-up of this long or more is worth a word: a page that takes a second to answer is noticed. */
const SLOW_MS = 1_000;

export function slownessCheck(worstLastHourMs: number | null, measuring: boolean): DeviceCheck {
  const base = { id: "slow", group: "work" as const, title: "Anything slow lately", link: null };
  if (worstLastHourMs === null)
    return {
      ...base,
      state: "good",
      summary: measuring ? "Being measured from now; nothing measured yet." : "Nothing has been asked of the server in the last hour.",
      advice: null,
    };
  const seconds = (worstLastHourMs / 1000).toFixed(1);
  if (worstLastHourMs >= SLOW_MS)
    return {
      ...base,
      state: "attention",
      summary: `In the last hour the server was held up for up to ${seconds} s at a time, and every page waited that long.`,
      advice:
        "This happens while a large file is being written to an SD card. It passes when the work ends; keeping large collections on an SSD avoids it.",
    };
  return {
    ...base,
    state: "good",
    summary: `Nothing held the server up for long in the last hour (at most ${Math.round(worstLastHourMs)} ms).`,
    advice: null,
  };
}
