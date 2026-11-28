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
  // Settings filled in first. Its sections above (backups, updates, radios…) load on their own, and in a full run, with
  // the server holding every earlier test's data, they were still loading when the place was measured: the page grew
  // by some 2,400 px above the switch, WebKit (which does not anchor the scroll) left the switch below the window, and
  // the tap scrolled to it, which read as the page jumping. Alone, they had loaded by then.
  await expect(page.locator("[aria-busy='true']")).toHaveCount(0);
  await expect
    .poll(async () => {
      const height = () => page.evaluate(() => document.documentElement.scrollHeight);
      const first = await height();
      await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
      return first === (await height());
    })
    .toBe(true);
  const name = await switches.last().getAttribute("aria-label");
  const last = name ? page.getByRole("main").getByRole("switch", { name, exact: true }) : switches.last();
  await last.scrollIntoViewIfNeeded();
  const before = await page.evaluate(() => window.scrollY);
  expect(before).toBeGreaterThan(400);
  const was = await last.getAttribute("aria-checked");
  await last.tap();
  // Saved (the switch has turned and is pressable again) and drawn after it: any jump would have happened by now.
  await expect(last).not.toHaveAttribute("aria-checked", was ?? "");
  await expect(last).toBeEnabled();
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
  const after = await page.evaluate(() => window.scrollY);
  expect(Math.abs(after - before)).toBeLessThan(80);
  // Put it back as it was: the same switch, by its name.
  await last.tap();
  await expect(last).toHaveAttribute("aria-checked", was ?? "");
});
