import { expect, test, watchForErrors } from "./fixtures";

/** The database on the Storage screen at phone width: what is in it, a check, and nothing spilling sideways. */
test.describe("the database on a phone", () => {
  test("shows where the database is and what is in it, and checks it", async ({ page }) => {
    const errors = watchForErrors(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/storage");
    const section = page.locator("section", { has: page.getByRole("heading", { name: "Database", exact: true }) });
    await section.scrollIntoViewIfNeeded();
    await expect(section.getByText(/outpost\.db$/)).toBeVisible();
    // Worked out on a connection of its own, the first time anyone looks.
    await expect(section.getByText(/by reading every part of the .* file\. The parts add up to the file exactly\./)).toBeVisible({
      timeout: 20_000,
    });
    await expect(section.getByRole("table", { name: "Where the bytes of the database go" })).toBeVisible();
    await expect(section.getByText(/Up to date: all \d+ changes to its layout/)).toBeVisible();
    // The database's own terms are kept for those who want them, behind a disclosure.
    await expect(section.getByText(/measured with SQLite's dbstat table/)).toBeHidden();
    await section.getByText("Technical details").click();
    await expect(section.getByText(/measured with SQLite's dbstat table, page by page/)).toBeVisible();

    const check = section.getByRole("button", { name: "Check the database" });
    const box = await check.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    await check.click();
    await expect(section.getByText(/No problems found by the quick check just now/)).toBeVisible({ timeout: 20_000 });

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    expect(errors).toEqual([]);
  });
});
