/**
 * The envelope around a protected backup: the file format, and the cryptography.
 *
 * A protected backup is the same zip as any other, sealed so that it can be made by a
 * server that holds no secret and opened only by someone who knows a passphrase:
 *
 *  - When a passphrase is set, an X25519 key pair is made. The public key is kept in
 *    settings. The private key is kept only wrapped under a key derived from the
 *    passphrase with scrypt, and the passphrase itself is kept nowhere.
 *  - Each backup is encrypted to the public key: a fresh X25519 key pair for that file,
 *    HKDF-SHA-256 over the shared secret, then ChaCha20-Poly1305 in chunks. The chunks
 *    are numbered and the last one is marked, so a file that was cut short, even
 *    exactly between two chunks, does not open.
 *  - The wrapped private key is written into the header of every backup, so the file
 *    and the passphrase are enough to open it on a computer that has never seen it.
 *
 * The layout is written out in `docs/storage.md` ("The protected backup file"); the
 * numbers here and there must agree. Only `node:crypto` is used.
 *
 * This file knows nothing about zips or about Outpost's settings: `archive.ts` reads a
 * zip through it, and `protection.ts` keeps the key.
 */
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createPrivateKey,
  createPublicKey,
  diffieHellman,
  generateKeyPairSync,
  hkdfSync,
  type KeyObject,
  randomBytes,
  scrypt,
  timingSafeEqual,
} from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import { Readable, Transform } from "node:stream";

export const MAGIC = Buffer.from("OPBACKUP", "ascii");
export const FORMAT_VERSION = 1;
/** Bytes of the backup in each chunk but the last. */
export const CHUNK_BYTES = 64 * 1024;
const TAG_BYTES = 16;
const KEY_BYTES = 32;
const SALT_BYTES = 32;
const NONCE_BYTES = 12;
const WRAPPED_BYTES = KEY_BYTES + TAG_BYTES;
/** Everything in the header before the manifest: see the table in docs/storage.md. */
const FIXED_BYTES = 178;
const CHECKSUM_BYTES = 32;
const MAX_MANIFEST_BYTES = 16 * 1024;
const CIPHER = "chacha20-poly1305";
const WRAP_LABEL = Buffer.from("outpost-backup-v1 key", "ascii");
const FILE_LABEL = Buffer.from("outpost-backup-v1 file", "ascii");

/**
 * scrypt's cost. `r` and `p` are fixed in version 1; `N` is 2 to the power `logN` and
 * is chosen on the computer that sets the passphrase (see `chooseLogN`).
 */
export const SCRYPT_R = 8;
export const SCRYPT_P = 1;
/** The least work a passphrase is ever put through: 32 MiB of memory. Nothing weaker is written or read. */
export const SCRYPT_LOGN_FLOOR = 15;
/** The most this version writes: 512 MiB. */
export const SCRYPT_LOGN_CEILING = 19;
/** The most this version will read, so that a file cannot ask for all the memory there is: 1 GiB. */
const SCRYPT_LOGN_READ_MAX = 20;
/** How long deriving the key should take on the computer that sets the passphrase. */
const SCRYPT_TARGET_MS = 1000;

/** Thrown when a file does not read back as a whole, sound backup. The message is for a person. */
export class BackupDamaged extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BackupDamaged";
  }
}

/**
 * Thrown when a protected backup cannot be opened for want of the right passphrase:
 * none was given, or the one given does not open the key in the file's header.
 */
export class BackupLocked extends Error {
  readonly reason: "passphrase_required" | "wrong_passphrase";
  constructor(reason: "passphrase_required" | "wrong_passphrase") {
    super(
      reason === "passphrase_required"
        ? "This backup is protected. Give the passphrase it was made under to open it."
        : "That passphrase does not open this backup. Backups open with the passphrase that was set when they were made.",
    );
    this.name = "BackupLocked";
    this.reason = reason;
  }
}

/** A private key as it is kept: under a key derived from a passphrase. */
export interface WrappedKey {
  logN: number;
  r: number;
  p: number;
  salt: Buffer;
  nonce: Buffer;
  /** The 32 bytes of the private key, encrypted, followed by the 16-byte tag. */
  sealed: Buffer;
}

