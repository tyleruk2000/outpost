import type { BackupRight } from "./backup.ts";
import type { JobDto } from "./common.ts";

/**
 * How Outpost is installed, which decides what updating from the app can do:
 *  - `docker-helper`: Docker, with the update service deploy/pi/install.sh adds on the
 *    host. Outpost checks and stages a release; the service loads it, starts it, and
 *    goes back to the version before if it does not start healthy.
 *  - `docker`: Docker without that service. A container cannot replace itself, so
 *    Outpost checks a release and says the commands to run on the host.
 *  - `portable`: the portable app on a drive. Replace the app folder by hand.
 *  - `source`: run from a checkout (pnpm dev or node). Update the checkout by hand.
 */
export type InstallKind = "docker-helper" | "docker" | "portable" | "source";

/** A release as its signed manifest describes it. */
export interface ReleaseInfo {
  release: string;
  publishedAt: string | null;
  notes: string | null;
  /** The platform this computer is ("linux/arm64"), and the image for it. */
  platform: string;
  image: string;
  bytes: number;
  sha256: string;
  /** The trusted comment of its signature. */
  signedComment: string;
}

/** A release checked and kept in the data directory, ready to install. */
export interface StagedRelease extends ReleaseInfo {
  stagedAt: number;
  /** Where it came from: an upload, a file on a storage location, or the release page. */
  source: "upload" | "storage" | "online";
}

/** What the last update did, as the host's update service wrote it. */
export interface UpdateResult {
  at: number;
  /** `ok`: the new version started healthy. `rolled-back`: it did not, and the version before was started again. `failed`: nothing was changed. */
  outcome: "ok" | "rolled-back" | "failed";
  release: string | null;
  message: string;
  /** The backup made just before, in the data directory, to restore if the new version changed anything for the worse. */
  backupName: string | null;
}

/** A release file found on a connected storage location (a USB stick, say). */
export interface ReleaseFileOnStorage {
  locationId: string;
  locationName: string;
  relPath: string;
  bytes: number;
}

export interface UpdateStatus {
  current: string;
  install: InstallKind;
  /** Whether this build has a release key, without which no release can be checked. */
  keyed: boolean;
  /** Where "Check for a newer version" looks. */
  checkUrl: string;
  /** The last check, while the server has been running. */
  latest: { at: number; release: ReleaseInfo | null; newer: boolean; message: string | null } | null;
  staged: StagedRelease | null;
  lastResult: UpdateResult | null;
  /** An update handed to the host's update service and not answered yet; `silent` once it has been quiet too long. */
  waiting: { release: string; since: number; silent: boolean } | null;
  /** Checking, fetching, or installing now. */
  active: JobDto | null;
  /** Updating replaces the program everyone uses, so it is held to the same rule as restoring a backup. */
  right: BackupRight;
}

/** The file name a release bundle has: `outpost-<release>-<os>-<arch>.outpost-update`. */
export const RELEASE_FILE_EXTENSION = ".outpost-update";
