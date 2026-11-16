// @vitest-environment node
/**
 * The engine against itself and against GnuPG.
 *
 * Three kinds of proof, in order:
 *
 * 1. Round trips and refusals inside the engine.
 * 2. Files written by GnuPG 2.5.18 (`fixtures/`, made once and committed), so that
 *    "reads what gpg writes" is tested everywhere, with or without gpg installed.
 * 3. A live exchange with the `gpg` on this machine, in a keyring of its own that is
 *    thrown away afterwards. Skipped, and reported as skipped, where there is no gpg.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type PgpEngine, PgpError, parseUserId, type UnlockedKey } from "./engine";
import { createOpenpgpEngine } from "./engine-openpgp";

const fixture = (name: string) => fs.readFileSync(path.join(import.meta.dirname, "fixtures", name), "utf8");
const GNUPG_PASSPHRASE = "test passphrase for fixtures";
const SYMMETRIC_PASSPHRASE = "symmetric fixture";
const PASSPHRASE = "kizif-hagoz-nopud-vatam";

let engine: PgpEngine;
let alice: { publicKey: string; privateKey: string; revocationCertificate: string; fingerprint: string };
let bob: typeof alice;
let aliceKey: UnlockedKey;
let bobKey: UnlockedKey;

async function make(name: string, email: string, expiresInSeconds = 0) {
  const made = await engine.generateKey({ name, email, algorithm: "curve25519", expiresInSeconds, passphrase: PASSPHRASE });
  return { ...made, fingerprint: made.info.fingerprint };
}

const kindOf = async (work: Promise<unknown>): Promise<string> => {
  try {
    await work;
    return "no error";
  } catch (error) {
    return error instanceof PgpError ? error.kind : `not a PgpError: ${String(error)}`;
  }
};

/** Changes one character in the middle of an armoured message's body. */
function tamper(armored: string): string {
  const lines = armored.trim().split("\n");
  const start = lines.indexOf("") + 1;
  const at = start + Math.floor((lines.length - start - 2) / 2);
  const line = lines[at]!;
  const middle = Math.floor(line.length / 2);
  lines[at] = `${line.slice(0, middle)}${line[middle] === "A" ? "B" : "A"}${line.slice(middle + 1)}`;
  // Without the checksum line, so that it is the cryptography that has to notice.
  return lines.filter((entry) => !/^=[A-Za-z0-9+/]{4}$/.test(entry)).join("\n");
}

beforeAll(async () => {
  engine = await createOpenpgpEngine(await import("openpgp"));
  alice = await make("Alice Example", "alice@example.org");
  bob = await make("Bob Example", "bob@example.org");
  aliceKey = await engine.unlock(alice.privateKey, PASSPHRASE);
  bobKey = await engine.unlock(bob.privateKey, PASSPHRASE);
}, 60_000);

