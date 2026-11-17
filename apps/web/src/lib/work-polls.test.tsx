/**
 * Screens that follow work under way on the server (measuring the database, counting for
 * Manage, a merge, writing a portable drive, HTTPS starting): each is told by a live event
 * when the work moves or ends, so it asks on a timer only while the event stream is down,
 * and never while the page is hidden. And screens that listen for events themselves fetch
 * only what an event can change, once, however many arrived while the page was hidden.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useLeftovers, useUsage } from "@/features/manage/manage-data";
import { useMerge } from "@/features/merge/merge-data";
import { NoteScreen } from "@/features/notes/note-screen";
import { AutomaticBackups } from "@/features/settings/automatic-backups";
import { useHttpsStatus } from "@/features/settings/https-section";
import { useDatabase } from "@/features/storage/database-section";
import { usePortableJob } from "@/features/storage/portable-drive";
import { EventsProvider } from "./events";

class FakeEventSource {
  static all: FakeEventSource[] = [];
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  private readonly handlers = new Map<string, Array<(event: MessageEvent<string>) => void>>();
  constructor() {
    FakeEventSource.all.push(this);
  }
  addEventListener(type: string, handler: (event: MessageEvent<string>) => void) {
    this.handlers.set(type, [...(this.handlers.get(type) ?? []), handler]);
  }
  close() {}
  emit(type: string, data: unknown = {}) {
    for (const handler of this.handlers.get(type) ?? []) handler(new MessageEvent(type, { data: JSON.stringify(data) }));
  }
  static get last() {
    return FakeEventSource.all.at(-1)!;
  }
}

let visibility: DocumentVisibilityState = "visible";
function setVisibility(next: DocumentVisibilityState) {
  visibility = next;
  act(() => void document.dispatchEvent(new Event("visibilitychange")));
}

const asked: string[] = [];
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const running = { id: "j1", type: "portable.build", state: "running", title: "Write", subject: null, progress: { current: 1, total: 10 } };
const answers: Record<string, unknown> = {
  "/api/database": { measuring: true, active: null, contents: null },
  "/api/manage/usage": { rows: [], locations: [], measuredAt: null, measuring: true },
  "/api/manage/leftovers": { measuring: true },
  "/api/merge/m1": { merge: { id: "m1", state: "analysing", job: null } },
  "/api/jobs/j1": { job: running },
  "/api/https": { enabled: true, listening: false, problem: null },
};

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  FakeEventSource.all = [];
  visibility = "visible";
  asked.length = 0;
  vi.stubGlobal("EventSource", FakeEventSource);
  vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const { pathname } = new URL(String(input), "http://outpost.test");
      asked.push(pathname);
      if (pathname in answers) return json(answers[pathname]);
      return json({ error: { code: "not_found", message: "No such page." } }, 404);
    }),
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000 } } });
  return (
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <EventsProvider enabled>{children}</EventsProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

const count = (pathname: string) => asked.filter((each) => each === pathname).length;

const polls: Array<[string, string, () => unknown]> = [
  ["the database being measured", "/api/database", () => useDatabase()],
  ["Manage counting what is on disk", "/api/manage/usage", () => useUsage()],
  ["Manage counting leftovers", "/api/manage/leftovers", () => useLeftovers()],
  ["a merge being worked out", "/api/merge/m1", () => useMerge("m1")],
  ["a portable drive being written", "/api/jobs/j1", () => usePortableJob("j1")],
  ["HTTPS starting", "/api/https", () => useHttpsStatus(true)],
];

describe.each(polls)("%s", (_, pathname, hook) => {
  it("is not asked for on a timer while the live events are arriving", async () => {
    renderHook(hook, { wrapper });
    act(() => FakeEventSource.last.onopen?.());
    await waitFor(() => expect(count(pathname)).toBe(1));
    await act(() => vi.advanceTimersByTimeAsync(10_000));
    expect(count(pathname)).toBe(1);
  });

  it("is asked for every few seconds while the event stream is down, and not at all while the page is hidden", async () => {
    renderHook(hook, { wrapper });
    act(() => FakeEventSource.last.onerror?.());
    await waitFor(() => expect(count(pathname)).toBe(1));
    await act(() => vi.advanceTimersByTimeAsync(10_000));
    expect(count(pathname)).toBeGreaterThan(1);
    setVisibility("hidden");
    const hidden = count(pathname);
    await act(() => vi.advanceTimersByTimeAsync(20_000));
    expect(count(pathname)).toBe(hidden);
  });
});

it("moves a portable drive's bar from the job's own events, without asking", async () => {
  const { result } = renderHook(() => usePortableJob("j1"), { wrapper });
  act(() => FakeEventSource.last.onopen?.());
  await waitFor(() => expect(result.current.data?.progress.current).toBe(1));
  act(() => FakeEventSource.last.emit("job.updated", { id: "j1", data: { ...running, progress: { current: 6, total: 10 } } }));
  await waitFor(() => expect(result.current.data?.progress.current).toBe(6));
  expect(count("/api/jobs/j1")).toBe(1);
});

it("automatic backups fetch only what a location coming or going changes", async () => {
  answers["/api/storage/locations"] = { roots: [], locations: [] };
  answers["/api/backup/schedule"] = {
    settings: { locationId: null, frequency: "daily", time: "03:00", weekday: 0, keep: 7 },
    folder: "outpost-backups",
    location: null,
    lastBackupAt: null,
    nextRunAt: null,
    waiting: null,
    lastFailure: null,
    active: null,
    right: { allowed: true, reason: "local", option: "OUTPOST_ALLOW_REMOTE_ERASE" },
  };
  answers["/api/backup/status"] = {};
  answers["/api/backup/stored"] = { backups: [], location: null };
  render(<AutomaticBackups />, { wrapper });
  act(() => FakeEventSource.last.onopen?.());
  await waitFor(() => expect(count("/api/backup/status")).toBe(1));
  await waitFor(() => expect(count("/api/backup/schedule")).toBe(1));
  act(() => FakeEventSource.last.emit("storage.changed"));
  await act(() => vi.advanceTimersByTimeAsync(1_000));
  expect(count("/api/backup/schedule")).toBe(2);
  expect(count("/api/backup/status")).toBe(1);
});

it("a page of notes is fetched once when shown, however many changes were heard while it was hidden", async () => {
  render(<NoteScreen id="n1" />, { wrapper });
  act(() => FakeEventSource.last.onopen?.());
  await waitFor(() => expect(count("/api/notes/n1")).toBe(1));
  setVisibility("hidden");
  for (let n = 0; n < 4; n += 1) act(() => FakeEventSource.last.emit("notes.changed", { id: `other-${n}` }));
  await act(() => vi.advanceTimersByTimeAsync(2_000));
  expect(count("/api/notes/n1")).toBe(1);
  setVisibility("visible");
  await act(() => vi.advanceTimersByTimeAsync(2_000));
  expect(count("/api/notes/n1")).toBe(2);
});
