/**
 * Games played from the keyboard alone, with reduced motion asked for, in a real browser: the board is
 * reached with Tab, a move is made with the arrow keys and Enter (or typed), and the move is said in the
 * page's polite live region. Skerry's command line shows a ring while it has the focus. The Steading's
 * map is moved over and zoomed with the keys, and zoomed right out is one stop rather than every square.
 */
import type { Page } from "@playwright/test";
import { api, expect, test, watchForErrors } from "./fixtures";

/** Presses Tab until the focus is on something matching the test, or gives up. */
async function tabTo(page: Page, matches: (el: { label: string; role: string }) => boolean, most = 60): Promise<void> {
  for (let index = 0; index < most; index++) {
    await page.keyboard.press("Tab");
    const el = await page.evaluate(() => ({
      label: document.activeElement?.getAttribute("aria-label") ?? "",
      role: document.activeElement?.getAttribute("role") ?? document.activeElement?.tagName.toLowerCase() ?? "",
    }));
    if (matches(el)) return;
  }
  throw new Error("not reached with Tab");
}

const spoken = (page: Page) => page.locator("main p[aria-live=polite].sr-only, main [aria-live=polite].sr-only").first();

test.describe("games from the keyboard", () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
  });

  test("chess: e2 to e4 with the arrow keys and Enter, said aloud", async ({ page }) => {
    const errors = watchForErrors(page);
    await page.goto("/games/chess");
    // A fresh game, whatever another test left kept on the server.
    await api(page, "DELETE", "/api/games/chess");
    await page.reload();
    await expect(page.locator('[aria-label^="e2, your pawn"]')).toBeVisible();
    // The board is one stop on the way with Tab; the arrow keys move within it.
    await tabTo(page, ({ label }) => /^[a-h][1-8],/.test(label));
    await page.locator('[aria-label^="e2, your pawn"]').focus();
    await page.keyboard.press("Enter");
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("ArrowUp");
    await expect(page.locator(":focus")).toHaveAttribute("aria-label", /^e4, empty, you can move here/);
    await page.keyboard.press("Enter");
    await expect(page.locator('[aria-label^="e4, your pawn"]')).toBeVisible();
    await expect(spoken(page)).not.toBeEmpty();
    expect(errors).toEqual([]);
  });

  test("snake: started and paused from the keyboard, each said aloud", async ({ page }) => {
    const errors = watchForErrors(page);
    await page.goto("/games/snake");
    await expect(page.getByRole("heading", { level: 1, name: "Snake" })).toBeVisible();
    const said = page.locator("main [aria-live=polite]");
    await page.keyboard.press("ArrowUp");
    await expect(said.filter({ hasText: /^Go\.$/ })).toHaveCount(1);
    await page.keyboard.press("p");
    await expect(said.filter({ hasText: /^Paused\.$/ })).toHaveCount(1);
    expect(errors).toEqual([]);
  });

  test("skerry: the command line is typed into and shows a ring while it has the focus", async ({ page }) => {
    const errors = watchForErrors(page);
    await page.goto("/games/skerry");
    const line = page.getByRole("textbox", { name: /^Command, in / });
    await line.focus();
    await page.keyboard.type("ls");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("log", { name: "Terminal" })).toContainText("ls");
    // A visible focus mark on the form around the line, at least 2 px wide.
    const ring = await line.evaluate((el) => {
      const style = getComputedStyle(el.closest("form")!);
      return { style: style.outlineStyle, width: Number.parseFloat(style.outlineWidth) };
    });
    expect(ring.style).not.toBe("none");
    expect(ring.width).toBeGreaterThanOrEqual(2);
    expect(errors).toEqual([]);
  });

  test("steading: a square chosen with the arrow keys and Enter; zoomed out, the whole map is one stop", async ({ page }) => {
    const errors = watchForErrors(page);
    await page.goto("/games/steading");
    await api(page, "DELETE", "/api/games/steading");
    await page.reload();
    await page.getByRole("textbox", { name: "Seed" }).fill("outpost-tests-1");
    await page.getByRole("button", { name: "Found the settlement" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByText("outpost-tests-1", { exact: true })).toBeVisible();
    // The plan is one stop with Tab, on the storehouse; the arrow keys move within it.
    await tabTo(page, ({ label }) => /^Column \d+, row \d+, Storehouse/.test(label));
    await page.keyboard.press("ArrowRight");
    await expect(page.locator(":focus")).toHaveAttribute("aria-label", /^Column \d+, row \d+, /);
    await page.keyboard.press("Enter");
    await expect(
      page
        .locator("main")
        .getByText(/^Column \d+, row \d+$/)
        .first(),
    ).toBeVisible();
    // Zoomed right out with −, the focus is on the whole map, one button; + is back on a square.
    for (let index = 0; index < 8; index++) {
      await page.keyboard.press("-");
      if (/zoomed out too far/.test((await page.locator(":focus").getAttribute("aria-label")) ?? "")) break;
    }
    await expect(page.locator(":focus")).toHaveAttribute(
      "aria-label",
      /^The land, 48 squares by 48, zoomed out too far to choose a square/,
    );
    await expect(page.getByRole("group", { name: /^The land, 48 squares by 48/ })).toHaveCount(0);
    await page.keyboard.press("+");
    await expect(page.locator(":focus")).toHaveAttribute("aria-label", /^Column \d+, row \d+, /);
    await api(page, "DELETE", "/api/games/steading");
    expect(errors).toEqual([]);
  });

  test("allotment: a bed reached with Tab and opened with Enter", async ({ page }) => {
    const errors = watchForErrors(page);
    await page.goto("/games/allotment");
    await expect(page.getByRole("heading", { level: 1, name: "Allotment" })).toBeVisible();
    await tabTo(page, ({ label }) => /^Bed 1\b/.test(label));
    await page.keyboard.press("Enter");
    await expect(page.locator(":focus")).toBeVisible();
    expect(errors).toEqual([]);
  });
});
