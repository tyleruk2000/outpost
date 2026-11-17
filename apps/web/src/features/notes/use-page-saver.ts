/**
 * Connects the save queue (`autosave.ts`) to a page on screen: the network, the query
 * cache, the draft kept in this tab, and the moments a save must not wait (the tab
 * being hidden or closed, the connection coming back).
 */
import type { ApiErrorBody, NoteConflictDetails, NoteDoc, NoteResponse, NoteSaveResult, UpdateNoteBody } from "@outpost/shared";
import { useQueryClient } from "@tanstack/react-query";
import { type RefObject, useEffect, useRef, useState } from "react";
import { ApiError, errorMessage } from "@/lib/api";
import { useServerConnection } from "@/lib/events";
import { type Autosaver, type AutosaveStatus, createAutosaver, type SaveFailure } from "./autosave";
import { noteKeys, reflectInTree, saveNote } from "./notes-data";

/** The fields of a page that are saved as it is edited. */
export interface PageFields {
  title: string;
  icon: string | null;
  tags: string[];
  coverAttachmentId: string | null;
  content: NoteDoc;
}

export const PAGE_FIELDS = ["title", "icon", "tags", "coverAttachmentId", "content"] as const satisfies ReadonlyArray<keyof PageFields>;

// ── The draft: unsaved changes mirrored into this tab's storage ──

export interface PageDraft {
  /** When the draft was last written. */
  at: number;
  /** `updatedAt` of the saved page the changes were made on; absent in drafts kept before it was recorded. */
  base?: number;
  fields: Partial<PageFields>;
}

const draftKey = (noteId: string) => `outpost.notes.draft.${noteId}`;

export function readDraft(noteId: string): PageDraft | null {
  try {
    const stored: unknown = JSON.parse(sessionStorage.getItem(draftKey(noteId)) ?? "null");
    if (typeof stored !== "object" || stored === null) return null;
    const draft = stored as Partial<PageDraft>;
    if (typeof draft.at !== "number" || typeof draft.fields !== "object" || draft.fields === null) return null;
    return typeof draft.base === "number"
      ? { at: draft.at, base: draft.base, fields: draft.fields }
      : { at: draft.at, fields: draft.fields };
  } catch {
    return null;
  }
}

export function clearDraft(noteId: string): void {
  try {
    sessionStorage.removeItem(draftKey(noteId));
  } catch {
    // Without storage there is no draft to clear.
  }
}

export function writeDraft(noteId: string, fields: Partial<PageFields>, base: number): void {
  try {
    sessionStorage.setItem(draftKey(noteId), JSON.stringify({ at: Date.now(), base, fields } satisfies PageDraft));
  } catch {
    // Storage is full or switched off. The changes are still in memory and still being saved.
  }
}

/** True when a draft holds something the saved page does not already have. */
export function draftDiffers(draft: PageDraft, saved: PageFields): boolean {
  return (Object.keys(draft.fields) as Array<keyof PageFields>).some(
    (key) => JSON.stringify(draft.fields[key]) !== JSON.stringify(saved[key]),
  );
}

/**
 * True when the page was saved again, here or elsewhere, after the version the draft's
 * changes were made on: restoring the draft would then put it in place of newer work.
 * A draft without a recorded base is treated as behind, to be safe.
 */
export const draftIsBehind = (draft: PageDraft, savedUpdatedAt: number): boolean => draft.base === undefined || savedUpdatedAt > draft.base;

// ── Sending ──

/** Browsers refuse a keepalive request with a larger body than this. */
const KEEPALIVE_LIMIT = 60_000;

/**
 * The save made while the tab closes. `keepalive` lets it finish after the page is
 * gone, which `api.patch` cannot ask for. A page too long for keepalive is sent the
 * ordinary way; if the browser cuts that off, the draft is what remains.
 */
