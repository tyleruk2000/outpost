/**
 * Looks at the outside of an OpenPGP key, without doing any cryptography.
 *
 * The server keeps keys it cannot use: every signature is made and checked in the
 * browser. But it must be able to promise two things about what it stores, whatever a
 * browser sends: a "public key" holds no private material, and a "private key" is one
 * whose secret numbers are all encrypted under a passphrase. Both can be read from the
 * packet framing (RFC 4880 §4, RFC 9580 §4 and §5.5), and so can the fingerprint,
 * which is a hash of the public part.
 *
 * Everything here fails closed: a packet, version, algorithm or protection method it
 * does not know is a reason to refuse the key, never to let it through.
 */
import { createHash } from "node:crypto";
import { badRequest } from "../../core/errors.ts";

export type ArmorKind = "PUBLIC KEY BLOCK" | "PRIVATE KEY BLOCK";

export interface KeyFacts {
  /** Lower-case hex. */
  fingerprint: string;
  version: 4 | 6;
  /** User IDs as written in the key. Nothing here checks that the key's owner signed them. */
  userIds: string[];
  subkeys: number;
}

const TAG = {
  signature: 2,
  secretKey: 5,
  publicKey: 6,
  secretSubkey: 7,
  marker: 10,
  userId: 13,
  publicSubkey: 14,
  userAttribute: 17,
} as const;

const refuse = (what: string): never => {
  throw badRequest(what);
};

// ── Armour ──────────────────────────────────────────────────────────────────

/** Bytes of the one armoured block in `text`. Anything before, after or beside it is refused. */
export function dearmor(text: string, kind: ArmorKind): Uint8Array {
  const lines = text.replace(/^﻿/, "").trim().split(/\r?\n/);
  const head = `-----BEGIN PGP ${kind}-----`;
  const tail = `-----END PGP ${kind}-----`;
  const what = kind === "PUBLIC KEY BLOCK" ? "public key" : "private key";
  if (lines[0]?.trim() !== head) {
    if (kind === "PUBLIC KEY BLOCK" && /BEGIN PGP PRIVATE KEY BLOCK/.test(lines[0] ?? "")) {
      refuse("That is a private key. Only a public key can be added here; a private key never has to leave the person it belongs to.");
    }
    refuse(`That is not an armoured ${what}. It should start with the line "${head}".`);
  }
  if (lines.at(-1)?.trim() !== tail) refuse(`The ${what} is cut short or holds more than one key. It should end with the line "${tail}".`);
  let index = 1;
  while (index < lines.length - 1 && /^[A-Za-z][A-Za-z0-9-]*: /.test(lines[index]!)) index += 1;
  if (lines[index]?.trim() !== "") refuse(`The ${what} is not formed as it should be: there is no blank line after its first lines.`);
  const body: string[] = [];
  for (const raw of lines.slice(index + 1, -1)) {
    const line = raw.trim();
    // The checksum line. It is optional and guards only against accidents, so it is not checked.
    if (/^=[A-Za-z0-9+/]{4}$/.test(line)) continue;
    if (line.startsWith("-----")) refuse("Add one key at a time: this text holds more than one armoured block.");
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(line)) refuse(`The ${what} has characters in it that do not belong. Copy it again, whole.`);
    body.push(line);
  }
  const bytes = Buffer.from(body.join(""), "base64");
  if (bytes.length === 0) refuse(`The ${what} is empty.`);
  return new Uint8Array(bytes);
}

// ── Packets ─────────────────────────────────────────────────────────────────

interface Packet {
  tag: number;
  body: Uint8Array;
}

