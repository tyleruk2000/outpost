/**
 * What the grey line tests share: reading what the map drew at a point on the screen.
 *
 * The shading is a tint over the map, so whether it is drawn is told by looking: the same
 * spot is read with the grey line off and then on, and night is darker by a margin while
 * day is not changed at all.
 */
import type { Page } from "@playwright/test";
import { expect } from "./fixtures";

export const mapReady = async (page: Page) => {
  await expect(page.locator("canvas").first()).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.outpost-map[data-map-idle="true"]')).toBeVisible({ timeout: 15_000 });
};

/** Where the centre of the map is on screen: the cross is put there by the map itself. */
export async function centreOf(page: Page): Promise<{ x: number; y: number }> {
  const box = await page.locator("[data-centre-mark]").boundingBox();
  expect(box, "the cross at the centre of the map").not.toBeNull();
  return { x: Math.round(box!.x + box!.width / 2), y: Math.round(box!.y + box!.height / 2) };
}

/** How light the map is, from 0 to 255, averaged over a small square round a point. */
export async function lightnessAt(page: Page, at: { x: number; y: number }): Promise<number> {
  const half = 4;
  const shot = await page.screenshot({ clip: { x: at.x - half, y: at.y - half, width: half * 2, height: half * 2 } });
  return page.evaluate(async (png) => {
    const bytes = Uint8Array.from(atob(png), (character) => character.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext("2d")!;
    context.drawImage(bitmap, 0, 0);
    const { data } = context.getImageData(0, 0, bitmap.width, bitmap.height);
    let sum = 0;
    for (let index = 0; index < data.length; index += 4)
      sum += 0.2126 * data[index]! + 0.7152 * data[index + 1]! + 0.0722 * data[index + 2]!;
    return sum / (data.length / 4);
  }, shot.toString("base64"));
}

/** Waits for the map to finish drawing after a change. */
export async function settled(page: Page) {
  await page.waitForTimeout(150);
  await expect(page.locator('.outpost-map[data-map-idle="true"]')).toBeVisible({ timeout: 15_000 });
}
