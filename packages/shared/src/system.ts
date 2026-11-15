export interface SystemInfo {
  version: string;
  packaged: boolean;
  portable: boolean;
  node: string;
  platform: string;
  /** Where the server runs, for the things that depend on it (connecting network shares). */
  host: {
    os: "macos" | "linux" | "windows" | "other";
    /** Running inside a container, where the host's drives are only what was mounted in. */
    inContainer: boolean;
  };
  uptimeSeconds: number;
  lanAccess: boolean;
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
  "ocr.auto": boolean;
  "ocr.languages": string;
  "search.semantic.enabled": boolean;
  "search.semantic.provider": "none" | "transformers" | "openai-compatible" | "demo";
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
