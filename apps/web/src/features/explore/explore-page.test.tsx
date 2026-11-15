import type { CatalogResponse } from "@outpost/shared";
import { CATALOG_CATEGORIES } from "@outpost/shared";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { download, entry, fakeServer, installBrowserStubs, location, renderScreen } from "../downloads/test-support";
import ExplorePage from "./explore-page";

beforeAll(installBrowserStubs);
afterEach(() => vi.unstubAllGlobals());

const entries = [
  entry(),
  entry({
    id: "nhs",
    name: "NHS Medicines A to Z",
    description: "How each medicine works.",
    category: "medicine",
    publisher: "NHS",
    tags: ["medicine"],
    status: "installed",
    collectionId: "c1",
  }),
  entry({
    id: "wp",
    name: "Wikipedia (complete, with images)",
    description: "All of the English Wikipedia.",
    category: "encyclopedias",
    tags: [],
    sizeBytes: 127_000_000_000,
    sizeIsEstimate: false,
  }),
];

function catalog(over: Partial<CatalogResponse> = {}): CatalogResponse {
  return {
    categories: CATALOG_CATEGORIES.map((item) => ({ ...item, count: entries.filter((one) => one.category === item.slug).length })),
    entries,
    packs: [],
    manifests: [{ id: "kiwix-essentials", name: "Kiwix essentials" }],
    problems: [],
    lastRefreshedAt: null,
    ...over,
  };
}

function serve(routes: Record<string, unknown> = {}) {
  return fakeServer({
    "GET /api/catalog": catalog(),
    "GET /api/downloads": { downloads: [] },
    "GET /api/storage/locations": {
      roots: ["/srv"],
      locations: [
        location(),
        location({ id: "loc2", name: "USB drive", isDefault: false, freeBytes: 2_000_000_000 }),
        location({ id: "loc3", name: "NAS", isDefault: false, status: "unavailable", freeBytes: null }),
      ],
    },
    ...routes,
  });
}

const categoryButton = (name: RegExp) => within(screen.getByRole("navigation", { name: "Categories" })).getByRole("button", { name });

