import fs from "node:fs";
import { api, expect, test, watchForErrors } from "./fixtures";

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

/**
 * Where a click lands on the ground, worked out independently of the app: the map is
 * Web Mercator, `zoom` 0 is one 512 px tile, and the view's centre is the centre of the
 * map's box.
 */
function positionAt(view: { lat: number; lon: number; zoom: number }, dx: number, dy: number): { lat: number; lon: number } {
  const world = 512 * 2 ** view.zoom;
  const radians = (view.lat * Math.PI) / 180;
  const x = (view.lon + 180) / 360 + dx / world;
  const y = (1 - Math.log(Math.tan(radians) + 1 / Math.cos(radians)) / Math.PI) / 2 + dy / world;
  return { lon: x * 360 - 180, lat: (Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180) / Math.PI };
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

  test("draws a three-point route, saves it and exports it as GPX with the points that were placed", async ({ page }) => {
    const errors = watchForErrors(page);
    const view = { lat: 53.07, lon: -4.07, zoom: 11 };
    await page.goto(`/maps?lat=${view.lat}&lon=${view.lon}&z=${view.zoom}`);
    await page.locator('.outpost-map[data-map-idle="true"]').waitFor({ timeout: 20_000 });
    await page.getByRole("tab", { name: /Routes/ }).click();
    // The Routes tab's own button; the map's tool column has one too.
    await page.getByLabel("Places, routes and offline maps").getByRole("button", { name: "Draw a route" }).click();
    // Said where drawing starts: what this is, and what it is not.
    await expect(page.getByText(/straight lines between the points you place\. It does not follow paths or roads/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Save route" })).toBeDisabled();

    const box = (await page.locator(".outpost-map").boundingBox())!;
    const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const offsets = [
      [-180, -120],
      [0, 0],
      [150, -60],
    ] as const;
    for (const [dx, dy] of offsets) await page.mouse.click(centre.x + dx, centre.y + dy);
    const points = page.getByRole("list", { name: "Points of the route, in order" }).getByRole("listitem");
    await expect(points).toHaveCount(3);

    // The length so far is shown while drawing, and matches the three points.
    const expected = offsets.map(([dx, dy]) => positionAt(view, dx, dy));
    const metres = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => {
      const rad = Math.PI / 180;
      const h =
        Math.sin(((b.lat - a.lat) * rad) / 2) ** 2 +
        Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(((b.lon - a.lon) * rad) / 2) ** 2;
      return 2 * 6_371_008.8 * Math.asin(Math.sqrt(h));
    };
    const length = metres(expected[0]!, expected[1]!) + metres(expected[1]!, expected[2]!);
    const readout = (await page.locator("form [aria-live]").first().textContent()) ?? "";
    expect(Number(/^([\d.]+) km/.exec(readout)?.[1])).toBeCloseTo(length / 1000, 1);

    // Undo takes the last point away; redo brings it back.
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(points).toHaveCount(2);
    await page.getByRole("button", { name: "Redo" }).click();
    await expect(points).toHaveCount(3);

    // Closing with unsaved points asks first.
    await page.getByRole("button", { name: "Cancel" }).click();
    const question = page.getByRole("alertdialog", { name: "Discard this route?" });
    await expect(question).toBeVisible();
    await question.getByRole("button", { name: "Keep drawing" }).click();
    await expect(points).toHaveCount(3);

    await page.getByRole("textbox", { name: "Name" }).fill("Three points");
    await page.getByRole("radio", { name: "Violet" }).click();
    await page.getByRole("button", { name: "Save route" }).click();

    // It is now a route like any other. No terrain is installed here, and the panel says why there is no profile.
    await expect(page.getByRole("heading", { name: "Three points" })).toBeVisible();
    await expect(page.getByText("3 points", { exact: true })).toBeVisible();
    await expect(page.getByText(/No terrain is installed where this route runs/)).toBeVisible();

    const downloading = page.waitForEvent("download");
    await page.getByRole("link", { name: "Export as GPX" }).click();
    const download = await downloading;
    expect(download.suggestedFilename()).toBe("Three points.gpx");
    const gpx = fs.readFileSync(await download.path(), "utf8");
    expect(gpx).toContain('<gpx version="1.1" creator="Outpost" xmlns="http://www.topografix.com/GPX/1/1">');
    expect(gpx).toContain("<trk>\n    <name>Three points</name>");
    expect(gpx).not.toContain("<time>");
    const written = [...gpx.matchAll(/<trkpt lat="(-?[\d.]+)" lon="(-?[\d.]+)"/g)].map((match) => ({
      lat: Number(match[1]),
      lon: Number(match[2]),
    }));
    expect(written).toHaveLength(3);
    for (const [index, point] of written.entries()) {
      // Within a pixel of where the pointer was pressed (a pixel is about 0.0003° here).
      expect(Math.abs(point.lat - expected[index]!.lat), `latitude of point ${index + 1}`).toBeLessThan(0.0003);
      expect(Math.abs(point.lon - expected[index]!.lon), `longitude of point ${index + 1}`).toBeLessThan(0.0004);
    }

    // Listed with the imported route, and found by the map's search box.
    await page.getByRole("button", { name: "Routes", exact: true }).click();
    await expect(page.getByText("2 routes", { exact: true })).toBeVisible();
    await page.getByLabel("Search the map").fill("three poi");
    await expect(page.getByRole("option", { name: /Three points/ })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("asks where a map download is kept before anything is fetched", async ({ page }) => {
    await page.goto("/maps");
    // The shortcut on the first-use card leads to the choices; it does not start a download.
    await page
      .getByRole("button", { name: /World overview/ })
      .first()
      .click();
    await expect(page.getByRole("heading", { name: "World overview" })).toBeVisible();
    const where = page.getByRole("radiogroup", { name: "Where to keep it" });
    await expect(where.getByRole("radio", { name: /Internal storage/ })).toBeChecked();
    await expect(where).toContainText("Default for new downloads");
    await expect(where).toContainText(/free/);
    // The destination is repeated beside the button that would start the download.
    await expect(page.getByText(/Will be kept on Internal storage/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Download", exact: true })).toBeDisabled();

    // Place names ask the same question.
    await page.getByRole("button", { name: "Choose another area" }).click();
    await page.getByRole("button", { name: "Maps on this device" }).click();
    await page.getByRole("radio", { name: /Larger towns and cities only/ }).click();
    await expect(
      page.getByRole("radiogroup", { name: "Where to keep the place names" }).getByRole("radio", { name: /Internal storage/ }),
    ).toBeChecked();
    // Looking at the choices started nothing.
    const { downloads } = await api<{ downloads: Array<{ kind: string }> }>(page, "GET", "/api/downloads");
    expect(downloads.filter((download) => ["map", "terrain", "places"].includes(download.kind))).toEqual([]);
  });
});
