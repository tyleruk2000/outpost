import type { DatabaseStatus } from "@outpost/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DatabaseSection } from "./database-section";
import { countWords, duration, schemaWords } from "./database-text";

const MB = 1024 * 1024;
const local = { allowed: true, reason: "local", option: "OUTPOST_ALLOW_REMOTE_ERASE" } as const;
const remote = { allowed: false, reason: "remote", option: "OUTPOST_ALLOW_REMOTE_ERASE" } as const;

const status = (change: Partial<DatabaseStatus> = {}): DatabaseStatus => ({
  file: {
    path: "/data/outpost.db",
    bytes: 306 * MB,
    walBytes: 4 * MB,
    pageSize: 4096,
    pages: 78336,
    unusedPages: 9216,
    unusedBytes: 36 * MB,
  },
  disk: { freeBytes: 27_000 * MB, totalBytes: 494_000 * MB, low: false, reserveBytes: 256 * MB },
  sqlite: { version: "3.54.1", journalMode: "wal", dbstat: true },
  schema: { applied: 15, known: 15, lastAppliedAt: 1, state: "current" },
  backup: { lastAt: Date.now() - 2 * 3600_000, kind: "scheduled", scheduled: true },
  contents: {
    workedOutAt: Date.now(),
    milliseconds: 390,
    method: "dbstat",
    counts: [
      { id: "passages", count: 68600 },
      { id: "vectors", count: 68600 },
      { id: "pages", count: 400 },
      { id: "places", count: 1 },
      { id: "documents", count: 0 },
    ],
    groups: [
      { id: "search", bytes: 124 * MB },
      { id: "meaning", bytes: 143 * MB },
      { id: "library", bytes: 0 },
      { id: "notes", bytes: 3 * MB },
      { id: "maps", bytes: 0 },
      { id: "radio", bytes: 0 },
      { id: "other", bytes: 0 },
    ],
    unusedBytes: 36 * MB,
    fileBytes: 306 * MB,
  },
  measuring: false,
  lastCheck: { kind: "quick", at: Date.now() - 60_000, milliseconds: 387, ok: true, problems: [] },
  lastVacuum: null,
  active: null,
  reclaim: { neededBytes: 796 * MB, tempNeededBytes: null, tempFreeBytes: null, enoughRoom: true, waitingFor: [], right: local },
  ...change,
});

let requests: Array<{ call: string; body?: unknown }> = [];

function serve(answer: DatabaseStatus | (() => Response | Promise<Response>), after?: DatabaseStatus) {
  requests = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "http://outpost.test");
      const method = init?.method ?? "GET";
      const json = (body: unknown, code = 200) =>
        new Response(JSON.stringify(body), { status: code, headers: { "content-type": "application/json" } });
      if (method !== "GET") {
        requests.push({ call: `${method} ${url.pathname}`, body: init?.body ? JSON.parse(String(init.body)) : undefined });
        if (after) answer = after;
        return url.pathname === "/api/database/contents" ? json(after ?? answer) : json({ job: { id: "j1" } });
      }
      if (url.pathname === "/api/database") return typeof answer === "function" ? answer() : json(answer);
      return json({}, 404);
    }),
  );
}

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <DatabaseSection />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("the words for the database", () => {
  it("names counts as the rest of the app does, leaving out what there is none of", () => {
    expect(countWords(status().contents!.counts)).toEqual([
      "68,600 passages in the search index",
      "68,600 passages read for search by meaning",
      "400 pages of notes",
      "1 saved place",
    ]);
    expect(duration(387)).toBe("0.4 seconds");
    expect(duration(3913)).toBe("3.9 seconds");
    expect(duration(185_000)).toBe("3 minutes");
    expect(schemaWords(status().schema)).toMatch(/^Up to date: all 15 changes/);
    expect(schemaWords({ ...status().schema, applied: 16, state: "ahead" })).toMatch(/a newer version made it/);
  });
});

