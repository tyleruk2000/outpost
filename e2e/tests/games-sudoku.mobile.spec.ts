/**
 * Sudoku on a phone: reached from the More sheet under Games, a puzzle opened from a
 * seed, a digit written in one empty cell and a note in another with real taps, both
 * shown in the cells' names, and both still there after a reload. No sideways scroll.
 */
import { expect, test, watchForErrors } from "./fixtures";

test.use({ viewport: { width: 390, height: 844 } });

test.describe("Sudoku on a phone", () => {
  test("writes a digit and a note, and keeps them through a reload", async ({ page }) => {
    const errors = watchForErrors(page);
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    await page.goto("/");

    // Reached from the More sheet, under Games.
    await page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: "More" }).tap();
    await page.getByRole("dialog", { name: "More" }).getByRole("list", { name: "Under Games" }).getByRole("link", { name: "Sudoku" }).tap();
    await expect(page.getByRole("heading", { level: 1, name: "Sudoku" })).toBeVisible();
    await expect(page.getByRole("grid", { name: "Sudoku grid" })).toBeVisible();

    // A puzzle from a seed.
    await page.goto("/games/sudoku?seed=20261117&level=gentle");
    const grid = page.getByRole("grid", { name: "Sudoku grid" });
    await expect(grid).toBeVisible();
    await expect(page.getByRole("radio", { name: "Gentle" })).toHaveAttribute("aria-checked", "true");
    expect(await overflow()).toBeLessThanOrEqual(0);

    // The first two empty cells, by their names.
    const names = await grid.getByRole("button").evaluateAll((cells) => cells.map((cell) => cell.getAttribute("aria-label") ?? ""));
    const empty = names.filter((name) => name.endsWith(", empty")).map((name) => name.replace(/, empty$/, ""));
    expect(empty.length).toBeGreaterThan(30);
    const [first, second] = empty as [string, string];
    const cell = (place: string) => grid.getByRole("button", { name: new RegExp(`^${place},`) });

    await cell(first).tap();
    await page.getByRole("button", { name: /^Write 4, / }).tap();
    await expect(cell(first)).toHaveAccessibleName(`${first}, 4`);

    await page.getByRole("button", { name: "Notes off" }).tap();
    await cell(second).tap();
    await page.getByRole("button", { name: /^Note 2, / }).tap();
    await page.getByRole("button", { name: /^Note 7, / }).tap();
    await expect(cell(second)).toHaveAccessibleName(`${second}, empty, notes 2 and 7`);
    await expect(cell(second)).toContainText("2");
    await expect(cell(first)).toHaveText("4");
    expect(await overflow()).toBeLessThanOrEqual(0);

    // The seed has been taken out of the address, and the puzzle is kept on this device.
    await expect(page).toHaveURL(/\/games\/sudoku$/);
    await page.reload();
    await expect(cell(first)).toHaveAccessibleName(`${first}, 4`);
    await expect(cell(second)).toHaveAccessibleName(`${second}, empty, notes 2 and 7`);
    expect(await overflow()).toBeLessThanOrEqual(0);

    expect(errors).toEqual([]);
  });
});
