import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { detentHeight, nearestDetent, PanelTabs, PEEK_HEIGHT } from "./side-panel";

describe("the heights the sheet rests at", () => {
  it("are the handle and the tab row, half the map, and all but the search box", () => {
    expect(detentHeight("peek", 600)).toBe(PEEK_HEIGHT);
    expect(detentHeight("half", 600)).toBe(300);
    expect(detentHeight("full", 600)).toBe(532);
  });

  it("never go below what the tab row needs, when larger text makes it taller than usual", () => {
    // Two lines of names at a large text size.
    expect(detentHeight("peek", 460, 215)).toBe(215);
    expect(detentHeight("half", 460, 215)).toBe(230);
    expect(detentHeight("half", 400, 215)).toBe(215);
    expect(nearestDetent(220, 460, 215)).toBe("peek");
    expect(nearestDetent(380, 460, 215)).toBe("full");
  });
});

describe("the tab names", () => {
  it("head the tab shown at level 2, between the screen's h1 and the tab's own h3s", () => {
    render(
      <PanelTabs tab="sun" onTabChange={() => {}} counts={{}}>
        {{ places: <p>places</p>, routes: <p>routes</p>, layers: <p>layers</p>, offline: <p>offline</p>, sun: <h3>Sun at the centre</h3> }}
      </PanelTabs>,
    );
    const panel = screen.getByRole("tabpanel");
    expect(panel.querySelector("h2")).toHaveTextContent("Sun");
    expect(screen.getByRole("heading", { level: 2, name: "Sun" })).toBeInTheDocument();
  });

  it("take a second line when they do not fit, instead of sliding off the edge of a row that scrolls", () => {
    render(
      <PanelTabs tab="places" onTabChange={() => {}} counts={{ places: 128, routes: 14 }}>
        {{ places: <p>places</p>, routes: <p>routes</p>, layers: <p>layers</p>, offline: <p>offline</p>, sun: <p>sun</p> }}
      </PanelTabs>,
    );
    const list = screen.getByRole("tablist");
    // The shared TabsList wraps; the panel adds no scrolling of its own.
    expect(list).toHaveClass("flex-wrap");
    expect(list).not.toHaveClass("overflow-x-auto");
    // Named in full ("Offline maps" is written "Offline", with the full name as the tab's name).
    expect(screen.getAllByRole("tab").map((tab) => tab.getAttribute("aria-label") ?? tab.textContent)).toEqual([
      "Places128",
      "Routes14",
      "Layers",
      "Offline maps",
      "Sun",
    ]);
    // Written short, so that the five fit on one line in the side panel and at 390 px (an iPhone), and the lowered sheet stays one line high.
    expect(screen.getByRole("tab", { name: "Offline maps" })).toHaveTextContent(/^Offline$/);
    // Each is tall enough to touch on a phone.
    for (const tab of screen.getAllByRole("tab")) expect(tab).toHaveClass("max-md:min-h-[44px]", "max-md:min-w-[44px]");
  });
});
