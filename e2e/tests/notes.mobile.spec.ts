import { api, expect, test, watchForErrors } from "./fixtures";

/**
 * Notes on a phone, by touch: the bar over the keyboard is the one set of editing
 * controls, Undo is on it without scrolling it, and the lists on the notes home keep
 * their titles with the text made larger.
 */
test.describe("notes on a phone", () => {
  test("a selection made by touch brings no floating bar, and Undo is in reach on the bar", async ({ page }) => {
    const errors = watchForErrors(page);
    const { note } = await api(page, "POST", "/api/notes", {
      title: "Written by touch",
      content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Wind the radio before bed." }] }] },
    });
    try {
      // A short window stands in for the on-screen keyboard.
      await page.setViewportSize({ width: 390, height: 470 });
      await page.goto(`/notes/${note.id}`);
      const editor = page.getByRole("textbox", { name: "Page content" });
      await editor.getByText("Wind the radio before bed.").tap();
      const bar = page.getByRole("toolbar", { name: "Editing" });
      await expect(bar).toBeVisible();

      // Selecting a word, as a long press does.
      await page.evaluate(() => {
        const text = document.querySelector(".ProseMirror p")?.firstChild;
        if (!text) throw new Error("no paragraph");
        const range = document.createRange();
        range.setStart(text, 0);
        range.setEnd(text, 4);
        getSelection()?.removeAllRanges();
        getSelection()?.addRange(range);
      });
      // The phone's own menu sits over a selection; a second bar there would cover it. (The
      // floating bar waits a moment before it shows, so give it that moment.)
      await page.waitForTimeout(500);
      await expect(page.getByRole("toolbar", { name: "Format the selection" })).toBeHidden();
      await bar.getByRole("button", { name: "Bold" }).tap();
      await expect(editor.locator("strong")).toHaveText("Wind");

      const width = page.viewportSize()?.width ?? 390;
      for (const name of ["Undo", "Redo"]) {
        const box = await bar.getByRole("button", { name }).boundingBox();
        expect(box, name).not.toBeNull();
        expect(box!.x + box!.width, `${name} is on screen without scrolling the bar`).toBeLessThanOrEqual(width);
        expect(box!.height).toBeGreaterThanOrEqual(44);
      }
      await bar.getByRole("button", { name: "Undo" }).tap();
      await expect(editor.locator("strong")).toHaveCount(0);
      expect(errors).toEqual([]);
    } finally {
      await api(page, "DELETE", `/api/notes/${note.id}`);
    }
  });

  test("a long line of code keeps its line, as in the library, and scrolls inside its block", async ({ page }) => {
    const errors = watchForErrors(page);
    const line = "rsync -av --delete /Volumes/Outpost/ /Volumes/Backup/Outpost/ && df -h /Volumes/Backup";
    const { note } = await api(page, "POST", "/api/notes", {
      title: "Backup command",
      content: { type: "doc", content: [{ type: "codeBlock", attrs: { language: "bash" }, content: [{ type: "text", text: line }] }] },
    });
    try {
      await page.goto(`/notes/${note.id}`);
      const block = page.getByRole("textbox", { name: "Page content" }).locator("pre");
      await expect(block).toContainText("rsync");
      const shape = await block.evaluate((pre) => {
        const text = pre.querySelector("code > div") ?? pre;
        return {
          whiteSpace: getComputedStyle(text).whiteSpace,
          scrolls: pre.scrollWidth > pre.clientWidth,
          height: text.getBoundingClientRect().height,
        };
      });
      expect(shape.whiteSpace).toBe("pre");
      expect(shape.scrolls).toBe(true);
      expect(shape.height, "one line, not wrapped").toBeLessThan(30);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
      expect(errors).toEqual([]);
    } finally {
      await api(page, "DELETE", `/api/notes/${note.id}`);
    }
  });

  test("the notes home keeps each title in sight with the text at 200%", async ({ page }) => {
    const errors = watchForErrors(page);
    const made: string[] = [];
    for (const title of ["Kit for a power cut", "Round of the three lakes and back over the tops"]) {
      const { note } = await api(page, "POST", "/api/notes", { title });
      made.push(note.id);
      await api(page, "PATCH", `/api/notes/${note.id}`, { isFavorite: true });
    }
    try {
      await page.addInitScript(() => {
        document.addEventListener("DOMContentLoaded", () => {
          document.documentElement.style.fontSize = "32px";
        });
      });
      await page.goto("/notes");
      const favourites = page.locator("section").filter({ has: page.getByRole("heading", { name: "Favourites" }) });
      for (const title of ["Kit for a power cut", "Round of the three lakes"]) {
        const shown = favourites.getByText(new RegExp(`^${title}`));
        await expect(shown).toBeVisible();
        const box = await shown.boundingBox();
        // At least a few words of it, not an ellipsis.
        expect(box!.width, `"${title}" has room`).toBeGreaterThan(120);
      }
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
      expect(errors).toEqual([]);
    } finally {
      for (const id of made) await api(page, "DELETE", `/api/notes/${id}`);
    }
  });

  test("with the text at 200%, a page's way back keeps its name beside Saved, and the tree's Expand is a finger's size", async ({
    page,
  }) => {
    const errors = watchForErrors(page);
    const { note: parent } = await api(page, "POST", "/api/notes", { title: "Household" });
    const { note: child } = await api(page, "POST", "/api/notes", { title: "Kit for a power cut", parentId: parent.id });
    try {
      await page.addInitScript(() => {
        document.addEventListener("DOMContentLoaded", () => {
          document.documentElement.style.fontSize = "32px";
        });
      });
      await page.goto(`/notes/${child.id}`);
      const back = page.getByRole("navigation", { name: "Where this page is" }).getByRole("link", { name: "Household" });
      await expect(back).toBeVisible();
      await expect(page.getByText("Saved", { exact: true })).toBeVisible();
      // The whole name, not one letter of it.
      expect(await back.locator("span").evaluate((span) => span.scrollWidth <= span.clientWidth + 1)).toBe(true);

      await page.goto("/notes");
      // Household is open, as the page under it was just visited.
      const expand = page.getByRole("button", { name: /^(Expand|Collapse) Household$/ });
      const box = (await expand.boundingBox())!;
      expect([Math.round(box.width), Math.round(box.height)]).toEqual([88, 88]);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
      expect(errors).toEqual([]);
    } finally {
      await api(page, "DELETE", `/api/notes/${parent.id}`);
    }
  });
});
