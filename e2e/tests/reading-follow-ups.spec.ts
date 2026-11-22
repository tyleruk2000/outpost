/**
 * The reading and people screens, after the study's follow-ups: a reader's own Text
 * control, a new page left untouched, the formatting bar from the keyboard, why "Add
 * all" counts files, one top heading on Contacts, and the PDF page at 200% text.
 */
import { api, expect, test } from "./fixtures";
import { seed } from "./study-reading";

test.use({ viewport: { width: 1280, height: 800 } });

test("a reader's Text control changes the typeface, size and spacing of the text", async ({ page }) => {
  await page.goto("/");
  const seeded = await seed(page.request);
  await page.evaluate(() => localStorage.clear());
  await page.goto(`/library/documents/${seeded.markdown}`);
  const text = page.locator("article.prose").first();
  await expect(text).toBeVisible();
  const before = await text.evaluate((element) => Number.parseFloat(getComputedStyle(element).lineHeight));

  await page.getByRole("button", { name: "Text", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "Text" });
  await panel.getByRole("group", { name: "Spacing" }).getByRole("radio", { name: "Wide" }).click();
  await panel.getByRole("group", { name: "Typeface" }).getByRole("radio", { name: "Sans" }).click();
  await panel.getByRole("group", { name: "Size" }).getByRole("radio", { name: "Larger" }).click();
  await expect
    .poll(() => text.evaluate((element) => Number.parseFloat(getComputedStyle(element).lineHeight)))
    .toBeGreaterThan(before * 1.3);
  await expect.poll(() => text.evaluate((element) => getComputedStyle(element).fontFamily)).toMatch(/Atkinson/);
  await expect.poll(() => page.evaluate(() => document.documentElement.style.fontSize)).toBe("125%");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Text", exact: true })).toBeFocused();

  // The same choices, under Settings.
  await page.goto("/settings");
  await expect(page.getByRole("radiogroup", { name: "Reading spacing" }).getByRole("radio", { name: "Wide" })).toBeChecked();
  await expect(page.getByRole("radiogroup", { name: "Reading typeface" }).getByRole("radio", { name: "Sans" })).toBeChecked();
  await page.evaluate(() => localStorage.clear());
});

test("a new page left untouched is removed; one typed in stays", async ({ page }) => {
  await page.goto("/notes");
  const count = async () => (await api(page, "GET", "/api/notes/tree")).notes.length as number;
  const before = await count();

  await page.getByRole("button", { name: "New page" }).first().click();
  await expect(page.getByRole("textbox", { name: "Page title" })).toBeVisible();
  await expect.poll(count).toBe(before + 1);
  await page.goto("/notes");
  await expect.poll(count).toBe(before);

  await page.getByRole("button", { name: "New page" }).first().click();
  const editor = page.getByRole("textbox", { name: "Page content" });
  await editor.click();
  await page.keyboard.type("x");
  await page.keyboard.press("Backspace");
  await page.getByRole("link", { name: "Notes" }).first().click();
  await expect(page).toHaveURL(/\/notes$/);
  await page.waitForTimeout(1000);
  expect(await count()).toBe(before + 1);
});

test("the formatting bar is reached with Alt+F10 and left with Escape", async ({ page }) => {
  await page.goto("/");
  const { note } = await api(page, "POST", "/api/notes", {
    title: "Bar by keyboard",
    content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Boil the water first." }] }] },
  });
  await page.goto(`/notes/${note.id}`);
  const editor = page.getByRole("textbox", { name: "Page content" });
  await expect(editor).toHaveAttribute("aria-keyshortcuts", "Alt+F10");
  await editor.click();
  await page.keyboard.press("End");
  for (let i = 0; i < 6; i++) await page.keyboard.press("Shift+ArrowLeft");
  const bar = page.getByRole("toolbar", { name: "Format the selection" });
  await expect(bar).toBeVisible();
  await page.keyboard.press("Alt+F10");
  const first = bar.getByRole("button").first();
  await expect(first).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(bar.getByRole("button").nth(1)).toBeFocused();
  await page.keyboard.press("End");
  await expect(bar.getByRole("button", { name: "Link" })).toBeFocused();
  // One Tab stop for the bar: the others are out of the order.
  expect(await bar.locator('button[tabindex="0"]').count()).toBe(1);
  await page.keyboard.press("Escape");
  await expect(editor).toBeFocused();
  await api(page, "DELETE", `/api/notes/${note.id}`);
  await api(page, "DELETE", `/api/notes/${note.id}?permanent=1`);
});

test("the table bar is reached with Alt+F10 and adds a column", async ({ page }) => {
  await page.goto("/");
  const cell = (text: string) => ({ type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });
  const { note } = await api(page, "POST", "/api/notes", {
    title: "Table by keyboard",
    content: { type: "doc", content: [{ type: "table", content: [{ type: "tableRow", content: [cell("Rice"), cell("10 kg")] }] }] },
  });
  await page.goto(`/notes/${note.id}`);
  await page.getByRole("cell", { name: "Rice" }).click();
  const bar = page.getByRole("toolbar", { name: "Table" });
  await expect(bar).toBeVisible();
  await page.keyboard.press("Alt+F10");
  await expect(bar.getByRole("button", { name: "Row", exact: true })).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(bar.getByRole("button", { name: "Column", exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  await page.getByRole("menuitem", { name: "Add column to the right" }).click();
  await expect(page.getByRole("row").first().getByRole("cell")).toHaveCount(3);
  await api(page, "DELETE", `/api/notes/${note.id}`);
  await api(page, "DELETE", `/api/notes/${note.id}?permanent=1`);
});

test("a collection says why Add all counts files, not documents", async ({ page }) => {
  await page.goto("/");
  const seeded = await seed(page.request);
  await page.goto(`/library/read/${seeded.collection}/`);
  await expect(page.getByText(/Adding counts files, not documents: \d+ files here are PDFs or e-books/)).toBeVisible();
});

test("Contacts has one top heading with a contact open beside the list", async ({ page }) => {
  await page.goto("/");
  const seeded = await seed(page.request);
  await page.goto(`/contacts/${seeded.contact}`);
  await expect(page.getByRole("heading", { level: 2, name: "Morwenna Trelawny" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(["Contacts"]);
  await page.goto(`/contacts/${seeded.contact}/edit`);
  await expect(page.getByRole("heading", { level: 2, name: "Edit Morwenna Trelawny" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(["Contacts"]);
});

test("a PDF at 200% text keeps its controls on the screen", async ({ page }) => {
  await page.goto("/");
  const seeded = await seed(page.request);
  await page.goto(`/library/documents/${seeded.pdf}`);
  await expect(page.getByRole("toolbar", { name: "Viewing controls" })).toBeVisible();
  await page.evaluate(() => document.documentElement.style.setProperty("font-size", "200%", "important"));
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
  await expect(page.getByRole("button", { name: "Zoom in" })).toBeInViewport();
  await expect(page.getByRole("heading", { level: 1, name: "fell-water-notes" })).toBeInViewport();
});