function readPackets(bytes: Uint8Array): Packet[] {
  const packets: Packet[] = [];
  let at = 0;
  const need = (count: number) => {
    if (at + count > bytes.length) refuse("The key is cut short. Copy it again, whole.");
  };
  while (at < bytes.length) {
    const first = bytes[at]!;
    at += 1;
    if ((first & 0x80) === 0) refuse("That is not an OpenPGP key.");
    let tag: number;
    let length: number;
    if (first & 0x40) {
      tag = first & 0x3f;
      need(1);
      const a = bytes[at]!;
      at += 1;
      if (a < 192) length = a;
      else if (a < 224) {
        need(1);
        length = ((a - 192) << 8) + bytes[at]! + 192;
        at += 1;
      } else if (a === 255) {
        need(4);
        length = new DataView(bytes.buffer, bytes.byteOffset + at, 4).getUint32(0);
        at += 4;
      } else {
        // A partial length: data of unknown size, which a key never is.
        return refuse("The key is in a form that cannot be checked (a packet of unknown length).");
      }
    } else {
      tag = (first & 0x3c) >> 2;
      const kind = first & 0x03;
      if (kind === 3) return refuse("The key is in a form that cannot be checked (a packet of unknown length).");
      const size = kind === 0 ? 1 : kind === 1 ? 2 : 4;
      need(size);
      length = 0;
      for (let step = 0; step < size; step += 1) length = length * 256 + bytes[at + step]!;
      at += size;
    }
    need(length);
    packets.push({ tag, body: bytes.subarray(at, at + length) });
    at += length;
  }
  return packets;
}

/** The length in bytes of an MPI starting at `at` (two bytes of bit count, then the number). */
function mpiLength(body: Uint8Array, at: number): number {
  if (at + 2 > body.length) refuse("The key is cut short. Copy it again, whole.");
  const bits = (body[at]! << 8) | body[at + 1]!;
  return 2 + Math.ceil(bits / 8);
}

/**
 * Where the public part of a version 4 key packet ends. It depends on the algorithm
 * (RFC 9580 §5.5.5), and an algorithm not listed there is refused.
 */
function publicEndV4(body: Uint8Array): number {
  let at = 6;
  const algorithm = body[5];
  const mpis = (count: number) => {
    for (let step = 0; step < count; step += 1) at += mpiLength(body, at);
  };
  const lengthPrefixed = () => {
    const size = body[at] ?? 0;
    if (size === 0 || size === 255) refuse("The key uses a curve that is not recognised.");
    at += 1 + size;
  };
  switch (algorithm) {
    case 1:
    case 2:
    case 3:
      mpis(2); // RSA: n, e
      break;
    case 16:
      mpis(3); // Elgamal: p, g, y
      break;
    case 17:
      mpis(4); // DSA: p, q, g, y
      break;
    case 19: // ECDSA
    case 22: // EdDSA as GnuPG has long written it
      lengthPrefixed();
      mpis(1);
      break;
    case 18: // ECDH
      lengthPrefixed();
      mpis(1);
      lengthPrefixed(); // KDF parameters
      break;
    case 25:
      at += 32; // X25519
      break;
    case 26:
      at += 56; // X448
      break;
    case 27:
      at += 32; // Ed25519
      break;
    case 28:
      at += 57; // Ed448
      break;
    default:
      refuse("The key uses a kind of key that is not recognised, so it cannot be checked and was not stored.");
  }
  if (at > body.length) refuse("The key is cut short. Copy it again, whole.");
  return at;
}

function versionOf(body: Uint8Array): 4 | 6 {
  const version = body[0];
  if (version === 4 || version === 6) return version;
  if (version === 2 || version === 3) return refuse("That key is in a format from the 1990s (version 3) that is no longer safe to use.");
  return refuse("That key is in a format that is not supported here (only version 4 and version 6 keys are).");
}

/** Where the public part of a key packet ends. */
function publicEnd(body: Uint8Array): number {
  if (body.length < 6) refuse("The key is cut short. Copy it again, whole.");
  if (versionOf(body) === 4) return publicEndV4(body);
  if (body.length < 10) refuse("The key is cut short. Copy it again, whole.");
  const length = new DataView(body.buffer, body.byteOffset + 6, 4).getUint32(0);
  const end = 10 + length;
  if (end > body.length) refuse("The key is cut short. Copy it again, whole.");
  return end;
}

function fingerprintOf(publicBody: Uint8Array): string {
  if (versionOf(publicBody) === 4) {
    if (publicBody.length > 0xffff) refuse("The key is too large.");
    const prefix = Buffer.from([0x99, publicBody.length >> 8, publicBody.length & 0xff]);
    return createHash("sha1").update(prefix).update(publicBody).digest("hex");
  }
  const prefix = Buffer.alloc(5);
  prefix[0] = 0x9b;
  prefix.writeUInt32BE(publicBody.length, 1);
  return createHash("sha256").update(prefix).update(publicBody).digest("hex");
}

