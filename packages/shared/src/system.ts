export interface SessionInfo {
  authRequired: boolean;
  setupRequired: boolean;
  setupTokenRequired: boolean;
  lanAccess: boolean;
  user: { id: string; username: string; role: "admin" | "member" } | null;
}

export interface SystemInfo {
  version: string;
  packaged: boolean;
  portable: boolean;
  node: string;
  platform: string;
  uptimeSeconds: number;
  lanAccess: boolean;
  authRequired: boolean;
  resources: {
    processRssBytes: number;
    heapUsedBytes: number;
    systemTotalBytes: number;
    systemFreeBytes: number;
    loadAverage: number[];
    cpuCount: number;
    databaseBytes: number;
  };
  queues: Record<string, { queued: number; running: number; paused: number }>;
}

/** Settings people can change from the Settings screen. Mirrors the server's schema. */
export interface Settings {
  "downloads.concurrency": number;
  "downloads.rateLimitKbps": number;
  "downloads.maxAttempts": number;
  "indexing.concurrency": number;
  "indexing.chunkSize": number;
  "indexing.chunkOverlap": number;
  "indexing.maxPdfPages": number;
  "search.semantic.enabled": boolean;
  "search.semantic.provider": "none" | "transformers" | "openai-compatible";
  "search.semantic.model": string;
  "search.semantic.endpoint": string;
  "search.semantic.batchSize": number;
  "search.hybrid.rrfK": number;
  "search.hybrid.keywordWeight": number;
  "search.hybrid.semanticWeight": number;
  "search.includeReference": boolean;
  "maps.tileSource": string;
  "maps.terrainSource": string;
  "maps.defaultMaxZoom": number;
  "storage.checkIntervalSeconds": number;
}
