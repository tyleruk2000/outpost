import fs from "node:fs";
import type { Page } from "@playwright/test";
import { api, expect, test, watchForErrors } from "./fixtures";
import { CENTRE, type InstalledTestMaps, installTestMaps, jpegSize, keep, measurePatch, readPdf, removeTestMaps } from "./map-fixture";

/** Opens the map on a position, takes up "Print or save as PDF" and holds the page to a scale. */
async function layOut(page: Page, at: { lat: number; lon: number }, options: { paper?: string; scale?: string } = {}) {
  await page.goto(`/maps?lat=${at.lat}&lon=${at.lon}&z=12.5`);
  await page.locator('.outpost-map[data-map-idle="true"]').waitFor({ timeout: 20_000 });
  await page.getByRole("button", { name: "Print or save as PDF" }).click();
  await expect(page.getByRole("heading", { name: "Print or save as PDF" })).toBeVisible();
  if (options.paper) {
    await page.getByRole("combobox", { name: "Paper" }).click();
    await page.getByRole("option", { name: new RegExp(options.paper) }).click();
  }
  await page.getByRole("combobox", { name: "Scale" }).click();
  await page.getByRole("option", { name: new RegExp(options.scale ?? "1:25,000") }).click();
}

/** Goes on to the page itself and waits for its preview to be drawn. */
async function preview(page: Page) {
  await page.getByRole("button", { name: "Preview the page" }).click();
  const dialog = page.getByRole("dialog", { name: "Print or save as PDF" });
  await expect(dialog.locator("svg image").first()).toBeAttached({ timeout: 30_000 });
  await expect(dialog.getByText("Drawing the preview")).toBeHidden({ timeout: 30_000 });
  return dialog;
}

/** Makes the file and saves it the way a person would, by pressing the link. */
async function makeAndSave(page: Page, dialog: ReturnType<Page["getByRole"]>) {
  await dialog.getByRole("button", { name: "Make the PDF" }).click();
  const save = dialog.getByRole("link", { name: "Save the PDF" });
  await expect(save).toBeVisible({ timeout: 120_000 });
  const downloading = page.waitForEvent("download");
  await save.click();
  const download = await downloading;
  return { name: download.suggestedFilename(), bytes: fs.readFileSync(await download.path()) };
}

