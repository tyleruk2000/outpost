/**
 * Satellite imagery, from an empty map to a printed page: the button says what it needs
 * before anything is installed; the world is added through Add a place from a stand-in for
 * NASA after its size is shown; an area's pictures are added through Add a place too (Add this
 * view, the Satellite pictures tick), its day picked and its figures read before it is fetched
 * from a stand-in for Sentinel-2; then the map shows the area's
 * picture over the world's, with the map's names on top and the picture's credit and day
 * beside it, and a printed page carries both. The stand-ins' pictures are each one strong
 * colour (apps/server/test/fixtures/maps/imagery-stand-in.ts), so a pixel says which is
 * showing.
 */
import fs from "node:fs";
import type { Page } from "@playwright/test";
import { api, expect, test, watchForErrors } from "./fixtures";
import { centreOf, mapReady, settled } from "./grey-line";
import { type InstalledTestMaps, installTestMaps, keep, readPdf, removeTestMaps } from "./map-fixture";

/** Inside the stand-in scene, on open land of the test map. */
const IN_AREA = { lat: 53.06, lon: -4.09 };
/** East of the scene: only the world's picture is here. */
const OUTSIDE = { lat: 53.06, lon: -3.96 };

/** The colour of a few pixels round a point. */
async function colourAt(page: Page, at: { x: number; y: number }): Promise<[number, number, number]> {
  const shot = await page.screenshot({ clip: { x: at.x - 3, y: at.y - 3, width: 6, height: 6 } });
  return page.evaluate(async (png) => {
    const bytes = Uint8Array.from(atob(png), (character) => character.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext("2d")!;
    context.drawImage(bitmap, 0, 0);
    const { data } = context.getImageData(0, 0, bitmap.width, bitmap.height);
    const sum = [0, 0, 0];
    for (let index = 0; index < data.length; index += 4) for (let c = 0; c < 3; c += 1) sum[c]! += data[index + c]!;
    const n = data.length / 4;
    return [sum[0]! / n, sum[1]! / n, sum[2]! / n] as [number, number, number];
  }, shot.toString("base64"));
}

/** The place in the test map whose name is looked for over the picture; inside the scene. */
const CAPEL_PRAWF = { lat: 53.092, lon: -4.115 };

/** How many pixels in a rectangle are near white: a name's halo in the page colour, not the red picture. */
async function lightPixels(page: Page, clip: { x: number; y: number; width: number; height: number }): Promise<number> {
  const shot = await page.screenshot({ clip });
  return page.evaluate(async (png) => {
    const bytes = Uint8Array.from(atob(png), (character) => character.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext("2d")!;
    context.drawImage(bitmap, 0, 0);
    const { data } = context.getImageData(0, 0, bitmap.width, bitmap.height);
    let count = 0;
    for (let index = 0; index < data.length; index += 4) {
      if (0.2126 * data[index]! + 0.7152 * data[index + 1]! + 0.0722 * data[index + 2]! > 225) count += 1;
    }
    return count;
  }, shot.toString("base64"));
}

const reddish = ([r, g, b]: [number, number, number]) => r > g + 60 && r > b + 60;
const bluish = ([r, g, b]: [number, number, number]) => b > r + 60 && b > g + 40;

async function openAt(page: Page, at: { lat: number; lon: number }, zoom = 13) {
  await page.goto(`/maps?lat=${at.lat}&lon=${at.lon}&z=${zoom}`);
  await mapReady(page);
  const dismiss = page.getByRole("button", { name: "Dismiss" });
  if (await dismiss.isVisible()) await dismiss.click();
}

/** A point beside the centre cross, clear of it and of the test map's roads (an east–west one runs just below the centre). */
async function besideCentre(page: Page) {
  const centre = await centreOf(page);
  return { x: centre.x + 40, y: centre.y - 60 };
}

test.describe("satellite imagery", () => {
  test.describe.configure({ mode: "serial" });
  let installed: InstalledTestMaps | undefined;

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    installed = await installTestMaps(page);
    await page.close();
  });

  test.afterAll(async ({ browser }) => {
    const page = await browser.newPage();
    const overview = await api<{ sets: Array<{ id: string }> }>(page, "GET", "/api/maps/imagery");
    for (const set of overview.sets) {
      await page.request.delete(`/api/collections/${set.id}?deleteFiles=true`, { headers: { "X-Outpost-Request": "1" } });
    }
    await removeTestMaps(page, installed);
    await page.close();
  });

  test("with none installed, the button says what to get and where; the world comes after its size is shown", async ({ page }) => {
    const errors = watchForErrors(page);
    await openAt(page, IN_AREA);
    const button = page.getByRole("button", { name: "Satellite: none downloaded yet" });
    await expect(button).toBeVisible();
    await button.click();
    await expect(button).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByText(/No satellite pictures are downloaded yet/)).toBeVisible();

    // Added like any other map data: Add a place, the whole world, the Satellite pictures tick.
    await page.goto("/maps/data?add=1&world=1");
    const dialog = page.getByRole("dialog", { name: "Add a place" });
    await expect(dialog.getByRole("heading", { name: "What for The whole world?" })).toBeVisible();
    const map = dialog.getByRole("checkbox", { name: /^Map/ });
    if (await map.isChecked()) await map.click();
    await dialog.getByRole("checkbox", { name: /Satellite pictures/ }).click();
    await expect(dialog.getByText(/fetches .* from NASA; about .* kept\. Free, no account\./)).toBeVisible();
    const small = dialog.getByRole("radio", { name: /The world, 2 km a pixel/ });
    if (await small.isVisible()) await small.click();
    await dialog.getByRole("button", { name: "Check size" }).click();
    await dialog.getByRole("button", { name: /^Download · / }).click();
    await expect(dialog).toBeHidden();
    await expect
      .poll(
        async () =>
          (await api<{ sets: Array<{ imageDateText: string }> }>(page, "GET", "/api/maps/imagery")).sets.map((set) => set.imageDateText),
        {
          timeout: 30_000,
        },
      )
      .toContain("July 2004");
    expect(errors).toEqual([]);
  });

  test("an area's picture is added through Add a place: its day picked and its figures read before it is fetched", async ({ page }) => {
    const errors = watchForErrors(page);
    await openAt(page, IN_AREA, 13.5);
    await page.getByRole("tab", { name: "Offline maps" }).click();
    await page.getByRole("button", { name: "Add this view" }).click();
    const dialog = page.getByRole("dialog", { name: "Add a place" });
    await dialog.getByRole("textbox", { name: "Name" }).fill("Test valley");
    await expect(dialog.getByRole("heading", { name: "What for Test valley?" })).toBeVisible();
    const map = dialog.getByRole("checkbox", { name: /^Map/ });
    if (await map.isChecked()) await map.click();
    await dialog.getByRole("checkbox", { name: /Satellite pictures/ }).click();
    await dialog.getByRole("button", { name: "Choose the picture" }).click();
    await expect(dialog.getByRole("heading", { name: "Satellite pictures of Test valley" })).toBeVisible();
    await dialog.getByRole("radio", { name: /12 July 2026/ }).click();
    await dialog.getByRole("button", { name: "Continue" }).click();

    const figures = dialog.getByRole("definition");
    await expect(dialog.getByText("To fetch")).toBeVisible({ timeout: 20_000 });
    await expect(dialog.getByText("Cloud over the area")).toBeVisible();
    await expect(figures.filter({ hasText: /requests/ })).toBeVisible();
    await expect(figures.filter({ hasText: /^FreeNo account and no bill/ })).toBeVisible();
    await expect(dialog.getByText(/one moment's picture, not a seamless mosaic/)).toBeVisible();
    await dialog.getByRole("button", { name: /^Download · / }).click();
    await expect(dialog).toBeHidden();

    // A row on Offline maps like every other place, its satellite pictures said with the same marks.
    const row = page.locator('[data-pattern="row"]').filter({ hasText: "Test valley" });
    await expect(row).toBeVisible({ timeout: 30_000 });
    await expect(row.locator('[data-pattern="state"][data-state="ready"]')).toHaveCount(1, { timeout: 30_000 });
    const sets = await api<{ sets: Array<{ name: string; imageDateText: string }> }>(page, "GET", "/api/maps/imagery");
    expect(sets.sets.find((set) => set.name === "Test valley")?.imageDateText).toBe("12 July 2026");
    expect(errors).toEqual([]);
  });

  test("the map shows the area's picture over the world's, names on top, credited with its day; and prints it", async ({
    page,
  }, testInfo) => {
    test.setTimeout(180_000);
    const errors = watchForErrors(page);
    await openAt(page, IN_AREA);
    await page.mouse.move(5, 5);
    const spot = await besideCentre(page);
    const before = await colourAt(page, spot);
    expect(reddish(before)).toBe(false);

    const button = page.getByRole("button", { name: "Satellite imagery" });
    await button.click();
    await expect(button).toHaveAttribute("aria-pressed", "true");
    await settled(page);
    await page.mouse.move(5, 5);
    await expect.poll(async () => reddish(await colourAt(page, spot)), { message: "the area's picture" }).toBe(true);
    // Its credit, word for word, with the day the picture was taken.
    await expect(page.getByRole("link", { name: "Contains modified Copernicus Sentinel data 2026" })).toBeVisible();
    await expect(page.getByText(/Imagery 12 July 2026/).first()).toBeVisible();

    // The names of the map are drawn over the picture, on their halo: light pixels round a place's name.
    await openAt(page, CAPEL_PRAWF);
    await page.mouse.move(5, 5);
    const centre = await centreOf(page);
    await expect
      .poll(async () => lightPixels(page, { x: centre.x - 90, y: centre.y - 40, width: 180, height: 80 }), { message: "a name's halo" })
      .toBeGreaterThan(40);

    // Outside the area, the world's picture shows beneath, not a hole.
    await openAt(page, OUTSIDE);
    await page.mouse.move(5, 5);
    await expect.poll(async () => bluish(await colourAt(page, await besideCentre(page))), { message: "the world's picture" }).toBe(true);
    // Remembered on this device.
    await expect(page.getByRole("button", { name: "Satellite imagery" })).toHaveAttribute("aria-pressed", "true");

    // Printed: ticked to start with, drawn, and credited on the sheet.
    await openAt(page, IN_AREA, 12.5);
    await page.getByRole("button", { name: "Print or save as PDF" }).click();
    await page.getByRole("combobox", { name: "Scale" }).click();
    await page.getByRole("option", { name: /1:25,000/ }).click();
    await page.getByRole("button", { name: "Preview the page" }).click();
    const dialog = page.getByRole("dialog", { name: "Print or save as PDF" });
    await expect(dialog.getByRole("checkbox", { name: /Satellite imagery/ })).toBeChecked();
    const sheet = dialog.getByRole("img", { name: /Preview of the page/ });
    // The lettering is set in lines, so a credit may be broken between two.
    await expect(sheet).toContainText(/Contains\s*modified\s*Copernicus\s*Sentinel\s*data\s*2026/, { timeout: 30_000 });
    await expect(sheet).toContainText(/NASA\s*Earth\s*Observatory/);
    await expect(sheet).toContainText(/taken on 12 July 2026 and in July 2004, not on the day this page was made/);
    await expect(dialog.getByText("Drawing the preview")).toBeHidden({ timeout: 30_000 });
    await dialog.getByRole("button", { name: "Make the PDF" }).click();
    const save = dialog.getByRole("link", { name: "Save as PDF" });
    await expect(save).toBeVisible({ timeout: 120_000 });
    const downloading = page.waitForEvent("download");
    await save.click();
    const bytes = fs.readFileSync(await (await downloading).path());
    await keep(testInfo, "satellite.pdf", bytes, "application/pdf");
    const pdf = readPdf(bytes);
    expect(pdf.text).toContain("Sentinel_Data_Legal_Notice");
    expect(pdf.text).toContain("12 July 2026");
    expect(errors).toEqual([]);
  });
});
