/**
 * What was written on this phone while the server was out of reach, waiting to be sent:
 * check-ins, new pages of notes, and changes to pages kept on the phone. Each is one record in its own cache
 * (`outpost-outbox`), kept as the person wrote it and sent when Outpost is next in reach
 * (`sendOutbox`, from the reach gate). A record leaves only once the server has it.
 *
 * A check-in goes with the time it was written and the phone's own id for it, so that
 * the board shows when it was written and keeps it once however often it is sent. A
 * new page goes with the phone's id for it too, so that a reply lost on the way cannot
 * make it twice. A change to a kept page goes with the time of the copy it was made on:
 * when the page has been saved on Outpost since, nothing is overwritten. The change stays
 * here, marked (`conflict`), and the page's own screen asks which version to keep.
 */
import {
  BOARD_CHANNEL,
  type BoardCheckInInput,
  type CheckInStatus,
  LOCKED_CODE,
  type NoteConflictDetails,
  type NoteDoc,
  type UpdateNoteBody,
} from "@outpost/shared";
import { useSyncExternalStore } from "react";
import { ApiError, api } from "@/lib/api";
import { keepingSupported } from "./store";

export const OUTBOX = "outpost-outbox";

interface OutboxBase {
  id: string;
  writtenAt: number;
  /** Why the server refused it the last time, when it did. It stays until removed or sent again. */
  refused?: string;
}

export interface OutboxCheckIn extends OutboxBase {
  kind: "checkin";
  author: string;
  status: CheckInStatus;
  body: string;
  place: string | null;
}

export interface OutboxPage extends OutboxBase {
  kind: "page";
  title: string;
  text: string;
}

/** Changes to a page kept on the phone: its title and text as they are now on the phone. One for each page. */
export interface OutboxEdit extends OutboxBase {
  kind: "edit";
  noteId: string;
  title: string;
  content: NoteDoc;
  /** `updatedAt` of the kept copy the changes were made on. */
  base: number;
  /** Set when Outpost had a newer version than `base`: what it had. Settled on the page's own screen. */
  conflict?: NoteConflictDetails["current"];
}

export type OutboxItem = OutboxCheckIn | OutboxPage | OutboxEdit;

/** The record of changes to a page: one per page, replaced as the person types. */
export const editId = (noteId: string) => `edit-${noteId}`;

const recordKey = (id: string) => `/__outbox/${encodeURIComponent(id)}`;

/** An id the server accepts as a phone's own: letters, digits and dashes. */
function outboxId(): string {
  const random =
    typeof crypto !== "undefined" && "getRandomValues" in crypto
      ? [...crypto.getRandomValues(new Uint8Array(12))].map((byte) => byte.toString(16).padStart(2, "0")).join("")
      : `${Math.random().toString(16).slice(2)}${Math.random().toString(16).slice(2)}`;
  return `o-${Date.now().toString(36)}-${random}`;
}

// ── Telling screens that the list changed ──

const listeners = new Set<() => void>();
const channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel("outpost-outbox");
let snapshot: OutboxItem[] | undefined;

async function reload(): Promise<void> {
  snapshot = await listOutbox();
  for (const listener of listeners) listener();
}
function changed(): void {
  channel?.postMessage("changed");
  void reload();
}
channel?.addEventListener("message", () => void reload());

export async function listOutbox(): Promise<OutboxItem[]> {
  if (!keepingSupported()) return [];
  const cache = await caches.open(OUTBOX);
  const items: OutboxItem[] = [];
  for (const request of await cache.keys()) {
    const record = await cache.match(request);
    if (!record) continue;
    try {
      items.push((await record.json()) as OutboxItem);
    } catch {
      // A record that cannot be read is left alone.
    }
  }
  return items.sort((a, b) => a.writtenAt - b.writtenAt);
}

async function put(item: OutboxItem): Promise<void> {
  const cache = await caches.open(OUTBOX);
  await cache.put(recordKey(item.id), new Response(JSON.stringify(item), { headers: { "Content-Type": "application/json" } }));
  changed();
}

export async function removeFromOutbox(id: string): Promise<void> {
  await (await caches.open(OUTBOX)).delete(recordKey(id));
  changed();
}

export async function addCheckIn(input: Omit<OutboxCheckIn, "id" | "kind" | "writtenAt">, now = Date.now()): Promise<OutboxCheckIn> {
  const item: OutboxCheckIn = { kind: "checkin", id: outboxId(), writtenAt: now, ...input };
  await put(item);
  return item;
}

export async function addPage(input: { title: string; text: string }, now = Date.now()): Promise<OutboxPage> {
  const item: OutboxPage = { kind: "page", id: outboxId(), writtenAt: now, ...input };
  await put(item);
  return item;
}

/** Keeps the changes to a kept page, replacing the ones kept before for it. */
export async function keepEdit(
  input: { noteId: string; title: string; content: NoteDoc; base: number },
  now = Date.now(),
): Promise<OutboxEdit> {
  const item: OutboxEdit = { kind: "edit", id: editId(input.noteId), writtenAt: now, ...input };
  await put(item);
  return item;
}