describe("keys", () => {
  it("names the library it is built on", () => {
    expect(engine.library).toMatch(/^OpenPGP\.js 6\.3\.2$/);
  });

  it("makes a Curve25519 key in the encoding GnuPG reads, protected by its passphrase", async () => {
    const info = await engine.readPublicKey(alice.publicKey);
    expect(info).toMatchObject({
      name: "Alice Example",
      email: "alice@example.org",
      userIds: ["Alice Example <alice@example.org>"],
      algorithm: "Curve25519",
      status: "valid",
      expiresAt: null,
      canEncrypt: true,
      canSign: true,
      gnupgReadable: true,
    });
    expect(info.fingerprint).toMatch(/^[0-9a-f]{40}$/);
    expect(info.keyIds).toHaveLength(2);
    expect(info.fingerprint.endsWith(info.keyId)).toBe(true);
    const secret = await engine.readPrivateKey(alice.privateKey);
    expect(secret.isProtected).toBe(true);
    expect(secret.fingerprint).toBe(info.fingerprint);
    expect((await engine.readPublicKey(secret.publicKey)).fingerprint).toBe(info.fingerprint);
  });

  it("makes an RSA 4096 key for old correspondents", async () => {
    const made = await engine.generateKey({ name: "Old Friend", algorithm: "rsa4096", expiresInSeconds: 0, passphrase: PASSPHRASE });
    expect(made.info).toMatchObject({ algorithm: "RSA 4096", name: "Old Friend", email: null, gnupgReadable: true });
    expect((await engine.readPrivateKey(made.privateKey)).isProtected).toBe(true);
  }, 120_000);

  it("gives a key the expiry asked for", async () => {
    const made = await make("Two Years", "two@example.org", 2 * 365 * 86400);
    const expected = made.info.createdAt + 2 * 365 * 86400 * 1000;
    expect(made.info.expiresAt).toBe(expected);
  });

  it("will not make a key without a name or without a passphrase", async () => {
    expect(await kindOf(engine.generateKey({ name: " ", algorithm: "curve25519", expiresInSeconds: 0, passphrase: PASSPHRASE }))).toBe(
      "failed",
    );
    expect(await kindOf(engine.generateKey({ name: "Nobody", algorithm: "curve25519", expiresInSeconds: 0, passphrase: "" }))).toBe(
      "failed",
    );
    expect(
      await kindOf(
        engine.generateKey({ name: "Bad", email: "not an address", algorithm: "curve25519", expiresInSeconds: 0, passphrase: PASSPHRASE }),
      ),
    ).toBe("failed");
  });

  it("unlocks with the right passphrase only, and forgets on request", async () => {
    expect(await kindOf(engine.unlock(alice.privateKey, "not the passphrase"))).toBe("wrong-passphrase");
    expect(await kindOf(engine.unlock(alice.privateKey, ""))).toBe("wrong-passphrase");
    const unlocked = await engine.unlock(alice.privateKey, PASSPHRASE);
    expect(unlocked.fingerprint).toBe(alice.fingerprint);
    const signed = await engine.signText("still here", unlocked);
    expect(signed).toContain("BEGIN PGP SIGNED MESSAGE");
    unlocked.forget();
    expect(await kindOf(engine.signText("gone", unlocked))).toBe("failed");
  });

  it("changes a passphrase without changing the key", async () => {
    const changed = await engine.changePassphrase(bob.privateKey, PASSPHRASE, "a different long passphrase");
    expect(await kindOf(engine.unlock(changed, PASSPHRASE))).toBe("wrong-passphrase");
    expect((await engine.unlock(changed, "a different long passphrase")).fingerprint).toBe(bob.fingerprint);
    expect(await kindOf(engine.changePassphrase(bob.privateKey, "wrong", "x"))).toBe("wrong-passphrase");
    expect(await kindOf(engine.changePassphrase(bob.privateKey, PASSPHRASE, ""))).toBe("failed");
  });

  it("tells keys from other things", async () => {
    expect(await kindOf(engine.readPublicKey(alice.privateKey))).toBe("not-a-key");
    expect(await kindOf(engine.readPublicKey("hello"))).toBe("not-a-key");
    expect(await kindOf(engine.readPublicKey(`${alice.publicKey}\n${bob.publicKey}`))).toBe("not-a-key");
    expect(await kindOf(engine.readPrivateKey(alice.publicKey))).toBe("not-a-key");
    expect(await kindOf(engine.readPublicKey(alice.publicKey.slice(0, 300)))).toBe("not-a-key");
    expect(engine.isRevocationCertificate(alice.revocationCertificate)).toBe(true);
    expect(engine.isRevocationCertificate(alice.publicKey)).toBe(false);
    expect(engine.isRevocationCertificate("hello")).toBe(false);
  });

  it("reads a user ID as a name and an address without trusting its form", () => {
    expect(parseUserId("Ada Lovelace <ada@example.org>")).toEqual({ name: "Ada Lovelace", email: "ada@example.org" });
    expect(parseUserId("Ada (work) <ada@example.org>")).toEqual({ name: "Ada", email: "ada@example.org" });
    expect(parseUserId("ada@example.org")).toEqual({ name: "", email: "ada@example.org" });
    expect(parseUserId("Just A Name")).toEqual({ name: "Just A Name", email: null });
    expect(parseUserId("")).toEqual({ name: "", email: null });
  });
});

