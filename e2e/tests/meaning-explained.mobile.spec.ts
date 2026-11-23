import { checkDiagrams } from "./diagrams";
import { expect, test } from "./fixtures";

test("how search by meaning works fits a phone, its diagrams' labels apart", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/search/how-meaning-works");
  await expect(page.getByRole("heading", { name: "How search by meaning works", level: 1 })).toBeVisible();
  const drawn = await checkDiagrams(page);
  expect(drawn).toHaveLength(6);
  const wide = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(wide).toBeLessThanOrEqual(0);
});
