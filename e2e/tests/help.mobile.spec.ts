/**
 * Help on a phone: the guides made from docs/, found from Home by the quick search, read
 * with no internet (the fixture fails a test that reaches out), a command read whole, and
 * the browser's print of a guide without the navigation.
 */
import type { Page } from "@playwright/test";
import { expect, test, watchForErrors } from "./fixtures";

test.use({ viewport: { width: 390, height: 844 } });

const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test("from Home, the quick search finds the Raspberry Pi in the deployment guide, and its commands read whole", async ({ page }) => {
  const errors = watchForErrors(page);
  await page.goto("/");
  await expect(page.locator("main h1").first()).toBeVisible();
  await page.getByRole("button", { name: "Quick search" }).click();
  const palette = page.getByRole("dialog", { name: "Search and go to" });
  await palette.getByRole("combobox").fill("raspberry pi");
  const option = palette.getByRole("option", { name: /^Help: Installing and running Outpost › .*Raspberry Pi/ }).first();
  await expect(option).toBeVisible();
  await option.click();

  await expect(page).toHaveURL(/\/help\/deployment#h-[a-z0-9-]*raspberry-pi/);
  const id = decodeURIComponent(new URL(page.url()).hash.slice(1));
  const heading = page.locator(`[id="${id}"]`);
  await expect(heading).toHaveText(/Raspberry Pi/);
  // It lands on the section, at the top of the screen, not at the top of the guide.
  await expect.poll(async () => Math.round((await heading.boundingBox())?.y ?? -1)).toBeGreaterThanOrEqual(0);
  await expect.poll(async () => Math.round((await heading.boundingBox())?.y ?? 9999)).toBeLessThan(300);

  // The first command after it is shown whole: nothing of it is cut off or scrolled out of sight.
  const command = heading.locator("xpath=following::*[contains(concat(' ', normalize-space(@class), ' '), ' guide-code ')][1]");
  await command.scrollIntoViewIfNeeded();
  const pre = command.locator("pre");
  await expect(pre).toContainText(/\S/);
  const fits = await pre.evaluate((element) => ({
    whole: element.scrollWidth <= element.clientWidth + 1,
    right: element.getBoundingClientRect().right,
  }));
  expect(fits.whole).toBe(true);
  expect(fits.right).toBeLessThanOrEqual(390);
  await expect(command.getByRole("button", { name: /^Copy: / })).toBeVisible();
  expect(await overflow(page)).toBeLessThanOrEqual(0);
  expect(errors).toEqual([]);
});

test("Help lists the guides from the More sheet, and a guide links to the next with no connection", async ({ page }) => {
  const errors = watchForErrors(page);
  await page.goto("/");
  await page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: "More" }).click();
  await page.getByRole("dialog", { name: "More" }).getByRole("link", { name: "Help", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Help" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Getting it running" })).toBeVisible();
  expect(await overflow(page)).toBeLessThanOrEqual(0);

  await page.getByRole("link", { name: /^Storage/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Storage" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Help" }).first()).toHaveAttribute("href", "/help");
  await expect(page.getByRole("link", { name: "Open Storage" })).toBeVisible();
  // A table keeps within the screen: it scrolls inside its own box.
  const table = page.locator(".doc-table").first();
  await table.scrollIntoViewIfNeeded();
  expect((await table.boundingBox())!.x + (await table.boundingBox())!.width).toBeLessThanOrEqual(391);
  expect(await overflow(page)).toBeLessThanOrEqual(0);
  expect(errors).toEqual([]);
});

test("the long list of sources has its own contents, folded on a phone", async ({ page }) => {
  const errors = watchForErrors(page);
  await page.goto("/help/sources");
  await expect(page.getByRole("heading", { level: 1, name: "Sources for the catalogue" })).toBeVisible();
  await page.getByText(/^On this page: \d+ parts$/).click();
  const contents = page.getByRole("navigation", { name: "On this page" });
  await contents.getByRole("link", { name: "Mesh radio (read 2026-11-17)" }).click();
  await expect(page).toHaveURL(/#h-mesh-radio-read-2026-11-17$/);
  await expect
    .poll(async () => Math.round((await page.locator("#h-mesh-radio-read-2026-11-17").boundingBox())?.y ?? 9999))
    .toBeLessThan(300);
  expect(await overflow(page)).toBeLessThanOrEqual(0);
  expect(errors).toEqual([]);
});

test("printing a guide leaves out the navigation and the buttons", async ({ page }) => {
  await page.goto("/help/troubleshooting");
  await expect(page.getByRole("heading", { level: 2, name: "Storage" })).toBeVisible();
  await page.emulateMedia({ media: "print" });
  await expect(page.getByRole("navigation", { name: "Main" })).toBeHidden();
  await expect(page.getByRole("heading", { level: 1, name: "Troubleshooting" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Copy: / }).first()).toBeHidden();
  await expect(page.getByRole("heading", { level: 2, name: "Storage" })).toBeVisible();
});
