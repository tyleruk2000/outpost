export type StorageKind = "internal" | "external" | "network" | "volume";

/**
 * The kinds of content that can each have a storage location of their own for new
 * downloads (Storage, "Where new things go"). A kind with none set goes to the default.
 */
export type ContentKind = "maps" | "terrain" | "places" | "layers" | "collections" | "documents";

export const CONTENT_KINDS: ReadonlyArray<{ kind: ContentKind; label: string; detail: string }> = [
  { kind: "maps", label: "Maps", detail: "Map regions and aerial imagery" },
  { kind: "terrain", label: "Terrain", detail: "Heights for hill shading, profiles and sight lines" },
  { kind: "places", label: "Place names", detail: "Place names for map search" },
  { kind: "layers", label: "Map layers", detail: "Reference layers and other datasets" },
  { kind: "collections", label: "Collections", detail: "Wikipedia and other catalogue collections" },
  { kind: "documents", label: "Documents", detail: "Uploaded and saved documents" },
];

/** Where each kind of content goes when it has a location of its own. */
export type ContentKindDefaults = Partial<Record<ContentKind, string>>;

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
  /** The kinds of content set to go here rather than to the default (see `ContentKind`). */
  defaultFor: ContentKind[];
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
