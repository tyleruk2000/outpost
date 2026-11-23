/**
 * An aerial photograph of an area, from a stand-in for New Zealand's (LINZ's bucket):
 * found beside the satellite's days, its figures and terms read before anything is
 * fetched, then fetched, listed with the season it was flown, drawn on the map and
 * credited to the council that holds its rights. The stand-in's sheet is one strong
 * green (apps/server/test/fixtures/maps/imagery-stand-in.ts), so a pixel says it is there.
 */
import type { Page } from "@playwright/test";
import { api, expect, test, watchForErrors } from "./fixtures";
import { centreOf, mapReady, settled } from "./grey-line";
import { imageryNamed, startAreaPictures } from "./satellite-flow";

/** Inside the stand-in sheet of Christchurch. */
const IN_SHEET = { lat: -43.426, lon: 172.5405 };

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

const greenish = ([r, g, b]: [number, number, number]) => g > r + 80 && g > b + 80;

test.describe("an aerial photograph", () => {
  test.afterAll(async ({ browser }) => {
    const page = await browser.newPage();
    const overview = await api<{ sets: Array<{ id: string }> }>(page, "GET", "/api/maps/imagery");
    for (const set of overview.sets) {
      await page.request.delete(`/api/collections/${set.id}?deleteFiles=true`, { headers: { "X-Outpost-Request": "1" } });
    }
    await page.close();
  });

  test("is offered beside the satellite's days, its figures and terms read before it is fetched, and then drawn and credited", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const errors = watchForErrors(page);
    await page.goto(`/maps?lat=${IN_SHEET.lat}&lon=${IN_SHEET.lon}&z=16`);
    await mapReady(page);
    const dismiss = page.getByRole("button", { name: "Dismiss" });
    if (await dismiss.isVisible()) await dismiss.click();

    const dialog = await startAreaPictures(page, "Test streets");
    await expect(dialog).toContainText(/England's aerial photographs are published only in a closed format/);
    const photo = dialog.getByRole("radio", { name: /Aerial photograph, 2 m/ });
    await expect(photo).toBeVisible({ timeout: 20_000 });
    await expect(dialog.getByText("Christchurch 2m Urban Aerial Photos (2023), flown January to April 2023")).toBeVisible();
    await photo.click();
    await dialog.getByRole("button", { name: "Continue" }).click();

    const figures = dialog.getByLabel("What it will be");
    await expect(figures).toContainText("Christchurch 2m Urban Aerial Photos (2023)", { timeout: 20_000 });
    await expect(figures).toContainText("2 m a pixel");
    await expect(figures).toContainText(/from one of the publisher's files/);
    await expect(figures).toContainText("Creative Commons Attribution 4.0 International (CC BY 4.0)");
    await expect(figures).toContainText("Licensed by Stand-in City Council for re-use under CC-BY-4.0");
    await expect(figures).toContainText(/Free.*not requester-pays/);
    await expect(figures).not.toContainText("Cloud");
    await dialog.getByRole("button", { name: /^Download · / }).click();
    await expect
      .poll(async () => (await imageryNamed(page, "Test streets"))?.imageDateText, { timeout: 30_000 })
      .toBe("January to April 2023");

    await page.goto(`/maps?lat=${IN_SHEET.lat}&lon=${IN_SHEET.lon}&z=15`);
    await mapReady(page);
    const button = page.getByRole("button", { name: "Satellite imagery" });
    await button.click();
    await settled(page);
    await page.mouse.move(5, 5);
    const centre = await centreOf(page);
    await expect
      .poll(async () => greenish(await colourAt(page, { x: centre.x + 40, y: centre.y - 60 })), { message: "the photograph" })
      .toBe(true);
    await expect(page.getByRole("link", { name: "Licensed by Stand-in City Council for re-use under CC-BY-4.0" })).toBeVisible();
    await expect(page.getByText(/Imagery January to April 2023/).first()).toBeVisible();
    expect(errors).toEqual([]);
  });
});
