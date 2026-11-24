import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { detentHeight, keyboardFit, nearestDetent, PanelTabs, PEEK_HEIGHT, typingHeight } from "./side-panel";

describe("the sheet with a phone's keyboard up", () => {
  // The map area of an iPhone at 390 by 664: under the 52 px bar, over the 64 px bar of screens.
  const area = { top: 52, bottom: 600 };

  it("measures how much of the map area the keyboard covers, and what is left to see", () => {
    expect(keyboardFit(area, null)).toEqual({ inset: 0, height: 548 });
    expect(keyboardFit(area, { offsetTop: 0, height: 664 })).toEqual({ inset: 0, height: 548 });
    // The keyboard 300 px tall: the foot of the area under it, 312 px of the area left.
    expect(keyboardFit(area, { offsetTop: 0, height: 364 })).toEqual({ inset: 236, height: 312 });
    // Safari panned the page up by 40 px to show the field: the top of the area is out of sight too.
    expect(keyboardFit(area, { offsetTop: 40, height: 364 })).toEqual({ inset: 196, height: 352 });
    // A pixel of rounding is not a keyboard.
    expect(keyboardFit(area, { offsetTop: 0, height: 599.4 })).toEqual({ inset: 0, height: 548 });
  });

  it("takes all the room left while a field in it is typed in, and keeps its height otherwise", () => {
    expect(typingHeight("half", null)).toBeNull();
    // Little room: all of it, the search box over the map too.
    expect(typingHeight("half", { inset: 236, height: 312 })).toBe(312);
    expect(typingHeight("full", { inset: 0, height: 248 })).toBe(248);
    // Room enough: full height above the keyboard, the search box still showing.
    expect(typingHeight("half", { inset: 300, height: 600 })).toBe(532);
    // No keyboard and room enough (a tablet's keyboard, say): as it was.
    expect(typingHeight("half", { inset: 0, height: 600 })).toBeNull();
    // Lowered stays lowered.
    expect(typingHeight("peek", { inset: 236, height: 312 })).toBeNull();
  });
});

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
