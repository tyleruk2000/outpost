import { GUIDE_LOADERS } from "virtual:outpost-guides";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import GuidePage from "./guide-page";
import { GUIDES } from "./guides";
import HelpPage from "./help-page";

function Where() {
  const location = useLocation();
  return <output data-testid="where">{`${location.pathname}${location.hash}`}</output>;
}

function show(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/help" element={<HelpPage />} />
          <Route path="/help/:slug" element={<GuidePage />} />
          <Route path="*" element={<p>Elsewhere</p>} />
        </Routes>
        <Where />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** A guide's words are a module of their own, made from docs/ the first time a test asks for it. */
const LOADED = { timeout: 10_000 };

const original = { ...GUIDE_LOADERS };
afterEach(() => Object.assign(GUIDE_LOADERS, original));

describe("Help", () => {
  it("lists the guides under the four groups a household thinks in, with one sentence each", () => {
    show("/help");
    expect(screen.getByRole("heading", { level: 1, name: "Help" })).toBeVisible();
    expect(screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent)).toEqual([
      "Getting it running",
      "Looking after it",
      "Using it",
      "How it works and where things come from",
    ]);
    const deployment = screen.getByRole("link", { name: /^Installing and running Outpost/ });
    expect(deployment).toHaveAttribute("href", "/help/deployment");
    expect(deployment).toHaveTextContent("moving it to a Raspberry Pi");
    expect(screen.getByRole("link", { name: /^Setting up search by meaning/ })).toHaveAttribute("href", "/help/search-and-answers");
    expect(screen.getByRole("link", { name: /^Troubleshooting/ })).toHaveAttribute("href", "/help/troubleshooting");
  });

  it("keeps the pages for developers folded away until asked for", async () => {
    show("/help");
    const developers = screen.getByText("For developers: 18 pages");
    expect(screen.getByRole("link", { name: /^API reference/, hidden: true })).not.toBeVisible();
    await userEvent.click(developers);
    expect(screen.getByRole("link", { name: /^API reference/ })).toBeVisible();
  });

  it("has every guide in the list", () => {
    show("/help");
    for (const guide of GUIDES) expect(document.querySelector(`a[href="/help/${guide.slug}"]`), guide.slug).not.toBeNull();
  });
});

describe("a guide", () => {
  it("shows a skeleton while its words load, then the guide with a way back, its sections, and the screen it describes", async () => {
    show("/help/storage");
    expect(document.querySelector("[aria-busy]")).not.toBeNull();
    expect(screen.getByRole("heading", { level: 1, name: "Storage" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Help" })).toHaveAttribute("href", "/help");
    expect(screen.getByRole("link", { name: "Open Storage" })).toHaveAttribute("href", "/storage");
    await screen.findByRole("heading", { level: 2, name: "Backing up" }, LOADED);
    expect(screen.getByRole("heading", { level: 2, name: "Backing up" })).toHaveAttribute("id", "h-backing-up");
    // Its sections, folded under one line when there are many.
    await userEvent.click(screen.getByText(/^On this page: \d+ parts$/));
    expect(within(screen.getByRole("navigation", { name: "On this page" })).getByRole("link", { name: "Backing up" })).toHaveAttribute(
      "href",
      "#h-backing-up",
    );
    expect(screen.getByText(/In the repository as docs\/storage\.md/)).toBeVisible();
  });

  it("links to another guide inside Outpost, at the heading it names", async () => {
    show("/help/deployment");
    await screen.findByRole("heading", { level: 2, name: "Docker Compose quick start" }, LOADED);
    // Its words in docs/ are "storage.md"; under Help the link reads as the guide and the section it leads to.
    const link = screen.getAllByRole("link", { name: /^Storage(: .+)?$/ })[0]!;
    expect(link.getAttribute("href")).toMatch(/^\/help\/storage(#h-[a-z0-9-]+)?$/);
    await userEvent.click(link);
    await waitFor(() => expect(screen.getByTestId("where")).toHaveTextContent(/^\/help\/storage/));
    expect(await screen.findByRole("heading", { level: 1, name: "Storage" }, LOADED)).toBeVisible();
  });

  it("shows a command whole, with a button that copies it", async () => {
    show("/help/deployment");
    await screen.findByRole("heading", { level: 2, name: "Docker Compose quick start" }, LOADED);
    const copy = screen.getAllByRole("button", { name: /^Copy: git clone https:\/\/github.com\/tyleruk2000\/outpost.git/ })[0]!;
    expect(copy.closest("div")?.querySelector("pre")).toHaveTextContent("docker compose up -d --build");
  });

  it("says plainly when its words cannot be loaded, and tries again", async () => {
    let fail = true;
    GUIDE_LOADERS.epub = async () => {
      if (fail) throw new Error("The server is not responding.");
      return original.epub!();
    };
    show("/help/epub");
    expect(await screen.findByText("This could not be loaded", {}, LOADED)).toBeVisible();
    fail = false;
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { level: 2, name: "Using it" }, LOADED)).toBeVisible();
  });

  it("says there is no guide at an address that has none", () => {
    show("/help/no-such-guide");
    expect(screen.getByRole("heading", { level: 1, name: "There is no guide at this address" })).toBeVisible();
    expect(screen.getByRole("link", { name: "See every guide" })).toHaveAttribute("href", "/help");
  });

  it("is not sent anywhere: opening a guide asks the server for nothing", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    show("/help/troubleshooting");
    await screen.findByRole("heading", { level: 2, name: "Storage" }, LOADED);
    expect(fetch).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
