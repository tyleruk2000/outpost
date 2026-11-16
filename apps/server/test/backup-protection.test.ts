import {
  createDecipheriv,
  createHash,
  createPrivateKey,
  createPublicKey,
  diffieHellman,
  hkdfSync,
  randomBytes,
  scryptSync,
} from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import os from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import type { BackupStatus, StoredBackup } from "@outpost/shared";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { verifyBackupFile } from "../src/modules/backup/archive.ts";
import { PROTECTION_KEY, settleStagedProtection } from "../src/modules/backup/protection.ts";
import {
  BackupDamaged,
  BackupLocked,
  CHUNK_BYTES,
  chooseLogN,
  MAGIC,
  makeProtectionKey,
  openSealed,
  type ProtectionKey,
  parseHeader,
  readSealedHeader,
  SCRYPT_LOGN_FLOOR,
  seal,
} from "../src/modules/backup/sealed.ts";
import { BACKUP_FOLDER, recordName } from "../src/modules/backup/stored.ts";
import { prepareDriveDatabase } from "../src/modules/portable/database.ts";
import { createTestApp, type TestApp } from "./helpers.ts";

const apps: TestApp[] = [];
const scratch: string[] = [];
afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
  for (const dir of scratch.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

const tmp = (): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "outpost-sealed-"));
  scratch.push(dir);
  return dir;
};

const FIRST = "correct horse battery staple";
const SECOND = "ʻO ka pō nui hoʻolakolako — 夜 🌒";
const SEALED_CHUNK = CHUNK_BYTES + 16;

// ── The envelope on its own ─────────────────────────────────────────────────

/** Seals `plain` to `key` and writes the protected file. */
async function sealToFile(key: ProtectionKey, plain: Buffer, manifest = '{"note":"header"}'): Promise<{ file: string; fileKey: Buffer }> {
  const file = path.join(tmp(), "sealed.bin");
  const sealing = seal(key, manifest);
  const written = pipeline(sealing.stream, fs.createWriteStream(file));
  // In uneven pieces, as a zip arrives.
  for (let offset = 0; offset < plain.length; offset += 50_001) sealing.stream.write(plain.subarray(offset, offset + 50_001));
  sealing.stream.end();
  await written;
  return { file, fileKey: sealing.fileKey };
}

async function readAll(file: string, passphrase: string): Promise<Buffer> {
  const sealed = await openSealed(file, { passphrase });
  try {
    await sealed.checkWhole();
    const chunks: Buffer[] = [];
    for await (const chunk of sealed.read(0, sealed.size)) chunks.push(chunk as Buffer);
    return Buffer.concat(chunks);
  } finally {
    await sealed.close();
  }
}

/** A copy of `file` with one change made to its bytes. */
function altered(file: string, change: (bytes: Buffer) => Buffer): string {
  const copy = path.join(tmp(), "altered.bin");
  fs.writeFileSync(copy, change(Buffer.from(fs.readFileSync(file))));
  return copy;
}

const flip = (at: number) => (bytes: Buffer) => {
  const index = at < 0 ? bytes.length + at : at;
  bytes[index] = bytes[index]! ^ 0x01;
  return bytes;
};

/** Changes a header byte and puts the header's checksum right again, as someone altering the file on purpose would. */
const flipAndRechecksum = (at: number) => (bytes: Buffer) => {
  const length = bytes.readUInt32BE(9);
  bytes[at] = bytes[at]! ^ 0x01;
  createHash("sha256")
    .update(bytes.subarray(0, length - 32))
    .digest()
    .copy(bytes, length - 32);
  return bytes;
};

/**
 * A reader written from the description in docs/storage.md alone, sharing no code with
 * `sealed.ts`: if the two disagree, the document is wrong or the code is.
 */
function readByTheDocument(file: Buffer, passphrase: string): { plain: Buffer; manifest: string } {
  if (file.subarray(0, 8).toString("ascii") !== "OPBACKUP" || file[8] !== 1) throw new Error("not version 1");
  const headerLength = file.readUInt32BE(9);
  const chunkBytes = file.readUInt32BE(13);
  const publicKey = file.subarray(17, 49);
  const ephemeral = file.subarray(49, 81);
  const [logN, r, p] = [file[81]!, file[82]!, file[83]!];
  const salt = file.subarray(84, 116);
  const wrapNonce = file.subarray(116, 128);
  const wrapped = file.subarray(128, 176);
  const manifestLength = file.readUInt16BE(176);
  const manifest = file.subarray(178, 178 + manifestLength).toString("utf8");
  const checksum = file.subarray(178 + manifestLength, headerLength);
  if (
    !createHash("sha256")
      .update(file.subarray(0, 178 + manifestLength))
      .digest()
      .equals(checksum)
  )
    throw new Error("header checksum");

  const wrappingKey = scryptSync(Buffer.from(passphrase.normalize("NFC"), "utf8"), salt, 32, { N: 2 ** logN, r, p, maxmem: 2 ** 31 });
  const unwrap = createDecipheriv("chacha20-poly1305", wrappingKey, wrapNonce, { authTagLength: 16 });
  unwrap.setAAD(Buffer.concat([Buffer.from("outpost-backup-v1 key", "ascii"), publicKey]), { plaintextLength: 32 });
  unwrap.setAuthTag(wrapped.subarray(32));
  const privateKey = Buffer.concat([unwrap.update(wrapped.subarray(0, 32)), unwrap.final()]);

  const shared = diffieHellman({
    privateKey: createPrivateKey({
      key: Buffer.concat([Buffer.from("302e020100300506032b656e04220420", "hex"), privateKey]),
      format: "der",
      type: "pkcs8",
    }),
    publicKey: createPublicKey({
      key: Buffer.concat([Buffer.from("302a300506032b656e032100", "hex"), ephemeral]),
      format: "der",
      type: "spki",
    }),
  });
  const fileKey = Buffer.from(
    hkdfSync(
      "sha256",
      shared,
      Buffer.concat([ephemeral, publicKey]),
      Buffer.concat([Buffer.from("outpost-backup-v1 file", "ascii"), checksum]),
      32,
    ),
  );

  const out: Buffer[] = [];
  let index = 0;
  for (let offset = headerLength; ; offset += chunkBytes + 16, index += 1) {
    const sealedChunk = file.subarray(offset, offset + chunkBytes + 16);
    const last = offset + chunkBytes + 16 >= file.length;
    const nonce = Buffer.alloc(12);
    nonce.writeUInt32BE(index, 7);
    nonce[11] = last ? 1 : 0;
    const open = createDecipheriv("chacha20-poly1305", fileKey, nonce, { authTagLength: 16 });
    open.setAuthTag(sealedChunk.subarray(sealedChunk.length - 16));
    out.push(open.update(sealedChunk.subarray(0, sealedChunk.length - 16)), open.final());
    if (last) break;
  }
  return { plain: Buffer.concat(out), manifest };
}

