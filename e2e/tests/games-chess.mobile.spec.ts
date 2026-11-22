/**
 * Chess on a phone: reached from the More sheet under Games, a game against the computer
 * started from a seed, a pawn moved with two taps and the computer's reply seen, the game
 * copied out as PGN, and a finished game pasted back in and read as checkmate. Nothing
 * scrolls sideways, and each square is big enough for a thumb.
 */
import { api, expect, test, watchForErrors } from "./fixtures";

test.use({ viewport: { width: 390, height: 844 } });

test.describe("Chess on a phone", () => {
  test("is reached from the More sheet, answers a move made with taps, and reads a pasted game", async ({ page }) => {
    test.setTimeout(60_000);
    const errors = watchForErrors(page);
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    await page.goto("/");
    await page.evaluate(() => localStorage.removeItem("outpost.games.chess"));
    await api(page, "DELETE", "/api/games/chess");

    // Reached from the More sheet, under Games.
    await page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: "More" }).tap();
    await page.getByRole("dialog", { name: "More" }).getByRole("button", { name: "Show the screens under Games" }).tap();
    await page.getByRole("dialog", { name: "More" }).locator('a[href="/games/chess"]').first().tap();
    await expect(page.getByRole("heading", { level: 1, name: "Chess" })).toBeVisible();

    // A game from a seed, against the computer at easy: the person plays white and moves first.
    await page.goto("/games/chess?seed=4242");
    const turn = page.getByTestId("chess-turn");
    await expect(turn).toHaveText("You play white and move first.");
    await expect(page).not.toHaveURL(/seed=/);
    const board = page.getByRole("grid", { name: "Board" });
    await expect(board.getByRole("button")).toHaveCount(64);
    const box = (await board.boundingBox())!;
    expect(box.width / 8).toBeGreaterThanOrEqual(44);
    expect(await overflow()).toBeLessThanOrEqual(0);
    await expect(board.getByRole("button", { name: /, computer's / })).toHaveCount(16);
    await expect(page.getByText("No moves yet.")).toBeVisible();

    // A pawn from e2 to e4 with two taps; e5 is not a square it can reach, and is not offered.
    await board.getByRole("button", { name: "e2, your pawn" }).tap();
    await expect(board.getByRole("button", { name: "e2, your pawn, picked" })).toBeVisible();
    await expect(board.getByRole("button", { name: "e3, empty, you can move here" })).toBeVisible();
    await expect(board.getByRole("button", { name: "e5, empty" })).toBeVisible();
    await board.getByRole("button", { name: "e4, empty, you can move here" }).tap();

    // The computer's reply: one of its pieces has just moved, and it is the person's move again.
    await expect(turn).toHaveText("Your move. You play white.", { timeout: 20_000 });
    await expect(board.getByRole("button", { name: /computer's .*, just moved here from [a-h][78]/ })).toHaveCount(1);
    await expect(board.getByRole("button", { name: /^e4, your pawn/ })).toBeVisible();
    const moves = page.getByRole("list", { name: "Moves" });
    await expect(moves).toContainText(/^1\.\s*e4\s*[A-Za-z][a-h1-8x+]+$/);
    expect(await overflow()).toBeLessThanOrEqual(0);

    // Copied out as PGN: the move is in it.
    await page.getByRole("button", { name: "Copy the game" }).tap();
    const copy = page.getByRole("dialog", { name: "Copy the game" });
    await expect(copy.getByRole("textbox", { name: "PGN" })).toHaveValue(/1\. e4 /);
    await expect(copy.getByRole("textbox", { name: "FEN" })).toHaveValue(/ w KQ/);
    await page.keyboard.press("Escape");
    await expect(copy).toBeHidden();

    // A finished game pasted in: the quickest checkmate there is, with black winning.
    await page.getByRole("button", { name: "Paste a game" }).tap();
    const paste = page.getByRole("dialog", { name: "Paste a game" });
    await expect(paste.getByText("The game on the board ends here and is counted as played and not won.")).toBeVisible();
    await paste.getByRole("textbox", { name: "PGN or FEN" }).fill("1. f3 e5 2. g4 Qh4#");
    await paste.getByRole("button", { name: "Read it in" }).tap();
    await expect(paste).toBeHidden();
    await expect(turn).toHaveText("Checkmate. The computer won.");
    await expect(page.getByText("The game pasted in is already over. Start a new game to play on.")).toBeVisible();
    await expect(board.getByRole("button", { name: "e1, your king, in check" })).toBeVisible();
    // The game left by pasting is counted as played and not won.
    await expect(page.getByText("Against the computer, easy: Played 1, won 0.")).toBeVisible();

    await page.evaluate(() => localStorage.removeItem("outpost.games.chess"));
    await api(page, "DELETE", "/api/games/chess");
    expect(errors).toEqual([]);
  });
});
