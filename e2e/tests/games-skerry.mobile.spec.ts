/**
 * Skerry on a phone: reached from the More sheet under Games, the first level solved by
 * typing ls and a cat finished with the Tab key under the terminal, the next level opened
 * and answered in words after a wrong answer and a hint, and the progress kept in this
 * browser across a reload. Nothing scrolls sideways.
 */
import { expect, test, watchForErrors } from "./fixtures";

test.use({ viewport: { width: 390, height: 844 } });

test.describe("Skerry on a phone", () => {
  test("solves two levels at the pretend command line, and keeps the progress", async ({ page }) => {
    const errors = watchForErrors(page);
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    await page.goto("/");
    await page.evaluate(() => localStorage.removeItem("outpost.games.skerry"));

    // Reached from the More sheet, under Games.
    await page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: "More" }).tap();
    await page.getByRole("dialog", { name: "More" }).getByRole("button", { name: "Show the screens under Games" }).tap();
    await page.getByRole("dialog", { name: "More" }).locator('a[href="/games/skerry"]').first().tap();
    await expect(page.getByRole("heading", { level: 1, name: "Skerry" })).toBeVisible();

    const terminal = page.getByRole("log", { name: "Terminal" });
    const prompt = page.getByRole("textbox", { name: /^Command, in / });
    const type = async (line: string) => {
      await prompt.fill(line);
      await prompt.press("Enter");
      await expect(prompt).toHaveValue("");
    };
    await expect(page.getByRole("heading", { level: 2, name: /^Level 1 of \d+: Arrival$/ })).toBeVisible();
    await expect(terminal).toContainText("Goal: Read Ines's welcome note.");
    await expect(page.getByText(/^None solved yet\./)).toBeVisible();
    expect(await overflow()).toBeLessThanOrEqual(0);

    // ls shows the folder; Tab under the terminal finishes the file's name, with a space after it as a shell does.
    await type("ls");
    await expect(terminal).toContainText("welcome.txt");
    await expect(terminal).toContainText("kettle.txt");
    await prompt.fill("cat wel");
    await page.getByRole("button", { name: "Tab", exact: true }).tap();
    await expect(prompt).toHaveValue("cat welcome.txt ");
    await prompt.press("Enter");
    await expect(terminal).toContainText("Welcome to Tarrow Skerry!");
    await expect(terminal).toContainText("Solved.");
    await expect(terminal).toContainText(/ls to look, cat to read/);
    await expect(page.getByText(/^1 of \d+ solved\./)).toBeVisible();

    // The next level: a wrong answer, a hint, then the right answer from the file.
    await page.getByRole("button", { name: "Next level: The key board" }).tap();
    await expect(page.getByRole("heading", { level: 2, name: /^Level 2 of \d+: The key board$/ })).toBeVisible();
    await type("answer 3");
    await expect(terminal).toContainText("3 is not it. Have another look, or type hint.");
    await page.getByRole("button", { name: "Hint", exact: true }).tap();
    await expect(terminal).toContainText(/Hint 1 of 3: Read the handover note in this folder first/);
    await type("cat /station/stores/keys.txt");
    await expect(terminal).toContainText("Hook 5  paint store");
    await type("answer hook 5");
    await expect(terminal).toContainText(/Hook 5\. A path like \/station\/stores\/keys\.txt names a file/);
    await expect(page.getByText(/^2 of \d+ solved\./)).toBeVisible();
    expect(await overflow()).toBeLessThanOrEqual(0);

    // Kept in this browser: the level and what was solved come back after a reload.
    await page.reload();
    await expect(page.getByRole("heading", { level: 2, name: /^Level 2 of \d+: The key board$/ })).toBeVisible();
    await expect(terminal).toContainText("You have solved this one before.");
    await expect(page.getByText(/^2 of \d+ solved\./)).toBeVisible();
    // The up arrow under the terminal brings back the last command.
    await page.getByRole("button", { name: "Previous command" }).tap();
    await expect(prompt).toHaveValue("answer hook 5");

    await page.evaluate(() => localStorage.removeItem("outpost.games.skerry"));
    expect(errors).toEqual([]);
  });
});
