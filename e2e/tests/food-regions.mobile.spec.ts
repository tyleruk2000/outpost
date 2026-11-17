/**
 * Food and supplies for a whole state, at phone width: Geofabrik's list of regions read on
 * a press from the stand-in, a country and then a state chosen with a thumb, the size and
 * what stays on the device shown before the download, the extract fetched, read and
 * deleted, and the nearest pharmacy found from what is held.
 */
import { COLUMBUS } from "../../apps/server/test/fixtures/layers/geofabrik-stand-in.ts";
import { api, expect, test, watchForErrors } from "./fixtures";
import { removeReferencePacks } from "./reference-layers";

test.describe("food and supplies for a state on a phone", () => {
  test.afterEach(async ({ page }) => {
    await removeReferencePacks(page);
  });

  test("chooses a country and a state, sees the size, fetches it and finds the nearest pharmacy", async ({ page, sealed }) => {
    const errors = watchForErrors(page);
    await page.goto(`/maps?lat=${COLUMBUS.lat}&lon=${COLUMBUS.lon}&z=14`);
    await page.locator('.outpost-map[data-map-idle="true"]').waitFor({ timeout: 20_000 });

    await page.getByRole("tab", { name: "Offline maps" }).click();
    const section = page.getByRole("region", { name: "Reference data for the map" });
    await section.scrollIntoViewIfNeeded();
    await section.getByRole("button", { name: "Get reference data" }).click();
    const dialog = page.getByRole("dialog", { name: "Get reference data" });

    // The source, from the drop-down inside the dialog.
    await dialog.getByRole("combobox", { name: "Source" }).click();
    await page.getByRole("option", { name: "OpenStreetMap, from a Geofabrik extract" }).click();
    await dialog.getByRole("radio", { name: "A state or region, by name" }).check();
    await dialog.getByRole("button", { name: "Read the list of regions" }).click();

    // A country, then its state.
    await dialog.getByRole("list", { name: "Countries" }).getByRole("button", { name: /United States of America/ }).click();
    const states = dialog.getByRole("list", { name: "United States of America and its parts" });
    await states.getByText("Ohio", { exact: true }).click();
    await expect(dialog.getByRole("list", { name: "Chosen" })).toContainText("Ohio: OpenStreetMap only");
    await dialog.getByRole("checkbox", { name: "Food and supplies" }).check();
    await expect(dialog.getByText(/One download serves every layer/)).toBeVisible();

    // The size and what stays, before anything is downloaded.
    await dialog.getByRole("button", { name: "Show the size" }).click();
    await expect(dialog.getByText(/^1 file to download, 191 kB/)).toBeVisible({ timeout: 15_000 });
    await expect(dialog.getByText(/Afterwards on this device: only the places read/)).toBeVisible();
    await expect(dialog.getByRole("checkbox", { name: "Keep the downloaded file too" })).not.toBeChecked();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    await dialog.getByRole("button", { name: "Download" }).click();

    await expect
      .poll(async () => (await api<{ packs: Array<{ records: number }> }>(page, "GET", "/api/reference/packs")).packs[0]?.records ?? 0, {
        timeout: 30_000,
      })
      .toBeGreaterThan(5);
    await page.keyboard.press("Escape");
    await expect(section.getByRole("heading", { name: /OpenStreetMap: Ohio/ })).toBeVisible();
    await expect(section.getByText(/Only the places were kept/)).toBeVisible();

    // The layer on, pharmacies alone, and the nearest from the middle of the map.
    await page.getByRole("tab", { name: "Layers" }).click();
    await page.getByRole("tab", { name: "Layers" }).click();
    await page.getByRole("switch", { name: "Food and supplies" }).click();
    await page.getByRole("list", { name: "Kinds of place" }).getByRole("button", { name: /Pharmacy/ }).click();
    await expect(page.getByRole("heading", { name: "Nearest pharmacy" })).toBeVisible();
    const nearest = page.getByRole("list", { name: "Nearest to the middle of the map" });
    await expect(nearest.getByRole("button").first()).toContainText("High Street Pharmacy (test)");
    await expect(nearest.getByRole("button").first()).toContainText(/1\d\d m/);

    expect(errors).toEqual([]);
    expect(sealed.external).toEqual([]);
  });
});
