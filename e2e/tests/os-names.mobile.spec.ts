/**
 * Place names for Great Britain on a phone: added with Great Britain's map through Add a place
 * on Offline maps, with nothing more to choose: Ordnance Survey is asked for its edition on the
 * same press as the map's size (the stand-ins in tools/fake-dist.mjs, serving a small real
 * sample of OS Open Names and a small map), then a village and a postcode found from the
 * map's search.
 */
import { api, expect, test, watchForErrors } from "./fixtures";

const filesPort = Number(process.env.OUTPOST_E2E_FILES_PORT ?? 8473);

test.describe("place names for Great Britain from a phone", () => {
  let tileSource = "";
  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    tileSource = String((await api<{ settings: Record<string, unknown> }>(page, "GET", "/api/settings")).settings["maps.tileSource"] ?? "");
    await api(page, "PATCH", "/api/settings", { "maps.tileSource": `http://127.0.0.1:${filesPort}/maps/20261122.pmtiles` });
    await page.close();
  });
  test.afterAll(async ({ browser }) => {
    // Other specs expect no place names and no map of the United Kingdom; take these away again.
    const page = await browser.newPage();
    await api(page, "PATCH", "/api/settings", { "maps.tileSource": tileSource });
    const { datasets } = await api<{ datasets: Array<{ id: string; source: string }> }>(page, "GET", "/api/maps/places/datasets");
    for (const dataset of datasets.filter((item) => item.source === "os")) {
      await api(page, "DELETE", `/api/maps/places/datasets/${dataset.id}`);
    }
    const { collections } = await api<{ collections: Array<{ id: string; kind: string; title: string }> }>(page, "GET", "/api/collections");
    for (const collection of collections.filter((each) => each.kind === "map" && each.title === "United Kingdom"))
      await api(page, "DELETE", `/api/collections/${collection.id}?deleteFiles=true`);
    await page.close();
  });

  test("installs OS Open Names with Great Britain's map and finds a village and a postcode", async ({ page }) => {
    test.setTimeout(90_000);
    const errors = watchForErrors(page);
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    // Place names come with a country's map, on Offline maps: the older link leads to Add a place.
    await page.goto("/maps/data?names=1&country=GB");
    const dialog = page.getByRole("dialog", { name: "Add a place" });
    await expect(dialog.getByRole("heading", { name: "What for United Kingdom?" })).toBeVisible();
    await expect(dialog.getByRole("checkbox", { name: /^Map/ })).toBeChecked();
    // Hills come from a source the suite does not stand in for: the map alone.
    await dialog.getByText("More choices").tap();
    await dialog.getByRole("checkbox", { name: /Hills and heights/ }).tap();
    await dialog.getByRole("radio", { name: /Roads and towns/ }).tap();
    const check = dialog.getByRole("button", { name: "Check size" });
    expect((await check.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await check.tap();
    await expect(dialog.getByText(/Sizes from .*127\.0\.0\.1/)).toBeVisible({ timeout: 15_000 });
    const download = dialog.getByRole("button", { name: /^Download · / });
    expect((await download.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect(await overflow(), "sideways overflow on Offline maps").toBeLessThanOrEqual(1);
    await download.tap();
    await expect(dialog).toBeHidden();
    await expect
      .poll(
        async () =>
          (await api<{ datasets: Array<{ source: string }> }>(page, "GET", "/api/maps/places/datasets")).datasets.some(
            (dataset) => dataset.source === "os",
          ),
        { timeout: 30_000 },
      )
      .toBe(true);
    // The stand-in's small map came with them; the search below is about the names, so it is taken away again.
    const ukMaps = async () =>
      (await api<{ collections: Array<{ id: string; kind: string; title: string }> }>(page, "GET", "/api/collections")).collections.filter(
        (each) => each.kind === "map" && each.title === "United Kingdom",
      );
    await expect.poll(async () => (await ukMaps()).length, { timeout: 30_000 }).toBeGreaterThan(0);
    for (const map of await ukMaps()) await api(page, "DELETE", `/api/collections/${map.id}?deleteFiles=true`);

    await page.goto("/maps?lat=54.45&lon=-3.0&z=9");
    await page.locator('.outpost-map[data-map-idle="true"]').waitFor({ timeout: 20_000 });
    const search = page.getByLabel("Search the map");
    await search.fill("Grasmere");
    const village = page.getByRole("option", { name: /Grasmere.*Village/ });
    await expect(village).toBeVisible();
    await expect(village).toContainText("Westmorland and Furness, England");
    await expect(page.getByText(/Contains OS data © Crown Copyright and database rights 2026/).last()).toBeVisible();
    await village.tap();
    // The place's card says what it is and where.
    await expect(page.getByText("Village · Westmorland and Furness, England")).toBeVisible();

    // The card of the village has the keyboard once it opens: back to the search box first.
    await search.tap();
    await search.fill("sy233by");
    const postcode = page.getByRole("option", { name: /SY23 3BY/ }).first();
    await expect(postcode).toBeVisible();
    await expect(postcode).toContainText("Postcode · Aberystwyth, Ceredigion, Wales");
    expect(await overflow(), "sideways overflow with the search list open").toBeLessThanOrEqual(1);

    // The map credits Ordnance Survey while the names are installed. On a phone the credits are one line with the
    // rest a press away; here no map region is installed, so Ordnance Survey's is the one in sight.
    const credits = page.locator(".outpost-credits").first();
    await expect(credits).toContainText(/Contains OS data .* · 1 more/, { timeout: 10_000 });
    await credits.getByRole("button", { name: "1 more: show all 2 map credits" }).tap();
    await expect(credits).toContainText(/Contains OS data .* · Natural Earth · Fewer/);
    expect(errors).toEqual([]);
  });
});