describe("text", () => {
  const TEXT = "Meet at the bothy at dusk.\nBring the 1:25,000 sheet — and tea ☕.\n";

  it("encrypts to one key and decrypts with it", async () => {
    const armored = await engine.encryptText(TEXT, { recipients: [bob.publicKey] });
    expect(armored).toMatch(/^-----BEGIN PGP MESSAGE-----/);
    expect(armored).not.toContain("bothy");
    expect(await engine.messageNeeds(armored)).toMatchObject({ passphrase: false, encrypted: true });
    expect((await engine.messageNeeds(armored)).keyIds).toHaveLength(1);
    const opened = await engine.decryptText(armored, { keys: [bobKey] });
    expect(opened).toEqual({ text: TEXT, signatures: [] });
  });

  it("encrypts to several keys, any of which opens it, and nobody else's does", async () => {
    const carol = await make("Carol Example", "carol@example.org");
    const armored = await engine.encryptText(TEXT, { recipients: [alice.publicKey, bob.publicKey] });
    expect((await engine.messageNeeds(armored)).keyIds).toHaveLength(2);
    expect((await engine.decryptText(armored, { keys: [aliceKey] })).text).toBe(TEXT);
    expect((await engine.decryptText(armored, { keys: [bobKey] })).text).toBe(TEXT);
    const carolKey = await engine.unlock(carol.privateKey, PASSPHRASE);
    expect(await kindOf(engine.decryptText(armored, { keys: [carolKey] }))).toBe("no-key");
    expect(await kindOf(engine.decryptText(armored, {}))).toBe("no-key");
  });

  it("signs what it encrypts, and says exactly what the signature proves", async () => {
    const armored = await engine.encryptText(TEXT, { recipients: [bob.publicKey], signWith: aliceKey });

    const known = await engine.decryptText(armored, { keys: [bobKey], verifyWith: [alice.publicKey, bob.publicKey] });
    expect(known.text).toBe(TEXT);
    expect(known.signatures).toHaveLength(1);
    expect(known.signatures[0]).toMatchObject({ status: "good", fingerprint: alice.fingerprint, detail: null });
    expect(typeof known.signatures[0]!.signedAt).toBe("number");

    // Without the signer's key the text still opens, and the signature is reported as unchecked, not as good or bad.
    const unknown = await engine.decryptText(armored, { keys: [bobKey], verifyWith: [bob.publicKey] });
    expect(unknown.text).toBe(TEXT);
    expect(unknown.signatures[0]).toMatchObject({ status: "unknown-key", fingerprint: null });
    expect(unknown.signatures[0]!.keyId).toMatch(/^[0-9a-f]{16}$/);
  });

  it("encrypts with a passphrase alone, as gpg -c does", async () => {
    const armored = await engine.encryptText(TEXT, { passphrase: "four words are enough" });
    expect(await engine.messageNeeds(armored)).toEqual({ keyIds: [], passphrase: true, encrypted: true });
    expect((await engine.decryptText(armored, { passphrase: "four words are enough" })).text).toBe(TEXT);
    const wrong = await kindOf(engine.decryptText(armored, { passphrase: "four words are not enough" }));
    expect(["wrong-passphrase", "tampered"]).toContain(wrong);
    expect(await kindOf(engine.decryptText(armored, { keys: [aliceKey] }))).toBe("no-key");
  });

  it("can be opened by a key or by a passphrase when given both", async () => {
    const armored = await engine.encryptText(TEXT, { recipients: [alice.publicKey], passphrase: "either way in" });
    expect(await engine.messageNeeds(armored)).toMatchObject({ passphrase: true, encrypted: true });
    expect((await engine.decryptText(armored, { keys: [aliceKey] })).text).toBe(TEXT);
    expect((await engine.decryptText(armored, { passphrase: "either way in" })).text).toBe(TEXT);
  });

  it("keeps odd text exactly: empty, long, and every kind of character", async () => {
    for (const text of ["", " ", "\n\n", "a", "🙂".repeat(1000), "línea uno\r\nlínea dos\ttab\u0000nul", "x".repeat(200_000)]) {
      const armored = await engine.encryptText(text, { recipients: [alice.publicKey] });
      expect((await engine.decryptText(armored, { keys: [aliceKey] })).text).toBe(text);
    }
  });

  it("shows nothing of a message that was changed after it was encrypted", async () => {
    const toKey = tamper(await engine.encryptText(TEXT, { recipients: [alice.publicKey] }));
    expect(["tampered", "no-key", "not-a-message", "failed"]).toContain(await kindOf(engine.decryptText(toKey, { keys: [aliceKey] })));
    const toPassphrase = tamper(await engine.encryptText(TEXT, { passphrase: "four words are enough" }));
    expect(["tampered", "wrong-passphrase", "not-a-message", "failed"]).toContain(
      await kindOf(engine.decryptText(toPassphrase, { passphrase: "four words are enough" })),
    );
    // Every single-character change in the body is noticed, wherever it falls.
    const armored = await engine.encryptText("short", { recipients: [alice.publicKey] });
    const lines = armored.trim().split("\n");
    const start = lines.indexOf("") + 1;
    const body = lines.slice(start, -2).join("");
    for (let at = 0; at < body.length; at += 7) {
      const changed = `${body.slice(0, at)}${body[at] === "A" ? "B" : "A"}${body.slice(at + 1)}`;
      const message = [...lines.slice(0, start), changed, lines.at(-1)].join("\n");
      expect(await kindOf(engine.decryptText(message, { keys: [aliceKey] })), `character ${at}`).not.toBe("no error");
    }
  });

  it("will not encrypt to nothing, or to something that is not a key", async () => {
    expect(await kindOf(engine.encryptText(TEXT, {}))).toBe("failed");
    expect(await kindOf(engine.encryptText(TEXT, { passphrase: "" }))).toBe("failed");
    expect(await kindOf(engine.encryptText(TEXT, { recipients: ["nonsense"] }))).toBe("not-a-key");
    expect(await kindOf(engine.decryptText("nonsense", { keys: [aliceKey] }))).toBe("not-a-message");
    expect(await kindOf(engine.decryptText(alice.publicKey, { keys: [aliceKey] }))).toBe("not-a-message");
  });
});

