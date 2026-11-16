/**
 * What the Encryption screen and encrypted pages need from an OpenPGP library, and
 * nothing more. Everything else in the app talks to this interface; only
 * `engine-openpgp.ts` knows which library is behind it. Replacing the library means
 * writing one more file like that one.
 *
 * Keys cross this boundary as ASCII-armoured text. A private key that has been unlocked
 * with its passphrase is an `UnlockedKey`: an object that stays in this tab's memory
 * (see `session.ts`) and can be made to forget its secret numbers.
 */

/** Why something could not be done, in words for the person. `kind` lets a screen react. */
export class PgpError extends Error {
  readonly kind: PgpErrorKind;
  constructor(kind: PgpErrorKind, message: string) {
    super(message);
    this.name = "PgpError";
    this.kind = kind;
  }
}

export type PgpErrorKind =
  | "unavailable" // no secure context, or the library could not be loaded
  | "not-a-key"
  | "not-a-message"
  | "wrong-passphrase"
  | "no-key" // none of the keys offered can open the message
  | "tampered" // integrity check failed (or, for a passphrase-only message, a wrong passphrase)
  | "unusable-key" // expired, revoked, or without the ability asked of it
  | "failed";

export type KeyAlgorithm = "curve25519" | "rsa4096";

export interface GenerateKeyOptions {
  name: string;
  email?: string;
  algorithm: KeyAlgorithm;
  /** Seconds from now until the key expires; 0 for a key that never does. */
  expiresInSeconds: number;
  passphrase: string;
}

export type KeyStatus = "valid" | "expired" | "revoked" | "invalid";

/** What a key says about itself, read from the key and checked against its own signatures. */
export interface KeyInfo {
  /** Lower-case hex. */
  fingerprint: string;
  /** The last 16 hex digits of the fingerprint (for a version 4 key), as messages name their recipients. */
  keyId: string;
  /** Every key ID in the key, the primary's and the subkeys': a message is addressed to one of these. */
  keyIds: string[];
  /** The key's user IDs as written, the primary one first. These are claims, not proof of who holds the key. */
  userIds: string[];
  name: string;
  email: string | null;
  createdAt: number;
  /** Null for a key that does not expire. */
  expiresAt: number | null;
  /** In words: "Curve25519" or "RSA 4096". */
  algorithm: string;
  status: KeyStatus;
  /** Why the status is not "valid", when the library says. */
  statusReason: string | null;
  /** True when the key has a usable part for encrypting to it today. */
  canEncrypt: boolean;
  /** True when signatures made by it can be checked (and, with the private half, made). */
  canSign: boolean;
  /**
   * False for keys written in the newer encoding of RFC 9580 (version 6 keys, and
   * Ed25519/X25519 as algorithms 27 and 25), which GnuPG does not read.
   */
  gnupgReadable: boolean;
}

export interface PrivateKeyInfo extends KeyInfo {
  /** True when every secret part is locked by a passphrase. */
  isProtected: boolean;
  /** The public half, armoured. */
  publicKey: string;
}

/** A private key with its passphrase applied, held in memory. */
export interface UnlockedKey {
  readonly fingerprint: string;
  /** Wipes the secret numbers from this object, as far as the library can. It cannot be used afterwards. */
  forget(): void;
}

export type SignatureStatus =
  | "good" // the signature matches the text and was made by a key that was offered
  | "bad" // the text or the signature has been changed
  | "unknown-key" // made by a key that was not offered, so it could not be checked
  | "unusable-key"; // made by a key offered here that was expired or revoked when it signed

export interface SignatureResult {
  status: SignatureStatus;
  /** Key ID the signature names (16 hex digits). */
  keyId: string;
  /** Fingerprint of the offered key that made it, when one did. */
  fingerprint: string | null;
  signedAt: number | null;
  /** The library's own words when the status is not "good". */
  detail: string | null;
}

/** What is needed to open a message, read from its outside without opening it. */
export interface MessageNeeds {
  /** Key IDs (16 hex digits) the message is encrypted to. "0000000000000000" is a hidden recipient. */
  keyIds: string[];
  /** True when a passphrase alone can open it (`gpg -c`). */
  passphrase: boolean;
  /** False for text that is signed but not encrypted. */
  encrypted: boolean;
}

export interface DecryptedText {
  text: string;
  signatures: SignatureResult[];
}

