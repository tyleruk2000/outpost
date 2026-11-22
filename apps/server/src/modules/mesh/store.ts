/**
 * What the mesh link keeps in the settings table, in two rows of its own that are not in
 * the settings schema (as `backup.protection` is not), so that `PATCH /api/settings`
 * cannot turn a way in on from another device and `GET /api/settings` does not list them:
 *
 *  - `mesh.config`: the ways in as a person set them up (no password: see `secrets.ts`).
 *  - `mesh.heard`: what was learnt from the radios: names of radios heard (at most 200), the
 *    last position each reported and whether it is shown on the map,
 *    which radio connects to MQTT, its root topic, and each channel's index.
 *
 * Both are in the database, so in backups, and both go with erase-everything (which
 * empties the settings table). The radios' names also go when the board is emptied.
 */
import { MESH_CHANNEL_NAME_MAX, MESH_DEFAULT_PORTS } from "@outpost/shared";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { AppContext } from "../../core/context.ts";
import { settings as settingsTable } from "../../db/schema.ts";

export const CONFIG_KEY = "mesh.config";
export const HEARD_KEY = "mesh.heard";
const MOST_NODES = 200;
/** A CA certificate in PEM is under 3,000 characters; a short chain of them fits. */
export const MOST_CA_CHARS = 16_384;

const channelName = z
  .string()
  .trim()
  .min(1)
  .max(MESH_CHANNEL_NAME_MAX)
  .regex(/^[^/+#\s]+$/, "A channel name has no spaces, slashes, + or #.");

export const storedConfig = z.object({
  meshtastic: z
    .object({
      mode: z.enum(["off", "broker", "client"]).default("off"),
      broker: z
        .object({
          port: z.number().int().min(1).max(65535).default(MESH_DEFAULT_PORTS.mqtt),
          userName: z.string().max(64).default("radio"),
        })
        .prefault({}),
      client: z
        .object({
          host: z.string().max(253).default(""),
          port: z.number().int().min(1).max(65535).default(MESH_DEFAULT_PORTS.mqtt),
          userName: z.string().max(64).default(""),
          /** Empty until a person saves one: until then the root topic offered is the one for Home's country (service.ts, `firstRoot`). */
          rootTopic: z.string().max(100).default(""),
          tls: z.boolean().default(false),
          /** The household's certificate authority, PEM: public, so kept here, not with the passwords. */
          ca: z.string().max(MOST_CA_CHARS).nullable().default(null),
        })
        .prefault({}),
      channels: z
        .array(z.object({ name: channelName, index: z.number().int().min(0).max(7) }))
        .max(8)
        .default([{ name: "LongFast", index: 0 }]),
    })
    .prefault({}),
  meshcore: z
    .object({
      mode: z.enum(["off", "serial", "tcp"]).default("off"),
      device: z.string().max(200).nullable().default(null),
      host: z.string().max(253).default(""),
      port: z.number().int().min(1).max(65535).default(MESH_DEFAULT_PORTS.meshcoreTcp),
      channels: z.array(z.number().int().min(0).max(7)).max(8).default([0]),
    })
    .prefault({}),
});
export type StoredConfig = z.infer<typeof storedConfig>;

const node = z.object({
  shortName: z.string().max(8).nullable(),
  longName: z.string().max(40).nullable(),
  heardAt: z.number(),
  /** The last position the radio reported, kept so that switching it on shows it at once. Shown nowhere while `onMap` is off. */
  position: z
    .object({ lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180), altitude: z.number().nullable(), at: z.number() })
    .nullable()
    .default(null),
  /** Shown on the map: off until a person switches it on for this radio, since it shows where someone is. */
  onMap: z.boolean().default(false),
});
export const storedHeard = z.object({
  nodes: z.record(z.string().max(16), node).prefault({}),
  meshtastic: z
    .object({
      root: z.string().max(100).nullable().default(null),
      gateway: z.string().max(16).nullable().default(null),
      /** Channel name, as the radio spells it, to its index. */
      channelIndex: z.record(z.string().max(MESH_CHANNEL_NAME_MAX), z.number().int().min(0).max(7)).prefault({}),
    })
    .prefault({}),
});
export type StoredHeard = z.infer<typeof storedHeard>;

export interface MeshStore {
  config(): StoredConfig;
  saveConfig(next: StoredConfig): void;
  heard(): StoredHeard;
  saveHeard(next: StoredHeard): void;
}

export function createMeshStore(ctx: AppContext): MeshStore {
  function readRow<T>(key: string, schema: z.ZodType<T>): T {
    const raw = ctx.db.select().from(settingsTable).where(eq(settingsTable.key, key)).get()?.value;
    const parsed = schema.safeParse(raw ?? {});
    return parsed.success ? parsed.data : schema.parse({});
  }
  function writeRow(key: string, value: unknown): void {
    const now = Date.now();
    ctx.db
      .insert(settingsTable)
      .values({ key, value, updatedAt: now })
      .onConflictDoUpdate({ target: settingsTable.key, set: { value, updatedAt: now } })
      .run();
  }
  return {
    config: () => readRow(CONFIG_KEY, storedConfig),
    saveConfig: (next) => writeRow(CONFIG_KEY, next),
    heard: () => readRow(HEARD_KEY, storedHeard),
    saveHeard(next) {
      // The radios heard longest ago go first once there are more than the most kept.
      const entries = Object.entries(next.nodes);
      if (entries.length > MOST_NODES) {
        entries.sort((a, b) => b[1].heardAt - a[1].heardAt);
        next = { ...next, nodes: Object.fromEntries(entries.slice(0, MOST_NODES)) };
      }
      writeRow(HEARD_KEY, next);
    },
  };
}
