/**
 * Food and supplies for a whole state, at phone width, through Add a place like all map data:
 * the state found by name once Geofabrik's list of regions is read (from the stand-in), Nearby
 * places with only Food and supplies ticked under Which kinds, the source file's choice said
 * on the main view, the size before the download, the file fetched, read and deleted, and the
 * nearest pharmacy found from what is held.
 */
import { COLUMBUS } from "../../apps/server/test/fixtures/layers/geofabrik-stand-in.ts";
import { api, expect, test, watchForErrors } from "./fixtures";
import { removeReferencePacks } from "./reference-layers";

test.describe("food and supplies for a state on a phone", () => {
  test.afterEach(async ({ page }) => {
    await removeReferencePacks(page);
  });

  test("finds a state by name, ticks only food and supplies, sees the size, fetches it and finds the nearest pharmacy", async ({
    page,
    sealed,
  }) => {
    const errors = watchForErrors(page);
    // The list of regions, as the first Check size reads it: here asked for up front, from the stand-in.
    await api(page, "POST", "/api/reference/regions", {});
    // The older link the Layers tab gave (?get=places) now opens Add a place with Nearby places to tick.
    await page.goto("/maps/data?get=places&layers=food");
    const dialog = page.getByRole("dialog", { name: "Add a place" });
    await dialog.getByLabel("Country, region or town").fill("Ohio");
    await dialog.getByRole("list", { name: "Places found" }).getByRole("button", { name: /^Ohio/ }).tap();
    await expect(dialog.getByRole("heading", { name: "What for Ohio?" })).toBeVisible();

    // Nearby places, and of its kinds only food and supplies, as the link asked.
    await expect(dialog.getByRole("checkbox", { name: /^Nearby places/ })).toBeChecked();
    await expect(dialog.getByRole("checkbox", { name: /^Map/ })).not.toBeChecked();
    await expect(dialog.getByRole("checkbox", { name: /^Routes/ })).not.toBeChecked();
    const kinds = dialog.getByRole("list", { name: "Kinds from OpenStreetMap, read from the source file" });
    await expect(kinds.getByRole("checkbox", { name: "Food and supplies" })).toBeChecked();
    await expect(kinds.getByRole("checkbox", { name: "Hospitals" })).not.toBeChecked();

    // The source file: deleted once read, chosen on the main view (first time both choices, else Change).
    const fileLine = dialog.getByRole("region", { name: "The source file" });
    if (await fileLine.getByRole("button", { name: /^Change/ }).isVisible()) await fileLine.getByRole("button", { name: /^Change/ }).tap();
    await dialog.getByRole("radio", { name: /Delete it after reading/ }).tap();

    // The size and what happens to the file, before anything is downloaded.
    await dialog.getByRole("button", { name: "Check size" }).tap();
    const download = dialog.getByRole("button", { name: /^Download · / });
    await expect(download).toBeVisible({ timeout: 15_000 });
    await expect(dialog.getByText(/ to download$/).locator("xpath=ancestor::p[1]")).toContainText(
      /the source file \(.+\) deleted once read/,
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    await download.tap();

    await expect
      .poll(async () => (await api<{ packs: Array<{ records: number }> }>(page, "GET", "/api/reference/packs")).packs[0]?.records ?? 0, {
        timeout: 30_000,
      })
      .toBeGreaterThan(5);
    // Listed under its country on Offline maps; the row opens to the places and the source file, read and then deleted as chosen.
    const us = page.locator('[data-place="country:US"]');
    await expect(us).toContainText(/Nearby places/);
    await us.getByRole("button", { name: /^United States/ }).tap();
    const detail = us.getByRole("region", { name: /in detail$/ });
    await expect(detail).toContainText(/Ohio.*: nearby places/);
    await expect(detail).toContainText(/read and deleted/);

    await page.goto(`/maps?lat=${COLUMBUS.lat}&lon=${COLUMBUS.lon}&z=14`);
    await page.locator('.outpost-map[data-map-idle="true"]').waitFor({ timeout: 20_000 });

    // The layer on, pharmacies alone, and the nearest from the middle of the map.
    await page.getByRole("tab", { name: "Layers" }).click();
    await page.getByRole("tab", { name: "Layers" }).click();
    await page.getByRole("switch", { name: "Food and supplies" }).click();
    await page
      .getByRole("list", { name: "Kinds of place" })
      .getByRole("button", { name: /Pharmacy/ })
      .click();
    await expect(page.getByRole("heading", { name: "Nearest pharmacy" })).toBeVisible();
    const nearest = page.getByRole("list", { name: "Nearest to the middle of the map" });
    await expect(nearest.getByRole("button").first()).toContainText("High Street Pharmacy (test)");
    await expect(nearest.getByRole("button").first()).toContainText(/1\d\d m/);

    expect(errors).toEqual([]);
    expect(sealed.external).toEqual([]);
  });
});