export interface DecryptedFile {
  blob: Blob;
  /** The name stored inside the message, when there is one. Never trusted as a path. */
  filename: string | null;
  signatures: SignatureResult[];
}

export interface EncryptTo {
  /** Armoured public keys to encrypt to. */
  recipients?: string[];
  /** A passphrase that can open the message on its own. */
  passphrase?: string;
  signWith?: UnlockedKey;
}

export interface DecryptWith {
  keys?: UnlockedKey[];
  passphrase?: string;
  /** Armoured public keys to check signatures against. */
  verifyWith?: string[];
}

export type Progress = (bytesRead: number) => void;

export interface PgpEngine {
  /** The library's name and version, for the screen and the docs to state. */
  readonly library: string;

  generateKey(
    options: GenerateKeyOptions,
  ): Promise<{ publicKey: string; privateKey: string; revocationCertificate: string; info: KeyInfo }>;
  /** Reads one public key. Throws `not-a-key` for anything else, including a private key. */
  readPublicKey(armored: string): Promise<KeyInfo & { publicKey: string }>;
  readPrivateKey(armored: string): Promise<PrivateKeyInfo>;
  /** True when `armored` is a revocation certificate rather than a key. */
  isRevocationCertificate(armored: string): boolean;

  unlock(privateKey: string, passphrase: string): Promise<UnlockedKey>;
  /** Locks a private key under a new passphrase. */
  changePassphrase(privateKey: string, oldPassphrase: string, newPassphrase: string): Promise<string>;

  /** A certificate that, once published, tells everyone to stop using the key. The key itself is not changed. */
  revocationCertificate(key: UnlockedKey): Promise<string>;
  /** The public key with a revocation certificate applied. Throws when the certificate is not for this key. */
  applyRevocation(publicKey: string, certificate: string): Promise<string>;

  messageNeeds(armored: string): Promise<MessageNeeds>;
  encryptText(text: string, to: EncryptTo): Promise<string>;
  decryptText(armored: string, using: DecryptWith): Promise<DecryptedText>;
  /** A clear-signed message: the text readable as it is, with a signature under it. */
  signText(text: string, key: UnlockedKey): Promise<string>;
  /** Checks a clear-signed message, or a signed (not encrypted) armoured message. */
  verifyText(armored: string, verifyWith: string[]): Promise<DecryptedText>;

  encryptFile(file: Blob, filename: string, to: EncryptTo & { armor?: boolean }, onProgress?: Progress): Promise<Blob>;
  /**
   * Decrypts a file. Resolves only after the whole message has been read and its
   * integrity check has passed, so nothing unverified is ever handed over.
   */
  decryptFile(file: Blob, using: DecryptWith, onProgress?: Progress): Promise<DecryptedFile>;
  fileNeeds(file: Blob): Promise<MessageNeeds>;
}

/** True where the browser lets a page do cryptography: HTTPS, or the computer Outpost runs on. */
export function cryptographyAvailable(): boolean {
  return typeof globalThis.crypto !== "undefined" && typeof globalThis.crypto.subtle !== "undefined";
}

let engine: Promise<PgpEngine> | undefined;

/** The engine, loaded the first time it is asked for. */
export function getEngine(): Promise<PgpEngine> {
  if (!cryptographyAvailable()) {
    return Promise.reject(
      new PgpError(
        "unavailable",
        "This browser only allows cryptography on a page opened over HTTPS, or on the computer Outpost runs on. This page was opened over plain HTTP.",
      ),
    );
  }
  engine ??= import("./engine-openpgp").then(
    (module) => module.createOpenpgpEngine(),
    (error: unknown) => {
      engine = undefined;
      throw new PgpError(
        "unavailable",
        `The encryption library could not be loaded (${error instanceof Error ? error.message : "unknown reason"}).`,
      );
    },
  );
  engine.catch(() => {
    engine = undefined;
  });
  return engine;
}

/** "Ada Lovelace <ada@example.org>" → name and email. A user ID is free text; this is a best reading of it. */
export function parseUserId(userId: string): { name: string; email: string | null } {
  const match = /^(.*?)\s*<([^<>\s]+@[^<>\s]+)>\s*$/.exec(userId);
  if (match) return { name: (match[1] ?? "").replace(/\s*\([^)]*\)\s*$/, "").trim(), email: match[2] ?? null };
  if (/^[^\s<>]+@[^\s<>]+$/.test(userId.trim())) return { name: "", email: userId.trim() };
  return { name: userId.trim(), email: null };
}
