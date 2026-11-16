/**
 * Satellite imagery on a phone, 390 pixels wide: the button is in the map's tools, the
 * picture shows under the map, and choosing an area, its day and reading its figures
 * all fit the screen, with nothing over anything else, nothing scrolling sideways and
 * nothing too small to touch (layout-audit.ts). Against the stand-ins for NASA and
 * Sentinel-2 (apps/server/test/fixtures/maps/imagery-stand-in.ts).
 */
import type { Page } from "@playwright/test";
import { api, expect, test, watchForErrors } from "./fixtures";
import { auditLayout, type Finding } from "./layout-audit";
import { type InstalledTestMaps, installTestMaps, removeTestMaps } from "./map-fixture";

test.use({ viewport: { width: 390, height: 844 } });

const SHEET = 'section[aria-label="Places, routes and offline maps"]';

async function wrong(page: Page): Promise<string[]> {
  const lowered = await page.getByRole("button", { name: /^Panel height: lowered/ }).count();
  const findings: Finding[] = await page.evaluate(auditLayout, {
    shell: ["header.bg-spine", 'nav[aria-label="Main"]'],
    folded: lowered ? [`${SHEET} [role="tabpanel"]`] : [],
  });
  return (
    findings
      .filter((finding) => !finding.shell)
      .filter((finding) => !(finding.kind === "small-target" && finding.what.startsWith("link in a line of text")))
      // The handles of the area being chosen are part of the map, like a road; they may pass under a control.
      .filter((finding) => !finding.what.includes("a handle of the box on the map"))
      .map((finding) => `${finding.kind}: ${finding.what} (${finding.detail})`)
  );
}

async function takeUp(page: Page, name: string): Promise<void> {
  const icon = page.getByRole("button", { name, exact: true }).and(page.locator("[aria-pressed]"));
  if ((await icon.count()) > 0) return icon.tap();
  await page.getByRole("button", { name: "All map tools" }).tap();
  await page.getByRole("menuitemcheckbox", { name, exact: true }).tap();
}

test.describe("satellite imagery on a phone", () => {
  let maps: InstalledTestMaps | undefined;

  test.beforeEach(async ({ page }) => {
    maps = await installTestMaps(page);
  });
  test.afterEach(async ({ page }) => {
    const overview = await api<{ sets: Array<{ id: string }> }>(page, "GET", "/api/maps/imagery");
    for (const set of overview.sets)
      await page.request.delete(`/api/collections/${set.id}?deleteFiles=true`, { headers: { "X-Outpost-Request": "1" } });
    await removeTestMaps(page, maps);
  });

  test("an area is chosen and confirmed on the phone's screen, and the picture is switched on from the map's tools", async ({ page }) => {
    test.setTimeout(120_000);
    const errors = watchForErrors(page);
    await page.goto("/maps?lat=53.06&lon=-4.09&z=13");
    await expect(page.locator('.outpost-map[data-map-idle="true"]')).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(450);

    await page.getByRole("tab", { name: "Offline maps" }).tap();
    const section = page.getByRole("region", { name: "Satellite imagery" });
    await section.getByRole("button", { name: "Choose an area" }).first().tap();
    await page.getByRole("button", { name: "Use the current view" }).tap();
    await page.getByRole("textbox", { name: "Name for this area" }).fill("Phone valley");
    expect(await wrong(page), "choosing the area").toEqual([]);
    await page.getByRole("button", { name: "Find pictures" }).tap();
    await page.getByRole("radio", { name: /12 July 2026/ }).tap();
    expect(await wrong(page), "choosing the day").toEqual([]);
    await page.getByRole("button", { name: "Continue" }).tap();
    await expect(page.getByText("To fetch")).toBeVisible({ timeout: 20_000 });
    expect(await wrong(page), "the figures before fetching").toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    const fetch = page.getByRole("button", { name: /^Fetch / });
    expect((await fetch.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await fetch.tap();
    await expect(section.getByRole("listitem").filter({ hasText: "Phone valley" })).toContainText("taken on 12 July 2026", {
      timeout: 30_000,
    });

    await page
      .getByRole("button", { name: /^Panel height/ })
      .first()
      .tap()
      .catch(() => undefined);
    await takeUp(page, "Satellite imagery");
    await page.waitForTimeout(600);
    await expect(page.getByRole("link", { name: "Contains modified Copernicus Sentinel data 2026" })).toBeVisible();
    expect(await wrong(page), "the picture on the map").toEqual([]);
    expect(errors).toEqual([]);
  });

  test("an aerial photograph is chosen and its figures read on the phone's screen", async ({ page }) => {
    test.setTimeout(120_000);
    const errors = watchForErrors(page);
    // Christchurch, where the stand-in for New Zealand's photographs has one sheet.
    await page.goto("/maps?lat=-43.426&lon=172.5405&z=16");
    await expect(page.locator('.outpost-map[data-map-idle="true"]')).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(450);
    await page.getByRole("tab", { name: "Offline maps" }).tap();
    const section = page.getByRole("region", { name: "Satellite imagery" });
    await section.getByRole("button", { name: "Choose an area" }).first().tap();
    await page.getByRole("button", { name: "Use the current view" }).tap();
    await page.getByRole("textbox", { name: "Name for this area" }).fill("Phone streets");
    await page.getByRole("button", { name: "Find pictures" }).tap();
    await page.getByRole("radio", { name: /Aerial photograph, 2 m/ }).tap();
    expect(await wrong(page), "choosing the picture").toEqual([]);
    await page.getByRole("button", { name: "Continue" }).tap();
    await expect(page.getByText("Kept on disk")).toBeVisible({ timeout: 20_000 });
    expect(await wrong(page), "the photograph's figures before fetching").toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    const fetch = page.getByRole("button", { name: /^Fetch / });
    expect((await fetch.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect(errors).toEqual([]);
  });
});
