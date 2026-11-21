/**
 * Quick search is fetched the first time it is opened. When that fetch fails (the server
 * was updated since the tab was opened, or cannot be reached) the app must stay as it is,
 * say so, and try again at the next press. And while it is still arriving, letters typed
 * for it must not be taken as the "g then a letter" shortcuts.
 */
import { act, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { Toaster } from "sonner";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "./app-shell";

const palette = vi.hoisted(() => ({ mode: "fails" as "fails" | "never" | "works", loads: 0 }));

vi.mock("./command-palette", () => ({
  CommandPalette: ({ open }: { open: boolean }) => {
    palette.loads += 1;
    // React.lazy throws a failed fetch while rendering; a part that throws the same error stands in for it.
    if (palette.mode === "fails") throw new TypeError("Failed to fetch dynamically imported module: /assets/command-palette-old.js");
    // A chunk still on its way: suspend for ever.
    if (palette.mode === "never") throw new Promise(() => {});
    return open ? <div role="dialog" aria-label="Quick search" /> : null;
  },
}));
vi.mock("./sidebar", () => ({ Sidebar: () => <nav aria-label="Sidebar">sidebar</nav> }));
vi.mock("./mobile-nav", () => ({ MobileNav: () => null }));
vi.mock("./update-notice", () => ({ UpdateNotice: () => null }));
vi.mock("@/features/device/clock-notice", () => ({ ClockNotice: () => null }));
vi.mock("@/features/access/access-notice", () => ({ AccessNotice: () => null }));
vi.mock("@/features/kept/reach", () => ({ ReachNotice: () => null }));
vi.mock("@/features/maps/recording/indicator", () => ({ RecordingIndicator: () => null }));

afterEach(() => vi.restoreAllMocks());

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>;
}

function show() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route element={<AppShell onNewPage={() => {}} />}>
          <Route
            path="*"
            element={
              <>
                <h1>Home</h1>
                <Where />
              </>
            }
          />
        </Route>
      </Routes>
      <Toaster />
    </MemoryRouter>,
  );
}

const press = async (init: KeyboardEventInit) => {
  await act(async () => {
    window.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }));
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
};

describe("quick search whose part cannot be fetched", () => {
  it("leaves the screen and the sidebar in place, says so, and tries again at the next press", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    // React reports an error no boundary caught to the window: none may get that far.
    const uncaught: unknown[] = [];
    const keep = (event: ErrorEvent) => {
      uncaught.push(event.error);
      event.preventDefault();
    };
    window.addEventListener("error", keep);
    palette.mode = "fails";
    palette.loads = 0;
    const { container } = show();

    await press({ key: "k", ctrlKey: true });
    expect(uncaught).toEqual([]);
    expect(container.innerHTML).not.toBe("");
    expect(screen.getByRole("heading", { name: "Home" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Sidebar" })).toBeInTheDocument();
    expect(await screen.findByText(/Quick search could not be loaded/)).toBeInTheDocument();

    // The next press fetches it afresh, and this time it arrives.
    palette.mode = "works";
    const before = palette.loads;
    await press({ key: "k", ctrlKey: true });
    expect(palette.loads).toBeGreaterThan(before);
    expect(await screen.findByRole("dialog", { name: "Quick search" })).toBeInTheDocument();
    window.removeEventListener("error", keep);
  });
});

describe("going to another screen", () => {
  it("starts the new screen at its top, on a phone too, where it is the window that scrolls", async () => {
    palette.mode = "never";
    show();
    // The test's document has no scrolling element of its own: give it one, as a browser has.
    const page = { scrollTop: 350 };
    Object.defineProperty(document, "scrollingElement", { configurable: true, value: page });
    await press({ key: "g" });
    await press({ key: "m" });
    expect(screen.getByTestId("where")).toHaveTextContent("/maps");
    expect(page.scrollTop).toBe(0);
    Object.defineProperty(document, "scrollingElement", { configurable: true, value: undefined });
  });
});

describe("arriving at a named place on a screen", () => {
  it("leaves the scrolling to the screen, which goes to that place itself", () => {
    const page = { scrollTop: 350 };
    Object.defineProperty(document, "scrollingElement", { configurable: true, value: page });
    render(
      <MemoryRouter initialEntries={["/help/search-and-answers#answers-and-chat"]}>
        <Routes>
          <Route element={<AppShell onNewPage={() => {}} />}>
            <Route path="*" element={<h1>Guide</h1>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
    expect(page.scrollTop).toBe(350);
    Object.defineProperty(document, "scrollingElement", { configurable: true, value: undefined });
  });
});

describe("quick search that is still arriving", () => {
  it("does not take the letters typed for it as shortcuts", async () => {
    palette.mode = "never";
    show();
    await press({ key: "k", ctrlKey: true });
    await press({ key: "g" });
    await press({ key: "m" });
    expect(screen.getByTestId("where")).toHaveTextContent("/");
    expect(screen.getByTestId("where")).not.toHaveTextContent("/maps");
  });

  it("still goes by g then a letter when quick search is not open", async () => {
    palette.mode = "never";
    show();
    await press({ key: "g" });
    await press({ key: "m" });
    expect(screen.getByTestId("where")).toHaveTextContent("/maps");
  });
});
