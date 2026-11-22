/**
 * The data screens (Storage, Manage and clean up, Settings' backups) from the keyboard, with the app's largest
 * text, and with a drive that is almost full: what the usability and accessibility study of them found and fixed.
 */
import type { Page } from "@playwright/test";
import { expect, test, watchForErrors } from "./fixtures";

/** How far the page reaches past the right of the screen; 0 when it does not scroll sideways. */
const sideways = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test("a location that is almost full says so in words, with where to free space", async ({ page }) => {
  const errors = watchForErrors(page);
  await page.route("**/api/storage/locations", async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    const response = await route.fetch();
    const body = await response.json();
    for (const location of body.locations) location.freeBytes = 12_000_000;
    await route.fulfill({ response, json: body });
  });
  await page.goto("/storage");
  const internal = page.getByRole("listitem").filter({ has: page.getByRole("heading", { name: "Internal storage" }) });
  const notice = internal.getByRole("status").filter({ hasText: "Almost full" });
  await expect(notice).toContainText("Only 12.0 MB is left here.");
  await expect(notice.getByRole("link", { name: "Free up space" })).toHaveAttribute("href", /\/storage\/manage/);
  expect(errors).toEqual([]);
});

test("the Storage and Settings dialogs open from the keyboard, close with Escape, and give focus back", async ({ page }) => {
  const errors = watchForErrors(page);
  await page.goto("/storage");
  for (const name of ["Add location", "Connect a network share", "Make a portable drive"]) {
    const opener = page.getByRole("button", { name, exact: true }).first();
    await opener.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog");
    await expect(dialog, name).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog, name).toHaveCount(0);
    await expect(opener, `focus goes back to ${name}`).toBeFocused();
  }

  await page.goto("/settings#backup");
  for (const name of ["Set a passphrase", "Set a PIN"]) {
    const opener = page.getByRole("button", { name, exact: true });
    await opener.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog");
    await expect(dialog, name).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog, name).toHaveCount(0);
    await expect(opener, `focus goes back to ${name}`).toBeFocused();
  }
  expect(errors).toEqual([]);
});

test.describe("with the app's largest text", () => {
  test.use({ viewport: { width: 1280, height: 800 } });
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("outpost.textSize", "largest"));
  });

  test("Clean up puts what each step removes and keeps side by side only where each gets 18rem, and stacks them otherwise", async ({
    page,
  }) => {
    // The rule follows the room the box holding them actually has, not how wide the sidebar happens to be.
    await page.goto("/storage/manage?view=clean-up");
    const step = page.getByRole("region", { name: "Remove all downloaded content" });
    await expect(step.getByRole("heading", { name: "Keeps" })).toBeVisible();
    expect(await sideways(page)).toBe(0);
    const room = await step.evaluate((section) => {
      const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
      const box = section.querySelector("h3")!.parentElement!.parentElement!.parentElement as HTMLElement;
      return box.getBoundingClientRect().width / rem;
    });
    const removes = (await step.getByRole("heading", { name: "Removes" }).boundingBox())!;
    const keeps = (await step.getByRole("heading", { name: "Keeps" }).boundingBox())!;
    if (room < 38) expect(keeps.y).toBeGreaterThan(removes.y + removes.height);
    else expect(keeps.y).toBeCloseTo(removes.y, 0);
  });

  test("Bring back changes puts the record of earlier merges below, and the filters of Installed wrap, within the screen", async ({
    page,
  }) => {
    await page.goto("/storage/merge");
    await expect(page.getByRole("heading", { name: "Earlier merges" })).toBeVisible();
    expect(await sideways(page)).toBe(0);
    // One item, so that the filters are shown.
    await page.route("**/api/manage/items", (route) =>
      route.fulfill({
        json: {
          items: [
            {
              key: "document:d1",
              type: "document",
              id: "d1",
              title: "Field manual",
              kind: "document",
              origin: "own",
              sizeBytes: 300_000,
              addedAt: Date.now(),
              locationId: "internal",
              locationName: "Internal storage",
              locationAvailable: true,
              relPath: "documents/field-manual.pdf",
              inOutpostFolder: true,
              state: "ok",
              busyReason: null,
              documents: [],
              catalogEntryId: null,
              href: "/library/documents/d1",
            },
          ],
        },
      }),
    );
    await page.goto("/storage/manage?view=installed");
    await expect(page.getByRole("combobox", { name: "Sort" })).toBeVisible();
    expect(await sideways(page)).toBe(0);
  });
});

test("a row's tick box can be ticked anywhere in its square, not only on the box drawn in it", async ({ page }) => {
  await page.route("**/api/manage/leftovers", (route) =>
    route.fulfill({
      json: {
        items: [
          {
            id: "l1",
            kind: "download",
            title: "Half a map",
            detail: "Stopped at 40%",
            bytes: 1_000_000,
            count: null,
            locationName: "Internal storage",
            href: null,
            what: null,
          },
        ],
        more: {},
        measuredAt: Date.now(),
        measuring: false,
      },
    }),
  );
  await page.goto("/storage/manage?view=leftovers");
  const box = page.getByRole("checkbox", { name: "Select Half a map" });
  const square = page.locator(`label[for="${await box.getAttribute("id")}"]`);
  expect((await square.boundingBox())!.width).toBeGreaterThanOrEqual(24);
  await square.click({ position: { x: 2, y: 2 } });
  await expect(box).toBeChecked();
});

test("a menu on a short window scrolls instead of running off the edge", async ({ page }) => {
  await page.setViewportSize({ width: 640, height: 300 });
  await page.goto("/storage");
  await page.getByRole("button", { name: /^Actions for Internal storage/ }).click();
  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible();
  const box = (await menu.boundingBox())!;
  expect(box.y + box.height).toBeLessThanOrEqual(300);
  const last = menu.getByRole("menuitem").last();
  await last.scrollIntoViewIfNeeded();
  await expect(last).toBeInViewport();
});
