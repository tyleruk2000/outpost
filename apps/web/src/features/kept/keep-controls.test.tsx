/**
 * Every "Keep" action at a plain http address (http://192.168.x.x:8080 from a phone), where
 * the browser has no Cache Storage and no service worker: each says what is needed and
 * where to set it up, and none of them reaches for what is not there.
 */
import type { TrackDto } from "@outpost/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const toasts = vi.hoisted(() => ({ said: [] as Array<{ text: string; action?: { label: string; onClick: () => void } }> }));
vi.mock("sonner", () => {
  const toast = (text: string, options?: { action?: { label: string; onClick: () => void } }) => {
    toasts.said.push({ text, action: options?.action });
  };
  return { toast: Object.assign(toast, { success: toast, error: toast, loading: toast }) };
});

import { KEEPING_NEEDS_HTTPS, KeepAreaSection, KeepPlacesRow, KeepTrackButton } from "./keep-controls";

const track = { id: "t1", name: "Seathwaite round" } as TrackDto;

beforeEach(() => {
  toasts.said = [];
  // A page at a plain http address on a home network: not a secure page, so no caches and no service worker.
  Object.defineProperty(window, "isSecureContext", { configurable: true, value: false });
  vi.stubGlobal("caches", undefined);
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.reject(new Error("nothing should be asked of the server"))),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  Object.defineProperty(window, "isSecureContext", { configurable: true, value: true });
});

function show(children: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/maps"]}>
        <Routes>
          <Route path="/maps" element={children} />
          <Route path="/settings" element={<h1>Settings</h1>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("keeping, at a plain http address", () => {
  it("says on a route and on saved places that it needs an HTTPS address, and opens the setting that gives one", async () => {
    const user = userEvent.setup();
    show(
      <>
        <KeepTrackButton track={track} />
        <KeepPlacesRow count={3} />
      </>,
    );
    const buttons = screen.getAllByRole("button", { name: /^Keep on this / });
    expect(buttons).toHaveLength(2);
    for (const button of buttons) await user.click(button);
    expect(toasts.said.map((said) => said.text)).toEqual([KEEPING_NEEDS_HTTPS, KEEPING_NEEDS_HTTPS]);
    expect(KEEPING_NEEDS_HTTPS).toMatch(/needs Outpost opened at an HTTPS address.+Settings, “HTTPS on your network”/);
    expect(toasts.said[0]!.action?.label).toBe("Open Settings");
    toasts.said[0]!.action!.onClick();
    expect(await screen.findByRole("heading", { name: "Settings" })).toBeInTheDocument();
  });

  it("says beside the map that an area cannot be kept here, and links to the setting", () => {
    show(<KeepAreaSection engine={null} />);
    const notice = screen.getByText(/Keeping a map area on this \w+ needs Outpost opened at an HTTPS address/);
    expect(notice).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Settings, HTTPS on your network" })).toHaveAttribute("href", "/settings#https");
    expect(screen.queryByRole("button", { name: "Measure the area in view" })).not.toBeInTheDocument();
  });
});