describe("the Database section", () => {
  it("shows a skeleton while loading, then where it is, how big, what is in it and its state", async () => {
    serve(status());
    show();
    expect(document.querySelector("[aria-busy]")).not.toBeNull();
    expect(await screen.findByText("/data/outpost.db")).toBeTruthy();
    expect(screen.getByText(/in the write-ahead log beside it/)).toBeTruthy();
    expect(
      screen.getByText(
        /68,600 passages in the search index, 68,600 passages read for search by meaning, 400 pages of notes and 1 saved place\./,
      ),
    ).toBeTruthy();
    const table = screen.getByRole("table", { name: "Where the bytes of the database go" });
    expect(within(table).getByText("Search by meaning")).toBeTruthy();
    // Parts with nothing in them are left out; unused space is always shown.
    expect(within(table).queryByText("Radio")).toBeNull();
    expect(within(table).getByText("Unused")).toBeTruthy();
    expect(screen.getByText(/with SQLite's dbstat table/)).toBeTruthy();
    expect(screen.getByText(/Last backed up 2 hours ago .*on the schedule/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Backup settings" }).getAttribute("href")).toBe("/settings#backup");
    expect(screen.getByText(/No problems found by the quick check/)).toBeTruthy();
    expect(screen.queryByText(/nearly full/)).toBeNull();
  });

  it("says a fresh installation holds nothing yet, and when the contents are still being worked out", async () => {
    serve(status({ contents: null, measuring: true, lastCheck: null, backup: { lastAt: null, kind: null, scheduled: false } }));
    show();
    expect(await screen.findByText(/Working out what is in it/)).toBeTruthy();
    expect(screen.getByText(/Not checked yet/)).toBeTruthy();
    expect(screen.getByText(/Not backed up to a storage location/)).toBeTruthy();

    vi.unstubAllGlobals();
    serve(status({ contents: { ...status().contents!, counts: [{ id: "documents", count: 0 }] } }));
    show();
    expect(await screen.findByText(/Nothing has been added yet/)).toBeTruthy();
  });

  it("shows an error with a way to try again", async () => {
    serve(() => new Response(JSON.stringify({ error: { code: "internal", message: "The server fell over." } }), { status: 500 }));
    show();
    expect(await screen.findByText("This could not be loaded")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });

  it("warns when the drive is nearly full, and says why space cannot be reclaimed", async () => {
    serve(status({ disk: { ...status().disk, freeBytes: 100 * MB, low: true }, reclaim: { ...status().reclaim, enoughRoom: false } }));
    show();
    expect(await screen.findByText("This drive is nearly full")).toBeTruthy();
    expect(screen.getByText(/It needs 796 MiB free on this drive|It needs .* free on this drive, and there is/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Reclaim unused space" })).toBeNull();
  });

  it("offers reclaiming only on the computer Outpost runs on, and names what it waits for", async () => {
    serve(status({ reclaim: { ...status().reclaim, right: remote } }));
    show();
    expect(await screen.findByText(/can only be done on the computer Outpost runs on/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Reclaim unused space" })).toBeNull();

    vi.unstubAllGlobals();
    serve(status({ reclaim: { ...status().reclaim, waitingFor: ["Back up to NAS"] } }));
    show();
    expect(await screen.findByText(/once this has finished, or been paused: Back up to NAS/)).toBeTruthy();
  });

  it("says which rule made it take this device for the computer Outpost runs on", async () => {
    serve(
      status({
        reclaim: { ...status().reclaim, right: { ...local, localBy: { rule: "own-address", address: "192.168.1.232" } } },
      }),
    );
    show();
    expect(
      await screen.findByText(
        "Offered here because this is the computer Outpost runs on: you are connected from its own address 192.168.1.232.",
      ),
    ).toBeTruthy();
    vi.unstubAllGlobals();
    serve(status({ reclaim: { ...status().reclaim, right: { ...local, localBy: { rule: "loopback", address: "127.0.0.1" } } } }));
    show();
    expect(await screen.findByText(/you are connected from its loopback address 127\.0\.0\.1\./)).toBeTruthy();
  });

  it("checks the database, and reports what a check found wrong", async () => {
    const running = status({
      active: { id: "j1", type: "database.check", title: "Check the database", state: "running" } as DatabaseStatus["active"],
    });
    serve(status(), running);
    show();
    await userEvent.click(await screen.findByRole("button", { name: "Check the database" }));
    expect(requests).toEqual([{ call: "POST /api/database/check", body: { kind: "quick" } }]);
    expect(await screen.findByText("Checking every page now.")).toBeTruthy();

    vi.unstubAllGlobals();
    serve(
      status({
        lastCheck: {
          kind: "full",
          at: Date.now(),
          milliseconds: 431,
          ok: false,
          problems: ["Tree 12 page 340 cell 0: invalid page number 9999"],
        },
      }),
    );
    show();
    expect(await screen.findByText(/The full check just now found problems/)).toBeTruthy();
    expect(screen.getByText("Tree 12 page 340 cell 0: invalid page number 9999")).toBeTruthy();
  });

  it("asks before reclaiming space, saying what it costs", async () => {
    serve(status());
    show();
    await userEvent.click(await screen.findByRole("button", { name: "Reclaim unused space" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(/nobody can save anything/)).toBeTruthy();
    expect(requests).toEqual([]);
    await userEvent.click(within(dialog).getByRole("button", { name: "Reclaim space" }));
    expect(requests).toEqual([{ call: "POST /api/database/reclaim", body: {} }]);
  });
});
