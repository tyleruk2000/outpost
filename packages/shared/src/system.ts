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
  "answers.enabled": boolean;
  "answers.endpoint": string;
  "answers.model": string;
  "answers.temperature": number;
  "answers.contextChars": number;
  "contacts.carddav": boolean;
  "downloads.concurrency": number;
  "downloads.rateLimitKbps": number;
  "downloads.maxAttempts": number;
  "https.enabled": boolean;
  "https.certificate": "outpost" | "own";
  "https.names": string;
  "indexing.concurrency": number;
  "indexing.chunkSize": number;
  "indexing.chunkOverlap": number;
  "indexing.maxPdfPages": number;
  "ocr.auto": boolean;
  "ocr.languages": string;
  "search.semantic.enabled": boolean;
  "search.semantic.provider": "none" | "built-in" | "openai-compatible" | "demo";
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
  /** The last choice for a country file once read: "ask" until one is made. */
  "maps.countryFileKeep": "ask" | "keep" | "delete";
  "storage.checkIntervalSeconds": number;
  /** A storage location for new downloads of each kind of content, where one is set. */
  "storage.kindDefaults": Partial<Record<"maps" | "terrain" | "places" | "layers" | "collections" | "documents", string>>;
  /** Someone in the household holds an amateur radio licence: only the reminders that transmitting needs one are left out. */
  "radio.licensed": boolean;
  /** Upper case, or "". Never sent anywhere. */
  "radio.callsign": string;
  /** Days a file sent on the household board is kept; 0 keeps it until removed. */
  "board.fileDays": number;
  /** Hours of aircraft heard on the radio kept; 0 keeps them until cleared. */
  "heard.aircraftHours": number;
  /** Let the model look things up in Outpost (Chat). Off by default. */
  "tools.enabled": boolean;
  "tools.library": boolean;
  "tools.places": boolean;
  "tools.supplies": boolean;
  "tools.plans": boolean;
  "tools.weather": boolean;
  "tools.radio": boolean;
  "tools.catalogue": boolean;
  "tools.board": boolean;
  /** Plain medical sheets for a language model. Off by default. */
  "tools.medical": boolean;
  /** Plain medical sheets in search. Off by default. */
  "medical.inSearch": boolean;
  /** Models not offered tools, though they say they can call them. */
  "tools.offForModels": string[];
}
