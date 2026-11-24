/**
 * The first tap on a button far down a screen used to send an iPhone to the top of the page: Safari focuses the
 * screen's own box (`<main tabIndex={-1}>`) rather than a tapped button, and the page was moved to clear that box
 * of the top bar (owner's review, 24 Nov 2026). A tap leaves the page where it is.
 */
import { expect, test } from "./fixtures";

test("a tap on a switch far down Settings leaves the page where it is", async ({ page }) => {
  await page.goto("/settings");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const switches = page.getByRole("main").getByRole("switch");
  await expect(switches.first()).toBeVisible();
  const last = switches.last();
  await last.scrollIntoViewIfNeeded();
  const before = await page.evaluate(() => window.scrollY);
  expect(before).toBeGreaterThan(400);
  await last.tap();
  await page.waitForTimeout(300);
  const after = await page.evaluate(() => window.scrollY);
  expect(Math.abs(after - before)).toBeLessThan(80);
  // Put it back as it was.
  await last.tap();
});
