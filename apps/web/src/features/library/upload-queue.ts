/**
 * The queue of files being added to the library.
 *
 * Each file is its own request, so each has its own progress and one refused file does
 * not hold up the rest. At most two are sent at a time. The queue lives outside any
 * component: opening a document or switching tabs half-way through does not cancel it.
 */
import type { DocumentDto, UploadResponse, UploadResult } from "@outpost/shared";
import { useSyncExternalStore } from "react";
import { errorMessage, uploadWithProgress } from "@/lib/api";

export type UploadState = "queued" | "uploading" | "created" | "duplicate" | "rejected" | "failed";

export interface UploadItem {
  id: string;
  file: File;
  state: UploadState;
  /** Share of the file's bytes the server has received, 0 to 1. */
  progress: number;
  /** Set once the person has said to add a file even though the library already has it. */
  allowDuplicate: boolean;
  /** The new document, or for a duplicate the one already in the library. */
  document?: DocumentDto;
  /** Why the file was refused or the upload failed, in the server's words. */
  reason?: string;
}

export type SendFile = (
  file: File,
  options: { allowDuplicate: boolean; onProgress: (fraction: number) => void; signal: AbortSignal },
) => Promise<UploadResult>;

const sendToServer: SendFile = async (file, { allowDuplicate, onProgress, signal }) => {
  const form = new FormData();
  form.append("file", file, file.name);
  const response = await uploadWithProgress<UploadResponse>(
    `/api/documents${allowDuplicate ? "?allowDuplicate=true" : ""}`,
    form,
    onProgress,
    signal,
  );
  const result = response?.results?.[0];
  if (!result) throw new Error("The server did not say what happened to this file. Check the list, then try again.");
  return result;
};

export const isSettled = (item: UploadItem) => item.state !== "queued" && item.state !== "uploading";

export function createUploadQueue(send: SendFile = sendToServer, concurrency = 2) {
  let items: UploadItem[] = [];
  let counter = 0;
  const listeners = new Set<() => void>();
  const controllers = new Map<string, AbortController>();

  const warnBeforeLeaving = (event: BeforeUnloadEvent) => event.preventDefault();

  function emit(): void {
    // Leaving the page would cut uploads short; the browser asks first while any are under way.
    if (items.some((item) => !isSettled(item))) window.addEventListener("beforeunload", warnBeforeLeaving);
    else window.removeEventListener("beforeunload", warnBeforeLeaving);
    for (const listener of listeners) listener();
  }

  function patch(id: string, change: Partial<UploadItem>): void {
    items = items.map((item) => (item.id === id ? { ...item, ...change } : item));
    emit();
  }

  async function run(item: UploadItem): Promise<void> {
    const controller = new AbortController();
    controllers.set(item.id, controller);
    patch(item.id, { state: "uploading", progress: 0, reason: undefined });
    try {
      const result = await send(item.file, {
        allowDuplicate: item.allowDuplicate,
        onProgress: (fraction) => patch(item.id, { progress: fraction }),
        signal: controller.signal,
      });
      patch(item.id, { state: result.status, progress: 1, document: result.document, reason: result.reason });
    } catch (error) {
      // A cancelled upload has already been taken off the list.
      if (!controller.signal.aborted) patch(item.id, { state: "failed", reason: errorMessage(error) });
    } finally {
      controllers.delete(item.id);
      pump();
    }
  }

  function pump(): void {
    let free = concurrency - items.filter((item) => item.state === "uploading").length;
    for (const item of items) {
      if (free <= 0) return;
      if (item.state !== "queued") continue;
      free -= 1;
      void run(item);
    }
  }

  function requeue(id: string, change: Partial<UploadItem>): void {
    const item = items.find((candidate) => candidate.id === id);
    if (!item || !isSettled(item)) return;
    patch(id, { ...change, state: "queued", progress: 0, reason: undefined });
    pump();
  }

  return {
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getItems: () => items,
    add(files: Iterable<File>): void {
      const added = [...files].map<UploadItem>((file) => ({
        id: `upload-${++counter}`,
        file,
        state: "queued",
        progress: 0,
        allowDuplicate: false,
      }));
      if (added.length === 0) return;
      items = [...items, ...added];
      emit();
      pump();
    },
    /** Sends a file again, this time telling the server to keep it even though it has the same content already. */
    addAnyway: (id: string) => requeue(id, { allowDuplicate: true, document: undefined }),
    retry: (id: string) => requeue(id, {}),
    /** Stops a file that is waiting or on its way, and takes it off the list. */
    cancel(id: string): void {
      controllers.get(id)?.abort();
      items = items.filter((item) => item.id !== id);
      emit();
      pump();
    },
    /** Clears finished files from the list. Anything still on its way stays. */
    clearSettled(): void {
      items = items.filter((item) => !isSettled(item));
      emit();
    },
  };
}

export type UploadQueue = ReturnType<typeof createUploadQueue>;

/** The one queue the app uses. */
export const uploadQueue = createUploadQueue();

export function useUploadItems(queue: UploadQueue = uploadQueue): UploadItem[] {
  return useSyncExternalStore(queue.subscribe, queue.getItems, queue.getItems);
}