describe("Explore", () => {
  it("lists every entry under its category, with counts beside the categories", async () => {
    serve();
    renderScreen(<ExplorePage />, "/explore");
    expect(await screen.findByRole("heading", { name: "Knots by Wikipedia" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Medicine and first aid" })).toBeInTheDocument();
    expect(categoryButton(/^All collections/)).toHaveTextContent("3");
    expect(categoryButton(/^Survival and wilderness skills/)).toHaveTextContent("1");
    expect(screen.getByText("Sizes are estimates until the catalogue is refreshed")).toBeInTheDocument();
  });

  it("filters as the person types and can clear the filter again", async () => {
    serve();
    renderScreen(<ExplorePage />, "/explore");
    await screen.findByRole("heading", { name: "Knots by Wikipedia" });
    await userEvent.type(screen.getByRole("searchbox", { name: "Filter collections" }), "medicine");
    expect(screen.queryByRole("heading", { name: "Knots by Wikipedia" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "NHS Medicines A to Z" })).toBeInTheDocument();
    expect(categoryButton(/^All collections/)).toHaveTextContent("1");

    await userEvent.type(screen.getByRole("searchbox", { name: "Filter collections" }), " zzz");
    expect(screen.getByRole("heading", { name: "Nothing matches" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(screen.getByRole("heading", { name: "Knots by Wikipedia" })).toBeInTheDocument();
  });

  it("explains that maps are downloaded by region and links to Maps", async () => {
    serve();
    renderScreen(<ExplorePage />, "/explore?category=maps");
    expect(await screen.findByRole("heading", { name: "Maps are downloaded by region" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Maps" })).toHaveAttribute("href", "/maps");
  });

  it("opens the category of a linked entry and marks it", async () => {
    serve();
    renderScreen(<ExplorePage />, "/explore?entry=nhs");
    const heading = await screen.findByRole("heading", { name: "NHS Medicines A to Z" });
    expect(heading.closest("li")).toHaveAttribute("aria-current", "true");
    expect(categoryButton(/^Medicine and first aid/)).toHaveAttribute("aria-current", "true");
    expect(screen.queryByRole("heading", { name: "Knots by Wikipedia" })).not.toBeInTheDocument();
  });

  it("says the list still works when a refresh fails for lack of a connection", async () => {
    serve({
      "POST /api/catalog/refresh": {
        status: 503,
        error: {
          code: "offline",
          message: "The catalogue could not be refreshed because there is no connection. Showing the last known details.",
        },
      },
    });
    renderScreen(<ExplorePage />, "/explore");
    await userEvent.click(await screen.findByRole("button", { name: "Refresh catalogue" }));
    expect(await screen.findByText("The catalogue was not refreshed: there is no connection")).toBeInTheDocument();
    expect(screen.getByText(/still works from the last known details/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Knots by Wikipedia" })).toBeInTheDocument();
  });

  it("adds a sheet that ships with Outpost with one press, with no dialog and no download", async () => {
    const sheet = entry({
      id: "outpost.radio.uk-amateur-bands",
      name: "Amateur radio bands in the United Kingdom",
      description: "Every band in the Ofcom licence.",
      category: "radio",
      publisher: "Outpost",
      format: "markdown",
      license: "MIT",
      tags: ["ham radio"],
      source: { type: "bundled", file: "radio/uk-amateur-bands.md", version: "2026-11-15" },
      sizeBytes: 13_539,
      sizeIsEstimate: false,
      version: "2026-11-15",
      availability: "available",
    });
    let added = false;
    const server = serve({
      "GET /api/catalog": () =>
        catalog({ entries: [...entries, added ? { ...sheet, status: "installed", collectionId: "c4", documentId: "d7" } : sheet] }),
      "POST /api/catalog/entries/outpost.radio.uk-amateur-bands/add": () => {
        added = true;
        return { collectionId: "c4", documentId: "d7", replacedCollectionId: null };
      },
    });
    renderScreen(<ExplorePage />, "/explore");
    await screen.findByRole("heading", { name: "Amateur radio bands in the United Kingdom" });
    expect(screen.getByText("Included with Outpost")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Add Amateur radio bands in the United Kingdom to the library" }));
    expect(await screen.findByRole("link", { name: "Open Amateur radio bands in the United Kingdom" })).toHaveAttribute(
      "href",
      "/library/documents/d7",
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(server.calls).toContain("POST /api/catalog/entries/outpost.radio.uk-amateur-bands/add");
    expect(server.calls.some((call) => call.startsWith("POST") && call.endsWith("/download"))).toBe(false);
  });

  it("can show only what is included with Outpost", async () => {
    serve({
      "GET /api/catalog": catalog({
        entries: [
          ...entries,
          entry({
            id: "outpost.radio.operating-reference",
            name: "Radio operating reference",
            category: "radio",
            publisher: "Outpost",
            format: "markdown",
            source: { type: "bundled", file: "radio/operating-reference.md", version: "2026-11-15" },
            sizeIsEstimate: false,
          }),
        ],
      }),
    });
    renderScreen(<ExplorePage />, "/explore");
    await screen.findByRole("heading", { name: "Knots by Wikipedia" });
    await userEvent.click(screen.getByRole("radio", { name: "Included" }));
    expect(screen.getByRole("heading", { name: "Radio operating reference" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Knots by Wikipedia" })).not.toBeInTheDocument();
    expect(categoryButton(/^All collections/)).toHaveTextContent("1");
  });

  it("offers Refresh and Download to everyone: there are no accounts", async () => {
    const server = serve();
    renderScreen(<ExplorePage />, "/explore");
    await screen.findByRole("heading", { name: "Knots by Wikipedia" });
    expect(screen.getByRole("button", { name: "Refresh catalogue" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download Knots by Wikipedia" })).toBeInTheDocument();
    expect(screen.queryByText(/administrator/i)).not.toBeInTheDocument();
    expect(server.calls.some((call) => call.includes("/api/auth/"))).toBe(false);
  });

  it("lists catalogue problems", async () => {
    serve({
      "GET /api/catalog": catalog({
        problems: [{ file: "catalog/mine.json", entryId: "local.x", message: "“category” is not a catalogue category." }],
      }),
    });
    renderScreen(<ExplorePage />, "/explore");
    expect(await screen.findByText("1 catalogue entry could not be read and is not listed")).toBeInTheDocument();
    expect(screen.getByText("“category” is not a catalogue category.")).toBeInTheDocument();
  });
});

describe("the download confirmation", () => {
  it("preselects the default location, bars ones that are too small or disconnected, and starts the download there", async () => {
    const server = serve({
      "POST /api/catalog/entries/wp/download": {
        status: 507,
        error: {
          code: "insufficient_space",
          message: "Not enough space.",
          details: { requiredBytes: 127_418_000_000, freeBytes: 60_000_000_000 },
        },
      },
      "POST /api/catalog/entries/kiwix.knots/download": {
        download: { id: "d1", title: "Knots by Wikipedia", state: "queued", receivedBytes: 0, totalBytes: 14_100_000 },
        replacesCollectionId: null,
      },
    });
    renderScreen(<ExplorePage />, "/explore");
    await userEvent.click(await screen.findByRole("button", { name: "Download Knots by Wikipedia" }));

    const dialog = await screen.findByRole("dialog", { name: "Download “Knots by Wikipedia”" });
    expect(within(dialog).getByText("about 14.0 MB")).toBeInTheDocument();
    expect(await within(dialog).findByRole("radio", { name: /Internal storage/ })).toBeChecked();
    expect(within(dialog).getByText("60.0 GB free")).toBeInTheDocument();
    expect(within(dialog).getByRole("radio", { name: /NAS/ })).toBeDisabled();
    expect(within(dialog).getByText("Not connected")).toBeInTheDocument();
    expect(within(dialog).getByText("CC BY-SA 4.0")).toBeInTheDocument();
    expect(within(dialog).getByText("Wikipedia contributors.")).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole("radio", { name: /USB drive/ }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Download" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(server.calls).toContain("POST /api/catalog/entries/kiwix.knots/download");
  });

  it("cannot be confirmed when no location has room", async () => {
    serve();
    renderScreen(<ExplorePage />, "/explore");
    await userEvent.click(await screen.findByRole("button", { name: "Download Wikipedia (complete, with images)" }));
    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByRole("radio", { name: /Internal storage/ })).toBeDisabled();
    expect(within(dialog).getAllByText("Not enough room: this needs 127 GB")).toHaveLength(2);
    expect(within(dialog).getByRole("button", { name: "Download" })).toBeDisabled();
  });

  it("offers packs first, and fetches the chosen part of one to the chosen location", async () => {
    const pack = { id: "starter", name: "Starter", description: "The first things to fetch.", entryIds: ["kiwix.knots", "nhs", "wp"] };
    const server = serve({
      "GET /api/catalog": catalog({ packs: [pack] }),
      "POST /api/catalog/packs/starter/install": {
        queued: [download({ id: "d9", title: "Knots by Wikipedia" })],
        added: [],
        already: 0,
        failed: [],
      },
    });
    const user = userEvent.setup();
    renderScreen(<ExplorePage />, "/explore");
    // The main view points at packs; the category list has them first.
    await user.click(await screen.findByRole("button", { name: "Packs" }));
    expect(await screen.findByRole("heading", { name: "Starter" })).toBeInTheDocument();
    expect(screen.getByText(/3 items, .*to fetch, 1 already here/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Get the rest" }));
    const dialog = await screen.findByRole("dialog", { name: "Starter" });
    // What is already here is shown, not offered again.
    expect(within(dialog).getByText("In your library")).toBeInTheDocument();
    expect(within(dialog).getAllByRole("checkbox")).toHaveLength(2);
    // The complete Wikipedia is left out; the rest fits the default location.
    await user.click(within(dialog).getByRole("checkbox", { name: /Wikipedia \(complete/ }));
    await user.click(within(dialog).getByRole("button", { name: "Fetch 1 item" }));

    expect(await screen.findByRole("dialog", { name: "Starter: on its way" })).toBeInTheDocument();
    expect(server.calls).toContain("POST /api/catalog/packs/starter/install");
  });
});