/** What is kept once a passphrase has been set: enough to make backups, not enough to open one. */
export interface ProtectionKey {
  publicKey: Buffer;
  wrapped: WrappedKey;
}

export interface SealedHeader extends ProtectionKey {
  /** Bytes from the start of the file to the first chunk. */
  length: number;
  chunkBytes: number;
  ephemeralPublic: Buffer;
  /** The backup's manifest, as the JSON text the zip inside holds. Readable without the passphrase. */
  manifest: string;
  /** SHA-256 of the header before it. Guards against accidents, and ties the chunks to this header. */
  checksum: Buffer;
}

// ── Keys ────────────────────────────────────────────────────────────────────

// X25519 keys are 32 bytes. Node reads and writes them inside these fixed DER wrappers.
const PKCS8_PREFIX = Buffer.from("302e020100300506032b656e04220420", "hex");
const SPKI_PREFIX = Buffer.from("302a300506032b656e032100", "hex");
const privateFromRaw = (raw: Buffer): KeyObject =>
  createPrivateKey({ key: Buffer.concat([PKCS8_PREFIX, raw]), format: "der", type: "pkcs8" });
const publicFromRaw = (raw: Buffer): KeyObject => createPublicKey({ key: Buffer.concat([SPKI_PREFIX, raw]), format: "der", type: "spki" });
const rawPublic = (key: KeyObject): Buffer => Buffer.from(key.export({ format: "der", type: "spki" }).subarray(-KEY_BYTES));
const rawPrivate = (key: KeyObject): Buffer => Buffer.from(key.export({ format: "der", type: "pkcs8" }).subarray(-KEY_BYTES));

/** The bytes scrypt is given: the passphrase in Unicode form NFC, as UTF-8. Nothing is trimmed. */
const passphraseBytes = (passphrase: string): Buffer => Buffer.from(passphrase.normalize("NFC"), "utf8");

const scryptMemory = (logN: number, r = SCRYPT_R): number => 128 * r * 2 ** logN;

function deriveWrappingKey(passphrase: string, salt: Buffer, logN: number, r: number, p: number): Promise<Buffer> {
  const secret = passphraseBytes(passphrase);
  return new Promise((resolve, reject) => {
    scrypt(secret, salt, KEY_BYTES, { N: 2 ** logN, r, p, maxmem: scryptMemory(logN, r) * 2 }, (error, key) => {
      secret.fill(0);
      if (error) {
        reject(
          new BackupDamaged(
            `This computer could not do the work that opening it takes (${Math.round(scryptMemory(logN, r) / 2 ** 20)} MiB of memory): ${error.message}`,
          ),
        );
      } else resolve(key);
    });
  });
}

/**
 * The largest cost that takes about a second here and no more than an eighth of this
 * computer's memory, never below the floor. `floorMs` is how long the floor took.
 */
export function chooseLogN(floorMs: number, totalMemory: number): number {
  let logN = SCRYPT_LOGN_FLOOR;
  // Each step doubles both the time and the memory.
  while (
    logN < SCRYPT_LOGN_CEILING &&
    floorMs * 2 ** (logN + 1 - SCRYPT_LOGN_FLOOR) <= SCRYPT_TARGET_MS &&
    scryptMemory(logN + 1) <= totalMemory / 8
  ) {
    logN += 1;
  }
  return logN;
}

/** Times the floor on this computer, twice, and chooses a cost from the quicker run. */
export async function measureLogN(): Promise<number> {
  const salt = randomBytes(SALT_BYTES);
  let best = Number.POSITIVE_INFINITY;
  for (let run = 0; run < 2; run += 1) {
    const started = process.hrtime.bigint();
    (await deriveWrappingKey("measure", salt, SCRYPT_LOGN_FLOOR, SCRYPT_R, SCRYPT_P)).fill(0);
    best = Math.min(best, Number(process.hrtime.bigint() - started) / 1e6);
  }
  return chooseLogN(best, os.totalmem());
}

const wrapAad = (publicKey: Buffer): Buffer => Buffer.concat([WRAP_LABEL, publicKey]);

