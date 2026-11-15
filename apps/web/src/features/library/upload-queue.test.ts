import type { DocumentDto, UploadResult } from "@outpost/shared";
import { describe, expect, it, vi } from "vitest";
import { createUploadQueue, type SendFile } from "./upload-queue";

const file = (name: string) => new File(["x"], name);

/** A stand-in for the server that answers each file when the test says so. */
function controlledSend() {
  const calls: Array<{
    name: string;
    allowDuplicate: boolean;
    resolve: (result: UploadResult) => void;
    reject: (error: Error) => void;
    onProgress: (fraction: number) => void;
    signal: AbortSignal;
  }> = [];
  const send: SendFile = (sent, options) =>
    new Promise((resolve, reject) => {
      calls.push({
        name: sent.name,
        allowDuplicate: options.allowDuplicate,
        resolve,
        reject,
        onProgress: options.onProgress,
        signal: options.signal,
      });
    });
  return { send, calls };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const states = (queue: ReturnType<typeof createUploadQueue>) => queue.getItems().map((item) => item.state);

describe("upload queue", () => {
  it("sends at most two files at a time, in order", async () => {
    const { send, calls } = controlledSend();
    const queue = createUploadQueue(send);
    queue.add([file("a.pdf"), file("b.pdf"), file("c.pdf")]);
    expect(calls.map((call) => call.name)).toEqual(["a.pdf", "b.pdf"]);
    expect(states(queue)).toEqual(["uploading", "uploading", "queued"]);

    calls[0]!.resolve({ originalName: "a.pdf", status: "created", document: { id: "1", title: "A" } as DocumentDto });
    await settle();
    expect(calls.map((call) => call.name)).toEqual(["a.pdf", "b.pdf", "c.pdf"]);
    expect(states(queue)).toEqual(["created", "uploading", "uploading"]);
  });

  it("records each file's own progress and outcome", async () => {
    const { send, calls } = controlledSend();
    const queue = createUploadQueue(send);
    queue.add([file("a.pdf"), file("b.exe")]);
    calls[0]!.onProgress(0.4);
    expect(queue.getItems()[0]!.progress).toBe(0.4);
    expect(queue.getItems()[1]!.progress).toBe(0);

    calls[1]!.resolve({
      originalName: "b.exe",
      status: "rejected",
      reason: '"b.exe" is a .exe file, which the library cannot store.',
      code: "unsupported",
    });
    await settle();
    expect(queue.getItems()[1]).toMatchObject({ state: "rejected", reason: '"b.exe" is a .exe file, which the library cannot store.' });
    expect(queue.getItems()[0]!.state).toBe("uploading");
  });

  it("re-sends a duplicate with allowDuplicate when asked to add it anyway", async () => {
    const { send, calls } = controlledSend();
    const queue = createUploadQueue(send);
    queue.add([file("a.pdf")]);
    calls[0]!.resolve({ originalName: "a.pdf", status: "duplicate", document: { id: "1", title: "Existing" } as DocumentDto });
    await settle();
    const [item] = queue.getItems();
    expect(item).toMatchObject({ state: "duplicate", document: { id: "1" } });
    expect(calls[0]!.allowDuplicate).toBe(false);

    queue.addAnyway(item!.id);
    expect(calls).toHaveLength(2);
    expect(calls[1]).toMatchObject({ name: "a.pdf", allowDuplicate: true });
    calls[1]!.resolve({ originalName: "a.pdf", status: "created", document: { id: "2", title: "A" } as DocumentDto });
    await settle();
    expect(queue.getItems()[0]).toMatchObject({ state: "created", document: { id: "2" } });
  });

  it("keeps a failed request's message and can try again without holding up the rest", async () => {
    const { send, calls } = controlledSend();
    const queue = createUploadQueue(send);
    queue.add([file("a.pdf"), file("b.pdf"), file("c.pdf")]);
    calls[0]!.reject(new Error("The upload was interrupted. Check that the server is running."));
    await settle();
    expect(queue.getItems()[0]).toMatchObject({ state: "failed", reason: "The upload was interrupted. Check that the server is running." });
    expect(calls.map((call) => call.name)).toEqual(["a.pdf", "b.pdf", "c.pdf"]);

    queue.retry(queue.getItems()[0]!.id);
    expect(queue.getItems()[0]!.state).toBe("queued");
  });

  it("cancels a file on its way and takes it off the list", async () => {
    const { send, calls } = controlledSend();
    const queue = createUploadQueue(send);
    queue.add([file("a.pdf"), file("b.pdf"), file("c.pdf")]);
    queue.cancel(queue.getItems()[0]!.id);
    expect(calls[0]!.signal.aborted).toBe(true);
    expect(queue.getItems().map((item) => item.file.name)).toEqual(["b.pdf", "c.pdf"]);
    // The freed place goes to the next file.
    expect(calls.map((call) => call.name)).toEqual(["a.pdf", "b.pdf", "c.pdf"]);
  });

  it("clears finished files but not ones still on their way, and tells listeners", async () => {
    const { send, calls } = controlledSend();
    const queue = createUploadQueue(send);
    const listener = vi.fn();
    queue.subscribe(listener);
    queue.add([file("a.pdf"), file("b.pdf")]);
    calls[0]!.resolve({ originalName: "a.pdf", status: "created" });
    await settle();
    queue.clearSettled();
    expect(queue.getItems().map((item) => item.file.name)).toEqual(["b.pdf"]);
    expect(listener).toHaveBeenCalled();
  });
});
