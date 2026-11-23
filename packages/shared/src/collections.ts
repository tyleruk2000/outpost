import type { JobDto } from "./common.ts";

export type CollectionKind = "zim" | "map" | "terrain" | "places" | "file" | "model" | "dataset" | "extract";

/**
 * installed: the file is where Outpost expects it.
 * missing:   the storage location is connected but the file is not on it.
 * moving:    being copied to another storage location; the original is still in use.
 * damaged:   the file no longer matches the checksum recorded when it was installed.
 */
export type CollectionStatus = "installed" | "missing" | "moving" | "damaged";

export interface CollectionDto {
  id: string;
  kind: CollectionKind;
  catalogEntryId: string | null;
  title: string;
  description: string | null;
  category: string | null;
  language: string | null;
  publisher: string | null;
  license: string | null;
  attribution: string | null;
  version: string | null;
  locationId: string;
  locationName: string;
  /** False when the drive or share holding this collection is not connected. */
  locationAvailable: boolean;
  relPath: string;
  sizeBytes: number;
  sha256: string | null;
  status: CollectionStatus;
  /** A newer version is listed in the catalogue. */
  updateAvailable: boolean;
  meta: Record<string, unknown>;
  installedAt: number;
  verifiedAt: number | null;
  updatedAt: number;
}

/** One chapter of a book in the library. */
export interface BookChapterDto {
  /** The chapter's name in links between chapters. */
  key: string;
  number: string | null;
  title: string;
  summary: string | null;
  /** The document that holds the chapter. */
  documentId: string;
}

export interface BookSectionDto {
  /** Empty when the book has no named parts. */
  title: string;
  chapters: BookChapterDto[];
}

/** The contents of a book: its chapters in reading order, grouped by part. */
export interface BookContentsResponse {
  collectionId: string;
  sections: BookSectionDto[];
  /** Chapters in all. */
  total: number;
}

export interface CollectionsResponse {
  collections: CollectionDto[];
}

export interface CollectionResponse {
  collection: CollectionDto;
}

/** Answer to starting a verify or a move: the background job to follow. */
export interface CollectionJobResponse {
  job: JobDto;
}

/** Result stored on a finished `collection.verify` job. */
export interface CollectionVerifyResult {
  outcome: "ok" | "recorded" | "damaged" | "missing";
  message: string;
  sha256?: string;
}

export interface DeleteCollectionRequest {
  /** Required. False removes only Outpost's record and leaves the file where it is. */
  deleteFiles: boolean;
}

export interface MoveCollectionRequest {
  locationId: string;
}
