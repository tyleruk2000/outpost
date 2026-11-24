/**
 * Layer data is managed on Offline maps, on an iPhone (WebKit, touch): a layer with nothing held
 * in the Layers tab offers "Add hospitals for …", which opens Add a place with Nearby places and
 * that kind ticked; each kind's row, not its 18 px box, is the target; the source file's choice
 * is said on the main view and changed there. Pictures of Add a place at 390 and 1280, light and
 * dark, are attached to the report (and written to OUTPOST_SHOTS_DIR when it is set).
 */
import fs from "node:fs";
import path from "node:path";
import type { Page, TestInfo } from "@playwright/test";
import { expect, test, watchForErrors } from "./fixtures";
import { CENTRE, type InstalledTestMaps, installTestMaps, removeTestMaps } from "./map-fixture";

async function picture(page: Page, info: TestInfo, name: string) {
  const body = await page.screenshot();
  await info.attach(name, { body, contentType: "image/png" });
  const dir = process.env.OUTPOST_SHOTS_DIR;
  if (dir) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${name}.png`), body);
  }
}

test.describe("layer data in Offline maps on an iPhone", () => {
  let maps: InstalledTestMaps | undefined;
  test.afterEach(async ({ page }) => {
    await removeTestMaps(page, maps);
  });

  test("a layer with nothing held leads to Add a place with it ticked, chosen and changed by touch", async ({ page, sealed }, info) => {
    const errors = watchForErrors(page);
    maps = await installTestMaps(page);
    await page.goto(`/maps?lat=${CENTRE.lat}&lon=${CENTRE.lon}&z=12`);
    await page.locator('.outpost-map[data-map-idle="true"]').waitFor({ timeout: 20_000 });

    // The Layers tab: switches and what is shown, and for a layer with nothing held, the step that adds it.
    const add = page.getByRole("link", { name: "Add hospitals for United Kingdom" });
    await page.getByRole("tab", { name: "Layers" }).tap();
    if (!(await add.isVisible())) await page.getByRole("tab", { name: "Layers" }).tap();
    await expect(add).toBeVisible();
    await expect(page.getByRole("link", { name: "Add country boundaries for the whole world" })).toBeVisible();
    await expect(page.getByRole("button", { name: /layer data/i })).toHaveCount(0);
    await expect(page.getByRole("dialog", { name: "Get layer data" })).toHaveCount(0);
    await picture(page, info, "layers-tab-390-light");
    await add.tap();

    // Add a place, at What for…, Nearby places ticked and Hospitals under Which kinds.
    await expect(page).toHaveURL(/\/maps\/data/);
    const dialog = page.getByRole("dialog", { name: "Add a place" });
    await expect(dialog.getByRole("heading", { name: /^What for / })).toBeVisible();
    await expect(dialog.getByRole("checkbox", { name: /^Nearby places/ })).toBeChecked();
    const kinds = dialog.getByRole("list", { name: "Kinds from OpenStreetMap, read from the source file" });
    await expect(kinds.getByRole("checkbox", { name: "Hospitals" })).toBeChecked();
    const shelters = kinds.getByRole("checkbox", { name: "Shelters and assembly points" });
    await expect(shelters).not.toBeChecked();
    await expect(dialog.getByText(/^From OpenStreetMap, read from the source file$/)).toBeVisible();

    // The whole row is the target: a tap at its far end, nowhere near the box, ticks it.
    const row = kinds.getByRole("listitem").filter({ hasText: "Shelters and assembly points" });
    const box = (await row.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(43.5);
    await row.tap({ position: { x: box.width - 10, y: box.height / 2 } });
    await expect(shelters).toBeChecked();
    const nearby = dialog.getByRole("listitem").filter({ has: page.getByRole("checkbox", { name: /^Routes/ }) });
    const routesBox = (await nearby.boundingBox())!;
    await nearby.tap({ position: { x: routesBox.width - 10, y: 16 } });
    await expect(dialog.getByRole("checkbox", { name: /^Routes/ })).toBeChecked();

    // The source file: on the main view, never folded away. The first time both choices with their reasons;
    // after that the remembered one in a line, with Change.
    const line = dialog.getByRole("region", { name: "The source file" });
    await expect(line).toBeVisible();
    const change = line.getByRole("button", { name: /^Change/ });
    if (await change.isVisible()) {
      await expect(line).toContainText(/^Source file.*: (kept|deleted after reading)/);
      await change.tap();
    }
    await expect(dialog.getByRole("radio", { name: /^Keep it.*Needed to add walking and cycling later/ })).toBeVisible();
    await dialog.getByRole("radio", { name: /Delete it after reading.*Routes and nearby places keep working/ }).tap();
    const done = dialog.getByRole("button", { name: "Done" });
    if (await done.isVisible()) {
      await done.tap();
      await expect(line).toContainText(/^Source file: deleted after reading\. Routes and nearby places keep working · Change/);
    }
    await picture(page, info, "add-a-place-390-light");

    // Walking and cycling, where the add-on is here, keeps the file and says why, in the same words as its tick.
    const walk = dialog.getByRole("checkbox", { name: /^Walking and cycling/ });
    if (await walk.isVisible()) {
      await walk.tap();
      await expect(dialog.getByRole("region", { name: "The source file" })).toContainText(
        "Walking and cycling is built from it, so it is kept.",
      );
      await walk.tap();
    }

    for (const [width, height, scheme] of [
      [390, 664, "dark"],
      [1280, 860, "light"],
      [1280, 860, "dark"],
    ] as const) {
      await page.setViewportSize({ width, height });
      await page.emulateMedia({ colorScheme: scheme });
      await page.waitForTimeout(250);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
      await picture(page, info, `add-a-place-${width}-${scheme}`);
      await dialog.getByRole("heading", { name: /^What for / }).scrollIntoViewIfNeeded();
      await picture(page, info, `add-a-place-${width}-${scheme}-top`);
    }

    expect(errors).toEqual([]);
    expect(sealed.external).toEqual([]);
  });
});
