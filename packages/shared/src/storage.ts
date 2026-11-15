export type StorageKind = "internal" | "external" | "network" | "volume";

export interface StorageUsage {
  locationId: string;
  /** Bytes and item counts per content kind ("zim", "map", "document", …). */
  byKind: Record<string, { bytes: number; count: number }>;
  totalBytes: number;
}

export interface StorageLocation {
  id: string;
  name: string;
  path: string;
  kind: StorageKind;
  isDefault: boolean;
  status: "available" | "unavailable";
  statusDetail: string | null;
  totalBytes: number | null;
  freeBytes: number | null;
  lastSeenAt: number | null;
  createdAt: number;
  usage?: StorageUsage;
}

export interface StorageLocationsResponse {
  /** Folders the person running the server allows locations to live in. */
  roots: string[];
  locations: Array<StorageLocation & { usage: StorageUsage }>;
}

export interface StorageBrowseEntry {
  name: string;
  path: string;
  locationId?: string;
}

export interface StorageBrowseResponse {
  path: string | null;
  parent: string | null;
  entries: StorageBrowseEntry[];
  writable: boolean;
  totalBytes: number | null;
  freeBytes: number | null;
}
