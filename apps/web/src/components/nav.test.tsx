import fs from "node:fs";
import path from "node:path";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import RadioPage from "@/features/radio/radio-page";
import { ThemeProvider } from "@/lib/theme";
import { CommandPalette } from "./command-palette";
import { allNav, everyScreen, settingsGroups, settingsSections } from "./nav";
import { Sidebar } from "./sidebar";
import { TooltipProvider } from "./ui/misc";

/** The routes app.tsx draws, as written there ("radio/plans/:id", "contacts/*"), with "" for the index. */
function routes(): string[] {
  const source = fs.readFileSync(path.join(import.meta.dirname, "../app.tsx"), "utf8");
  return [...source.matchAll(/<Route\s+(index\b|path="([^"]*)")/g)].map((match) => (match[1] === "index" ? "" : match[2]!));
}

/**
 * Routes that are not screens of their own, so belong in no navigation. Keep this short:
 * anything a person is meant to open belongs in nav.ts.
 */
const NOT_SCREENS = new Set([
  // The page for an address that is nothing.
  "*",
  // The household binder's old address, which opens the household book.
  "prepare/binder",
]);

describe("the sections of Settings", () => {
  it("come group by group, every group with something in the contents, so the screen's order and its contents agree", () => {
    const order = settingsGroups.map((group) => group.id);
    const groupsInOrder = settingsSections.map((section) => order.indexOf(section.group));
    expect(groupsInOrder.every((at) => at >= 0)).toBe(true);
    expect(groupsInOrder).toEqual([...groupsInOrder].sort((a, b) => a - b));
    for (const group of settingsGroups) {
      expect(
        settingsSections.some((section) => section.group === group.id && section.inContents),
        group.id,
      ).toBe(true);
    }
    // What most people come for is before the radio and the fine-tuning.
    const at = (id: string) => settingsSections.findIndex((section) => section.id === id);
    expect(at("backup")).toBeLessThan(at("mesh"));
    expect(at("access")).toBeLessThan(at("downloads"));
  });
});

describe("the navigation's description of every screen", () => {
  it("reads the routes it checks from app.tsx", () => {
    expect(routes()).toContain("");
    expect(routes()).toContain("search/how-it-works");
    expect(routes().length).toBeGreaterThan(20);
  });

  it("lists every route with no parameters, so that no screen is reachable only by its address", () => {
    const listed = new Set(everyScreen.map((item) => item.to));
    const missing = routes()
      .filter((route) => !route.includes(":") && !NOT_SCREENS.has(route))
      .map((route) => `/${route.replace(/\/\*$/, "")}`)
      .filter((to) => !listed.has(to));
    expect(missing, "add these to knowledgeNav or upkeepNav in nav.ts, as a screen or under one").toEqual([]);
  });

  it("points every entry at a route that exists", () => {
    const exact = new Set(routes().map((route) => `/${route}`));
    const prefixes = routes()
      .filter((route) => route.endsWith("/*"))
      .map((route) => `/${route.slice(0, -2)}`);
    const nowhere = everyScreen.map((item) => item.to).filter((to) => !exact.has(to) && !prefixes.includes(to));
    expect(nowhere).toEqual([]);
  });

  it("names each screen once, at one address, and gives each shortcut to one screen", () => {
    const paths = everyScreen.map((item) => item.to);
    expect(new Set(paths).size).toBe(paths.length);
    const names = everyScreen.map((item) => (item.parent ? `${item.parent.label}: ${item.label}` : item.label));
    expect(new Set(names).size).toBe(names.length);
    const keys = allNav.map((item) => item.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

function Where() {
  const location = useLocation();
  return <output aria-label="Address">{location.pathname}</output>;
}

function showSidebar(at: string, collapsed = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.stubGlobal(
    "fetch",
    // Nothing running, nothing stored: the lamp and the downloads count have something to read.
    vi.fn(async () => new Response(JSON.stringify({ jobs: [], locations: [] }), { headers: { "Content-Type": "application/json" } })),
  );
  return render(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <MemoryRouter initialEntries={[at]}>
          <Sidebar collapsed={collapsed} onToggle={() => {}} onOpenSearch={() => {}} />
          <Where />
        </MemoryRouter>
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

describe("the sidebar", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it("marks each screen with others under it with a button that shows them", async () => {
    const user = userEvent.setup();
    showSidebar("/");
    const sidebar = screen.getByRole("complementary", { name: "Main" });
    for (const name of ["Search", "Radio", "Notes", "Storage", "Settings"]) {
      expect(within(sidebar).getByRole("button", { name: `Show the screens under ${name}` })).toHaveAttribute("aria-expanded", "false");
    }
    expect(within(sidebar).queryByRole("link", { name: "How search works" })).toBeNull();

    await user.click(within(sidebar).getByRole("button", { name: "Show the screens under Search" }));
    expect(within(sidebar).getByRole("button", { name: "Hide the screens under Search" })).toHaveAttribute("aria-expanded", "true");
    await user.click(within(sidebar).getByRole("link", { name: "How search works" }));
    expect(screen.getByRole("status", { name: "Address" })).toHaveTextContent("/search/how-it-works");
    // Remembered on this device.
    expect(JSON.parse(localStorage.getItem("outpost.sidebar.groups")!)).toEqual({ "/search": true });
  });

  it("keeps Downloads, Storage and Settings out of the part that scrolls, and Notes with Library and Maps", () => {
    showSidebar("/");
    const sidebar = screen.getByRole("complementary", { name: "Main" });
    const knowledge = within(sidebar).getByRole("navigation", { name: "Knowledge" });
    const upkeep = within(sidebar).getByRole("navigation", { name: "Upkeep" });
    const scrolls = knowledge.closest(".overflow-y-auto");
    expect(scrolls).not.toBeNull();
    expect(scrolls!.contains(upkeep)).toBe(false);
    expect(
      within(knowledge)
        .getAllByRole("link")
        .slice(0, 5)
        .map((link) => link.textContent),
    ).toEqual(["Home", "Search", "Library", "Maps", "Notes"]);
    // The field that opens the quick search, and the link to the search screen, have names that cannot be confused.
    expect(within(sidebar).getByRole("button", { name: "Quick search" })).toHaveTextContent("Quick search");
    expect(within(knowledge).getByRole("link", { name: "Search" })).toHaveAttribute("href", "/search");
  });

  it("opens the group of the screen in view by itself, and lights only that screen", () => {
    showSidebar("/radio/plans/abc");
    const sidebar = screen.getByRole("complementary", { name: "Main" });
    const under = within(sidebar).getByRole("list", { name: "Under Radio" });
    expect(
      within(under)
        .getAllByRole("link")
        .map((link) => link.textContent),
    ).toEqual([
      "HF propagation",
      "HF coverage",
      "Communication plans",
      "Contact log",
      "Repeaters",
      "Morse trainer",
      "Frequencies to listen to",
      "Satellites",
      "Licences and band plans",
      "Heard on the radio",
    ]);
    expect(within(under).getByRole("link", { name: "Communication plans" })).toHaveAttribute("aria-current", "page");
    expect(within(sidebar).getByRole("link", { name: "Radio" })).not.toHaveAttribute("aria-current");
  });

  it("keeps a group closed that was closed on this device, unless its screen is in view", () => {
    localStorage.setItem("outpost.sidebar.groups", JSON.stringify({ "/storage": false, "/settings": true }));
    showSidebar("/");
    const sidebar = screen.getByRole("complementary", { name: "Main" });
    expect(within(sidebar).queryByRole("link", { name: "Manage and clean up" })).toBeNull();
    expect(within(sidebar).getByRole("link", { name: "Set-up guide" })).toBeInTheDocument();
  });

  it("collapsed to icons, opens a menu of a screen and those under it from the keyboard", async () => {
    const user = userEvent.setup();
    showSidebar("/", true);
    const trigger = screen.getByRole("button", { name: "Radio, and the screens under it" });
    trigger.focus();
    await user.keyboard("{Enter}");
    const menu = await screen.findByRole("menu");
    expect(
      within(menu)
        .getAllByRole("menuitem")
        .map((item) => item.textContent?.trim()),
    ).toEqual([
      "Radio",
      "HF propagation",
      "HF coverage",
      "Communication plans",
      "Contact log",
      "Repeaters",
      "Morse trainer",
      "Frequencies to listen to",
      "Satellites",
      "Licences and band plans",
      "Heard on the radio",
    ]);
    await user.click(within(menu).getByRole("menuitem", { name: "Repeaters" }));
    expect(screen.getByRole("status", { name: "Address" })).toHaveTextContent("/radio/repeaters");
  });
});

describe("the quick search's Go to list", () => {
  it("lists every screen, those under another with its name, and goes to the first match on Enter", async () => {
    const user = userEvent.setup();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ results: [], warnings: [] }), { headers: { "Content-Type": "application/json" } })),
    );
    render(
      <QueryClientProvider client={client}>
        <ThemeProvider>
          <MemoryRouter>
            <CommandPalette open onOpenChange={() => {}} onNewPage={() => {}} />
            <Where />
          </MemoryRouter>
        </ThemeProvider>
      </QueryClientProvider>,
    );
    const goTo = screen.getByRole("group", { name: "Go to" });
    expect(within(goTo).getAllByRole("option")).toHaveLength(everyScreen.length);
    expect(within(goTo).getByRole("option", { name: "Radio: Repeaters" })).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText(/Search, or go to a screen/), "repeat");
    expect(within(screen.getByRole("group", { name: "Go to" })).getAllByRole("option")[0]).toHaveTextContent("Radio: Repeaters");
    await user.keyboard("{Enter}");
    // Outside the open dialog, so hidden from the accessibility tree while it is open.
    expect(screen.getByRole("status", { name: "Address", hidden: true })).toHaveTextContent("/radio/repeaters");
    vi.unstubAllGlobals();
  });

  it("finds a screen by its other names: Solitaire by patience and by klondike", async () => {
    const user = userEvent.setup();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ results: [], warnings: [] }), { headers: { "Content-Type": "application/json" } })),
    );
    render(
      <QueryClientProvider client={client}>
        <ThemeProvider>
          <MemoryRouter>
            <CommandPalette open onOpenChange={() => {}} onNewPage={() => {}} />
          </MemoryRouter>
        </ThemeProvider>
      </QueryClientProvider>,
    );
    const field = screen.getByPlaceholderText(/Search, or go to a screen/);
    for (const typed of ["solitaire", "patience", "klondike"]) {
      await user.clear(field);
      await user.type(field, typed);
      expect(within(screen.getByRole("group", { name: "Go to" })).getAllByRole("option")[0]).toHaveTextContent("Games: Solitaire");
    }
    vi.unstubAllGlobals();
  });
});

