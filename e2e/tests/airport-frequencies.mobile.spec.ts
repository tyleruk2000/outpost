/**
 * An airport's radio frequencies at phone width: the airports layer downloaded from the
 * stand-in for OurAirports (both files), an airport found by name in the Layers tab, and
 * its card listing its frequencies in MHz with the cautions, with no sideways scroll.
 */
import { api, expect, test, watchForErrors } from "./fixtures";
import { removeReferencePacks } from "./reference-layers";

test.describe("airport frequencies on a phone", () => {
  test.afterEach(async ({ page }) => {
    await removeReferencePacks(page);
  });

  test("an airport's card lists its frequencies, and the screen does not scroll sideways", async ({ page, sealed }) => {
    const errors = watchForErrors(page);
    await page.goto("/maps?lat=51.47&lon=-0.46&z=11");
    const estimate = await api<{ estimateId: string; items: Array<{ basis: string }> }>(page, "POST", "/api/reference/estimate", {
      provider: "ourairports",
      scope: { countries: ["GB"] },
    });
    expect(estimate.items[0]!.basis).toContain("airport-frequencies.csv");
    await api(page, "POST", "/api/reference/downloads", { estimateId: estimate.estimateId, keys: ["airports"] });
    await expect
      .poll(async () => (await api<{ packs: Array<{ records: number }> }>(page, "GET", "/api/reference/packs")).packs[0]?.records ?? 0, {
        timeout: 20_000,
      })
      .toBe(4);

    await page.getByRole("tab", { name: "Layers" }).click();
    await page.getByRole("tab", { name: "Layers" }).click();
    await page.getByRole("searchbox", { name: "Find in the reference layers" }).fill("Heathrow");
    await page
      .getByRole("list", { name: "Found in the reference layers" })
      .getByRole("button", { name: /London Heathrow Airport/ })
      .click();
    const card = page.locator("section").filter({ has: page.getByRole("heading", { name: "London Heathrow Airport" }) });
    const list = card.getByRole("list", { name: "Radio frequencies" });
    await expect(list).toBeVisible();
    await expect(list.getByRole("listitem").first()).toContainText("Tower");
    await expect(list.getByRole("listitem").first()).toContainText("118.500 MHz");
    await expect(list.getByRole("listitem")).toHaveCount(15);
    await expect(card).toContainText("Not for navigation or flight planning");
    await expect(card).toContainText("as of 17 November 2026");
    await expect(card).toContainText("15 listed");
    // On a phone (390 x 844) the card shows the name, at least four rows and the caution, without taking the map:
    // the list scrolls inside the card, about five rows high.
    await page.waitForTimeout(400);
    const shown = await list.getByRole("listitem").evaluateAll(
      (items) =>
        items.filter((item) => {
          const row = item.getBoundingClientRect();
          const box = item.closest("ul")!.getBoundingClientRect();
          const outer = item.closest(".outpost-map-card")!.getBoundingClientRect();
          return row.top >= Math.max(box.top, outer.top) - 1 && row.bottom <= Math.min(box.bottom, outer.bottom) + 1;
        }).length,
    );
    expect(shown).toBeGreaterThanOrEqual(4);
    expect(await list.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
    await expect(card.getByText(/^Not for navigation or flight planning/)).toBeAttached();
    // Its last row can be reached by scrolling the list, and the page does not scroll sideways.
    const last = list.getByRole("listitem").last();
    await last.scrollIntoViewIfNeeded();
    await expect(last).toBeInViewport();
    // It folds to one line, as a repeater's card does, and opens out again.
    await card.getByRole("button", { name: "Show less" }).click();
    await expect(page.getByRole("region", { name: "London Heathrow Airport: radio frequencies" })).toContainText("15 radio frequencies");
    await page.getByRole("button", { name: "Show the details" }).click();
    await expect(list).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);

    expect(errors).toEqual([]);
    expect(sealed.external).toEqual([]);
  });
});