/** The changes waiting for a page, if there are any. */
export async function editFor(noteId: string): Promise<OutboxEdit | undefined> {
  if (!keepingSupported()) return undefined;
  const record = await (await caches.open(OUTBOX)).match(recordKey(editId(noteId)));
  if (!record) return undefined;
  try {
    return (await record.json()) as OutboxEdit;
  } catch {
    return undefined;
  }
}

/** Plain text as a page: a paragraph for each line, blank lines between paragraphs kept as breaks between them. */
export function textDoc(text: string): NoteDoc {
  const paragraphs = text
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);
  return {
    type: "doc",
    content:
      paragraphs.length > 0
        ? paragraphs.map((part) => ({
            type: "paragraph",
            content: part
              .split("\n")
              .flatMap((line, index) => [...(index > 0 ? [{ type: "hardBreak" }] : []), { type: "text", text: line }]),
          }))
        : [{ type: "paragraph" }],
  } as NoteDoc;
}

export interface SentFromPhone {
  checkIns: number;
  pages: Array<{ id: string; title: string }>;
  /** Pages whose changes were saved on Outpost. */
  edits: number;
  /** Pages changed on Outpost too: their changes wait on this phone for the person to choose. */
  conflicts: Array<{ id: string; title: string }>;
  refused: number;
  /** Stopped because this device is not unlocked with the household PIN: everything waits. */
  locked: boolean;
}

const isConflict = (details: unknown): details is NoteConflictDetails =>
  typeof details === "object" && details !== null && typeof (details as Partial<NoteConflictDetails>).current?.updatedAt === "number";

let sending: Promise<SentFromPhone> | null = null;

/**
 * Sends everything waiting, oldest first. A refusal (the server said no, in words) is
 * kept on the item for the person to see; a failure to reach the server stops and leaves
 * the rest for next time. One run at a time.
 */
export function sendOutbox(): Promise<SentFromPhone> {
  sending ??= (async () => {
    const sent: SentFromPhone = { checkIns: 0, pages: [], edits: 0, conflicts: [], refused: 0, locked: false };
    for (const item of await listOutbox()) {
      if (item.refused || (item.kind === "edit" && item.conflict)) continue;
      try {
        if (item.kind === "checkin") {
          const input: BoardCheckInInput = {
            author: item.author,
            status: item.status,
            body: item.body,
            place: item.place,
            writtenAt: item.writtenAt,
            clientId: item.id,
          };
          await api.post("/api/board/check-ins", { ...input, channel: BOARD_CHANNEL });
          sent.checkIns += 1;
        } else if (item.kind === "page") {
          const { note } = await api.post<{ note: { id: string; title: string } }>("/api/notes", {
            title: item.title.trim() || "Written on a phone",
            content: textDoc(item.text),
            clientId: item.id,
          });
          sent.pages.push({ id: note.id, title: note.title });
        } else {
          const body: UpdateNoteBody = { title: item.title, content: item.content, baseUpdatedAt: item.base };
          await api.patch(`/api/notes/${encodeURIComponent(item.noteId)}`, body);
          sent.edits += 1;
        }
        await removeFromOutbox(item.id);
      } catch (error) {
        if (error instanceof ApiError && error.code === LOCKED_CODE) {
          sent.locked = true;
          break;
        }
        if (item.kind === "edit" && error instanceof ApiError && error.status === 409 && isConflict(error.details)) {
          await put({ ...item, conflict: error.details.current });
          sent.conflicts.push({ id: item.noteId, title: item.title });
          continue;
        }
        if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
          await put({ ...item, refused: error.message });
          sent.refused += 1;
          continue;
        }
        break;
      }
    }
    return sent;
  })().finally(() => {
    sending = null;
  });
  return sending;
}

/** Sends one refused item again, as it is now. */
export async function tryAgain(item: OutboxItem): Promise<SentFromPhone> {
  const { refused: _, ...rest } = item;
  await put(rest as OutboxItem);
  return sendOutbox();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (snapshot === undefined) void reload();
  return () => listeners.delete(listener);
}

/** What is waiting to be sent, kept up to date. `undefined` until it has been read once. */
export function useOutbox(): OutboxItem[] | undefined {
  return useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => undefined,
  );
}

/**
 * Changes to this page made on this phone that met a newer version on Outpost: `undefined`
 * until the phone's list has been read, `null` when there are none.
 */
export function usePendingEdit(noteId: string): OutboxEdit | null | undefined {
  const items = useOutbox();
  if (!keepingSupported()) return null;
  if (items === undefined) return undefined;
  return items.find((item): item is OutboxEdit => item.kind === "edit" && item.noteId === noteId && item.conflict !== undefined) ?? null;
}

/** For tests: forget what was read. */
export function forgetOutboxSnapshot(): void {
  snapshot = undefined;
}