describe("the envelope around a protected backup", () => {
  it("chooses the work a passphrase is put through from how fast and how large the computer is, never below the floor", () => {
    const GiB = 2 ** 30;
    // 63 ms at the floor: eight times that is about half a second, sixteen times is over a second.
    expect(chooseLogN(63, 32 * GiB)).toBe(18);
    // A slow computer still does the floor's work, however long it takes.
    expect(chooseLogN(5000, 32 * GiB)).toBe(SCRYPT_LOGN_FLOOR);
    // A fast one stops at the ceiling.
    expect(chooseLogN(1, 64 * GiB)).toBe(19);
    // And none uses more than an eighth of its memory: 2 GiB allows 256 MiB, 1 GiB 128 MiB, and 128 MiB only the floor.
    expect(chooseLogN(1, 2 * GiB)).toBe(18);
    expect(chooseLogN(1, 1 * GiB)).toBe(17);
    expect(chooseLogN(1, GiB / 8)).toBe(SCRYPT_LOGN_FLOOR);
  });

  it("gives back exactly what went in, whatever its length, and reads any part of it", async () => {
    const key = await makeProtectionKey(FIRST, SCRYPT_LOGN_FLOOR);
    for (const length of [0, 1, CHUNK_BYTES - 1, CHUNK_BYTES, CHUNK_BYTES + 1, 3 * CHUNK_BYTES, 3 * CHUNK_BYTES + 777]) {
      const plain = randomBytes(length);
      const { file } = await sealToFile(key, plain);
      expect((await readAll(file, FIRST)).equals(plain), `length ${length}`).toBe(true);
      // One tag for every chunk, and a last chunk even when there is nothing to put in it.
      const chunks = Math.max(1, Math.ceil(length / CHUNK_BYTES));
      const header = (await readSealedHeader(file))!;
      expect(fs.statSync(file).size).toBe(header.length + length + chunks * 16);
    }
    const plain = randomBytes(3 * CHUNK_BYTES + 777);
    const { file } = await sealToFile(key, plain);
    const sealed = await openSealed(file, { passphrase: FIRST });
    for (const [start, end] of [
      [0, 10],
      [CHUNK_BYTES - 5, CHUNK_BYTES + 5],
      [2 * CHUNK_BYTES, plain.length],
      [plain.length - 1, plain.length],
    ] as const) {
      const pieces: Buffer[] = [];
      for await (const piece of sealed.read(start, end)) pieces.push(piece as Buffer);
      expect(Buffer.concat(pieces).equals(plain.subarray(start, end)), `${start}-${end}`).toBe(true);
    }
    await sealed.close();
  });

  it("is the format the documentation describes: a reader written from the document alone opens it", async () => {
    const key = await makeProtectionKey(SECOND, SCRYPT_LOGN_FLOOR);
    const plain = randomBytes(2 * CHUNK_BYTES + 12345);
    const { file } = await sealToFile(key, plain, '{"format":"outpost-backup"}');
    const read = readByTheDocument(fs.readFileSync(file), SECOND);
    expect(read.plain.equals(plain)).toBe(true);
    expect(read.manifest).toBe('{"format":"outpost-backup"}');
    // The same passphrase typed with its accents as separate characters is the same passphrase.
    expect(readByTheDocument(fs.readFileSync(file), SECOND.normalize("NFD")).plain.equals(plain)).toBe(true);
    expect((await readAll(file, SECOND.normalize("NFD"))).equals(plain)).toBe(true);
  });

  it("tells a wrong passphrase from a damaged file", async () => {
    const key = await makeProtectionKey(FIRST, SCRYPT_LOGN_FLOOR);
    const { file } = await sealToFile(key, randomBytes(3 * CHUNK_BYTES + 777));
    const header = (await readSealedHeader(file))!;

    for (const wrong of ["correct horse battery stapl", `${FIRST} `, "", FIRST.toUpperCase()]) {
      const error = await readAll(file, wrong).catch((caught) => caught);
      expect(error, JSON.stringify(wrong)).toBeInstanceOf(BackupLocked);
      expect(error.reason).toBe("wrong_passphrase");
    }

    const damaged = async (name: string, change: (bytes: Buffer) => Buffer, words: RegExp) => {
      const error = await readAll(altered(file, change), FIRST).catch((caught) => caught);
      expect(error, name).toBeInstanceOf(BackupDamaged);
      expect(error.message, name).toMatch(words);
    };
    // One changed bit in the header: in the public key, in the wrapped key, in the manifest, in the checksum itself.
    await damaged("header, public key", flip(20), /header is damaged/);
    await damaged("header, wrapped key", flip(130), /header is damaged/);
    await damaged("header, manifest", flip(180), /header is damaged/);
    await damaged("header, checksum", flip(header.length - 1), /header is damaged/);
    await damaged("header, version", flip(8), /version \d+\) this Outpost does not read/);
    // In a chunk in the middle, and in the last chunk: its data and its tag.
    await damaged("first chunk", flip(header.length + 100), /damaged, altered or cut short/);
    await damaged("a middle chunk", flip(header.length + SEALED_CHUNK + 5), /damaged, altered or cut short/);
    await damaged("the last chunk", flip(-40), /damaged, altered or cut short/);
    await damaged("the last tag", flip(-1), /damaged, altered or cut short/);
    // Cut short: inside a chunk, exactly between two chunks, down to the header, and inside the header.
    await damaged("cut mid-chunk", (bytes) => bytes.subarray(0, header.length + SEALED_CHUNK + 1000), /damaged, altered or cut short/);
    await damaged("cut between chunks", (bytes) => bytes.subarray(0, header.length + 2 * SEALED_CHUNK), /damaged, altered or cut short/);
    await damaged("cut after the first chunk", (bytes) => bytes.subarray(0, header.length + SEALED_CHUNK), /damaged, altered or cut short/);
    await damaged("cut inside the last tag", (bytes) => bytes.subarray(0, bytes.length - 3), /damaged, altered or cut short/);
    await damaged("only the header", (bytes) => bytes.subarray(0, header.length), /damaged, altered or cut short/);
    await damaged("cut inside the header", (bytes) => bytes.subarray(0, 100), /cut short/);
    // Two chunks changed places, and one chunk given twice.
    await damaged(
      "chunks swapped",
      (bytes) => {
        const first = Buffer.from(bytes.subarray(header.length, header.length + SEALED_CHUNK));
        bytes.copy(bytes, header.length, header.length + SEALED_CHUNK, header.length + 2 * SEALED_CHUNK);
        first.copy(bytes, header.length + SEALED_CHUNK);
        return bytes;
      },
      /damaged, altered or cut short/,
    );
    await damaged("bytes added at the end", (bytes) => Buffer.concat([bytes, Buffer.alloc(40)]), /damaged, altered or cut short/);

    // Altered on purpose, with the checksum put right. Whatever is changed, the file does not open:
    // the key of the chunks depends on every byte of the header.
    await damaged("ephemeral key, checksum fixed", flipAndRechecksum(60), /damaged, altered or cut short/);
    await damaged("manifest, checksum fixed", flipAndRechecksum(180), /damaged, altered or cut short/);
    await damaged("scrypt cost lowered, checksum fixed", flipAndRechecksum(81), /outside what Outpost will do|damaged/);
    // The one case the format cannot tell apart: the salt or the wrapped key altered and the checksum fixed
    // looks exactly like a wrong passphrase. It still does not open.
    const salted = await readAll(altered(file, flipAndRechecksum(90)), FIRST).catch((caught) => caught);
    expect(salted).toBeInstanceOf(BackupLocked);
  });

  it("refuses a header that asks for more work or other chunks than this version reads", async () => {
    const key = await makeProtectionKey(FIRST, SCRYPT_LOGN_FLOOR);
    const { file } = await sealToFile(key, randomBytes(1000));
    const bytes = fs.readFileSync(file);
    const rechecked = (at: number, value: number) => {
      const copy = Buffer.from(bytes);
      copy[at] = value;
      const length = copy.readUInt32BE(9);
      createHash("sha256")
        .update(copy.subarray(0, length - 32))
        .digest()
        .copy(copy, length - 32);
      return copy;
    };
    // 2^30 would take a terabyte; 2^10 would make the passphrase cheap to guess.
    expect(() => parseHeader(rechecked(81, 30))).toThrow(/outside what Outpost will do/);
    expect(() => parseHeader(rechecked(81, 10))).toThrow(/outside what Outpost will do/);
    expect(() => parseHeader(rechecked(82, 1))).toThrow(/outside what Outpost will do/);
    expect(() => parseHeader(rechecked(83, 200))).toThrow(/outside what Outpost will do/);
    // A chunk size of zero, and one of a gigabyte.
    expect(() => parseHeader(rechecked(14, 0))).toThrow(/chunk size/);
    expect(() => parseHeader(rechecked(13, 0x40))).toThrow(/chunk size/);
    expect(parseHeader(bytes).chunkBytes).toBe(CHUNK_BYTES);
    expect(MAGIC.toString("ascii")).toBe("OPBACKUP");
  });

  it("makes a new key pair, salt and file key every time, so nothing repeats between backups", async () => {
    const one = await makeProtectionKey(FIRST, SCRYPT_LOGN_FLOOR);
    const two = await makeProtectionKey(FIRST, SCRYPT_LOGN_FLOOR);
    expect(one.publicKey.equals(two.publicKey)).toBe(false);
    expect(one.wrapped.salt.equals(two.wrapped.salt)).toBe(false);
    const plain = randomBytes(5000);
    const a = await sealToFile(one, plain);
    const b = await sealToFile(one, plain);
    expect(a.fileKey.equals(b.fileKey)).toBe(false);
    const [ha, hb] = [(await readSealedHeader(a.file))!, (await readSealedHeader(b.file))!];
    expect(ha.ephemeralPublic.equals(hb.ephemeralPublic)).toBe(false);
    expect(fs.readFileSync(a.file).subarray(ha.length).equals(fs.readFileSync(b.file).subarray(hb.length))).toBe(false);
    // The plain bytes are nowhere in the file.
    expect(fs.readFileSync(a.file).includes(plain.subarray(0, 32))).toBe(false);
  });
});