async function saveWhileUnloading(noteId: string, body: UpdateNoteBody): Promise<NoteSaveResult> {
  const json = JSON.stringify(body);
  let response: Response;
  try {
    response = await fetch(`/api/notes/${noteId}`, {
      method: "PATCH",
      headers: { Accept: "application/json", "Content-Type": "application/json", "X-Outpost-Request": "1" },
      body: json,
      credentials: "same-origin",
      keepalive: json.length <= KEEPALIVE_LIMIT,
    });
  } catch {
    throw new ApiError(0, "unreachable", "The Outpost server is not responding. It may be restarting.");
  }
  if (!response.ok) {
    const error = ((await response.json().catch(() => null)) as ApiErrorBody | null)?.error;
    throw new ApiError(
      response.status,
      error?.code ?? "http",
      error?.message ?? `The server answered with an error (${response.status}).`,
      error?.details,
    );
  }
  return ((await response.json()) as { note: NoteSaveResult }).note;
}

const isConflict = (details: unknown): details is NoteConflictDetails =>
  typeof details === "object" && details !== null && typeof (details as Partial<NoteConflictDetails>).current?.updatedAt === "number";

export function classifySaveError(error: unknown): SaveFailure {
  if (error instanceof ApiError) {
    // A server that cannot be reached, or one in the middle of restarting, is the same thing to a writer.
    if (error.isUnreachable || error.status >= 500) return { kind: "offline" };
    if (error.status === 409 && isConflict(error.details)) return { kind: "conflict", current: error.details.current };
  }
  return { kind: "error", message: errorMessage(error) };
}

export function usePageSaver(options: {
  noteId: string;
  baseUpdatedAt: number;
  /** False for a page that cannot be edited (in the trash). */
  enabled: boolean;
  collect(keys: ReadonlySet<keyof PageFields>): Partial<PageFields>;
}): { saver: RefObject<Autosaver<PageFields> | null>; status: AutosaveStatus } {
  const { noteId, enabled } = options;
  const client = useQueryClient();
  const connected = useServerConnection();
  const [status, setStatus] = useState<AutosaveStatus>({ kind: "saved" });
  const saver = useRef<Autosaver<PageFields> | null>(null);
  const latest = useRef(options);
  latest.current = options;

  useEffect(() => {
    if (!enabled) return;
    const queue = createAutosaver<PageFields>({
      baseUpdatedAt: latest.current.baseUpdatedAt,
      collect: (keys) => latest.current.collect(keys),
      async send(patch, base, { unloading }) {
        const body: UpdateNoteBody = base === undefined ? patch : { ...patch, baseUpdatedAt: base };
        const saved = unloading ? await saveWhileUnloading(noteId, body) : (await saveNote(noteId, body)).note;
        // The cache keeps what was just saved, so coming back to this page shows it at once.
        reflectInTree(client, noteId, { title: saved.title, icon: saved.icon });
        client.setQueryData<NoteResponse>(noteKeys.detail(noteId), (data) =>
          data ? { note: { ...data.note, ...saved, content: patch.content ?? data.note.content } } : data,
        );
        return saved.updatedAt;
      },
      classify: classifySaveError,
      onStatus: setStatus,
      onDraft: (unsaved) => (unsaved ? writeDraft(noteId, unsaved, queue.baseUpdatedAt()) : clearDraft(noteId)),
    });
    saver.current = queue;
    setStatus(queue.status());

    const onVisibility = () => {
      if (document.visibilityState === "hidden") queue.flush();
    };
    const onPageHide = () => queue.flush({ unloading: true });
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      // Only when closing now would lose something: the browser then asks before leaving.
      if (queue.isStuck()) event.preventDefault();
    };
    const onOnline = () => {
      if (queue.status().kind === "offline") queue.retry();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("online", onOnline);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("online", onOnline);
      queue.close();
      if (saver.current === queue) saver.current = null;
    };
  }, [client, noteId, enabled]);

  // The live connection came back: do not wait out the rest of the retry delay.
  useEffect(() => {
    if (connected && saver.current?.status().kind === "offline") saver.current.retry();
  }, [connected]);

  return { saver, status };
}
