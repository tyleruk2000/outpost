/**
 * Encrypting a page of notes: what goes inside the message, and the rule that
 * ciphertext is only ever handed back for saving once it has been decrypted again, in
 * this browser, to exactly what was written.
 *
 * The server stores an encrypted page as an ordinary page whose whole content is one
 * armoured message (`encryptedNoteDoc` in @outpost/shared). Inside the message is this
 * file's payload: the page's content as JSON. `gpg --decrypt` on the block prints it.
 */
import { type EncryptedNotePayload, encryptedNoteArmor, encryptedNoteDoc, type NoteDoc } from "@outpost/shared";
import { type PgpEngine, PgpError, type UnlockedKey } from "./engine";

/** How a page is locked, held in memory while the page is open so that it can be saved again. */
export type PageLock =
  | { kind: "passphrase"; passphrase: string }
  | { kind: "key"; fingerprint: string; publicKey: string; unlocked: UnlockedKey };

const ATTACHMENT = "/api/attachments/";

/**
 * How many pictures and attached files a page refers to. They are separate files on the
 * server, which this does not encrypt, so an encrypted page may not have any.
 */
export function attachmentCount(doc: unknown): number {
  const found = new Set<string>();
  const visit = (value: unknown): void => {
    if (typeof value === "string") {
      const at = value.indexOf(ATTACHMENT);
      if (at >= 0) found.add(value.slice(at));
    } else if (Array.isArray(value)) value.forEach(visit);
    else if (typeof value === "object" && value !== null) Object.values(value).forEach(visit);
  };
  visit(doc);
  return found.size;
}

export function payloadOf(content: NoteDoc): string {
  return JSON.stringify({ outpost: "encrypted-page", version: 1, content } satisfies EncryptedNotePayload);
}

/**
 * The page inside a decrypted message. A message that Outpost did not write (someone
 * pasted one in as a page) is shown as plain paragraphs and marked `foreign`.
 */
export function readPayload(text: string): { content: NoteDoc; foreign: boolean } {
  try {
    const parsed = JSON.parse(text) as Partial<EncryptedNotePayload>;
    if (
      parsed?.outpost === "encrypted-page" &&
      parsed.version === 1 &&
      parsed.content?.type === "doc" &&
      Array.isArray(parsed.content.content)
    ) {
      return { content: parsed.content, foreign: false };
    }
  } catch {
    // Not JSON: not one of ours.
  }
  const paragraphs = text
    .split(/\r?\n/)
    .map((line) =>
      line ? { type: "paragraph" as const, content: [{ type: "text" as const, text: line }] } : { type: "paragraph" as const },
    );
  return { content: { type: "doc", content: paragraphs.length > 0 ? paragraphs : [{ type: "paragraph" }] }, foreign: true };
}

const using = (lock: PageLock) => (lock.kind === "passphrase" ? { passphrase: lock.passphrase } : { keys: [lock.unlocked] });

/**
 * Encrypts a page and proves the result before returning it: the message is decrypted
 * again with the same passphrase or key, and must give back exactly what went in.
 * Anything short of that throws, and the caller saves nothing.
 */
export async function sealPage(engine: PgpEngine, content: NoteDoc, lock: PageLock): Promise<string> {
  if (attachmentCount(content) > 0) {
    throw new PgpError(
      "failed",
      "This page has a picture or an attached file in it. Those are stored as separate files that are not encrypted, so the page was not saved. Remove them from the page first.",
    );
  }
  const payload = payloadOf(content);
  const armor = await engine.encryptText(
    payload,
    lock.kind === "passphrase" ? { passphrase: lock.passphrase } : { recipients: [lock.publicKey] },
  );
  let back: string;
  try {
    back = (await engine.decryptText(armor, using(lock))).text;
  } catch (error) {
    throw new PgpError(
      "failed",
      `The page was encrypted, but could not be decrypted again to check it, so nothing was saved (${error instanceof Error ? error.message : "unknown reason"}).`,
    );
  }
  if (back !== payload) throw new PgpError("failed", "The encrypted page did not decrypt back to what was written, so nothing was saved.");
  // The server must recognise it as an encrypted page, or it would index the ciphertext as text.
  if (encryptedNoteArmor(encryptedNoteDoc(armor)) === null)
    throw new PgpError("failed", "The encrypted page is not in the form Outpost stores, so nothing was saved.");
  return armor;
}

/** Decrypts an encrypted page's message into the page. */
export async function openPage(engine: PgpEngine, armor: string, lock: PageLock): Promise<{ content: NoteDoc; foreign: boolean }> {
  return readPayload((await engine.decryptText(armor, using(lock))).text);
}
