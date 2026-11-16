/**
 * Encryption: the shapes of the key shelf's API, and what an encrypted page is.
 *
 * All OpenPGP work happens in the browser. The server keeps public keys and, when a
 * person asks for it, a private key that is already protected by its passphrase. It
 * never sees a passphrase, an unprotected key or the text being encrypted.
 */
import type { NoteDoc } from "./notes.ts";

// ── Keys kept on the server ─────────────────────────────────────────────────

/** A key as the server lists it. The browser reads names, dates and abilities from `publicKey` itself. */
export interface StoredKey {
  /** Worked out by the server from the key, lower-case hex: 40 characters, or 64 for a version 6 key. */
  fingerprint: string;
  /** ASCII-armoured public key. */
  publicKey: string;
  /** True when the passphrase-protected private half is kept on the server too. */
  hasPrivateKey: boolean;
  /** Listed under "My keys": someone said this key is theirs when they added it. */
  mine: boolean;
  addedAt: number;
  updatedAt: number;
}

export interface StoredKeysResponse {
  keys: StoredKey[];
}
export interface StoredKeyResponse {
  key: StoredKey;
}
export interface StoredPrivateKeyResponse {
  /** ASCII-armoured private key, protected by its passphrase. */
  privateKey: string;
}

export interface SaveKeyBody {
  publicKey: string;
  mine?: boolean;
}
export interface SavePrivateKeyBody {
  privateKey: string;
}

/** The largest armoured key the server takes, and how many keys it keeps. */
export const MAX_KEY_ARMOR_BYTES = 100_000;
export const MAX_STORED_KEYS = 500;

// ── Encrypted pages ─────────────────────────────────────────────────────────

/**
 * An encrypted page is an ordinary page whose whole content is one code block of this
 * language holding one armoured OpenPGP message. Nothing else marks it, so the page
 * survives everything a page goes through (export, backup, a portable drive and its
 * return) as ciphertext, and a copy of Outpost that knows nothing of encryption shows
 * it as a block of text rather than losing it.
 */
export const ENCRYPTED_NOTE_LANGUAGE = "pgp-message";

const ARMOR_HEAD = "-----BEGIN PGP MESSAGE-----";
const ARMOR_TAIL = "-----END PGP MESSAGE-----";

/** True for text that has the outward form of one armoured OpenPGP message and nothing else. */
export function isArmoredMessage(text: string): boolean {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 4 || lines[0] !== ARMOR_HEAD || lines.at(-1) !== ARMOR_TAIL) return false;
  let index = 1;
  // Optional "Key: value" headers, then one blank line.
  while (index < lines.length - 1 && /^[A-Za-z][A-Za-z0-9-]*: /.test(lines[index]!)) index += 1;
  if (lines[index] !== "") return false;
  const body = lines.slice(index + 1, -1);
  if (body.length === 0) return false;
  return body.every((line, at) => /^[A-Za-z0-9+/]+={0,2}$/.test(line) || (at === body.length - 1 && /^=[A-Za-z0-9+/]{4}$/.test(line)));
}

/** The armoured message of an encrypted page, or null when the page is an ordinary one. */
export function encryptedNoteArmor(doc: unknown): string | null {
  if (typeof doc !== "object" || doc === null) return null;
  const blocks = (doc as { content?: unknown }).content;
  if (!Array.isArray(blocks) || blocks.length !== 1) return null;
  const block = blocks[0] as { type?: unknown; attrs?: { language?: unknown }; content?: unknown };
  if (block?.type !== "codeBlock" || block.attrs?.language !== ENCRYPTED_NOTE_LANGUAGE) return null;
  if (!Array.isArray(block.content) || block.content.length !== 1) return null;
  const text = (block.content[0] as { type?: unknown; text?: unknown }) ?? {};
  if (text.type !== "text" || typeof text.text !== "string") return null;
  return isArmoredMessage(text.text) ? text.text.trim() : null;
}

/** The content of an encrypted page: the one block that holds `armor`. */
export function encryptedNoteDoc(armor: string): NoteDoc {
  return {
    type: "doc",
    content: [{ type: "codeBlock", attrs: { language: ENCRYPTED_NOTE_LANGUAGE }, content: [{ type: "text", text: armor.trim() }] }],
  };
}

/**
 * What is inside the message of an encrypted page, as JSON: the page's content as it
 * was. `gpg --decrypt` on the block shows this text.
 */
export interface EncryptedNotePayload {
  outpost: "encrypted-page";
  version: 1;
  content: NoteDoc;
}
