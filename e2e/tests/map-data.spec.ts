/**
 * Map data: reached from the Offline tab's link, a small country added in a few presses
 * (roads for routes and places to find, its country file kept), the sizes asked of the
 * suite's Geofabrik stand-in on one press, and the country file then listed as kept with
 * the roads ready. A map area over a year old is updated from the suite's stand-in for the map
 * source, and roads are removed with the question about their kept country file. Nothing
 * reaches the internet.
 */
import { accessibilityInBothThemes } from "./a11y";
import { api, expect, test, watchForErrors } from "./fixtures";
import { removeReferencePacks } from "./reference-layers";

const filesPort = Number(process.env.OUTPOST_E2E_FILES_PORT ?? 8473);
const standIn = (build: string) => `http://127.0.0.1:${filesPort}/maps/${build}.pmtiles`;
const LUXEMBOURG: [number, number, number, number] = [5.73, 49.44, 6.53, 50.19];

type Page = import("@playwright/test").Page;

async function finished(page: Page, id: string) {
  await expect
    .poll(async () => (await api<{ download: { state: string } }>(page, "GET", `/api/downloads/${id}`)).download.state, { timeout: 30_000 })
    .toBe("completed");
}

async function removeMaps(page: Page, title: string) {
  const { collections } = await api<{ collections: Array<{ id: string; kind: string; title: string }> }>(page, "GET", "/api/collections");
  for (const collection of collections.filter((each) => each.kind === "map" && each.title === title))
    await api(page, "DELETE", `/api/collections/${collection.id}?deleteFiles=true`);
}

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

  test("updates a map area over a year old from the map source, keeping the old one until the new one is in", async ({ page, sealed }) => {
    test.setTimeout(90_000);
    const errors = watchForErrors(page);
    const before = (await api<{ settings: Record<string, unknown> }>(page, "GET", "/api/settings")).settings["maps.tileSource"] ?? "";
    try {
      await api(page, "PATCH", "/api/settings", { "maps.tileSource": standIn("20250601") });
      const started = await api<{ downloads: Array<{ id: string }> }>(page, "POST", "/api/maps/regions", {
        name: "Luxembourg",
        regionId: "luxembourg",
        bbox: LUXEMBOURG,
        maxZoom: 6,
      });
      await finished(page, started.downloads[0]!.id);
      // The source has a newer build now; nothing is asked of it until the press.
      await api(page, "PATCH", "/api/settings", { "maps.tileSource": standIn("20261122") });

      await page.goto("/maps/data");
      const luxembourg = page.getByRole("list", { name: "Map data for Luxembourg" });
      const row = luxembourg.getByRole("heading", { name: "Map to look at" }).locator("xpath=..");
      await expect(row).toContainText(/from 1 Jun 2025/);
      await expect(row.getByText("Over a year old")).toBeVisible();
      await expect(page.getByText(/things? (is|are) over a year old\./)).toBeVisible();
      expect(await accessibilityInBothThemes(page, "/maps/data")).toEqual([]);

      await page.getByRole("button", { name: "Actions for Luxembourg: map to look at" }).click();
      await page.getByRole("menuitem", { name: /Update/ }).click();
      const dialog = page.getByRole("dialog", { name: "Update “Luxembourg”" });
      await expect(dialog).toContainText("Check asks 127.0.0.1 how large and how new the newest copy is.");
      await dialog.getByRole("button", { name: /Check for a newer copy/ }).click();
      await expect(dialog).toContainText(/A newer one is there, from 22 Nov 2026: .+ to download from 127\.0\.0\.1/);
      await dialog.getByRole("button", { name: "Update: Luxembourg" }).click();
      await expect(dialog.getByRole("status")).toContainText("The one you have stays, and is used, until the new one is in place");
      await dialog.getByRole("button", { name: "Done" }).click();

      await expect(row).toContainText(/from 22 Nov 2026/, { timeout: 30_000 });
      await expect(row.getByText("Over a year old")).toHaveCount(0);
      const maps = (
        await api<{ collections: Array<{ kind: string; title: string; version: string }> }>(page, "GET", "/api/collections")
      ).collections.filter((each) => each.kind === "map" && each.title === "Luxembourg");
      expect(maps.map((each) => each.version)).toEqual(["20261122"]);
      expect(errors).toEqual([]);
      expect(sealed.external).toEqual([]);
    } finally {
      await api(page, "PATCH", "/api/settings", { "maps.tileSource": before });
      await removeMaps(page, "Luxembourg");
    }
  });

  test("removing roads asks whether to delete the kept country file too, and deletes it only when ticked", async ({ page, sealed }) => {
    test.setTimeout(90_000);
    await api(page, "POST", "/api/reference/regions", {});
    await api(page, "POST", "/api/maps/data/add", { regionId: "monaco", kinds: ["roads"], keep: true });
    await page.goto("/maps/data");
    const monaco = page.getByRole("list", { name: "Map data for Monaco" });
    const row = (name: string) => monaco.getByRole("heading", { name }).locator("xpath=..");
    await expect(row("Roads for routes")).toContainText(/roads from \d+ Nov 2026/, { timeout: 60_000 });
    await expect(row("Country file")).toContainText(/from 21 Nov 2026/);

    await page.getByRole("button", { name: "Actions for Monaco: roads for routes" }).click();
    await expect(page.getByRole("menuitem", { name: /Move/ })).toHaveCount(0);
    await page.getByRole("menuitem", { name: /Remove/ }).click();
    const dialog = page.getByRole("alertdialog", { name: "Remove “Monaco”?" });
    await expect(dialog).toContainText("Routes can no longer be planned through it.");
    await expect(dialog).toContainText(/Frees .+ in Outpost's own data\./);
    const also = dialog.getByRole("checkbox", { name: /^Also delete the kept country file \(.+ on .+\)\?$/ });
    await expect(also).not.toBeChecked();
    await also.click();
    await dialog.getByRole("button", { name: "Remove roads and the country file" }).click();
    await expect(dialog).toBeHidden();
    // Nothing is left for Monaco: its roads are gone (and with them, its group, unless it is home).
    await expect(monaco.getByText(/roads from/)).toHaveCount(0);
    await expect(page.getByText("No country file is kept.")).toBeVisible();
    const { collections } = await api<{ collections: Array<{ kind: string }> }>(page, "GET", "/api/collections");
    expect(collections.filter((each) => each.kind === "extract")).toEqual([]);
    expect(sealed.external).toEqual([]);
  });
});
