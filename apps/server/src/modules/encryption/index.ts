/**
 * Encryption: a shelf for OpenPGP keys.
 *
 * The server does no cryptography. Keys are made, unlocked and used in the browser
 * (`apps/web/src/features/encryption`); a passphrase, an unlocked key and the text
 * being encrypted never arrive here. What the server keeps is:
 *
 * - public keys, which are public;
 * - a private key, only when a person chose to keep it here as well as on their
 *   device, and only in the form its passphrase protects. `packets.ts` reads each key's
 *   framing and refuses one whose secret part is in the clear.
 *
 * There are no accounts, so everyone who can reach Outpost can read and change this
 * shelf: add a key, replace one, delete one, download a protected private key and try
 * passphrases against it at leisure. The browser therefore trusts nothing here but the
 * bytes: it works out names and fingerprints from the keys themselves, and "I have
 * checked this key" is remembered on the device, by fingerprint, never on the server.
 */
import { MAX_KEY_ARMOR_BYTES, MAX_STORED_KEYS, type StoredKey } from "@outpost/shared";
import { eq, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppContext } from "../../core/context.ts";
import { AppError, badRequest, notFound } from "../../core/errors.ts";
import { pgpKeys } from "../../db/schema.ts";
import { inspectPrivateKey, inspectPublicKey } from "./packets.ts";

type KeyRow = typeof pgpKeys.$inferSelect;

const armor = z
  .string()
  .min(1)
  .max(MAX_KEY_ARMOR_BYTES, `A key can be at most ${MAX_KEY_ARMOR_BYTES / 1000} kB. This one is larger, so it was not stored.`);
const saveBody = z.object({ publicKey: armor, mine: z.boolean().optional() });
const privateBody = z.object({ privateKey: armor });
const fingerprintParams = z.object({
  fingerprint: z.string().regex(/^[0-9a-fA-F]{40}([0-9a-fA-F]{24})?$/, "That is not a key fingerprint."),
});

const toDto = (row: KeyRow): StoredKey => ({
  fingerprint: row.fingerprint,
  publicKey: row.publicArmored,
  hasPrivateKey: row.privateArmored !== null,
  mine: row.mine,
  addedAt: row.createdAt,
  updatedAt: row.updatedAt,
});

/** One trailing newline, so that a key saved to a file is a well-formed text file. */
const tidy = (text: string) => `${text.replace(/^﻿/, "").trim().replace(/\r\n/g, "\n")}\n`;

export async function registerEncryption(app: FastifyInstance, ctx: AppContext): Promise<void> {
  const { db } = ctx;
  const changed = (fingerprint: string) => ctx.events.publish({ type: "encryption.changed", id: fingerprint });

  const find = (fingerprint: string): KeyRow => {
    const row = db.select().from(pgpKeys).where(eq(pgpKeys.fingerprint, fingerprint.toLowerCase())).get();
    if (!row) throw notFound("Key");
    return row;
  };

  app.get("/api/encryption/keys", async () => {
    return { keys: db.select().from(pgpKeys).orderBy(pgpKeys.createdAt, pgpKeys.fingerprint).all().map(toDto) };
  });

  /**
   * Adds a public key, or replaces the stored copy of the same key (which is how a new
   * expiry date or a revocation arrives). The key is filed under the fingerprint the
   * server works out, whatever the request says.
   */
  app.put("/api/encryption/keys", async (request) => {
    const body = saveBody.parse(request.body);
    const publicKey = tidy(body.publicKey);
    const facts = inspectPublicKey(publicKey);
    const now = Date.now();
    const existing = db.select().from(pgpKeys).where(eq(pgpKeys.fingerprint, facts.fingerprint)).get();
    if (existing) {
      db.update(pgpKeys)
        .set({ publicArmored: publicKey, mine: existing.mine || body.mine === true, updatedAt: now })
        .where(eq(pgpKeys.fingerprint, facts.fingerprint))
        .run();
    } else {
      const count = db.select({ n: sql<number>`count(*)` }).from(pgpKeys).get()?.n ?? 0;
      if (count >= MAX_STORED_KEYS) {
        throw new AppError("too_large", `Outpost keeps at most ${MAX_STORED_KEYS} keys. Delete one you no longer need, then add this one.`);
      }
      db.insert(pgpKeys)
        .values({ fingerprint: facts.fingerprint, publicArmored: publicKey, mine: body.mine === true, createdAt: now, updatedAt: now })
        .run();
    }
    changed(facts.fingerprint);
    return { key: toDto(find(facts.fingerprint)) };
  });

  app.get("/api/encryption/keys/:fingerprint/private", async (request, reply) => {
    const { fingerprint } = fingerprintParams.parse(request.params);
    const row = find(fingerprint);
    if (row.privateArmored === null) throw new AppError("not_found", "The private half of this key is not kept on Outpost.");
    reply.header("Cache-Control", "no-store");
    return { privateKey: row.privateArmored };
  });

  /**
   * Keeps the private half of a key that is already on the shelf. It must be the same
   * key, and every secret part of it must be protected by a passphrase.
   */
  app.put("/api/encryption/keys/:fingerprint/private", async (request) => {
    const { fingerprint } = fingerprintParams.parse(request.params);
    const row = find(fingerprint);
    const privateKey = tidy(privateBody.parse(request.body).privateKey);
    const facts = inspectPrivateKey(privateKey);
    if (facts.fingerprint !== row.fingerprint) {
      throw badRequest("That private key belongs to a different key from the one it was sent for, so it was not stored.");
    }
    db.update(pgpKeys)
      .set({ privateArmored: privateKey, mine: true, updatedAt: Date.now() })
      .where(eq(pgpKeys.fingerprint, row.fingerprint))
      .run();
    changed(row.fingerprint);
    return { key: toDto(find(row.fingerprint)) };
  });

  /** Stops keeping the private half here. Copies on people's devices are not touched. */
  app.delete("/api/encryption/keys/:fingerprint/private", async (request) => {
    const { fingerprint } = fingerprintParams.parse(request.params);
    const row = find(fingerprint);
    db.update(pgpKeys).set({ privateArmored: null, updatedAt: Date.now() }).where(eq(pgpKeys.fingerprint, row.fingerprint)).run();
    changed(row.fingerprint);
    return { key: toDto(find(row.fingerprint)) };
  });

  app.delete("/api/encryption/keys/:fingerprint", async (request) => {
    const { fingerprint } = fingerprintParams.parse(request.params);
    const row = find(fingerprint);
    db.delete(pgpKeys).where(eq(pgpKeys.fingerprint, row.fingerprint)).run();
    changed(row.fingerprint);
    return { ok: true };
  });
}
