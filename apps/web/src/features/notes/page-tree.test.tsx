import type { NoteTreeItem } from "@outpost/shared";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { installBrowserStubs, renderScreen } from "../downloads/test-support";
import { LONG_PRESS_MS, PageTree } from "./page-tree";
import { buildTreeIndex } from "./tree-model";
import { edgeSpeed, WINDOW_FROM, windowRange } from "./tree-window";

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }));

beforeAll(installBrowserStubs);

const page = (id: string, parentId: string | null, position: number, title = id): NoteTreeItem => ({
  id,
  parentId,
  position,
  title,
  icon: null,
  isFavorite: false,
  childCount: 0,
  updatedAt: 1,
});

/**
 * Kit
 * ├─ Ropes
 * │  └─ Slings
 * └─ Stove
 * Routes
 * Weather
 */
const small = [
  page("kit", null, 1, "Kit"),
  page("ropes", "kit", 1, "Ropes"),
  page("slings", "ropes", 1, "Slings"),
  page("stove", "kit", 2, "Stove"),
  page("routes", null, 2, "Routes"),
  page("weather", null, 3, "Weather"),
];

/** A thousand pages at the top level, the first of which has two sub-pages. */
const large = [
  ...Array.from({ length: 1000 }, (_, at) => page(`p${at}`, null, at + 1, `Page ${at}`)),
  page("p0a", "p0", 1, "Page 0 a"),
  page("p0b", "p0", 2, "Page 0 b"),
];

// jsdom lays nothing out. The tree is given a place in the window, and scrolling moves it.
const STRIDE = 31;
const VIEW = 768;
let scrolled = 0;
const scrollBy = vi.fn((options: { top: number }) => {
  scrolled += options.top;
});

/** Requests the tree made, with their bodies. */
let moves: Array<{ id: string; body: unknown }> = [];

beforeEach(() => {
  scrolled = 0;
  moves = [];
  localStorage.clear();
  vi.mocked(toast).mockClear();
  scrollBy.mockClear();
  vi.stubGlobal("scrollBy", scrollBy);
  vi.stubGlobal("innerHeight", VIEW);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    if (this.getAttribute("role") !== "tree") return new DOMRect(0, 0, 0, 0);
    return new DOMRect(0, -scrolled, 240, Number.parseFloat(this.style.height) || this.children.length * STRIDE);
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input), "http://outpost.test");
      const match = /^\/api\/notes\/([^/]+)\/move$/.exec(url.pathname);
      if (match?.[1] && init?.method === "POST") {
        const body = JSON.parse(String(init.body)) as { parentId: string | null };
        moves.push({ id: match[1], body });
        return Response.json({ note: { ...page(match[1], body.parentId, 1) } });
      }
      return Response.json({ notes: [] });
    }),
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function show(items: NoteTreeItem[], options: { currentId?: string; open?: string[] } = {}) {
  if (options.open) localStorage.setItem("outpost.notes.expanded", JSON.stringify(options.open));
  return renderScreen(<PageTree index={buildTreeIndex(items)} tone="page" currentId={options.currentId} label="Pages" />);
}

const tree = () => screen.getByRole("tree", { name: "Pages" });
const rowNames = () =>
  within(tree())
    .queryAllByRole("treeitem")
    .map((row) => row.getAttribute("aria-label"));
const row = (name: string) => within(tree()).getByRole("treeitem", { name });
const maybeRow = (name: string) => within(tree()).queryByRole("treeitem", { name });
const focused = () => document.activeElement?.getAttribute("aria-label");

function scrollTo(top: number) {
  scrolled = top;
  act(() => {
    window.dispatchEvent(new Event("scroll"));
  });
}

/** Drag events as a browser sends them: jsdom has no DragEvent, and a plain Event carries no position. */
function drag(type: string, target: Element, clientY = 0) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: 60, clientY });
  Object.defineProperty(event, "dataTransfer", { value: { setData() {}, effectAllowed: "", dropEffect: "" } });
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
}

/** The height in the window of a point `part` of the way down the row at `at` (0 is its top edge, 1 its bottom). */
const yOf = (at: number, part: number) => at * STRIDE - scrolled + (STRIDE - 1) * part;

