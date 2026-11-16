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
  it("take a second line when they do not fit, instead of sliding off the edge of a row that scrolls", () => {
    render(
      <PanelTabs tab="places" onTabChange={() => {}} counts={{ places: 128, routes: 14 }}>
        {{ places: <p>places</p>, routes: <p>routes</p>, layers: <p>layers</p>, offline: <p>offline</p>, sun: <p>sun</p> }}
      </PanelTabs>,
    );
    const list = screen.getByRole("tablist");
    expect(list).toHaveClass("flex-wrap", "overflow-x-visible");
    expect(list).not.toHaveClass("overflow-x-auto");
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["Places128", "Routes14", "Layers", "Offline maps", "Sun"]);
    // Each is tall enough to touch on a phone.
    for (const tab of screen.getAllByRole("tab")) expect(tab).toHaveClass("max-md:min-h-[44px]", "max-md:min-w-[44px]");
  });
});
