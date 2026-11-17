import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useElapsedSeconds, useLiveReply } from "./chat-data";

const setHidden = (hidden: boolean) =>
  act(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => (hidden ? "hidden" : "visible") });
    document.dispatchEvent(new Event("visibilitychange"));
  });

afterEach(() => {
  Reflect.deleteProperty(document, "visibilityState");
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("watching a reply while the page is hidden", () => {
  it("lets go of the stream when the page is hidden and asks for it again when shown", async () => {
    const opened: AbortSignal[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        const signal = init?.signal as AbortSignal;
        opened.push(signal);
        // Held open, as a reply still being written is.
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            signal.addEventListener("abort", () => controller.error(new DOMException("Aborted", "AbortError")));
          },
        });
        return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
      }),
    );
    const client = new QueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    renderHook(() => useLiveReply("c1", true), { wrapper });
    await act(async () => {});
    expect(opened).toHaveLength(1);

    setHidden(true);
    await act(async () => {});
    expect(opened[0]!.aborted).toBe(true);
    expect(opened).toHaveLength(1);

    setHidden(false);
    await act(async () => {});
    expect(opened).toHaveLength(2);
    expect(opened[1]!.aborted).toBe(false);
  });

  it("stops counting seconds while hidden, and is right again when shown", () => {
    vi.useFakeTimers();
    const since = Date.now();
    const { result } = renderHook(() => useElapsedSeconds(since, true));
    act(() => vi.advanceTimersByTime(3000));
    expect(result.current).toBe(3);
    setHidden(true);
    expect(vi.getTimerCount()).toBe(0);
    act(() => vi.advanceTimersByTime(10_000));
    setHidden(false);
    expect(result.current).toBe(13);
  });
});