describe("windowRange", () => {
  it("draws the rows on screen and some either side, in steps of eight", () => {
    // Rows 100 to 124 are on screen; ten more either side, rounded outwards to eights.
    expect(windowRange(1000, 31, 3100, 3100 + 768, 10)).toEqual({ start: 88, end: 136 });
  });

  it("stops at the first and the last row", () => {
    expect(windowRange(1000, 31, -200, 568, 10)).toEqual({ start: 0, end: 32 });
    expect(windowRange(1000, 31, 31 * 990, 31 * 990 + 768, 10)).toEqual({ start: 976, end: 1000 });
  });

  it("draws nothing of a tree that is far off screen, or empty", () => {
    expect(windowRange(1000, 31, 50_000, 50_768, 10)).toEqual({ start: 1000, end: 1000 });
    expect(windowRange(1000, 31, -5000, -4232, 10)).toEqual({ start: 0, end: 0 });
    expect(windowRange(0, 31, 0, 768, 10)).toEqual({ start: 0, end: 0 });
  });
});

describe("edgeSpeed", () => {
  const view = { top: 100, bottom: 500, isWindow: false };

  it("is still in the middle and faster the nearer the edge", () => {
    expect(edgeSpeed(300, view)).toBe(0);
    expect(edgeSpeed(480, view)).toBeGreaterThan(edgeSpeed(440, view));
    expect(edgeSpeed(440, view)).toBeGreaterThan(0);
    expect(edgeSpeed(120, view)).toBeLessThan(edgeSpeed(160, view));
    expect(edgeSpeed(160, view)).toBeLessThan(0);
  });

  it("goes no faster past the edge than at it", () => {
    expect(edgeSpeed(900, view)).toBe(edgeSpeed(500, view));
    expect(edgeSpeed(-50, view)).toBe(edgeSpeed(100, view));
  });
});

describe("a small tree", () => {
  it("draws every row in the flow of the page, as it always has", () => {
    show(small, { open: ["kit", "ropes"] });
    expect(rowNames()).toEqual(["Kit", "Ropes", "Slings", "Stove", "Routes", "Weather"]);
    expect(tree().style.height).toBe("");
    expect(row("Slings").style.position).toBe("");
    expect(row("Slings").style.top).toBe("");
  });

  it("describes each row to a screen reader", () => {
    show(small, { open: ["kit"], currentId: "stove" });
    const kit = row("Kit");
    expect(kit).toHaveAttribute("aria-level", "1");
    expect(kit).toHaveAttribute("aria-posinset", "1");
    expect(kit).toHaveAttribute("aria-setsize", "3");
    expect(kit).toHaveAttribute("aria-expanded", "true");
    const ropes = row("Ropes");
    expect(ropes).toHaveAttribute("aria-level", "2");
    expect(ropes).toHaveAttribute("aria-expanded", "false");
    const stove = row("Stove");
    expect(stove).toHaveAttribute("aria-posinset", "2");
    expect(stove).toHaveAttribute("aria-setsize", "2");
    expect(stove).toHaveAttribute("aria-selected", "true");
    expect(stove).toHaveAttribute("aria-current", "page");
    expect(stove).not.toHaveAttribute("aria-expanded");
    expect(row("Weather")).toHaveAttribute("aria-selected", "false");
  });

  it("opens the branch holding the open page", () => {
    show(small, { currentId: "slings" });
    expect(rowNames()).toEqual(["Kit", "Ropes", "Slings", "Stove", "Routes", "Weather"]);
    expect(row("Slings")).toHaveAttribute("tabindex", "0");
  });

  it("moves with the arrow keys, Home and End, and opens and closes branches", async () => {
    const user = userEvent.setup();
    show(small);
    act(() => row("Kit").focus());
    await user.keyboard("{ArrowDown}");
    expect(focused()).toBe("Routes");
    await user.keyboard("{End}");
    expect(focused()).toBe("Weather");
    await user.keyboard("{Home}");
    expect(focused()).toBe("Kit");
    await user.keyboard("{ArrowRight}");
    expect(row("Kit")).toHaveAttribute("aria-expanded", "true");
    await user.keyboard("{ArrowRight}");
    expect(focused()).toBe("Ropes");
    await user.keyboard("{ArrowDown}{ArrowLeft}");
    // Stove has nothing to close, so the arrow goes to its parent.
    expect(focused()).toBe("Kit");
    await user.keyboard("{ArrowLeft}");
    expect(row("Kit")).toHaveAttribute("aria-expanded", "false");
    expect(rowNames()).toEqual(["Kit", "Routes", "Weather"]);
  });
});

