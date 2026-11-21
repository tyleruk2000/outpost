// @vitest-environment node
/** Encrypting a medical sheet: the round trip with a passphrase and with a key, and what it refuses. */
import { emptyMedicalRecord, isArmoredMessage, type MedicalRecord } from "@outpost/shared";
import { beforeAll, describe, expect, it } from "vitest";
import type { PgpEngine } from "@/features/encryption/engine";
import { createOpenpgpEngine } from "@/features/encryption/engine-openpgp";
import { openSheet, readPayload, type SheetLock, sealSheet } from "./medical-crypto";

const PASSPHRASE = "kizif-hagoz-nopud-vatam";
const RECORD: MedicalRecord = {
  ...emptyMedicalRecord(),
  bloodGroup: "AB-",
  allergies: [{ id: "a", what: "Peanuts", reaction: "Carries an adrenaline pen — “left pocket”" }],
};

let engine: PgpEngine;
let keyLock: SheetLock;

beforeAll(async () => {
  engine = await createOpenpgpEngine(await import("openpgp"));
  const made = await engine.generateKey({ name: "Sheet Owner", algorithm: "curve25519", expiresInSeconds: 0, passphrase: PASSPHRASE });
  keyLock = {
    kind: "key",
    fingerprint: made.info.fingerprint,
    publicKey: made.publicKey,
    unlocked: await engine.unlock(made.privateKey, PASSPHRASE),
  };
}, 60_000);

describe("an encrypted medical sheet", () => {
  it("round-trips under a passphrase, and the message holds none of it in the clear", async () => {
    const lock: SheetLock = { kind: "passphrase", passphrase: PASSPHRASE };
    const armor = await sealSheet(engine, "Sam", RECORD, lock);
    expect(isArmoredMessage(armor)).toBe(true);
    expect(armor).not.toContain("Peanuts");
    expect(await openSheet(engine, armor, lock)).toEqual(RECORD);
  });

  it("round-trips with a key", async () => {
    const armor = await sealSheet(engine, "Sam", RECORD, keyLock);
    expect(await openSheet(engine, armor, keyLock)).toEqual(RECORD);
  });

  it("will not open with the wrong passphrase", async () => {
    const armor = await sealSheet(engine, "Sam", RECORD, { kind: "passphrase", passphrase: PASSPHRASE });
    await expect(openSheet(engine, armor, { kind: "passphrase", passphrase: "wrong-wrong-wrong-wrong" })).rejects.toThrow();
  });

  it("refuses a message that opens but holds something other than a sheet", () => {
    expect(() => readPayload(JSON.stringify({ outpost: "encrypted-page", version: 1 }))).toThrow(/not a medical sheet/);
    expect(() => readPayload("plain words")).toThrow(/not a medical sheet/);
  });
});
