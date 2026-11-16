/**
 * PDFs Outpost makes, added to the library: a prediction, the comparison under it and a
 * coverage map. (A map page is in maps-print.spec.ts and a communication plan in
 * plans.spec.ts, each beside the rest of its screen.)
 *
 * Each goes through the library's own upload. What is checked here is the whole of it:
 * the file is made in the page, sent, filed under "Made in Outpost", read for its text
 * by the server (in typefaces the file names and does not carry), found by a search for
 * words that are only in it, and opened in Outpost's own PDF viewer.
 */
import fs from "node:fs";
import type { Page } from "@playwright/test";
import { api, expect, test, watchForErrors } from "./fixtures";
import { keep } from "./map-fixture";

/** Waits until the server has read a document's text, and returns the document and that text. */
export async function readByLibrary(page: Page, documentId: string) {
  await expect
    .poll(async () => (await api(page, "GET", `/api/documents/${documentId}`)).document.extraction, { timeout: 30_000 })
    .toBe("done");
  const document = (await api(page, "GET", `/api/documents/${documentId}`)).document;
  const sections = (await api(page, "GET", `/api/documents/${documentId}/text`)).sections as Array<{ page: number; text: string }>;
  const text = sections.map((section) => section.text).join("\n");
  // `text` keeps the lines of the page, for reading a table row by row; `prose` runs them together, since a sentence breaks where the page is wide.
  return { document, text, prose: text.replace(/\s+/g, " ") };
}

