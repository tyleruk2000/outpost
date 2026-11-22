/** Settings, Receivers: the form that replaces the Add and Change buttons takes focus, and gives it back. */
import type { HeardReceiversResponse } from "@outpost/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReceiversSettingsSection } from "./receivers-section";

const now = Date.now();
const answer = (withOne: boolean): HeardReceiversResponse => ({
  receivers: withOne
    ? [
        {
          id: "r1",
          kind: "aprs",
          name: "Radio at home",
          host: "192.168.1.20",
          port: 8001,
          transport: "tcp",
          enabled: true,
          createdAt: now,
          status: {
            state: "connected",
            since: now,
            lastPacketAt: now,
            packets: 1,
            positions: 1,
            malformed: 0,
            refused: 0,
            lastError: null,
            retryAt: null,
          },
        },
      ]
    : [],
  right: { allowed: true, reason: "local", option: "OUTPOST_ALLOW_REMOTE_SETTINGS", inContainer: false },
  space: {
    stations: 0,
    reports: 0,
    bytes: 0,
    bySource: {
      aprs: { stations: 0, reports: 0 },
      adsb: { stations: 0, reports: 0 },
      ais: { stations: 0, reports: 0 },
      mesh: { stations: 0, reports: 0 },
    },
  },
  aircraftHours: 0,
  pi: null,
});

afterEach(() => vi.unstubAllGlobals());

function show(withOne: boolean) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(answer(withOne)), { status: 200, headers: { "content-type": "application/json" } })),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ReceiversSettingsSection />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("adding and changing a receiver, by keyboard", () => {
  it("puts focus in the new form, and back on its Add button when the form is put away", async () => {
    const user = userEvent.setup();
    show(false);
    await user.click(await screen.findByRole("button", { name: "Add a ship receiver" }));
    expect(screen.getByRole("textbox", { name: "Name" })).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("button", { name: "Add a ship receiver" })).toHaveFocus();
  });

  it("puts focus in the form that replaces a receiver's line, and back on Change, inside the list", async () => {
    const user = userEvent.setup();
    show(true);
    await user.click(await screen.findByRole("button", { name: "Change Radio at home" }));
    const name = screen.getByRole("textbox", { name: "Name" });
    expect(name).toHaveFocus();
    expect(name.closest("li")?.closest("ul")).toHaveAttribute("aria-label", "Receivers");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("button", { name: "Change Radio at home" })).toHaveFocus();
  });
});
