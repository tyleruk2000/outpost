/**
 * The key shelf. The fixtures in fixtures/pgp were made once with OpenPGP.js 6.3.2 and
 * GnuPG 2.5.18 (see fixtures/pgp/README.md); the server has no OpenPGP library, so
 * these tests are also the proof that its packet reader agrees with both on what a
 * key's fingerprint is and whether its private part is protected.
 */
import fs from "node:fs";
import path from "node:path";
import { MAX_KEY_ARMOR_BYTES } from "@outpost/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { inspectPrivateKey, inspectPublicKey } from "../src/modules/encryption/packets.ts";
import { createTestApp, type TestApp } from "./helpers.ts";

const fixture = (name: string) => fs.readFileSync(path.join(import.meta.dirname, "fixtures/pgp", name), "utf8");
const fingerprint = (name: string) => fixture(`${name}-fingerprint.txt`).trim();

const KEYS = ["curve25519", "rsa4096", "ed25519-new", "v6", "gnupg"] as const;

describe("reading a key's framing", () => {
  it.each(KEYS)("works out the fingerprint of a %s public key as OpenPGP.js and GnuPG do", (name) => {
    expect(inspectPublicKey(fixture(`${name}-public.asc`)).fingerprint).toBe(fingerprint(name));
  });

  it.each(KEYS)("accepts a %s private key that its passphrase protects, under the same fingerprint", (name) => {
    expect(inspectPrivateKey(fixture(`${name}-private-protected.asc`)).fingerprint).toBe(fingerprint(name));
  });

  it("reads the user IDs and counts the subkeys", () => {
    const facts = inspectPublicKey(fixture("gnupg-public.asc"));
    expect(facts.userIds).toEqual(["Gpg Person <gpg@example.org>"]);
    expect(facts.subkeys).toBe(1);
    expect(facts.version).toBe(4);
    expect(inspectPublicKey(fixture("v6-public.asc")).version).toBe(6);
  });

  it.each(["curve25519", "v6"])("refuses a %s private key that is in the clear", (name) => {
    expect(() => inspectPrivateKey(fixture(`${name}-private-unprotected.asc`))).toThrow(/not protected by a passphrase/);
  });

  it("refuses a private key offered as a public one, and the other way round", () => {
    expect(() => inspectPublicKey(fixture("curve25519-private-protected.asc"))).toThrow(/private key/);
    expect(() => inspectPrivateKey(fixture("curve25519-public.asc"))).toThrow(/not an armoured private key/);
  });

  it("refuses private packets dressed in a public key's armour", () => {
    const dressed = fixture("curve25519-private-unprotected.asc").replaceAll("PRIVATE KEY BLOCK", "PUBLIC KEY BLOCK");
    expect(() => inspectPublicKey(dressed)).toThrow(/private key/i);
  });

  it("refuses a revocation certificate, two keys at once, and things that are not keys", () => {
    expect(() => inspectPublicKey(fixture("curve25519-revocation.asc"))).toThrow(/signature on its own/);
    expect(() => inspectPublicKey(fixture("two-keys.asc"))).toThrow(/one key at a time/);
    expect(() => inspectPublicKey(`${fixture("gnupg-public.asc")}\n${fixture("curve25519-public.asc")}`)).toThrow(
      /one key at a time|more than one/,
    );
    expect(() => inspectPublicKey("hello")).toThrow(/not an armoured public key/);
    expect(() =>
      inspectPublicKey("-----BEGIN PGP PUBLIC KEY BLOCK-----\n\naGVsbG8gd29ybGQ=\n-----END PGP PUBLIC KEY BLOCK-----"),
    ).toThrow();
  });

  it("refuses a key that has been cut short, wherever the cut falls", () => {
    const lines = fixture("gnupg-public.asc").trim().split("\n");
    for (let keep = 3; keep < lines.length - 2; keep += 1) {
      const cut = [...lines.slice(0, keep), lines.at(-1)].join("\n");
      expect(() => inspectPublicKey(cut), `kept ${keep} lines`).toThrow();
    }
  });

  it("refuses a protected key whose protection octet has been turned off", () => {
    // Flip the S2K usage octet of the primary key from 254 to 0 and see that it is noticed.
    const armored = fixture("curve25519-private-protected.asc");
    const lines = armored.trim().split("\n");
    const start = lines.indexOf("") + 1;
    const bodyLines = lines.slice(start, -1).filter((line) => !line.startsWith("="));
    const bytes = Buffer.from(bodyLines.join(""), "base64");
    const at = bytes.indexOf(254);
    expect(at).toBeGreaterThan(0);
    bytes[at] = 0;
    const tampered = [...lines.slice(0, start), bytes.toString("base64"), lines.at(-1)].join("\n");
    expect(() => inspectPrivateKey(tampered)).toThrow(/not protected by a passphrase/);
  });
});

