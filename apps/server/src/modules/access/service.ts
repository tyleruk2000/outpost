/**
 * The household PIN, and the devices unlocked with it.
 *
 * Kept in two rows of the settings table that are not in the settings schema (as
 * `mesh.config` is not), so that `GET /api/settings` never lists them and
 * `PATCH /api/settings` cannot change them:
 *
 *  - `access.pin`: the PIN as a salted scrypt hash, and when it was set. Never the PIN.
 *  - `access.devices`: the devices unlocked with it, each by the SHA-256 of the random
 *    token in its cookie. The token itself is only ever in that device's cookie.
 *
 * Both are in the database, so in backups; a restore keeps the ones in use here
 * (modules/backup/restore.ts), a portable drive carries neither, and erasing everything
 * (which empties the settings table) goes back to no PIN.
 */
import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { AccessState } from "@outpost/shared";
import { z } from "zod";
import type { AppContext } from "../../core/context.ts";

export const PIN_KEY = "access.pin";
export const DEVICES_KEY = "access.devices";
/** The cookie that says a device was unlocked. */
export const DEVICE_COOKIE = "outpost_device";
/** How long an unlocked device stays unlocked without being used. */
export const DEVICE_DAYS = 365;
/** Devices remembered; the one used least recently is locked first. */
const MOST_DEVICES = 200;
/** Last use is written down at most this often, so that writing is not a write of its own every time. */
const SEEN_EVERY_MS = 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** scrypt's cost: N = 2^14 takes some tens of milliseconds on a Raspberry Pi 4, which is what a guess should cost. */
const SCRYPT = { N: 16_384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 } as const;
const KEY_BYTES = 32;

const runScrypt = promisify(scrypt) as (password: string, salt: Buffer, length: number, options: object) => Promise<Buffer>;

const storedPin = z.object({ hash: z.string(), salt: z.string(), setAt: z.number() });
const storedDevices = z.array(z.object({ hash: z.string(), unlockedAt: z.number(), seenAt: z.number() }));
type StoredPin = z.infer<typeof storedPin>;
type StoredDevice = z.infer<typeof storedDevices>[number];

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");

export interface AccessService {
  /** Whether a PIN is set. */
  pinOn(): boolean;
  /** The device a token belongs to, or null. Notes that it was used. */
  deviceOf(token: string | undefined, now?: number): StoredDevice | null;
  state(token: string | undefined): AccessState;
  /** True when `pin` is the household PIN. */
  check(pin: string): Promise<boolean>;
  /** Sets the PIN (replacing any) and locks every device. */
  setPin(pin: string, now?: number): Promise<void>;
  removePin(): void;
  /** Unlocks a new device: the token for its cookie. */
  unlock(now?: number): string;
  /** Locks the device with this token. */
  lock(token: string | undefined): void;
  /** Locks every device but the one with this token. How many were locked. */
  lockOthers(token: string | undefined): number;
}

