/** Kinds of computer a portable drive can start on. */
export type PortablePlatform = "darwin-arm64" | "darwin-x64" | "linux-x64" | "linux-arm64" | "win-x64" | "win-arm64";

export interface PortableStatus {
  /** This Outpost is itself running from a portable drive. */
  runningFromDrive: boolean;
  /** False when running from source: there is no packaged app to copy. */
  packagedAppAvailable: boolean;
  nodeVersion: string;
  thisComputer: PortablePlatform | null;
  /** Host the per-platform programs are downloaded from. */
  runtimeSource: string;
  platforms: Array<{ platform: PortablePlatform; label: string; cached: boolean }>;
}

export interface PortableRequest {
  targetPath: string;
  platforms: PortablePlatform[];
  collectionIds: string[];
  documents: "all" | "none";
  /** Also put the reader for reference collections (kiwix-serve) on the drive. */
  reader?: boolean;
  /** Must be true to update a folder that is already an Outpost drive. */
  replaceExisting?: boolean;
}

export interface PortablePlan {
  target: {
    path: string;
    exists: boolean;
    isOutpostDrive: boolean;
    freeBytes: number | null;
    totalBytes: number | null;
    lastWritten: string | null;
  };
  app: { available: boolean; bytes: number };
  runtimes: Array<{ platform: PortablePlatform; label: string; cached: boolean }>;
  reader: Array<{ platform: PortablePlatform; label: string; supported: boolean; cached: boolean }>;
  collections: Array<{ id: string; title: string; kind: string; bytes: number; available: boolean; alreadyOnDrive: boolean }>;
  documents: { count: number; bytes: number };
  bytesToWrite: number;
  enoughSpace: boolean;
  needsConnection: boolean;
  /** Things that stop the drive being written. */
  problems: string[];
  /** Things worth knowing that do not stop it. */
  warnings: string[];
}
