/**
 * Maps' Nearest on an iPhone (WebKit, by touch): one press at the foot of the map, the kinds
 * held as large buttons, the nearest pharmacy with its distance, and Directions to it in one
 * more press. The places are a real answer for the middle of Keswick from the stand-in
 * Overpass server (apps/server/test/fixtures/layers/food-stand-in.ts).
 *
 * Pictures are attached to the report, and kept in OUTPOST_E2E_SHOTS when it names a folder.
 */
import type { Page, TestInfo } from "@playwright/test";
import { KESWICK_BOX } from "../../apps/server/test/fixtures/layers/food-stand-in.ts";
import { accessibilityInBothThemes } from "./a11y";
import { api, expect, test, watchForErrors } from "./fixtures";
import { removeReferencePacks } from "./reference-layers";

async function picture(page: Page, info: TestInfo, name: string): Promise<void> {
  await info.attach(name, { body: await page.screenshot(), contentType: "image/png" });
  const folder = process.env.OUTPOST_E2E_SHOTS;
  if (folder) await page.screenshot({ path: `${folder}/${info.project.name}-${name}.png` });
}

test.describe("Nearest on an iPhone", () => {
  test.use({ viewport: { width: 390, height: 664 } });
  test.afterEach(async ({ page }) => removeReferencePacks(page));

  test("Nearest, Pharmacy, Directions: three presses from the map to a route", async ({ page }, info) => {
    test.setTimeout(90_000);
    const errors = watchForErrors(page);
    await page.goto("/maps?lat=54.602&lon=-3.135&z=15");
    const estimate = await api<{ estimateId: string; items: Array<{ key: string }> }>(page, "POST", "/api/reference/estimate", {
      provider: "osm",
      clientNameAgreed: true,
      scope: { bbox: KESWICK_BOX },
      layers: ["food"],
    });
    await api(page, "POST", "/api/reference/downloads", { estimateId: estimate.estimateId, keys: [estimate.items[0]!.key] });
    await expect
      .poll(async () => (await api<{ packs: Array<{ records: number }> }>(page, "GET", "/api/reference/packs")).packs[0]?.records ?? 0, {
        timeout: 20_000,
      })
      .toBe(12);
    await page.reload();
    await expect(page.locator("canvas").first()).toBeVisible({ timeout: 15_000 });

    // Beside Directions at the foot of the map, under the thumb.
    const button = page.getByRole("button", { name: "Nearest", exact: true });
    const box = (await button.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(36);
    expect(box.y).toBeGreaterThan(664 / 2);
    await button.tap();
    const dialog = page.getByRole("dialog", { name: "Nearest" });
    await expect(dialog).toBeVisible();
    // Only what is held: food and supplies here holds pharmacies and drinking water, not hospitals or fuel.
    const kinds = dialog.getByRole("group", { name: "What to find" });
    await expect(kinds.getByRole("button")).toHaveText(["Pharmacy", "Water"]);
    await kinds.getByRole("button", { name: "Pharmacy" }).tap();
    const list = dialog.getByRole("list", { name: "Nearest to the middle of the map" });
    await expect(list.getByRole("listitem")).toHaveCount(2);
    await expect(list.getByRole("listitem").first()).toContainText(/\d+ m \([\d.]+ mi\)|[\d.]+ km \([\d.]+ mi\)/);
    for (const target of await list.getByRole("button").all()) {
      const size = (await target.boundingBox())!;
      expect(size.height, "each row and each Directions is a finger's size").toBeGreaterThanOrEqual(44);
    }
    await picture(page, info, "nearest-pharmacy");
    expect(await accessibilityInBothThemes(page, "/maps (nearest, phone)")).toEqual([]);

    const first = (await list.getByRole("listitem").first().getByRole("button").first().textContent()) ?? "";
    const name = first.split(/\d/)[0]!.trim();
    await list
      .getByRole("button", { name: /^Directions to / })
      .first()
      .tap();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("button", { name: new RegExp(`^To: ${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`) })).toBeVisible();
    await picture(page, info, "nearest-directions");
    // No roads are installed here: the sheet says so, and that is the only refusal.
    expect(errors.filter((error) => !/status of 400/.test(error))).toEqual([]);
  });

  test("a link from search opens the list on its kind; with nothing held it says where such places come from", async ({ page }) => {
    await page.goto("/maps?lat=54.602&lon=-3.135&z=15&nearest=hospital");
    const dialog = page.getByRole("dialog", { name: "Nearest" });
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    await expect(dialog.getByText(/No hospitals, pharmacies, shelters, drinking water or fuel are held/)).toBeVisible();
    await expect(dialog.getByRole("link", { name: "Add nearby places" })).toHaveAttribute("href", "/maps/data?get=places");
    // The address forgets the link, so Back and a reload do not open it again.
    await expect(page).not.toHaveURL(/nearest=/);
  });
});
