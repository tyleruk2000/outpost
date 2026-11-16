import fs from "node:fs";
import type { Page } from "@playwright/test";
import { api, expect, test, watchForErrors } from "./fixtures";

async function addStation(page: Page, name: string, where: string, watts: string) {
  await page.getByRole("button", { name: "Add a station" }).click();
  const dialog = page.getByRole("dialog", { name: "Add a station" });
  await dialog.getByLabel("Name").fill(name);
  await dialog.getByLabel("Where it is", { exact: true }).fill(where);
  await dialog.getByLabel("Transmitter power, watts").fill(watts);
  await dialog.getByRole("button", { name: "Add station" }).click();
  await expect(dialog).toBeHidden();
}

async function exported(page: Page, button: string): Promise<{ name: string; bytes: Buffer }> {
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: button }).click();
  const download = await downloading;
  return { name: download.suggestedFilename(), bytes: fs.readFileSync(await download.path()) };
}

test.describe("Communication plans", () => {
  test("a plan of three stations is worked out by the engine, says how its bands were chosen, and is written out as a PDF and as Markdown", async ({
    page,
  }) => {
    const errors = watchForErrors(page);
    const note = (await api(page, "POST", "/api/notes", { title: "Net procedure for the family" })).note;
    await page.goto("/radio");
    await page
      .getByRole("link", { name: /Communication plans/ })
      .first()
      .click();
    await expect(page.getByRole("heading", { level: 1, name: "Communication plans" })).toBeVisible();
    await page.getByRole("button", { name: "New plan" }).first().click();
    await page.getByRole("dialog", { name: "New plan" }).getByLabel("Name").fill("Family net");
    await page.getByRole("button", { name: "Create plan" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Family net" })).toBeVisible();
    await expect(page.getByText("A plan needs at least two stations before there is a pair to work out.")).toBeVisible();

    await addStation(page, "Home base", "51.5074, -0.1278", "5");
    await addStation(page, "Remote shelter", "54.4609, -3.0886", "5");
    await addStation(page, "Gran's house", "IO92BL", "50");
    await expect(page.getByText(/52\.48, -1\.88 · IO92BL · 50 W/)).toBeVisible();
    // The figures checked below are those of one fixed month.
    await page.getByLabel("Date (UTC)").fill("2026-11-16");
    await expect(page.getByText(/Not worked out for the plan as it stands/)).toBeVisible();

    await page.getByRole("button", { name: "Work out the plan" }).click();
    await expect(page.getByRole("heading", { name: "How the bands are chosen" })).toBeVisible();
    await expect(page.getByText(/Monthly median for November 2026 at smoothed sunspot number 83/)).toBeVisible();
    await expect(
      page.getByText(/The primary band is the one whose two-way figure, averaged over the hours of the window, is highest/),
    ).toBeVisible();
    const matrix = page.getByRole("table", { name: "The primary and alternate band for each pair of stations" });
    await expect(matrix.getByRole("row")).toHaveCount(4);
    await expect(matrix.getByRole("row", { name: /Home base and Remote shelter/ })).toContainText(/383 km/);
    await expect(matrix.getByRole("row", { name: /Home base and Gran's house/ })).toContainText(/\d\d m, .*up to \d+%/);
    await expect(page.getByText(/by VOACAP Version 16\.\d+W\./)).toBeVisible();

    // A note is linked to the plan and travels with it.
    // Other tests leave notes and documents of their own; the one linked is found by its own words.
    await page.getByLabel("Find a note or document to link").fill("procedure family");
    await page.getByRole("button", { name: "Find" }).click();
    await page
      .getByRole("list", { name: "Notes and documents found" })
      .getByRole("listitem")
      .filter({ hasText: "Net procedure for the family" })
      .getByRole("button", { name: "Link" })
      .click();
    await expect(page.getByRole("link", { name: "Net procedure for the family" })).toHaveAttribute("href", `/notes/${note.id}`);
    // Linking does not change what the engine was asked: the matrix is still there after a reload.
    await page.reload();
    await expect(page.getByRole("heading", { name: "How the bands are chosen" })).toBeVisible();

    const markdown = await exported(page, "Export as Markdown");
    expect(markdown.name).toBe("communication-plan-family-net.md");
    const text = markdown.bytes.toString("utf8");
    expect(text).toMatch(/^# Communication plan: Family net\n/);
    expect(text).toContain("The model works by month, so this is a plan for any day of November 2026.");
    expect(text).toContain("It is not a reading of the ionosphere on the day.");
    expect(text).toMatch(/\| Home base and Remote shelter +\| 383 \| \d\d m, up to \d+% +\|/);
    expect(text).toContain("## How the bands were chosen");
    expect(text).toMatch(/\| UTC +\| +08 \| +09 \|/);
    expect(text).toContain("- Net procedure for the family (a note)");
    expect(text).toContain("Nothing here says which frequencies you may transmit on.");
    // Columns stand in line in a plain-text view: every line of a table is the same width.
    for (const table of text.split("\n\n").filter((part) => part.startsWith("|"))) {
      expect(new Set(table.split("\n").map((line) => [...line].length)).size).toBe(1);
    }

    // The PDF is there as soon as the plan has figures; saving it is a plain link to the file.
    const downloading = page.waitForEvent("download");
    await page.getByRole("link", { name: "Save as PDF" }).click();
    const download = await downloading;
    const pdf = { name: download.suggestedFilename(), bytes: fs.readFileSync(await download.path()) };
    expect(pdf.name).toBe("communication-plan-family-net-for-16-nov-2026.pdf");
    const file = pdf.bytes.toString("latin1");
    expect(file.startsWith("%PDF-1.")).toBe(true);
    expect(file.trimEnd().endsWith("%%EOF")).toBe(true);
    expect(file).toContain("(Communication plan: Family net)");
    expect(file).toContain("(Home base and Remote shelter)");
    expect(file).toContain("(How the bands were chosen)");
    expect(file).toContain("/BaseFont /Courier");
    expect((file.match(/\/Type \/Page\b/g) ?? []).length).toBeGreaterThanOrEqual(2);

    // The same file goes into the library, which reads its text for search and records where it came from.
    const planId = page.url().split("/").pop()!;
    await page.getByRole("button", { name: "Add to library" }).click();
    const status = page.getByTestId("pdf-status");
    await expect(status).toContainText("Added to the library under “Made in Outpost” as");
    const added = status.getByRole("link", { name: "Communication plan, Family net, for 16 Nov 2026" });
    const documentId = (await added.getAttribute("href"))!.split("/").pop()!;
    await expect
      .poll(async () => (await api(page, "GET", `/api/documents/${documentId}`)).document.extraction, { timeout: 20_000 })
      .toBe("done");
    const document = (await api(page, "GET", `/api/documents/${documentId}`)).document;
    expect(document).toMatchObject({
      title: "Communication plan, Family net, for 16 Nov 2026",
      category: "Made in Outpost",
      tags: ["Communication plan"],
      source: `Made in Outpost from the communication plan “Family net”: /radio/plans/${planId}`,
      sizeBytes: pdf.bytes.length,
    });
    // The tables are in Courier, which the file names and does not carry; the library reads them all the same.
    const pages = (await api(page, "GET", `/api/documents/${documentId}/text`)).sections as Array<{ text: string }>;
    const words = pages.map((section) => section.text).join("\n");
    expect(words).toContain("Home base and Remote shelter");
    expect(words).toMatch(/Gran's house +52\.48, -1\.88 +IO92BL +50 W/);
    // Pressed again, it is the same file: the library says it has it, and keeps one.
    await page.getByRole("button", { name: "Add to library" }).click();
    await expect(status).toContainText("Already in the library as Communication plan, Family net, for 16 Nov 2026");
    expect((await api(page, "GET", "/api/documents?q=Communication%20plan%2C%20Family%20net")).total).toBe(1);
    // From the document, the way back to the plan it was made from.
    await added.click();
    await expect(page.locator("canvas").first()).toBeVisible({ timeout: 15_000 });
    await page.getByRole("link", { name: "Open the communication plan “Family net”" }).click();
    await expect(page).toHaveURL(new RegExp(`/radio/plans/${planId}$`));
    await expect(page.getByRole("heading", { level: 1, name: "Family net" })).toBeVisible();
    await api(page, "DELETE", `/api/documents/${documentId}`);

    // Deleting the plan leaves the note it linked to.
    await page.getByRole("button", { name: "Delete plan" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Delete plan" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Communication plans" })).toBeVisible();
    expect((await api(page, "GET", `/api/notes/${note.id}`)).note.title).toBe("Net procedure for the family");
    expect(errors).toEqual([]);
  });
});
