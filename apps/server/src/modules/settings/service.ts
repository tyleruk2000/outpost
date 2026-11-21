/**
 * Behaviour people change from the Settings screen. Stored one key per row so that new
 * settings can be added without a migration; the schema below is the single list of
 * what exists and what the defaults are.
 */
import { BOARD_FILE_DAYS_DEFAULT, BOARD_FILE_DAYS_MAX } from "@outpost/shared";
import { z } from "zod";
import type { AppContext } from "../../core/context.ts";
import { AppError } from "../../core/errors.ts";
import { settings as settingsTable } from "../../db/schema.ts";
import { parseModelServerAddress } from "../answers/address.ts";
import { parseName, splitNames } from "../https/names.ts";

export const settingsSchema = z.object({
  /** How many downloads run at once. */
  "downloads.concurrency": z.number().int().min(1).max(8).default(2),
  /**
   * Speed limit across all downloads together, in kilobytes per second. 0 means no
   * limit. Useful on a shared or metered connection.
   */
  "downloads.rateLimitKbps": z.number().int().min(0).max(10_000_000).default(0),
  /** Attempts per download before it is marked failed. */
  "downloads.maxAttempts": z.number().int().min(1).max(20).default(8),
  /** How many documents are processed at once. Keep at 1 on a Raspberry Pi. */
  "indexing.concurrency": z.number().int().min(1).max(8).default(1),
  /** Target passage length, in characters, for search and retrieval. */
  "indexing.chunkSize": z.number().int().min(300).max(4000).default(1200),
  "indexing.chunkOverlap": z.number().int().min(0).max(800).default(150),
  /** Largest number of PDF pages read per document; 0 means no limit. */
  "indexing.maxPdfPages": z.number().int().min(0).max(100000).default(5000),
  /** Read text from scanned pages and images (OCR) as soon as a document without text is added. */
  "ocr.auto": z.boolean().default(false),
  /**
   * Languages OCR reads, as Tesseract codes joined by "+": "eng", or "eng+deu". English
   * ships with Outpost; others are used when their data file is in the data directory.
   */
  "ocr.languages": z
    .string()
    .max(100)
    .regex(/^[a-z]{3,4}(_[a-z]{3,8})?(\+[a-z]{3,4}(_[a-z]{3,8})?)*$/, 'Use language codes joined by "+", such as "eng" or "eng+deu".')
    .default("eng"),
  "search.semantic.enabled": z.boolean().default(false),
  /**
   * Where vectors come from: the model that ships with Outpost, a local server that speaks
   * the OpenAI embeddings format, or word counts for demonstration. Nothing is used until
   * semantic search is switched on.
   */
  "search.semantic.provider": z.enum(["none", "built-in", "openai-compatible", "demo"]).default("built-in"),
  /** The name a local embedding server knows its model by. The built-in model does not use it. */
  "search.semantic.model": z.string().max(200).default("Xenova/all-MiniLM-L6-v2"),
  "search.semantic.endpoint": z.string().max(500).default("http://127.0.0.1:11434/v1"),
  "search.semantic.batchSize": z.number().int().min(1).max(256).default(16),
  /** Reciprocal rank fusion constant; larger values flatten the difference between ranks. */
  "search.hybrid.rrfK": z.number().int().min(1).max(1000).default(60),
  "search.hybrid.keywordWeight": z.number().min(0).max(10).default(1),
  "search.hybrid.semanticWeight": z.number().min(0).max(10).default(1),
  /**
   * Answers written by a language model the person runs themselves. Off until they
   * turn it on and name a model: Outpost bundles no model and contacts no server on its own.
   */
  "answers.enabled": z.boolean().default(false),
  /**
   * Where the model server is: any OpenAI-compatible chat server (Ollama, llama.cpp,
   * LM Studio). The question and the passages found for it are sent here and nowhere else.
   */
  "answers.endpoint": z
    .string()
    .max(500)
    .superRefine((value, issue) => {
      try {
        parseModelServerAddress(value);
      } catch (error) {
        issue.addIssue({ code: "custom", message: error instanceof Error ? error.message : "That is not an address." });
      }
    })
    .default("http://127.0.0.1:11434/v1"),
  /** The model's name as the server knows it. Empty until the person chooses one. */
  "answers.model": z.string().max(200).default(""),
  /** How freely the model words things. Kept low: an answer should stay close to its sources. */
  "answers.temperature": z.number().min(0).max(2).default(0.2),
  /** Most characters of quoted passages sent with a question. About four characters make a token. */
  "answers.contextChars": z.number().int().min(1000).max(60000).default(6000),
  /** Include installed reference collections (Kiwix) in unified search. */
  "search.includeReference": z.boolean().default(true),
  /** Address of the planet tile archive regions are extracted from. Empty picks the newest build. */
  "maps.tileSource": z.string().max(500).default(""),
  "maps.terrainSource": z.string().max(500).default("https://download.mapterhorn.com/planet.pmtiles"),
  "maps.defaultMaxZoom": z.number().int().min(0).max(15).default(14),
  /**
   * Serve Outpost over HTTPS as well, on a second port, with a certificate this server
   * makes for itself. Off until a person turns it on; plain HTTP keeps working either way.
   */
  "https.enabled": z.boolean().default(false),
  /**
   * Whose certificate the HTTPS listener presents: one Outpost makes and signs with its
   * own certificate authority, or one the person brought (see `modules/https/own.ts`).
   */
  "https.certificate": z.enum(["outpost", "own"]).default("outpost"),
  /**
   * Other names and addresses this server is reached by, separated by commas, for the
   * certificate to list. Needed where Outpost cannot see them itself, as in a container.
   */
  "https.names": z
    .string()
    .max(1000)
    .superRefine((value, issue) => {
      const entries = splitNames(value);
      if (entries.length > 20) issue.addIssue({ code: "custom", message: "List at most 20 names or addresses." });
      const bad = entries.find((entry) => !parseName(entry));
      if (bad) issue.addIssue({ code: "custom", message: `"${bad}" is not a host name or an address. Leave out http:// and the port.` });
    })
    .default(""),
  /**
   * Let phones and computers on the network subscribe to the contacts (CardDAV). They can
   * read the address book and cannot change it. Off until a person turns it on.
   */
  "contacts.carddav": z.boolean().default(false),
  /**
   * Fetch forecasts, warnings and flood data each time the Weather and hazards screen is
   * opened, as well as when "Update now" is pressed. Off until a person ticks it: each
   * opening is then an outbound request (docs/security.md).
   */
  "weather.updateOnOpen": z.boolean().default(false),
  /** How far round a weather place river and sea levels are asked for, km (one of RIVER_DISTANCES_KM in @outpost/shared). */
  "weather.riversKm": z.number().int().min(1).max(50).default(8),
  /** Days a file sent on the household board is kept before it is removed by itself; 0 keeps it until someone removes it. */
  "board.fileDays": z.number().int().min(0).max(BOARD_FILE_DAYS_MAX).default(BOARD_FILE_DAYS_DEFAULT),
  /**
   * Let the model look things up in Outpost: Chat offers the tools of modules/tools to a
   * model that says it can call them. Off by default, as answers are. Each area below is
   * a switch of its own; what each lets a model server see is in docs/ai.md.
   */
  "tools.enabled": z.boolean().default(false),
  "tools.library": z.boolean().default(true),
  "tools.places": z.boolean().default(true),
  "tools.supplies": z.boolean().default(true),
  "tools.plans": z.boolean().default(true),
  "tools.weather": z.boolean().default(true),
  "tools.radio": z.boolean().default(true),
  "tools.catalogue": z.boolean().default(true),
  /** Messages on the household board: off until a person turns it on. */
  "tools.board": z.boolean().default(false),
  /** Plain medical sheets (Preparedness): off until a person turns it on, as the sheets are the most private thing held. */
  "tools.medical": z.boolean().default(false),
  /** Plain medical sheets in search: off until a person turns it on from the Medical sheets screen. */
  "medical.inSearch": z.boolean().default(false),
  /** Models that say they can call tools and do it badly: Chat offers them none. */
  "tools.offForModels": z.array(z.string().trim().min(1).max(200)).max(50).default([]),
  /** Seconds between checks that storage locations are still connected. */
  "storage.checkIntervalSeconds": z.number().int().min(5).max(3600).default(30),
});

