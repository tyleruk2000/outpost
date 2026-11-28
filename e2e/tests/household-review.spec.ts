/**
 * The household-and-upkeep review's fixes (24 Nov 2026), with a keyboard on a desktop: a choice saved from a drop-down
 * in Settings keeps the keyboard's place, Add a person puts the focus in the new person's name, and each step of the
 * household book starts at its heading.
 */

import { api, expect, test, watchForErrors } from "./fixtures";
import { backToOneHousehold } from "./households";

const activeName = (page: import("@playwright/test").Page) =>
  page.evaluate(() => {
    const active = document.activeElement as HTMLElement | null;
    if (!active || active === document.body) return "BODY";
    return (active.getAttribute("aria-label") ?? active.textContent ?? "").trim();
  });

test.describe("Settings drop-downs keep the focus", () => {
  test.afterAll(async ({ request }) => {
    const headers = { "X-Outpost-Request": "1", "Content-Type": "application/json" };
    await request.patch("/api/backup/schedule", { headers, data: JSON.stringify({ locationId: null, frequency: "daily" }) });
    await request.patch("/api/settings", { headers, data: JSON.stringify({ "board.fileDays": 7 }) });
  });

  test("Day of the week and Keep files sent on the board, chosen by keyboard, leave the focus on themselves", async ({ page }) => {
    const errors = watchForErrors(page);
    await page.goto("/");
    const { locations } = await api<{ locations: Array<{ id: string }> }>(page, "GET", "/api/storage/locations");
    await api(page, "PATCH", "/api/backup/schedule", { locationId: locations[0]!.id, frequency: "weekly" });
    await page.goto("/settings");

    for (const name of ["Day of the week", "Keep files sent on the board"]) {
      const select = page.getByRole("combobox", { name });
      await select.focus();
      const before = await select.textContent();
      await page.keyboard.press("Enter");
      await expect(page.getByRole("listbox")).toBeVisible();
      // The list puts the focus on the chosen day a moment after it opens.
      await expect(page.getByRole("option", { name: before ?? "" })).toBeFocused();
      await page.keyboard.press("ArrowUp");
      await expect(page.getByRole("option", { name: before ?? "" })).not.toBeFocused();
      await page.keyboard.press("Enter");
      await expect(page.getByRole("listbox")).toHaveCount(0);
      await expect(select).not.toHaveText(before ?? "");
      // Saved, and the focus where it was: before, the drop-down was disabled while it saved and the focus fell to the page.
      await page.waitForTimeout(600);
      await expect(select).toBeFocused();
      expect(await activeName(page)).not.toBe("BODY");
    }
    expect(errors).toEqual([]);
  });
});

test.describe("Household people and the book, by keyboard", () => {
  test.afterEach(async ({ page }) => {
    await backToOneHousehold(page);
  });

  test("Add a person puts the focus in the new person's name, in view, and says so", async ({ page }) => {
    const errors = watchForErrors(page);
    await page.goto("/");
    const { households } = await api<{ households: Array<{ id: string }> }>(page, "GET", "/api/households");
    await page.goto(`/prepare/households/${households[0]!.id}`);
    const add = page.getByRole("button", { name: "Add a person" });
    await add.focus();
    await page.keyboard.press("Enter");
    const names = page.getByRole("textbox", { name: /^Name/ });
    await expect(names.last()).toBeFocused();
    await expect(names.last()).toBeInViewport();
    await expect(page.getByRole("status").filter({ hasText: /^Person \d+ added\. Type a name\.$/ })).toHaveCount(1);
    await page.keyboard.type("E2E Ann");
    await expect(names.last()).toHaveValue("E2E Ann");
    expect(errors).toEqual([]);
  });

  test("each step of the household book starts at its heading, which has the focus", async ({ page }) => {
    const errors = watchForErrors(page);
    await page.setViewportSize({ width: 1360, height: 620 });
    await page.goto("/prepare/book");
    await page.getByRole("button", { name: /^(Start the questions|Change the answers)$/ }).click();
    await expect(page.getByText(/^Step 1 of \d+: /)).toBeVisible();
    await page.mouse.wheel(0, 4000);
    // The wheel only starts the scroll: it often lands after mouse.wheel has returned. Landing after the step below
    // had put its heading in view, it scrolled the heading out again (flaky on a loaded machine).
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    await page.getByRole("button", { name: /^Save and go on/ }).focus();
    await page.keyboard.press("Enter");
    const heading = page.getByRole("heading", { name: /^Step 2 of \d+: / });
    await expect(heading).toBeFocused();
    await expect(heading).toBeInViewport();
    // Save and stop here is under the bar, not in it.
    await expect(page.locator("[data-save-bar]").getByRole("button", { name: "Save and stop here" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Save and stop here" })).toHaveCount(1);
    expect(errors).toEqual([]);
  });
});
