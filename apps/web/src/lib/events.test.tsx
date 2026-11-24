import { QueryClient, QueryClientProvider, useQueries, useQuery } from "@tanstack/react-query";
import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventsProvider, reconnectDelayMs, useServerEvent } from "./events";

class FakeEventSource {
  static all: FakeEventSource[] = [];
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;
  private readonly handlers = new Map<string, Array<(event: MessageEvent<string>) => void>>();
  readonly url: string;
  constructor(url: string) {
    this.url = url;
    FakeEventSource.all.push(this);
  }
  addEventListener(type: string, handler: (event: MessageEvent<string>) => void) {
    this.handlers.set(type, [...(this.handlers.get(type) ?? []), handler]);
  }
  close() {
    this.closed = true;
  }
  emit(type: string, data: unknown = {}) {
    for (const handler of this.handlers.get(type) ?? []) handler(new MessageEvent(type, { data: JSON.stringify(data) }));
  }
  static get open() {
    return FakeEventSource.all.filter((source) => !source.closed);
  }
}

let visibility: DocumentVisibilityState = "visible";
function setVisibility(next: DocumentVisibilityState) {
  visibility = next;
  document.dispatchEvent(new Event("visibilitychange"));
}

beforeEach(() => {
  vi.useFakeTimers();
  FakeEventSource.all = [];
  visibility = "visible";
  vi.stubGlobal("EventSource", FakeEventSource);
  vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function Notes({ fetch }: { fetch: () => Promise<string> }) {
  useQuery({ queryKey: ["notes", "list"], queryFn: fetch });
  return null;
}

/** A screen that reads `queries`; `onData` hears what the first one holds. */
function Reads({ queries, onData }: { queries: Array<[string[], () => Promise<unknown>]>; onData?: (data: unknown) => void }) {
  const results = useQueries({ queries: queries.map(([queryKey, queryFn]) => ({ queryKey, queryFn })) });
  onData?.(results[0]?.data);
  return null;
}

function mountReads(queries: Array<[string[], () => Promise<unknown>]>, onData?: (data: unknown) => void) {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <EventsProvider enabled>
        <Reads queries={queries} onData={onData} />
      </EventsProvider>
    </QueryClientProvider>,
  );
}

function Listening({ heard }: { heard: unknown[] }) {
  useServerEvent("backup.changed", (payload) => heard.push(payload.id));
  return null;
}

function mount(fetch = vi.fn(async () => "notes")) {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <EventsProvider enabled>
        <Notes fetch={fetch} />
      </EventsProvider>
    </QueryClientProvider>,
  );
  return { fetch };
}

