import { expect, test, watchForErrors } from "./fixtures";

/** A short walk with climbing in it, as a GPS would record it. */
function gpx(): Buffer {
  const points = Array.from({ length: 40 }, (_, index) => {
    const lat = 53.1163 - index * 0.0012;
    const lon = -4.1191 + index * 0.0011;
    return `<trkpt lat="${lat.toFixed(5)}" lon="${lon.toFixed(5)}"><ele>${(115 + index * 24).toFixed(1)}</ele></trkpt>`;
  }).join("\n");
  return Buffer.from(
    `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="outpost e2e" xmlns="http://www.topografix.com/GPX/1/1">\n<wpt lat="53.0685" lon="-4.0763"><ele>1085</ele><name>Summit cairn</name></wpt>\n<trk><name>Morning climb</name><trkseg>\n${points}\n</trkseg></trk>\n</gpx>\n`,
  );
}

test.describe("maps", () => {
  test.describe.configure({ mode: "serial" });

  test("opens with no maps installed and says how to get one, without reaching for the internet", async ({ page }) => {
    const errors = watchForErrors(page);
    await page.goto("/maps");
    await expect(page.getByRole("heading", { name: "Maps", level: 1 })).toBeVisible();
    await expect(page.getByText("No detailed maps on this device yet")).toBeVisible();
    await expect(page.getByRole("searchbox", { name: "Search the map" }).or(page.getByLabel("Search the map"))).toBeVisible();
    // The map itself is drawn (the bundled world outline), not a blank box.
    await expect(page.locator("canvas").first()).toBeVisible({ timeout: 15_000 });
    expect(errors).toEqual([]);
  });

  test("finds a British grid reference and saves it as a place", async ({ page }) => {
    await page.goto("/maps");
    const search = page.getByLabel("Search the map");
    await search.fill("SH 609 543");
    const option = page.getByRole("option", { name: /SH 609 543/ });
    await expect(option).toBeVisible();
    await expect(option).toContainText("Grid reference");
    await option.click();
    await page.getByRole("button", { name: "Save this place" }).click();
    // The form opens with the reference as the name and its position worked out.
    await expect(page.getByRole("heading", { name: "New place" })).toBeVisible();
    await expect(page.getByText("53.06824, -4.07675").first()).toBeVisible();
    await page.getByRole("textbox", { name: "Name" }).fill("Summit");
    await page.getByRole("button", { name: "Save place" }).click();
    await expect(page.getByText(/1 place\b/)).toBeVisible();
    await expect(page.getByText("Summit", { exact: true }).first()).toBeVisible();
  });

  test("imports a GPX route and shows its distance, climb and profile", async ({ page }) => {
    await page.goto("/maps");
    await page.getByRole("tab", { name: /Routes/ }).click();
    await expect(page.getByText("No routes yet")).toBeVisible();
    const chooser = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "Import GPX" }).click();
    await (await chooser).setFiles([{ name: "morning-climb.gpx", mimeType: "application/gpx+xml", buffer: gpx() }]);
    const dialog = page.getByRole("dialog", { name: "Import a GPX file" });
    await expect(dialog.getByText("morning-climb.gpx")).toBeVisible();
    await dialog.getByRole("checkbox", { name: /Also save its waypoints as places/ }).check();
    await dialog.getByRole("button", { name: "Import" }).click();

    // The dialog reports what was imported before anything else happens.
    await expect(dialog.getByText("Morning climb")).toBeVisible();
    await expect(dialog.getByText("5.94 km (3.69 mi)")).toBeVisible();
    await expect(dialog.getByText("936 m", { exact: true })).toBeVisible();
    await expect(dialog.getByText("1 place", { exact: true })).toBeVisible();
    await dialog.getByRole("button", { name: "Show on the map" }).click();

    await expect(page.getByRole("heading", { name: "Morning climb" })).toBeVisible();
    await expect(page.getByText(/Lowest 115 m, highest 1,051 m/)).toBeVisible();
    await expect(page.getByText("40 points")).toBeVisible();

    // The waypoint came along as a saved place.
    await page.getByRole("tab", { name: /Places/ }).click();
    await expect(page.getByText("Summit cairn")).toBeVisible();
  });

  test("refuses a file that is not GPX and says so", async ({ page }) => {
    await page.goto("/maps");
    await page.getByRole("tab", { name: /Routes/ }).click();
    const chooser = page.waitForEvent("filechooser");
    await page
      .getByRole("button", { name: /Import GPX/ })
      .first()
      .click();
    await (await chooser).setFiles([{ name: "broken.gpx", mimeType: "application/gpx+xml", buffer: Buffer.from("this is not a route") }]);
    const dialog = page.getByRole("dialog", { name: "Import a GPX file" });
    await dialog.getByRole("button", { name: "Import" }).click();
    await expect(dialog.getByText("broken.gpx was not imported")).toBeVisible();
    await expect(dialog.getByText("That file is not well-formed XML, so it cannot be read as GPX.")).toBeVisible();
    // Nothing was added.
    await dialog.getByRole("button", { name: "Done" }).click();
    await expect(page.getByText("1 route", { exact: true })).toBeVisible();
  });
});
