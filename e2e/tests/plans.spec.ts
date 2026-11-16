import fs from "node:fs";
import type { Page } from "@playwright/test";
import { api, expect, test, watchForErrors } from "./fixtures";

async function addStation(page: Page, name: string, where: string, watts: string) {
  await page.getByRole("button", { name: "Add a station" }).click();
  const dialog = page.getByRole("dialog", { name: "Add a station" });
  await dialog.getByLabel("Name").fill(name);
  await dialog.getByLabel("Where it is").fill(where);
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
    await page.getByLabel("Find a note or document to link").fill("procedure");
    await page.getByRole("button", { name: "Find" }).click();
    await page.getByRole("list", { name: "Notes and documents found" }).getByRole("button", { name: "Link" }).click();
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

    const pdf = await exported(page, "Export as PDF");
    expect(pdf.name).toBe("communication-plan-family-net.pdf");
    const file = pdf.bytes.toString("latin1");
    expect(file.startsWith("%PDF-1.")).toBe(true);
    expect(file.trimEnd().endsWith("%%EOF")).toBe(true);
    expect(file).toContain("(Communication plan: Family net)");
    expect(file).toContain("(Home base and Remote shelter)");
    expect(file).toContain("(How the bands were chosen)");
    expect(file).toContain("/BaseFont /Courier");
    expect((file.match(/\/Type \/Page\b/g) ?? []).length).toBeGreaterThanOrEqual(2);

    // Deleting the plan leaves the note it linked to.
    await page.getByRole("button", { name: "Delete plan" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Delete plan" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Communication plans" })).toBeVisible();
    expect((await api(page, "GET", `/api/notes/${note.id}`)).note.title).toBe("Net procedure for the family");
    expect(errors).toEqual([]);
  });
});
