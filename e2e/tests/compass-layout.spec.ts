/** Compass on a wide screen: the place and the map's grid are chosen from two drop-downs side by side, on one line. */
import { expect, test } from "./fixtures";

test("the place and grid drop-downs line up", async ({ page }) => {
  await page.goto("/tools/compass");
  const boxes = page.getByRole("region", { name: "Place" }).getByRole("combobox");
  await expect(boxes).toHaveCount(2);
  const [place, grid] = await boxes.evaluateAll((all) => all.map((box) => box.getBoundingClientRect().top));
  expect(Math.abs(place! - grid!)).toBeLessThanOrEqual(1);
});
