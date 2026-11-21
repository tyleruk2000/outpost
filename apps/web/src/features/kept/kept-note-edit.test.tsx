/** Changing a kept page while the server is out of reach: kept on the phone as typed, shown again when the page is opened. */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TooltipProvider } from "@/components/ui/misc";
import { installFakeCaches } from "./fake-caches";
import KeptNoteScreen from "./kept-note-screen";
import { editFor, forgetOutboxSnapshot } from "./outbox";
import { forgetKeptSnapshot, type KeptNote, putKept, putKeptJson } from "./store";

const kept: KeptNote = {
  kind: "note",
  id: "plan",
  title: "Field plan",
  icon: null,
  pages: [{ id: "plan", title: "Field plan", icon: null, updatedAt: 1 }],
  files: 1,
  skipped: 0,
  bytes: 1024,
  keptAt: 1_800_000_000_000,
  refreshedAt: 1_800_000_000_000,
};

const page = (encrypted = false) => ({
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
    encrypted,
    updatedAt: 1_799_000_000_000,
  },
});

let restore: () => void;
beforeEach(() => {
  ({ restore } = installFakeCaches());
  forgetKeptSnapshot();
  forgetOutboxSnapshot();
});
afterEach(() => restore());

async function open(encrypted = false) {
  await putKept(kept);
  await putKeptJson(await caches.open("outpost-kept:note:plan"), "/api/notes/plan", page(encrypted));
  return render(
    <TooltipProvider>
      <MemoryRouter initialEntries={["/notes/plan"]}>
        <Routes>
          <Route path="/notes/:id" element={<KeptNoteScreen />} />
        </Routes>
      </MemoryRouter>
    </TooltipProvider>,
  );
}

describe("a kept page out of reach", () => {
  it("is read until Edit is pressed; then its changes are kept on the phone, on top of the kept copy", async () => {
    const user = userEvent.setup();
    const view = await open();
    expect(await screen.findByText("Leave the car at Seathwaite.")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Page content" })).toHaveAttribute("contenteditable", "false");

    await user.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByText(/kept on this \w+ as you type/)).toBeInTheDocument();
    const title = screen.getByRole("textbox", { name: /title/i });
    await user.type(title, " (changed)");
    await user.click(screen.getByRole("button", { name: "Done" }));
    await waitFor(async () => expect((await editFor("plan"))?.title).toBe("Field plan (changed)"));
    const edit = await editFor("plan");
    expect(edit).toMatchObject({ kind: "edit", noteId: "plan", base: 1_799_000_000_000 });
    expect(JSON.stringify(edit?.content)).toContain("Leave the car at Seathwaite.");

    // Opened again later: the phone's version, said to be waiting.
    view.unmount();
    await open();
    expect(await screen.findByDisplayValue("Field plan (changed)")).toBeInTheDocument();
    expect(screen.getByText(/Changed on this \w+ .*sent when Outpost is back in reach/)).toBeInTheDocument();
  });

  it("is not offered for changing when it is encrypted", async () => {
    await open(true);
    expect(await screen.findByText(/Kept copy from/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
  });
});
