/**
 * Offline maps (/maps/data): reached from the Offline tab, Storage and Downloads; a small country
 * (the suite's Monaco) added through Add a place in a few presses (found by name, Routes and
 * Nearby places ticked, the size asked of the suite's Geofabrik stand-in on one press that reads
 * its list of regions too, the source file kept), then one row for Monaco saying where each
 * stands. A map over a year old is updated by place from the stand-in for the map source, and a
 * place is removed with ticks, its source file only when ticked. Nothing reaches the internet.
 */
import { accessibilityInBothThemes } from "./a11y";
import { api, expect, test, watchForErrors } from "./fixtures";
import { removeReferencePacks } from "./reference-layers";
import { installStreets, removeStreets } from "./streets";

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

async function tidy(page: Page) {
  for (const network of (await api<{ networks: Array<{ id: string }> }>(page, "GET", "/api/roads/networks")).networks)
    await api(page, "DELETE", `/api/roads/networks/${network.id}`);
  await removeReferencePacks(page);
  const { collections } = await api<{ collections: Array<{ id: string; kind: string }> }>(page, "GET", "/api/collections");
  for (const collection of collections.filter((each) => each.kind === "extract"))
    await api(page, "DELETE", `/api/collections/${collection.id}?deleteFiles=true`);
}

const placeRow = (page: Page, code: string) => page.locator(`[data-place="country:${code}"]`);

