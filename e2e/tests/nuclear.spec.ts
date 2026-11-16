/**
 * The nuclear preparedness workspace on a wide screen, with and without an offline map
 * installed. Set NUCLEAR_SHOTS to a folder to also keep screenshots of it at phone,
 * tablet and desktop widths, light and dark, for looking at by eye.
 */
import path from "node:path";
import { api, expect, test, watchForErrors } from "./fixtures";
import { CENTRE, type InstalledTestMaps, installTestMaps, removeTestMaps } from "./map-fixture";

const shots = process.env.NUCLEAR_SHOTS;

test.describe("Nuclear preparedness", () => {
  test.describe.configure({ mode: "serial" });
  let installed: InstalledTestMaps | undefined;
  test.afterAll(async ({ browser }) => {
    const page = await browser.newPage();
    await removeTestMaps(page, installed);
    await page.close();
  });

  test("says no offline map is installed when none is, and still draws the rings", async ({ page }) => {
    const errors = watchForErrors(page);
    await page.goto("/prepare/nuclear");
    await expect(page.getByTestId("offline-line")).toContainText("No offline map region is installed");
    await page.getByLabel("Ground zero", { exact: true }).fill(`${CENTRE.lat}, ${CENTRE.lon}`);
    await expect(page.getByText("5 psi", { exact: true })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("with an offline map: rings, plume and a comparison drawn over it", async ({ page }) => {
    test.setTimeout(120_000);
    const errors = watchForErrors(page);
    installed = await installTestMaps(page);
    // A delete answers 204 with no body, which `api` would try to read as JSON.
    for (const scenario of (await api(page, "GET", "/api/nuclear/scenarios")).scenarios as Array<{ id: string }>)
      await page.request.delete(`/api/nuclear/scenarios/${scenario.id}`, { headers: { "X-Outpost-Request": "1" } });
    await api(page, "POST", "/api/nuclear/scenarios", {
      name: "Two kilotons, east of the lake",
      notes: "",
      lat: CENTRE.lat + 0.01,
      lon: CENTRE.lon + 0.03,
      effects: { yieldKt: 2, burst: { kind: "optimum", psi: 5 }, wind: null },
    });
    await page.goto("/prepare/nuclear");
    await expect(page.getByTestId("offline-line")).toContainText(/offline map regions? installed/);
    await page.getByLabel("Name", { exact: true }).fill("One kiloton at the lake");
    await page.getByLabel("Ground zero", { exact: true }).fill(`${CENTRE.lat}, ${CENTRE.lon}`);
    await page.getByLabel("Yield", { exact: true }).fill("1");
    await page.getByLabel("Wind from, degrees", { exact: true }).fill("250");
    await page.getByLabel("Wind speed", { exact: true }).fill("24");
    await page.getByRole("button", { name: "Save scenario" }).click();
    await expect(page.getByRole("button", { name: "Save changes" })).toBeVisible();
    await page.getByRole("tab", { name: /Saved/ }).click();
    await page
      .getByRole("listitem")
      .filter({ hasText: "Two kilotons, east of the lake" })
      .getByRole("button", { name: "Compare as B" })
      .click();
    await page.getByRole("tab", { name: "Scenario" }).click();
    await page.getByRole("button", { name: "Fit the map to it" }).click();
    await page.locator('.outpost-map[data-map-idle="true"]').first().waitFor({ timeout: 20_000 });
    await expect(page.getByText(/Distances for B/)).toBeVisible();
    expect(errors).toEqual([]);

    if (!shots) return;
    for (const scheme of ["light", "dark"] as const) {
      for (const [name, viewport] of [
        ["desktop", { width: 1440, height: 900 }],
        ["tablet", { width: 1024, height: 1366 }],
        ["phone", { width: 390, height: 844 }],
      ] as const) {
        await page.emulateMedia({ colorScheme: scheme });
        await page.setViewportSize(viewport);
        await page.getByRole("button", { name: "Fit the map to it" }).click();
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(800);
        await page.locator('.outpost-map[data-map-idle="true"]').first().waitFor({ timeout: 20_000 });
        await page.screenshot({ path: path.join(shots, `nuclear-${name}-${scheme}.png`), fullPage: name !== "desktop" });
      }
    }
    await page.emulateMedia({ colorScheme: "light" });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByRole("tab", { name: "Layers" }).click();
    await page.screenshot({ path: path.join(shots, "nuclear-desktop-layers.png") });
  });
});
