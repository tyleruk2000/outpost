/**
 * What the estimated-range specs share: the suite's terrain fixture with a repeater
 * between its two ridges, and where the outline is on the screen, found from the
 * pixels a person sees.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import type { Page } from "@playwright/test";
import { api } from "./fixtures";

export const idle = (page: Page) => page.locator('.outpost-map[data-map-idle="true"]').waitFor({ timeout: 20_000 });

/** Installs the two-ridges terrain and a repeater with no aerial height between the ridges; returns what to remove after. */
export async function ridgesAndRepeater(page: Page, name: string): Promise<{ repeaterId: string; collectionId: string }> {
  const { locations } = await api<{ locations: Array<{ id: string; path: string }> }>(page, "GET", "/api/storage/locations");
  const location = locations[0]!;
  const relPath = `imports/${name}.pmtiles`;
  execFileSync(process.execPath, [path.join(import.meta.dirname, "../tools/terrain-fixture.mjs"), path.join(location.path, relPath)]);
  const { collection } = await api<{ collection: { id: string } }>(page, "POST", "/api/maps/import", {
    locationId: location.id,
    relPath,
    name: "Two ridges",
    tileType: "terrain",
  });
  const { repeater } = await api<{ repeater: { id: string } }>(page, "POST", "/api/repeaters", {
    callsign: "QZ3RNG",
    outputHz: 145_725_000,
    lat: 57,
    lon: -3.4,
    place: "Between the ridges",
  });
  return { repeaterId: repeater.id, collectionId: collection.id };
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const overlaps = (a: Box, b: Box) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/**
 * The box on screen that the outline takes, found as the pixels of the map that change
 * when it is switched off. Everything over the map (cards, the search box, the tools) is made
 * see-through first, though it still takes presses: so that any part of the outline under a
 * card is counted, and a card or a column of tools that changes when the switch does is not.
 */
export async function outlineBox(page: Page, switchOff: () => Promise<void>): Promise<Box | null> {
  const map = (await page.locator(".outpost-map").boundingBox())!;
  await page.addStyleTag({
    content:
      ".outpost-touch *:not(.outpost-map, .outpost-map *, :has(.outpost-map)) { opacity: 0 !important; transition: none !important; }",
  });
  const on = await page.screenshot({ clip: map });
  await switchOff();
  await page.waitForTimeout(300);
  await idle(page);
  const off = await page.screenshot({ clip: map });
  const box = await page.evaluate(
    async ([one, two]) => {
      const read = async (png: string) => {
        const bytes = Uint8Array.from(atob(png), (character) => character.charCodeAt(0));
        const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        const context = canvas.getContext("2d")!;
        context.drawImage(bitmap, 0, 0);
        return { data: context.getImageData(0, 0, bitmap.width, bitmap.height).data, width: bitmap.width, height: bitmap.height };
      };
      const [a, b] = [await read(one!), await read(two!)];
      let [left, top, right, bottom] = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, -1, -1];
      for (let y = 0; y < a.height; y += 1) {
        for (let x = 0; x < a.width; x += 1) {
          const index = (y * a.width + x) * 4;
          const change =
            Math.abs(a.data[index]! - b.data[index]!) +
            Math.abs(a.data[index + 1]! - b.data[index + 1]!) +
            Math.abs(a.data[index + 2]! - b.data[index + 2]!);
          if (change <= 9) continue;
          left = Math.min(left, x);
          right = Math.max(right, x);
          top = Math.min(top, y);
          bottom = Math.max(bottom, y);
        }
      }
      return right < 0 ? null : { x: left, y: top, width: right - left + 1, height: bottom - top + 1, scale: a.width };
    },
    [on.toString("base64"), off.toString("base64")],
  );
  if (!box) return null;
  // Screenshots are in device pixels; the boxes Playwright gives are in CSS pixels.
  const ratio = box.scale / map.width;
  return { x: map.x + box.x / ratio, y: map.y + box.y / ratio, width: box.width / ratio, height: box.height / ratio };
}
