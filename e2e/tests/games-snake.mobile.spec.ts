/**
 * Snake on a phone: reached from the More sheet under Games, the fast speed with walls
 * chosen, a game started and steered with the arrow buttons under the field, run into the
 * top wall, and the score sent to the household's tally. The choice of speed is kept in
 * this browser. Nothing scrolls sideways, and the arrow buttons are big enough for a thumb.
 */
import { api, expect, test, watchForErrors } from "./fixtures";

test.use({ viewport: { width: 390, height: 844 } });

test.describe("Snake on a phone", () => {
  test("is steered with the buttons into the wall, and the game goes to the tally", async ({ page }) => {
    const errors = watchForErrors(page);
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    await page.goto("/");
    await page.evaluate(() => localStorage.removeItem("outpost.games.snake"));
    await api(page, "DELETE", "/api/games/snake");

    // Reached from the More sheet, under Games.
    await page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: "More" }).tap();
    await page.getByRole("dialog", { name: "More" }).getByRole("button", { name: "Show the screens under Games" }).tap();
    await page.getByRole("dialog", { name: "More" }).locator('a[href="/games/snake"]').first().tap();
    await expect(page.getByRole("heading", { level: 1, name: "Snake" })).toBeVisible();

    const status = page.getByTestId("snake-status");
    await expect(status).toHaveText("Press an arrow key, swipe on the field or tap an arrow to start.");
    await expect(page.getByRole("application", { name: /^Snake field, 16 by 16\./ })).toBeVisible();
    await expect(page.getByText("Score 0 · length 3 · best on this device 0")).toBeVisible();
    await expect(page.getByText("Steady, walls: Not played yet.")).toBeVisible();
    for (const name of ["Up", "Down", "Left", "Right"]) {
      const box = (await page.getByRole("button", { name, exact: true }).boundingBox())!;
      expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(44);
    }
    expect(await overflow()).toBeLessThanOrEqual(0);

    // The fastest speed, with walls.
    await page.getByRole("radiogroup", { name: "Speed" }).getByRole("radio", { name: "Fast" }).tap();
    await expect(page.getByText("Fast, walls: Not played yet.")).toBeVisible();

    // Up starts the game and turns the snake towards the top, eight squares away: it hits the wall.
    await page.getByRole("button", { name: "Up", exact: true }).tap();
    await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();
    await expect(status).toHaveText(/^The snake hit the wall\. Score \d+\.$/, { timeout: 10_000 });
    await expect(page.getByRole("button", { name: "New game" })).toBeVisible();
    await expect(page.getByText(/^Fast, walls: Played 1\./)).toBeVisible();
    expect(await overflow()).toBeLessThanOrEqual(0);

    // The speed chosen is kept on this device.
    await page.reload();
    await expect(page.getByRole("radiogroup", { name: "Speed" }).getByRole("radio", { name: "Fast" })).toBeChecked();
    await expect(page.getByText(/^Fast, walls: Played 1\./)).toBeVisible();

    await page.evaluate(() => localStorage.removeItem("outpost.games.snake"));
    await api(page, "DELETE", "/api/games/snake");
    expect(errors).toEqual([]);
  });
});
