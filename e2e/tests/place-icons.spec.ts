/**
 * An icon for a saved place, from choosing it to seeing it: in the editor, on the pin, in
 * the list, on the map itself, in the GPX file that is exported, and back again from that
 * file.
 *
 * "On the map" is checked by looking at what the map drew. The place is put at the centre
 * of the map, the screen there is read pixel by pixel, and the same spot is read again
 * with the place as a plain pin: a place with an icon is a larger disc of its colour with
 * the icon's strokes in white across the middle of it, and a plain pin is neither.
 */
import type { Page } from "@playwright/test";
import { api, expect, test, watchForErrors } from "./fixtures";

const PLACE = { lat: 54.461, lon: -3.184 };
const VIEW = `/maps?lat=${PLACE.lat}&lon=${PLACE.lon}&z=13`;
/** "green" of the marker colours, and how near a pixel has to be to count as it. */
const GREEN = [61, 145, 80] as const;

const mapReady = async (page: Page) => {
  await expect(page.locator("canvas").first()).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.outpost-map[data-map-idle="true"]')).toBeVisible({ timeout: 15_000 });
};

/** Where the centre of the map is on screen: the cross is put there by the map itself. */
async function centreOf(page: Page): Promise<{ x: number; y: number }> {
  const box = await page.locator("[data-centre-mark]").boundingBox();
  expect(box, "the cross at the centre of the map").not.toBeNull();
  // The cross is a small box with the point in its middle.
  return { x: Math.round(box!.x + box!.width / 2), y: Math.round(box!.y + box!.height / 2) };
}

/**
 * What the map has drawn round a point: how much of the ring between 8 and 10 pixels out
 * is the place's colour, and how many pixels within 6 of the middle are white.
 */
async function drawnAt(
  page: Page,
  at: { x: number; y: number },
): Promise<{ ringInColour: number; whiteInMiddle: number; colourInMiddle: number }> {
  const half = 14;
  const shot = await page.screenshot({ clip: { x: at.x - half, y: at.y - half, width: half * 2, height: half * 2 } });
  return page.evaluate(
    async ({ png, half, colour }) => {
      const bytes = Uint8Array.from(atob(png), (character) => character.charCodeAt(0));
      const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const context = canvas.getContext("2d")!;
      context.drawImage(bitmap, 0, 0);
      const { data, width } = context.getImageData(0, 0, bitmap.width, bitmap.height);
      // The screenshot may be at more than one pixel to the map's pixel.
      const scale = bitmap.width / (half * 2);
      const near = (index: number, [r, g, b]: readonly number[], within: number) =>
        Math.abs(data[index]! - r!) <= within && Math.abs(data[index + 1]! - g!) <= within && Math.abs(data[index + 2]! - b!) <= within;
      let ring = 0;
      let ringInColour = 0;
      let whiteInMiddle = 0;
      let colourInMiddle = 0;
      for (let y = 0; y < bitmap.height; y += 1) {
        for (let x = 0; x < bitmap.width; x += 1) {
          const distance = Math.hypot(x / scale - half + 0.5, y / scale - half + 0.5);
          const index = (y * width + x) * 4;
          if (distance >= 8 && distance <= 10) {
            ring += 1;
            if (near(index, colour, 28)) ringInColour += 1;
          } else if (distance <= 6) {
            if (near(index, [255, 255, 255], 40)) whiteInMiddle += 1;
            if (near(index, colour, 28)) colourInMiddle += 1;
          }
        }
      }
      return { ringInColour: ringInColour / ring, whiteInMiddle, colourInMiddle };
    },
    { png: shot.toString("base64"), half, colour: GREEN },
  );
}

