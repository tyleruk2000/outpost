/**
 * The nuclear workspace's PDF with its maps, on a wide screen, over the suite's test map
 * and with the internet cut off (the fixtures fail a test that reaches out). Set
 * OUTPOST_E2E_KEEP to a folder to keep the PDFs for looking at.
 */
import { api, expect, test, watchForErrors } from "./fixtures";
import { CENTRE, type InstalledTestMaps, installTestMaps, jpegSize, removeTestMaps } from "./map-fixture";
import { clearWorkspace, fillScenario, makeAndSave, pdfWords, threeScenarios, WITH_PLUME } from "./nuclear-pdf";

test.describe("The nuclear workspace's PDF with maps", () => {
  test.describe.configure({ mode: "serial" });
  let installed: InstalledTestMaps | undefined;
  test.afterAll(async ({ browser }) => {
    const page = await browser.newPage();
    await clearWorkspace(page);
    await removeTestMaps(page, installed);
    await page.close();
  });

  test("with no map region installed, still makes the PDF, with the rings to scale and how to get a map", async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    const errors = watchForErrors(page);
    await clearWorkspace(page);
    await page.goto("/prepare/nuclear");
    await expect(page.getByTestId("offline-line")).toContainText("No offline map region is installed");
    await fillScenario(page, WITH_PLUME);
    const file = await makeAndSave(page, testInfo, "nuclear-no-map.pdf", { drawing: false });
    expect(file.pdf.images).toHaveLength(0);
    const words = pdfWords(file.pdf.text);
    expect(words).toContain("No map of A: no offline map region covers this area.");
    expect(words).toContain("Add a region for this area under Maps, Offline maps");
    await expect(page.getByText("The PDF has no maps")).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("one scenario with a fallout pattern: a map of its rings and one of its pattern, saved places only when ticked", async ({
    page,
  }, testInfo) => {
    test.setTimeout(240_000);
    const errors = watchForErrors(page);
    installed = await installTestMaps(page);
    await api(page, "POST", "/api/maps/markers", { name: "Home", lat: CENTRE.lat + 0.004, lon: CENTRE.lon + 0.01, color: "teal" });
    await page.goto("/prepare/nuclear");
    await expect(page.getByTestId("offline-line")).toContainText(/offline map regions? installed/);
    await fillScenario(page, WITH_PLUME);
    const section = page.getByTestId("scenario-export");
    await expect(section.getByRole("switch", { name: "Maps in the PDF" })).toBeChecked();
    const places = section.getByRole("checkbox", { name: "Show my saved places on the maps" });
    await expect(places).not.toBeChecked();
    // Nothing is drawn before the press: the three actions come with the file.
    await expect(section.getByRole("link", { name: "Save as PDF" })).toHaveCount(0);

    const first = await makeAndSave(page, testInfo, "nuclear-one-scenario.pdf");
    expect(first.name).toMatch(/\.pdf$/);
    expect(first.pdf.images).toHaveLength(2);
    expect(first.pdf.pages).toBeGreaterThanOrEqual(2);
    for (const image of first.pdf.images) expect(jpegSize(image.jpeg)).toEqual({ width: image.width, height: image.height });
    // At 150 to the inch, the picture is no larger than its place on the page asks.
    for (const [index, image] of first.pdf.images.entries()) {
      const placed = first.pdf.placed[index]!;
      expect(image.width / (placed.width / 72)).toBeCloseTo(150, -1);
    }
    const words = pdfWords(first.pdf.text);
    expect(words).toContain("An educational estimate from a published model for an idealised case");
    expect(words).toContain("idealised shape for a steady wind");
    expect(words).toMatch(/framed to reach the contour of 100 rads per hour at one hour/);
    expect(words).toContain("Natural Earth");
    expect(words).not.toContain("Your saved places are shown");
    expect(first.bytes.length).toBeLessThan(1_500_000);

    // Made again the same day, unchanged: whether the bytes are the same decides whether the library sees one document.
    await section.getByRole("radio", { name: "US Letter" }).click();
    await section.getByRole("radio", { name: "A4" }).click();
    const again = await makeAndSave(page, testInfo, "nuclear-one-scenario-again.pdf");
    testInfo.annotations.push({ type: "same bytes made twice", description: String(Buffer.compare(first.bytes, again.bytes) === 0) });

    // Ticked: the places are drawn, the page says so, and "Add to library" asks first.
    await places.check();
    const withPlaces = await makeAndSave(page, testInfo, "nuclear-with-places.pdf");
    expect(pdfWords(withPlaces.pdf.text)).toContain("Your saved places are shown");
    await section.getByRole("button", { name: "Add to library" }).click();
    const asked = page.getByRole("alertdialog", { name: "Add a PDF that shows your saved places?" });
    await expect(asked).toBeVisible();
    await asked.getByRole("button", { name: "Cancel" }).click();
    await expect(asked).toBeHidden();
    expect(errors).toEqual([]);
  });

  test("three scenarios: an overview of all of them first, then each one's own maps", async ({ page }, testInfo) => {
    test.setTimeout(240_000);
    const errors = watchForErrors(page);
    await page.goto("/prepare/nuclear");
    await threeScenarios(page);
    const file = await makeAndSave(page, testInfo, "nuclear-three-scenarios.pdf");
    // The overview, A's rings and pattern, B's rings, C's rings.
    expect(file.pdf.images).toHaveLength(5);
    expect(file.pdf.pages).toBeGreaterThanOrEqual(3);
    const words = pdfWords(file.pdf.text);
    expect(words).toMatch(/The 3 scenarios shown, A, B and C, each at its ground zero with its letter/);
    expect(words).toContain("Nothing is added up across them");
    expect(file.bytes.length).toBeLessThan(3_000_000);
    expect(errors).toEqual([]);
  });
});
