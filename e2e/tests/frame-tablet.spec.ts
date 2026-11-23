/**
 * The app's frame on a tablet and what it shares with every screen: the sidebar as a rail that opens over the page,
 * room left for the map, controls a finger can press, quick search's first rows, and Back returning to where a
 * screen was left.
 */
import { expect, test, watchForErrors } from "./fixtures";

test.describe("the frame on a tablet held upright", () => {
  test.use({ viewport: { width: 768, height: 1024 }, hasTouch: true });

  test("has a rail of icons that opens over the page and closes with Escape, leaving the map room", async ({ page }) => {
    const errors = watchForErrors(page);
    await page.goto("/maps");
    const sidebar = page.getByRole("complementary", { name: "Main" });
    const rail = await sidebar.boundingBox();
    expect(rail?.width).toBe(60);
    // The map has the room the full sidebar took: it was 160 px wide here beside it.
    const map = await page.locator(".maplibregl-canvas").first().boundingBox();
    expect(map?.width ?? 0).toBeGreaterThan(300);

    await sidebar.getByRole("button", { name: "Expand sidebar" }).click();
    await expect(sidebar.getByRole("link", { name: "Library", exact: true })).toBeVisible();
    // Over the page, not beside it: the map is as wide as it was.
    expect((await page.locator(".maplibregl-canvas").first().boundingBox())?.width).toBe(map?.width);
    await page.keyboard.press("Escape");
    await expect(sidebar.getByRole("button", { name: "Expand sidebar" })).toBeFocused();

    // Opened again, it closes on the way to another screen.
    await sidebar.getByRole("button", { name: "Expand sidebar" }).click();
    await sidebar.getByRole("link", { name: "Settings", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
    await expect(sidebar.getByRole("button", { name: "Expand sidebar" })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("gives a finger 44 px for the shared controls, though the screen is wider than a phone", async ({ page }) => {
    await page.goto("/settings");
    const theme = page.getByRole("radio", { name: "Dark" });
    await expect(theme).toBeVisible();
    expect((await theme.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    await page.goto("/library");
    const add = page.getByRole("button", { name: "Add documents" }).first();
    await expect(add).toBeVisible();
    expect((await add.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  });
});

test.describe("on any screen", () => {
  test("quick search offers what people come to do first, with nothing typed", async ({ page }) => {
    await page.goto("/library");
    await expect(page.getByRole("heading", { level: 1, name: "Library" })).toBeVisible();
    await page.getByRole("complementary", { name: "Main" }).getByRole("button", { name: "Quick search" }).click();
    const options = page.getByRole("dialog", { name: "Search and go to" }).getByRole("option");
    await expect(options.first()).toHaveText("Add documents");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/library/);
  });

  test("Back returns to where a screen was left, and a new screen opens at its top", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 600 });
    // Settings shows every section at once: a long screen.
    await page.goto("/settings");
    await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
    await page.mouse.move(800, 300);
    await page.mouse.wheel(0, 1500);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(1000);
    const left = await page.evaluate(() => window.scrollY);
    await page.getByRole("complementary", { name: "Main" }).getByRole("link", { name: "Help", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Help" })).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    await page.goBack();
    await expect(page).toHaveURL(/\/settings$/);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(left - 5);
  });
});
