/**
 * Draughts on a phone: reached from the More sheet under Games, a game against the computer
 * started from a seed, a move made with two taps, and the computer's reply seen: a light
 * man has moved and the turn line says it is the person's move again. Nothing scrolls sideways.
 */
import { expect, test, watchForErrors } from "./fixtures";

test.use({ viewport: { width: 390, height: 844 } });

test.describe("Draughts on a phone", () => {
  test("is reached from the More sheet, and the computer answers a move made with taps", async ({ page }) => {
    test.setTimeout(60_000);
    const errors = watchForErrors(page);
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    await page.goto("/");
    await page.evaluate(() => localStorage.removeItem("outpost.games.draughts"));

    // Reached from the More sheet, under Games.
    await page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: "More" }).tap();
    // The screens under Games are folded away until asked for.
    await page.getByRole("dialog", { name: "More" }).getByRole("button", { name: "Show the screens under Games" }).tap();
    await page.getByRole("dialog", { name: "More" }).locator('a[href="/games/draughts"]').first().tap();
    await expect(page.getByRole("heading", { level: 1, name: "Draughts" })).toBeVisible();

    // A game from a seed, against the computer: the person plays dark and moves first.
    await page.goto("/games/draughts?seed=4242");
    const turn = page.getByTestId("draughts-turn");
    await expect(turn).toHaveText("You play dark and move first.");
    const board = page.getByRole("grid", { name: "Board" });
    await expect(board.getByRole("button")).toHaveCount(32);
    const box = (await board.boundingBox())!;
    expect(box.width / 8).toBeGreaterThanOrEqual(44);
    expect(await overflow()).toBeLessThanOrEqual(0);
    // The light men all start on ranks 6 to 8.
    const lightOnHomeRanks = () => board.getByRole("button", { name: /^Square [a-h][678], computer's man/ }).count();
    expect(await lightOnHomeRanks()).toBe(12);

    // A move with two taps.
    await board.getByRole("button", { name: "Square c3, your man" }).tap();
    await board.getByRole("button", { name: "Square d4, empty, you can move here" }).tap();
    await expect(board.getByRole("button", { name: "Square d4, your man" })).toBeVisible();

    // The computer's reply: a light man has moved, its square says so, and it is the person's move again.
    await expect(turn).toHaveText("Your move. You play dark.", { timeout: 15_000 });
    await expect(board.getByRole("button", { name: /computer's man, just moved here from [a-h][678]/ })).toHaveCount(1);
    expect(await lightOnHomeRanks()).toBe(11);
    await expect(page).not.toHaveURL(/seed=/);
    expect(await overflow()).toBeLessThanOrEqual(0);

    // The rules are written under the board.
    await page.getByText("About this game").tap();
    await expect(page.getByText(/After 40 moves each with no capture and no man moved, the game is a draw/)).toBeVisible();

    await page.evaluate(() => localStorage.removeItem("outpost.games.draughts"));
    expect(errors).toEqual([]);
  });
});