// ── On a real server ────────────────────────────────────────────────────────

interface World {
  app: TestApp;
  folder: string;
  clock: { now: number };
  stored(): Promise<StoredBackup[]>;
  status(): Promise<BackupStatus>;
  backUpNow(): Promise<StoredBackup>;
}

const MONDAY_10 = new Date(2026, 10, 16, 10, 0, 0).getTime();
const HOUR = 60 * 60 * 1000;

async function world(env: Record<string, string> = {}, existingDir?: string): Promise<World> {
  const app = await createTestApp(env, existingDir);
  apps.push(app);
  const { storage, backups } = app.ctx.services;
  backups.setPassphraseCost(SCRYPT_LOGN_FLOOR);
  const nasPath = path.join(app.dir, "storage", "nas");
  const nas = storage.list().find((row) => row.path === nasPath) ?? (await storage.add({ name: "NAS", path: nasPath, kind: "network" }));
  const clock = { now: MONDAY_10 };
  backups.setClock(() => clock.now);
  const stored = async () => (await app.api("GET", "/api/backup/stored")).body.backups as StoredBackup[];
  return {
    app,
    folder: path.join(nas.path, BACKUP_FOLDER),
    clock,
    stored,
    status: async () => (await app.api("GET", "/api/backup/status")).body,
    async backUpNow() {
      if ((await app.api("GET", "/api/backup/schedule")).body.settings.locationId !== nas.id) {
        expect((await app.api("PATCH", "/api/backup/schedule", { locationId: nas.id })).status).toBe(200);
      }
      clock.now += HOUR;
      const started = await app.api("POST", "/api/backup/run");
      expect(started.status).toBe(200);
      await app.ctx.jobs.whenIdle();
      expect(app.ctx.jobs.get(started.body.job.id)?.state).toBe("succeeded");
      return (await stored())[0]!;
    },
  };
}

