/**
 * Solitaire on a phone: reached from the More sheet under Games, a seeded deal (seed 2,
 * whose 6 of hearts goes on the 7 of spades), a card moved with a tap, the stock turned,
 * and undo putting the table back exactly as it was. Nothing scrolls sideways.
 */
import { api, expect, test, watchForErrors } from "./fixtures";

test.use({ viewport: { width: 390, height: 844 } });

test.describe("Solitaire on a phone", () => {
  test("moves a card with a tap, and undo puts the table back as it was", async ({ page }) => {
    const errors = watchForErrors(page);
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    await page.goto("/");
    await api(page, "DELETE", "/api/games/solitaire");

    // Reached from the More sheet, under Games.
    await page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: "More" }).tap();
    // The screens under Games are folded away until asked for.
    await page.getByRole("dialog", { name: "More" }).getByRole("button", { name: "Show the screens under Games" }).tap();
    // Exactly "Solitaire": Peg solitaire is listed after it.
    const link = page.getByRole("dialog", { name: "More" }).getByRole("link", { name: "Solitaire", exact: true });
    await expect(link).toHaveAttribute("href", "/games/solitaire");
    await link.tap();
    await expect(page.getByRole("heading", { level: 1, name: "Solitaire", exact: true })).toBeVisible();

    // A deal from a seed, the same every time.
    await page.goto("/games/solitaire?seed=2");
    const table = page.getByRole("group", { name: "Table" });
    await expect(table.getByRole("button", { name: "Stock, 24 cards" })).toBeVisible();
    await expect(page).not.toHaveURL(/seed=/);
    expect(await overflow()).toBeLessThanOrEqual(0);
    const names = () => table.getByRole("button").evaluateAll((buttons) => buttons.map((button) => button.getAttribute("aria-label")));
    const before = await names();
    expect(before).toContain("6 of hearts, face up");

    // A tap sends the 6 of hearts to the 7 of spades, and turns up the card under it.
    await table.getByRole("button", { name: "6 of hearts, face up" }).tap();
    await expect(page.getByRole("group", { name: "Pile 1" }).getByRole("button", { name: "6 of hearts, face up" })).toBeVisible();
    await expect(page.getByRole("group", { name: "Pile 2" }).getByRole("button", { name: "3 of spades, face up" })).toBeVisible();
    await expect(page.getByText(/^1 move/)).toBeVisible();

    // Undo: the board is as it was.
    await page.getByRole("button", { name: "Undo" }).tap();
    await expect(page.getByRole("group", { name: "Pile 2, 1 face down" })).toBeVisible();
    expect(await names()).toEqual(before);
    await expect(page.getByText(/^0 moves/)).toBeVisible();

    // The stock turns, and undo puts the card back on it.
    await table.getByRole("button", { name: "Stock, 24 cards" }).tap();
    await expect(table.getByRole("button", { name: "Stock, 23 cards" })).toBeVisible();
    await page.getByRole("button", { name: "Undo" }).tap();
    await expect(table.getByRole("button", { name: "Stock, 24 cards" })).toBeVisible();
    expect(await names()).toEqual(before);
    expect(await overflow()).toBeLessThanOrEqual(0);

    await api(page, "DELETE", "/api/games/solitaire");
    expect(errors).toEqual([]);
  });
});
