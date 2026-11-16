/**
 * The engine, done with OpenPGP.js. This is the only file that calls the library.
 *
 * Choices made here, each for a reason:
 *
 * - **Keys are written the way GnuPG writes them.** "Curve25519" means EdDSA and ECDH in
 *   the older encoding (algorithms 22 and 18) in a version 4 key. OpenPGP.js would
 *   otherwise write the newer encoding of RFC 9580, which GnuPG 2.5 cannot read at all.
 * - **Messages are written the way every OpenPGP program reads them** (the library's
 *   default: an integrity-protected packet of the 2007 standard). GnuPG's own newer
 *   packet (OCB) is read, never written.
 * - **Passphrases are stretched as far as the format allows** (65,011,712 bytes of
 *   SHA-256 per guess), for locked keys and for passphrase-only messages alike.
 * - **A decrypted file is handed over only once all of it has passed its integrity
 *   check.** The library is allowed to work through the file a piece at a time; this
 *   file collects the pieces and gives up nothing if the check at the end fails.
 */
import {
  type DecryptedFile,
  type DecryptedText,
  type DecryptWith,
  type EncryptTo,
  type GenerateKeyOptions,
  type KeyInfo,
  type KeyStatus,
  type MessageNeeds,
  type PgpEngine,
  PgpError,
  type PrivateKeyInfo,
  type Progress,
  parseUserId,
  type SignatureResult,
  type UnlockedKey,
} from "./engine";
import { loadOpenpgp, type OpenPGP } from "./load-openpgp";

type Key = import("openpgp").Key;
type PrivateKey = import("openpgp").PrivateKey;
type Message = import("openpgp").Message<import("openpgp").MaybeStream<string | Uint8Array>>;
type VerificationResult = Awaited<ReturnType<OpenPGP["verify"]>>["signatures"][number];

/** The highest iteration count the format can express. */
const S2K = { s2kIterationCountByte: 255 } as const;
/** Chunks of output are folded into one Blob this often, so the browser can move them out of memory. */
const FOLD_BYTES = 32 * 1024 * 1024;
const NEWER_ENCODING = new Set(["x25519", "ed25519", "x448", "ed448"]);

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

class Unlocked implements UnlockedKey {
  readonly fingerprint: string;
  #key: PrivateKey | null;
  constructor(key: PrivateKey) {
    this.fingerprint = key.getFingerprint();
    this.#key = key;
  }
  get key(): PrivateKey {
    if (!this.#key) throw new PgpError("failed", "This key was locked again. Unlock it with its passphrase.");
    return this.#key;
  }
  forget(): void {
    const key = this.#key as (PrivateKey & { clearPrivateParams?: () => void }) | null;
    this.#key = null;
    try {
      key?.clearPrivateParams?.();
    } catch {
      // Nothing more can be done; the object is no longer reachable from here.
    }
  }
}

const keyOf = (unlocked: UnlockedKey): PrivateKey => {
  if (!(unlocked instanceof Unlocked)) throw new PgpError("failed", "That key did not come from this library.");
  return unlocked.key;
};

function firstPacketTag(armored: string): number | null {
  const lines = armored.trim().split(/\r?\n/);
  const blank = lines.indexOf("");
  const first = lines[blank + 1];
  if (blank < 0 || !first) return null;
  try {
    const byte = atob(first.slice(0, 4)).charCodeAt(0);
    if ((byte & 0x80) === 0) return null;
    return byte & 0x40 ? byte & 0x3f : (byte & 0x3c) >> 2;
  } catch {
    return null;
  }
}

/** How often a long piece of work steps aside, in bytes read, so that the screen can redraw and a progress bar can move. */
const YIELD_BYTES = 4 * 1024 * 1024;

/**
 * Passes a stream through unchanged, reporting how many bytes have gone by. Every few
 * megabytes it also waits for a turn of the event loop: the library's own pipeline runs
 * from one promise to the next without pause, which would otherwise freeze the page
 * until a large file was done.
 */
function counted(stream: ReadableStream<Uint8Array>, onProgress?: Progress): ReadableStream<Uint8Array> {
  let seen = 0;
  let sinceYield = 0;
  return stream.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      async transform(chunk, controller) {
        seen += chunk.byteLength;
        sinceYield += chunk.byteLength;
        onProgress?.(seen);
        controller.enqueue(chunk);
        if (sinceYield >= YIELD_BYTES) {
          sinceYield = 0;
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
        }
      },
    }),
  );
}