describe("the Games section", () => {
  it("lists its games under it, in order, each with a quick-search entry", () => {
    const games = allNav.find((item) => item.to === "/games")!;
    expect(games.children!.map((child) => [child.label, child.to])).toEqual([
      ["Chess", "/games/chess"],
      ["Snake", "/games/snake"],
      ["Pairs", "/games/pairs"],
      ["Sudoku", "/games/sudoku"],
      ["Solitaire", "/games/solitaire"],
      ["Draughts", "/games/draughts"],
      ["Peg solitaire", "/games/peg-solitaire"],
      ["Skerry", "/games/skerry"],
      ["Allotment", "/games/allotment"],
      ["Steading", "/games/steading"],
    ]);
    expect(allNav.map((item) => item.to).indexOf("/games")).toBe(allNav.map((item) => item.to).indexOf("/prepare") + 1);
    expect(everyScreen.filter((item) => item.parent?.to === "/games")).toHaveLength(games.children!.length);
  });
});

describe("the Radio screen", () => {
  it("links to every screen the navigation puts under Radio", () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <Routes>
            <Route path="*" element={<RadioPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    const radio = allNav.find((item) => item.to === "/radio")!;
    const hrefs = screen.getAllByRole("link").map((link) => link.getAttribute("href"));
    for (const child of radio.children!) expect(hrefs).toContain(child.to);
  });
});