test.describe("Offline maps", () => {
  test.afterEach(async ({ page }) => {
    await tidy(page);
  });

  test("is one press from the Offline tab, from Storage and from Downloads", async ({ page }) => {
    await page.goto("/maps?tab=offline");
    const link = page.getByRole("link", { name: /All offline maps/ });
    await expect(link).toBeVisible();
    // What needs the map stays: what covers the view, adding the view or an area drawn, satellite pictures, keeping the view.
    await expect(page.getByRole("region", { name: "What covers this view" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Add this view" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Draw an area" })).toBeVisible();
    // Satellite pictures are a tick of Add a place now, said beside the one link.
    await expect(page.getByText(/satellite pictures: add, update and remove them there/)).toBeVisible();
    await expect(page.getByRole("region", { name: "Satellite imagery" })).toHaveCount(0);
    // What moved is not here twice.
    await expect(page.getByRole("heading", { name: "Add a region" })).toHaveCount(0);
    await link.click();
    await expect(page.getByRole("heading", { name: "Offline maps", level: 1 })).toBeVisible();
    await expect(page.getByRole("button", { name: "Add a place" }).first()).toBeVisible();

    await page.goto("/storage");
    // One row among the kinds of content, not a table by kind: Offline maps · size · where › Manage.
    const offline = page.getByRole("row", { name: /Offline maps/ });
    await expect(offline).toBeVisible();
    await expect(page.getByRole("row", { name: /Country files|Place names|Terrain/ })).toHaveCount(0);
    await offline.getByRole("link", { name: "Manage", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Offline maps", level: 1 })).toBeVisible();

    await page.goto("/downloads");
    await page.getByRole("main").getByRole("link", { name: "Offline maps" }).first().click();
    await expect(page.getByRole("heading", { name: "Offline maps", level: 1 })).toBeVisible();
  });

  test("adds routes and nearby places for a country found by name, keeps its source file, and shows one row for it", async ({
    page,
    sealed,
  }) => {
    test.setTimeout(90_000);
    const errors = watchForErrors(page);
    await page.goto("/maps/data");
    await page.getByRole("button", { name: "Add a place" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Add a place" });
    await expect(dialog.getByRole("heading", { name: "Where?" })).toBeVisible();
    await dialog.getByLabel("Country, region or town").fill("Monaco");
    await dialog
      .getByRole("list", { name: "Places found" })
      .getByRole("button", { name: /^Monaco/ })
      .click();
    await expect(dialog.getByRole("heading", { name: "What for Monaco?" })).toBeVisible();
    // Map and Routes are ticked; for this test, routes and nearby places only.
    await dialog.getByRole("checkbox", { name: /^Map/ }).click();
    await dialog.getByRole("checkbox", { name: /Nearby places/ }).click();
    await expect(dialog.getByText(/Asks the map sources how large it is\. Nothing is downloaded yet\./)).toBeVisible();
    await dialog.getByRole("button", { name: "Check size" }).click();
    const download = dialog.getByRole("button", { name: /^Download · / });
    await expect(download).toBeVisible({ timeout: 15_000 });
    await expect(dialog.getByText(/Sizes from 127\.0\.0\.1/)).toBeVisible();

    // The source file, on the main view: both choices the first time, else the remembered one in a line with Change.
    const keep = dialog.getByRole("radio", { name: /^Keep it/ });
    if (!(await keep.isVisible()))
      await dialog
        .getByRole("region", { name: "The source file" })
        .getByRole("button", { name: /^Change/ })
        .click();
    await keep.click();
    await expect(
      dialog.getByRole("radiogroup", { name: "Where to keep the source file" }).getByRole("radio", { checked: true }),
    ).toHaveCount(1);
    await download.click();
    await expect(dialog).toBeHidden();

    // One row for Monaco, its routes and nearby places ready; it opens to the days and the source file.
    const monaco = placeRow(page, "MC");
    await expect(monaco.locator('[data-pattern="state"][data-state="ready"]')).toHaveCount(2, { timeout: 60_000 });
    await monaco.getByRole("button", { name: /^Monaco/ }).click();
    const detail = monaco.getByRole("region", { name: "Monaco in detail" });
    await expect(detail).toContainText(/roads from \d+ Nov 2026/);
    await expect(detail).toContainText(/Source file/);
    await expect(detail).toContainText(/from 21 Nov 2026/);
    const networks = (await api<{ networks: Array<{ regionId: string; extract: { kept: boolean } }> }>(page, "GET", "/api/roads/networks"))
      .networks;
    expect(networks).toEqual([expect.objectContaining({ regionId: "monaco", extract: expect.objectContaining({ kept: true }) })]);

    // Remembered: the next time the choice is said in one line on the main view, with Change; nothing is folded away.
    await page.getByRole("button", { name: "Add a place" }).first().click();
    await dialog.getByLabel("Country, region or town").fill("Luxembourg");
    await dialog
      .getByRole("list", { name: "Places found" })
      .getByRole("button", { name: /^Luxembourg/ })
      .click();
    await expect(dialog.getByRole("radio", { name: /^Keep it/ })).toHaveCount(0);
    const line = dialog.getByRole("region", { name: "The source file" });
    await expect(line).toContainText(
      /^Source file: kept on .+\. Needed to add walking and cycling or update without downloading again · Change/,
    );
    await line.getByRole("button", { name: /^Change/ }).click();
    await expect(dialog.getByRole("radio", { name: /^Keep it/ })).toBeChecked();
    await page.keyboard.press("Escape");

    // Storage's row opens to Monaco with the same marks; Downloads and tasks titles the work in the same words.
    await page.goto("/storage");
    await page
      .getByRole("row", { name: /Offline maps/ })
      .getByRole("button", { name: "Offline maps" })
      .click();
    const byPlace = page.getByRole("list", { name: "Offline maps by place" });
    const there = byPlace.locator('[data-pattern="row"]').filter({ hasText: "Monaco" });
    await expect(there.locator('[data-pattern="state"][data-state="ready"]')).toHaveCount(2);
    await expect(there).toContainText("Routes");
    await page.goto("/downloads");
    await expect(page.getByRole("main").getByText("Monaco: routes and nearby places").first()).toBeVisible();
    await expect(page.getByRole("main")).not.toContainText(/Country file|Geofabrik|road network/);
    expect(errors).toEqual([]);
    expect(sealed.external).toEqual([]);
  });

  test("adds walking and cycling through Add a place: the source file downloaded and kept first, the build said and queued", async ({
    page,
    sealed,
  }) => {
    test.setTimeout(90_000);
    const errors = watchForErrors(page);
    installStreets("none");
    try {
      await page.goto("/maps/data?add=1&country=MC&kinds=streets");
      const dialog = page.getByRole("dialog", { name: "Add a place" });
      await expect(dialog.getByRole("heading", { name: "What for Monaco?" })).toBeVisible();
      await expect(dialog.getByRole("checkbox", { name: /Walking and cycling/ })).toBeChecked();
      await expect(dialog.getByText(/Needs Monaco's source file.*downloaded and kept first/)).toBeVisible();
      await dialog.getByRole("button", { name: "Check size" }).click();
      const download = dialog.getByRole("button", { name: /^Download · / });
      await expect(download).toBeVisible({ timeout: 15_000 });
      // The build's own figures, in the flow: the time on a Raspberry Pi 5 and what it writes.
      const takes = dialog.getByTestId("streets-estimate");
      await expect(takes).toContainText(/Raspberry Pi 5/);
      await expect(takes).toContainText(/writes about/i);
      // Kept, not asked: walking and cycling are built from it.
      await expect(dialog.getByRole("radio", { name: /Delete it after reading/ })).toHaveCount(0);
      await download.click();
      await expect(dialog).toBeHidden();
      // Once the file is kept, the build is queued, titled in Offline maps' words.
      await expect
        .poll(
          async () =>
            (await api<{ jobs: Array<{ title: string; type: string }> }>(page, "GET", "/api/jobs?active=true")).jobs
              .filter((job) => job.type === "streets.build")
              .map((job) => job.title),
          { timeout: 45_000 },
        )
        .toEqual(["Monaco: walking and cycling"]);
      expect(errors).toEqual([]);
      expect(sealed.external).toEqual([]);
    } finally {
      for (const job of (await api<{ jobs: Array<{ id: string; type: string }> }>(page, "GET", "/api/jobs?active=true")).jobs)
        if (job.type === "streets.build") await api(page, "POST", `/api/jobs/${job.id}/cancel`).catch(() => undefined);
      removeStreets();
    }
  });

  test("updates a map over a year old by place, keeping the old one until the new one is in", async ({ page, sealed }) => {
    test.setTimeout(90_000);
    const errors = watchForErrors(page);
    const before = (await api<{ settings: Record<string, unknown> }>(page, "GET", "/api/settings")).settings["maps.tileSource"] ?? "";
    try {
      await api(page, "PATCH", "/api/settings", { "maps.tileSource": standIn("20250601") });
      const started = await api<{ downloads: Array<{ id: string }> }>(page, "POST", "/api/maps/regions", {
        name: "Luxembourg",
        regionId: "country-lu",
        bbox: LUXEMBOURG,
        maxZoom: 6,
      });
      await finished(page, started.downloads[0]!.id);
      // The source has a newer build now; nothing is asked of it until the press.
      await api(page, "PATCH", "/api/settings", { "maps.tileSource": standIn("20261122") });

      await page.goto("/maps/data");
      const luxembourg = placeRow(page, "LU");
      await expect(luxembourg.getByText("Over a year old")).toBeVisible();
      await expect(page.getByText(/places? (is|are) over a year old\./)).toBeVisible();
      expect(await accessibilityInBothThemes(page, "/maps/data")).toEqual([]);

      await page.getByRole("button", { name: "Actions for Luxembourg" }).click();
      await page.getByRole("menuitem", { name: "Update" }).click();
      const dialog = page.getByRole("dialog", { name: "Update Luxembourg" });
      await expect(dialog.getByRole("heading", { name: "Luxembourg · Map from 1 Jun 2025" })).toBeVisible();
      await expect(dialog).toContainText("Check asks 127.0.0.1 how large and how new the newest copy is.");
      await dialog.getByRole("button", { name: /Check for a newer copy/ }).click();
      await expect(dialog).toContainText(/A newer one is there, from 22 Nov 2026: .+ to download from 127\.0\.0\.1/);
      await dialog.getByRole("button", { name: "Update: Luxembourg" }).click();
      await expect(dialog.getByRole("status")).toContainText("The one you have stays, and is used, until the new one is in place");
      await dialog.getByRole("button", { name: "Done" }).click();

      await expect(luxembourg.getByText("Over a year old")).toHaveCount(0, { timeout: 30_000 });
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

  test("removes a place with ticks, its source file only when ticked, saying what it frees", async ({ page, sealed }) => {
    test.setTimeout(90_000);
    await api(page, "POST", "/api/reference/regions", {});
    await api(page, "POST", "/api/maps/data/add", { regionId: "monaco", kinds: ["roads"], keep: true });
    await page.goto("/maps/data");
    const monaco = placeRow(page, "MC");
    await expect(monaco.locator('[data-pattern="state"][data-state="ready"]')).toHaveCount(1, { timeout: 60_000 });

    await page.getByRole("button", { name: "Actions for Monaco" }).click();
    // A road network is kept with Outpost's own data: only the source file could move, and it is offered.
    await page.getByRole("menuitem", { name: "Remove…" }).click();
    const dialog = page.getByRole("alertdialog", { name: "Remove Monaco?" });
    await expect(dialog).toContainText("Saved routes keep their directions.");
    await expect(dialog.getByRole("checkbox", { name: /Routes/ })).toBeChecked();
    const file = dialog.getByRole("checkbox", { name: /Source file/ });
    await expect(file).not.toBeChecked();
    await file.click();
    await dialog.getByRole("button", { name: /^Remove · frees / }).click();
    await expect(dialog).toBeHidden();
    await expect(monaco).toHaveCount(0);
    const { collections } = await api<{ collections: Array<{ kind: string }> }>(page, "GET", "/api/collections");
    expect(collections.filter((each) => each.kind === "extract")).toEqual([]);
    expect((await api<{ networks: unknown[] }>(page, "GET", "/api/roads/networks")).networks).toEqual([]);
    expect(sealed.external).toEqual([]);
  });
});
