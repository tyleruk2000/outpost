/**
 * The shared parts of every screen on a 390 px phone with the text at 150% and at 200% (a
 * root font size of 24 and 32 px): the bottom bar stays inside the screen, and no button
 * reaches past it. A button's label wraps, and the button grows taller, when it is wider
 * than the room it is in; at the normal size it is one line, as before.
 */
import { expect, test, watchForErrors } from "./fixtures";

test.use({ viewport: { width: 390, height: 844 } });

const screens = ["/", "/library", "/explore", "/notes", "/downloads", "/storage", "/settings", "/radio"];

for (const root of [24, 32]) {
  test(`the bar and the buttons stay inside the screen at a ${root} px root`, async ({ page }) => {
    const errors = watchForErrors(page);
    await page.addInitScript((size) => {
      document.addEventListener("DOMContentLoaded", () => {
        document.documentElement.style.fontSize = `${size}px`;
      });
    }, root);
    for (const path of screens) {
      await page.goto(path);
      await expect(page.locator("main h1").first()).toBeVisible();
      const past = await page.evaluate(() => {
        const width = document.documentElement.clientWidth;
        return [...document.querySelectorAll('nav[aria-label="Main"] *, main button')]
          .filter((element) => !element.closest("svg"))
          .map((element) => ({ element, box: element.getBoundingClientRect() }))
          .filter(({ box }) => box.width > 0 && box.right > width + 1)
          .slice(0, 5)
          .map(
            ({ element, box }) =>
              `${element.tagName.toLowerCase()} "${(element.textContent ?? "").trim().slice(0, 40)}" to ${Math.round(box.right)}`,
          );
      });
      expect(past, path).toEqual([]);
    }
    expect(errors).toEqual([]);
  });
}

test("a button is one line at the normal size and wraps only when it does not fit", async ({ page }) => {
  await page.goto("/storage");
  const button = page.getByRole("button", { name: "Add location" });
  const normal = await button.evaluate((element) => element.getBoundingClientRect().height);
  expect(normal).toBe(44);
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "32px";
  });
  const large = await button.evaluate((element) => {
    const box = element.getBoundingClientRect();
    return { right: box.right, width: document.documentElement.clientWidth };
  });
  expect(large.right).toBeLessThanOrEqual(large.width + 1);
});