describe("live events", () => {
  it("opens one stream per tab", () => {
    mount();
    expect(FakeEventSource.open).toHaveLength(1);
  });

  it("waits longer each time the server does not answer, and tries at once when the tab is shown", async () => {
    mount();
    expect(reconnectDelayMs(1)).toBe(1000);
    expect(reconnectDelayMs(3)).toBe(4000);
    expect(reconnectDelayMs(20)).toBe(60_000);
    act(() => FakeEventSource.all[0]!.onerror!());
    expect(FakeEventSource.open).toHaveLength(0);
    await act(() => vi.advanceTimersByTimeAsync(999));
    expect(FakeEventSource.all).toHaveLength(1);
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(FakeEventSource.all).toHaveLength(2);
    act(() => FakeEventSource.all[1]!.onerror!());
    await act(() => vi.advanceTimersByTimeAsync(1999));
    expect(FakeEventSource.all).toHaveLength(2);
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(FakeEventSource.all).toHaveLength(3);
  });

  it("fetches nothing for a hidden tab, and what changed once it is shown", async () => {
    const { fetch } = mount();
    await act(() => vi.advanceTimersByTimeAsync(10));
    expect(fetch).toHaveBeenCalledTimes(1);
    act(() => FakeEventSource.all[0]!.emit("notes.changed"));
    act(() => setVisibility("hidden"));
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(fetch).toHaveBeenCalledTimes(1);
    act(() => setVisibility("visible"));
    await act(() => vi.advanceTimersByTimeAsync(10));
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("lets go of the stream the moment the tab is hidden, and opens it again when shown", async () => {
    // Six tabs each holding a stream took all six connections Safari gives an address over HTTP/1.1.
    const { fetch } = mount();
    await act(() => vi.advanceTimersByTimeAsync(10));
    act(() => setVisibility("hidden"));
    expect(FakeEventSource.open).toHaveLength(0);
    await act(() => vi.advanceTimersByTimeAsync(120_000));
    expect(FakeEventSource.all).toHaveLength(1);
    act(() => setVisibility("visible"));
    expect(FakeEventSource.open).toHaveLength(1);
    // Events may have been missed while it was closed: the screen's data is fetched again once.
    act(() => FakeEventSource.open[0]!.onopen!());
    await act(() => vi.advanceTimersByTimeAsync(10));
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("lets go when the page is put away, and opens again when it comes back from the page cache", () => {
    mount();
    act(() => {
      window.dispatchEvent(new Event("pagehide"));
    });
    expect(FakeEventSource.open).toHaveLength(0);
    act(() => {
      window.dispatchEvent(new Event("pageshow"));
    });
    expect(FakeEventSource.open).toHaveLength(1);
  });

  it("does not open a stream for a tab opened behind another until it is shown", () => {
    visibility = "hidden";
    mount();
    expect(FakeEventSource.all).toHaveLength(0);
    act(() => setVisibility("visible"));
    expect(FakeEventSource.open).toHaveLength(1);
  });

  it("drops a wait to try again once the tab is hidden", async () => {
    mount();
    act(() => FakeEventSource.all[0]!.onerror!());
    act(() => setVisibility("hidden"));
    await act(() => vi.advanceTimersByTimeAsync(5000));
    expect(FakeEventSource.all).toHaveLength(1);
  });

  it("fetches everything again, from nothing, when the current household changes, and only household lists otherwise", async () => {
    const supplies = vi.fn(async () => "supplies");
    const weather = vi.fn(async () => "weather");
    mountReads([
      [["weather", "home"], weather],
      [["supplies"], supplies],
    ]);
    await act(() => vi.advanceTimersByTimeAsync(10));
    act(() => FakeEventSource.all[0]!.emit("households.changed", { data: {} }));
    await act(() => vi.advanceTimersByTimeAsync(600));
    expect(supplies).toHaveBeenCalledTimes(2);
    expect(weather).toHaveBeenCalledTimes(1);
    act(() => FakeEventSource.all[0]!.emit("households.changed", { data: { currentChanged: true } }));
    await act(() => vi.advanceTimersByTimeAsync(10));
    expect(weather).toHaveBeenCalledTimes(2);
    expect(supplies).toHaveBeenCalledTimes(3);
  });

  it("fetches the lists that depend on a drive only when a drive came or went, not when free space moved", async () => {
    let status = "available";
    let free = 100;
    const locations = vi.fn(async () => ({ roots: [], locations: [{ id: "a", status, path: "/a", freeBytes: free }] }));
    const collections = vi.fn(async () => "collections");
    mountReads([
      [["storage", "locations"], locations],
      [["collections"], collections],
    ]);
    await act(() => vi.advanceTimersByTimeAsync(10));
    free = 90;
    act(() => FakeEventSource.all[0]!.emit("storage.changed"));
    await act(() => vi.advanceTimersByTimeAsync(600));
    expect(locations).toHaveBeenCalledTimes(2);
    expect(collections).toHaveBeenCalledTimes(1);
    status = "unavailable";
    act(() => FakeEventSource.all[0]!.emit("storage.changed"));
    await act(() => vi.advanceTimersByTimeAsync(1200));
    expect(locations).toHaveBeenCalledTimes(3);
    expect(collections).toHaveBeenCalledTimes(2);
  });

  it("patches a running job's progress into the active list without fetching it, and fetches when its state changes", async () => {
    const job = (state: string, current: number) => ({ id: "j", state, progress: { current } });
    let served = [job("running", 1)];
    const active = vi.fn(async () => ({ jobs: served }));
    let seen: unknown;
    mountReads([[["jobs", "active"], active]], (data) => {
      seen = data;
    });
    await act(() => vi.advanceTimersByTimeAsync(10));
    act(() => FakeEventSource.all[0]!.emit("job.updated", { id: "j", data: job("running", 2) }));
    await act(() => vi.advanceTimersByTimeAsync(600));
    act(() => FakeEventSource.all[0]!.emit("job.updated", { id: "j", data: job("running", 3) }));
    await act(() => vi.advanceTimersByTimeAsync(600));
    expect(active).toHaveBeenCalledTimes(1);
    expect(seen).toEqual({ jobs: [job("running", 3)] });
    served = [];
    act(() => FakeEventSource.all[0]!.emit("job.updated", { id: "j", data: job("succeeded", 3) }));
    await act(() => vi.advanceTimersByTimeAsync(600));
    expect(active).toHaveBeenCalledTimes(2);
  });

  it("holds what a screen's own listener would hear while the tab is hidden, and hands it over when shown", async () => {
    const heard: unknown[] = [];
    render(
      <QueryClientProvider client={new QueryClient()}>
        <EventsProvider enabled>
          <Listening heard={heard} />
        </EventsProvider>
      </QueryClientProvider>,
    );
    act(() => setVisibility("hidden"));
    act(() => FakeEventSource.all[0]!.emit("backup.changed", { id: "a" }));
    act(() => FakeEventSource.all[0]!.emit("backup.changed", { id: "b" }));
    expect(heard).toEqual([]);
    act(() => setVisibility("visible"));
    expect(heard).toEqual(["a", "b"]);
    act(() => FakeEventSource.all[0]!.emit("backup.changed", { id: "c" }));
    expect(heard).toEqual(["a", "b", "c"]);
  });
});
