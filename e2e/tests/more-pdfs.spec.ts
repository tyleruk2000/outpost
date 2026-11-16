/**
 * Two more PDFs Outpost makes, each added to the library from the screen that makes
 * it: the contacts emergency sheet and sun times for a place. For each: the file saved
 * to the device, the same bytes added through the library's own upload, read by the
 * server for its text, found by search and opened in the reader.
 *
 * The emergency sheet holds a name in Greek and one in Polish, which the PDF's own
 * typefaces cannot write. The browser draws them as pictures, and the words are kept
 * in the file, unseen, so that the library reads them. Every person here is made up.
 */
import fs from "node:fs";
import type { Page } from "@playwright/test";
import { api, expect, test, watchForErrors } from "./fixtures";
import { keep } from "./map-fixture";

test.use({ timezoneId: "Europe/London" });

/** Waits until the server has read a document's text, and returns the document and that text. */
async function readByLibrary(page: Page, documentId: string) {
  await expect
    .poll(async () => (await api(page, "GET", `/api/documents/${documentId}`)).document.extraction, { timeout: 30_000 })
    .toBe("done");
  const document = (await api(page, "GET", `/api/documents/${documentId}`)).document;
  const sections = (await api(page, "GET", `/api/documents/${documentId}/text`)).sections as Array<{ page: number; text: string }>;
  const text = sections.map((section) => section.text).join("\n");
  return { document, text, prose: text.replace(/\s+/g, " ") };
}

const EMERGENCY_CONTACTS = [
  {
    name: { prefix: "Dr.", given: "Ngozi", additional: "", family: "Eze", suffix: "" },
    organisation: "Fellside Surgery",
    title: "GP",
    phones: [
      { value: "+44 7700 900987", label: "mobile" },
      { value: "01632 960745", label: "out of hours, ask for the duty doctor" },
    ],
    emails: [{ value: "ngozi.eze@fellside-surgery.example", label: "work" }],
    addresses: [
      { label: "surgery", street: "4 Kästner Lane", locality: "Ambleside", region: "Cumbria", postcode: "LA22 9ZZ", country: "" },
    ],
    isEmergency: true,
    emergencyNote: "Two doors up. Has a spare key and a generator in the woodshed.",
    callsign: "M0ZOE",
    channels: [{ frequency: "145.500 MHz", mode: "FM calling, on the hour" }],
  },
  {
    name: { prefix: "", given: "Ελένη", additional: "", family: "Παπαδοπούλου", suffix: "" },
    phones: [{ value: "+30 21 0123 4567", label: "κινητό" }],
    addresses: [{ label: "", street: "Οδός Ερμού 12", locality: "Αθήνα", region: "", postcode: "105 63", country: "Greece" }],
    isEmergency: true,
  },
  {
    name: { prefix: "", given: "Bożena", additional: "", family: "Wiśniewska", suffix: "" },
    phones: [{ value: "+48 22 123 45 67", label: "home" }],
    isEmergency: true,
  },
];

/** Adds the contacts and gives back their ids, so that the test can remove them again. */
async function addEmergencyContacts(page: Page): Promise<string[]> {
  const ids: string[] = [];
  for (const body of EMERGENCY_CONTACTS) ids.push((await api(page, "POST", "/api/contacts", body)).contact.id as string);
  return ids;
}

