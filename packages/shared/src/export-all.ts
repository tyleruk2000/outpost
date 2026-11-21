import type { JobDto } from "./common.ts";

/**
 * "Take everything out": one zip of a household's own things in open formats, with a
 * README saying what each folder is. Unlike a backup, it is meant to be read by other
 * programs, not put back into Outpost.
 */

/** The parts of an export, each a folder in the zip. */
export const EXPORT_SECTIONS = [
  "notes",
  "contacts",
  "places",
  "supplies",
  "barometer",
  "radio-log",
  "plans",
  "papers",
  "board",
  "documents",
] as const;
export type ExportSection = (typeof EXPORT_SECTIONS)[number];

export interface ExportSectionEstimate {
  id: ExportSection;
  /** What it is, for a person: "Notes", "Contacts". */
  label: string;
  /** The format it is written in, in words: "Markdown, with attachments". */
  format: string;
  /** How many things: pages, contacts, readings. */
  count: number;
  /** Roughly how much room it takes in the zip, before compression. */
  bytes: number;
  /** What is left out of this part and why, in words; empty when nothing is. */
  leftOut: string[];
}

export interface ExportEstimate {
  sections: ExportSectionEstimate[];
  /** The whole export, before compression. */
  totalBytes: number;
}

export type ExportDestination = { kind: "download" } | { kind: "location"; locationId: string };

export interface ExportStartRequest {
  destination: ExportDestination;
  /** The parts to include; all of them when left out. */
  include?: ExportSection[];
}

/** What a finished export job keeps as its result. */
export interface ExportResult {
  name: string;
  sizeBytes: number;
  destination: "download" | "location";
  /** For a location: its name, and the folder inside it the file was written to. */
  locationName?: string;
  folder?: string;
  /** Whether the file for downloading is still kept on the server. */
  downloadable?: boolean;
  sections: Array<{ id: ExportSection; count: number }>;
  leftOut: string[];
}

export interface ExportStatus {
  /** The newest export, finished or under way, or null when none has been made. */
  latest: JobDto | null;
}

/** The folder inside a storage location that exports are written to. */
export const EXPORT_FOLDER = "outpost-exports";
