import { api, expect, test, watchForErrors } from "./fixtures";

test.describe("packs", () => {
  test("adds the radio reference sheets with no connection, and search finds a frequency in them", async ({ page }) => {
    const errors = watchForErrors(page);
    await page.goto("/explore");
    // The main view points at packs; they are also first in the category list.
    await page.getByRole("button", { name: "Packs" }).first().click();
    await expect(page).toHaveURL(/category=packs/);
    const row = page.getByRole("listitem").filter({ has: page.getByRole("heading", { name: "Radio reference sheets" }) });
    await expect(row.getByText(/9 items, nothing to fetch/)).toBeVisible();

    await row.getByRole("button", { name: "Get this pack" }).click();
    const dialog = page.getByRole("dialog", { name: "Radio reference sheets" });
    await expect(dialog.getByText("Included with Outpost").first()).toBeVisible();
    await expect(dialog.getByText(/No connection needed/)).toBeVisible();
    await dialog.getByRole("button", { name: "Add 9 items" }).click();
    await expect(page.getByRole("dialog", { name: /Radio reference sheets: on its way/ })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/9 reference sheets that come with Outpost are now in your library/)).toBeVisible();

    // They are documents now, and their text is read like any other document's.
    await expect
      .poll(
        async () =>
          (await api(page, "GET", "/api/documents?limit=100")).documents.filter(
            (document: { title: string; extraction: string }) =>
              /radio|frequenc|broadcast|repeater|bands/i.test(document.title) && document.extraction === "done",
          ).length,
        { timeout: 30_000 },
      )
      .toBeGreaterThanOrEqual(9);

    // A PMR446 channel frequency leads to the sheet that lists it, as a table.
    await page.goto(`/search?q=${encodeURIComponent("446.00625")}`);
    const hit = page.getByRole("link", { name: /Radio you can use without an amateur licence/ }).first();
    await expect(hit).toBeVisible();
    await hit.click();
    await expect(page.getByRole("heading", { name: "Radio you can use without an amateur licence" }).first()).toBeVisible();
    await expect(page.getByRole("table").first()).toBeVisible();
    await expect(page.getByRole("cell", { name: "446.00625 MHz" }).first()).toBeVisible();

    // Explore shows the pack as complete.
    await page.goto("/explore?category=packs");
    await expect(page.getByText("All 9 already in your library")).toBeVisible();
    expect(errors).toEqual([]);
  });
});
