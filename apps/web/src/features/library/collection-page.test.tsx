import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  adminSession,
  collection,
  fakeServer,
  installBrowserStubs,
  location,
  memberSession,
  renderScreen,
} from "../downloads/test-support";
import CollectionPage from "./collection-page";
import CollectionsPanel from "./collections-panel";

beforeAll(installBrowserStubs);
afterEach(() => vi.unstubAllGlobals());

const locations = [
  location({ id: "loc1", name: "USB drive", path: "/mnt/usb" }),
  location({ id: "loc2", name: "NAS", isDefault: false, freeBytes: 1_000_000 }),
  location({ id: "loc3", name: "Shelf disk", isDefault: false }),
];

function serve(item = collection(), routes: Record<string, unknown> = {}) {
  return fakeServer({
    "GET /api/collections/c1": { collection: item },
    "GET /api/collections": { collections: [item] },
    "GET /api/catalog": { categories: [], entries: [], manifests: [], problems: [], lastRefreshedAt: null },
    "GET /api/jobs": { jobs: [] },
    "GET /api/auth/session": adminSession,
    "GET /api/storage/locations": { roots: ["/mnt"], locations },
    ...routes,
  });
}

const page = () =>
  renderScreen(
    <Routes>
      <Route path="/library/collections/:id" element={<CollectionPage />} />
      <Route path="/library" element={<p>The library</p>} />
    </Routes>,
    "/library/collections/c1",
  );

