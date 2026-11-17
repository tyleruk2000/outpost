/**
 * The food and supplies layer at phone width: the area on screen fetched from the
 * stand-in Overpass server (a real answer for the middle of Keswick, trimmed), the layer
 * switched on in the Layers tab, drinking water shown alone and found nearest, and a
 * shop's card saying what OpenStreetMap says and that it is no promise the shop is open.
 */
import { KESWICK_BOX } from "../../apps/server/test/fixtures/layers/food-stand-in.ts";
import { api, expect, test, watchForErrors } from "./fixtures";
import { removeReferencePacks } from "./reference-layers";

test.describe("food and supplies on a phone", () => {
  test.afterEach(async ({ page }) => {
    await removeReferencePacks(page);
  });

  test("installs an area, shows drinking water alone and opens a shop's card", async ({ page, sealed }) => {
    const errors = watchForErrors(page);
    await page.goto("/maps?lat=54.602&lon=-3.135&z=16");
    const estimate = await api<{ estimateId: string; items: Array<{ key: string; records: number }> }>(
      page,
      "POST",
      "/api/reference/estimate",
      {
        provider: "osm",
        clientNameAgreed: true,
        scope: { bbox: KESWICK_BOX },
        layers: ["food"],
      },
    );
    expect(estimate.items).toHaveLength(1);
    await api(page, "POST", "/api/reference/downloads", { estimateId: estimate.estimateId, keys: [estimate.items[0]!.key] });
    await expect
      .poll(async () => (await api<{ packs: Array<{ records: number }> }>(page, "GET", "/api/reference/packs")).packs[0]?.records ?? 0, {
        timeout: 20_000,
      })
      .toBe(12);

    await page.getByRole("tab", { name: "Layers" }).click();
    await page.getByRole("tab", { name: "Layers" }).click();
    const map = page.locator(".outpost-map canvas").first();
    await page.locator('.outpost-map[data-map-idle="true"]').waitFor({ timeout: 20_000 });
    const plain = await map.screenshot();
    await page.getByRole("switch", { name: "Food and supplies" }).click();
    await expect.poll(async () => (await map.screenshot()).equals(plain), { timeout: 10_000 }).toBe(false);

    // Every kind held, each with its mark; drinking water alone.
    const kinds = page.getByRole("list", { name: "Kinds of place" });
    await expect(kinds.getByRole("button")).toHaveText([
      /Supermarket\s*2/,
      /Small shop\s*3/,
      /Baker\s*4/,
      /Drinking water\s*1/,
      /Pharmacy\s*2/,
    ]);
    const water = kinds.getByRole("button", { name: /Drinking water/ });
    await water.click();
    await expect(water).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("heading", { name: "Nearest drinking water" })).toBeVisible();
    const nearest = page.getByRole("list", { name: "Nearest to the middle of the map" });
    await expect(nearest.getByRole("button")).toHaveCount(1);
    await expect(nearest.getByRole("button")).toContainText(/\d+ m/);
    await expect
      .poll(async () => {
        const view = await api<{ points: Array<{ kind: string }> }>(
          page,
          "GET",
          `/api/reference/features?bbox=${KESWICK_BOX.join(",")}&zoom=16&layers=food&kinds=food:water`,
        );
        return view.points.map((point) => point.kind);
      })
      .toEqual(["food:water"]);
    await page.getByRole("button", { name: "Show every kind" }).click();
    await expect(water).toHaveAttribute("aria-pressed", "false");

    // A shop found by name, and its card.
    await page.getByRole("searchbox", { name: "Find in the reference layers" }).fill("Booths");
    await page
      .getByRole("list", { name: "Found in the reference layers" })
      .getByRole("button", { name: /Booths/ })
      .click();
    const card = page.locator("section").filter({ has: page.getByRole("heading", { name: "Booths" }) });
    await expect(card).toContainText("Supermarket, in food and supplies");
    await expect(card).toContainText("1 Tithebarn Street, Keswick, CA12 5EA");
    await expect(card).toContainText("Mo-Sa 08:00-22:00");
    await expect(card).toContainText("Opening hours as mapped, fetched");
    await expect(card).toContainText("It does not say a place is open, has anything in stock or is still there");
    await expect(card).toContainText("shops may be shut or empty");
    await expect(card).toContainText("Published public record");
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);

    expect(errors).toEqual([]);
    expect(sealed.external).toEqual([]);
  });
});
