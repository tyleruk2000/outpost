/**
 * Map data: reached from the Offline tab's link, a small country added in a few presses
 * (roads for routes and places to find, its country file kept), the sizes asked of the
 * suite's Geofabrik stand-in on one press, and the country file then listed as kept with
 * the roads ready. Nothing reaches the internet.
 */
import { api, expect, test, watchForErrors } from "./fixtures";
import { removeReferencePacks } from "./reference-layers";

async function tidy(page: import("@playwright/test").Page) {
  for (const network of (await api<{ networks: Array<{ id: string }> }>(page, "GET", "/api/roads/networks")).networks)
    await api(page, "DELETE", `/api/roads/networks/${network.id}`);
  await removeReferencePacks(page);
  const { collections } = await api<{ collections: Array<{ id: string; kind: string }> }>(page, "GET", "/api/collections");
  for (const collection of collections.filter((each) => each.kind === "extract"))
    await api(page, "DELETE", `/api/collections/${collection.id}?deleteFiles=true`);
}

test.describe("Map data", () => {
  test.afterEach(async ({ page }) => {
    await tidy(page);
  });

  test("is one press from the Offline tab", async ({ page }) => {
    await page.goto("/maps?tab=offline");
    const link = page.getByRole("link", { name: /All map data/ });
    await expect(link).toBeVisible();
    // What needs the map stays: what covers the view, drawing an area, satellite pictures, keeping the view.
    await expect(page.getByRole("region", { name: "What covers this view" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Add an area by drawing" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Satellite imagery" })).toBeAttached();
    // What moved is not here twice.
    await expect(page.getByRole("region", { name: "Reference data for the map" })).toHaveCount(0);
    await link.click();
    await expect(page.getByRole("heading", { name: "Map data", level: 1 })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Parts of this screen" })).toContainText("Country files");
  });

  test("adds roads and places for a country, keeps its country file, and lists it as kept with the roads ready", async ({
    page,
    sealed,
  }) => {
    test.setTimeout(90_000);
    const errors = watchForErrors(page);
    await page.goto("/maps/data");
    await page.getByRole("button", { name: "Add map data", exact: true }).first().click();
    const dialog = page.getByRole("dialog", { name: "Add map data" });
    // The home country may be chosen already: another place, then.
    const another = dialog.getByRole("button", { name: "Another place" });
    if (await another.isVisible()) await another.click();
    await dialog.getByRole("searchbox", { name: "Find a country or region" }).fill("Monaco");
    await dialog
      .getByRole("list", { name: "Places found" })
      .getByRole("button", { name: /^Monaco/ })
      .click();
    await expect(dialog.getByRole("heading", { name: "What do you want for Monaco?" })).toBeVisible();
    for (const kind of ["Map to look at", "Hills and heights", "Place names"]) {
      const box = dialog.getByRole("checkbox", { name: new RegExp(kind) });
      if ((await box.isEnabled()) && (await box.isChecked())) await box.click();
    }
    await dialog.getByRole("checkbox", { name: /Roads for routes/ }).click();
    await dialog.getByRole("checkbox", { name: /Places to find/ }).click();
    await expect(dialog.getByText(/Geofabrik \(download\.geofabrik\.de\) is asked how large it is/)).toBeVisible();
    await dialog.getByRole("button", { name: "Check sizes" }).click();
    await expect(dialog.getByText(/^About .+ to download/)).toBeVisible({ timeout: 15_000 });

    const choice = dialog.getByRole("radiogroup", { name: "The country file afterwards" });
    await choice.getByRole("radio", { name: /Keep it\./ }).click();
    await expect(dialog.getByRole("radiogroup", { name: "Where to keep the file" }).getByRole("radio", { checked: true })).toHaveCount(1);
    await dialog.getByRole("button", { name: "Download" }).click();
    await expect(dialog).toBeHidden();

    // The roads are ready, the file is kept, and both say so.
    const monaco = page.getByRole("list", { name: "Map data for Monaco" });
    const row = (name: string) => monaco.getByRole("heading", { name }).locator("xpath=..");
    await expect(row("Roads for routes")).toContainText(/roads from \d+ Nov 2026/, { timeout: 60_000 });
    await expect(row("Places to find")).toContainText(/places/);
    await expect(row("Country file")).toContainText(/from 21 Nov 2026/);
    await expect(page.getByRole("list", { name: "Kept country files" })).toContainText("Monaco");
    const networks = (await api<{ networks: Array<{ regionId: string; extract: { kept: boolean } }> }>(page, "GET", "/api/roads/networks"))
      .networks;
    expect(networks).toEqual([expect.objectContaining({ regionId: "monaco", extract: expect.objectContaining({ kept: true }) })]);

    // Remembered: the next time, keeping it is chosen already.
    await page.getByRole("button", { name: "Add map data", exact: true }).first().click();
    if (await another.isVisible()) await another.click();
    await dialog.getByRole("searchbox", { name: "Find a country or region" }).fill("Luxembourg");
    await dialog
      .getByRole("list", { name: "Places found" })
      .getByRole("button", { name: /^Luxembourg/ })
      .click();
    await dialog.getByRole("checkbox", { name: /Roads for routes/ }).click();
    await expect(dialog.getByRole("radio", { name: /Keep it\./ })).toBeChecked();
    await page.keyboard.press("Escape");
    expect(errors).toEqual([]);
    expect(sealed.external).toEqual([]);
  });
});
