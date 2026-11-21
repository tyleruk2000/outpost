/** Changes made on a phone out of reach that met a newer version on Outpost: held on the page's screen for the person to choose. */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/misc";
import { installFakeCaches } from "@/features/kept/fake-caches";
import { forgetOutboxSnapshot, keepEdit, listOutbox, OUTBOX, textDoc } from "@/features/kept/outbox";
import { NoteScreen } from "./note-screen";

vi.mock("@/lib/events", () => ({ useServerEvent: () => {}, useServerConnection: () => true }));

const SAVED_AT = Date.UTC(2026, 10, 21, 9);
const serverNote = {
  id: "plan",
  parentId: null,
  title: "Field plan",
  icon: null,
  content: textDoc("Meet at the bridge."),
  tags: [],
  isFavorite: false,
  isTemplate: false,
  coverAttachmentId: null,
  coverUrl: null,
  breadcrumbs: [],
  backlinks: [],
  children: [],
  trashedAt: null,
  lastViewedAt: null,
  encrypted: false,
  createdAt: 1,
  updatedAt: SAVED_AT,
};

let restore: () => void;
let patches: Array<Record<string, unknown>>;

beforeEach(() => {
  ({ restore } = installFakeCaches());
  forgetOutboxSnapshot();
  patches = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input), "http://localhost").pathname;
      const json = (body: unknown, status = 200) =>
        new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
      if (path === "/api/notes/plan" && init?.method === "PATCH") {
        const body = JSON.parse(String(init.body)) as Record<string, unknown>;
        patches.push(body);
        return json({ note: { id: "plan", title: body.title, icon: null, updatedAt: SAVED_AT + 1000 } });
      }
      if (path === "/api/notes/plan") return json({ note: serverNote });
      if (path === "/api/notes/tree") return json({ notes: [] });
      return json({ error: { code: "not_found", message: "Nothing here." } }, 404);
    }),
  );
});
afterEach(() => {
  restore();
  vi.unstubAllGlobals();
});

describe("a page changed on a phone and on Outpost", () => {
  it("opens with the phone's changes, unsaved, and keeps the phone's version when asked", async () => {
    const edit = await keepEdit({ noteId: "plan", title: "Field plan (from the hills)", content: textDoc("Meet at the church."), base: 1 });
    // The phone sent it and Outpost had a newer version: it is marked, not sent again.
    const cache = await caches.open(OUTBOX);
    await cache.put(
      `/__outbox/${encodeURIComponent(edit.id)}`,
      new Response(JSON.stringify({ ...edit, conflict: { updatedAt: SAVED_AT, title: "Field plan" } })),
    );
    forgetOutboxSnapshot();

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <TooltipProvider>
          <MemoryRouter>
            <NoteScreen id="plan" />
          </MemoryRouter>
        </TooltipProvider>
      </QueryClientProvider>,
    );

    expect(await screen.findByText("This page was changed somewhere else")).toBeInTheDocument();
    expect(screen.getByText(/The changes made on this \w+ while Outpost was out of reach are shown here, unsaved/)).toBeInTheDocument();
    expect(screen.getByDisplayValue("Field plan (from the hills)")).toBeInTheDocument();
    expect(screen.getByText("Meet at the church.")).toBeInTheDocument();
    expect(patches).toEqual([]);

    await userEvent.click(screen.getByRole("button", { name: "Keep my version" }));
    await waitFor(() => expect(patches).toHaveLength(1));
    expect(patches[0]).toMatchObject({ title: "Field plan (from the hills)" });
    expect(patches[0]).not.toHaveProperty("baseUpdatedAt");
    await waitFor(async () => expect(await listOutbox()).toEqual([]));
  });
});