/** Makes a key pair for backups and wraps its private half under the passphrase. The passphrase is not kept. */
export async function makeProtectionKey(passphrase: string, logN: number): Promise<ProtectionKey> {
  if (!Number.isInteger(logN) || logN < SCRYPT_LOGN_FLOOR || logN > SCRYPT_LOGN_CEILING) throw new Error("scrypt cost out of range");
  const pair = generateKeyPairSync("x25519");
  const publicKey = rawPublic(pair.publicKey);
  const privateKey = rawPrivate(pair.privateKey);
  const salt = randomBytes(SALT_BYTES);
  const nonce = randomBytes(NONCE_BYTES);
  const wrappingKey = await deriveWrappingKey(passphrase, salt, logN, SCRYPT_R, SCRYPT_P);
  try {
    const cipher = createCipheriv(CIPHER, wrappingKey, nonce, { authTagLength: TAG_BYTES });
    cipher.setAAD(wrapAad(publicKey), { plaintextLength: KEY_BYTES });
    const sealed = Buffer.concat([cipher.update(privateKey), cipher.final(), cipher.getAuthTag()]);
    return { publicKey, wrapped: { logN, r: SCRYPT_R, p: SCRYPT_P, salt, nonce, sealed } };
  } finally {
    wrappingKey.fill(0);
    privateKey.fill(0);
  }
}

/**
 * The private key, given the passphrase. Throws `BackupLocked` when the passphrase is
 * not the one, and `BackupDamaged` when the key that comes out is not the pair of the
 * public key beside it.
 */
async function unwrapPrivateKey(key: ProtectionKey, passphrase: string): Promise<Buffer> {
  const { wrapped, publicKey } = key;
  const wrappingKey = await deriveWrappingKey(passphrase, wrapped.salt, wrapped.logN, wrapped.r, wrapped.p);
  let privateKey: Buffer;
  try {
    const decipher = createDecipheriv(CIPHER, wrappingKey, wrapped.nonce, { authTagLength: TAG_BYTES });
    decipher.setAAD(wrapAad(publicKey), { plaintextLength: KEY_BYTES });
    decipher.setAuthTag(wrapped.sealed.subarray(KEY_BYTES));
    privateKey = Buffer.concat([decipher.update(wrapped.sealed.subarray(0, KEY_BYTES)), decipher.final()]);
  } catch {
    throw new BackupLocked("wrong_passphrase");
  } finally {
    wrappingKey.fill(0);
  }
  if (!timingSafeEqual(rawPublic(createPublicKey(privateFromRaw(privateKey))), publicKey)) {
    privateKey.fill(0);
    throw new BackupDamaged("The key in its header does not belong to it, so it has been altered.");
  }
  return privateKey;
}

function fileKeyFrom(shared: Buffer, ephemeralPublic: Buffer, publicKey: Buffer, checksum: Buffer): Buffer {
  // A shared secret of all zeros means one of the public keys was not a real one.
  if (shared.every((byte) => byte === 0)) throw new BackupDamaged("The key in its header is not a usable one.");
  const key = hkdfSync("sha256", shared, Buffer.concat([ephemeralPublic, publicKey]), Buffer.concat([FILE_LABEL, checksum]), KEY_BYTES);
  shared.fill(0);
  return Buffer.from(key);
}

// ── The header ──────────────────────────────────────────────────────────────

function encodeHeader(key: ProtectionKey, ephemeralPublic: Buffer, manifest: string): { bytes: Buffer; checksum: Buffer } {
  const manifestBytes = Buffer.from(manifest, "utf8");
  if (manifestBytes.length > MAX_MANIFEST_BYTES) throw new Error("manifest too large for a backup header");
  const length = FIXED_BYTES + manifestBytes.length + CHECKSUM_BYTES;
  const head = Buffer.alloc(FIXED_BYTES);
  MAGIC.copy(head, 0);
  head.writeUInt8(FORMAT_VERSION, 8);
  head.writeUInt32BE(length, 9);
  head.writeUInt32BE(CHUNK_BYTES, 13);
  key.publicKey.copy(head, 17);
  ephemeralPublic.copy(head, 49);
  head.writeUInt8(key.wrapped.logN, 81);
  head.writeUInt8(key.wrapped.r, 82);
  head.writeUInt8(key.wrapped.p, 83);
  key.wrapped.salt.copy(head, 84);
  key.wrapped.nonce.copy(head, 116);
  key.wrapped.sealed.copy(head, 128);
  head.writeUInt16BE(manifestBytes.length, 176);
  const body = Buffer.concat([head, manifestBytes]);
  const checksum = createHash("sha256").update(body).digest();
  return { bytes: Buffer.concat([body, checksum]), checksum };
}

