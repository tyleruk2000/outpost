import { api, expect, test, watchForErrors } from "./fixtures";

test.use({ viewport: { width: 390, height: 844 } });

test.describe("Nuclear preparedness on a phone", () => {
  test("a tap on the map puts ground zero there, the rings are given in words, and a scenario is saved and compared", async ({ page }) => {
    test.setTimeout(90_000);
    const errors = watchForErrors(page);
    // A delete answers 204 with no body, which `api` would try to read as JSON.
    for (const scenario of (await api(page, "GET", "/api/nuclear/scenarios")).scenarios as Array<{ id: string }>)
      await page.request.delete(`/api/nuclear/scenarios/${scenario.id}`, { headers: { "X-Outpost-Request": "1" } });
    await api(page, "POST", "/api/nuclear/scenarios", {
      name: "Megaton airburst for comparison",
      notes: "",
      lat: 51.6,
      lon: -0.2,
      effects: { yieldKt: 1000, burst: { kind: "optimum", psi: 5 }, wind: null },
    });

    await page.goto("/prepare/nuclear");
    await expect(page.getByRole("heading", { level: 1, name: "Nuclear preparedness" })).toBeVisible();
    await expect(page.getByTestId("offline-line")).toContainText("nothing here uses the internet");

    // The map comes first on a phone, and nothing but its own column lies over it.
    await page.locator('.outpost-map[data-map-idle="true"]').first().waitFor({ timeout: 20_000 });
    const map = page.getByRole("region", { name: "The offline map, with the scenarios' rings and fallout patterns" });
    // Under the line about working offline, which on a phone puts the map's middle below the fold: brought into view first.
    await map.scrollIntoViewIfNeeded();
    const box = await map.boundingBox();
    await page.touchscreen.tap(box!.x + box!.width * 0.5, box!.y + box!.height * 0.5);
    await expect(page.getByLabel("Ground zero", { exact: true })).toHaveValue(/^-?\d+\.\d{5}, -?\d+\.\d{5}$/);

    // A surface burst with a wind: rings and the plume, each said in words with its source.
    await page.getByLabel("Wind from, degrees", { exact: true }).fill("250");
    await page.getByLabel("Wind speed", { exact: true }).fill("24");
    await expect(page.getByText("5 psi", { exact: true })).toBeVisible();
    await expect(page.getByText(/rads per hour at 1 hour/).first()).toBeVisible();
    await expect(page.getByText(/not a forecast and not instructions/).first()).toBeVisible();

    // Outside the model's range: refused, with the reason.
    await page.getByLabel("Yield", { exact: true }).fill("50");
    await page.getByRole("radio", { name: "megatons" }).click();
    await expect(page.getByText(/must be from 1 kiloton to 10 megatons/)).toBeVisible();
    await page.getByRole("radio", { name: "kilotons" }).click();
    await page.getByLabel("Yield", { exact: true }).fill("15");

    // Nothing is wider than the screen, and what a thumb presses is at least 44 px tall.
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    for (const name of ["Save scenario", "Zoom in"]) {
      const button = await page.getByRole("button", { name }).first().boundingBox();
      expect(button!.height, name).toBeGreaterThanOrEqual(44);
    }

    await page.getByLabel("Name", { exact: true }).fill("Fifteen kilotons, west wind");
    await page.getByRole("button", { name: "Save scenario" }).click();
    await expect(page.getByRole("button", { name: "Save changes" })).toBeVisible();

    await page.getByRole("tab", { name: /Saved/ }).click();
    await expect(page.getByText("Fifteen kilotons, west wind")).toBeVisible();
    await page
      .getByRole("listitem")
      .filter({ hasText: "Megaton airburst for comparison" })
      .getByRole("button", { name: "Put it on the map" })
      .click();
    await page.getByRole("tab", { name: "Scenario" }).click();
    await expect(page.getByRole("list", { name: "Scenarios on the map" }).getByRole("listitem")).toHaveCount(2);

    // Both scenarios on paper. With maps, nothing is drawn until "Make the PDF" is pressed; without, the words-only PDF is there at once.
    await expect(page.getByRole("button", { name: "Make the PDF" })).toBeVisible();
    await page.getByRole("switch", { name: "Maps in the PDF" }).tap();
    await expect(page.getByRole("link", { name: "Save as PDF" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Add to library" })).toBeVisible();
    expect(errors).toEqual([]);
  });
});
