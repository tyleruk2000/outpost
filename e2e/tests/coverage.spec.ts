import type { Page } from "@playwright/test";
import { expect, test, watchForErrors } from "./fixtures";

const idle = (page: Page) => page.locator('.outpost-map[data-map-idle="true"]').first().waitFor({ timeout: 20_000 });

test.describe("HF coverage", () => {
  test("works a grid out with the engine, shows it over the offline map, reads a cell, and keeps the map by name", async ({ page }) => {
    test.setTimeout(90_000);
    const errors = watchForErrors(page);
    await page.goto("/radio");
    await page
      .getByRole("link", { name: /HF coverage/ })
      .first()
      .click();
    await expect(page).toHaveURL(/\/radio\/coverage$/);
    await expect(page.getByRole("heading", { level: 1, name: "HF coverage" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "No coverage map yet" })).toBeVisible();

    // The transmitter is chosen by pressing the offline map.
    await page.getByRole("button", { name: "Transmitter: choose on the map" }).click();
    const picker = page.getByRole("dialog", { name: "Choose where the transmitter is" });
    await expect(picker.getByText("No place chosen yet.")).toBeVisible();
    await idle(page);
    const pickMap = await picker.getByRole("region", { name: "Map for choosing where the transmitter is" }).boundingBox();
    await page.mouse.click(pickMap!.x + pickMap!.width / 2, pickMap!.y + pickMap!.height / 2);
    await expect(picker.getByText(/^-?\d+\.\d{4}, -?\d+\.\d{4} · [A-R]{2}\d{2}[A-X]{2}$/)).toBeVisible();
    await picker.getByRole("button", { name: "Use this place" }).click();
    await expect(page.getByLabel("Transmitter", { exact: true })).toHaveValue(/^-?\d+\.\d{5}, -?\d+\.\d{5}$/);

    // The figures checked below are those of one fixed place and month.
    await page.getByLabel("Transmitter", { exact: true }).fill("51.5074, -0.1278");
    await page.getByLabel("Date (UTC)").fill("2026-11-16");
    await expect(page.getByText(/Over what the map shows now: \d+ × \d+ = [\d,]+ cells, each about/)).toBeVisible();
    await page.getByRole("button", { name: "Work out coverage" }).click();
    await expect(page.getByRole("heading", { name: "What this map rests on" })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(/Monthly median for November 2026 at smoothed sunspot number 83/)).toBeVisible();
    await expect(page.getByText("It is not a reading of the ionosphere today.")).toBeVisible();
    await expect(
      page.getByText(/The grid is \d+ × \d+ cells of .* Nothing is smoothed and nothing is filled in between cells\./),
    ).toBeVisible();
    await expect(page.getByText(/VOACAP Version 16\.\d+W, run by hfcast/)).toBeVisible();
    await expect(page.getByText(/in \d+\.\d s on this computer \([\d,]+ cells\)/)).toBeVisible();
    // The legend counts real cells: with 5 W on 40 m at noon in November, some of Britain is in every class but the top.
    const legend = page.getByRole("list", { name: /What the shades mean/ });
    await expect(legend.getByText("50 to 69%")).toBeVisible();
    await expect(legend.locator("li").filter({ hasText: "10 to 29%" })).toContainText(/[1-9]\d* cells?/);

    // Pressing the map reads the cell under the press.
    await idle(page);
    const map = page.getByRole("region", { name: "HF coverage over the offline map" });
    await map.scrollIntoViewIfNeeded();
    const box = await map.boundingBox();
    await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await expect(
      page.getByRole("heading", { name: /^The cell at -?\d+\.\d\d, -?\d+\.\d\d \([A-R]{2}\d{2}[A-X]{2}\), at 12:00 UTC$/ }),
    ).toBeVisible();
    await expect(page.getByText(/^\d+% of days$/)).toBeVisible();
    await expect(page.getByText(/dB in 1 Hz, median: \d+\.\d dB (over|short of) what SSB voice needs/)).toBeVisible();

    // The same cells by signal strength, and at another hour.
    await page.getByRole("radio", { name: "Signal strength" }).click();
    await expect(page.getByText(/S9 = −73 dBm and 6 dB to the unit/)).toBeVisible();
    await page.getByRole("button", { name: "An hour later" }).click();
    await expect(page.getByRole("heading", { name: /at 13:00 UTC$/ })).toBeVisible();

    // Kept by name, and opened again after a reload with the figures it was saved with.
    await page.getByRole("button", { name: "Save this map" }).click();
    const dialog = page.getByRole("dialog", { name: "Save this map" });
    await dialog.getByLabel("Name").fill("London on 40 m, November");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("heading", { name: "Saved coverage maps" })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { name: "No coverage map yet" })).toBeVisible();
    const row = page.getByRole("listitem").filter({ hasText: "London on 40 m, November" });
    await row.getByRole("button", { name: "Open" }).click();
    await expect(page.getByRole("heading", { name: "What this map rests on" })).toBeVisible();
    await row.getByRole("button", { name: "Delete" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
    await expect(page.getByRole("heading", { name: "Saved coverage maps" })).toHaveCount(0);
    expect(errors).toEqual([]);
  });
});
