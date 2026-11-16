// @vitest-environment node
/** Encrypting a page: the round trip, and every way it must refuse to hand over ciphertext. */
import fs from "node:fs";
import path from "node:path";
import { encryptedNoteArmor, encryptedNoteDoc, type NoteDoc } from "@outpost/shared";
import { beforeAll, describe, expect, it } from "vitest";
import type { PgpEngine } from "./engine";
import { createOpenpgpEngine } from "./engine-openpgp";
import { attachmentCount, openPage, type PageLock, payloadOf, readPayload, sealPage } from "./pages";

const PAGE: NoteDoc = {
  type: "doc",
  content: [
    { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Padlock" }] },
    { type: "paragraph", content: [{ type: "text", text: "Seven four one nine — under the “windowsill” 🙂\ttab" }] },
    { type: "paragraph", content: [{ type: "pageLink", attrs: { noteId: "01HZZZZZZZZZZZZZZZZZZZZZZZ", label: "Warden" } }] },
    { type: "codeBlock", attrs: { language: null }, content: [{ type: "text", text: "line one\nline two\r\nline three" }] },
  ],
};
const PASSPHRASE = "kizif-hagoz-nopud-vatam";

let engine: PgpEngine;
let keyLock: PageLock;

beforeAll(async () => {
  engine = await createOpenpgpEngine(await import("openpgp"));
  const made = await engine.generateKey({ name: "Page Owner", algorithm: "curve25519", expiresInSeconds: 0, passphrase: PASSPHRASE });
  keyLock = {
    kind: "key",
    fingerprint: made.info.fingerprint,
    publicKey: made.publicKey,
    unlocked: await engine.unlock(made.privateKey, PASSPHRASE),
  };
}, 60_000);

describe("sealing and opening a page", () => {
  it("round-trips a page under a passphrase, exactly", async () => {
    const lock: PageLock = { kind: "passphrase", passphrase: PASSPHRASE };
    const armor = await sealPage(engine, PAGE, lock);
    expect(armor).not.toContain("windowsill");
    expect(encryptedNoteArmor(encryptedNoteDoc(armor))).toBe(armor.trim());
    expect(await openPage(engine, armor, lock)).toEqual({ content: PAGE, foreign: false });
  });

  it("round-trips a page under a key", async () => {
    const armor = await sealPage(engine, PAGE, keyLock);
    expect(await engine.messageNeeds(armor)).toMatchObject({ passphrase: false, encrypted: true });
    expect(await openPage(engine, armor, keyLock)).toEqual({ content: PAGE, foreign: false });
  });

  it("does not open with the wrong passphrase", async () => {
    const armor = await sealPage(engine, PAGE, { kind: "passphrase", passphrase: PASSPHRASE });
    await expect(openPage(engine, armor, { kind: "passphrase", passphrase: "not the passphrase" })).rejects.toThrow();
  });

  it("refuses a page with a picture or an attached file", async () => {
    const withPicture: NoteDoc = {
      type: "doc",
      content: [{ type: "image", attrs: { src: "/api/attachments/01ABC", alt: null, title: null } }],
    };
    expect(attachmentCount(withPicture)).toBe(1);
    await expect(sealPage(engine, withPicture, { kind: "passphrase", passphrase: PASSPHRASE })).rejects.toThrow(
      /picture or an attached file/,
    );
    const withLink: NoteDoc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "the scan", marks: [{ type: "link", attrs: { href: "/api/attachments/01DEF" } }] }],
        },
      ],
    };
    expect(attachmentCount(withLink)).toBe(1);
    expect(attachmentCount(PAGE)).toBe(0);
    expect(attachmentCount({ type: "doc", content: [withPicture.content[0], withPicture.content[0], withLink.content[0]] })).toBe(2);
  });
});

describe("handing over nothing when the check fails", () => {
  /** An engine that encrypts properly but whose decryption can be made to misbehave. */
  const faulty = (decryptText: PgpEngine["decryptText"], encryptText?: PgpEngine["encryptText"]): PgpEngine => ({
    ...engine,
    encryptText: encryptText ?? ((text, to) => engine.encryptText(text, to)),
    decryptText,
  });
  const lock: PageLock = { kind: "passphrase", passphrase: PASSPHRASE };

  it("throws when the message decrypts to something else", async () => {
    const wrong = faulty(async () => ({ text: payloadOf({ type: "doc", content: [{ type: "paragraph" }] }), signatures: [] }));
    await expect(sealPage(wrong, PAGE, lock)).rejects.toThrow(/did not decrypt back/);
  });

  it("throws when the message loses so much as a character", async () => {
    const lossy = faulty(async (armor, using) => {
      const opened = await engine.decryptText(armor, using);
      return { ...opened, text: opened.text.replace("\\r\\n", "\\n") };
    });
    await expect(sealPage(lossy, PAGE, lock)).rejects.toThrow(/did not decrypt back/);
  });

  it("throws when the message cannot be decrypted again at all", async () => {
    const broken = faulty(async () => {
      throw new Error("Modification detected");
    });
    await expect(sealPage(broken, PAGE, lock)).rejects.toThrow(/could not be decrypted again/);
  });

  it("throws when encryption itself fails", async () => {
    const failing = faulty(engine.decryptText, async () => {
      throw new Error("no entropy");
    });
    await expect(sealPage(failing, PAGE, lock)).rejects.toThrow(/no entropy/);
  });

  it("throws when what comes out is not a message the server would recognise", async () => {
    const plain = faulty(
      async () => ({ text: payloadOf(PAGE), signatures: [] }),
      async (text) => text,
    );
    await expect(sealPage(plain, PAGE, lock)).rejects.toThrow(/not in the form Outpost stores/);
  });
});

describe("reading what is inside a message", () => {
  it("reads a page Outpost wrote", () => {
    expect(readPayload(payloadOf(PAGE))).toEqual({ content: PAGE, foreign: false });
  });

  it("shows a message Outpost did not write as plain paragraphs", () => {
    expect(readPayload("first line\n\nthird line")).toEqual({
      foreign: true,
      content: {
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "first line" }] },
          { type: "paragraph" },
          { type: "paragraph", content: [{ type: "text", text: "third line" }] },
        ],
      },
    });
    expect(readPayload("").content.content).toEqual([{ type: "paragraph" }]);
    expect(readPayload('{"outpost":"encrypted-page","version":2,"content":{}}').foreign).toBe(true);
    expect(readPayload('{"some":"json"}').foreign).toBe(true);
  });

  it("opens a page that gpg -c wrote as a foreign message", async () => {
    const armor = fs.readFileSync(path.join(import.meta.dirname, "fixtures/gnupg-symmetric.asc"), "utf8");
    const opened = await openPage(engine, armor, { kind: "passphrase", passphrase: "symmetric fixture" });
    expect(opened.foreign).toBe(true);
    expect(opened.content.content[0]).toEqual({ type: "paragraph", content: [{ type: "text", text: "Written by gpg -c." }] });
  });
});
