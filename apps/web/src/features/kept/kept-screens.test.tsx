import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Link, MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type FakeCacheStorage, installFakeCaches } from "./fake-caches";
import KeptPage from "./kept-page";
import { forgetKeptSnapshot, type KeptNote, type KeptTrack, putKept, putKeptJson } from "./store";

const events = vi.hoisted(() => ({ connected: true, set: (_value: boolean) => {} }));
vi.mock("@/lib/events", async () => {
  const { useSyncExternalStore } = await import("react");
  const listeners = new Set<() => void>();
  events.set = (value: boolean) => {
    events.connected = value;
    for (const listener of listeners) listener();
  };
  return {
    useServerConnection: () =>
      useSyncExternalStore(
        (listener) => {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
        () => events.connected,
      ),
    useServerEvent: () => {},
  };
});

const note: KeptNote = {
  kind: "note",
  id: "plan",
  title: "Field plan",
  icon: null,
  pages: [
    { id: "plan", title: "Field plan", icon: null, updatedAt: 1 },
    { id: "day1", title: "Day one", icon: null, updatedAt: 1 },
  ],
  files: 2,
  skipped: 0,
  bytes: 2048,
  keptAt: 1_800_000_000_000,
  refreshedAt: 1_800_000_000_000,
};
const track: KeptTrack = {
  kind: "track",
  id: "t1",
  title: "Seathwaite round",
  color: "teal",
  distanceMeters: 5490,
  bounds: null,
  updatedAt: 1,
  bytes: 500,
  keptAt: 1_800_000_000_000,
  refreshedAt: 1_800_000_000_000,
  gone: true,
};

let storage: FakeCacheStorage;
let restore: () => void;

beforeEach(() => {
  ({ storage, restore } = installFakeCaches());
  forgetKeptSnapshot();
  events.connected = true;
});
afterEach(() => {
  restore();
  vi.unstubAllGlobals();
});

function showKeptPage(outOfReach = false) {
  return render(
    <MemoryRouter>
      <KeptPage outOfReach={outOfReach} />
    </MemoryRouter>,
  );
}

describe("the screen of what is kept", () => {
  it("says, over plain HTTP, that nothing can be kept, why, and where HTTPS is set up", async () => {
    Object.defineProperty(window, "isSecureContext", { configurable: true, value: false });
    showKeptPage();
    const notice = await screen.findByRole("status");
    expect(notice).toHaveTextContent(/Nothing can be kept on this \w+ over plain HTTP/);
    expect(notice).toHaveTextContent("opened over HTTPS, or on the computer the server runs on");
    expect(within(notice).getByRole("link", { name: "Settings → HTTPS on your network" })).toHaveAttribute("href", "/settings#https");
    // Nothing is listed and nothing is offered that could not work.
    expect(screen.queryByRole("button", { name: "Ask the browser to keep this data" })).not.toBeInTheDocument();
    // What a kept copy is, and where it sits, is still said.
    expect(screen.getByText(/anyone who can open this browser can read/)).toBeInTheDocument();
  });

  it("says what belongs here when nothing is kept, and how each kind of thing is kept", async () => {
    showKeptPage();
    expect(await screen.findByRole("heading", { name: /Nothing is kept on this \w+ yet/ })).toBeInTheDocument();
    expect(screen.getByText(/a page of notes, from its menu/)).toBeInTheDocument();
    expect(screen.getByText(/an area of the map/)).toBeInTheDocument();
  });

  it("lists what is kept with its size and the date of the copy, and marks what the server no longer has", async () => {
    await putKept(note);
    await putKept(track);
    showKeptPage();
    const page = (await screen.findByRole("link", { name: "Field plan" })).closest("li")!;
    expect(within(page).getByRole("link", { name: "Field plan" })).toHaveAttribute("href", "/notes/plan");
    expect(page).toHaveTextContent("With the 1 page inside it, 2 pictures and files");
    expect(page).toHaveTextContent(/2\.05 kB, copy from \d+ \w+ 2027/);
    const route = screen.getByRole("link", { name: "Seathwaite round" }).closest("li")!;
    expect(route).toHaveTextContent("5.49 km");
    expect(route).toHaveTextContent("No longer on the server");
    await waitFor(() => expect(document.body).toHaveTextContent("What you have kept takes 2.55 kB."));
  });

  it("says of a map area whose fetching again stopped part of the way that it is whole and partly newer, and offers to fetch it again", async () => {
    await putKept({
      kind: "area",
      id: "fells",
      title: "The fells",
      bbox: [-3.4, 54.3, -2.8, 54.7],
      maxZoom: 9,
      terrainMaxZoom: null,
      tiles: 15,
      done: 15,
      positions: 15,
      complete: true,
      sources: { hasTiles: true, hasTerrain: false, sources: {}, sprites: {} } as never,
      regionsKey: "earlier",
      stale: true,
      mixed: true,
      bytes: 700,
      keptAt: 1,
      refreshedAt: 1,
    });
    showKeptPage();
    const area = (await screen.findByRole("link", { name: "The fells" })).closest("li")!;
    expect(area).toHaveTextContent("Fetching it again stopped part of the way: the area is whole, with some tiles newer than others");
    expect(area).not.toHaveTextContent("Not finished");
    expect(within(area).getByRole("button", { name: "Fetch again" })).toBeVisible();
  });

  it("removes a kept thing from the device only after saying what will go, and removes all of it", async () => {
    const user = userEvent.setup();
    await putKept(note);
    await putKeptJson(await caches.open("outpost-kept:note:plan"), "/api/notes/plan", { note: {} });
    showKeptPage();
    await user.click(await screen.findByRole("button", { name: /Remove Field plan from this/ }));
    const dialog = screen.getByRole("alertdialog");
    expect(dialog).toHaveTextContent("Remove “Field plan” from this");
    expect(dialog).toHaveTextContent("Only the copy in this browser is removed, freeing 2.05 kB. Nothing on the server is touched");
    await user.click(within(dialog).getByRole("button", { name: /^Remove from this/ }));
    await waitFor(() => expect(screen.queryByRole("link", { name: "Field plan" })).not.toBeInTheDocument());
    expect(await storage.keys()).not.toContain("outpost-kept:note:plan");
    expect(storage.paths("outpost-kept-index")).toEqual([]);
  });

  it("reports the room the browser says there is, and what the browser answered when asked to keep the data", async () => {
    const user = userEvent.setup();
    let persisted = false;
    const persist = vi.fn(async () => {
      persisted = true;
      return true;
    });
    Object.defineProperty(navigator, "storage", {
      configurable: true,
      value: { estimate: async () => ({ usage: 5_000_000, quota: 1_000_000_000 }), persisted: async () => persisted, persist },
    });
    try {
      await putKept(note);
      showKeptPage();
      await waitFor(() =>
        expect(document.body).toHaveTextContent(
          "reports about 5.0 MB in use by Outpost, the app itself included, out of about 1.0 GB it would allow",
        ),
      );
      await user.click(screen.getByRole("button", { name: "Ask the browser to keep this data" }));
      expect(await screen.findByText(/has agreed to keep Outpost's data/)).toBeInTheDocument();
      expect(persist).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole("button", { name: "Ask the browser to keep this data" })).not.toBeInTheDocument();
    } finally {
      delete (navigator as { storage?: unknown }).storage;
    }
  });
});

describe("losing the server while the app is open", () => {
  /** The app's screens, wrapped as `app.tsx` wraps them. */
  async function showApp() {
    const { ReachGate, ReachNotice } = await import("./reach");
    return render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={["/library"]}>
          <ReachGate>
            <ReachNotice />
            <Routes>
              <Route
                path="library"
                element={
                  <>
                    <h1>The library at home</h1>
                    <Link to="/notes/plan">Open the plan</Link>
                    <Link to="/notes/other">Open another page</Link>
                  </>
                }
              />
              <Route path="notes/:id" element={<h1>The page, from the server</h1>} />
            </Routes>
          </ReachGate>
        </MemoryRouter>
      </QueryClientProvider>,
    );
  }

  function serverIs(reachable: boolean) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        if (!reachable) throw new TypeError("Failed to fetch");
        return new Response(JSON.stringify({ status: "ok" }), { headers: { "Content-Type": "application/json" } });
      }),
    );
  }

  const appIsKeptHere = () =>
    Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: { controller: { postMessage() {} } } });

  it("leaves the open screen as it is, says so, and shows kept copies from the next screen on; then goes back by itself", async () => {
    const user = userEvent.setup();
    appIsKeptHere();
    await putKept(note);
    await putKeptJson(await caches.open("outpost-kept:note:plan"), "/api/notes/plan", {
      note: {
        id: "plan",
        title: "Field plan",
        icon: null,
        content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Leave the car at Seathwaite." }] }] },
        tags: [],
        coverUrl: null,
        breadcrumbs: [],
        backlinks: [],
        children: [],
      },
    });
    serverIs(true);
    await showApp();
    expect(screen.getByRole("heading", { name: "The library at home" })).toBeInTheDocument();
    expect(screen.queryByText(/out of reach/)).not.toBeInTheDocument();

    // The live connection drops and the server does not answer a plain question either.
    serverIs(false);
    events.set(false);
    const notice = await screen.findByRole("status", {}, { timeout: 4000 });
    expect(notice).toHaveTextContent("The server is out of reach. This screen stays as it is.");
    expect(screen.getByRole("heading", { name: "The library at home" })).toBeInTheDocument();

    // Moving on: the kept page opens from the copy, for reading only.
    await user.click(screen.getByRole("link", { name: "Open the plan" }));
    expect(await screen.findByText("Leave the car at Seathwaite.", {}, { timeout: 4000 })).toBeInTheDocument();
    expect(screen.getByText(/Showing what is kept on this \w+, for reading only/)).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Page content" })).toHaveAttribute("contenteditable", "false");
    expect(screen.queryByRole("heading", { name: "The page, from the server" })).not.toBeInTheDocument();
    expect(screen.getByText(/Kept copy from/)).toBeInTheDocument();

    // The server answers again: the app's own screens come back without anything being pressed.
    serverIs(true);
    events.set(true);
    expect(await screen.findByRole("heading", { name: "The page, from the server" })).toBeInTheDocument();
    expect(screen.queryByText(/out of reach/)).not.toBeInTheDocument();
  }, 20_000);

  it("says a page that was not kept is not on this device, instead of loading or failing", async () => {
    const user = userEvent.setup();
    appIsKeptHere();
    serverIs(false);
    events.connected = false;
    await showApp();
    await screen.findByRole("status", {}, { timeout: 4000 });
    await user.click(screen.getByRole("link", { name: "Open another page" }));
    expect(await screen.findByRole("heading", { name: /This page is not kept on this/ }, { timeout: 4000 })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "See what is kept" })).toHaveAttribute("href", "/kept");
  }, 20_000);

  it("changes nothing where the app is not kept on the device: the screens stay, and the sidebar already says the server is down", async () => {
    const user = userEvent.setup();
    serverIs(false);
    events.connected = false;
    await showApp();
    await new Promise((resolve) => setTimeout(resolve, 1600));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    await user.click(screen.getByRole("link", { name: "Open the plan" }));
    expect(screen.getByRole("heading", { name: "The page, from the server" })).toBeInTheDocument();
  }, 20_000);
});
