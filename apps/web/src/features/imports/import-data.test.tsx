/**
 * An import that is being worked on is followed by its events: changes of state arrive
 * as `imports.changed` and progress as `job.updated`. While the event stream is up the
 * screen must not also ask the server every few seconds.
 */
import type { ImportDto } from "@outpost/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/lib/api";
import { useImport } from "./import-data";

const busy: ImportDto = {
  id: "imp1",
  kind: "markdown",
  state: "analysing",
  originalName: "Notes.zip",
  sizeBytes: 100,
  error: null,
  createdAt: 0,
  completedAt: null,
  analysis: null,
  options: null,
  report: null,
  job: { id: "j1", state: "running", progress: { current: 1, total: 10, message: "Reading the pages" } },
  canRetry: false,
};

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("useImport", () => {
  it("does not poll a busy import while live events are arriving", async () => {
    const get = vi.spyOn(api, "get").mockResolvedValue({ import: busy });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    renderHook(() => useImport("imp1"), { wrapper });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });
    expect(get).toHaveBeenCalledTimes(1);
  });
});
