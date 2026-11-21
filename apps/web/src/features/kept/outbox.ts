/**
 * What was written on this phone while the server was out of reach, waiting to be sent:
 * check-ins and new pages of notes. Each is one record in its own cache
 * (`outpost-outbox`), kept as the person wrote it and sent when Outpost is next in reach
 * (`sendOutbox`, from the reach gate). A record leaves only once the server has it.
 *
 * A check-in goes with the time it was written and the phone's own id for it, so that
 * the board shows when it was written and keeps it once however often it is sent. A
 * page goes as a new page: nothing on the server is changed or overwritten by it.
 */
import { BOARD_CHANNEL, type BoardCheckInInput, type CheckInStatus, type NoteDoc } from "@outpost/shared";
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

export type OutboxItem = OutboxCheckIn | OutboxPage;

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
  refused: number;
}

let sending: Promise<SentFromPhone> | null = null;

/**
 * Sends everything waiting, oldest first. A refusal (the server said no, in words) is
 * kept on the item for the person to see; a failure to reach the server stops and leaves
 * the rest for next time. One run at a time.
 */
export function sendOutbox(): Promise<SentFromPhone> {
  sending ??= (async () => {
    const sent: SentFromPhone = { checkIns: 0, pages: [], refused: 0 };
    for (const item of await listOutbox()) {
      if (item.refused) continue;
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
        } else {
          const { note } = await api.post<{ note: { id: string; title: string } }>("/api/notes", {
            title: item.title.trim() || "Written on a phone",
            content: textDoc(item.text),
          });
          sent.pages.push({ id: note.id, title: note.title });
        }
        await removeFromOutbox(item.id);
      } catch (error) {
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

/** For tests: forget what was read. */
export function forgetOutboxSnapshot(): void {
  snapshot = undefined;
}
