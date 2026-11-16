/**
 * Protecting backups with a passphrase: what is kept, who may change it, and the routes.
 *
 * Off unless a person sets a passphrase. From then on every backup made here, by hand
 * or on the schedule, is encrypted (`sealed.ts`) and can be opened only with that
 * passphrase.
 *
 * What is kept is one row in the settings table: a public key, and the private key
 * wrapped under a key derived from the passphrase. Neither opens a backup. The
 * passphrase is in memory while the request that carries it is answered and is not
 * written anywhere, so a scheduled backup is made with nobody there and nothing on
 * this computer can read it back afterwards.
 *
 * The row is not in the settings schema, for the reason the schedule is not:
 * `PATCH /api/settings` is open to every device, and this must not be. Anyone on the
 * network who could set a passphrase could lock the owner out of every backup made
 * from then on, so setting, changing and removing it follow the rule restoring does
 * (`right.ts`). A passphrase is also a secret on its way here, so it is accepted from
 * another device only over HTTPS, whatever the start-up option says.
 */
import type { TLSSocket } from "node:tls";
import type { BackupPassphraseRight, BackupProtection } from "@outpost/shared";
import type Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type { AppContext } from "../../core/context.ts";
import { AppError } from "../../core/errors.ts";
import { isLocalRequest } from "../../core/local.ts";
import { settings as settingsTable } from "../../db/schema.ts";
import { assertBackupRight } from "./right.ts";
import {
  makeProtectionKey,
  measureLogN,
  type ProtectionKey,
  SCRYPT_LOGN_CEILING,
  SCRYPT_LOGN_FLOOR,
  SCRYPT_P,
  SCRYPT_R,
} from "./sealed.ts";

export const PROTECTION_KEY = "backup.protection";
/** Longer than any passphrase a person types, short enough to refuse a body that is not one. */
export const MAX_PASSPHRASE_CHARS = 1024;
/** The header an uploaded backup's passphrase travels in: the passphrase as UTF-8, in base64. */
export const PASSPHRASE_HEADER = "x-outpost-backup-passphrase";
/** What a protected backup is sent as. Which kind a file is is decided by how it starts, not by this. */
export const PROTECTED_TYPE = "application/vnd.outpost.backup";

const base64 = (bytes: number) =>
  z
    .string()
    .regex(/^[A-Za-z0-9+/]+={0,2}$/)
    .refine((value) => Buffer.from(value, "base64").length === bytes);

const storedProtection = z.object({
  version: z.literal(1),
  publicKey: base64(32),
  scrypt: z.object({
    logN: z.number().int().min(SCRYPT_LOGN_FLOOR).max(SCRYPT_LOGN_CEILING),
    r: z.literal(SCRYPT_R),
    p: z.literal(SCRYPT_P),
    salt: base64(32),
  }),
  nonce: base64(12),
  wrappedKey: base64(48),
  setAt: z.number(),
});
type StoredProtection = z.infer<typeof storedProtection>;

export interface Protection {
  key: ProtectionKey;
  setAt: number;
}

function fromStored(value: unknown): Protection | undefined {
  const parsed = storedProtection.safeParse(value);
  if (!parsed.success) return undefined;
  const { data } = parsed;
  return {
    key: {
      publicKey: Buffer.from(data.publicKey, "base64"),
      wrapped: {
        logN: data.scrypt.logN,
        r: data.scrypt.r,
        p: data.scrypt.p,
        salt: Buffer.from(data.scrypt.salt, "base64"),
        nonce: Buffer.from(data.nonce, "base64"),
        sealed: Buffer.from(data.wrappedKey, "base64"),
      },
    },
    setAt: data.setAt,
  };
}

function toStored(protection: Protection): StoredProtection {
  const { publicKey, wrapped } = protection.key;
  return {
    version: 1,
    publicKey: publicKey.toString("base64"),
    scrypt: { logN: wrapped.logN, r: SCRYPT_R, p: SCRYPT_P, salt: wrapped.salt.toString("base64") },
    nonce: wrapped.nonce.toString("base64"),
    wrappedKey: wrapped.sealed.toString("base64"),
    setAt: protection.setAt,
  };
}

/** The key backups are encrypted to now, or undefined while they are not protected. */
export function readProtection(ctx: AppContext): Protection | undefined {
  return fromStored(ctx.db.select().from(settingsTable).where(eq(settingsTable.key, PROTECTION_KEY)).get()?.value);
}

/**
 * Settles what protection a database staged for restore will bring with it.
 *
 * A backup holds the settings of the moment it was made, the key backups were
 * encrypted to then among them. Left alone, restoring an old backup would quietly put
 * an old passphrase back in charge of every backup made afterwards. So:
 *
 *  - if this installation protects its backups now, it goes on doing so, with the same key;
 *  - if it does not, and the backup being restored was itself opened with a passphrase,
 *    the key that backup was encrypted to is kept: the person has just shown they know
 *    its passphrase, and this is how protection returns on a fresh installation;
 *  - anything else is removed, so that a backup file cannot bring a key nobody here
 *    has the passphrase for.
 */
