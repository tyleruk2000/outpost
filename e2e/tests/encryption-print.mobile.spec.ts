/**
 * Printing the paper aids from a phone: the sheets open over the whole screen, the
 * browser's print is asked for, and the same sheets are saved as a PDF made in the
 * page. Where the browser's print cannot be counted on, the PDF comes first.
 *
 * This is Chromium at a phone's size. What a real iPhone does with `window.print()`
 * is not something this suite can see; docs/encryption.md says what is known.
 */
import fs from "node:fs";
import type { Locator, Page } from "@playwright/test";
import { expect, test, watchForErrors } from "./fixtures";
import { pdfPages } from "./pdf";

/** The letters of each copy of each pad in a sheet on screen, by its heading. */
async function lettersOnScreen(sheet: Locator): Promise<Record<string, string>> {
  return sheet
    .locator("[data-pad]")
    .evaluateAll((copies) =>
      Object.fromEntries(
        copies.map((copy) => [
          `One-time pad ${copy.getAttribute("data-pad")}, copy ${copy.getAttribute("data-copy")} of 2`,
          [...copy.querySelectorAll("p.flex span:last-child")].map((line) => line.textContent!.replace(/ /g, "")).join(""),
        ]),
      ),
    );
}

/** The same from a PDF file, read by pdf.js: under each pad's heading, every run of capital letters, in the order drawn. */
async function lettersInPdf(bytes: Buffer): Promise<Record<string, string>> {
  const found: Record<string, string> = {};
  let heading: string | undefined;
  for (const words of (await pdfPages(bytes)).flatMap((page) => page.items)) {
    if (words.startsWith("One-time pad ")) {
      heading = words.trim();
      found[heading] = "";
    } else if (heading && /^[A-Z ]+$/.test(words)) found[heading] += words.replace(/ /g, "");
  }
  return found;
}

async function savePdf(page: Page, view: Locator): Promise<{ name: string; bytes: Buffer }> {
  const downloading = page.waitForEvent("download");
  await view.getByRole("link", { name: "Save as PDF" }).tap();
  const download = await downloading;
  return { name: download.suggestedFilename(), bytes: fs.readFileSync(await download.path()) };
}

async function openPads(page: Page): Promise<Locator> {
  await page.goto("/encryption?tab=hand");
  await page.getByRole("combobox", { name: "Cipher" }).tap();
  await page.getByRole("option", { name: "One-time pad" }).tap();
  await page.getByRole("button", { name: "Make pads" }).tap();
  await expect(page.getByTestId("pad-preview").locator("[data-pad]")).toHaveCount(4);
  await page.getByRole("button", { name: "Print pads" }).tap();
  const view = page.getByRole("dialog", { name: "One-time pads" });
  await expect(view).toBeVisible();
  return view;
}

