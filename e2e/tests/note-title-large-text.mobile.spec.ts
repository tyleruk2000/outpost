/**
 * A page's title is a field that grows to fit its words. It was sized once, when the words
 * changed, so text made larger afterwards (a phone's own text size, Settings' Text size)
 * left the title cut through the middle.
 */
import { api, expect, test } from "./fixtures";

const doc = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Forty litres." }] }] };

test("a page's title shows whole when the text is made larger on the page", async ({ page }) => {
  await page.goto("/");
  const { note } = await api(page, "POST", "/api/notes", { title: "Water and food store for the winter months", content: doc });
  try {
    await page.goto(`/notes/${note.id}`);
    const title = page.getByRole("textbox", { name: "Page title" });
    await expect(title).toHaveValue("Water and food store for the winter months");
    await expect(page.getByRole("heading", { level: 1, name: "Water and food store for the winter months" })).toBeAttached();
    for (const size of ["150%", "200%"]) {
      await page.evaluate((value) => document.documentElement.style.setProperty("font-size", value, "important"), size);
      await expect
        .poll(
          // What is hidden below the field, as a share of a line: a few pixels of the letters' leading is not a line cut off.
          () =>
            title.evaluate(
              (field: HTMLTextAreaElement) =>
                (field.scrollHeight - field.clientHeight) / Number.parseFloat(getComputedStyle(field).lineHeight),
            ),
          { message: `at ${size}` },
        )
        .toBeLessThan(0.25);
    }
  } finally {
    await api(page, "DELETE", `/api/notes/${note.id}`);
  }
});
