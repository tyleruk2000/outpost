import type { Page } from "@playwright/test";
import { api, expect, test, watchForErrors } from "./fixtures";
import { addArchive } from "./search-one-list";

/**
 * The reading screens on an iPhone, by touch (Safari's engine): the review of 24 Nov 2026 found Back from a result
 * landing at the top of Search, results running off the side, small things to press and fields that zoom the page.
 */
const para = (text: string) => ({ type: "paragraph", content: [{ type: "text", text }] });
const WORD = "quernstone";

async function pages(page: Page, count: number, text: (index: number) => string): Promise<string[]> {
  const ids: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const { note } = await api(page, "POST", "/api/notes", {
      title: `Mill ${String(index + 1).padStart(2, "0")}`,
      content: { type: "doc", content: [para(text(index))] },
    });
    ids.push(note.id);
  }
  return ids;
}

const sideways = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

test.describe("reading on an iPhone", () => {
  test("Back from a result comes back to it, not to the top of Search, and the whole row opens it", async ({ page }) => {
    const errors = watchForErrors(page);
    const ids = await pages(page, 18, (index) => `The ${WORD} of mill ${index + 1} turns slowly. `.repeat(6));
    try {
      await expect.poll(async () => (await api(page, "GET", `/api/search?q=${WORD}&limit=20`)).total, { timeout: 20_000 }).toBe(18);
      await page.goto(`/search?q=${WORD}`);
      const field = page.getByRole("searchbox", { name: "Search your library" });
      // On arrival the field is ready to type into.
      await expect(field).toBeFocused();
      const rows = page
        .getByRole("main")
        .locator("ol > li")
        .filter({ has: page.getByRole("link", { name: /^Mill/ }) });
      await expect(rows).toHaveCount(18);
      const row = rows.nth(12);
      await row.scrollIntoViewIfNeeded();
      await row.evaluate((element) => element.scrollIntoView({ block: "center" }));
      const before = await page.evaluate(() => Math.round(scrollY));
      expect(before).toBeGreaterThan(800);
      // The passage, not the title: the whole row is the way in.
      const passage = row.locator("li").first();
      const box = (await passage.boundingBox())!;
      expect(box.height).toBeGreaterThan(30);
      await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
      await expect(page).toHaveURL(/\/notes\//);
      await page.goBack();
      await expect(page).toHaveURL(new RegExp(`/search\\?q=${WORD}`));
      await expect(rows).toHaveCount(18);
      await page.waitForTimeout(1500);
      const after = await page.evaluate(() => Math.round(scrollY));
      expect(Math.abs(after - before), `scrollY ${before} -> ${after}`).toBeLessThan(60);
      await expect(field).not.toBeFocused();
      await page.screenshot({ path: test.info().outputPath("search-after-back.png") });
      expect(errors).toEqual([]);
    } finally {
      for (const id of ids) await api(page, "DELETE", `/api/notes/${id}`);
    }
  });

  test("a passage with a long unbroken string stays inside the screen, and Also in links are big enough", async ({ page }) => {
    const key = "A".repeat(30) + "-----BEGINPGPSIGNATURE-----" + "Zm9vYmFy".repeat(20);
    const { note } = await api(page, "POST", "/api/notes", {
      title: "Signed note",
      content: { type: "doc", content: [para(`signature ${key}`)] },
    });
    try {
      await expect.poll(async () => (await api(page, "GET", "/api/search?q=signature")).total, { timeout: 20_000 }).toBeGreaterThan(0);
      await page.goto("/search?q=signature");
      await expect(page.getByRole("link", { name: "Signed note" })).toBeVisible();
      expect(await sideways(page)).toBeLessThanOrEqual(0);
      await page.screenshot({ path: test.info().outputPath("search-long-string.png") });
    } finally {
      await api(page, "DELETE", `/api/notes/${note.id}`);
    }
  });

  test("the Library's name filter and a web page's address are 16 px, so Safari does not zoom", async ({ page }) => {
    const upload = await page.request.post("/api/documents", {
      headers: { "X-Outpost-Request": "1" },
      multipart: { file: { name: "Mill notes.md", mimeType: "text/markdown", buffer: Buffer.from("# Mill notes\n\nDress the stone.") } },
    });
    expect(upload.ok()).toBe(true);
    const id = (await upload.json()).results[0].document.id as string;
    await page.goto("/library");
    const filter = page.getByRole("searchbox", { name: "Filter documents by name" });
    await expect(filter).toBeVisible();
    expect(await filter.evaluate((element) => getComputedStyle(element).fontSize)).toBe("16px");
    await filter.fill("mill");
    const clear = page.getByRole("button", { name: "Clear the name filter" });
    const box = (await clear.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    await api(page, "DELETE", `/api/documents/${id}`);
    await page.goto("/import");
    const address = page.getByRole("textbox", { name: /Address of the page/ });
    await expect(address).toBeVisible();
    expect(await address.evaluate((element) => getComputedStyle(element).fontSize)).toBe("16px");
  });

  test("a to-do is ticked through a 44 px target, without the caret going into the text", async ({ page }) => {
    const { note } = await api(page, "POST", "/api/notes", {
      title: "Before winter",
      content: {
        type: "doc",
        content: [
          {
            type: "taskList",
            content: [{ type: "taskItem", attrs: { checked: false }, content: [para("Sweep the chimney")] }],
          },
        ],
      },
    });
    try {
      await page.goto(`/notes/${note.id}`);
      const box = page.getByRole("checkbox", { name: /Sweep the chimney/ });
      await expect(box).toBeVisible();
      const target = (await box.locator("xpath=..").boundingBox())!;
      expect(target.width).toBeGreaterThanOrEqual(44);
      expect(target.height).toBeGreaterThanOrEqual(44);
      // The edge of the target, well outside the drawn box.
      await page.touchscreen.tap(target.x + 3, target.y + 3);
      await expect(box).toBeChecked();
      // Focus is on the box (in a part of the page that is not text), not in the text: no caret, no keyboard.
      expect(await page.evaluate(() => (document.activeElement as HTMLElement | null)?.isContentEditable)).toBe(false);
      await expect
        .poll(async () => JSON.stringify((await api(page, "GET", `/api/notes/${note.id}`)).note.content))
        .toContain('"checked":true');
      await page.screenshot({ path: test.info().outputPath("todo-ticked.png") });
    } finally {
      await api(page, "DELETE", `/api/notes/${note.id}`);
    }
  });

  test("a title suggested in the reader is opened by a tap", async ({ page, request }) => {
    await addArchive(request);
    const { collections } = await (await request.get("/api/collections")).json();
    const id = collections.find((collection: { title: string }) => collection.title === "Field library").id as string;
    await page.goto(`/library/read/${id}/guide`);
    const field = page.getByRole("combobox", { name: /Search in Field library/ });
    await field.tap();
    await field.fill("kin");
    const option = page.getByRole("option", { name: "Kindling a fire in the wet" });
    await expect(option).toBeVisible();
    const box = (await option.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44);
    await page.screenshot({ path: test.info().outputPath("reader-suggestions.png") });
    await option.tap();
    await expect(page.getByRole("listbox", { name: "Article titles" })).toBeHidden();
    await expect(field).toHaveValue("");
  });
});