export function settleStagedProtection(staged: Database.Database, current: Protection | undefined, openedWith: Buffer | undefined): void {
  if (current) {
    staged
      .prepare(
        "INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
      )
      .run(PROTECTION_KEY, JSON.stringify(toStored(current)), Date.now());
    return;
  }
  const row = staged.prepare("SELECT value FROM settings WHERE key = ?").get(PROTECTION_KEY) as { value: string } | undefined;
  if (!row) return;
  let inBackup: Protection | undefined;
  try {
    inBackup = fromStored(JSON.parse(row.value));
  } catch {
    inBackup = undefined;
  }
  if (inBackup && openedWith && inBackup.key.publicKey.equals(openedWith)) return;
  staged.prepare("DELETE FROM settings WHERE key = ?").run(PROTECTION_KEY);
}

/**
 * Whether this request may carry a passphrase: to set one, or to open a backup with
 * one. It must have the right to restore, and the passphrase must not cross the
 * network in the clear: this computer itself, or another device over HTTPS.
 */
export function passphraseRight(request: FastifyRequest, ctx: AppContext): BackupPassphraseRight {
  if (isLocalRequest(request, ctx.config)) return { allowed: true, reason: "local" };
  if (!ctx.config.allowRemoteErase) return { allowed: false, reason: "remote" };
  const overHttps = (request.raw.socket as Partial<TLSSocket>).encrypted === true;
  return overHttps ? { allowed: true, reason: "https" } : { allowed: false, reason: "insecure" };
}

export function assertPassphraseRight(request: FastifyRequest, ctx: AppContext, action: string): void {
  assertBackupRight(request, ctx, action);
  if (passphraseRight(request, ctx).allowed) return;
  throw new AppError(
    "forbidden",
    "A passphrase sent from this device would cross your network unencrypted, where anyone on it could copy it. Do this at the computer Outpost runs on, or open Outpost at an address beginning https.",
    { reason: "insecure" },
  );
}

/** The passphrase sent with an uploaded backup, if one was. */
export function passphraseFromHeader(request: FastifyRequest): string | undefined {
  const value = request.headers[PASSPHRASE_HEADER];
  if (typeof value !== "string" || value === "") return undefined;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length > MAX_PASSPHRASE_CHARS * 6) {
    throw new AppError("bad_request", "The passphrase was not sent in a form Outpost reads.");
  }
  return Buffer.from(value, "base64").toString("utf8");
}

export const passphraseField = z
  .string()
  .min(1, "Type a passphrase.")
  .max(MAX_PASSPHRASE_CHARS, `A passphrase can be at most ${MAX_PASSPHRASE_CHARS} characters.`);
const setBody = z.object({ passphrase: passphraseField }).strict();

export interface ProtectionService {
  status(request: FastifyRequest): BackupProtection;
  /** Tests fix the cost so that they do not each spend a second deriving a key. */
  setCost(logN: number | undefined): void;
}

export function registerProtection(app: FastifyInstance, ctx: AppContext): ProtectionService {
  let fixedCost: number | undefined;
  /** Measured once: it is a property of this computer. */
  let measured: Promise<number> | undefined;
  const cost = (): Promise<number> => {
    if (fixedCost !== undefined) return Promise.resolve(fixedCost);
    measured ??= measureLogN();
    return measured;
  };

  function status(request: FastifyRequest): BackupProtection {
    const current = readProtection(ctx);
    return { on: current !== undefined, setAt: current?.setAt ?? null, right: passphraseRight(request, ctx) };
  }

  /**
   * Sets the passphrase, or changes it. Either way a new key pair is made: backups made
   * from now on open with this passphrase, and the ones already made go on opening with
   * the passphrase they were made under. The old passphrase is not asked for, because
   * nothing made under it is touched, and a person who has lost it must still be able
   * to protect what they back up next.
   */
  app.put("/api/backup/protection", async (request) => {
    assertPassphraseRight(request, ctx, "Setting the passphrase for backups");
    const { passphrase } = setBody.parse(request.body);
    const key = await makeProtectionKey(passphrase, await cost());
    const value = toStored({ key, setAt: Date.now() });
    const now = Date.now();
    ctx.db
      .insert(settingsTable)
      .values({ key: PROTECTION_KEY, value, updatedAt: now })
      .onConflictDoUpdate({ target: settingsTable.key, set: { value, updatedAt: now } })
      .run();
    ctx.events.publish({ type: "backup.changed" });
    return status(request);
  });

  /** Stops protecting the backups made from now on. The ones already made stay as they are. */
  app.delete("/api/backup/protection", async (request) => {
    assertBackupRight(request, ctx, "Removing the passphrase for backups");
    ctx.db.delete(settingsTable).where(eq(settingsTable.key, PROTECTION_KEY)).run();
    ctx.events.publish({ type: "backup.changed" });
    return status(request);
  });

  return {
    status,
    setCost(logN) {
      fixedCost = logN;
    },
  };
}
