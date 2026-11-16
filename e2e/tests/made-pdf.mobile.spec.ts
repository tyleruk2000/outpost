/**
 * A prediction's PDF on a phone: every button on the screen and large enough for a
 * finger, and the route that does not depend on the phone saving a file (the library)
 * carried through to the reader.
 */
import { api, expect, test, watchForErrors } from "./fixtures";
import { keep } from "./map-fixture";

test.describe("PDFs made in Outpost, on a phone", () => {
  test("a prediction goes from the planner to the library, is found by search and opens in the reader", async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    const errors = watchForErrors(page);
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    await page.goto("/radio/propagation");
    await page.getByRole("button", { name: "Try London to Birmingham on 40 m" }).tap();
    await expect(page.getByRole("heading", { name: "London to Birmingham" })).toBeVisible();
    // Another band than the desktop's test asks about, on one fixed month.
    await page.getByLabel("Date (UTC)").fill("2026-11-16");
    await page.getByLabel("Frequency, MHz").fill("5.33");
    await page.getByRole("button", { name: "Predict", exact: true }).tap();
    await expect(page.getByRole("heading", { name: /5\.33 MHz at \d\d:00 UTC/ })).toBeVisible();

    const block = page.getByRole("region", { name: "This prediction as a PDF" });
    await block.scrollIntoViewIfNeeded();
    const viewport = page.viewportSize()!;
    const save = block.getByRole("link", { name: "Save as PDF" });
    const add = block.getByRole("button", { name: "Add to library" });
    for (const [name, control] of [
      ["Save as PDF", save],
      ["Add to library", add],
      ["Export as Markdown", block.getByRole("button", { name: "Export as Markdown" })],
      ["Change where", block.getByRole("button", { name: "Change where" })],
    ] as const) {
      const box = (await control.boundingBox())!;
      expect(box.height, name).toBeGreaterThanOrEqual(44);
      expect(box.x, name).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width, name).toBeLessThanOrEqual(viewport.width);
    }
    expect(await overflow(), "sideways overflow with the export on screen").toBeLessThanOrEqual(0);
    await keep(testInfo, "the prediction's PDF.png", await page.screenshot(), "image/png");

    // The library first: it must not depend on the device having saved anything.
    await add.tap();
    const status = block.getByTestId("pdf-status");
    await expect(status).toContainText("Added to the library under “Made in Outpost” as");
    const link = status.getByRole("link", { name: "HF prediction, London to Birmingham, 60 m, for 16 Nov 2026" });
    expect(await overflow(), "sideways overflow once it is in the library").toBeLessThanOrEqual(0);
    await keep(testInfo, "added to the library.png", await page.screenshot(), "image/png");
    const documentId = (await link.getAttribute("href"))!.split("/").pop()!;
    await expect
      .poll(async () => (await api(page, "GET", `/api/documents/${documentId}`)).document.extraction, { timeout: 30_000 })
      .toBe("done");

    // Found by a search for words in the PDF, and opened in the reader.
    await page.goto(`/search?q=${encodeURIComponent('"5.33 MHz hour by hour"')}`);
    const result = page.getByRole("link", { name: /HF prediction, London to Birmingham, 60 m, for 16 Nov 2026/ }).first();
    await expect(result).toBeVisible();
    await result.tap();
    await expect(page).toHaveURL(new RegExp(`/library/documents/${documentId}`));
    await expect(page.locator("canvas").first()).toBeVisible({ timeout: 15_000 });
    expect(await overflow(), "sideways overflow in the reader").toBeLessThanOrEqual(1);
    await keep(testInfo, "in the reader.png", await page.screenshot(), "image/png");

    // Where it goes can be changed, and is remembered on the device.
    await page.goto("/radio/propagation");
    await page.getByRole("button", { name: "Predict", exact: true }).tap();
    const again = page.getByRole("region", { name: "This prediction as a PDF" });
    await again.getByRole("button", { name: "Change where" }).tap();
    await again.getByRole("textbox", { name: "Category for PDFs made in Outpost" }).fill("Radio paperwork");
    await again.getByRole("button", { name: "Use this" }).tap();
    await expect(again.getByTestId("pdf-status")).toContainText("files it under “Radio paperwork”");
    await page.reload();
    await page.getByRole("button", { name: "Predict", exact: true }).tap();
    await expect(page.getByRole("region", { name: "This prediction as a PDF" }).getByTestId("pdf-status")).toContainText(
      "files it under “Radio paperwork”",
    );
    await api(page, "DELETE", `/api/documents/${documentId}`);
    expect(errors).toEqual([]);
  });
});
