import fs from "node:fs";
import { api, expect, test, watchForErrors } from "./fixtures";
import { CENTRE, type InstalledTestMaps, installTestMaps, jpegSize, keep, measurePatch, readPdf, removeTestMaps } from "./map-fixture";

test.describe("printing the map from a phone", () => {
  let installed: InstalledTestMaps | undefined;

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    installed = await installTestMaps(page);
    await page.close();
  });

  test.afterAll(async ({ browser }) => {
    const page = await browser.newPage();
    await removeTestMaps(page, installed);
    await page.close();
  });

  // A phone's browser keeps its own bars on the screen: an iPhone 14 in Safari leaves a page about 390 by 664.
  // The first step was a card over the map, which there had 160 px of the 286 it needs: its settings could not
  // be seen (the first Raspberry Pi, 18 November 2026). It is now in the sheet, raised to half.
  test.describe("on a phone in a browser, with its bars", () => {
    test.use({ viewport: { width: 390, height: 664 } });
    test("shows every setting of the first step and both buttons, with the box on the map above", async ({ page }) => {
      const errors = watchForErrors(page);
      await page.goto(`/maps?lat=${CENTRE.lat}&lon=${CENTRE.lon}&z=12.5`);
      await page.locator('.outpost-map[data-map-idle="true"]').waitFor({ timeout: 20_000 });
      await page.getByRole("button", { name: "All map tools" }).tap();
      await page.getByRole("menuitemcheckbox", { name: "Print or save as PDF", exact: true }).tap();
      const sheet = page.locator('section[aria-label="Places, routes and offline maps"]');
      const step = sheet.getByRole("region", { name: "Print or save as PDF" });
      await expect(step.getByRole("heading", { name: "Print or save as PDF" })).toBeVisible();
      await page.waitForTimeout(600);
      const within = (await sheet.boundingBox())!;
      const foot = Math.min(within.y + within.height, page.viewportSize()!.height);
      for (const control of [
        step.getByRole("combobox", { name: "Paper" }),
        step.getByRole("radio", { name: "Portrait" }),
        step.getByRole("radio", { name: "Landscape" }),
        step.getByRole("combobox", { name: "Scale" }),
        step.getByRole("button", { name: "Preview the page" }),
        step.getByRole("button", { name: "Centre the box here" }),
      ]) {
        const box = (await control.boundingBox())!;
        expect(box.height, "tall enough to touch").toBeGreaterThanOrEqual(44);
        expect(box.y, "below the top of the sheet").toBeGreaterThanOrEqual(within.y);
        expect(box.y + box.height, "above the foot of the sheet and of the screen").toBeLessThanOrEqual(foot + 0.5);
      }
      // The box is on the map above the sheet, all of it, large enough to take hold of.
      await expect
        .poll(async () => {
          const corner = async (name: string) => (await page.locator(`.outpost-box-handle[data-handle="${name}"]`).boundingBox())!;
          const [nw, se] = [await corner("nw"), await corner("se")];
          // 86 by 115 px on this screen (88 and more on a taller one, which the test below holds it to).
          return nw.y > 60 && se.y + se.height < within.y && se.x - nw.x >= 80 && se.y - nw.y >= 80;
        })
        .toBe(true);
      // Raised all the way, the step is still there (it was an empty sheet: the cards it was drawn from are put away
      // while the sheet covers the map), and lowered again it is unchanged.
      const handle = page.getByRole("button", { name: /^Panel height/ });
      for (let press = 0; press < 3 && !/full/.test((await handle.getAttribute("aria-label")) ?? ""); press += 1) await handle.tap();
      await expect(handle).toHaveAttribute("aria-label", /full/);
      await expect(step.getByRole("combobox", { name: "Scale" })).toBeVisible();
      await expect(step.getByRole("button", { name: "Preview the page" })).toBeVisible();
      for (let press = 0; press < 3 && !/half/.test((await handle.getAttribute("aria-label")) ?? ""); press += 1) await handle.tap();
      await expect(step.getByRole("combobox", { name: "Paper" })).toBeVisible();
      // Lowered, the sheet shows the step's title and what puts it down; put down, the tabs are back.
      await step.getByRole("button", { name: "Stop: put the page away" }).tap();
      await expect(sheet.getByRole("tab", { name: /Places/ })).toBeVisible();
      await expect(page.locator(".outpost-box-handle")).toHaveCount(0);
      expect(errors).toEqual([]);
    });
  });

  test("lays out, previews and makes a page at phone width, drawn in pieces", async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    const errors = watchForErrors(page);
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    await page.goto(`/maps?lat=${CENTRE.lat}&lon=${CENTRE.lon}&z=12.5`);
    await page.locator('.outpost-map[data-map-idle="true"]').waitFor({ timeout: 20_000 });

    const control = page.getByRole("button", { name: "Print or save as PDF" });
    expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await control.tap();
    await expect(page.getByRole("heading", { name: "Print or save as PDF" })).toBeVisible();
    await page.getByRole("combobox", { name: "Scale" }).tap();
    await page.getByRole("option", { name: /1:25,000/ }).tap();
    await expect(page.getByText("4.7 × 6.3 km on A4 portrait at 1:25,000")).toBeVisible();
    // The card and everything on it is on the screen, with targets a finger can hit.
    const next = page.getByRole("button", { name: "Preview the page" });
    const nextBox = (await next.boundingBox())!;
    const viewport = page.viewportSize()!;
    expect(nextBox.height).toBeGreaterThanOrEqual(44);
    expect(nextBox.x).toBeGreaterThanOrEqual(0);
    expect(nextBox.x + nextBox.width).toBeLessThanOrEqual(viewport.width);
    expect(nextBox.y + nextBox.height).toBeLessThanOrEqual(viewport.height);
    for (const name of ["Paper", "Scale"]) {
      expect((await page.getByRole("combobox", { name }).boundingBox())!.height, name).toBeGreaterThanOrEqual(44);
    }
    expect(await overflow(), "sideways overflow while choosing the area").toBeLessThanOrEqual(1);
    // The box is brought into the part of the map the card leaves free, large enough to take hold of.
    const card = (await page.getByRole("heading", { name: "Print or save as PDF" }).boundingBox())!;
    await expect
      .poll(async () => {
        const corner = async (name: string) => (await page.locator(`.outpost-box-handle[data-handle="${name}"]`).boundingBox())!;
        const [nw, se] = [await corner("nw"), await corner("se")];
        return (
          nw.y > 60 && se.y + se.height < card.y && nw.x > 0 && se.x + se.width < viewport.width && se.x - nw.x >= 88 && se.y - nw.y >= 88
        );
      })
      .toBe(true);
    await keep(testInfo, "choosing the area.png", await page.screenshot(), "image/png");

    await next.tap();
    const dialog = page.getByRole("dialog", { name: "Print or save as PDF" });
    await expect(dialog.locator("svg image").first()).toBeAttached({ timeout: 30_000 });
    await expect(dialog.getByText("Drawing the preview")).toBeHidden({ timeout: 30_000 });
    const frame = (await dialog.boundingBox())!;
    expect(frame.x).toBeGreaterThanOrEqual(0);
    expect(frame.x + frame.width).toBeLessThanOrEqual(viewport.width);
    expect(frame.y).toBeGreaterThanOrEqual(0);
    expect(frame.y + frame.height).toBeLessThanOrEqual(viewport.height);
    expect(await overflow(), "sideways overflow in the dialog").toBeLessThanOrEqual(1);
    await keep(testInfo, "the preview.png", await page.screenshot(), "image/png");

    // The page is measured below: nothing left by other tests is drawn across the lake.
    for (const name of [/Routes and tracks/, /Saved places/]) {
      const box = dialog.getByRole("checkbox", { name });
      if (await box.isEnabled()) await box.uncheck();
    }
    await expect(dialog.getByText("Drawing the preview")).toBeHidden({ timeout: 30_000 });
    const make = dialog.getByRole("button", { name: "Make the PDF" });
    expect((await make.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await make.tap();
    const save = dialog.getByRole("link", { name: "Save as PDF" });
    await expect(save).toBeVisible({ timeout: 120_000 });
    expect((await save.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    // A phone is given smaller pictures to draw, and is told so.
    await expect(dialog.getByText(/drawn in 2 pieces to stay within what this device can draw at once/)).toBeVisible();
    await keep(testInfo, "made.png", await page.screenshot(), "image/png");

    const downloading = page.waitForEvent("download");
    await save.tap();
    const bytes = fs.readFileSync(await (await downloading).path());
    await keep(testInfo, "phone.pdf", bytes, "application/pdf");
    const pdf = readPdf(bytes);
    expect(pdf.pages).toBe(1);
    expect(pdf.width).toBeCloseTo(595.28, 2);
    // The same 2,240 × 2,970 pixels as on a desktop, in two pieces cut on a whole map pixel.
    expect(pdf.images.map((image) => [image.width, image.height])).toEqual([
      [2240, 1490],
      [2240, 1480],
    ]);
    for (const image of pdf.images) expect(jpegSize(image.jpeg)).toEqual({ width: image.width, height: image.height });
    const [upper, lower] = [...pdf.placed].sort((a, b) => b.y - a.y);
    expect(lower!.y + lower!.height).toBeCloseTo(upper!.y, 2);
    // The lake straddles the join, 5 pixels more of it above than below; its width is the same either side:
    // 1,000 m at 1:25,000 and 300 dots to the inch is 472.4 pixels.
    const above = await measurePatch(page, pdf.images[0]!.jpeg, { x: 0.5 - 150 / 2240, y: 1 - 40 / 1490 });
    const below = await measurePatch(page, pdf.images[1]!.jpeg, { x: 0.5 - 150 / 2240, y: 40 / 1480 });
    expect(Math.abs(above.width - 472.4), `above the join the lake is ${above.width} px wide`).toBeLessThanOrEqual(3);
    expect(Math.abs(below.width - 472.4), `below the join the lake is ${below.width} px wide`).toBeLessThanOrEqual(3);

    // The way that does not depend on the phone saving a file: the same bytes go to the library.
    const add = dialog.getByRole("button", { name: "Add to library" });
    await add.scrollIntoViewIfNeeded();
    expect((await add.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await add.tap();
    const status = dialog.getByTestId("pdf-status");
    await expect(status).toContainText("Added to the library under “Made in Outpost” as", { timeout: 30_000 });
    expect(await overflow(), "sideways overflow once the page is in the library").toBeLessThanOrEqual(1);
    await keep(testInfo, "added to the library.png", await page.screenshot(), "image/png");
    const documentId = (await status.getByRole("link", { name: /^Map, / }).getAttribute("href"))!.split("/").pop()!;
    const document = (await api(page, "GET", `/api/documents/${documentId}`)).document;
    expect(document).toMatchObject({ category: "Made in Outpost", tags: ["Map"], sizeBytes: bytes.length });
    await api(page, "DELETE", `/api/documents/${documentId}`);
    expect(errors).toEqual([]);
  });
});
