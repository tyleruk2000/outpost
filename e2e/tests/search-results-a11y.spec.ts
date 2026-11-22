/**
 * Search with results on the screen, in both themes, through axe-core: the walk to every screen sees Search
 * empty only. The found words were 2.6:1 on their mark in the dark theme.
 */
import { accessibilityInBothThemes } from "./a11y";
import { expect, test } from "./fixtures";
import { buildPdf } from "./pdf";

test("search results, their marked words and the filter tabs pass the accessibility check in both themes", async ({ page }) => {
  const upload = await page.request.post("/api/documents", {
    headers: { "X-Outpost-Request": "1" },
    multipart: {
      file: {
        name: "Boiling water for the a11y check.pdf",
        mimeType: "application/pdf",
        buffer: buildPdf([["Boiling", "Boil water for one minute to make it safe to drink.", "At altitude boil it for three minutes."]]),
      },
    },
  });
  expect(upload.ok()).toBe(true);
  const id = (await upload.json()).results[0].document.id;
  await expect
    .poll(async () => (await (await page.request.get(`/api/documents/${id}`)).json()).document.extraction, { timeout: 20_000 })
    .toBe("done");

  await page.goto("/search?q=boil%20water");
  await expect(page.locator("main mark").first()).toBeVisible();
  await expect(page).toHaveTitle("Search / Outpost");
  expect(await accessibilityInBothThemes(page, "/search")).toEqual([]);

  // The filter tabs are one stop for Tab; the arrow keys move along them.
  const tabs = page.getByRole("tablist", { name: "Filter results" }).getByRole("tab");
  await tabs.first().focus();
  await page.keyboard.press("ArrowRight");
  await expect(tabs.nth(1)).toBeFocused();
  await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true");
});
