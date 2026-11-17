import { checkDiagrams } from "./diagrams";
import { expect, test, watchForErrors } from "./fixtures";

/**
 * The compass on a phone: from Tools, a grid reference typed as the place, the rule
 * between map and compass there, a bearing converted, and the live compass fed a heading
 * the way an Android phone gives one (the test browser has no compass of its own, so the
 * event is made here). Then the map's centre card, whose magnetic line opens the screen
 * for the middle of the map.
 */
test.describe("the compass, on a phone", () => {
  // What a phone's browser grants a page by default; the test browser asks for it to be said.
  test.use({ permissions: ["accelerometer", "gyroscope", "magnetometer"] });

  test("gives the rule for a map and compass, converts a bearing, and shows a live heading", async ({ page }) => {
    test.setTimeout(60_000);
    const errors = watchForErrors(page);
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    await page.goto("/tools");
    await page.getByRole("link", { name: /^Compass/ }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Compass" })).toBeVisible();

    await page.getByRole("combobox", { name: "Place" }).click();
    await page.getByRole("option", { name: "A position or locator" }).click();
    await page.getByLabel("Position or locator").fill("NY 21548 07214");
    const norths = page.getByRole("region", { name: "North here" });
    await expect(norths.getByText("With an Ordnance Survey map here")).toBeVisible();
    await expect(norths.getByText(/^(Map to compass: (add|subtract) \d+°|Map and compass agree here)/)).toBeVisible();
    await expect(norths.getByText(/^Grid north is [\d.]+° west of true north here\.$/)).toBeVisible();
    expect(await overflow()).toBeLessThanOrEqual(1);

    const convert = page.getByRole("region", { name: "Convert a bearing" });
    await convert.getByRole("textbox", { name: "Bearing" }).fill("45");
    await expect(convert.getByText(/^True 04\d° · Magnetic 04\d°$/)).toBeVisible();

    const live = page.getByRole("region", { name: "Live compass" });
    await live.getByRole("button", { name: "Start the compass" }).click();
    await expect(live.getByText("Waiting for the phone's compass.")).toBeVisible();
    // An Android phone lying flat with its top to the east: alpha counts anticlockwise from north.
    await page.evaluate(() =>
      window.dispatchEvent(new DeviceOrientationEvent("deviceorientationabsolute", { alpha: 270, beta: 0, gamma: 0, absolute: true })),
    );
    await expect(live.getByText("Magnetic bearing of the top of the phone")).toBeVisible();
    await expect(live.getByText("090° E", { exact: true })).toBeVisible();
    await live.getByRole("radio", { name: "Grid" }).click();
    await expect(live.getByText("Grid bearing of the top of the phone")).toBeVisible();
    await live.getByRole("button", { name: "Stop the compass" }).click();
    await expect(live.getByRole("button", { name: "Start the compass" })).toBeVisible();
    expect(await overflow()).toBeLessThanOrEqual(1);
    expect(errors).toEqual([]);
  });

  test("draws the norths and map to compass, labels apart, at 390 px", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/tools/compass?lat=54.45&lon=-3.09");
    await page.getByRole("region", { name: "Convert a bearing" }).getByRole("textbox", { name: "Bearing" }).fill("90");
    const drawn = await checkDiagrams(page);
    expect(drawn.map((each) => each.name)).toEqual(["norths-rose", "map-to-compass"]);
    expect(drawn[0]!.label).toMatch(/drawn \d+ times their real size/);
    expect(drawn[1]!.label).toMatch(/the way is 090° from grid north/);
  });

  test("says when the device gives no heading", async ({ page }) => {
    await page.goto("/tools/compass");
    const live = page.getByRole("region", { name: "Live compass" });
    await live.getByRole("button", { name: "Start the compass" }).click();
    await expect(live.getByText("This device gives no compass heading")).toBeVisible({ timeout: 8000 });
    await expect(live.getByRole("link", { name: "Settings, “HTTPS on your network”" })).toHaveAttribute("href", "/settings#https");
  });

  test("the map's centre card says where magnetic north is and opens the compass there", async ({ page }) => {
    await page.goto("/maps");
    const line = page.locator("[data-magnetic-glance]");
    await expect(line).toBeVisible({ timeout: 15_000 });
    await expect(line).toHaveText(/^Magnetic \d+\.\d° [EW]$|^Magnetic 0\.0°$/);
    await line.click();
    await expect(page).toHaveURL(/\/tools\/compass\?lat=-?\d+\.\d+&lon=-?\d+\.\d+$/);
    await expect(page.getByRole("region", { name: "North here" }).getByText(/^Magnetic north is .* of true north here, in /)).toBeVisible();
  });
});
