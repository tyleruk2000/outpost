/**
 * The household book, made in the page and added to the library: the print kit's PDF
 * (laid out by pdfmake in Outpost's own typeface, loaded only when the book is made, from
 * Outpost itself), read by the server for its text, with an emergency plan in it in full
 * and a fridge sheet for it. The old address of the household binder opens the book.
 */
import fs from "node:fs";
import type { Page } from "@playwright/test";
import { api, expect, test, watchForErrors } from "./fixtures";
import { keep } from "./map-fixture";

/** Waits until the server has read a document's text, and returns it run together. */
async function readByLibrary(page: Page, documentId: string) {
  await expect
    .poll(async () => (await api(page, "GET", `/api/documents/${documentId}`)).document.extraction, { timeout: 30_000 })
    .toBe("done");
  const sections = (await api(page, "GET", `/api/documents/${documentId}/text`)).sections as Array<{ page: number; text: string }>;
  return sections
    .map((section) => section.text)
    .join("\n")
    .replace(/\s+/g, " ");
}

test.describe("the household book", () => {
  const made: { documents: string[]; plans: string[] } = { documents: [], plans: [] };
  test.afterAll(async ({ browser }) => {
    const page = await browser.newPage();
    for (const id of made.documents) await page.request.delete(`/api/documents/${id}`, { headers: { "X-Outpost-Request": "1" } });
    for (const id of made.plans) await page.request.delete(`/api/emergency-plans/${id}`, { headers: { "X-Outpost-Request": "1" } });
    await page.close();
  });

  test("is made as one PDF with every plan in it, whose words the library can read", async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    const errors = watchForErrors(page);
    const plan = await api(page, "POST", "/api/emergency-plans", {
      name: "Street party gone wrong",
      kind: "other",
      kindText: "Street event",
      templateId: null,
      emergencyNumber: "999",
      reviewEveryDays: 180,
      body: {
        steps: [{ id: "x1", phase: "during", text: "Walk Gran home by the back lane.", origin: null }],
        people: [],
        contacts: [],
        places: [],
        comms: { text: "", commPlanId: null, frequency: "", schedule: "" },
        days: null,
        supplies: [],
        powerPlanId: null,
        where: [],
        notes: "",
        links: [],
      },
    });
    made.plans.push(plan.plan.id);

    // The binder's old address opens the book.
    await page.goto("/prepare/binder");
    await expect(page).toHaveURL(/\/prepare\/book$/);
    await expect(page.getByRole("heading", { name: "Household book", level: 1 })).toBeVisible();

    const book = await api(page, "GET", "/api/household-book");
    await api(page, "PUT", "/api/household-book", {
      ...book.answers,
      householdName: "The Rowans",
      paper: "a4",
      notesPages: 0,
      baseAnswersAt: book.answersAt,
    });
    await page.reload();

    await page.getByRole("button", { name: "Make the book" }).click();
    const save = page.getByRole("link", { name: "Save as PDF" });
    await expect(save).toBeVisible({ timeout: 60_000 });
    // The first pages are shown as they print, drawn from the file itself.
    await expect(page.getByTestId("paper-preview").getByRole("img").first()).toBeVisible({ timeout: 30_000 });

    const downloading = page.waitForEvent("download");
    await save.click();
    const bytes = fs.readFileSync(await (await downloading).path());
    await keep(testInfo, "household-book.pdf", bytes, "application/pdf");
    const file = bytes.toString("latin1");
    expect(file.startsWith("%PDF-")).toBe(true);
    expect(file).toContain("595.28 841.89");
    // The typeface is in the file, not one a reader is asked to supply.
    expect(file).toMatch(/\/FontName \/[A-Z]{6}\+AtkinsonHyperlegibleNext/);

    await page.getByRole("button", { name: "Add to library" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Add to library" }).click();
    const status = page.getByTestId("pdf-status");
    await expect(status).toContainText("Added to the library under “Made in Outpost” as");
    const documentId = (await status.getByRole("link").first().getAttribute("href"))!.split("/").pop()!;
    made.documents.push(documentId);
    const prose = await readByLibrary(page, documentId);
    expect(prose).toContain("The Rowans: household book");
    expect(prose).toContain("Fridge sheet");
    expect(prose).toContain("Street party gone wrong");
    expect(prose).toContain("Walk Gran home by the back lane.");
    expect(prose).toContain("Got it");
    expect(prose).toContain("Top arm: hand on bicep of bottom arm");
    expect(errors).toEqual([]);
  });
});