describe("signatures", () => {
  const TEXT = "I will be on 145.500 MHz at 19:00.\nAlice";

  it("makes a clear-signed message that reads as it is and verifies", async () => {
    const signed = await engine.signText(TEXT, aliceKey);
    expect(signed).toContain("-----BEGIN PGP SIGNED MESSAGE-----");
    expect(signed).toContain("I will be on 145.500 MHz at 19:00.");
    expect(await engine.messageNeeds(signed)).toEqual({ keyIds: [], passphrase: false, encrypted: false });
    const checked = await engine.verifyText(signed, [alice.publicKey]);
    expect(checked.text.trim()).toBe(TEXT);
    expect(checked.signatures).toEqual([expect.objectContaining({ status: "good", fingerprint: alice.fingerprint })]);
  });

  it("reports a changed text as a bad signature", async () => {
    const signed = (await engine.signText(TEXT, aliceKey)).replace("19:00", "21:00");
    const checked = await engine.verifyText(signed, [alice.publicKey]);
    expect(checked.signatures).toEqual([expect.objectContaining({ status: "bad", fingerprint: alice.fingerprint })]);
    expect(checked.signatures[0]!.detail).toBeTruthy();
  });

  it("reports a signature by a key it was not given as unchecked", async () => {
    const signed = await engine.signText(TEXT, aliceKey);
    expect((await engine.verifyText(signed, [bob.publicKey])).signatures).toEqual([
      expect.objectContaining({ status: "unknown-key", fingerprint: null }),
    ]);
    expect((await engine.verifyText(signed, [])).signatures).toEqual([expect.objectContaining({ status: "unknown-key" })]);
  });

  it("refuses to pass off an encrypted message, or plain words, as a signed one", async () => {
    const encrypted = await engine.encryptText(TEXT, { recipients: [alice.publicKey] });
    expect(await kindOf(engine.verifyText(encrypted, [alice.publicKey]))).toBe("not-a-message");
    expect(await kindOf(engine.verifyText("just words", [alice.publicKey]))).toBe("not-a-message");
  });
});

describe("expired and revoked keys", () => {
  it("reports an expired key as expired and will not encrypt to it", async () => {
    const made = await make("Soon Gone", "gone@example.org", 1);
    await new Promise((resolve) => setTimeout(resolve, 2100));
    const info = await engine.readPublicKey(made.publicKey);
    expect(info).toMatchObject({ status: "expired", canEncrypt: false, canSign: false });
    expect(info.expiresAt).toBeLessThan(Date.now());
    expect(await kindOf(engine.encryptText("too late", { recipients: [made.publicKey] }))).toBe("unusable-key");
  });

  it("still decrypts with an expired key what was encrypted to it before", async () => {
    const made = await make("Brief", "brief@example.org", 2);
    const armored = await engine.encryptText("in time", { recipients: [made.publicKey] });
    await new Promise((resolve) => setTimeout(resolve, 2100));
    expect((await engine.readPublicKey(made.publicKey)).status).toBe("expired");
    const key = await engine.unlock(made.privateKey, PASSPHRASE);
    expect((await engine.decryptText(armored, { keys: [key] })).text).toBe("in time");
  });

  it("makes a revocation certificate without changing the key, and applies it", async () => {
    const made = await make("To Be Revoked", "revoked@example.org");
    const key = await engine.unlock(made.privateKey, PASSPHRASE);
    const certificate = await engine.revocationCertificate(key);
    expect(engine.isRevocationCertificate(certificate)).toBe(true);
    // Making the certificate does nothing to the key.
    expect((await engine.readPublicKey(made.publicKey)).status).toBe("valid");
    expect(await engine.signText("still mine", key)).toContain("SIGNED MESSAGE");

    const revoked = await engine.applyRevocation(made.publicKey, certificate);
    const info = await engine.readPublicKey(revoked);
    expect(info).toMatchObject({ status: "revoked", canEncrypt: false, canSign: false, fingerprint: made.fingerprint });
    expect(await kindOf(engine.encryptText("no", { recipients: [revoked] }))).toBe("unusable-key");

    // The certificate made with the key, at the time it was made, does the same.
    expect((await engine.readPublicKey(await engine.applyRevocation(made.publicKey, made.revocationCertificate))).status).toBe("revoked");
  });

  it("will not apply one key's revocation certificate to another key", async () => {
    expect(await kindOf(engine.applyRevocation(bob.publicKey, alice.revocationCertificate))).toBe("failed");
    expect((await engine.readPublicKey(bob.publicKey)).status).toBe("valid");
  });

  it("does not call a signature by a revoked key good", async () => {
    const made = await make("Signer", "signer@example.org");
    const key = await engine.unlock(made.privateKey, PASSPHRASE);
    const signed = await engine.signText("signed before", key);
    const revoked = await engine.applyRevocation(made.publicKey, await engine.revocationCertificate(key));
    const checked = await engine.verifyText(signed, [revoked]);
    expect(checked.signatures[0]!.status).not.toBe("good");
  });
});

