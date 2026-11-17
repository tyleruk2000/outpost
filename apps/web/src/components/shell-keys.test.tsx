/**
 * The shell's keys and the phone's bottom bar: shortcuts never act on a key that belongs to
 * a field, a menu or a dialog, the screens can be found by the words a person would type,
 * and the bar marks where you are even when that screen is in the More sheet.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider } from "@/lib/theme";
import { isTyping } from "./app-shell";
import { CommandPalette } from "./command-palette";
import { MobileNav } from "./mobile-nav";

afterEach(() => vi.unstubAllGlobals());

describe("shortcuts", () => {
  it("leave alone a key pressed in a field, a menu, a list or a dialog", () => {
    document.body.innerHTML = `
      <input id="field" />
      <div role="menu"><div role="menuitem" id="item" tabindex="-1">Remove</div></div>
      <div role="listbox"><div role="option" id="option">Urban</div></div>
      <div role="dialog"><button id="in-dialog">Save</button></div>
      <button id="page-button">Download</button>`;
    for (const id of ["field", "item", "option", "in-dialog"]) expect(isTyping(document.getElementById(id)), id).toBe(true);
    expect(isTyping(document.getElementById("page-button"))).toBe(false);
    expect(isTyping(document.body)).toBe(false);
  });
});

function palette() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ results: [], warnings: [] }), { headers: { "Content-Type": "application/json" } })),
  );
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ThemeProvider>
        <MemoryRouter>
          <CommandPalette open onOpenChange={() => {}} onNewPage={() => {}} />
        </MemoryRouter>
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

describe("the quick search", () => {
  it("finds screens by the words a person would type for them", async () => {
    const user = userEvent.setup();
    palette();
    const field = screen.getByPlaceholderText(/Search your library/);
    const expected: Array<[string, string]> = [
      ["backup", "Settings"],
      ["free space", "Storage: Manage and clean up"],
      ["address book", "Contacts"],
      ["pgp", "Encryption"],
      ["logbook", "Radio: Contact log"],
      ["notion", "Notes: Import files"],
      ["wikipedia", "Explore"],
    ];
    for (const [typed, screenName] of expected) {
      await user.clear(field);
      await user.type(field, typed);
      expect(within(screen.getByRole("group", { name: "Go to" })).getAllByRole("option")[0], typed).toHaveTextContent(screenName);
    }
  });

  it("lists its keys", () => {
    palette();
    expect(screen.getByText(/then a letter goes to a screen/)).toBeInTheDocument();
  });
});

describe("the phone's bottom bar", () => {
  function bar(at: string) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ jobs: [], locations: [] }), { headers: { "Content-Type": "application/json" } })),
    );
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter initialEntries={[at]}>
          <MobileNav onOpenSearch={() => {}} />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    return screen.getByRole("navigation", { name: "Main" });
  }

  it("marks More when the screen in view is one of those in the More sheet", () => {
    const nav = bar("/settings");
    expect(within(nav).getByRole("button", { name: "More" })).toHaveAttribute("aria-current", "true");
    for (const link of within(nav).getAllByRole("link")) expect(link).not.toHaveAttribute("aria-current");
  });

  it("marks the tab, not More, for a screen a tab holds", () => {
    const nav = bar("/library/documents/abc");
    expect(within(nav).getByRole("link", { name: "Library" })).toHaveAttribute("aria-current", "page");
    expect(within(nav).getByRole("button", { name: "More" })).not.toHaveAttribute("aria-current");
  });
});