test.describe("printing paper aids from a phone", () => {
  test("opens the pads to print, saves them as a PDF, and the file holds the letters on the screen", async ({ page }) => {
    const errors = watchForErrors(page);
    const viewport = page.viewportSize()!;
    // A browser whose Print button does nothing, as some phones' do: the call returns and no dialogue opens.
    await page.addInitScript(() => {
      (window as unknown as { printed: number }).printed = 0;
      window.print = () => {
        (window as unknown as { printed: number }).printed += 1;
      };
    });
    await page.goto("/encryption?tab=hand");
    await page.getByRole("combobox", { name: "Cipher" }).tap();
    await page.getByRole("option", { name: "One-time pad" }).tap();
    // From here on the page asks the server for nothing and sends it nothing.
    const asked: string[] = [];
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (request.method() !== "GET" || url.pathname.startsWith("/api/")) asked.push(`${request.method()} ${url.pathname}`);
    });
    await page.getByRole("button", { name: "Make pads" }).tap();
    const preview = page.getByTestId("pad-preview");
    await expect(preview.locator("[data-pad]")).toHaveCount(4);
    const made = await lettersOnScreen(preview);
    expect(Object.keys(made)).toHaveLength(4);
    for (const letters of Object.values(made)) expect(letters).toMatch(/^[A-Z]{250}$/);

    const open = page.getByRole("button", { name: "Print pads" });
    expect((await open.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await open.tap();
    const view = page.getByRole("dialog", { name: "One-time pads" });
    await expect(view).toBeVisible();
    // Nothing is printed by opening it.
    expect(await page.evaluate(() => (window as unknown as { printed: number }).printed)).toBe(0);

    // It fills the screen, and nothing pushes it sideways.
    const box = (await view.boundingBox())!;
    expect(box.x).toBe(0);
    expect(box.y).toBe(0);
    expect(box.width).toBe(viewport.width);
    expect(box.height).toBe(viewport.height);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    expect(await view.locator(".print-scroll").evaluate((node) => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(1);
    for (const control of [
      view.getByRole("button", { name: "Print", exact: true }),
      view.getByRole("link", { name: "Save as PDF" }),
      view.getByRole("button", { name: "Close" }),
    ]) {
      const target = (await control.boundingBox())!;
      expect(target.height).toBeGreaterThanOrEqual(44);
      expect(target.x).toBeGreaterThanOrEqual(0);
      expect(target.x + target.width).toBeLessThanOrEqual(viewport.width);
    }

    // The sheet: white paper as wide as the screen allows, black letters, and its top in sight without scrolling.
    const paper = view.getByTestId("print-paper");
    const sheet = (await paper.boundingBox())!;
    expect(sheet.x).toBeGreaterThanOrEqual(0);
    expect(sheet.x + sheet.width).toBeLessThanOrEqual(viewport.width);
    expect(sheet.width).toBeGreaterThan(viewport.width - 40);
    expect(sheet.y).toBeLessThan(viewport.height - 80);
    expect(await paper.evaluate((node) => getComputedStyle(node).backgroundColor)).toBe("rgb(255, 255, 255)");
    const firstLine = paper.locator("[data-pad] p.flex span:last-child").first();
    expect(await firstLine.evaluate((node) => getComputedStyle(node).color)).toBe("rgb(0, 0, 0)");
    expect(await firstLine.evaluate((node) => getComputedStyle(node).fontFamily)).toMatch(/mono/i);
    // A whole line of fifty letters is on the paper, not cut off at its edge.
    const line = (await firstLine.boundingBox())!;
    expect(line.x + line.width).toBeLessThanOrEqual(sheet.x + sheet.width);
    expect(await lettersOnScreen(paper)).toEqual(made);
    await expect(view.getByText("A saved PDF is another copy of the pads")).toBeVisible();

    // The PDF: A4 for a device set to British English, laid out with the print kit, and letter for letter the pads on the screen.
    const a4 = await savePdf(page, view);
    expect(a4.name).toBe("one-time-pads.pdf");
    const a4Text = a4.bytes.toString("latin1");
    expect(a4Text.startsWith("%PDF-1.")).toBe(true);
    const a4Pages = await pdfPages(a4.bytes);
    expect(a4Pages).toHaveLength(1);
    expect(a4Pages[0]).toMatchObject({ width: 595.28, height: 841.89 });
    expect(await lettersInPdf(a4.bytes)).toEqual(made);
    const said = a4Pages[0]!.items.join(" ");
    expect(said.split("For the sender").length - 1).toBe(2);
    expect(said.split("For the receiver").length - 1).toBe(2);

    // The other paper.
    await expect(view.getByTestId("pdf-summary")).toHaveText("The PDF is 1 page of A4.");
    await view.getByRole("radio", { name: "US Letter" }).tap();
    await expect(view.getByTestId("pdf-summary")).toHaveText("The PDF is 1 page of US Letter.");
    const letter = await savePdf(page, view);
    expect((await pdfPages(letter.bytes))[0]).toMatchObject({ width: 612, height: 792 });
    expect(await lettersInPdf(letter.bytes)).toEqual(made);

    // Print is asked of the browser once. This one does nothing, and the screen says what to do instead.
    await expect(view.getByText(/If no print dialogue opened/)).toBeHidden();
    await view.getByRole("button", { name: "Print", exact: true }).tap();
    expect(await page.evaluate(() => (window as unknown as { printed: number }).printed)).toBe(1);
    const notice = view.getByRole("status").filter({ hasText: "If no print dialogue opened, this browser does not print from a button" });
    await expect(notice).toBeVisible();
    await expect(notice).toContainText("Save the PDF and print that.");
    await expect(notice).toContainText("The browser’s own Share menu, then Print, prints this sheet too.");

    // Which is true: laid out for paper, the page is the sheet and nothing else.
    await page.emulateMedia({ media: "print" });
    await expect(paper.getByText(Object.keys(made)[0]!)).toBeVisible();
    await expect(view.locator(".print-chrome").first()).toBeHidden();
    await expect(page.locator("#root")).toBeHidden();
    await page.emulateMedia({ media: null });

    await view.getByRole("button", { name: "Close" }).tap();
    await expect(view).toBeHidden();
    await expect(page.locator("body > .print-sheet")).toHaveCount(0);
    // The pads are still there until the screen is left; nothing of them is in the browser's storage.
    expect(await lettersOnScreen(preview)).toEqual(made);
    const stored = await page.evaluate(() => JSON.stringify([{ ...localStorage }, { ...sessionStorage }]));
    for (const letters of Object.values(made)) expect(stored).not.toContain(letters.slice(0, 20));
    expect(asked).toEqual([]);
    expect(errors).toEqual([]);
  });

  test("leaves Print out and leads with the PDF where the browser has no print", async ({ page }) => {
    const errors = watchForErrors(page);
    await page.addInitScript(() => {
      Object.defineProperty(window, "print", { value: undefined, configurable: true, writable: true });
    });
    const view = await openPads(page);
    await expect(view.getByRole("button", { name: "Print", exact: true })).toHaveCount(0);
    const notice = view.getByRole("status").filter({ hasText: "This browser cannot print from a page" });
    await expect(notice).toBeVisible();
    await expect(notice).toContainText("Save the PDF and print that.");
    const save = view.getByRole("link", { name: "Save as PDF" });
    await expect(save).toBeVisible();
    const paper = view.getByTestId("print-paper");
    await expect(paper.locator("[data-pad]")).toHaveCount(4);
    const saved = await savePdf(page, view);
    expect(await lettersInPdf(saved.bytes)).toEqual(await lettersOnScreen(paper));
    expect(errors).toEqual([]);
  });

  test("leads with the PDF where the app was opened from the Home Screen, and prints a Vigenère square the same way", async ({ page }) => {
    const errors = watchForErrors(page);
    await page.addInitScript(() => {
      // What Safari says of a site opened from the Home Screen as an app of its own.
      Object.defineProperty(Navigator.prototype, "standalone", { get: () => true, configurable: true });
      (window as unknown as { printed: number }).printed = 0;
      window.print = () => {
        (window as unknown as { printed: number }).printed += 1;
        window.dispatchEvent(new Event("beforeprint"));
      };
    });
    const view = await openPads(page);
    const save = (await view.getByRole("link", { name: "Save as PDF" }).boundingBox())!;
    const print = (await view.getByRole("button", { name: "Print", exact: true }).boundingBox())!;
    // The PDF is the first of the two.
    expect(save.y < print.y || (save.y === print.y && save.x < print.x)).toBe(true);
    await expect(view.getByText("Opened from the Home Screen, a phone does not always print from a button")).toBeVisible();
    // Print is still there to try, and a browser that does print is not told it failed.
    await view.getByRole("button", { name: "Print", exact: true }).tap();
    expect(await page.evaluate(() => (window as unknown as { printed: number }).printed)).toBe(1);
    await page.waitForTimeout(1_800);
    await expect(view.getByText(/If no print dialogue opened/)).toBeHidden();
    await view.getByRole("button", { name: "Close" }).tap();
    await expect(view).toBeHidden();

    // The square.
    await page.getByRole("combobox", { name: "Cipher" }).tap();
    await page.getByRole("option", { name: "Vigenère" }).tap();
    await page.getByLabel("Key", { exact: true }).fill("LEMON");
    await page.getByRole("button", { name: "Print a Vigenère square" }).tap();
    const square = page.getByRole("dialog", { name: "Vigenère square" });
    await expect(square).toBeVisible();
    await expect(square.getByText(/another copy of the pads/)).toHaveCount(0);
    const paper = square.getByTestId("print-paper");
    await expect(paper.locator("tbody tr")).toHaveCount(26);
    const viewport = page.viewportSize()!;
    const table = (await paper.locator("table").boundingBox())!;
    expect(table.x).toBeGreaterThanOrEqual(0);
    expect(table.x + table.width).toBeLessThanOrEqual(viewport.width);
    const saved = await savePdf(page, square);
    expect(saved.name).toBe("vigenere-square.pdf");
    const [first] = await pdfPages(saved.bytes);
    expect(first).toMatchObject({ width: 595.28, height: 841.89 });
    expect(first!.items.join(" ")).toContain("Vigenère square");
    // Every row of the square, letter by letter, the last of them Z, then Z to Y.
    const letters = first!.items.filter((words) => /^[A-Z]$/.test(words)).join("");
    expect(letters).toContain("ZZABCDEFGHIJKLMNOPQRSTUVWXY");
    expect(letters).toContain("AABCDEFGHIJKLMNOPQRSTUVWXYZ");
    expect(errors).toEqual([]);
  });
});