describe("files", () => {
  const bytes = (length: number) => Uint8Array.from({ length }, (_, index) => (index * 31 + (index >> 8)) % 256);
  const same = async (blob: Blob, expected: Uint8Array) =>
    expect(Buffer.from(await blob.arrayBuffer()).equals(Buffer.from(expected))).toBe(true);

  it("encrypts and decrypts a file to a key, keeping its name and every byte", async () => {
    const data = bytes(300_000);
    const seen: number[] = [];
    const encrypted = await engine.encryptFile(new Blob([data]), "route.gpx", { recipients: [alice.publicKey] }, (read) => seen.push(read));
    expect(seen.at(-1)).toBe(data.length);
    expect(encrypted.size).toBeGreaterThan(data.length);
    expect(await engine.fileNeeds(encrypted)).toMatchObject({ passphrase: false, encrypted: true });
    const opened = await engine.decryptFile(encrypted, { keys: [aliceKey] });
    expect(opened.filename).toBe("route.gpx");
    expect(opened.signatures).toEqual([]);
    await same(opened.blob, data);
  });

  it("does the same with a passphrase, armoured, and for an empty file", async () => {
    for (const data of [bytes(70_000), bytes(0), bytes(1)]) {
      const encrypted = await engine.encryptFile(new Blob([data]), "notes.txt", { passphrase: "four words are enough", armor: true });
      expect((await encrypted.slice(0, 27).text()).startsWith("-----BEGIN PGP MESSAGE-----")).toBe(true);
      expect(await engine.fileNeeds(encrypted)).toEqual({ keyIds: [], passphrase: true, encrypted: true });
      const opened = await engine.decryptFile(encrypted, { passphrase: "four words are enough" });
      await same(opened.blob, data);
    }
  });

  it("checks the signature of a signed file", async () => {
    const data = bytes(50_000);
    const encrypted = await engine.encryptFile(new Blob([data]), "signed.bin", { recipients: [bob.publicKey], signWith: aliceKey });
    const opened = await engine.decryptFile(encrypted, { keys: [bobKey], verifyWith: [alice.publicKey] });
    expect(opened.signatures).toEqual([expect.objectContaining({ status: "good", fingerprint: alice.fingerprint })]);
    await same(opened.blob, data);
  });

  it("hands over nothing when a file was changed, is cut short, or is opened with the wrong key or passphrase", async () => {
    const data = bytes(200_000);
    const encrypted = new Uint8Array(
      await (await engine.encryptFile(new Blob([data]), "x.bin", { recipients: [alice.publicKey] })).arrayBuffer(),
    );

    const changed = encrypted.slice();
    changed[Math.floor(changed.length / 2)]! ^= 0x01;
    expect(await kindOf(engine.decryptFile(new Blob([changed]), { keys: [aliceKey] }))).toBe("tampered");

    const lastByte = encrypted.slice();
    lastByte[lastByte.length - 1]! ^= 0x01;
    expect(await kindOf(engine.decryptFile(new Blob([lastByte]), { keys: [aliceKey] }))).toBe("tampered");

    const cut = encrypted.slice(0, encrypted.length - 4000);
    expect(await kindOf(engine.decryptFile(new Blob([cut]), { keys: [aliceKey] }))).not.toBe("no error");

    expect(await kindOf(engine.decryptFile(new Blob([encrypted]), { keys: [bobKey] }))).toBe("no-key");

    const symmetric = await engine.encryptFile(new Blob([data]), "x.bin", { passphrase: "the right one" });
    expect(["wrong-passphrase", "tampered"]).toContain(await kindOf(engine.decryptFile(symmetric, { passphrase: "the wrong one" })));
  });

  it("says so when a file is not an OpenPGP message at all", async () => {
    expect(await kindOf(engine.decryptFile(new Blob(["just a text file\n"]), { passphrase: "x" }))).not.toBe("no error");
    expect(await kindOf(engine.decryptFile(new Blob([alice.publicKey]), { keys: [aliceKey] }))).toBe("not-a-message");
    expect(await kindOf(engine.fileNeeds(new Blob([bytes(5000)])))).not.toBe("no error");
  });
});

