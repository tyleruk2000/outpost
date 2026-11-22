/**
 * Games played from the keyboard alone, with reduced motion asked for, in a real browser: the board is
 * reached with Tab, a move is made with the arrow keys and Enter (or typed), and the move is said in the
 * page's polite live region. Skerry's command line shows a ring while it has the focus.
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
