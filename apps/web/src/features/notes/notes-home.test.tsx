import type { NoteTreeItem } from "@outpost/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NotesHome } from "./notes-home";

function serve(notes: NoteTreeItem[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), "http://outpost.test");
      const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
      if (url.pathname === "/api/notes/tree") return json({ notes });
      if (url.pathname === "/api/notes/recent") return json({ notes: [] });
      if (url.pathname === "/api/notes/templates") return json({ templates: [] });
      return new Response("{}", { status: 404, headers: { "content-type": "application/json" } });
    }),
  );
}

function renderHome() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/notes"]}>
        <NotesHome />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("Notes with no pages yet", () => {
  it("offers a new page once, beside importing, rather than twice", async () => {
    serve([]);
    renderHome();
    expect(await screen.findByRole("heading", { name: "No pages yet" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "New page" })).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Import pages" })).toHaveAttribute("href", "/import");
  });

  it("keeps New page at the head of the screen once there are pages", async () => {
    serve([
      { id: "p1", title: "Packing list", icon: null, parentId: null, position: 1, isFavorite: false, childCount: 0, updatedAt: Date.now() },
    ]);
    renderHome();
    expect(await screen.findByRole("button", { name: "New page" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "No pages yet" })).not.toBeInTheDocument();
  });
});
