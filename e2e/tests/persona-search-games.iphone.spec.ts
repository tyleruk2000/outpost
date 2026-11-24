/**
 * What the persona tests of 24 November 2026 found, in Safari's engine (WebKit), with real taps.
 *
 * - Pairs: every card lay face up on an iPhone. Face down, a card's picture is not drawn at all; a tap shows it.
 * - Search with the text at 200% on an upright iPad (the relative): the first screen held no result. Now the
 *   filters are one drop-down, the explanations fold under "About these results", and the first result is on
 *   the first screen.
 * - With no writing model, the Search screen says what answers would do and offers one button to set them up.
 */
import { devices } from "@playwright/test";
import { expect, test, watchForErrors } from "./fixtures";

const headers = { "X-Outpost-Request": "1" };
const paragraph = (text: string) => ({ type: "paragraph", content: [{ type: "text", text }] });
const SHOTS = process.env.OUTPOST_E2E_SHOTS;

test.describe("Pairs on an iPhone", () => {
  test("deals every card face down, and shows a card's picture only once it is tapped", async ({ page }) => {
    const errors = watchForErrors(page);
    await page.goto("/games/pairs?seed=20261117&size=small");
    const cards = page.getByRole("group", { name: "Cards" }).getByRole("button");
    await expect(cards).toHaveCount(12);
    // Face down: the back is drawn, the face is not, whatever the engine makes of a turn in 3D.
    for (const card of await cards.all()) {
      await expect(card.locator("[data-side=face]")).toBeHidden();
      await expect(card.locator("[data-side=back]")).toBeVisible();
    }
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/pairs-iphone-dealt.png` });
    // The way back says "Games" whole, not "Gam…".
    const back = page.getByRole("link", { name: "Games" }).first();
    expect(await back.locator("span").evaluate((span) => span.scrollWidth - span.clientWidth)).toBeLessThanOrEqual(0);
    const first = cards.first();
    await first.tap();
    await expect(first).not.toHaveAccessibleName(/face down/);
    await expect(first.locator("[data-side=face]")).toBeVisible();
    await expect(first.locator("[data-side=back]")).toBeHidden();
    // The others stay face down.
    await expect(cards.nth(1).locator("[data-side=face]")).toBeHidden();
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/pairs-iphone-one-turned.png` });
    expect(errors).toEqual([]);
  });
});

test.describe("Search on an upright iPad with the text at 200%", () => {
  const ipad = devices["iPad (gen 7)"];
  test.use({ viewport: ipad.viewport, userAgent: ipad.userAgent, deviceScaleFactor: 1, isMobile: true, hasTouch: true });

  test.describe.configure({ mode: "serial" });
  const made: string[] = [];
  test.beforeAll(async ({ request }) => {
    const pages: Array<[string, string]> = [
      ["Burns and scalds", "Cool a burn under cool running water for 20 minutes. Do not use ice or butter."],
      ["Kitchen safety", "Keep pan handles turned in, so that nobody knocks a pan and gets a burn."],
      ["Camping stove", "Let the stove cool before packing it away: a hot burner can burn the bag."],
    ];
    for (const [title, text] of pages) {
      const created = await request.post("/api/notes", {
        headers,
        data: { title, content: { type: "doc", content: [paragraph(text)] } },
      });
      expect(created.ok(), await created.text()).toBe(true);
      made.push((await created.json()).note.id);
    }
  });
  test.afterAll(async ({ request }) => {
    for (const id of made) await request.delete(`/api/notes/${id}?permanent=true`, { headers });
  });

  test("puts the first result on the first screen, and keeps the filters and explanations a tap away", async ({ page }) => {
    const errors = watchForErrors(page);
    // The text size is the device's, set before the app draws, as Safari's larger text would be.
    await page.addInitScript(() => {
      document.addEventListener("DOMContentLoaded", () => {
        document.documentElement.style.fontSize = "200%";
      });
    });
    await page.goto("/search?q=what%20to%20do%20for%20a%20burn");
    const first = page.locator("#content ol li").first();
    await expect(first).toBeVisible();
    const height = page.viewportSize()!.height;
    const box = (await first.boundingBox())!;
    // The whole of the first result's title is on the first screen.
    expect(box.y + 40, "the first result's top").toBeLessThan(height);
    // Filters: one drop-down, not four rows of tabs. The how-it-works links have given way to the results.
    await expect(page.getByRole("combobox", { name: "Show" })).toBeVisible();
    await expect(page.getByRole("tablist", { name: "Filter results" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "How search was tuned" })).toBeHidden();
    // What was left out of the question is a tap away.
    await page.getByText("About these results").tap();
    await expect(page.getByText(/Left out of the search, as words that only shape a question/)).toBeVisible();
    // Nothing runs off the side.
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/search-ipad-200.png` });
    expect(errors).toEqual([]);
  });

  test("offers answers from the library with one button while no writing model is set up", async ({ page }) => {
    await page.goto("/search?q=burn");
    const offer = page.getByRole("region", { name: "Want a written answer?" });
    await expect(offer).toBeVisible();
    await expect(offer).toContainText("Outpost does not include one");
    await offer.getByRole("button", { name: "Set up answers" }).tap();
    const dialog = page.getByRole("dialog", { name: "Set up answers and chat" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: /^Look for Ollama on/ })).toBeVisible();
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/answers-offer-dialog-ipad.png` });
  });
});