describe("the Collections tab", () => {
  it("groups collections by kind and links each to its screen and its reader", async () => {
    fakeServer({
      "GET /api/collections": { collections: [collection(), collection({ id: "m1", kind: "map", title: "Scotland", version: null })] },
    });
    renderScreen(<CollectionsPanel />);
    expect(await screen.findByRole("heading", { name: "Reference collections" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Maps" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Vikidia (without images)" })).toHaveAttribute("href", "/library/collections/c1");
    expect(screen.getByRole("link", { name: "Read: Vikidia (without images)" })).toHaveAttribute("href", "/library/read/c1/");
    expect(screen.getByRole("link", { name: "Open in Maps: Scotland" })).toHaveAttribute("href", "/maps");
    expect(screen.getByText("2 collections installed, 21.1 MB in all")).toBeInTheDocument();
  });

  it("shows state only when something is not simply fine", async () => {
    fakeServer({
      "GET /api/collections": { collections: [collection(), collection({ id: "c2", title: "Appropedia", locationAvailable: false })] },
    });
    renderScreen(<CollectionsPanel />);
    expect(await screen.findByText("Unavailable: “USB drive” is not connected")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Read: Appropedia" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Read: Vikidia (without images)" })).toBeInTheDocument();
  });

  it("points to Explore and Maps when nothing is installed", async () => {
    fakeServer({ "GET /api/collections": { collections: [] } });
    renderScreen(<CollectionsPanel />);
    expect(await screen.findByRole("heading", { name: "No collections installed yet" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Explore collections" })).toHaveAttribute("href", "/explore");
  });
});

describe("one collection", () => {
  it("shows its facts, including the full path and checksum", async () => {
    serve();
    page();
    expect(await screen.findByRole("heading", { level: 1, name: "Vikidia (without images)" })).toBeInTheDocument();
    expect(screen.getByText("Reference collection")).toBeInTheDocument();
    expect(await screen.findByText("/mnt/usb/collections/zim/vikidia.zim")).toBeInTheDocument();
    expect(screen.getByText("38858407a11076aa")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Read" })).toHaveAttribute("href", "/library/read/c1/");
  });

  it("says so when the collection is not in the library", async () => {
    serve(collection(), { "GET /api/collections/c1": { status: 404, error: { code: "not_found", message: "Collection not found." } } });
    page();
    expect(await screen.findByRole("heading", { name: "This collection is not in the library" })).toBeInTheDocument();
  });

  it("keeps the details but disables what needs the files while the location is disconnected", async () => {
    serve(collection({ locationAvailable: false }));
    page();
    expect(await screen.findByText("“USB drive” is not connected")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Read" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Check files" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Remove" })).toBeEnabled();
    expect(screen.getByText("38858407a11076aa")).toBeInTheDocument();
  });

  it("offers members reading only", async () => {
    serve(collection(), { "GET /api/auth/session": memberSession });
    page();
    await screen.findByRole("heading", { level: 1 });
    await waitFor(() => expect(screen.queryByRole("button", { name: "Remove" })).not.toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Check files" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Read" })).toBeInTheDocument();
  });

  it("starts a check and reports the outcome in plain words", async () => {
    const job = {
      id: "j1",
      type: "collection.verify",
      queue: "transfer",
      state: "queued",
      title: "Check Vikidia",
      subject: "collection:c1",
      progress: { current: 0, total: null, message: null },
      error: null,
      errorKind: null,
      attempts: 0,
      maxAttempts: 1,
      result: null,
      createdAt: 1,
      startedAt: null,
      finishedAt: null,
      updatedAt: 1,
    };
    const server = serve(collection(), {
      "POST /api/collections/c1/verify": { job },
      "GET /api/jobs/j1": {
        job: {
          ...job,
          state: "succeeded",
          result: { outcome: "damaged", message: "The file no longer matches the checksum recorded when it was installed." },
        },
      },
    });
    page();
    await userEvent.click(await screen.findByRole("button", { name: "Check files" }));
    expect(await screen.findByText("The file is damaged", undefined, { timeout: 4000 })).toBeInTheDocument();
    expect(screen.getByText("The file no longer matches the checksum recorded when it was installed.")).toBeInTheDocument();
    expect(server.calls).toContain("POST /api/collections/c1/verify");
  });

  it("moves only to a location that is connected, large enough and not the current one", async () => {
    const server = serve(collection(), {
      "POST /api/collections/c1/move": {
        status: 409,
        error: {
          code: "conflict",
          message: "“Shelf disk” already has a file at collections/zim/vikidia.zim. Outpost will not overwrite it.",
        },
      },
    });
    page();
    await userEvent.click(await screen.findByRole("button", { name: "Move" }));
    const dialog = await screen.findByRole("dialog", { name: "Move “Vikidia (without images)”" });
    expect(within(dialog).getByText(/removed only after the copy has been read back and found\s+identical/)).toBeInTheDocument();
    expect(await within(dialog).findByRole("radio", { name: /Shelf disk/ })).toBeChecked();
    expect(within(dialog).getByRole("radio", { name: /NAS/ })).toBeDisabled();
    expect(within(dialog).queryByRole("radio", { name: /USB drive/ })).not.toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Move collection" }));
    expect(await within(dialog).findByText(/Outpost will not overwrite it/)).toBeInTheDocument();
    expect(server.calls).toContain("POST /api/collections/c1/move");
  });
});

describe("removing a collection", () => {
  it("does nothing until the person has chosen what happens to the files", async () => {
    const server = serve(collection(), { "DELETE /api/collections/c1": { ok: true, deletedFiles: true } });
    page();
    await userEvent.click(await screen.findByRole("button", { name: "Remove" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByRole("radio", { name: /Delete the files too/ })).not.toBeChecked();
    expect(within(dialog).getByRole("radio", { name: /Only remove it from Outpost/ })).not.toBeChecked();

    await userEvent.click(within(dialog).getByRole("button", { name: "Remove collection" }));
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Choose one of the two before removing.");
    expect(server.calls.some((call) => call.startsWith("DELETE"))).toBe(false);

    await userEvent.click(within(dialog).getByRole("radio", { name: /Delete the files too/ }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Delete collection and files" }));
    await waitFor(() => expect(server.calls).toContain("DELETE /api/collections/c1?deleteFiles=true"));
    expect(await screen.findByText("The library")).toBeInTheDocument();
  });

  it("keeps the files when asked to", async () => {
    const server = serve(collection(), { "DELETE /api/collections/c1": { ok: true, deletedFiles: false } });
    page();
    await userEvent.click(await screen.findByRole("button", { name: "Remove" }));
    const dialog = await screen.findByRole("alertdialog");
    await userEvent.click(within(dialog).getByRole("radio", { name: /Only remove it from Outpost/ }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Remove from Outpost" }));
    await waitFor(() => expect(server.calls).toContain("DELETE /api/collections/c1?deleteFiles=false"));
  });

  it("can only remove the record while the location is disconnected, and says why", async () => {
    const server = serve(collection({ locationAvailable: false }), { "DELETE /api/collections/c1": { ok: true, deletedFiles: false } });
    page();
    await userEvent.click(await screen.findByRole("button", { name: "Remove" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByRole("radio", { name: /Delete the files too/ })).toBeDisabled();
    expect(within(dialog).getByText(/“USB drive” is not connected, so its files cannot be reached/)).toBeInTheDocument();
    expect(within(dialog).getByRole("radio", { name: /Only remove it from Outpost/ })).toBeChecked();
    await userEvent.click(within(dialog).getByRole("button", { name: "Remove from Outpost" }));
    await waitFor(() => expect(server.calls).toContain("DELETE /api/collections/c1?deleteFiles=false"));
  });
});