/** Whether a file that starts with these bytes is a protected backup. */
export function isSealed(start: Buffer): boolean {
  return start.length >= MAGIC.length && start.subarray(0, MAGIC.length).equals(MAGIC);
}

/**
 * Reads the header at the start of `bytes`. Throws `BackupDamaged`, in words for a
 * person, for anything that is not a whole header of a version this code reads.
 */
export function parseHeader(bytes: Buffer): SealedHeader {
  if (!isSealed(bytes)) throw new BackupDamaged("It is not a protected Outpost backup.");
  if (bytes.length < FIXED_BYTES) throw new BackupDamaged("It ends before its header does, so it has been cut short.");
  const version = bytes.readUInt8(8);
  if (version !== FORMAT_VERSION) {
    throw new BackupDamaged(`It is a protected backup of a kind (version ${version}) this Outpost does not read. A newer Outpost may.`);
  }
  const length = bytes.readUInt32BE(9);
  const manifestLength = bytes.readUInt16BE(176);
  if (manifestLength > MAX_MANIFEST_BYTES || length !== FIXED_BYTES + manifestLength + CHECKSUM_BYTES) {
    throw new BackupDamaged("Its header is damaged.");
  }
  if (bytes.length < length) throw new BackupDamaged("It ends before its header does, so it has been cut short.");
  const body = bytes.subarray(0, length - CHECKSUM_BYTES);
  const checksum = Buffer.from(bytes.subarray(length - CHECKSUM_BYTES, length));
  if (!createHash("sha256").update(body).digest().equals(checksum)) throw new BackupDamaged("Its header is damaged.");
  const chunkBytes = bytes.readUInt32BE(13);
  const logN = bytes.readUInt8(81);
  const r = bytes.readUInt8(82);
  const p = bytes.readUInt8(83);
  // The checksum is no secret, so a header can be altered and its checksum made to match.
  // Whatever it then says is held to what this version writes.
  if (chunkBytes < 4096 || chunkBytes > 4 * 1024 * 1024) throw new BackupDamaged("Its header gives a chunk size Outpost does not read.");
  if (logN < SCRYPT_LOGN_FLOOR || logN > SCRYPT_LOGN_READ_MAX || r !== SCRYPT_R || p !== SCRYPT_P) {
    throw new BackupDamaged("Its header asks for work to open it that is outside what Outpost will do.");
  }
  return {
    length,
    chunkBytes,
    publicKey: Buffer.from(bytes.subarray(17, 49)),
    ephemeralPublic: Buffer.from(bytes.subarray(49, 81)),
    wrapped: {
      logN,
      r,
      p,
      salt: Buffer.from(bytes.subarray(84, 116)),
      nonce: Buffer.from(bytes.subarray(116, 128)),
      sealed: Buffer.from(bytes.subarray(128, 128 + WRAPPED_BYTES)),
    },
    manifest: body.subarray(FIXED_BYTES).toString("utf8"),
    checksum,
  };
}

async function readExactly(handle: fs.promises.FileHandle, length: number, position: number, into?: Buffer): Promise<Buffer> {
  const buffer = into && into.length >= length ? into : Buffer.alloc(length);
  let read = 0;
  while (read < length) {
    const { bytesRead } = await handle.read(buffer, read, length - read, position + read);
    if (bytesRead === 0) break;
    read += bytesRead;
  }
  return buffer.subarray(0, read);
}

async function headerOf(handle: fs.promises.FileHandle): Promise<SealedHeader | undefined> {
  const start = await readExactly(handle, FIXED_BYTES, 0);
  if (!isSealed(start)) return undefined;
  const declared = start.length >= 13 ? start.readUInt32BE(9) : 0;
  const most = FIXED_BYTES + MAX_MANIFEST_BYTES + CHECKSUM_BYTES;
  return parseHeader(declared > FIXED_BYTES && declared <= most ? await readExactly(handle, declared, 0) : start);
}

