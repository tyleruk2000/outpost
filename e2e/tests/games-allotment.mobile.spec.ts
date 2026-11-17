/**
 * The allotment on a phone: reached from the More sheet under Games, onions sown in bed 1
 * from its panel with real taps (onion sets are free and grow in every month, so this holds
 * on any date) and watered, the bed saying what it is doing, the plot kept on the server
 * (read back through the API) and still there after a reload. A sowing out of its months
 * is explained before the press. The plot is started afresh first. No sideways scroll.
 */
import { api, expect, test, watchForErrors } from "./fixtures";

test.use({ viewport: { width: 390, height: 844 } });

test.describe("Allotment on a phone", () => {
  test("sows and waters onions in bed 1 and keeps them on the server", async ({ page }) => {
    const errors = watchForErrors(page);
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    await page.goto("/");
    await api(page, "DELETE", "/api/games/allotment");

    // Reached from the More sheet, under Games.
    await page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: "More" }).tap();
    // The screens under Games are folded away until asked for.
    await page.getByRole("dialog", { name: "More" }).getByRole("button", { name: "Show the screens under Games" }).tap();
    await page
      .getByRole("dialog", { name: "More" })
      .getByRole("list", { name: "Under Games" })
      .getByRole("link", { name: "Allotment" })
      .tap();
    await expect(page.getByRole("heading", { level: 1, name: "Allotment" })).toBeVisible();
    await expect(page.getByText(/^Sow (radishes|onions) in a bed and water them: /)).toBeVisible();
    expect(await overflow()).toBeLessThanOrEqual(0);

    // Bed 1's panel, and onions sown from it.
    await page.getByRole("button", { name: /^Bed 1, empty, / }).tap();
    const panel = page.getByRole("region", { name: "Bed 1" });
    await expect(panel).toBeVisible();
    // Every crop says before the press when it is sown, and whether it would wait.
    await expect(
      panel.getByRole("button", { name: /^Sow squash: 60 coins, 3 days\. (Sown now, they wait in the ground until|Sown April to June)/ }),
    ).toBeVisible();
    await panel.getByRole("button", { name: /^Sow onions: free, 1 hour\./ }).tap();
    await expect(page.getByRole("button", { name: /^Bed 1, onions, just sown, / })).toBeVisible();
    expect(await overflow()).toBeLessThanOrEqual(0);

    // Watered: the bed is moist for 12 hours and grows, and its panel says so in a sentence.
    await page
      .getByRole("region", { name: "Bed 1" })
      .getByRole("button", { name: /^Water/ })
      .tap();
    await expect(
      page.getByRole("button", { name: /^Bed 1, onions, (just sown|shoots|growing), ready in about \d+ (minutes|hour), moist$/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Bed 1" }).getByText(/Growing: (the soil is moist from the can|it is raining)/),
    ).toBeVisible();

    // Kept on the server, for every device.
    const kept = await api(page, "GET", "/api/games/allotment");
    expect(kept.started).toBe(true);
    expect(kept.plot.v).toBe(2);
    expect(kept.plot.beds[0]).toMatchObject({ crop: "onions" });
    expect(kept.plot.beds[0].wetUntil).toBeGreaterThan(kept.now);

    await page.reload();
    await expect(page.getByRole("button", { name: /^Bed 1, onions, / })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Bed 2, empty, / })).toBeVisible();
    // This month on the plot, and the almanac's cards with where they come from.
    await expect(page.getByRole("heading", { name: "This month on the plot" })).toBeVisible();
    await expect(page.getByRole("region", { name: "This month on the plot" }).getByText(/^To sow now:/)).toBeVisible();
    await page.getByText("Where this comes from", { exact: true }).tap();
    await expect(page.getByRole("link", { name: "Garlic" })).toHaveAttribute(
      "href",
      "https://www.rhs.org.uk/vegetables/garlic/grow-your-own",
    );
    expect(await overflow()).toBeLessThanOrEqual(0);

    await api(page, "DELETE", "/api/games/allotment");
    expect(errors).toEqual([]);
  });
});
