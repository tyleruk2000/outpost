/**
 * Pairs on a phone: reached from the More sheet under Games, a small deal opened from a
 * seed, cards turned with real taps until two show the same picture (read from their
 * spoken names), and both then named "matched". Every card at least 64 px; no sideways
 * scroll.
 */
import { expect, test, watchForErrors } from "./fixtures";

test.use({ viewport: { width: 390, height: 844 } });

test.describe("Pairs on a phone", () => {
  test("finds a pair by turning cards over", async ({ page }) => {
    test.setTimeout(60_000);
    const errors = watchForErrors(page);
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    await page.goto("/");

    // Reached from the More sheet, under Games.
    await page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: "More" }).tap();
    // The screens under Games are folded away until asked for.
    await page.getByRole("dialog", { name: "More" }).getByRole("button", { name: "Show the screens under Games" }).tap();
    await page.getByRole("dialog", { name: "More" }).getByRole("list", { name: "Under Games" }).getByRole("link", { name: "Pairs" }).tap();
    await expect(page.getByRole("heading", { level: 1, name: "Pairs" })).toBeVisible();

    // A small deal from a seed: 12 cards face down, each at least 64 px.
    await page.goto("/games/pairs?seed=20261117&size=small");
    const cards = page.getByRole("group", { name: "Cards" }).getByRole("button");
    await expect(cards).toHaveCount(12);
    await expect(page.getByRole("radio", { name: "Small" })).toHaveAttribute("aria-checked", "true");
    for (const box of await cards.evaluateAll((all) => all.map((card) => card.getBoundingClientRect().toJSON()))) {
      expect(box.width).toBeGreaterThanOrEqual(64);
      expect(box.height).toBeGreaterThanOrEqual(64);
    }
    expect(await overflow()).toBeLessThanOrEqual(0);

    const card = (index: number) => page.getByRole("button", { name: new RegExp(`^Card ${index + 1},`) });
    /** What a face-up card shows, from its name: "Card 4, a cat" is "a cat". */
    const pictureOf = async (index: number) => ((await card(index).getAttribute("aria-label")) ?? "").replace(/^Card \d+, /, "");

    // Learn every picture by turning the cards over two at a time (a miss turns back on the next tap).
    const seen = new Map<string, number>();
    let pair: [number, number] | null = null;
    for (let index = 0; index < 12 && !pair; index += 1) {
      await card(index).tap();
      await expect(card(index)).not.toHaveAccessibleName(/face down/);
      const picture = (await pictureOf(index)).replace(/, matched$/, "");
      if (seen.has(picture)) pair = [seen.get(picture)!, index];
      else seen.set(picture, index);
    }
    expect(pair).not.toBeNull();
    const [a, b] = pair!;

    // Unless the two were turned over one after the other, turn them now, one after the other.
    if (!/, matched$/.test(await pictureOf(b))) {
      await card(a).tap();
      await expect(card(a)).not.toHaveAccessibleName(/face down/);
      await card(b).tap();
    }
    await expect(card(a)).toHaveAccessibleName(/, matched$/);
    await expect(card(b)).toHaveAccessibleName(/, matched$/);
    await expect(page.getByText(/^1 of 6 pairs found, \d+ turns?\.$/)).toBeVisible();
    expect(await overflow()).toBeLessThanOrEqual(0);

    expect(errors).toEqual([]);
  });
});