test.describe("more PDFs made in Outpost, in the library", () => {
  const added: string[] = [];
  const contacts: string[] = [];
  test.afterAll(async ({ browser }) => {
    const page = await browser.newPage();
    const headers = { "X-Outpost-Request": "1" };
    for (const id of added) await page.request.delete(`/api/documents/${id}`, { headers });
    for (const id of contacts) await page.request.delete(`/api/contacts/${id}`, { headers });
    await page.close();
  });

  test("the emergency sheet: saved as a PDF, added to the library after the question, found by search, opened in the reader", async ({
    page,
  }, testInfo) => {
    test.setTimeout(90_000);
    const errors = watchForErrors(page);
    contacts.push(...(await addEmergencyContacts(page)));
    await page.goto("/contacts/emergency");
    const block = page.getByRole("region", { name: "The sheet as a PDF" });
    await expect(block).toContainText(/1 page of (A4|US Letter), made on this device on \d{1,2} \w+ \d{4} at \d\d:\d\d\./);
    await block.getByRole("radio", { name: "A4" }).click();
    await expect(block).toContainText("1 page of A4");
    await expect(block).toContainText("drawn in the PDF as they are here, as pictures");

    const downloading = page.waitForEvent("download");
    await block.getByRole("link", { name: "Save as PDF" }).click();
    const download = await downloading;
    expect(download.suggestedFilename()).toMatch(/^emergency-sheet-\d+-contacts-made-\d{1,2}-[a-z]{3}-\d{4}\.pdf$/);
    const bytes = fs.readFileSync(await download.path());
    await keep(testInfo, "emergency-sheet.pdf", bytes, "application/pdf");
    const file = bytes.toString("latin1");
    expect(file.startsWith("%PDF-1.")).toBe(true);
    expect(file).toContain("/MediaBox [0 0 595.28 841.89]");
    // The names the typefaces lack are pictures, and their words are in a font that draws nothing.
    expect(file).toContain("/Subtype /Image");
    expect(file).toContain("/Subtype /Type3");
    expect(file).toContain("(+44 7700 900987) Tj");
    expect(file).not.toMatch(/\([^)]*\?[^)]*\) Tj/);

    // Asked first; Cancel sends nothing.
    await block.getByRole("button", { name: "Add to library" }).click();
    const question = page.getByRole("alertdialog", { name: "Put other people’s details in the library?" });
    await expect(question).toContainText("everyone who can reach Outpost on your network can read it and find it by search");
    await expect(question).toContainText("It will not change when a contact is corrected or removed");
    await keep(testInfo, "emergency sheet, the question.png", await page.screenshot(), "image/png");
    await question.getByRole("button", { name: "Cancel" }).click();
    await expect(block.getByTestId("pdf-status")).not.toContainText("Added");

    await block.getByRole("button", { name: "Add to library" }).click();
    await question.getByRole("button", { name: "Add to library" }).click();
    const status = block.getByTestId("pdf-status");
    await expect(status).toContainText("Added to the library under “Made in Outpost” as");
    const link = status.getByRole("link", { name: /^Emergency sheet, \d+ contacts, made / });
    const title = (await link.textContent())!;
    const documentId = (await link.getAttribute("href"))!.split("/").pop()!;
    added.push(documentId);
    const { document, prose } = await readByLibrary(page, documentId);
    expect(document).toMatchObject({
      title,
      category: "Made in Outpost",
      tags: ["Emergency sheet"],
      source: "Made in Outpost from the emergency sheet of contacts: /contacts/emergency",
      type: "pdf",
      pageCount: 1,
      sizeBytes: bytes.length,
    });
    expect(Buffer.from(await (await page.request.get(document.fileUrl)).body()).equals(bytes)).toBe(true);
    // What the server read: the numbers exactly, and the names it cannot see drawn as pictures.
    for (const words of [
      "In an emergency",
      "Dr. Ngozi Eze",
      "+44 7700 900987",
      "01632 960745",
      "+30 21 0123 4567",
      "+48 22 123 45 67",
      "Ελένη Παπαδοπούλου",
      "Bożena Wiśniewska",
      "Οδός Ερμού 12, Αθήνα 105 63, Greece",
      "Two doors up. Has a spare key and a generator in the woodshed.",
    ])
      expect(prose, words).toContain(words);

    // Found by search for a name only the pictures show, and opened in the reader.
    await page.goto(`/search?q=${encodeURIComponent("Παπαδοπούλου")}`);
    const result = page.getByRole("link", { name: title }).first();
    await expect(result).toBeVisible();
    await result.click();
    await expect(page).toHaveURL(new RegExp(`/library/documents/${documentId}`));
    await expect(page.locator("canvas").first()).toBeVisible({ timeout: 15_000 });
    await keep(testInfo, "emergency sheet in the reader.png", await page.screenshot(), "image/png");
    expect(errors).toEqual([]);
  });

  test("sun times for the centre of the map: the same times as the Sun tab, in the library, found by search and opened", async ({
    page,
  }, testInfo) => {
    test.setTimeout(90_000);
    const errors = watchForErrors(page);
    await page.clock.setFixedTime(new Date("2026-06-21T09:00:00Z"));
    await page.goto("/maps?lat=51.48&lon=0&z=9");
    await expect(page.locator("canvas").first()).toBeVisible({ timeout: 15_000 });
    await page.getByRole("tab", { name: "Sun" }).click();
    await expect(page.getByRole("heading", { name: "Sun at the centre of the map" })).toBeVisible();
    const time = (label: string) =>
      page
        .locator("dl > div")
        .filter({ has: page.getByText(label, { exact: true }) })
        .locator("dd");
    await expect(time("Sunrise")).toHaveText("04:43");
    await expect(time("Sunset")).toHaveText("21:21");

    await page.getByRole("button", { name: "A PDF of sun times, day by day" }).click();
    const block = page.getByRole("region", { name: "Sun times as a PDF" });
    await block.getByRole("radio", { name: "A4" }).click();
    await expect(block).toContainText("14 days from 21 Jun 2026, a day to a line, on the clock shown above: 1 page of A4.");
    const downloading = page.waitForEvent("download");
    await block.getByRole("link", { name: "Save as PDF" }).click();
    const download = await downloading;
    expect(download.suggestedFilename()).toBe("sun-times-51-4800-0-0000-14-days-from-21-jun-2026.pdf");
    const bytes = fs.readFileSync(await download.path());
    await keep(testInfo, "sun-times-fortnight.pdf", bytes, "application/pdf");
    expect(bytes.toString("latin1")).not.toContain("/Subtype /Image");

    // A year, too, for the picture of it.
    await block.getByRole("radio", { name: "Year" }).click();
    await expect(block).toContainText(/2026, a day to a line, on the clock shown above: \d pages of A4\./);
    const year = page.waitForEvent("download");
    await block.getByRole("link", { name: "Save as PDF" }).click();
    await keep(testInfo, "sun-times-year.pdf", fs.readFileSync(await (await year).path()), "application/pdf");
    await block.getByRole("radio", { name: "2 weeks" }).click();
    await expect(block).toContainText("14 days from 21 Jun 2026");

    await block.getByRole("button", { name: "Add to library" }).click();
    const status = block.getByTestId("pdf-status");
    await expect(status).toContainText("Added to the library under “Made in Outpost” as");
    const link = status.getByRole("link", { name: "Sun times, 51.4800, 0.0000, 14 days from 21 Jun 2026" });
    const documentId = (await link.getAttribute("href"))!.split("/").pop()!;
    added.push(documentId);
    const { document, text, prose } = await readByLibrary(page, documentId);
    expect(document).toMatchObject({
      category: "Made in Outpost",
      tags: ["Sun times"],
      source: "Made in Outpost from the map: /maps?lat=51.4800&lon=0.0000&z=12.0",
      type: "pdf",
      pageCount: 1,
    });
    // The first day's row: the times the Sun tab shows, to the minute.
    expect(text).toMatch(/Sun 21 Jun +03:55 +04:43 +13:02 +21:21 +22:09 +16 h 38 min/);
    expect(prose).toContain(
      "Times are on the clock of the device that made this sheet: time zone Europe/London, UTC+1, on the 24-hour clock.",
    );
    expect(prose).toContain("hills make sunrise later and sunset earlier");

    await page.goto(`/search?q=${encodeURIComponent('"Sun times: 51.4800, 0.0000"')}`);
    const result = page.getByRole("link", { name: /Sun times, 51\.4800, 0\.0000, 14 days from 21 Jun 2026/ }).first();
    await expect(result).toBeVisible();
    await result.click();
    await expect(page).toHaveURL(new RegExp(`/library/documents/${documentId}`));
    await expect(page.locator("canvas").first()).toBeVisible({ timeout: 15_000 });
    await keep(testInfo, "sun times in the reader.png", await page.screenshot(), "image/png");
    // The document leads back to the same ground on the map.
    await page.getByRole("link", { name: "Open the map" }).click();
    await expect(page).toHaveURL(/\/maps\?lat=51\.4800&lon=0\.0000/);
    expect(errors).toEqual([]);
  });
});
