/**
 * The nuclear workspace's PDF with its maps, made on a phone (Pixel 7: a finger as the
 * pointer, so the print code keeps each picture within what a phone can draw), and its
 * controls at 320 px with the text at 150%.
 */
import { expect, test, watchForErrors } from "./fixtures";
import { type InstalledTestMaps, installTestMaps, keep, removeTestMaps } from "./map-fixture";
import { clearWorkspace, fillScenario, makeAndSave, pdfWords, threeScenarios, WITH_PLUME } from "./nuclear-pdf";

test.describe("The nuclear workspace's PDF with maps, on a phone", () => {
  test.describe.configure({ mode: "serial" });
  let installed: InstalledTestMaps | undefined;
  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    await clearWorkspace(page);
    installed = await installTestMaps(page);
    await page.close();
  });
  test.afterAll(async ({ browser }) => {
    const page = await browser.newPage();
    await removeTestMaps(page, installed);
    await page.close();
  });

  test("one scenario with a fallout pattern, and then three, each with its maps, the page usable meanwhile", async ({ page }, testInfo) => {
    test.setTimeout(300_000);
    const errors = watchForErrors(page);
    await page.goto("/prepare/nuclear");
    await fillScenario(page, WITH_PLUME);
    const section = page.getByTestId("scenario-export");
    for (const control of [
      section.getByRole("button", { name: "Make the PDF" }),
      section.getByRole("button", { name: "Export as Markdown" }),
    ])
      expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    // The rows of the switch and the tick box are their labels: a finger presses the whole row.
    for (const name of ["Maps in the PDF", "Show my saved places on the maps"]) {
      const row = section.locator("label").filter({ hasText: name });
      expect((await row.boundingBox())!.height, name).toBeGreaterThanOrEqual(44);
    }

    const one = await makeAndSave(page, testInfo, "nuclear-phone-one-scenario.pdf");
    expect(one.pdf.images.length).toBeGreaterThanOrEqual(2);
    expect(await pdfWords(one.bytes)).toContain("idealised shape for a steady wind");
    // While it was made, the rest of the page was as usable as before: the form still answers.
    await page.getByLabel("Yield", { exact: true }).fill("2");
    await expect(section.getByRole("button", { name: "Make the PDF" })).toBeVisible();

    await page.goto("/prepare/nuclear");
    await threeScenarios(page);
    const three = await makeAndSave(page, testInfo, "nuclear-phone-three-scenarios.pdf");
    expect(three.pdf.images.length).toBeGreaterThanOrEqual(5);
    expect(three.bytes.length).toBeLessThan(3_000_000);
    expect(errors).toEqual([]);
  });
});

test.describe("The PDF's controls at 320 px with the text at 150%", () => {
  test.use({ viewport: { width: 320, height: 568 } });

  test("fit the screen, with targets a finger can hit", async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    await page.addInitScript(() => {
      const apply = () => document.documentElement.style.setProperty("font-size", "24px", "important");
      if (document.documentElement) apply();
      document.addEventListener("DOMContentLoaded", apply);
    });
    await page.goto("/prepare/nuclear");
    await fillScenario(page, WITH_PLUME);
    const section = page.getByTestId("scenario-export");
    await section.scrollIntoViewIfNeeded();
    const controls = [
      section.locator("label").filter({ hasText: "Maps in the PDF" }),
      section.locator("label").filter({ hasText: "Show my saved places on the maps" }),
      section.getByRole("radio", { name: "A4" }),
      section.getByRole("button", { name: "Make the PDF" }),
      section.getByRole("button", { name: "Export as Markdown" }),
    ];
    for (const control of controls) {
      const box = (await control.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(320);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    for (const scheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await keep(testInfo, `nuclear-pdf-controls-320-${scheme}.png`, await section.screenshot(), "image/png");
    }
  });
});