export function createAccessService(ctx: AppContext): AccessService {
  const { sqlite } = ctx;
  const readRow = sqlite.prepare("SELECT value FROM settings WHERE key = ?");
  const writeRow = sqlite.prepare(
    "INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
  );
  const deleteRow = sqlite.prepare("DELETE FROM settings WHERE key = ?");

  function read<T>(key: string, schema: z.ZodType<T>): T | null {
    const row = readRow.get(key) as { value: string } | undefined;
    if (!row) return null;
    try {
      const parsed = schema.safeParse(JSON.parse(row.value));
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }

  // Read from the table each time it matters, not kept: a restore or an erase changes the
  // rows under the service, and a stale copy would keep a PIN that is no longer there.
  const pin = (): StoredPin | null => read(PIN_KEY, storedPin);
  const devices = (): StoredDevice[] => read(DEVICES_KEY, storedDevices) ?? [];
  const saveDevices = (list: StoredDevice[]) => writeRow.run(DEVICES_KEY, JSON.stringify(list), Date.now());

  function live(now: number): StoredDevice[] {
    return devices().filter((device) => now - device.seenAt < DEVICE_DAYS * DAY_MS);
  }

  if (ctx.config.forgetPin && pin()) {
    deleteRow.run(PIN_KEY);
    deleteRow.run(DEVICES_KEY);
    ctx.log.warn("The household PIN was forgotten, as OUTPOST_FORGET_PIN asked. Take that line out of .env again.");
  }

  const service: AccessService = {
    pinOn: () => pin() !== null,

    deviceOf(token, now = Date.now()) {
      if (!token) return null;
      const hash = sha256(token);
      const list = devices();
      const device = list.find((candidate) => candidate.hash === hash);
      if (!device || now - device.seenAt >= DEVICE_DAYS * DAY_MS) return null;
      if (now - device.seenAt > SEEN_EVERY_MS) {
        device.seenAt = now;
        saveDevices(list);
      }
      return device;
    },

    state(token) {
      const set = pin();
      if (!set) return { mode: "open", canChange: true, pinSetAt: null, unlockedDevices: 0, unlockedAt: null };
      const device = service.deviceOf(token);
      return {
        mode: "pin",
        canChange: device !== null,
        pinSetAt: set.setAt,
        unlockedDevices: live(Date.now()).length,
        unlockedAt: device?.unlockedAt ?? null,
      };
    },

    async check(candidate) {
      const set = pin();
      if (!set) return false;
      const expected = Buffer.from(set.hash, "hex");
      const got = await runScrypt(candidate, Buffer.from(set.salt, "hex"), KEY_BYTES, SCRYPT);
      return got.length === expected.length && timingSafeEqual(got, expected);
    },

    async setPin(value, now = Date.now()) {
      const salt = randomBytes(16);
      const hash = await runScrypt(value, salt, KEY_BYTES, SCRYPT);
      const stored: StoredPin = { hash: hash.toString("hex"), salt: salt.toString("hex"), setAt: now };
      sqlite.transaction(() => {
        writeRow.run(PIN_KEY, JSON.stringify(stored), now);
        deleteRow.run(DEVICES_KEY);
      })();
    },

    removePin() {
      sqlite.transaction(() => {
        deleteRow.run(PIN_KEY);
        deleteRow.run(DEVICES_KEY);
      })();
    },

    unlock(now = Date.now()) {
      const token = randomBytes(32).toString("base64url");
      const list = live(now)
        .sort((a, b) => b.seenAt - a.seenAt)
        .slice(0, MOST_DEVICES - 1);
      list.push({ hash: sha256(token), unlockedAt: now, seenAt: now });
      saveDevices(list);
      return token;
    },

    lock(token) {
      if (!token) return;
      const hash = sha256(token);
      const list = devices();
      const kept = list.filter((device) => device.hash !== hash);
      if (kept.length !== list.length) saveDevices(kept);
    },

    lockOthers(token) {
      const hash = token ? sha256(token) : null;
      const list = devices();
      const kept = list.filter((device) => device.hash === hash);
      saveDevices(kept);
      return list.length - kept.length;
    },
  };
  return service;
}

/**
 * Wrong PINs allowed from one address: a few at once, then one a minute. Counted by the
 * address's /64 for IPv6 (`core/address-key.ts`), so that moving to the next address of the
 * same device does not start the count again. Kept as counts and times, no timers. At
 * 10,000 four-digit PINs, one address needs about a week to try them all.
 */
export function createAttemptLimit(options: { burst?: number; perMinute?: number; addresses?: number } = {}) {
  const burst = options.burst ?? 5;
  const perMs = (options.perMinute ?? 1) / 60_000;
  const most = options.addresses ?? 1000;
  const held = new Map<string, { left: number; at: number }>();
  const leftFor = (key: string, now: number) => {
    const entry = held.get(key);
    return entry ? Math.min(burst, entry.left + (now - entry.at) * perMs) : burst;
  };
  return {
    /** 0 when another try is allowed now, otherwise the seconds to wait. */
    wait(key: string, now = Date.now()): number {
      const left = leftFor(key, now);
      return left >= 1 ? 0 : Math.max(1, Math.ceil((1 - left) / perMs / 1000));
    },
    /** Counts a wrong PIN. */
    failed(key: string, now = Date.now()): void {
      const left = leftFor(key, now) - 1;
      held.delete(key);
      held.set(key, { left, at: now });
      while (held.size > most) {
        const oldest = held.keys().next().value;
        if (oldest === undefined) break;
        held.delete(oldest);
      }
    },
  };
}