/** Reads a stream to its end into one Blob. Rejects, keeping nothing, if the stream fails part-way. */
async function collect(stream: ReadableStream<Uint8Array | string> | Uint8Array | string, type: string): Promise<Blob> {
  if (typeof stream === "string" || stream instanceof Uint8Array) return new Blob([stream as BlobPart], { type });
  const reader = stream.getReader();
  let folded = new Blob([], { type });
  let pending: BlobPart[] = [];
  let pendingBytes = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    pending.push(value as BlobPart);
    pendingBytes += typeof value === "string" ? value.length : value.byteLength;
    if (pendingBytes >= FOLD_BYTES) {
      folded = new Blob([folded, ...pending], { type });
      pending = [];
      pendingBytes = 0;
    }
  }
  return new Blob([folded, ...pending], { type });
}

export async function createOpenpgpEngine(library?: OpenPGP): Promise<PgpEngine> {
  const openpgp = library ?? (await loadOpenpgp());
  const { enums } = openpgp;

  // ── Keys ──

  function algorithmName(key: Key): string {
    const info = key.getAlgorithmInfo();
    const name = String(info.algorithm);
    if (name === "eddsaLegacy" || name === "ed25519") return "Curve25519";
    if (name.startsWith("rsa")) return `RSA ${info.bits ?? ""}`.trim();
    if (name === "ecdsa") return `ECDSA ${info.curve ?? ""}`.trim();
    if (name === "ed448") return "Curve448";
    if (name === "dsa") return `DSA ${info.bits ?? ""}`.trim();
    return name;
  }

  async function describe(key: Key): Promise<KeyInfo> {
    let status: KeyStatus = "valid";
    let statusReason: string | null = null;
    try {
      await key.verifyPrimaryKey();
    } catch (error) {
      statusReason = messageOf(error);
      status = /revoked/i.test(statusReason) ? "revoked" : /expired/i.test(statusReason) ? "expired" : "invalid";
    }
    let expiresAt: number | null = null;
    try {
      const expires = await key.getExpirationTime();
      if (expires instanceof Date) expiresAt = expires.getTime();
    } catch {
      // A key whose own signatures do not hold has no expiry to speak of.
    }
    const can = async (find: () => Promise<unknown>) => {
      try {
        await find();
        return true;
      } catch {
        return false;
      }
    };
    const userIds = key.getUserIDs();
    let primary = userIds[0] ?? "";
    try {
      primary = (await key.getPrimaryUser()).user.userID?.userID ?? primary;
    } catch {
      // An expired or revoked key still says whose it claims to be.
    }
    const { name, email } = parseUserId(primary);
    const keyIds = key.getKeyIDs().map((id) => id.toHex());
    return {
      fingerprint: key.getFingerprint().toLowerCase(),
      keyId: keyIds[0] ?? "",
      keyIds,
      userIds: [primary, ...userIds.filter((id) => id !== primary)].filter(Boolean),
      name,
      email,
      createdAt: key.getCreationTime().getTime(),
      expiresAt,
      algorithm: algorithmName(key),
      status,
      statusReason,
      canEncrypt: status === "valid" && (await can(() => key.getEncryptionKey())),
      canSign: status === "valid" && (await can(() => key.getSigningKey())),
      gnupgReadable:
        key.keyPacket.version === 4 && key.getKeys().every((part) => !NEWER_ENCODING.has(String(part.getAlgorithmInfo().algorithm))),
    };
  }

  async function parsePublic(armored: string): Promise<Key> {
    const text = armored.trim();
    if (/-----BEGIN PGP PRIVATE KEY BLOCK-----/.test(text)) {
      throw new PgpError(
        "not-a-key",
        "That is a private key. Paste the public key here; a private key is only ever imported on its owner’s device.",
      );
    }
    if (!/^-----BEGIN PGP PUBLIC KEY BLOCK-----/.test(text)) {
      throw new PgpError("not-a-key", "That is not a public key. It should start with the line “-----BEGIN PGP PUBLIC KEY BLOCK-----”.");
    }
    if (text.split("-----BEGIN PGP ").length > 2)
      throw new PgpError("not-a-key", "That text holds more than one key. Add them one at a time.");
    let keys: Key[];
    try {
      keys = await openpgp.readKeys({ armoredKeys: text });
    } catch (error) {
      throw new PgpError("not-a-key", `That public key could not be read (${messageOf(error)}). Copy it again, whole.`);
    }
    if (keys.length === 0) throw new PgpError("not-a-key", "There is no key in that text.");
    if (keys.length > 1) throw new PgpError("not-a-key", `That text holds ${keys.length} keys. Add them one at a time.`);
    const key = keys[0]!;
    if (key.isPrivate()) throw new PgpError("not-a-key", "That is a private key. Paste the public key here.");
    return key;
  }

  async function parsePrivate(armored: string): Promise<PrivateKey> {
    const text = armored.trim();
    if (!/^-----BEGIN PGP PRIVATE KEY BLOCK-----/.test(text)) {
      throw new PgpError("not-a-key", "That is not a private key. It should start with the line “-----BEGIN PGP PRIVATE KEY BLOCK-----”.");
    }
    try {
      const keys = await openpgp.readPrivateKeys({ armoredKeys: text });
      if (keys.length !== 1) throw new Error(keys.length === 0 ? "no key in it" : "more than one key in it");
      return keys[0]!;
    } catch (error) {
      throw new PgpError("not-a-key", `That private key could not be read (${messageOf(error)}). Copy it again, whole.`);
    }
  }

  /** Public keys for encrypting to, each checked to be usable today. */
  async function recipientsOf(armoredKeys: readonly string[]): Promise<Key[]> {
    const keys: Key[] = [];
    for (const armored of armoredKeys) {
      const key = await parsePublic(armored);
      try {
        await key.getEncryptionKey();
      } catch (error) {
        const who = key.getUserIDs()[0] ?? key.getFingerprint();
        throw new PgpError("unusable-key", `The key of ${who} cannot be encrypted to: ${messageOf(error)}.`);
      }
      keys.push(key);
    }
    return keys;
  }

  async function verifiersOf(armoredKeys: readonly string[] | undefined): Promise<Key[]> {
    const keys: Key[] = [];
    for (const armored of armoredKeys ?? []) {
      try {
        keys.push(await parsePublic(armored));
      } catch {
        // A stored key that cannot be read cannot vouch for anything; it is left out.
      }
    }
    return keys;
  }

  // ── Signatures ──

  async function readSignatures(results: readonly VerificationResult[], verifiers: readonly Key[]): Promise<SignatureResult[]> {
    const read: SignatureResult[] = [];
    for (const result of results) {
      const keyId = result.keyID.toHex();
      const signer = verifiers.find((key) => key.getKeyIDs().some((id) => id.equals(result.keyID)));
      let signedAt: number | null = null;
      try {
        signedAt = (await result.signature).packets[0]?.created?.getTime() ?? null;
      } catch {
        // The signature packet could not be read; `verified` below says why.
      }
      const fingerprint = signer ? signer.getFingerprint().toLowerCase() : null;
      if (!signer) {
        // Do not await `verified` for its own sake, but do not leave its rejection unhandled either.
        result.verified.catch(() => undefined);
        read.push({ status: "unknown-key", keyId, fingerprint: null, signedAt, detail: null });
        continue;
      }
      try {
        await result.verified;
        read.push({ status: "good", keyId, fingerprint, signedAt, detail: null });
      } catch (error) {
        const detail = messageOf(error);
        const keyState = /revoked|expired|not yet valid/i.test(detail) && !/digest|did not match/i.test(detail);
        read.push({ status: keyState ? "unusable-key" : "bad", keyId, fingerprint, signedAt, detail });
      }
    }
    return read;
  }

  // ── Messages ──

  const isClearSigned = (text: string) => /^-----BEGIN PGP SIGNED MESSAGE-----/.test(text.trim());

  async function parseMessage(armored: string): Promise<Message> {
    const text = armored.trim();
    if (/^-----BEGIN PGP (PUBLIC|PRIVATE) KEY BLOCK-----/.test(text)) {
      throw new PgpError("not-a-message", "That is a key, not a message. Keys are added on the Keys tab.");
    }
    if (!/^-----BEGIN PGP MESSAGE-----/.test(text)) {
      throw new PgpError("not-a-message", "That is not an OpenPGP message. It should start with the line “-----BEGIN PGP MESSAGE-----”.");
    }
    try {
      return (await openpgp.readMessage({ armoredMessage: text })) as Message;
    } catch (error) {
      throw new PgpError("not-a-message", `That message could not be read (${messageOf(error)}). Copy it again, whole.`);
    }
  }

  function needsOf(message: Message): MessageNeeds {
    const tags = message.packets.map((packet) => (packet.constructor as unknown as { tag: number }).tag);
    const encrypted = tags.some(
      (tag) =>
        tag === enums.packet.symEncryptedIntegrityProtectedData ||
        tag === enums.packet.aeadEncryptedData ||
        tag === enums.packet.symmetricallyEncryptedData,
    );
    return {
      keyIds: message.getEncryptionKeyIDs().map((id) => id.toHex()),
      passphrase: tags.includes(enums.packet.symEncryptedSessionKey),
      encrypted,
    };
  }

  /** Turns the library's reasons for failing to decrypt into ours. */
  function decryptError(error: unknown, using: DecryptWith, needs: MessageNeeds | null): PgpError {
    if (error instanceof PgpError) return error;
    const detail = messageOf(error);
    if (/modification detected|authentication tag|integrity|mdc/i.test(detail)) {
      // A passphrase-only message has nothing to check a passphrase against but the text itself.
      if (using.passphrase !== undefined && !(using.keys?.length ?? 0)) {
        return new PgpError(
          "tampered",
          "That did not decrypt. Either the passphrase is wrong, or the message was changed after it was encrypted.",
        );
      }
      return new PgpError("tampered", "The message was changed after it was encrypted, or is damaged. Nothing from it is shown.");
    }
    if (/session key decryption failed|no decryption key|decrypt.*session key|invalid session key|no key or password/i.test(detail)) {
      if (using.passphrase !== undefined && (needs?.passphrase ?? true) && !(using.keys?.length ?? 0)) {
        return new PgpError("wrong-passphrase", "That passphrase does not open this message.");
      }
      return new PgpError("no-key", "None of the keys unlocked here can open this message. It was encrypted to a different key.");
    }
    if (using.passphrase !== undefined && !(using.keys?.length ?? 0)) {
      // With the wrong passphrase what comes out is noise, and noise fails in many ways.
      return new PgpError(
        "tampered",
        "That did not decrypt. Either the passphrase is wrong, or the message was changed after it was encrypted.",
      );
    }
    return new PgpError("failed", `That could not be decrypted (${detail}).`);
  }

  async function encryptionOptions(to: EncryptTo) {
    const recipients = await recipientsOf(to.recipients ?? []);
    const passwords = to.passphrase !== undefined && to.passphrase !== "" ? [to.passphrase] : [];
    if (recipients.length === 0 && passwords.length === 0) {
      throw new PgpError("failed", "Choose at least one key to encrypt to, or give a passphrase.");
    }
    return {
      ...(recipients.length > 0 ? { encryptionKeys: recipients } : {}),
      ...(passwords.length > 0 ? { passwords } : {}),
      ...(to.signWith ? { signingKeys: keyOf(to.signWith) } : {}),
      config: S2K,
    };
  }

  const engine: PgpEngine = {
    library:
      `OpenPGP.js ${(openpgp.config as { versionString?: string }).versionString?.replace(/^OpenPGP\.js\s*/i, "").replace(/^v/, "") ?? ""}`.trim(),

    async generateKey(options: GenerateKeyOptions) {
      const name = options.name.trim();
      const email = options.email?.trim() ?? "";
      if (!name && !email) throw new PgpError("failed", "A key needs a name, so that people can tell whose it is.");
      if (!options.passphrase) throw new PgpError("failed", "A private key is always protected by a passphrase. Give one.");
      try {
        const made = await openpgp.generateKey({
          ...(options.algorithm === "rsa4096"
            ? { type: "rsa" as const, rsaBits: 4096 }
            : { type: "ecc" as const, curve: "curve25519Legacy" as const }),
          userIDs: [{ ...(name ? { name } : {}), ...(email ? { email } : {}) }],
          passphrase: options.passphrase,
          keyExpirationTime: Math.max(0, Math.floor(options.expiresInSeconds)),
          format: "object",
          config: S2K,
        });
        return {
          publicKey: made.publicKey.armor(),
          privateKey: made.privateKey.armor(),
          revocationCertificate: made.revocationCertificate,
          info: await describe(made.publicKey),
        };
      } catch (error) {
        if (error instanceof PgpError) throw error;
        const detail = messageOf(error);
        if (/user id|email/i.test(detail))
          throw new PgpError("failed", "That name or email address cannot go in a key. An email address needs the form name@example.org.");
        throw new PgpError("failed", `The key could not be made (${detail}).`);
      }
    },

    async readPublicKey(armored) {
      const key = await parsePublic(armored);
      return { ...(await describe(key)), publicKey: key.armor() };
    },

    async readPrivateKey(armored): Promise<PrivateKeyInfo> {
      const key = await parsePrivate(armored);
      const parts = key.getKeys().map((part) => part.keyPacket as unknown as { isDummy(): boolean; isDecrypted(): boolean | null });
      const real = parts.filter((part) => !part.isDummy());
      if (real.length === 0) {
        throw new PgpError(
          "not-a-key",
          "That is a placeholder for a private key kept somewhere else (on a smart card, for example). There is nothing in it to import.",
        );
      }
      return {
        ...(await describe(key)),
        isProtected: real.every((part) => part.isDecrypted() === false),
        publicKey: key.toPublic().armor(),
      };
    },

    isRevocationCertificate(armored) {
      return /^-----BEGIN PGP PUBLIC KEY BLOCK-----/.test(armored.trim()) && firstPacketTag(armored) === enums.packet.signature;
    },

    async unlock(privateKey, passphrase) {
      const key = await parsePrivate(privateKey);
      try {
        return new Unlocked(await openpgp.decryptKey({ privateKey: key, passphrase }));
      } catch (error) {
        const detail = messageOf(error);
        if (/incorrect key passphrase|passphrase/i.test(detail))
          throw new PgpError("wrong-passphrase", "That is not this key’s passphrase.");
        if (/already decrypted/i.test(detail))
          throw new PgpError("failed", "This private key has no passphrase. Outpost only uses private keys that are protected by one.");
        throw new PgpError("failed", `The key could not be unlocked (${detail}).`);
      }
    },

    async changePassphrase(privateKey, oldPassphrase, newPassphrase) {
      if (!newPassphrase) throw new PgpError("failed", "A private key is always protected by a passphrase. Give a new one.");
      const unlocked = (await engine.unlock(privateKey, oldPassphrase)) as Unlocked;
      try {
        return (await openpgp.encryptKey({ privateKey: unlocked.key, passphrase: newPassphrase, config: S2K })).armor();
      } finally {
        unlocked.forget();
      }
    },

    async revocationCertificate(unlocked) {
      const revoked = await openpgp.revokeKey({
        key: keyOf(unlocked),
        reasonForRevocation: { flag: enums.reasonForRevocation.noReason, string: "" },
        format: "object",
      });
      const certificate = await revoked.publicKey.getRevocationCertificate();
      if (typeof certificate !== "string") throw new PgpError("failed", "The revocation certificate could not be written.");
      return certificate;
    },

    async applyRevocation(publicKey, certificate) {
      const key = await parsePublic(publicKey);
      try {
        return (await openpgp.revokeKey({ key, revocationCertificate: certificate, format: "armored" })).publicKey;
      } catch (error) {
        throw new PgpError("failed", `That revocation certificate does not belong to this key, or is damaged (${messageOf(error)}).`);
      }
    },

    async messageNeeds(armored) {
      if (isClearSigned(armored)) return { keyIds: [], passphrase: false, encrypted: false };
      return needsOf(await parseMessage(armored));
    },

    async encryptText(text, to) {
      const options = await encryptionOptions(to);
      try {
        // As bytes, not as "text": OpenPGP's text mode rewrites line endings, and what comes out should be what went in.
        const message = await openpgp.createMessage({ binary: new TextEncoder().encode(text) });
        return (await openpgp.encrypt({ message, ...options, format: "armored" })) as string;
      } catch (error) {
        if (error instanceof PgpError) throw error;
        throw new PgpError("failed", `That could not be encrypted (${messageOf(error)}).`);
      }
    },

    async decryptText(armored, using) {
      const message = await parseMessage(armored);
      const needs = needsOf(message);
      if (!needs.encrypted)
        throw new PgpError("not-a-message", "That message is signed but not encrypted. Check it under “Check a signature”.");
      const verifiers = await verifiersOf(using.verifyWith);
      try {
        const result = await openpgp.decrypt({
          message,
          ...(using.keys?.length ? { decryptionKeys: using.keys.map(keyOf) } : {}),
          ...(using.passphrase !== undefined ? { passwords: [using.passphrase] } : {}),
          ...(verifiers.length > 0 ? { verificationKeys: verifiers } : {}),
          format: "binary",
        });
        const text = new TextDecoder("utf-8").decode(result.data as Uint8Array);
        return { text, signatures: await readSignatures(result.signatures, verifiers) };
      } catch (error) {
        throw decryptError(error, using, needs);
      }
    },

    async signText(text, key) {
      try {
        return (await openpgp.sign({ message: await openpgp.createCleartextMessage({ text }), signingKeys: keyOf(key) })) as string;
      } catch (error) {
        if (error instanceof PgpError) throw error;
        throw new PgpError("failed", `That could not be signed (${messageOf(error)}).`);
      }
    },

    async verifyText(armored, verifyWith): Promise<DecryptedText> {
      const verifiers = await verifiersOf(verifyWith);
      try {
        if (isClearSigned(armored)) {
          const message = await openpgp.readCleartextMessage({ cleartextMessage: armored.trim() });
          const result = await openpgp.verify({
            message,
            ...(verifiers.length > 0 ? { verificationKeys: verifiers } : { verificationKeys: [] }),
          });
          return { text: result.data as string, signatures: await readSignatures(result.signatures, verifiers) };
        }
        const message = await parseMessage(armored);
        if (needsOf(message).encrypted)
          throw new PgpError("not-a-message", "That message is encrypted. Decrypt it; any signature inside is checked then.");
        const result = await openpgp.verify({
          message: message as import("openpgp").Message<string>,
          verificationKeys: verifiers,
          format: "utf8",
        });
        return { text: result.data as string, signatures: await readSignatures(result.signatures, verifiers) };
      } catch (error) {
        if (error instanceof PgpError) throw error;
        throw new PgpError(
          "not-a-message",
          `That is not a signed message that can be read (${messageOf(error)}). Copy it again, whole, from the first dashes to the last.`,
        );
      }
    },

    async encryptFile(file, filename, to, onProgress) {
      const options = await encryptionOptions(to);
      try {
        const message = await openpgp.createMessage({
          binary: counted(file.stream() as ReadableStream<Uint8Array>, onProgress),
          filename,
          format: "binary",
        });
        const output: unknown = await openpgp.encrypt({ message, ...options, format: to.armor ? "armored" : "binary" } as Parameters<
          typeof openpgp.encrypt
        >[0]);
        return await collect(output as ReadableStream<Uint8Array | string>, to.armor ? "text/plain" : "application/pgp-encrypted");
      } catch (error) {
        if (error instanceof PgpError) throw error;
        throw new PgpError("failed", `The file could not be encrypted (${messageOf(error)}).`);
      }
    },

    async fileNeeds(file) {
      const message = await readFileMessage(file);
      try {
        return needsOf(message.message);
      } finally {
        message.cancel();
      }
    },

    async decryptFile(file, using, onProgress): Promise<DecryptedFile> {
      const { message, cancel } = await readFileMessage(file, onProgress);
      const needs = needsOf(message);
      if (!needs.encrypted) {
        cancel();
        throw new PgpError("not-a-message", "That file is not encrypted (it may be signed only). There is nothing to decrypt.");
      }
      const verifiers = await verifiersOf(using.verifyWith);
      let result: Awaited<ReturnType<typeof openpgp.decrypt>>;
      try {
        result = await openpgp.decrypt({
          message,
          ...(using.keys?.length ? { decryptionKeys: using.keys.map(keyOf) } : {}),
          ...(using.passphrase !== undefined ? { passwords: [using.passphrase] } : {}),
          ...(verifiers.length > 0 ? { verificationKeys: verifiers } : {}),
          format: "binary",
          // The pieces are kept here until the integrity check at the end has passed; see `collect`.
          config: { allowUnauthenticatedStream: true },
        });
      } catch (error) {
        cancel();
        throw decryptError(error, using, needs);
      }
      try {
        const blob = await collect(result.data as ReadableStream<Uint8Array>, "application/octet-stream");
        const signatures = await readSignatures(result.signatures, verifiers);
        const filename = typeof result.filename === "string" && result.filename ? result.filename : null;
        return { blob, filename, signatures };
      } catch (error) {
        cancel();
        if (error instanceof PgpError) throw error;
        // Whatever went wrong after the key was accepted, what came out cannot be trusted:
        // with the wrong passphrase the data is noise, and noise fails in many ways.
        throw new PgpError(
          "tampered",
          using.passphrase !== undefined && !(using.keys?.length ?? 0)
            ? "That did not decrypt. Either the passphrase is wrong, or the file was changed after it was encrypted. Nothing was saved."
            : "The file was changed after it was encrypted, or is damaged. Nothing was saved.",
        );
      }
    },
  };

  /** Opens a file as a message, armoured or binary, reading only as far as the start of its data. */
  async function readFileMessage(file: Blob, onProgress?: Progress): Promise<{ message: Message; cancel(): void }> {
    const head = await file.slice(0, 64).text();
    if (/^-----BEGIN PGP (PUBLIC|PRIVATE) KEY BLOCK-----/.test(head.trimStart())) {
      throw new PgpError("not-a-message", "That file is a key, not an encrypted file. Keys are added on the Keys tab.");
    }
    const armored = /^-----BEGIN PGP MESSAGE-----/.test(head.trimStart());
    const source = counted(file.stream() as ReadableStream<Uint8Array>, onProgress);
    let cancelled = false;
    const cancel = () => {
      if (cancelled) return;
      cancelled = true;
      source.cancel().catch(() => undefined);
    };
    try {
      const message = armored
        ? await openpgp.readMessage({
            armoredMessage: source.pipeThrough(new TextDecoderStream() as unknown as TransformStream<Uint8Array, string>),
          })
        : await openpgp.readMessage({ binaryMessage: source });
      return { message: message as Message, cancel };
    } catch (error) {
      cancel();
      throw new PgpError("not-a-message", `That file is not an OpenPGP message (${messageOf(error)}).`);
    }
  }

  return engine;
}