export type Settings = z.infer<typeof settingsSchema>;
export type SettingKey = keyof Settings;

export interface SettingsService {
  all(): Settings;
  get<K extends SettingKey>(key: K): Settings[K];
  update(patch: Partial<Settings>): Settings;
  onChange(listener: (settings: Settings) => void): void;
  /** Puts every setting back to its default. Returns how many had been changed. */
  reset(): number;
}

declare module "../../core/context.ts" {
  interface Services {
    settings: SettingsService;
  }
}

export function createSettingsService(ctx: AppContext): SettingsService {
  const listeners: Array<(settings: Settings) => void> = [];
  let cache: Settings | undefined;

  function load(): Settings {
    if (cache) return cache;
    const stored: Record<string, unknown> = {};
    for (const row of ctx.db.select().from(settingsTable).all()) stored[row.key] = row.value;
    // Unknown or no-longer-valid values fall back to defaults rather than failing boot.
    const merged: Record<string, unknown> = {};
    for (const [key, schema] of Object.entries(settingsSchema.shape)) {
      const parsed = schema.safeParse(stored[key]);
      merged[key] = parsed.success ? parsed.data : schema.parse(undefined);
    }
    cache = merged as Settings;
    return cache;
  }

  return {
    all: load,
    get: (key) => load()[key],
    update(patch) {
      // Each given key is checked on its own. Parsing the patch against the whole
      // schema would fill every absent key with its default and write those too,
      // silently resetting settings the person never touched.
      const validated: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(patch as Record<string, unknown>)) {
        const schema = (settingsSchema.shape as Record<string, z.ZodType>)[key];
        if (!schema) throw new AppError("bad_request", `"${key}" is not a setting.`);
        if (value === undefined) continue;
        const parsed = schema.safeParse(value);
        if (!parsed.success) throw new AppError("bad_request", `${key}: ${parsed.error.issues[0]?.message ?? "not a valid value"}`);
        validated[key] = parsed.data;
      }
      const now = Date.now();
      ctx.sqlite.transaction(() => {
        for (const [key, value] of Object.entries(validated)) {
          if (value === undefined) continue;
          ctx.db
            .insert(settingsTable)
            .values({ key, value, updatedAt: now })
            .onConflictDoUpdate({ target: settingsTable.key, set: { value, updatedAt: now } })
            .run();
        }
      })();
      cache = undefined;
      const next = load();
      for (const listener of listeners) listener(next);
      ctx.events.publish({ type: "settings.changed" });
      return next;
    },
    onChange(listener) {
      listeners.push(listener);
    },
    reset() {
      const removed = ctx.db.delete(settingsTable).run().changes;
      cache = undefined;
      const next = load();
      for (const listener of listeners) listener(next);
      ctx.events.publish({ type: "settings.changed" });
      return removed;
    },
  };
}
