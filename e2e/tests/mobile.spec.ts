import { expect, test, watchForErrors } from "./fixtures";

test.describe("on a phone", () => {
  test("uses the bottom bar and the More sheet instead of the sidebar", async ({ page }) => {
    const errors = watchForErrors(page);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Your library" })).toBeVisible();
    await expect(page.getByRole("complementary", { name: "Main" })).toBeHidden();

    const bar = page.getByRole("navigation", { name: "Main" });
    await expect(bar).toBeVisible();
    await bar.getByRole("button", { name: "More" }).click();
    await page.getByRole("link", { name: "Storage" }).click();
    await expect(page.getByRole("heading", { name: "Storage", level: 1 })).toBeVisible();

    // Nothing spills sideways at phone width.
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);

    await page.getByRole("button", { name: "Search everything" }).click();
    await expect(page.getByRole("dialog", { name: "Search and go to" })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("gives controls a comfortable touch size", async ({ page }) => {
    await page.goto("/storage");
    const button = page.getByRole("button", { name: "Add location" });
    const box = await button.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
  });
});