describe("what GnuPG 2.5.18 wrote (fixtures)", () => {
  let gnupg: UnlockedKey;
  const gnupgPublic = fixture("gnupg-public.asc");
  beforeAll(async () => {
    gnupg = await engine.unlock(fixture("gnupg-private-protected.asc"), GNUPG_PASSPHRASE);
  });

  it("reads a key made by gpg, public and private", async () => {
    const info = await engine.readPublicKey(gnupgPublic);
    expect(info).toMatchObject({
      fingerprint: fixture("gnupg-fingerprint.txt").trim(),
      name: "Gpg Person",
      email: "gpg@example.org",
      algorithm: "Curve25519",
      status: "valid",
      canEncrypt: true,
      gnupgReadable: true,
    });
    expect(new Date(info.expiresAt!).toISOString().slice(0, 10)).toBe("2030-01-01");
    expect((await engine.readPrivateKey(fixture("gnupg-private-protected.asc"))).isProtected).toBe(true);
    expect(await kindOf(engine.unlock(fixture("gnupg-private-protected.asc"), "wrong"))).toBe("wrong-passphrase");
  });

  it("decrypts what gpg encrypted to its own key (GnuPG's OCB packet)", async () => {
    const opened = await engine.decryptText(fixture("gnupg-encrypted-to-self.asc"), { keys: [gnupg] });
    expect(opened.text).toBe("Written by gpg, encrypted to its own key.\n");
  });

  it("decrypts and verifies what gpg signed and encrypted", async () => {
    const opened = await engine.decryptText(fixture("gnupg-signed-encrypted-to-self.asc"), { keys: [gnupg], verifyWith: [gnupgPublic] });
    expect(opened.text).toBe("Written and signed by gpg.\n");
    expect(opened.signatures).toEqual([expect.objectContaining({ status: "good", fingerprint: fixture("gnupg-fingerprint.txt").trim() })]);
  });

  it("decrypts gpg -c output, armoured and binary", async () => {
    expect((await engine.decryptText(fixture("gnupg-symmetric.asc"), { passphrase: SYMMETRIC_PASSPHRASE })).text).toBe(
      "Written by gpg -c.\n",
    );
    const file = new Blob([fs.readFileSync(path.join(import.meta.dirname, "fixtures/gnupg-symmetric-binary.gpg"))]);
    expect(await engine.fileNeeds(file)).toEqual({ keyIds: [], passphrase: true, encrypted: true });
    const opened = await engine.decryptFile(file, { passphrase: SYMMETRIC_PASSPHRASE });
    const expected = Uint8Array.from({ length: 4096 }, (_, index) => (index * 7) % 256);
    expect(Buffer.from(await opened.blob.arrayBuffer()).equals(Buffer.from(expected))).toBe(true);
    expect(["wrong-passphrase", "tampered"]).toContain(await kindOf(engine.decryptFile(file, { passphrase: "wrong" })));
  });

  it("verifies what gpg clear-signed, and notices a change to it", async () => {
    const signed = fixture("gnupg-clearsigned.asc");
    const checked = await engine.verifyText(signed, [gnupgPublic]);
    expect(checked.text).toContain("Clearsigned by gpg.");
    expect(checked.signatures).toEqual([expect.objectContaining({ status: "good" })]);
    const changed = await engine.verifyText(signed.replace("Second line", "Another line"), [gnupgPublic]);
    expect(changed.signatures).toEqual([expect.objectContaining({ status: "bad" })]);
  });
});

// ── Live, against the gpg on this machine ──

function findGpg(): string | null {
  try {
    return (
      execFileSync("gpg", ["--version"], { stdio: ["ignore", "pipe", "ignore"] })
        .toString()
        .split("\n")[0] ?? null
    );
  } catch {
    return null;
  }
}
/** gpg's agent listens on a socket inside its home, and a socket's path may be at most about 100 characters long. */
function gpgHome(): string | null {
  const candidates = [os.tmpdir(), "/tmp", os.homedir()];
  for (const base of candidates) {
    try {
      const dir = fs.mkdtempSync(path.join(base, "outpost-gpg-"));
      if (path.join(dir, "S.gpg-agent.extra").length < 100) {
        fs.chmodSync(dir, 0o700);
        return dir;
      }
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // Try the next place.
    }
  }
  return null;
}

const gpgVersion = findGpg();
const home = gpgVersion ? gpgHome() : null;

