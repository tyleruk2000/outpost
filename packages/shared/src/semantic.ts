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
}

export interface BackupStatus {
  restorePending: boolean;
  /** Folders of data kept from before earlier restores. */
  previousData: string[];
  /** Outpost can restart itself here (Docker, or the portable launcher). */
  supervised: boolean;
}