describe("a large tree", () => {
  it("is windowed only past the threshold", () => {
    const { unmount } = show(large.slice(0, WINDOW_FROM));
    expect(rowNames()).toHaveLength(WINDOW_FROM);
    expect(tree().style.height).toBe("");
    unmount();
    show(large.slice(0, WINDOW_FROM + 1));
    expect(rowNames().length).toBeLessThan(80);
    expect(tree().style.height).not.toBe("");
  });

  it("draws only the rows near the part on screen, each at its own place", () => {
    show(large);
    // 768 px of window is 25 rows; 13 more are kept ready underneath, rounded up to a step of eight.
    const expected = windowRange(1000, STRIDE, 0, VIEW, 13);
    expect(expected).toEqual({ start: 0, end: 40 });
    expect(rowNames()).toEqual(Array.from({ length: 40 }, (_, at) => `Page ${at}`));
    expect(tree().style.height).toBe(`calc(${1000 * STRIDE - 1}px + 1.5rem)`);
    expect(row("Page 7").style.position).toBe("absolute");
    expect(row("Page 7").style.top).toBe(`${7 * STRIDE}px`);
  });

  it("keeps position and set size true for rows that are not drawn", () => {
    show(large, { open: ["p0"] });
    scrollTo(500 * STRIDE);
    // Page 0's two sub-pages come before it in the rows, so page 500 is row 502.
    const far = row("Page 500");
    expect(far).toHaveAttribute("aria-posinset", "501");
    expect(far).toHaveAttribute("aria-setsize", "1000");
    expect(far).toHaveAttribute("aria-level", "1");
    expect(far.style.top).toBe(`${502 * STRIDE}px`);
  });

  it("follows scrolling, at the boundaries of the window", () => {
    show(large);
    scrollTo(500 * STRIDE);
    const { start, end } = windowRange(1000, STRIDE, 500 * STRIDE, 500 * STRIDE + VIEW, 13);
    expect({ start, end }).toEqual({ start: 480, end: 544 });
    expect(maybeRow(`Page ${start}`)).not.toBeNull();
    expect(maybeRow(`Page ${start - 1}`)).toBeNull();
    expect(maybeRow(`Page ${end - 1}`)).not.toBeNull();
    expect(maybeRow(`Page ${end}`)).toBeNull();
    // The row that holds the tab stop stays, so that Tab still reaches the tree.
    expect(rowNames()).toEqual(["Page 0", ...Array.from({ length: end - start }, (_, at) => `Page ${start + at}`)]);
    expect(row("Page 0")).toHaveAttribute("tabindex", "0");

    scrollTo(999 * STRIDE);
    expect(maybeRow("Page 999")).not.toBeNull();
    expect(maybeRow("Page 960")).toBeNull();
    scrollTo(0);
    expect(rowNames()).toEqual(Array.from({ length: 40 }, (_, at) => `Page ${at}`));
  });

  it("keeps the focused row, and the focus, while it is scrolled far away", () => {
    show(large);
    act(() => row("Page 3").focus());
    scrollTo(700 * STRIDE);
    expect(maybeRow("Page 4")).toBeNull();
    expect(maybeRow("Page 3")).not.toBeNull();
    expect(focused()).toBe("Page 3");
    expect(row("Page 3")).toHaveAttribute("tabindex", "0");
  });

  it("walks past the drawn rows with the arrow keys, scrolling as it goes", async () => {
    const user = userEvent.setup();
    show(large);
    act(() => row("Page 0").focus());
    await user.keyboard("{ArrowDown>60/}");
    expect(focused()).toBe("Page 60");
    expect(scrolled).toBeGreaterThan(0);
    // Page 60 is on screen with room under it.
    expect(yOf(60, 1)).toBeLessThanOrEqual(VIEW - STRIDE);
    expect(maybeRow("Page 61")).not.toBeNull();
  });

  it("jumps to the last and the first row with End and Home", async () => {
    const user = userEvent.setup();
    show(large);
    act(() => row("Page 0").focus());
    await user.keyboard("{End}");
    expect(focused()).toBe("Page 999");
    expect(yOf(999, 1)).toBeLessThanOrEqual(VIEW);
    expect(yOf(999, 0)).toBeGreaterThanOrEqual(0);
    expect(maybeRow("Page 990")).not.toBeNull();
    await user.keyboard("{Home}");
    expect(focused()).toBe("Page 0");
    expect(scrolled).toBeLessThanOrEqual(0);
  });

  it("brings the open page into view, in the middle when it was far away", () => {
    show(large, { currentId: "p600" });
    expect(maybeRow("Page 600")).not.toBeNull();
    expect(row("Page 600")).toHaveAttribute("aria-current", "page");
    const middle = (yOf(600, 0) + yOf(600, 1)) / 2;
    expect(Math.abs(middle - VIEW / 2)).toBeLessThan(STRIDE);
  });

  it("leaves the scroll alone when the open page is already on screen", () => {
    show(large, { currentId: "p5" });
    expect(scrollBy).not.toHaveBeenCalled();
  });
});