/**
 * Refuses a secret-key packet unless its secret numbers are encrypted under a
 * passphrase stretched by an iterated or memory-hard function (RFC 9580 §3.7.2).
 * Usage 0 is a key in the clear; 255 and a bare cipher number protect it with a
 * checksum that does not detect tampering; GnuPG's "dummy" keys hold no secret at all.
 */
function assertProtected(body: Uint8Array): void {
  const version = versionOf(body);
  let at = publicEnd(body);
  const next = (): number => {
    if (at >= body.length) refuse("The private key is cut short. Copy it again, whole.");
    at += 1;
    return body[at - 1]!;
  };
  const usage = next();
  if (usage === 0) {
    refuse(
      "This private key is not protected by a passphrase, so it was not stored: anyone on the network could have read it. Give it a passphrase first, then add it again.",
    );
  }
  if (usage !== 253 && usage !== 254) {
    refuse(
      "This private key is protected in an old way that cannot detect tampering, so it was not stored. Set its passphrase again with current software, then add it again.",
    );
  }
  if (version === 6) next(); // the length of the fields that follow
  next(); // the cipher
  if (usage === 253) next(); // the AEAD mode
  if (version === 6) next(); // the length of the S2K specifier
  const s2k = next();
  if (s2k === 3 || s2k === 4) return;
  if (s2k === 101)
    refuse("This is a placeholder for a private key kept somewhere else (on a smart card, for example). There is nothing in it to store.");
  refuse(
    "This private key's passphrase is not stretched before use, which makes it quick to guess, so it was not stored. Set its passphrase again with current software, then add it again.",
  );
}

// ── Whole keys ──────────────────────────────────────────────────────────────

function inspect(armored: string, kind: ArmorKind): KeyFacts {
  const secret = kind === "PRIVATE KEY BLOCK";
  const packets = readPackets(dearmor(armored, kind)).filter((packet) => packet.tag !== TAG.marker);
  const primaryTag = secret ? TAG.secretKey : TAG.publicKey;
  const subkeyTag = secret ? TAG.secretSubkey : TAG.publicSubkey;
  const first = packets[0];
  if (!first || first.tag !== primaryTag) {
    if (!secret && first && (first.tag === TAG.secretKey || first.tag === TAG.secretSubkey)) {
      return refuse("That is a private key. Only a public key can be added here.");
    }
    if (first?.tag === TAG.signature) return refuse("That is a signature on its own (a revocation certificate, perhaps), not a key.");
    return refuse(`That is not a ${secret ? "private" : "public"} key.`);
  }

  const userIds: string[] = [];
  let subkeys = 0;
  packets.forEach((packet, index) => {
    if (index > 0 && packet.tag === primaryTag) refuse("Add one key at a time: this text holds more than one key.");
    if (packet.tag === primaryTag || packet.tag === subkeyTag) {
      if (packet.tag === subkeyTag) subkeys += 1;
      if (secret) assertProtected(packet.body);
      // Also refuses versions and algorithms that are not known, since their end cannot be found.
      else if (publicEnd(packet.body) !== packet.body.length) refuse("The public key has extra data after its numbers and was not stored.");
    } else if (packet.tag === TAG.userId) {
      userIds.push(new TextDecoder("utf-8", { fatal: false }).decode(packet.body).slice(0, 500));
    } else if (packet.tag === TAG.signature || packet.tag === TAG.userAttribute) {
      // Carried along unread: only the browser can check a signature.
    } else if (
      packet.tag === TAG.secretKey ||
      packet.tag === TAG.secretSubkey ||
      packet.tag === TAG.publicKey ||
      packet.tag === TAG.publicSubkey
    ) {
      refuse(
        secret
          ? "This private key has public-only parts mixed into it and was not stored."
          : "That key has private parts in it. Only a public key can be added here.",
      );
    } else {
      refuse("The key holds something that is not part of a key, so it was not stored.");
    }
  });

  const body = first.body;
  const end = publicEnd(body);
  return { fingerprint: fingerprintOf(body.subarray(0, end)), version: versionOf(body), userIds, subkeys };
}

/** Facts about an armoured public key. Throws a 400 for anything that is not exactly one public key. */
export const inspectPublicKey = (armored: string): KeyFacts => inspect(armored, "PUBLIC KEY BLOCK");

/** Facts about an armoured private key. Throws a 400 unless every secret part is passphrase-protected. */
export const inspectPrivateKey = (armored: string): KeyFacts => inspect(armored, "PRIVATE KEY BLOCK");