test.describe("PDFs made in Outpost, in the library", () => {
  const added: string[] = [];
  test.afterAll(async ({ browser }) => {
    const page = await browser.newPage();
    for (const id of added) await page.request.delete(`/api/documents/${id}`, { headers: { "X-Outpost-Request": "1" } });
    await page.close();
  });

  test("a prediction is saved as a PDF, added to the library, found by search and opened in the reader", async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    const errors = watchForErrors(page);
    await page.goto("/radio/propagation");
    await page.getByRole("button", { name: "Try London to Birmingham on 40 m" }).click();
    await expect(page.getByRole("heading", { name: "London to Birmingham" })).toBeVisible();
    // The figures checked below are those of one fixed month.
    await page.getByLabel("Date (UTC)").fill("2026-11-16");
    await page.getByRole("button", { name: "Predict", exact: true }).click();
    await expect(page.getByText(/Monthly median for November 2026 at smoothed sunspot number 83/)).toBeVisible();

    const block = page.getByRole("region", { name: "This prediction as a PDF" });
    await expect(block).toContainText(/2 pages of (A4|US Letter), made on this device/);
    await block.getByRole("radio", { name: "A4" }).click();
    await expect(block).toContainText("2 pages of A4");

    // Saved to the device: a file of two A4 pages, with its tables in Courier and nothing in it but text.
    const downloading = page.waitForEvent("download");
    await block.getByRole("link", { name: "Save as PDF" }).click();
    const download = await downloading;
    expect(download.suggestedFilename()).toBe("hf-prediction-london-to-birmingham-40-m-for-16-nov-2026.pdf");
    const bytes = fs.readFileSync(await download.path());
    await keep(testInfo, "prediction.pdf", bytes, "application/pdf");
    const file = bytes.toString("latin1");
    expect(file.startsWith("%PDF-1.")).toBe(true);
    expect((file.match(/\/Type \/Page\b/g) ?? []).length).toBe(2);
    expect(file).toContain("/MediaBox [0 0 595.28 841.89]");
    expect(file).toContain("(HF prediction: London to Birmingham, 7.10 MHz \\(40 m\\))");
    expect(file).toContain("/BaseFont /Courier");
    expect(file).not.toContain("/Subtype /Image");

    // Added to the library: the same bytes, by the library's own upload.
    await block.getByRole("button", { name: "Add to library" }).click();
    const status = block.getByTestId("pdf-status");
    await expect(status).toContainText("Added to the library under “Made in Outpost” as");
    const link = status.getByRole("link", { name: "HF prediction, London to Birmingham, 40 m, for 16 Nov 2026" });
    const documentId = (await link.getAttribute("href"))!.split("/").pop()!;
    added.push(documentId);
    const { document, text, prose } = await readByLibrary(page, documentId);
    expect(document).toMatchObject({
      title: "HF prediction, London to Birmingham, 40 m, for 16 Nov 2026",
      originalName: "hf-prediction-london-to-birmingham-40-m-for-16-nov-2026.pdf",
      category: "Made in Outpost",
      tags: ["HF prediction"],
      source: "Made in Outpost from the HF propagation planner: /radio/propagation",
      type: "pdf",
      pageCount: 2,
      sizeBytes: bytes.length,
      scanPages: 0,
    });
    const stored = Buffer.from(await (await page.request.get(document.fileUrl)).body());
    expect(stored.equals(bytes)).toBe(true);

    // What the server read out of it, with neither typeface in the file: the prose, and the tables row by row.
    expect(prose).toContain("HF prediction: London to Birmingham, 7.10 MHz (40 m)");
    expect(prose).toContain("Path: 162 km, bearing 313° out and 131° back.");
    expect(prose).toContain("Transmitter: London, 51.51, -0.13 (IO91WM). 5 W.");
    expect(prose).toMatch(/Transmitting antenna: Horizontal half-wave dipole \(VOACAP type 23\), 5 m above average ground/);
    expect(prose).toMatch(/The engine ran at a smoothed sunspot number of 83\. It is not a reading of the ionosphere on the day\./);
    expect(prose).toMatch(/7\.10 MHz does best at \d\d:00 UTC: SSB voice reaches what it is taken to need on \d+% of days\./);
    // The hour table: UTC, reliability, ratio and its spread, signal, S-meter, MUF, FOT, path and angle.
    expect(text).toMatch(/\n12:00 +\d+ +-?\d+ +-?\d+ +-?\d+ +-\d+ +(S\d|below S1)[^\n]* +\d+\.\d +\d+\.\d +\d[EF]\d? +\d+°/);
    // The band table: nine bands, each with twenty-four figures or dashes.
    for (const band of ["80 m", "60 m", "40 m", "30 m", "20 m", "17 m", "15 m", "12 m", "10 m"]) {
      expect(text, band).toMatch(new RegExp(`\\n${band}( +(\\d{1,3}|-)){24}\\n`));
    }
    expect(prose).toContain("Nothing here says which frequencies you may transmit on.");
    expect(prose).toMatch(/Worked out by VOACAP Version 16\.\d+W, run by hfcast/);

    // Found by search, by words that are in the PDF and not in its title.
    await page.goto(`/search?q=${encodeURIComponent('"bearing 313° out and 131° back"')}`);
    const result = page.getByRole("link", { name: /HF prediction, London to Birmingham, 40 m, for 16 Nov 2026/ }).first();
    await expect(result).toBeVisible();
    await expect(page.getByText(/Page 1/).first()).toBeVisible();
    await result.click();
    await expect(page).toHaveURL(new RegExp(`/library/documents/${documentId}`));
    // Opened in Outpost's own viewer, both pages of it.
    await expect(page.locator("canvas").first()).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("label", { hasText: "of 2" }).locator("input")).toBeVisible();
    await keep(testInfo, "prediction in the reader.png", await page.screenshot(), "image/png");
    // The document says Outpost made it, and leads back to the planner.
    await page.getByRole("link", { name: "Open the HF propagation planner" }).click();
    await expect(page).toHaveURL(/\/radio\/propagation$/);

    // Asked again, the answer is the same answer and the file the same file: the library offers the one it has.
    await page.getByRole("button", { name: "Predict", exact: true }).click();
    await expect(page.getByText(/Monthly median for November 2026 at smoothed sunspot number 83/)).toBeVisible();
    const again = page.getByRole("region", { name: "This prediction as a PDF" });
    await again.getByRole("button", { name: "Add to library" }).click();
    await expect(again.getByTestId("pdf-status")).toContainText(
      "Already in the library as HF prediction, London to Birmingham, 40 m, for 16 Nov 2026",
    );
    await expect(again.getByTestId("pdf-status")).toContainText("Nothing was added again.");
    expect((await api(page, "GET", `/api/documents?q=${encodeURIComponent("HF prediction, London to Birmingham, 40 m")}`)).total).toBe(1);
    expect(errors).toEqual([]);
  });

  test("the comparison under a prediction goes to the library with every row's figures", async ({ page }) => {
    test.setTimeout(90_000);
    const errors = watchForErrors(page);
    await page.goto("/radio/propagation");
    await page.getByRole("button", { name: "Try London to Birmingham on 40 m" }).click();
    await page.getByLabel("Date (UTC)").fill("2026-11-16");
    await page.getByRole("button", { name: "Predict", exact: true }).click();
    const block = page.getByRole("region", { name: "This comparison as a PDF" });
    await expect(block).toBeVisible({ timeout: 30_000 });
    await block.getByRole("button", { name: "Add to library" }).click();
    const link = block
      .getByTestId("pdf-status")
      .getByRole("link", { name: /^HF comparison, London to Birmingham, 40 m, months of the year/ });
    await expect(link).toBeVisible({ timeout: 20_000 });
    const documentId = (await link.getAttribute("href"))!.split("/").pop()!;
    added.push(documentId);
    const { document, text, prose } = await readByLibrary(page, documentId);
    expect(document).toMatchObject({ category: "Made in Outpost", tags: ["HF comparison"], type: "pdf" });
    expect(prose).toContain("HF comparison: London to Birmingham, 7.10 MHz (40 m), months of the year");
    expect(prose).toContain(
      "The same path in each month, all at the sunspot number of the month asked about, so that only the season changes.",
    );
    // Twelve months, each with twenty-four hours of reliability.
    for (const month of ["Jan", "Jun", "Dec"]) expect(text, month).toMatch(new RegExp(`\\n${month}( +(\\d{1,3}|-)){24}\\n`));
    expect(errors).toEqual([]);
  });

  test("a coverage map is made into a PDF with its picture, legend and grid in figures, and added to the library", async ({
    page,
  }, testInfo) => {
    test.setTimeout(150_000);
    const errors = watchForErrors(page);
    await page.goto("/radio/coverage");
    await page.getByRole("button", { name: "Try London on 40 m, over Britain and Ireland" }).click();
    await expect(page.getByRole("heading", { name: "What this map rests on" })).toBeVisible({ timeout: 60_000 });
    const block = page.getByRole("region", { name: "This map as a PDF" });
    await block.scrollIntoViewIfNeeded();
    // Nothing is made, and nothing sent, until it is asked for.
    await expect(block.getByRole("link", { name: "Save as PDF" })).toBeHidden();
    await block.getByRole("button", { name: "Make the PDF" }).click();
    const save = block.getByRole("link", { name: "Save as PDF" });
    await expect(save).toBeVisible({ timeout: 90_000 });
    await expect(block.getByText("The PDF has the figures but not the picture of the map")).toBeHidden();
    const downloading = page.waitForEvent("download");
    await save.click();
    const download = await downloading;
    expect(download.suggestedFilename()).toMatch(/^hf-coverage-london-40-m-reliability-at-12-00-utc-for-\d+-[a-z]{3}-\d{4}\.pdf$/);
    const bytes = fs.readFileSync(await download.path());
    await keep(testInfo, "coverage.pdf", bytes, "application/pdf");
    const file = bytes.toString("latin1");
    // The map is in the file as a picture, and the rest of the page as text.
    expect((file.match(/\/Subtype \/Image/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect(file).toContain("(The same grid in figures)");

    await block.getByRole("button", { name: "Add to library" }).click();
    const link = block.getByTestId("pdf-status").getByRole("link", { name: /^HF coverage, London, 40 m, reliability at 12:00 UTC/ });
    await expect(link).toBeVisible({ timeout: 20_000 });
    const documentId = (await link.getAttribute("href"))!.split("/").pop()!;
    added.push(documentId);
    const { document, text, prose } = await readByLibrary(page, documentId);
    expect(document).toMatchObject({
      category: "Made in Outpost",
      tags: ["HF coverage map"],
      source: "Made in Outpost from the HF coverage map screen: /radio/coverage",
      sizeBytes: bytes.length,
    });
    expect(prose).toContain("HF coverage: London, 7.10 MHz (40 m)");
    expect(prose).toMatch(/Reliability at 12:00 UTC, for \d+ \w+ \d{4}\./);
    expect(text).toMatch(/50 to 69% +\d+ cells?/);
    expect(prose).toMatch(/The grid is \d+ × \d+ cells of .* Each cell is one answer from the engine/);
    // The grid in figures: a latitude, then one class to a cell.
    expect(text).toMatch(/\n\d\d\.\d\d +([0-5x-] )+[0-5x-]\n/);
    // Changing the hour makes the file out of date, and it is taken down.
    await page.getByRole("button", { name: "An hour later" }).click();
    await expect(block.getByRole("button", { name: "Make the PDF" })).toBeVisible();
    await expect(block.getByRole("link", { name: "Save as PDF" })).toBeHidden();
    expect(errors).toEqual([]);
  });
});
