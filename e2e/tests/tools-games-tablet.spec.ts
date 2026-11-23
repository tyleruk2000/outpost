/**
 * Tools and games on a tablet held upright (768 px, a finger for a pointer): the page has the full width less the
 * rail, so a game that sat beside its panel stacks instead of crushing it, and the fields of a calculator are as
 * tall as a finger needs.
 */
import { expect, test, watchForErrors } from "./fixtures";

test.describe("tools and games on a tablet held upright", () => {
  test.use({ viewport: { width: 768, height: 1024 }, hasTouch: true });

  test("the allotment's stall sits under the plot, with nothing off the side of the screen", async ({ page }) => {
    const errors = watchForErrors(page);
    await page.goto("/games/allotment");
    await expect(page.getByRole("heading", { name: "The stall" })).toBeVisible();
    const sideways = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(sideways).toBe(0);
    // It was 84 px wide beside the plot, its Dig button off the screen.
    const stall = await page.getByRole("heading", { name: "The stall" }).boundingBox();
    const title = await page.getByRole("heading", { level: 1, name: "Allotment" }).boundingBox();
    expect(Math.abs(stall!.x - title!.x)).toBeLessThan(2);
    expect(errors).toEqual([]);
  });

  test("Sudoku's board takes the width, with cells a finger can press", async ({ page }) => {
    await page.goto("/games/sudoku");
    const cell = page.getByRole("button", { name: /^Row 1, column 1/ });
    const box = await cell.boundingBox();
    // 31 px beside the number pad before.
    expect(box!.width).toBeGreaterThanOrEqual(44);
  });

  test("a calculator's figure is 44 px tall and asks for the number keyboard", async ({ page }) => {
    await page.goto("/tools/water");
    const people = page.getByLabel("People", { exact: true });
    expect((await people.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await expect(people).toHaveAttribute("inputmode", "decimal");
    await expect(people).toHaveAttribute("enterkeyhint", "done");
  });
});

test("the cooking timer starts from the keyboard, without reaching for Start", async ({ page }) => {
  await page.goto("/tools/cooking");
  const minutes = page.getByLabel("Minutes", { exact: true });
  await minutes.fill("2");
  await minutes.press("Enter");
  await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();
});