/**
 * The header of a protected backup, or undefined when the file is not one (an
 * ordinary backup, or anything else). Throws `BackupDamaged` for a protected backup
 * whose header does not read. No passphrase is needed.
 */
export async function readSealedHeader(file: string): Promise<SealedHeader | undefined> {
  const handle = await fs.promises.open(file, "r");
  try {
    return await headerOf(handle);
  } finally {
    await handle.close();
  }
}

// ── Chunks ──────────────────────────────────────────────────────────────────

/** The chunk's number in eleven bytes, most significant first, then 1 for the last chunk and 0 for every other. */
function chunkNonce(index: number, last: boolean): Buffer {
  const nonce = Buffer.alloc(NONCE_BYTES);
  nonce.writeUInt32BE(Math.floor(index / 2 ** 32), 3);
  nonce.writeUInt32BE(index >>> 0, 7);
  nonce[11] = last ? 1 : 0;
  return nonce;
}

/** The encrypted bytes of one chunk and its tag, as two pieces, to be written one after the other. */
function sealChunk(fileKey: Buffer, index: number, last: boolean, plain: Buffer): [Buffer, Buffer] {
  const cipher = createCipheriv(CIPHER, fileKey, chunkNonce(index, last), { authTagLength: TAG_BYTES });
  const sealed = cipher.update(plain);
  // A stream cipher holds nothing back, so there is nothing more to come; this is what sets the tag.
  cipher.final();
  return [sealed, cipher.getAuthTag()];
}

function openChunk(fileKey: Buffer, index: number, last: boolean, sealed: Buffer): Buffer {
  const decipher = createDecipheriv(CIPHER, fileKey, chunkNonce(index, last), { authTagLength: TAG_BYTES });
  decipher.setAuthTag(sealed.subarray(sealed.length - TAG_BYTES));
  const plain = decipher.update(sealed.subarray(0, sealed.length - TAG_BYTES));
  // Throws unless the tag matches.
  decipher.final();
  return plain;
}

export interface Sealing {
  /** Write the backup in; read the protected file out. */
  stream: Transform;
  /**
   * The key this one file is encrypted under. It exists in memory while the backup is
   * being written and checked, and is never stored: afterwards only the passphrase opens the file.
   */
  fileKey: Buffer;
}

/** Encrypts one backup to `key`'s public half. `manifest` is the JSON text to leave readable in the header. */
export function seal(key: ProtectionKey, manifest: string): Sealing {
  const ephemeral = generateKeyPairSync("x25519");
  const ephemeralPublic = rawPublic(ephemeral.publicKey);
  const header = encodeHeader(key, ephemeralPublic, manifest);
  const shared = diffieHellman({ privateKey: ephemeral.privateKey, publicKey: publicFromRaw(key.publicKey) });
  const fileKey = fileKeyFrom(shared, ephemeralPublic, key.publicKey, header.checksum);
  // One chunk's worth of the backup is gathered here, then encrypted and written.
  const gathered = Buffer.alloc(CHUNK_BYTES);
  let filled = 0;
  let index = 0;
  const stream = new Transform({
    transform(chunk: Buffer, _encoding, done) {
      let taken = 0;
      while (taken < chunk.length) {
        // A full chunk is only written once more is known to follow it: the last chunk is
        // marked as the last, and which one that is cannot be known until the end.
        if (filled === CHUNK_BYTES) {
          for (const piece of sealChunk(fileKey, index, false, gathered)) this.push(piece);
          index += 1;
          filled = 0;
        }
        const copied = chunk.copy(gathered, filled, taken, taken + Math.min(chunk.length - taken, CHUNK_BYTES - filled));
        filled += copied;
        taken += copied;
      }
      done();
    },
    flush(done) {
      for (const piece of sealChunk(fileKey, index, true, gathered.subarray(0, filled))) this.push(piece);
      gathered.fill(0);
      done();
    },
  });
  stream.push(header.bytes);
  // The stream's own copy goes when the stream does; the caller's is the caller's to wipe.
  const forCaller = Buffer.from(fileKey);
  stream.once("close", () => fileKey.fill(0));
  return { stream, fileKey: forCaller };
}

/** How a protected backup is opened: with the passphrase, or with the key of a file this process has just written. */
export type SealedAccess = { passphrase: string } | { fileKey: Buffer };

