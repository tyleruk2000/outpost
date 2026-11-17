/**
 * Peg solitaire on a phone: reached from the More sheet under Games, the first jump made
 * with two real taps, 31 pegs left, taken back with Undo to 32, and after a reload still
 * 32 with the board as at the start. Every hole is at least 44 px, and nothing scrolls sideways.
 */
import { expect, test, watchForErrors } from "./fixtures";

test.use({ viewport: { width: 390, height: 844 } });

test.describe("Peg solitaire on a phone", () => {
  test("makes a jump with two taps, takes it back, and keeps the board through a reload", async ({ page }) => {
    test.setTimeout(60_000);
    const errors = watchForErrors(page);
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    await page.goto("/");
    await page.evaluate(() => localStorage.removeItem("outpost.games.peg-solitaire"));

    // Reached from the More sheet, under Games.
    await page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: "More" }).tap();
    await page
      .getByRole("dialog", { name: "More" })
      .getByRole("list", { name: "Under Games" })
      .getByRole("link", { name: "Peg solitaire", exact: true })
      .tap();
    await expect(page.getByRole("heading", { level: 1, name: "Peg solitaire" })).toBeVisible();

    const board = page.getByRole("grid", { name: "Board" });
    const count = page.getByTestId("peg-count");
    await expect(board.getByRole("button")).toHaveCount(33);
    await expect(count).toHaveText("32 pegs left.");
    const centre = board.getByRole("button", { name: "Hole d4, centre, empty" });
    const box = (await centre.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(await overflow()).toBeLessThanOrEqual(0);

    // The first jump, with two taps: d6 over d5 into the centre.
    await board.getByRole("button", { name: "Hole d6, peg, can jump to d4" }).tap();
    await board.getByRole("button", { name: "Hole d4, centre, empty, the peg on d6 can jump here" }).tap();
    await expect(count).toHaveText("31 pegs left.");
    await expect(board.getByRole("button", { name: "Hole d4, centre, peg" })).toBeVisible();
    await expect(board.getByRole("button", { name: "Hole d5, empty" })).toBeVisible();

    // Taken back.
    await page.getByRole("button", { name: "Undo" }).tap();
    await expect(count).toHaveText("32 pegs left.");
    await expect(page.getByRole("button", { name: "Undo" })).toBeDisabled();

    // After a reload the board is as at the start.
    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: "Peg solitaire" })).toBeVisible();
    await expect(count).toHaveText("32 pegs left.");
    await expect(board.getByRole("button", { name: "Hole d4, centre, empty" })).toBeVisible();
    await expect(board.getByRole("button", { name: "Hole d5, peg" })).toBeVisible();
    await expect(board.getByRole("button", { name: "Hole d6, peg, can jump to d4" })).toBeVisible();
    await expect(board.getByRole("button", { name: /, empty/ })).toHaveCount(1);
    expect(await overflow()).toBeLessThanOrEqual(0);

    await page.evaluate(() => localStorage.removeItem("outpost.games.peg-solitaire"));
    expect(errors).toEqual([]);
  });
});
