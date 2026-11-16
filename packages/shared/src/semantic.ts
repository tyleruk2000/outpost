import type { JobDto } from "./common.ts";

/** The embedding model that ships with Outpost. */
export interface BuiltInModelInfo {
  /** Whether its files and the program that runs them are part of this installation. */
  installed: boolean;
  /** Why not, in plain words. Null when it is installed. */
  reason: string | null;
  /** The model's public name, for example "all-MiniLM-L6-v2". */
  name: string;
  licence: string;
  /** Who made it, in a sentence fragment, for the credit. */
  madeBy: string;
  /** The languages it understands well, for example "English". */
  languages: string;
  /** Numbers in each vector it makes. */
  dimensions: number;
  /** Size of its files on disk. */
  bytes: number;
  /** Processor threads it is given on this computer. */
  threads: number;
}

export interface SemanticStatus {
  enabled: boolean;
  provider: string;
  model: string;
  modelId: string | null;
  ready: boolean;
  /** Why semantic search cannot run yet, in plain words. Null when it can. */
  reason: string | null;
  dimensions: number | null;
  totalChunks: number;
  embeddedChunks: number;
  otherModels: Array<{ modelId: string; dimensions: number; vectors: number }>;
  indexing: boolean;
  /**
   * The latest index build for the current model, whatever state it is in: waiting,
   * running, paused, failed, stopped or finished. Null when none has been started.
   */
  build: JobDto | null;
  builtIn: BuiltInModelInfo;
}

/**
 * Roughly how many bytes one stored vector adds to the database. The numbers themselves
 * are four bytes each; the rest is the row around them, the two indexes that name the
 * model, and the room SQLite leaves because rows this size fit two to a 4 kB page.
 * Measured at 2,159 bytes for a 384-number vector (6,614 passages added 14.3 MB).
 */
export function vectorBytes(dimensions: number): number {
  const page = 4096;
  const row = dimensions * 4 + 95;
  const table = row <= 4000 ? page / Math.floor(4000 / row) : Math.ceil(row / page) * page;
  return Math.round(table + 110);
}
