/**
 * The data screens on a phone: the touch targets the usability and accessibility study found under 44 px.
 */
import type { Locator } from "@playwright/test";
import { expect, test } from "./fixtures";

async function size(target: Locator) {
  await target.scrollIntoViewIfNeeded();
  return (await target.boundingBox())!;
}

test("the tabs of Manage and clean up, and the links beside headings, are a finger's width", async ({ page }) => {
  await page.goto("/storage/manage");
  for (const tab of await page.getByRole("tab").all()) {
    const box = await size(tab);
    expect(Math.min(box.width, box.height), (await tab.textContent()) ?? "a tab").toBeGreaterThanOrEqual(44);
  }

  await page.goto("/storage");
  expect((await size(page.getByRole("link", { name: "Free up space" }))).height).toBeGreaterThanOrEqual(44);

  await page.goto("/explore");
  expect((await size(page.getByRole("link", { name: "Manage what is downloaded" }))).height).toBeGreaterThanOrEqual(44);
});

test("the button that shows a backup passphrase is a finger's width", async ({ page }) => {
  await page.goto("/settings#backup");
  await page.getByRole("button", { name: "Set a passphrase" }).click();
  const show = page.getByRole("dialog").getByRole("button", { name: "Show passphrase" }).first();
  const box = await size(show);
  expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(44);
});