describe.skipIf(!home)(`a live exchange with ${gpgVersion ?? "gpg (not installed here)"}`, () => {
  const work = home ? path.join(home, "work") : "";
  const gpg = (args: string[], input?: string | Buffer): Buffer =>
    execFileSync("gpg", ["--homedir", home!, "--batch", "--yes", "--pinentry-mode", "loopback", ...args], {
      input,
      stdio: ["pipe", "pipe", "pipe"],
    });
  /** gpg writes its verdicts to stderr whether or not it succeeds. */
  const gpgStatus = (args: string[], input?: string | Buffer): string => {
    try {
      return execFileSync("gpg", ["--homedir", home!, "--batch", "--yes", "--pinentry-mode", "loopback", "--status-fd", "1", ...args], {
        input,
        stdio: ["pipe", "pipe", "pipe"],
      }).toString();
    } catch (error) {
      return String((error as { stdout?: Buffer }).stdout ?? "");
    }
  };
  let theirs: { publicKey: string; fingerprint: string };

  beforeAll(() => {
    fs.mkdirSync(work, { recursive: true });
    gpg(["--passphrase", GNUPG_PASSPHRASE, "--quick-generate-key", "Live Gpg <live@example.org>", "default", "default", "1y"]);
    const fingerprint = gpg(["--list-keys", "--with-colons", "live@example.org"])
      .toString()
      .split("\n")
      .find((line) => line.startsWith("fpr"))!
      .split(":")[9]!;
    theirs = { publicKey: gpg(["-a", "--export", fingerprint]).toString(), fingerprint: fingerprint.toLowerCase() };
    fs.writeFileSync(path.join(work, "alice-public.asc"), alice.publicKey);
    fs.writeFileSync(path.join(work, "alice-private.asc"), alice.privateKey);
  }, 60_000);

  afterAll(() => {
    try {
      execFileSync("gpgconf", ["--homedir", home!, "--kill", "all"], { stdio: "ignore" });
    } catch {
      // The agent ends on its own when its home goes.
    }
    fs.rmSync(home!, { recursive: true, force: true });
  });

  it("a key made in Outpost imports into gpg, public and private, under the same fingerprint", () => {
    gpg(["--import", path.join(work, "alice-public.asc")]);
    gpg(["--passphrase", PASSPHRASE, "--import", path.join(work, "alice-private.asc")]);
    const listed = gpg(["--list-secret-keys", "--with-colons", alice.fingerprint]).toString();
    expect(listed.toLowerCase()).toContain(alice.fingerprint);
    expect(listed).toContain("Alice Example <alice@example.org>");
    expect(listed.split("\n").filter((line) => /^(sec|ssb):/.test(line))).toHaveLength(2);
  });

  it("gpg decrypts what Outpost encrypted to an Outpost-made key and to a gpg-made key", async () => {
    const toAlice = await engine.encryptText("from Outpost to its own key", { recipients: [alice.publicKey] });
    expect(gpg(["--passphrase", PASSPHRASE, "-d"], toAlice).toString()).toBe("from Outpost to its own key");
    const toTheirs = await engine.encryptText("from Outpost to gpg's key", { recipients: [theirs.publicKey] });
    expect(gpg(["--passphrase", GNUPG_PASSPHRASE, "-d"], toTheirs).toString()).toBe("from Outpost to gpg's key");
  });

  it("Outpost decrypts what gpg encrypted to an Outpost-made key and to its own", async () => {
    const toAlice = gpg(["--trust-model", "always", "-a", "-e", "-r", alice.fingerprint], "from gpg to Outpost's key").toString();
    expect((await engine.decryptText(toAlice, { keys: [aliceKey] })).text).toBe("from gpg to Outpost's key");

    const secret = gpg(["--passphrase", GNUPG_PASSPHRASE, "-a", "--export-secret-keys", theirs.fingerprint]).toString();
    const imported = await engine.readPrivateKey(secret);
    expect(imported).toMatchObject({ fingerprint: theirs.fingerprint, isProtected: true });
    const theirKey = await engine.unlock(secret, GNUPG_PASSPHRASE);
    const toTheirs = gpg(["--trust-model", "always", "-a", "-e", "-r", theirs.fingerprint], "from gpg to its own key").toString();
    expect((await engine.decryptText(toTheirs, { keys: [theirKey] })).text).toBe("from gpg to its own key");
  });

  it("signatures verify in both directions, and a changed text fails in both", async () => {
    const byOutpost = await engine.signText("signed in Outpost", aliceKey);
    expect(gpgStatus(["--verify"], byOutpost)).toMatch(new RegExp(`GOODSIG [0-9A-F]*${alice.fingerprint.slice(-16).toUpperCase()}`));
    expect(gpgStatus(["--verify"], byOutpost.replace("signed in Outpost", "signed in 0utpost"))).toMatch(/BADSIG/);

    const byGpg = gpg(["--passphrase", GNUPG_PASSPHRASE, "-u", theirs.fingerprint, "--clearsign"], "signed in gpg\n").toString();
    expect((await engine.verifyText(byGpg, [theirs.publicKey])).signatures).toEqual([
      expect.objectContaining({ status: "good", fingerprint: theirs.fingerprint }),
    ]);
    expect((await engine.verifyText(byGpg.replace("signed in gpg", "signed in gpp"), [theirs.publicKey])).signatures[0]!.status).toBe(
      "bad",
    );

    // A signed and encrypted message, each way.
    const sealed = await engine.encryptText("sealed in Outpost", { recipients: [theirs.publicKey], signWith: aliceKey });
    const status = gpgStatus(["--passphrase", GNUPG_PASSPHRASE, "-d"], sealed);
    expect(status).toMatch(/GOODSIG/);
    expect(status).toMatch(/DECRYPTION_OKAY/);
    const sealedByGpg = gpg(
      ["--passphrase", GNUPG_PASSPHRASE, "--trust-model", "always", "-a", "-s", "-e", "-u", theirs.fingerprint, "-r", alice.fingerprint],
      "sealed in gpg",
    ).toString();
    const opened = await engine.decryptText(sealedByGpg, { keys: [aliceKey], verifyWith: [theirs.publicKey] });
    expect(opened.text).toBe("sealed in gpg");
    expect(opened.signatures).toEqual([expect.objectContaining({ status: "good", fingerprint: theirs.fingerprint })]);
  });

  it("passphrase-only messages and files cross in both directions", async () => {
    const fromOutpost = await engine.encryptText("symmetric from Outpost", { passphrase: "shared words here" });
    expect(gpg(["--passphrase", "shared words here", "-d"], fromOutpost).toString()).toBe("symmetric from Outpost");

    const data = Buffer.from(Uint8Array.from({ length: 150_000 }, (_, index) => (index * 13) % 256));
    fs.writeFileSync(path.join(work, "plain.bin"), data);
    gpg(["--passphrase", "shared words here", "-o", path.join(work, "plain.bin.gpg"), "-c", path.join(work, "plain.bin")]);
    const opened = await engine.decryptFile(new Blob([fs.readFileSync(path.join(work, "plain.bin.gpg"))]), {
      passphrase: "shared words here",
    });
    expect(Buffer.from(await opened.blob.arrayBuffer()).equals(data)).toBe(true);
    expect(opened.filename).toBe("plain.bin");

    const encrypted = await engine.encryptFile(new Blob([data]), "from-outpost.bin", { passphrase: "shared words here" });
    fs.writeFileSync(path.join(work, "from-outpost.bin.gpg"), Buffer.from(await encrypted.arrayBuffer()));
    expect(gpg(["--passphrase", "shared words here", "-d", path.join(work, "from-outpost.bin.gpg")]).equals(data)).toBe(true);

    const toKey = await engine.encryptFile(new Blob([data]), "to-key.bin", { recipients: [theirs.publicKey], signWith: aliceKey });
    fs.writeFileSync(path.join(work, "to-key.bin.gpg"), Buffer.from(await toKey.arrayBuffer()));
    expect(gpg(["--passphrase", GNUPG_PASSPHRASE, "-d", path.join(work, "to-key.bin.gpg")]).equals(data)).toBe(true);
  });

  it("gpg imports a revocation certificate made in Outpost and marks the key revoked", async () => {
    const made = await make("Live Revoked", "live-revoked@example.org");
    gpg(["--import"], made.publicKey);
    const key = await engine.unlock(made.privateKey, PASSPHRASE);
    gpg(["--import"], await engine.revocationCertificate(key));
    const listed = gpg(["--list-keys", "--with-colons", made.fingerprint]).toString();
    expect(listed.split("\n").find((line) => line.startsWith("pub:"))).toMatch(/^pub:r:/);
  });

  it("Outpost applies a revocation certificate made by gpg", async () => {
    const certificate = gpgRevocation();
    expect(engine.isRevocationCertificate(certificate)).toBe(true);
    const revoked = await engine.applyRevocation(theirs.publicKey, certificate);
    expect((await engine.readPublicKey(revoked)).status).toBe("revoked");
  });

  /** gpg writes a certificate for each key it makes; the stored copy has a colon in front of its first line so that it is not used by accident. */
  function gpgRevocation(): string {
    const stored = fs.readFileSync(path.join(home!, "openpgp-revocs.d", `${theirs.fingerprint.toUpperCase()}.rev`), "utf8");
    const start = stored.indexOf(":-----BEGIN PGP PUBLIC KEY BLOCK-----");
    return stored.slice(start + 1);
  }
});
