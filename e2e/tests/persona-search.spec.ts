/**
 * The persona tests' fixes on a desktop, by keyboard: keyboard-mashing finds no private pages, the Home screen and
 * the Search screen say what answers from the library would do and set them up from one button, and the games
 * list starts with the quick games.
 */
import { expect, test, watchForErrors } from "./fixtures";

test.describe("persona fixes on a desktop", () => {
  test("Home offers answers from the library, set up from one button, by keyboard", async ({ page }) => {
    const errors = watchForErrors(page);
    await page.goto("/");
    const offer = page.getByRole("region", { name: "Ask in your own words, get a written answer" });
    await expect(offer).toBeVisible();
    await expect(offer).toContainText("only finds pages by meaning and cannot write");
    if (process.env.OUTPOST_E2E_SHOTS) await page.screenshot({ path: `${process.env.OUTPOST_E2E_SHOTS}/home-answers-offer-desktop.png` });
    const button = offer.getByRole("button", { name: "Set up answers" });
    await button.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: "Set up answers and chat" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Look for Ollama on this computer" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(button).toBeFocused();
    expect(errors).toEqual([]);
  });

  test("keyboard-mashing says nothing matches and shows no one's pages until asked", async ({ page }) => {
    const errors = watchForErrors(page);
    await page.goto("/search?q=asdfghjklqwerty");
    await expect(page.getByRole("heading", { name: "Nothing matches “asdfghjklqwerty”" })).toBeVisible();
    await expect(page.locator("#content ol li")).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test("lists the quick games first", async ({ page }) => {
    await page.goto("/games");
    const rows = page.locator("#content li a");
    await expect(rows).toHaveCount(10);
    await expect(rows.nth(0)).toContainText("Chess");
    await expect(rows.nth(1)).toContainText("Snake");
    await expect(rows.nth(2)).toContainText("Pairs");
    await expect(rows.nth(9)).toContainText("Steading");
  });
});
