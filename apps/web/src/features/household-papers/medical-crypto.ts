/**
 * Encrypting a medical sheet, as a page of notes is encrypted (features/encryption/
 * pages.ts): the record goes inside one OpenPGP message, made in this browser, and the
 * message is handed back for saving only once it has been decrypted again to exactly
 * what was written.
 *
 * A sheet opened on this device is held in this tab's memory, with the way it was
 * locked so that it can be saved again, until "Lock" is pressed, five minutes pass
 * without use, or the tab goes. The grab cards and the binder read opened sheets from
 * here. Nothing decrypted is ever sent to the server or written to the browser's storage.
 */
import { isArmoredMessage, MEDICAL_PAYLOAD, type MedicalPayload, type MedicalRecord } from "@outpost/shared";
import { useSyncExternalStore } from "react";
import { type PgpEngine, PgpError } from "@/features/encryption/engine";
import type { PageLock } from "@/features/encryption/pages";
import { UNLOCK_IDLE_MS } from "@/features/encryption/session";

export type SheetLock = PageLock;

const using = (lock: SheetLock) => (lock.kind === "passphrase" ? { passphrase: lock.passphrase } : { keys: [lock.unlocked] });

export const payloadOf = (name: string, record: MedicalRecord): string =>
  JSON.stringify({ outpost: MEDICAL_PAYLOAD, version: 1, name, record } satisfies MedicalPayload);

export function readPayload(text: string): MedicalPayload {
  let parsed: Partial<MedicalPayload> | null = null;
  try {
    parsed = JSON.parse(text) as Partial<MedicalPayload>;
  } catch {
    // Not JSON: not one of ours.
  }
  if (parsed?.outpost !== MEDICAL_PAYLOAD || parsed.version !== 1 || typeof parsed.record !== "object" || parsed.record === null)
    throw new PgpError("failed", "This message opened, but what is inside is not a medical sheet written by Outpost.");
  return parsed as MedicalPayload;
}

/** Encrypts a sheet and proves the result: it must decrypt again, here, to exactly what went in. */
export async function sealSheet(engine: PgpEngine, name: string, record: MedicalRecord, lock: SheetLock): Promise<string> {
  const payload = payloadOf(name, record);
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
      `The sheet was encrypted, but could not be decrypted again to check it, so nothing was saved (${error instanceof Error ? error.message : "unknown reason"}).`,
    );
  }
  if (back !== payload) throw new PgpError("failed", "The encrypted sheet did not decrypt back to what was written, so nothing was saved.");
  if (!isArmoredMessage(armor))
    throw new PgpError("failed", "The encrypted sheet is not in the form Outpost stores, so nothing was saved.");
  return armor.trim();
}

export async function openSheet(engine: PgpEngine, armor: string, lock: SheetLock): Promise<MedicalRecord> {
  return readPayload((await engine.decryptText(armor, using(lock))).text).record;
}

// ── Sheets opened on this device ─────────────────────────────────────────────

export interface OpenedSheet {
  /** The message it was opened from: one saved since elsewhere is a different message, and the sheet is opened again. */
  armor: string;
  record: MedicalRecord;
  lock: SheetLock;
}

const opened = new Map<string, OpenedSheet & { timer: ReturnType<typeof setTimeout> }>();
const listeners = new Set<() => void>();
let snapshot: ReadonlyMap<string, OpenedSheet> = new Map();

function changed() {
  snapshot = new Map([...opened].map(([id, { armor, record, lock }]) => [id, { armor, record, lock }]));
  for (const listener of listeners) listener();
}

export function holdOpened(id: string, sheet: OpenedSheet, idleMs = UNLOCK_IDLE_MS): void {
  const before = opened.get(id);
  if (before) clearTimeout(before.timer);
  opened.set(id, { ...sheet, timer: setTimeout(() => lockSheet(id), idleMs) });
  changed();
}

/** Counts as use: the idle time starts again. */
export function touchOpened(id: string, idleMs = UNLOCK_IDLE_MS): void {
  const entry = opened.get(id);
  if (!entry) return;
  clearTimeout(entry.timer);
  entry.timer = setTimeout(() => lockSheet(id), idleMs);
}

export function lockSheet(id: string): void {
  const entry = opened.get(id);
  if (!entry) return;
  clearTimeout(entry.timer);
  opened.delete(id);
  changed();
}

export function lockAllSheets(): void {
  for (const id of [...opened.keys()]) lockSheet(id);
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** The sheets opened in this tab, by id. A sheet whose message has changed since it was opened is not given. */
export const useOpenedSheets = (): ReadonlyMap<string, OpenedSheet> =>
  useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => snapshot,
  );

if (typeof window !== "undefined") window.addEventListener("pagehide", (event) => !event.persisted && lockAllSheets());