describe("moving a page with the mouse", () => {
  it("drops into the middle of a row, and before and after at its edges", async () => {
    show(small, { open: ["kit"] });
    // Rows: Kit 0, Ropes 1, Stove 2, Routes 3, Weather 4.
    drag("dragstart", row("Weather"));
    drag("dragover", tree(), yOf(3, 0.5));
    expect(row("Routes").className).toContain("ring-1");
    drag("drop", tree(), yOf(3, 0.5));
    await waitFor(() => expect(moves).toEqual([{ id: "weather", body: { parentId: "routes" } }]));

    drag("dragstart", row("Weather"));
    const over = drag("dragover", tree(), yOf(2, 0.1));
    expect(over.defaultPrevented).toBe(true);
    expect(row("Stove").querySelector("span[aria-hidden]")?.className).toContain("top-0");
    drag("drop", tree(), yOf(2, 0.1));
    await waitFor(() => expect(moves[1]).toEqual({ id: "weather", body: { parentId: "kit", afterId: "ropes" } }));

    drag("dragstart", row("Weather"));
    drag("dragover", tree(), yOf(2, 0.9));
    expect(row("Stove").querySelector("span[aria-hidden]")?.className).toContain("bottom-0");
    drag("drop", tree(), yOf(2, 0.9));
    await waitFor(() => expect(moves[2]).toEqual({ id: "weather", body: { parentId: "kit", afterId: "stove" } }));
  });

  it("shows the level the page will have by where the line starts", () => {
    show(small, { open: ["kit"] });
    drag("dragstart", row("Weather"));
    drag("dragover", tree(), yOf(2, 0.1));
    const line = row("Stove").querySelector<HTMLElement>("span[aria-hidden]");
    // Stove is one level down: 4 + 14 of indent, and 6 more to clear the arrow.
    expect(line?.style.left).toBe("24px");
  });

  it("never drops a page inside itself or its own sub-pages", () => {
    show(small, { open: ["kit", "ropes"] });
    drag("dragstart", row("Kit"));
    for (const at of [0, 1, 2, 3]) {
      const over = drag("dragover", tree(), yOf(at, 0.5));
      expect(over.defaultPrevented).toBe(false);
    }
    drag("drop", tree(), yOf(2, 0.5));
    expect(moves).toEqual([]);
  });

  it("drops under the last row to the end of the top level", async () => {
    show(small);
    drag("dragstart", row("Kit"));
    drag("dragover", tree(), yOf(3, 0.5));
    drag("drop", tree(), yOf(3, 0.5));
    await waitFor(() => expect(moves).toEqual([{ id: "kit", body: { parentId: null } }]));
  });

  it("opens a closed page the pointer rests on", () => {
    vi.useFakeTimers();
    show(small);
    drag("dragstart", row("Weather"));
    drag("dragover", tree(), yOf(0, 0.5));
    expect(row("Kit")).toHaveAttribute("aria-expanded", "false");
    act(() => {
      vi.advanceTimersByTime(700);
    });
    expect(row("Kit")).toHaveAttribute("aria-expanded", "true");
  });

  it("finds its target among rows that are not drawn where the drag began", async () => {
    show(large);
    drag("dragstart", row("Page 2"));
    scrollTo(800 * STRIDE);
    // The dragged row is kept while it is carried.
    expect(maybeRow("Page 2")).not.toBeNull();
    drag("dragover", tree(), yOf(805, 0.5));
    expect(row("Page 805").className).toContain("ring-1");
    drag("drop", tree(), yOf(805, 0.5));
    await waitFor(() => expect(moves).toEqual([{ id: "p2", body: { parentId: "p805" } }]));
  });

  it("says what moved and offers to put it back", async () => {
    show(small, { open: ["kit"] });
    drag("dragstart", row("Stove"));
    drag("drop", tree(), yOf(3, 0.5));
    await waitFor(() => expect(toast).toHaveBeenCalled());
    const [message, options] = vi.mocked(toast).mock.calls[0] ?? [];
    expect(message).toBe("Moved “Stove” into “Routes”.");
    const action = (options as { action: { label: string; onClick(): void } }).action;
    expect(action.label).toBe("Undo");
    action.onClick();
    // Back under Kit, after Ropes: exactly where it was.
    await waitFor(() => expect(moves[1]).toEqual({ id: "stove", body: { parentId: "kit", afterId: "ropes" } }));
  });
});

