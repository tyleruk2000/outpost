import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PageVersionsSection } from "../storage/page-versions-section";
import { NoteVersionsScreen } from "./note-versions";

const doc = (words: string) => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: words }] }] });
const HOUR = 3_600_000;
const now = Date.now();

const note = {
  id: "n1",
  title: "Diary",
  icon: null,
  parentId: null,
  content: doc("what it says now"),
  encrypted: false,
  tags: [],
  isFavorite: false,
  isTemplate: false,
  position: 1,
  coverAttachmentId: null,
  coverUrl: null,
  breadcrumbs: [],
  backlinks: [],
  children: [],
  trashedAt: null,
  createdAt: now - 48 * HOUR,
  updatedAt: now - 60_000,
  lastViewedAt: null,
};
const versions = [
  { id: "v2", title: "Diary", savedAt: now - 2 * HOUR, encrypted: false, sizeBytes: 900 },
  { id: "v1", title: "Diary", savedAt: now - 30 * HOUR, encrypted: true, sizeBytes: 2100 },
];

let requests: Array<{ call: string; body?: unknown }> = [];

function serve(list = versions) {
  requests = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "http://outpost.test");
      const method = init?.method ?? "GET";
      const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
      requests.push({ call: `${method} ${url.pathname}`, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      if (method === "POST") return json({ note });
      if (method === "DELETE") return json({ cleared: 2 });
      if (url.pathname === "/api/notes/n1") return json({ note });
      if (url.pathname === "/api/notes/n1/versions") return json({ versions: list });
      if (url.pathname === "/api/notes/n1/versions/v2") return json({ version: { ...versions[0], content: doc("what it said then") } });
      if (url.pathname === "/api/notes/n1/versions/v1") return json({ version: { ...versions[1], content: doc("-----BEGIN PGP") } });
      if (url.pathname === "/api/notes/versions/space") return json({ versions: 2, pages: 1, bytes: 3000 });
      return new Response("{}", { status: 404 });
    }),
  );
}

function show(element: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/notes/n1/versions"]}>
        <Routes>
          <Route path="/notes/:id/versions" element={element} />
          <Route path="/notes/:id" element={<p>The page</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("earlier versions of a page", () => {
  it("lists versions, shows the newest beside the page as it is now, and restores it", async () => {
    serve();
    show(<NoteVersionsScreen id="n1" />);
    expect(await screen.findByText("what it said then")).toBeInTheDocument();
    expect(screen.getByText("what it says now")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { current: true })).toHaveLength(1);

    await userEvent.click(screen.getByRole("button", { name: "Restore this version" }));
    expect(await screen.findByText("The page")).toBeInTheDocument();
    expect(requests).toContainEqual({ call: "POST /api/notes/n1/versions/v2/restore", body: { baseUpdatedAt: note.updatedAt } });
  });

  it("says plainly that an encrypted version cannot be read here", async () => {
    serve();
    show(<NoteVersionsScreen id="n1" />);
    await screen.findByText("what it said then");
    await userEvent.click(screen.getByRole("button", { name: /encrypted/ }));
    expect(await screen.findByText("This version is encrypted")).toBeInTheDocument();
    expect(screen.queryByText("-----BEGIN PGP")).not.toBeInTheDocument();
  });

  it("invites editing when there are none", async () => {
    serve([]);
    show(<NoteVersionsScreen id="n1" />);
    expect(await screen.findByText("No earlier versions yet")).toBeInTheDocument();
  });
});

describe("earlier versions on the Storage screen", () => {
  it("states the room they take and clears them after asking", async () => {
    serve();
    show(<PageVersionsSection />);
    expect(await screen.findByText("2 versions of 1 page, 3.00 kB.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Clear earlier versions" }));
    const confirm = await screen.findAllByRole("button", { name: "Clear earlier versions" });
    await userEvent.click(confirm.at(-1)!);
    expect(requests.map((entry) => entry.call)).toContain("DELETE /api/notes/versions");
  });
});