test.describe("printing the map", () => {
  test.describe.configure({ mode: "serial" });
  let installed: InstalledTestMaps | undefined;
  const made: string[] = [];

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    installed = await installTestMaps(page);
    made.push(
      (await api(page, "POST", "/api/maps/markers", { name: "Boathouse", lat: 53.0745, lon: -4.0655, color: "red", isFavorite: true }))
        .marker.id,
    );
    await page.close();
  });

  test.afterAll(async ({ browser }) => {
    const page = await browser.newPage();
    for (const id of made) await page.request.delete(`/api/maps/markers/${id}`, { headers: { "X-Outpost-Request": "1" } });
    await removeTestMaps(page, installed);
    await page.close();
  });

  test("lays out a page, previews it, and makes a one-page PDF that measures true", async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    const errors = watchForErrors(page);
    await layOut(page, CENTRE);
    // A4 upright holds a map 189.65 mm × 251.46 mm: at 1:25,000 that is 4.7 km × 6.3 km of ground.
    await expect(page.getByText("4.7 × 6.3 km on A4 portrait at 1:25,000")).toBeVisible();

    const dialog = await preview(page);
    await expect(dialog.getByText("One page: A4 portrait, 1:25,000, 4.7 × 6.3 km.")).toBeVisible();
    // The whole page is inside the installed map, to the zoom this scale needs: nothing to warn about.
    await expect(dialog.getByText(/No detailed map is installed|will lack detail/)).toBeHidden();
    // What is on the map on screen starts ticked; what cannot be drawn says why.
    await expect(dialog.getByRole("checkbox", { name: /Names of places, roads and water/ })).toBeChecked();
    await expect(dialog.getByRole("checkbox", { name: /Hill shading/ })).toBeChecked();
    await expect(dialog.getByRole("checkbox", { name: /Saved places/ })).toBeChecked();
    await dialog.getByRole("checkbox", { name: /Contour lines/ }).check();
    // This page is measured, so nothing is drawn across the lake: routes and places left by other tests come off.
    for (const name of [/Routes and tracks/, /Saved places/]) {
      const box = dialog.getByRole("checkbox", { name });
      if (await box.isEnabled()) await box.uncheck();
    }
    await dialog.getByRole("textbox", { name: "Title" }).fill("Llyn Prawf & the hill");
    // The preview is the sheet itself: the words on it are the words that will be in the file.
    const sheet = dialog.getByRole("img", { name: /Preview of the page/ });
    await expect(sheet).toContainText("Llyn Prawf & the hill");
    await expect(sheet).toContainText("1:25,000");
    await expect(sheet).toContainText("© OpenStreetMap, openstreetmap.org/copyright");
    await expect(sheet).toContainText("© Mapterhorn, mapterhorn.com/attribution");
    await expect(dialog.getByText("Drawing the preview")).toBeHidden({ timeout: 30_000 });

    // Making the page asks the server only for map data, and sends it nothing.
    const asked: Array<{ method: string; url: string }> = [];
    page.on("request", (request) => asked.push({ method: request.method(), url: request.url() }));
    const file = await makeAndSave(page, dialog);
    expect(asked.filter((request) => request.method !== "GET")).toEqual([]);
    const paths = asked.filter((request) => !request.url.startsWith("blob:")).map((request) => new URL(request.url).pathname);
    expect(paths.length).toBeGreaterThan(0);
    for (const path of paths) expect(path).toMatch(/^\/(api\/maps\/(tiles|terrain)\/|map-assets\/|world\/)/);

    expect(file.name).toBe("llyn-prawf-the-hill.pdf");
    await keep(testInfo, "llyn-prawf-the-hill.pdf", file.bytes, "application/pdf");
    const pdf = readPdf(file.bytes);
    expect(pdf.pages).toBe(1);
    // A4: 210 mm × 297 mm at 72 points to the inch.
    expect(pdf.width).toBeCloseTo(595.28, 2);
    expect(pdf.height).toBeCloseTo(841.89, 2);
    // One picture: 896 × 1,188 map pixels at 2.5 device pixels each, which is 300 to the inch of paper.
    expect(pdf.images).toHaveLength(1);
    expect(pdf.images[0]).toMatchObject({ width: 2240, height: 2970 });
    expect(jpegSize(pdf.images[0]!.jpeg)).toEqual({ width: 2240, height: 2970 });
    // Placed at 537.6 × 712.8 points: 2,240 pixels / 537.6 points × 72 = 300 dots per inch exactly.
    expect(pdf.placed).toHaveLength(1);
    expect(pdf.placed[0]).toMatchObject({ width: 537.6, height: 712.8 });
    // Inside a 10 mm (28.35 point) margin on every side.
    expect(pdf.placed[0]!.x).toBeGreaterThanOrEqual(28.34);
    expect(pdf.placed[0]!.x + 537.6).toBeLessThanOrEqual(595.28 - 28.34);
    expect(pdf.placed[0]!.y + 712.8).toBeLessThanOrEqual(841.89 - 28.34);
    expect(pdf.placed[0]!.y).toBeGreaterThan(28.34 + 60);
    // The lettering is text in the file, in a standard typeface, not part of a picture.
    expect(pdf.text).toContain("/BaseFont /Helvetica ");
    expect(pdf.text).toContain("(Llyn Prawf & the hill) Tj");
    expect(pdf.text).toContain("(1:25,000) Tj");
    expect(pdf.text).toContain("(Protomaps \\251 OpenStreetMap, openstreetmap.org/copyright");

    // The scale, measured on the picture. The test map's lake is 1,000 m × 500 m on the ground and sits in the
    // middle of the page. At 1:25,000 that is 40 mm × 20 mm of paper; at 300 dots to the inch,
    // 40 / 25.4 × 300 = 472.4 pixels by 236.2. Measured to one side of the lake's name.
    const lake = await measurePatch(page, pdf.images[0]!.jpeg, { x: 0.5 - 150 / 2240, y: 0.5 - 60 / 2970 });
    expect(Math.abs(lake.width - 472.4), `lake is ${lake.width} px wide`).toBeLessThanOrEqual(3);
    expect(Math.abs(lake.height - 236.2), `lake is ${lake.height} px high`).toBeLessThanOrEqual(3);

    // The file's own report, and how to print it.
    await expect(dialog.getByText(/A4 portrait at 300 dots per inch\. Print it at 100%/)).toBeVisible();

    // The browser's own Print, while this is open, prints the sheet alone at the size of the paper.
    await page.emulateMedia({ media: "print" });
    await expect(page.locator(".outpost-print-sheet svg")).toBeVisible();
    await expect(page.locator("#root")).toBeHidden();
    const printed = (await page.pdf({ preferCSSPageSize: true })).toString("latin1");
    expect([...printed.matchAll(/\/Type\s*\/Page\b/g)]).toHaveLength(1);
    const box = /\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/.exec(printed)!;
    expect(Math.abs(Number(box[1]) - 595.28)).toBeLessThan(1);
    expect(Math.abs(Number(box[2]) - 841.89)).toBeLessThan(1);
    await page.emulateMedia({ media: null });

    // A second opinion on the file: Outpost's own library reads PDFs with pdf.js, which knows nothing of how
    // this one was written. It must find one page, with the title, the scale and the credits as text.
    const upload = await page.request.post("/api/documents", {
      headers: { "X-Outpost-Request": "1" },
      multipart: { file: { name: file.name, mimeType: "application/pdf", buffer: file.bytes } },
    });
    expect(upload.ok()).toBe(true);
    const documentId = (await upload.json()).results[0].document.id as string;
    try {
      await expect
        .poll(async () => (await api(page, "GET", `/api/documents/${documentId}`)).document.extraction, { timeout: 20_000 })
        .toBe("done");
      const document = (await api(page, "GET", `/api/documents/${documentId}`)).document;
      expect(document.pageCount).toBe(1);
      const text = JSON.stringify(await api(page, "GET", `/api/documents/${documentId}/text`));
      expect(text).toContain("Llyn Prawf & the hill");
      expect(text).toContain("1:25,000");
      expect(text).toContain("© OpenStreetMap, openstreetmap.org/copyright");
      expect(text).toContain("© Mapterhorn, mapterhorn.com/attribution");
      expect(text).toMatch(/1 km bar is 40 mm long/);
      // And it draws: the built-in viewer shows the page.
      await page.goto(`/library/documents/${documentId}`);
      await expect(page.locator("canvas").first()).toBeVisible({ timeout: 15_000 });
      await page.waitForTimeout(800);
      await keep(testInfo, "as the library's reader draws it.png", await page.screenshot(), "image/png");
    } finally {
      await page.request.delete(`/api/documents/${documentId}`, { headers: { "X-Outpost-Request": "1" } });
    }
    expect(errors).toEqual([]);
  });

  test("draws A3 in two pieces and joins them without a gap", async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    const errors = watchForErrors(page);
    await layOut(page, CENTRE, { paper: "A3" });
    const dialog = await preview(page);
    await dialog.getByRole("checkbox", { name: /Lines of latitude and longitude/ }).check();
    // Saved places and any routes are left on this one. Without a title the page is dated and the file is "map.pdf".
    await expect(dialog.getByRole("checkbox", { name: /Saved places/ })).toBeChecked();
    await dialog.getByRole("textbox", { name: "Title" }).fill("");
    const file = await makeAndSave(page, dialog);
    // A3 at 300 dots per inch is 3,270 × 4,420 pixels: taller than the 4,096 a canvas is kept to.
    await expect(dialog.getByText(/drawn in 2 pieces to stay within what this device can draw at once/)).toBeVisible();
    expect(file.name).toBe("map.pdf");
    await keep(testInfo, "a3.pdf", file.bytes, "application/pdf");

    const pdf = readPdf(file.bytes);
    expect(pdf.pages).toBe(1);
    expect(pdf.width).toBeCloseTo(841.89, 2);
    expect(pdf.height).toBeCloseTo(1190.55, 2);
    expect(pdf.images.map((image) => image.width)).toEqual([3270, 3270]);
    expect(pdf.images[0]!.height + pdf.images[1]!.height).toBe(4420);
    for (const image of pdf.images) expect(jpegSize(image.jpeg)).toEqual({ width: image.width, height: image.height });
    // One directly above the other, the lower one starting exactly where the upper one ends.
    const [upper, lower] = [...pdf.placed].sort((a, b) => b.y - a.y);
    expect(upper!.x).toBe(lower!.x);
    expect(upper!.width).toBe(lower!.width);
    expect(lower!.y + lower!.height).toBeCloseTo(upper!.y, 2);
    // Each at 300 dots to the inch.
    for (const [index, piece] of [upper!, lower!].entries()) {
      expect((pdf.images[index]!.height / piece.height) * 72).toBeCloseTo(300, 6);
    }
    expect(errors).toEqual([]);
  });

  test("says so before printing an area the installed map does not cover", async ({ page }) => {
    const errors = watchForErrors(page);
    // Well outside the test map.
    await layOut(page, { lat: 53.4, lon: -3 });
    let dialog = await preview(page);
    await expect(dialog.getByText("No detailed map is installed for this area")).toBeVisible();
    await expect(dialog.getByText(/would show only the outline of the world/)).toBeVisible();
    await expect(dialog.getByRole("checkbox", { name: /Contour lines/ })).toBeDisabled();
    await expect(dialog.getByText("No terrain is downloaded for this area.").first()).toBeVisible();
    // It is a warning, not a refusal: an outline can still be printed by someone who wants one.
    await expect(dialog.getByRole("button", { name: "Make the PDF" })).toBeEnabled();

    // Half on the map and half off its eastern edge.
    await layOut(page, { lat: CENTRE.lat, lon: -3.93 });
    dialog = await preview(page);
    await expect(dialog.getByText("Part of this page will lack detail")).toBeVisible();
    await expect(dialog.getByText(/About 50% of this area has no detailed map installed and will show only an outline/)).toBeVisible();

    // A closer scale on covered ground: 1:10,000 here is drawn from zoom 14 tiles, which the test map has.
    await layOut(page, CENTRE, { scale: "1:10,000" });
    dialog = await preview(page);
    await expect(dialog.getByText(/No detailed map is installed|will lack detail/)).toBeHidden();
    expect(errors).toEqual([]);
  });

  test("puts the page away without leaving its box on the map", async ({ page }) => {
    await layOut(page, CENTRE);
    await expect(page.locator(".outpost-box-handle").first()).toBeVisible();
    // The box keeps the page's shape when a handle is moved from the keyboard, and the scale follows it.
    const east = page.locator('.outpost-box-handle[data-handle="e"]');
    // The scale's menu hands the keyboard back to its button a moment after it closes; wait for that to be over.
    await expect(async () => {
      await east.focus();
      await page.waitForTimeout(150);
      await expect(east).toBeFocused({ timeout: 500 });
    }).toPass();
    await page.keyboard.press("Shift+ArrowRight");
    await expect(page.getByRole("combobox", { name: "Scale" })).toContainText("Fit the box: 1:");
    await expect(page.getByText(/km on A4 portrait at 1:2[5-9],\d00/)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("heading", { name: "Print or save as PDF" })).toBeHidden();
    await expect(page.locator(".outpost-box-handle")).toHaveCount(0);
  });
});