describe("moving a page by touch", () => {
  const finger = { pointerType: "touch", pointerId: 7, isPrimary: true, clientX: 80 };
  const lifted = () => document.querySelector("[data-page-lifted]");

  it("picks a page up after a long press, and drops it where the finger lets go", async () => {
    vi.useFakeTimers();
    show(small, { open: ["kit"] });
    fireEvent.pointerDown(row("Weather"), { ...finger, clientY: yOf(4, 0.5) });
    act(() => {
      vi.advanceTimersByTime(LONG_PRESS_MS - 50);
    });
    expect(lifted()).toBeNull();
    act(() => {
      vi.advanceTimersByTime(60);
    });
    expect(lifted()).toHaveTextContent("Weather");
    expect(lifted()).toHaveTextContent("Drag to where it should go");
    expect(row("Weather").className).toContain("opacity-45");

    fireEvent.pointerMove(tree(), { ...finger, clientY: yOf(1, 0.5) });
    expect(lifted()).toHaveTextContent("Inside “Ropes”");
    expect(row("Ropes").className).toContain("ring-1");
    fireEvent.pointerMove(tree(), { ...finger, clientY: yOf(2, 0.1) });
    expect(lifted()).toHaveTextContent("Before “Stove”");
    fireEvent.pointerMove(tree(), { ...finger, clientY: yOf(2, 0.9) });
    expect(lifted()).toHaveTextContent("After “Stove”");

    fireEvent.pointerUp(tree(), { ...finger, clientY: yOf(2, 0.9) });
    expect(lifted()).toBeNull();
    vi.useRealTimers();
    await waitFor(() => expect(moves).toEqual([{ id: "weather", body: { parentId: "kit", afterId: "stove" } }]));
  });

  it("leaves a finger that travels to scroll the list", () => {
    vi.useFakeTimers();
    show(small);
    fireEvent.pointerDown(row("Weather"), { ...finger, clientY: yOf(2, 0.5) });
    fireEvent.pointerMove(row("Weather"), { ...finger, clientY: yOf(2, 0.5) - 30 });
    act(() => {
      vi.advanceTimersByTime(LONG_PRESS_MS + 100);
    });
    expect(lifted()).toBeNull();
    fireEvent.pointerUp(row("Weather"), { ...finger, clientY: yOf(0, 0.5) });
    expect(moves).toEqual([]);
  });

  it("does not pick anything up from the arrow or the menu button, or with a mouse", () => {
    vi.useFakeTimers();
    show(small);
    fireEvent.pointerDown(within(row("Kit")).getByRole("button", { name: "Expand Kit" }), { ...finger, clientY: yOf(0, 0.5) });
    act(() => {
      vi.advanceTimersByTime(LONG_PRESS_MS + 100);
    });
    expect(lifted()).toBeNull();
    fireEvent.pointerUp(tree(), finger);
    fireEvent.pointerDown(row("Weather"), { ...finger, pointerType: "mouse", clientY: yOf(2, 0.5) });
    act(() => {
      vi.advanceTimersByTime(LONG_PRESS_MS + 100);
    });
    expect(lifted()).toBeNull();
  });

  it("says so, and moves nothing, over the page's own sub-pages", () => {
    vi.useFakeTimers();
    show(small, { open: ["kit", "ropes"] });
    fireEvent.pointerDown(row("Kit"), { ...finger, clientY: yOf(0, 0.5) });
    act(() => {
      vi.advanceTimersByTime(LONG_PRESS_MS + 10);
    });
    fireEvent.pointerMove(tree(), { ...finger, clientY: yOf(2, 0.5) });
    expect(lifted()).toHaveTextContent("A page cannot go inside itself");
    fireEvent.pointerUp(tree(), { ...finger, clientY: yOf(2, 0.5) });
    expect(moves).toEqual([]);
  });

  it("puts the page down where it was when the touch is cancelled", () => {
    vi.useFakeTimers();
    show(small);
    fireEvent.pointerDown(row("Weather"), { ...finger, clientY: yOf(2, 0.5) });
    act(() => {
      vi.advanceTimersByTime(LONG_PRESS_MS + 10);
    });
    fireEvent.pointerMove(tree(), { ...finger, clientY: yOf(0, 0.5) });
    fireEvent.pointerCancel(tree(), finger);
    expect(lifted()).toBeNull();
    expect(moves).toEqual([]);
  });

  it("does not open the right-click menu on a long press", () => {
    show(small);
    fireEvent.pointerDown(row("Weather"), { ...finger, clientY: yOf(2, 0.5) });
    fireEvent.contextMenu(row("Weather"));
    expect(screen.queryByRole("menu")).toBeNull();
    fireEvent.pointerCancel(tree(), finger);
  });
});

