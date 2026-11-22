/**
 * Place names for Great Britain on a phone: checked, downloaded and installed from the
 * stand-in for Ordnance Survey's Downloads API (tools/fake-dist.mjs, serving a small real
 * sample of OS Open Names), then a village and a postcode found from the map's search.
 */
import { api, expect, test, watchForErrors } from "./fixtures";

test.describe("place names for Great Britain from a phone", () => {
  test.afterAll(async ({ browser }) => {
    // Other specs expect no place names; take these away again.
    const page = await browser.newPage();
    const { datasets } = await api<{ datasets: Array<{ id: string; source: string }> }>(page, "GET", "/api/maps/places/datasets");
    for (const dataset of datasets.filter((item) => item.source === "os")) {
      await api(page, "DELETE", `/api/maps/places/datasets/${dataset.id}`);
    }
    await page.close();
  });

  test("installs OS Open Names and finds a village and a postcode", async ({ page }) => {
    test.setTimeout(90_000);
    const errors = watchForErrors(page);
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    await page.goto("/maps?lat=54.45&lon=-3.0&z=9");
    await page.getByRole("tab", { name: "Offline maps" }).click();

    const section = page.getByRole("region", { name: "Place names for Great Britain" });
    await section.scrollIntoViewIfNeeded();
    await expect(section.getByText(/Northern Ireland, the Isle of Man and the Channel Islands are not covered/)).toBeVisible();
    const check = section.getByRole("button", { name: "Check the size" });
    expect((await check.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await check.tap();
    await expect(section.getByText(/October 2026 edition, a [\d.]+ kB download from 127\.0\.0\.1/)).toBeVisible();
    const download = section.getByRole("button", { name: /^Download [\d.]+ kB$/ });
    expect((await download.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect(await overflow(), "sideways overflow in the Offline tab").toBeLessThanOrEqual(1);
    await download.tap();
    await expect(section.getByText("OS Open Names, October 2026 edition")).toBeVisible({ timeout: 30_000 });
    await expect(section.getByText(/Contains OS data © Crown Copyright and database rights 2026/)).toBeVisible();

    const search = page.getByLabel("Search the map");
    await search.fill("Grasmere");
    const village = page.getByRole("option", { name: /Grasmere.*Village/ });
    await expect(village).toBeVisible();
    await expect(village).toContainText("Westmorland and Furness, England");
    await expect(page.getByText(/Contains OS data © Crown Copyright and database rights 2026/).last()).toBeVisible();
    await village.tap();
    // The place's card says what it is and where.
    await expect(page.getByText("Village · Westmorland and Furness, England")).toBeVisible();

    await search.fill("sy233by");
    const postcode = page.getByRole("option", { name: /SY23 3BY/ }).first();
    await expect(postcode).toBeVisible();
    await expect(postcode).toContainText("Postcode · Aberystwyth, Ceredigion, Wales");
    expect(await overflow(), "sideways overflow with the search list open").toBeLessThanOrEqual(1);

    // The map credits Ordnance Survey while the names are installed. On a phone the credits are one line with the
    // rest a press away; here no map region is installed, so Ordnance Survey's is the one in sight.
    const credits = page.locator(".outpost-credits").first();
    await expect(credits).toContainText(/Contains OS data .* · 1 more/, { timeout: 10_000 });
    await credits.getByRole("button", { name: "1 more map credit: show all 2" }).tap();
    await expect(credits).toContainText(/Contains OS data .* · Natural Earth · Fewer/);
    expect(errors).toEqual([]);
  });
});