describe("the key shelf API", () => {
  let app: TestApp;
  beforeEach(async () => {
    app = await createTestApp();
  });
  afterEach(() => app.close());

  const list = async () => (await app.api("GET", "/api/encryption/keys")).body.keys as Array<Record<string, unknown>>;

  it("starts empty, then keeps public keys under the fingerprint it worked out", async () => {
    expect(await list()).toEqual([]);
    const added = await app.api("PUT", "/api/encryption/keys", { publicKey: fixture("gnupg-public.asc") });
    expect(added.status, JSON.stringify(added.body)).toBe(200);
    expect(added.body.key).toMatchObject({ fingerprint: fingerprint("gnupg"), hasPrivateKey: false, mine: false });
    expect(added.body.key.publicKey).toContain("BEGIN PGP PUBLIC KEY BLOCK");
    await app.api("PUT", "/api/encryption/keys", { publicKey: fixture("rsa4096-public.asc"), mine: true });
    expect((await list()).map((key) => [key.fingerprint, key.mine])).toEqual([
      [fingerprint("gnupg"), false],
      [fingerprint("rsa4096"), true],
    ]);
  });

  it("replaces the stored copy when the same key is added again, without forgetting that it is mine", async () => {
    await app.api("PUT", "/api/encryption/keys", { publicKey: fixture("gnupg-public.asc"), mine: true });
    const again = await app.api("PUT", "/api/encryption/keys", { publicKey: `\n${fixture("gnupg-public.asc")}\n\n` });
    expect(again.body.key.mine).toBe(true);
    expect(await list()).toHaveLength(1);
  });

  it("never accepts private material as a public key", async () => {
    for (const name of ["curve25519-private-protected.asc", "curve25519-private-unprotected.asc"]) {
      const response = await app.api("PUT", "/api/encryption/keys", { publicKey: fixture(name) });
      expect(response.status).toBe(400);
      expect(response.body.error.message).toMatch(/private key/);
    }
    const dressed = fixture("curve25519-private-unprotected.asc").replaceAll("PRIVATE KEY BLOCK", "PUBLIC KEY BLOCK");
    expect((await app.api("PUT", "/api/encryption/keys", { publicKey: dressed })).status).toBe(400);
    expect(await list()).toEqual([]);
  });

  it("keeps a protected private key, hands it back unchanged, and never lists it", async () => {
    await app.api("PUT", "/api/encryption/keys", { publicKey: fixture("curve25519-public.asc") });
    const fp = fingerprint("curve25519");
    const saved = await app.api("PUT", `/api/encryption/keys/${fp}/private`, { privateKey: fixture("curve25519-private-protected.asc") });
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    expect(saved.body.key).toMatchObject({ hasPrivateKey: true, mine: true });
    expect(JSON.stringify(saved.body)).not.toContain("PRIVATE KEY");
    expect(JSON.stringify(await list())).not.toContain("PRIVATE KEY");

    const fetched = await app.api("GET", `/api/encryption/keys/${fp.toUpperCase()}/private`);
    expect(fetched.status).toBe(200);
    expect(fetched.headers["cache-control"]).toBe("no-store");
    expect(fetched.body.privateKey.trim()).toBe(fixture("curve25519-private-protected.asc").trim());
    // What is handed back is still the protected form.
    expect(() => inspectPrivateKey(fetched.body.privateKey)).not.toThrow();
  });

  it("never accepts a private key in the clear, and stores nothing of it", async () => {
    for (const name of ["curve25519", "v6"]) {
      await app.api("PUT", "/api/encryption/keys", { publicKey: fixture(`${name}-public.asc`) });
      const response = await app.api("PUT", `/api/encryption/keys/${fingerprint(name)}/private`, {
        privateKey: fixture(`${name}-private-unprotected.asc`),
      });
      expect(response.status).toBe(400);
      expect(response.body.error.message).toMatch(/not protected by a passphrase/);
      expect((await app.api("GET", `/api/encryption/keys/${fingerprint(name)}/private`)).status).toBe(404);
    }
    const stored = app.ctx.sqlite.prepare("SELECT count(*) AS n FROM pgp_keys WHERE private_armored IS NOT NULL").get() as { n: number };
    expect(stored.n).toBe(0);
  });

  it("refuses a private key sent for a different key, or for one that is not on the shelf", async () => {
    await app.api("PUT", "/api/encryption/keys", { publicKey: fixture("gnupg-public.asc") });
    const wrong = await app.api("PUT", `/api/encryption/keys/${fingerprint("gnupg")}/private`, {
      privateKey: fixture("curve25519-private-protected.asc"),
    });
    expect(wrong.status).toBe(400);
    expect(wrong.body.error.message).toMatch(/different key/);
    const missing = await app.api("PUT", `/api/encryption/keys/${fingerprint("curve25519")}/private`, {
      privateKey: fixture("curve25519-private-protected.asc"),
    });
    expect(missing.status).toBe(404);
  });

  it("stops keeping a private key when asked, and deletes a key whole", async () => {
    const fp = fingerprint("gnupg");
    await app.api("PUT", "/api/encryption/keys", { publicKey: fixture("gnupg-public.asc") });
    await app.api("PUT", `/api/encryption/keys/${fp}/private`, { privateKey: fixture("gnupg-private-protected.asc") });
    const dropped = await app.api("DELETE", `/api/encryption/keys/${fp}/private`);
    expect(dropped.body.key).toMatchObject({ hasPrivateKey: false, mine: true });
    expect((await app.api("GET", `/api/encryption/keys/${fp}/private`)).status).toBe(404);

    expect((await app.api("DELETE", `/api/encryption/keys/${fp}`)).status).toBe(200);
    expect(await list()).toEqual([]);
    expect((await app.api("DELETE", `/api/encryption/keys/${fp}`)).status).toBe(404);
  });

  it("validates what it is sent", async () => {
    expect((await app.api("PUT", "/api/encryption/keys", {})).status).toBe(400);
    expect((await app.api("PUT", "/api/encryption/keys", { publicKey: "" })).status).toBe(400);
    expect((await app.api("PUT", "/api/encryption/keys", { publicKey: "not a key" })).status).toBe(400);
    const large = await app.api("PUT", "/api/encryption/keys", { publicKey: "A".repeat(MAX_KEY_ARMOR_BYTES + 1) });
    expect(large.status).toBe(400);
    expect(large.body.error.message).toMatch(/at most 100 kB/);
    expect((await app.api("GET", "/api/encryption/keys/not-a-fingerprint/private")).status).toBe(400);
    expect((await app.api("DELETE", "/api/encryption/keys/../../etc")).status).not.toBe(200);
  });

  it("needs the header every changing request needs", async () => {
    const response = await app.app.inject({
      method: "PUT",
      url: "/api/encryption/keys",
      headers: { host: "localhost", "content-type": "application/json" },
      payload: { publicKey: fixture("gnupg-public.asc") },
    });
    expect(response.statusCode).toBe(403);
  });

  it("tells open screens when the shelf changes", async () => {
    const seen: string[] = [];
    const stop = app.ctx.events.subscribe((event) => {
      if (event.type === "encryption.changed") seen.push(event.id ?? "");
    });
    await app.api("PUT", "/api/encryption/keys", { publicKey: fixture("gnupg-public.asc") });
    await app.api("DELETE", `/api/encryption/keys/${fingerprint("gnupg")}`);
    stop();
    expect(seen).toEqual([fingerprint("gnupg"), fingerprint("gnupg")]);
  });
});