/** Something to find again after a restore, and enough of it that a backup is several chunks long. */
function fill(app: TestApp, words = "High water at Dover."): Buffer {
  app.ctx.services.search.upsert({ kind: "note", entityId: "n1", title: "Tide tables", url: "/notes/n1", sections: [{ text: words }] });
  const picture = randomBytes(300_000);
  const file = path.join(app.ctx.config.dataDir, "attachments", "ab", "picture.bin");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, picture);
  return picture;
}

const setPassphrase = (app: TestApp, passphrase: string, extra = {}) => app.api("PUT", "/api/backup/protection", { passphrase }, extra);

function upload(app: TestApp, payload: Buffer, passphrase?: string, extra: Record<string, unknown> = {}) {
  return app.app.inject({
    method: "POST",
    url: "/api/backup/restore",
    headers: {
      host: "localhost",
      "x-outpost-request": "1",
      "content-type": payload.subarray(0, 8).equals(MAGIC) ? "application/vnd.outpost.backup" : "application/zip",
      ...(passphrase === undefined ? {} : { "x-outpost-backup-passphrase": Buffer.from(passphrase, "utf8").toString("base64") }),
    },
    payload,
    ...extra,
  });
}

/** Every file under `dir`, with its bytes. */
function everyFile(dir: string): Array<{ file: string; bytes: Buffer }> {
  const found: Array<{ file: string; bytes: Buffer }> = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...everyFile(full));
    else if (entry.isFile()) found.push({ file: full, bytes: fs.readFileSync(full) });
  }
  return found;
}

const pendingFolder = (app: TestApp) => path.join(app.ctx.config.dataDir, "restore-pending");