describe("moving a page without dragging", () => {
  async function openMenu(user: ReturnType<typeof userEvent.setup>, name: string) {
    act(() => row(name).focus());
    await user.click(within(row(name)).getByRole("button", { name: `Actions for ${name}` }));
    return screen.findByRole("menu");
  }

  it("offers Move to… in the page menu, which opens a picker", async () => {
    const user = userEvent.setup();
    show(small, { open: ["kit", "ropes"] });
    const menu = await openMenu(user, "Stove");
    await user.click(within(menu).getByRole("menuitem", { name: "Move to…" }));
    const dialog = await screen.findByRole("dialog", { name: "Move “Stove”" });
    // Everything but the page itself; its parent is marked.
    const options = within(dialog).getAllByRole("option");
    expect(options.map((option) => option.textContent)).toEqual([
      "Top level",
      "KitIt is here now",
      "RopesKit",
      "SlingsKit / Ropes",
      "Routes",
      "Weather",
    ]);
    await user.click(within(dialog).getByRole("option", { name: /Routes/ }));
    await waitFor(() => expect(moves).toEqual([{ id: "stove", body: { parentId: "routes" } }]));
    expect(vi.mocked(toast).mock.calls[0]?.[0]).toBe("Moved “Stove” into “Routes”.");
  });

  it("never offers a page itself or its sub-pages as the place to go", async () => {
    const user = userEvent.setup();
    show(small, { open: ["kit"] });
    const menu = await openMenu(user, "Kit");
    await user.click(within(menu).getByRole("menuitem", { name: "Move to…" }));
    const dialog = await screen.findByRole("dialog", { name: "Move “Kit”" });
    expect(
      within(dialog)
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual(["Top levelIt is here now", "Routes", "Weather"]);
  });

  it("moves a page up or down a place from its menu", async () => {
    const user = userEvent.setup();
    show(small);
    let menu = await openMenu(user, "Routes");
    await user.click(within(menu).getByRole("menuitem", { name: "Move down" }));
    await waitFor(() => expect(moves).toEqual([{ id: "routes", body: { parentId: null, afterId: "weather" } }]));
    menu = await openMenu(user, "Routes");
    await user.click(within(menu).getByRole("menuitem", { name: "Move up" }));
    await waitFor(() => expect(moves[1]).toEqual({ id: "routes", body: { parentId: null, afterId: null } }));
  });

  it("greys out the direction a page cannot go", async () => {
    const user = userEvent.setup();
    show(small);
    const menu = await openMenu(user, "Kit");
    expect(within(menu).getByRole("menuitem", { name: "Move up" })).toHaveAttribute("aria-disabled", "true");
    expect(within(menu).getByRole("menuitem", { name: "Move down" })).not.toHaveAttribute("aria-disabled");
  });

  it("moves the focused page with Alt and an arrow key, and keeps the focus on it", async () => {
    const user = userEvent.setup();
    show(small);
    act(() => row("Weather").focus());
    await user.keyboard("{Alt>}{ArrowUp}{/Alt}");
    await waitFor(() => expect(moves).toEqual([{ id: "weather", body: { parentId: null, afterId: "kit" } }]));
    expect(focused()).toBe("Weather");
    // Already last: nothing to do.
    await user.keyboard("{Alt>}{ArrowDown}{/Alt}");
    expect(moves).toHaveLength(1);
  });
});