test.describe("icons for saved places", () => {
  test.beforeEach(async ({ page }) => {
    for (const marker of (await api(page, "GET", "/api/maps/markers")).markers) await api(page, "DELETE", `/api/maps/markers/${marker.id}`);
  });
  test.afterEach(async ({ page }) => {
    for (const marker of (await api(page, "GET", "/api/maps/markers")).markers) await api(page, "DELETE", `/api/maps/markers/${marker.id}`);
  });

  test("a place is given an icon, shown with it on the map and in the list, exported with it and brought back with it", async ({
    page,
  }) => {
    const errors = watchForErrors(page);
    await page.goto(VIEW);
    await mapReady(page);
    const dismiss = page.getByRole("button", { name: "Dismiss" });
    if (await dismiss.isVisible()) await dismiss.click();

    // ── Saved, with an icon chosen beside the colour ──
    await page.getByLabel("Search the map").fill(`${PLACE.lat}, ${PLACE.lon}`);
    await page.getByRole("option").first().click();
    await page.getByRole("button", { name: "Save this place" }).click();
    await expect(page.getByRole("heading", { name: "New place" })).toBeVisible();
    await page.getByRole("textbox", { name: "Name" }).fill("Esk Hause shelter");
    await page.getByRole("radiogroup", { name: "Colour" }).getByRole("radio", { name: "Green" }).click();

    const icons = page.getByRole("radiogroup", { name: "Icon" });
    await expect(icons.getByRole("radio")).toHaveCount(16);
    // A new place is a plain pin until an icon is chosen.
    await expect(icons.getByRole("radio", { name: "Pin" })).toBeChecked();
    await expect(page.locator(".outpost-pin svg")).toHaveCount(0);
    // From the keyboard: the arrow keys move through the set and choose. A key is down for longer than it
    // takes the focus to move, which is when the icon it lands on is chosen.
    await icons.getByRole("radio", { name: "Pin" }).focus();
    for (const lands of ["Home", "Shelter or hut"]) {
      await page.keyboard.down("ArrowRight");
      await expect(icons.getByRole("radio", { name: lands })).toBeChecked();
      await page.keyboard.up("ArrowRight");
    }
    // The pin on the map carries the icon as soon as it is chosen, and the heading shows it.
    await expect(page.locator(".outpost-pin svg")).toBeVisible();
    await expect(page.getByRole("heading", { name: "New place" }).locator('[data-place-icon="shelter"]')).toBeVisible();
    await page.getByRole("button", { name: "Save place" }).click();

    // ── In the list ──
    // Its icon's name is read out after the place's own.
    const row = page.getByRole("button", { name: /^Esk Hause shelter\s*, Shelter or hut/ });
    await expect(row).toBeVisible();
    await expect(row.locator('[data-place-icon="shelter"] svg')).toBeVisible();
    const [saved] = (await api(page, "GET", "/api/maps/markers")).markers;
    expect(saved).toMatchObject({ name: "Esk Hause shelter", icon: "shelter", color: "green" });

    // ── In the map's own search ──
    await page.getByLabel("Search the map").fill("esk hause");
    await expect(page.getByRole("option", { name: /Esk Hause shelter/ }).locator('[data-place-icon="shelter"]')).toBeVisible();
    await page.getByLabel("Search the map").fill("");

    // ── On the map ──
    await page.goto(VIEW);
    await mapReady(page);
    if (await dismiss.isVisible()) await dismiss.click();
    const centre = await centreOf(page);
    // The pointer over the map, away from the place: the cross gives way, and the place is seen as drawn.
    await page.mouse.move(centre.x + 150, centre.y + 120);
    await expect(page.locator("[data-centre-mark]")).toBeHidden();
    await expect
      .poll(async () => (await drawnAt(page, centre)).ringInColour, {
        message: "a disc of the place's colour, 11 pixels out from its middle",
      })
      .toBeGreaterThan(0.85);
    const withIcon = await drawnAt(page, centre);
    // The strokes of the icon, in white, across the middle of the disc.
    expect(withIcon.whiteInMiddle).toBeGreaterThan(12);
    expect(withIcon.colourInMiddle).toBeGreaterThan(40);

    // The same place as a plain pin is the small dot it always was: nothing of its colour that far out, no strokes in the middle.
    await api(page, "PATCH", `/api/maps/markers/${saved.id}`, { icon: "pin" });
    await expect
      .poll(async () => (await drawnAt(page, centre)).ringInColour, { message: "a plain pin is 6.5 pixels across" })
      .toBeLessThan(0.1);
    const plain = await drawnAt(page, centre);
    expect(plain.whiteInMiddle).toBeLessThanOrEqual(2);
    expect(plain.colourInMiddle).toBeGreaterThan(80);
    await api(page, "PATCH", `/api/maps/markers/${saved.id}`, { icon: "shelter" });
    await expect.poll(async () => (await drawnAt(page, centre)).ringInColour).toBeGreaterThan(0.85);

    // ── Exported: a symbol other programs know, beside the name ──
    const exported = await page.request.get("/api/maps/export.gpx?markers=1");
    expect(exported.ok()).toBe(true);
    const gpx = await exported.text();
    expect(gpx).toMatch(/<wpt lat="54\.461" lon="-3\.184">[\s\S]*?<name>Esk Hause shelter<\/name>\s*<sym>Lodge<\/sym>[\s\S]*?<\/wpt>/);

    // ── And brought back from that file, into a map with no places ──
    await api(page, "DELETE", `/api/maps/markers/${saved.id}`);
    await page.getByRole("tab", { name: /Places/ }).click();
    await expect(page.getByRole("heading", { name: "No saved places yet" })).toBeVisible();
    await page.getByRole("tab", { name: /Routes/ }).click();
    const chooser = page.waitForEvent("filechooser");
    await page
      .getByRole("button", { name: /Import GPX/ })
      .first()
      .click();
    await (await chooser).setFiles([{ name: "places.gpx", mimeType: "application/gpx+xml", buffer: Buffer.from(gpx) }]);
    const dialog = page.getByRole("dialog", { name: "Import a GPX file" });
    await dialog.getByRole("checkbox", { name: /Also save its waypoints as places/ }).check();
    await dialog.getByRole("button", { name: "Import" }).click();
    await expect(dialog.getByText(/1 waypoint from it was saved as places\./)).toBeVisible();
    await dialog.getByRole("button", { name: "Close" }).first().click();

    await page.getByRole("tab", { name: /Places/ }).click();
    const back = page.getByRole("button", { name: /^Esk Hause shelter\s*, Shelter or hut/ });
    await expect(back.first()).toBeVisible();
    const [returned] = (await api(page, "GET", "/api/maps/markers")).markers;
    expect(returned).toMatchObject({ name: "Esk Hause shelter", icon: "shelter", lat: PLACE.lat, lon: PLACE.lon });
    expect(returned.id).not.toBe(saved.id);
    // Exported once more, the file says the same.
    expect(await (await page.request.get("/api/maps/export.gpx?markers=1")).text()).toContain("<sym>Lodge</sym>");
    expect(errors).toEqual([]);
  });

  test("a symbol Outpost has no icon for comes in as a plain pin and goes out as it came", async ({ page }) => {
    const gpx = `<?xml version="1.0"?><gpx version="1.1" creator="e2e" xmlns="http://www.topografix.com/GPX/1/1"><wpt lat="54.47" lon="-3.19"><name>Cache twelve</name><sym>Geocache</sym></wpt><wpt lat="54.48" lon="-3.2"><name>Wasdale Head</name><sym>Campground</sym></wpt></gpx>`;
    await page.goto(VIEW);
    await mapReady(page);
    await page.getByRole("tab", { name: /Routes/ }).click();
    const chooser = page.waitForEvent("filechooser");
    await page
      .getByRole("button", { name: /Import GPX/ })
      .first()
      .click();
    await (await chooser).setFiles([{ name: "trip.gpx", mimeType: "application/gpx+xml", buffer: Buffer.from(gpx) }]);
    const dialog = page.getByRole("dialog", { name: "Import a GPX file" });
    await dialog.getByRole("checkbox", { name: /Also save its waypoints as places/ }).check();
    await dialog.getByRole("button", { name: "Import" }).click();
    await expect(dialog.getByText(/2 waypoints from it were saved as places/)).toBeVisible();
    await dialog.getByRole("button", { name: "Close" }).first().click();

    await page.getByRole("tab", { name: /Places/ }).click();
    await expect(page.getByRole("button", { name: /^Wasdale Head\s*, Camp/ }).locator('[data-place-icon="tent"]')).toBeVisible();
    await expect(page.getByRole("button", { name: "Cache twelve", exact: true }).locator('[data-place-icon="pin"]')).toBeVisible();
    const out = await (await page.request.get("/api/maps/export.gpx?markers=1")).text();
    expect(out).toContain("<sym>Geocache</sym>");
    expect(out).toContain("<sym>Campground</sym>");
  });
});