describe("backups protected by a passphrase", () => {
  it("is off until a passphrase is set, and a backup is then the plain zip it always was", async () => {
    const w = await world();
    expect((await w.status()).protection).toEqual({ on: false, setAt: null, right: { allowed: true, reason: "local" } });
    fill(w.app);
    const plain = await w.backUpNow();
    expect(plain).toMatchObject({ protected: false, currentPassphrase: null, check: "verified" });
    expect(plain.name).toMatch(/-manual\.zip$/);
    expect(fs.readFileSync(path.join(w.folder, plain.name)).subarray(0, 2).toString("ascii")).toBe("PK");
    const download = await w.app.app.inject({ method: "GET", url: "/api/backup/download", headers: { host: "localhost" } });
    expect(download.headers["content-type"]).toBe("application/zip");
    expect(download.headers["content-disposition"]).toMatch(/\.zip"$/);
    expect(download.rawPayload.subarray(0, 2).toString("ascii")).toBe("PK");
  });

  it("makes a protected backup, restores it onto a fresh data folder with only the file and the passphrase, and writes no decrypted copy", async () => {
    const source = await world();
    await source.app.api("PATCH", "/api/settings", { "downloads.concurrency": 5 });
    const picture = fill(source.app);
    const set = await setPassphrase(source.app, FIRST);
    expect(set.status).toBe(200);
    expect(set.body).toMatchObject({ on: true, right: { allowed: true, reason: "local" } });
    expect(set.body.setAt).toBeGreaterThan(0);

    const backup = await source.backUpNow();
    expect(backup).toMatchObject({ protected: true, currentPassphrase: true, check: "verified" });
    expect(backup.name).toMatch(/-manual\.zip\.enc$/);
    expect(backup.appVersion).toMatch(/^\d/);
    const file = path.join(source.folder, backup.name);
    const bytes = fs.readFileSync(file);
    expect(bytes.subarray(0, 8).equals(MAGIC)).toBe(true);
    // Several chunks, none of them a zip, and what was backed up is not readable in it.
    expect(bytes.length).toBeGreaterThan(4 * CHUNK_BYTES);
    expect(bytes.includes(Buffer.from("PK\u0003\u0004"))).toBe(false);
    expect(bytes.includes(picture.subarray(0, 64))).toBe(false);
    expect(bytes.includes(Buffer.from("SQLite format 3"))).toBe(false);
    // Beside it, the record of its check and nothing else.
    expect(fs.readdirSync(source.folder).sort()).toEqual([backup.name, recordName(backup.name)].sort());
    expect(recordName(backup.name)).toMatch(/\.enc\.verified\.json$/);
    // Its date and version can be read without the passphrase; what is inside cannot.
    await expect(verifyBackupFile(file, tmp())).rejects.toBeInstanceOf(BackupLocked);
    expect((await verifyBackupFile(file, tmp(), undefined, { passphrase: FIRST })).entries).toBeGreaterThan(2);

    // The download from Settings is protected the same way.
    const download = await source.app.app.inject({ method: "GET", url: "/api/backup/download", headers: { host: "localhost" } });
    expect(download.headers["content-type"]).toBe("application/vnd.outpost.backup");
    expect(download.headers["content-disposition"]).toMatch(/\.zip\.enc"$/);
    expect(download.rawPayload.subarray(0, 8).equals(MAGIC)).toBe(true);
    const stored = await source.app.app.inject({
      method: "GET",
      url: `/api/backup/stored/${backup.name}/download`,
      headers: { host: "localhost" },
    });
    expect(stored.headers["content-type"]).toBe("application/vnd.outpost.backup");
    expect(stored.rawPayload.equals(bytes)).toBe(true);

    // A computer that has never seen this Outpost: nothing but the file and the passphrase.
    const dir = tmp();
    let target = await world({}, dir);
    expect((await target.status()).protection.on).toBe(false);
    for (const payload of [bytes, download.rawPayload]) {
      const staged = await upload(target.app, payload, FIRST);
      expect(staged.statusCode, staged.body).toBe(200);
      expect(staged.json()).toMatchObject({ staged: true });
      // What is staged is the unpacked backup and nothing else: no zip, decrypted or not.
      const names = fs.readdirSync(pendingFolder(target.app)).sort();
      expect(names).toEqual(["READY", "attachments", "manifest.json", "outpost.db"]);
    }
    expect(fs.readdirSync(target.app.ctx.config.dataDir).filter((name) => /backup-snapshot|\.zip|\.enc/.test(name))).toEqual([]);
    await target.app.close();
    apps.splice(apps.indexOf(target.app), 1);

    target = await world({}, dir);
    expect((await target.app.api("GET", "/api/settings")).body.settings["downloads.concurrency"]).toBe(5);
    expect((await target.app.api("GET", "/api/search?q=dover")).body.total).toBe(1);
    expect(fs.readFileSync(path.join(target.app.ctx.config.dataDir, "attachments", "ab", "picture.bin")).equals(picture)).toBe(true);
    // Protection came back with it: the person has just shown they know its passphrase.
    expect((await target.status()).protection.on).toBe(true);
    await target.app.close();
    apps.splice(apps.indexOf(target.app), 1);
  });

  it("restores a stored protected backup with its passphrase, and says which of the two went wrong when it cannot", async () => {
    const w = await world();
    fill(w.app);
    await setPassphrase(w.app, FIRST);
    const backup = await w.backUpNow();
    const restore = (body?: unknown) => w.app.api("POST", `/api/backup/stored/${backup.name}/restore`, body);

    const none = await restore();
    expect(none.status).toBe(400);
    expect(none.body.error.details).toEqual({ reason: "passphrase_required" });
    expect(none.body.error.message).toBe("This backup is protected. Give the passphrase it was made under to open it.");
    const wrong = await restore({ passphrase: "not it" });
    expect(wrong.status).toBe(400);
    expect(wrong.body.error.details).toEqual({ reason: "wrong_passphrase" });
    expect(wrong.body.error.message).toMatch(/^That passphrase does not open this backup\./);
    expect(fs.existsSync(pendingFolder(w.app))).toBe(false);
    expect((await restore({ passphrase: "" })).status).toBe(400);
    expect((await restore({ passphrase: "x".repeat(1025) })).status).toBe(400);

    const right = await restore({ passphrase: FIRST });
    expect(right.status).toBe(200);
    expect(fs.readdirSync(pendingFolder(w.app)).sort()).toEqual(["READY", "attachments", "manifest.json", "outpost.db"]);
    expect((await w.app.api("DELETE", "/api/backup/restore")).status).toBe(200);

    // The same file, damaged where it is kept. Each is refused as damaged, not as a wrong passphrase,
    // and nothing is left staged.
    const file = path.join(w.folder, backup.name);
    const sound = fs.readFileSync(file);
    const header = (await readSealedHeader(file))!;
    const cases: Array<[string, (bytes: Buffer) => Buffer]> = [
      ["a changed byte in the header", flip(25)],
      ["a changed byte in a chunk", flip(header.length + SEALED_CHUNK + 9)],
      ["a changed byte in the last chunk", flip(-20)],
      ["cut short inside a chunk", (bytes) => bytes.subarray(0, header.length + 2 * SEALED_CHUNK + 500)],
      ["cut short between two chunks", (bytes) => bytes.subarray(0, header.length + 2 * SEALED_CHUNK)],
    ];
    for (const [name, change] of cases) {
      fs.writeFileSync(file, change(Buffer.from(sound)));
      const answer = await restore({ passphrase: FIRST });
      expect(answer.status, name).toBe(400);
      expect(answer.body.error.details, name).toEqual({ reason: "damaged" });
      expect(answer.body.error.message, name).toMatch(/^That backup cannot be restored\. /);
      expect(fs.existsSync(pendingFolder(w.app)), name).toBe(false);
      // The same through an upload.
      const uploaded = await upload(w.app, change(Buffer.from(sound)), FIRST);
      expect(uploaded.statusCode, name).toBe(400);
      expect(uploaded.json().error.details, name).toEqual({ reason: "damaged" });
      expect(fs.existsSync(pendingFolder(w.app)), name).toBe(false);
    }
    expect(fs.readdirSync(w.app.ctx.config.dataDir).filter((name) => /backup-snapshot|\.zip|\.enc/.test(name))).toEqual([]);
    // A file whose size no longer matches its record is no longer shown as verified; a header that does not read, as unreadable.
    fs.writeFileSync(file, sound.subarray(0, header.length + SEALED_CHUNK));
    expect((await w.stored())[0]).toMatchObject({ check: "unverified", protected: true });
    fs.writeFileSync(file, flip(25)(Buffer.from(sound)));
    fs.utimesSync(file, new Date(), new Date(Date.now() + 5000));
    expect((await w.stored())[0]).toMatchObject({ check: "unreadable", protected: true, currentPassphrase: false });
    fs.writeFileSync(file, sound);
  });

  it("a scheduled backup is protected with nobody there, and neither the passphrase nor a key that opens it is kept", async () => {
    const dir = tmp();
    const first = await world({}, dir);
    fill(first.app);
    await first.app.api("PATCH", "/api/backup/schedule", {
      locationId: first.app.ctx.services.storage.list().find((row) => row.name === "NAS")!.id,
    });
    expect((await setPassphrase(first.app, SECOND)).status).toBe(200);
    await first.app.close();
    apps.splice(apps.indexOf(first.app), 1);

    // A server started afterwards, which has never been given the passphrase.
    const w = await world({}, dir);
    w.clock.now = new Date(2026, 10, 17, 3, 0, 30).getTime();
    w.app.ctx.services.backups.tick();
    await w.app.ctx.jobs.whenIdle();
    const [backup] = await w.stored();
    expect(backup).toMatchObject({ kind: "scheduled", protected: true, currentPassphrase: true, check: "verified" });
    expect(backup!.name).toMatch(/-scheduled\.zip\.enc$/);
    const file = path.join(w.folder, backup!.name);
    expect((await verifyBackupFile(file, tmp(), undefined, { passphrase: SECOND })).manifest.format).toBe("outpost-backup");

    // What is stored: one settings row, holding a public key and a private key that only the passphrase unwraps.
    const row = w.app.ctx.sqlite.prepare("SELECT value FROM settings WHERE key = ?").get(PROTECTION_KEY) as { value: string };
    const kept = JSON.parse(row.value);
    expect(Object.keys(kept).sort()).toEqual(["nonce", "publicKey", "scrypt", "setAt", "version", "wrappedKey"]);
    expect(Object.keys(kept.scrypt).sort()).toEqual(["logN", "p", "r", "salt"]);
    expect(kept.scrypt).toMatchObject({ logN: SCRYPT_LOGN_FLOOR, r: 8, p: 1 });
    const header = (await readSealedHeader(file))!;
    expect(header.publicKey.toString("base64")).toBe(kept.publicKey);
    expect(header.wrapped.sealed.toString("base64")).toBe(kept.wrappedKey);
    // It is not one of the settings every device can read or change.
    expect(JSON.stringify((await w.app.api("GET", "/api/settings")).body)).not.toContain("protection");
    expect((await w.app.api("PATCH", "/api/settings", { [PROTECTION_KEY]: kept })).status).toBe(400);

    // Nothing written anywhere holds the passphrase, in any form it could have been written in,
    // nor the private key, nor the key of the backup's chunks.
    w.app.ctx.sqlite.pragma("wal_checkpoint(TRUNCATE)");
    const unwrapped = readByTheDocumentKeys(fs.readFileSync(file), SECOND);
    const secrets = [
      Buffer.from(SECOND, "utf8"),
      Buffer.from(SECOND.normalize("NFC"), "utf8"),
      Buffer.from(Buffer.from(SECOND, "utf8").toString("base64"), "ascii"),
      Buffer.from(JSON.stringify(SECOND).slice(1, -1), "utf8"),
      unwrapped.privateKey,
      Buffer.from(unwrapped.privateKey.toString("base64"), "ascii"),
      Buffer.from(unwrapped.privateKey.toString("hex"), "ascii"),
      unwrapped.fileKey,
      unwrapped.wrappingKey,
    ];
    const files = everyFile(dir);
    expect(files.length).toBeGreaterThan(3);
    for (const { file: name, bytes } of files) {
      for (const [index, secret] of secrets.entries()) expect(bytes.includes(secret), `${name} holds secret ${index}`).toBe(false);
    }
  });

  it("a changed passphrase applies to backups made afterwards; older ones open with the passphrase they were made under", async () => {
    const w = await world();
    fill(w.app);
    await setPassphrase(w.app, FIRST);
    const older = await w.backUpNow();
    const before = (await w.status()).protection.setAt!;
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect((await setPassphrase(w.app, SECOND)).status).toBe(200);
    expect((await w.status()).protection.setAt).toBeGreaterThan(before);
    const newer = await w.backUpNow();

    const listed = await w.stored();
    expect(listed.map((backup) => [backup.name, backup.protected, backup.currentPassphrase])).toEqual([
      [newer.name, true, true],
      [older.name, true, false],
    ]);
    // The older file was not touched by the change.
    expect(
      (await readSealedHeader(path.join(w.folder, older.name)))!.publicKey.equals(
        (await readSealedHeader(path.join(w.folder, newer.name)))!.publicKey,
      ),
    ).toBe(false);

    const restore = (name: string, passphrase: string) => w.app.api("POST", `/api/backup/stored/${name}/restore`, { passphrase });
    expect((await restore(older.name, SECOND)).body.error.details).toEqual({ reason: "wrong_passphrase" });
    expect((await restore(newer.name, FIRST)).body.error.details).toEqual({ reason: "wrong_passphrase" });
    expect((await restore(newer.name, SECOND)).status).toBe(200);
    expect((await restore(older.name, FIRST)).status).toBe(200);
    // Restoring the older one does not put the older passphrase back in charge: what is staged carries today's key.
    const staged = new Database(path.join(pendingFolder(w.app), "outpost.db"), { readonly: true });
    const current = w.app.ctx.sqlite.prepare("SELECT value FROM settings WHERE key = ?").get(PROTECTION_KEY) as { value: string };
    expect(JSON.parse((staged.prepare("SELECT value FROM settings WHERE key = ?").get(PROTECTION_KEY) as { value: string }).value)).toEqual(
      JSON.parse(current.value),
    );
    staged.close();
    await w.app.api("DELETE", "/api/backup/restore");

    // Switching protection off decrypts nothing: both stay protected, and the next backup is plain.
    const off = await w.app.api("DELETE", "/api/backup/protection");
    expect(off.body).toMatchObject({ on: false, setAt: null });
    const plain = await w.backUpNow();
    expect(plain.name).toMatch(/\.zip$/);
    expect((await w.stored()).map((backup) => [backup.protected, backup.currentPassphrase])).toEqual([
      [false, null],
      [true, false],
      [true, false],
    ]);
    expect((await restore(older.name, FIRST)).status).toBe(200);
    await w.app.api("DELETE", "/api/backup/restore");
    // A plain backup needs no passphrase, and is not refused for being given one.
    expect((await w.app.api("POST", `/api/backup/stored/${plain.name}/restore`)).status).toBe(200);
    expect((await w.app.api("POST", `/api/backup/stored/${plain.name}/restore`, { passphrase: "whatever" })).status).toBe(200);
  });

  it("counts, keeps and deletes protected backups as it does plain ones", async () => {
    const w = await world();
    await setPassphrase(w.app, FIRST);
    await w.app.api("PATCH", "/api/backup/schedule", {
      locationId: w.app.ctx.services.storage.list().find((row) => row.name === "NAS")!.id,
      keep: 2,
    });
    for (let index = 0; index < 4; index += 1) await w.backUpNow();
    const listed = await w.stored();
    expect(listed).toHaveLength(2);
    expect(listed.every((backup) => backup.protected && backup.check === "verified")).toBe(true);
    expect(fs.readdirSync(w.folder)).toHaveLength(4);
    expect((await w.app.api("DELETE", `/api/backup/stored/${listed[1]!.name}`)).status).toBe(200);
    expect(fs.readdirSync(w.folder).sort()).toEqual([listed[0]!.name, recordName(listed[0]!.name)].sort());

    // One that is damaged between being written and being read back is not counted as a backup.
    w.app.ctx.services.backups.setBeforeCheck(async (file) => {
      const handle = fs.openSync(file, "r+");
      fs.writeSync(handle, Buffer.alloc(64, 0xa5), 0, 64, Math.floor(fs.statSync(file).size / 2));
      fs.closeSync(handle);
    });
    w.clock.now += HOUR;
    const started = await w.app.api("POST", "/api/backup/run");
    await w.app.ctx.jobs.whenIdle();
    const job = w.app.ctx.jobs.get(started.body.job.id)!;
    expect(job.state).toBe("failed");
    expect(job.error).toMatch(/did not read back correctly\. Part of it does not open with its key/);
    expect((await w.stored())[0]).toMatchObject({ check: "unverified", protected: true });
  });
});

describe("who may set, change or remove the passphrase", () => {
  const phone = { remoteAddress: "192.168.1.20" };
  const lan = { OUTPOST_LAN_ACCESS: "true", OUTPOST_HOST: "0.0.0.0" };

  it("only the computer Outpost runs on, so that nobody on the network can lock the owner out of their backups", async () => {
    const w = await world(lan);
    expect((await w.app.api("GET", "/api/backup/status", undefined, phone)).body.protection).toEqual({
      on: false,
      setAt: null,
      right: { allowed: false, reason: "remote" },
    });
    const refused = await setPassphrase(w.app, "mine now", phone);
    expect(refused.status).toBe(403);
    expect(refused.body.error.message).toMatch(/^Setting the passphrase for backups can only be done on the computer Outpost runs on\./);
    expect((await w.status()).protection.on).toBe(false);
    // Through a proxy on this computer every request looks local; one that says it was forwarded is not trusted.
    expect((await setPassphrase(w.app, "mine now", { headers: { "x-forwarded-for": "192.168.1.20" } })).status).toBe(403);

    expect((await setPassphrase(w.app, FIRST)).status).toBe(200);
    // Nor may another device change it, or switch it off.
    expect((await setPassphrase(w.app, "mine now", phone)).status).toBe(403);
    const removal = await w.app.api("DELETE", "/api/backup/protection", undefined, phone);
    expect(removal.status).toBe(403);
    expect(removal.body.error.message).toMatch(/^Removing the passphrase for backups can only be done/);
    expect((await w.app.api("GET", "/api/backup/status", undefined, phone)).body.protection).toMatchObject({ on: true });
    // It can still start a backup, which is protected, and download it.
    fill(w.app);
    const backup = await w.backUpNow();
    expect(backup.protected).toBe(true);
    expect((await w.app.api("GET", `/api/backup/stored/${backup.name}/download`, undefined, phone)).status).toBe(200);
    expect((await w.app.api("POST", `/api/backup/stored/${backup.name}/restore`, { passphrase: FIRST }, phone)).status).toBe(403);

    // What is asked of a passphrase: that there is one. Nothing about what it is made of.
    for (const odd of ["a", " ", "12345678", "пароль", "x".repeat(1024)]) expect((await setPassphrase(w.app, odd)).status, odd).toBe(200);
    for (const bad of ["", "x".repeat(1025), 7, null]) expect((await setPassphrase(w.app, bad as string)).status).toBe(400);
    expect((await w.app.api("PUT", "/api/backup/protection", { passphrase: FIRST, hint: "the usual" })).status).toBe(400);
  });

  it("with the start-up option, another device may only send a passphrase over HTTPS, never over plain http", async () => {
    const dir = tmp();
    fs.mkdirSync(path.join(dir, "web"), { recursive: true });
    fs.writeFileSync(path.join(dir, "web", "index.html"), "<!doctype html><title>Outpost</title><div id=root></div>");
    const w = await world({ ...lan, OUTPOST_ALLOW_REMOTE_ERASE: "true", OUTPOST_HTTPS_PORT: "0" }, dir);
    fill(w.app);

    // Plain http from another device: the option allows restoring and deleting, and still no passphrase may be sent.
    expect((await w.app.api("GET", "/api/backup/status", undefined, phone)).body).toMatchObject({
      right: { allowed: true, reason: "option" },
      protection: { right: { allowed: false, reason: "insecure" } },
    });
    const insecure = await setPassphrase(w.app, "typed on a phone", phone);
    expect(insecure.status).toBe(403);
    expect(insecure.body.error.details).toEqual({ reason: "insecure" });
    expect(insecure.body.error.message).toMatch(/would cross your network unencrypted/);
    expect((await w.status()).protection.on).toBe(false);

    expect((await setPassphrase(w.app, FIRST)).status).toBe(200);
    const backup = await w.backUpNow();
    const bytes = fs.readFileSync(path.join(w.folder, backup.name));
    // Opening a protected backup sends the passphrase too, so that is refused the same way, before the file is read.
    const stored = await w.app.api("POST", `/api/backup/stored/${backup.name}/restore`, { passphrase: FIRST }, phone);
    expect(stored.status).toBe(403);
    expect(stored.body.error.details).toEqual({ reason: "insecure" });
    const uploaded = await upload(w.app, bytes, FIRST, phone);
    expect(uploaded.statusCode).toBe(403);
    expect(fs.existsSync(pendingFolder(w.app))).toBe(false);
    // Removing it sends no secret, so the option is enough.
    expect((await w.app.api("DELETE", "/api/backup/protection", undefined, phone)).status).toBe(200);
    expect((await setPassphrase(w.app, FIRST)).status).toBe(200);

    // Over HTTPS: a real connection to the HTTPS listener, marked as coming from elsewhere.
    const address = await w.app.app.listen({ port: 0, host: "127.0.0.1" });
    expect((await w.app.api("PATCH", "/api/settings", { "https.enabled": true })).status).toBe(200);
    await w.app.ctx.services.https.whenSettled();
    const { port } = (await w.app.api("GET", "/api/https")).body;
    const ca = (await w.app.api("GET", "/api/https/outpost-authority.crt?format=pem")).body as unknown as string;
    const far = { "x-outpost-request": "1", "x-forwarded-for": "192.168.1.50", "content-type": "application/json" };
    const send = (base: string, method: string, pathname: string, body?: unknown) =>
      new Promise<{ status: number; body: string }>((resolve, reject) => {
        const secure = base.startsWith("https");
        const request = (secure ? https : http).request(
          `${base}${pathname}`,
          { method, headers: { ...far, origin: base }, agent: false, ...(secure ? { ca } : {}) },
          (response) => {
            const chunks: Buffer[] = [];
            response.on("data", (chunk: Buffer) => chunks.push(chunk));
            response.on("end", () => resolve({ status: response.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") }));
          },
        );
        request.on("error", reject);
        request.end(body === undefined ? undefined : JSON.stringify(body));
      });
    const secureBase = `https://127.0.0.1:${port}`;
    expect(JSON.parse((await send(secureBase, "GET", "/api/backup/status")).body).protection.right).toEqual({
      allowed: true,
      reason: "https",
    });
    const changed = await send(secureBase, "PUT", "/api/backup/protection", { passphrase: SECOND });
    expect(changed.status, changed.body).toBe(200);
    const newer = await w.backUpNow();
    expect(newer.currentPassphrase).toBe(true);
    expect((await send(secureBase, "POST", `/api/backup/stored/${newer.name}/restore`, { passphrase: SECOND })).status).toBe(200);
    // The same requests over plain http, marked the same way, are refused.
    expect(JSON.parse((await send(address, "GET", "/api/backup/status")).body).protection.right).toEqual({
      allowed: false,
      reason: "insecure",
    });
    expect((await send(address, "PUT", "/api/backup/protection", { passphrase: "over plain http" })).status).toBe(403);
    expect((await send(address, "POST", `/api/backup/stored/${newer.name}/restore`, { passphrase: SECOND })).status).toBe(403);
  });
});

describe("what protection a restored database brings with it", () => {
  const settingsDb = () => {
    const db = new Database(":memory:");
    db.exec("CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL)");
    return db;
  };
  const put = (db: Database.Database, value: unknown) =>
    db.prepare("INSERT INTO settings (key, value, updated_at) VALUES (?, ?, 1)").run(PROTECTION_KEY, JSON.stringify(value));
  const get = (db: Database.Database) => {
    const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(PROTECTION_KEY) as { value: string } | undefined;
    return row ? JSON.parse(row.value) : undefined;
  };
  const stored = (key: ProtectionKey, setAt: number) => ({
    version: 1,
    publicKey: key.publicKey.toString("base64"),
    scrypt: { logN: key.wrapped.logN, r: 8, p: 1, salt: key.wrapped.salt.toString("base64") },
    nonce: key.wrapped.nonce.toString("base64"),
    wrappedKey: key.wrapped.sealed.toString("base64"),
    setAt,
  });

  it("keeps this installation's passphrase, takes the backup's only when it was opened with it, and otherwise brings none", async () => {
    const old = await makeProtectionKey(FIRST, SCRYPT_LOGN_FLOOR);
    const current = await makeProtectionKey(SECOND, SCRYPT_LOGN_FLOOR);

    // This installation protects its backups: it goes on doing so with the same key, whatever the backup held.
    for (const inBackup of [stored(old, 1), undefined]) {
      const db = settingsDb();
      if (inBackup) put(db, inBackup);
      settleStagedProtection(db, { key: current, setAt: 9 }, inBackup ? old.publicKey : undefined);
      expect(get(db)).toEqual(stored(current, 9));
    }
    // It does not, and the backup was opened with the passphrase of the key it holds: that key is kept.
    const opened = settingsDb();
    put(opened, stored(old, 1));
    settleStagedProtection(opened, undefined, old.publicKey);
    expect(get(opened)).toEqual(stored(old, 1));
    // A plain backup holding a key, or a protected one holding a different key from the one it was opened with:
    // nobody here has shown they know that passphrase, so it is not brought in.
    for (const openedWith of [undefined, current.publicKey]) {
      const db = settingsDb();
      put(db, stored(old, 1));
      settleStagedProtection(db, undefined, openedWith);
      expect(get(db)).toBeUndefined();
    }
    // Something that is not a key at all.
    const junk = settingsDb();
    put(junk, { version: 1, publicKey: "AAAA" });
    settleStagedProtection(junk, undefined, old.publicKey);
    expect(get(junk)).toBeUndefined();
  });

  it("travels on a portable drive, so that a backup made from the drive is protected too", async () => {
    const w = await world();
    await setPassphrase(w.app, FIRST);
    const copy = path.join(w.app.dir, "drive.db");
    await w.app.ctx.sqlite.backup(copy);
    prepareDriveDatabase(copy, {
      locationId: "drive",
      locationName: "This drive",
      locationPath: "/drive",
      collectionIds: [],
      documentIds: [],
      madeFrom: "home",
    });
    const drive = new Database(copy, { readonly: true });
    const home = w.app.ctx.sqlite.prepare("SELECT value FROM settings WHERE key = ?").get(PROTECTION_KEY) as { value: string };
    expect(drive.prepare("SELECT value FROM settings WHERE key = ?").get(PROTECTION_KEY)).toEqual(home);
    drive.close();
  });
});

/** The secrets of a protected backup, worked out from the passphrase as the document describes, to look for them on disk. */
function readByTheDocumentKeys(file: Buffer, passphrase: string): { privateKey: Buffer; fileKey: Buffer; wrappingKey: Buffer } {
  const headerLength = file.readUInt32BE(9);
  const publicKey = file.subarray(17, 49);
  const ephemeral = file.subarray(49, 81);
  const wrappingKey = scryptSync(Buffer.from(passphrase.normalize("NFC"), "utf8"), file.subarray(84, 116), 32, {
    N: 2 ** file[81]!,
    r: file[82]!,
    p: file[83]!,
    maxmem: 2 ** 31,
  });
  const unwrap = createDecipheriv("chacha20-poly1305", wrappingKey, file.subarray(116, 128), { authTagLength: 16 });
  unwrap.setAAD(Buffer.concat([Buffer.from("outpost-backup-v1 key", "ascii"), publicKey]), { plaintextLength: 32 });
  unwrap.setAuthTag(file.subarray(160, 176));
  const privateKey = Buffer.concat([unwrap.update(file.subarray(128, 160)), unwrap.final()]);
  const shared = diffieHellman({
    privateKey: createPrivateKey({
      key: Buffer.concat([Buffer.from("302e020100300506032b656e04220420", "hex"), privateKey]),
      format: "der",
      type: "pkcs8",
    }),
    publicKey: createPublicKey({
      key: Buffer.concat([Buffer.from("302a300506032b656e032100", "hex"), ephemeral]),
      format: "der",
      type: "spki",
    }),
  });
  const fileKey = Buffer.from(
    hkdfSync(
      "sha256",
      shared,
      Buffer.concat([ephemeral, publicKey]),
      Buffer.concat([Buffer.from("outpost-backup-v1 file", "ascii"), file.subarray(headerLength - 32, headerLength)]),
      32,
    ),
  );
  return { privateKey, fileKey, wrappingKey };
}