export interface SealedFile {
  header: SealedHeader;
  /** Bytes of the backup inside. */
  size: number;
  /** Reads every chunk in turn and checks it. Throws `BackupDamaged` if any does not open, or the file is cut short. */
  checkWhole(signal?: AbortSignal): Promise<void>;
  /** The bytes of the backup from `start` up to, not including, `end`. Every chunk touched is checked. */
  read(start: number, end: number): Readable;
  close(): Promise<void>;
}

const CUT_OR_ALTERED = "Part of it does not open with its key: the file has been damaged, altered or cut short.";

/**
 * Opens a protected backup for reading. Nothing decrypted is written anywhere: chunks
 * are opened in memory as they are asked for.
 */
export async function openSealed(file: string, access: SealedAccess): Promise<SealedFile> {
  const handle = await fs.promises.open(file, "r");
  try {
    const header = await headerOf(handle);
    if (!header) throw new BackupDamaged("It is not a protected Outpost backup.");
    const fileSize = (await handle.stat()).size;
    const sealedChunk = header.chunkBytes + TAG_BYTES;
    const body = fileSize - header.length;
    const chunks = Math.ceil(body / sealedChunk);
    const lastSealed = body - (chunks - 1) * sealedChunk;
    // The last chunk holds at least its tag, and is empty only when the whole backup is.
    if (body < TAG_BYTES || lastSealed < TAG_BYTES || (chunks > 1 && lastSealed === TAG_BYTES)) throw new BackupDamaged(CUT_OR_ALTERED);
    const size = body - chunks * TAG_BYTES;

    let fileKey: Buffer;
    if ("fileKey" in access) {
      fileKey = access.fileKey;
    } else {
      const privateKey = await unwrapPrivateKey(header, access.passphrase);
      try {
        const shared = diffieHellman({ privateKey: privateFromRaw(privateKey), publicKey: publicFromRaw(header.ephemeralPublic) });
        fileKey = fileKeyFrom(shared, header.ephemeralPublic, header.publicKey, header.checksum);
      } catch (error) {
        if (error instanceof BackupDamaged) throw error;
        throw new BackupDamaged("The key in its header is not a usable one.");
      } finally {
        privateKey.fill(0);
      }
    }

    /** The chunk read most recently: a zip's index is read in many small pieces from the same few chunks. */
    let recent: { index: number; plain: Buffer } | undefined;
    /** `into` is a buffer to read the encrypted chunk into, when the caller reads one chunk at a time and can lend one. */
    const chunk = async (index: number, keep: boolean, into?: Buffer): Promise<Buffer> => {
      if (recent?.index === index) return recent.plain;
      const last = index === chunks - 1;
      const length = last ? lastSealed : sealedChunk;
      const sealed = await readExactly(handle, length, header.length + index * sealedChunk, into);
      if (sealed.length !== length) throw new BackupDamaged(CUT_OR_ALTERED);
      let plain: Buffer;
      try {
        plain = openChunk(fileKey, index, last, sealed);
      } catch {
        throw new BackupDamaged(CUT_OR_ALTERED);
      }
      if (keep) recent = { index, plain };
      return plain;
    };

    return {
      header,
      size,
      async checkWhole(signal) {
        const scratch = Buffer.alloc(sealedChunk);
        for (let index = 0; index < chunks; index += 1) {
          signal?.throwIfAborted();
          await chunk(index, false, scratch);
        }
      },
      read(start, end) {
        async function* pieces() {
          let position = start;
          while (position < end) {
            const index = Math.floor(position / header!.chunkBytes);
            if (index >= chunks) throw new BackupDamaged(CUT_OR_ALTERED);
            const plain = await chunk(index, true);
            const from = position - index * header!.chunkBytes;
            const piece = plain.subarray(from, Math.min(plain.length, from + (end - position)));
            if (piece.length === 0) throw new BackupDamaged(CUT_OR_ALTERED);
            position += piece.length;
            yield piece;
          }
        }
        return Readable.from(pieces(), { objectMode: false });
      },
      async close() {
        recent = undefined;
        if (!("fileKey" in access)) fileKey.fill(0);
        await handle.close().catch(() => undefined);
      },
    };
  } catch (error) {
    await handle.close().catch(() => undefined);
    throw error;
  }
}
