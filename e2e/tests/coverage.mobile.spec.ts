import { expect, test, watchForErrors } from "./fixtures";

test.use({ viewport: { width: 390, height: 844 } });

test.describe("HF coverage on a phone", () => {
  test("fits a 390 px screen, and the map answers a finger", async ({ page }) => {
    test.setTimeout(90_000);
    const errors = watchForErrors(page);
    await page.goto("/radio/coverage");
    await page.getByRole("button", { name: /Try London on 40 m/ }).click();
    await expect(page.getByRole("heading", { name: "What this map rests on" })).toBeVisible({ timeout: 60_000 });
    // Nothing is wider than the screen: the page does not scroll sideways.
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    // What a thumb presses is at least 44 px tall.
    for (const name of ["Work out coverage", "An hour later", "Transmitter: choose on the map", "Zoom in"]) {
      const button = await page.getByRole("button", { name }).first().boundingBox();
      expect(button!.height, name).toBeGreaterThanOrEqual(44);
    }
    const tab = await page.getByRole("radio", { name: "Signal strength" }).boundingBox();
    expect(tab!.height).toBeGreaterThanOrEqual(40);

    // A tap on the map reads the cell under it.
    await page.locator('.outpost-map[data-map-idle="true"]').first().waitFor({ timeout: 20_000 });
    const map = page.getByRole("region", { name: "HF coverage over the offline map" });
    await map.scrollIntoViewIfNeeded();
    const box = await map.boundingBox();
    await page.touchscreen.tap(box!.x + box!.width * 0.6, box!.y + box!.height * 0.55);
    await expect(page.getByRole("heading", { name: /^The cell at .* at 12:00 UTC$/ })).toBeVisible();

    // A place is chosen with a tap, in a sheet that fits the screen.
    await page.getByRole("button", { name: "Transmitter: choose on the map" }).click();
    const picker = page.getByRole("dialog", { name: "Choose where the transmitter is" });
    const pickMap = picker.getByRole("region", { name: "Map for choosing where the transmitter is" });
    await picker.locator('.outpost-map[data-map-idle="true"]').waitFor({ timeout: 20_000 });
    const area = await pickMap.boundingBox();
    await page.touchscreen.tap(area!.x + area!.width * 0.3, area!.y + area!.height * 0.3);
    await expect(picker.getByText(/^-?\d+\.\d{4}, -?\d+\.\d{4} · [A-R]{2}\d{2}[A-X]{2}$/)).toBeVisible();
    const use = picker.getByRole("button", { name: "Use this place" });
    await expect(use).toBeInViewport();
    await use.click();
    await expect(page.getByLabel("Transmitter", { exact: true })).toHaveValue(/^-?\d+\.\d{5}, -?\d+\.\d{5}$/);
    expect(errors).toEqual([]);
  });
});
