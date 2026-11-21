/**
 * Checking a minisign signature with Node's own Ed25519, so that a release can be
 * checked with no program installed. The format, as minisign's page gives it
 * (https://jedisct1.github.io/minisign/, read 21 November 2026):
 *
 *   public key:  "untrusted comment: …" then base64("Ed" || key id (8 bytes) || Ed25519 public key (32))
 *   signature:   "untrusted comment: …"
 *                base64(algorithm || key id (8) || signature (64))
 *                "trusted comment: …"
 *                base64(global signature (64))
 *
 * The algorithm is "ED" (the file's BLAKE2b-512 hash is signed; what minisign makes by
 * default and what new signatures must use) or "Ed" (the file itself is signed, the
 * older form). The global signature signs the signature followed by the trusted
 * comment, so the trusted comment cannot be changed either.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import { pipeline } from "node:stream/promises";

export class SignatureError extends Error {}

export interface PublicKey {
  keyId: Buffer;
  key: crypto.KeyObject;
}

export interface Signature {
  algorithm: "Ed" | "ED";
  keyId: Buffer;
  signature: Buffer;
  trustedComment: string;
  globalSignature: Buffer;
}

/** The DER prefix of an Ed25519 public key (SubjectPublicKeyInfo), before its 32 bytes. */
const ED25519_SPKI = Buffer.from("302a300506032b6570032100", "hex");

const lines = (text: string) =>
  text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "");

/** Reads a public key: the file's text, or only its second line. */
export function parsePublicKey(text: string): PublicKey {
  const found = lines(text).filter((line) => !line.startsWith("untrusted comment:"));
  const bytes = Buffer.from(found[0] ?? "", "base64");
  if (bytes.length !== 42 || bytes.subarray(0, 2).toString("latin1") !== "Ed")
    throw new SignatureError("That is not a minisign public key.");
  const key = crypto.createPublicKey({ key: Buffer.concat([ED25519_SPKI, bytes.subarray(10)]), format: "der", type: "spki" });
  return { keyId: bytes.subarray(2, 10), key };
}

export function parseSignature(text: string): Signature {
  const all = lines(text);
  const [comment, encoded, trusted, global] = all;
  if (!comment?.startsWith("untrusted comment:") || !encoded || !trusted?.startsWith("trusted comment: ") || !global)
    throw new SignatureError("That is not a minisign signature file.");
  const bytes = Buffer.from(encoded, "base64");
  const algorithm = bytes.subarray(0, 2).toString("latin1");
  if (bytes.length !== 74 || (algorithm !== "Ed" && algorithm !== "ED")) throw new SignatureError("That is not a minisign signature.");
  const globalSignature = Buffer.from(global, "base64");
  if (globalSignature.length !== 64) throw new SignatureError("The signature file's last line is not a signature.");
  return {
    algorithm,
    keyId: bytes.subarray(2, 10),
    signature: bytes.subarray(10),
    trustedComment: trusted.slice("trusted comment: ".length),
    globalSignature,
  };
}

function check(signature: Signature, key: PublicKey, signed: Buffer): string {
  if (!signature.keyId.equals(key.keyId)) throw new SignatureError("It was signed with a different key from Outpost's release key.");
  if (!crypto.verify(null, signed, key.key, signature.signature))
    throw new SignatureError("Its signature does not match: it has been changed since it was signed, or was never signed by this key.");
  const global = Buffer.concat([signature.signature, Buffer.from(signature.trustedComment, "utf8")]);
  if (!crypto.verify(null, global, key.key, signature.globalSignature))
    throw new SignatureError("Its signature's trusted comment has been changed.");
  return signature.trustedComment;
}

/** Checks a signature over bytes in memory. Returns the trusted comment. Throws `SignatureError`. */
export function verifyBytes(data: Buffer, signatureText: string, key: PublicKey): string {
  const signature = parseSignature(signatureText);
  const signed = signature.algorithm === "ED" ? crypto.createHash("blake2b512").update(data).digest() : data;
  return check(signature, key, signed);
}

/** Checks a signature over a file of any size. Only the hashed form ("ED"), which is what minisign makes. */
export async function verifyFile(file: string, signatureText: string, key: PublicKey): Promise<string> {
  const signature = parseSignature(signatureText);
  if (signature.algorithm !== "ED")
    throw new SignatureError("Large files must be signed in minisign's hashed form (minisign -S makes it).");
  const hash = crypto.createHash("blake2b512");
  await pipeline(fs.createReadStream(file), hash);
  return check(signature, key, hash.digest());
}

/** Signs in minisign's hashed form. For tests and for scripts/sign-release.mjs's own check; releases are signed with minisign itself. */
export function signBytes(data: Buffer, secret: crypto.KeyObject, keyId: Buffer, trustedComment: string): string {
  const signature = crypto.sign(null, crypto.createHash("blake2b512").update(data).digest(), secret);
  const global = crypto.sign(null, Buffer.concat([signature, Buffer.from(trustedComment, "utf8")]), secret);
  return [
    "untrusted comment: signature from Outpost's test key",
    Buffer.concat([Buffer.from("ED", "latin1"), keyId, signature]).toString("base64"),
    `trusted comment: ${trustedComment}`,
    global.toString("base64"),
    "",
  ].join("\n");
}

/** A public key's text from a key object, as minisign writes it. */
export function publicKeyText(publicKey: crypto.KeyObject, keyId: Buffer): string {
  const raw = publicKey.export({ format: "der", type: "spki" }).subarray(ED25519_SPKI.length);
  return `untrusted comment: minisign public key ${keyId.toString("hex").toUpperCase()}\n${Buffer.concat([Buffer.from("Ed", "latin1"), keyId, raw]).toString("base64")}\n`;
}
