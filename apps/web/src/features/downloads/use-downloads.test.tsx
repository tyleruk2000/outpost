import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { download } from "./test-support";
import { downloadsKey, useDownloadUpdates } from "./use-downloads";

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
  document.dispatchEvent(new Event("visibilitychange"));
}

afterEach(() => setVisibility("visible"));

describe("progress arriving while the page is hidden", () => {
  it("is not drawn into the list, and the list is asked for again once the page is shown", () => {
    const client = new QueryClient();
    const before = download({ id: "d1", state: "running", receivedBytes: 10 });
    client.setQueryData(downloadsKey, { downloads: [before] });
    const invalidate = vi.spyOn(client, "invalidateQueries").mockResolvedValue();
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const { result } = renderHook(() => useDownloadUpdates(), { wrapper });

    act(() => setVisibility("hidden"));
    act(() => result.current(download({ id: "d1", state: "running", receivedBytes: 20 })));
    expect(client.getQueryData<{ downloads: Array<{ receivedBytes: number }> }>(downloadsKey)?.downloads[0]?.receivedBytes).toBe(10);
    expect(invalidate).not.toHaveBeenCalled();

    act(() => setVisibility("visible"));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: downloadsKey });
    act(() => result.current(download({ id: "d1", state: "running", receivedBytes: 30 })));
    expect(client.getQueryData<{ downloads: Array<{ receivedBytes: number }> }>(downloadsKey)?.downloads[0]?.receivedBytes).toBe(30);
  });
});
