/** Chat on a phone 390 pixels wide, against the stand-in model server. */
import { api, expect, test, watchForErrors } from "./fixtures";

const MODEL_URL = process.env.OUTPOST_E2E_MODEL_URL!;

test.use({ viewport: { width: 390, height: 844 } });

test.describe("chat, on a phone", () => {
  test.afterAll(async ({ browser }) => {
    const page = await browser.newPage();
    await page.request.fetch("/api/settings", {
      method: "PATCH",
      headers: { "X-Outpost-Request": "1", "Content-Type": "application/json" },
      data: JSON.stringify({ "answers.enabled": false, "answers.model": "" }),
    });
    await page.close();
  });

  test("keeps the box in reach and the newest words in view, without taking the page from someone reading further up", async ({ page }) => {
    const errors = watchForErrors(page);
    await api(page, "PATCH", "/api/settings", {
      "answers.enabled": true,
      "answers.endpoint": `${MODEL_URL}/v1`,
      "answers.model": "stand-in-long:latest",
    });
    await page.goto("/");
    await page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: "More" }).click();
    await page.getByRole("dialog", { name: "More" }).getByRole("link", { name: "Chat", exact: true }).click();

    const box = page.getByRole("textbox", { name: "Your message" });
    // On a touch keyboard Enter makes a new line; the button sends.
    await box.fill("Tell me about tent pegs");
    await box.press("Enter");
    await expect(box).toHaveValue("Tell me about tent pegs\n");
    const send = page.getByRole("button", { name: "Send" });
    expect((await send.boundingBox())!.height).toBeGreaterThanOrEqual(40);
    await send.click();

    const reply = page.getByRole("article", { name: /^Reply from/ }).last();
    await expect(reply.getByTestId("reply-text")).toContainText("Paragraph 6");
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(await overflow()).toBeLessThanOrEqual(1);

    // The page itself does not scroll: the conversation scrolls inside it, and the box and Stop stay put above the bar.
    const frame = page.getByTestId("chat-frame");
    const scroller = frame.locator("div.overflow-y-auto").first();
    expect(await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight)).toBeLessThanOrEqual(1);
    const stop = page.getByRole("button", { name: "Stop" });
    const stopBox = (await stop.boundingBox())!;
    expect(stopBox.height).toBeGreaterThanOrEqual(40);
    const bar = (await page.getByRole("navigation", { name: "Main" }).boundingBox())!;
    expect(stopBox.y + stopBox.height).toBeLessThanOrEqual(bar.y + 1);

    // While it is written, the newest words are in view: the conversation is scrolled to its end.
    const fromEnd = () => scroller.evaluate((element) => element.scrollHeight - element.scrollTop - element.clientHeight);
    await expect.poll(fromEnd).toBeLessThan(80);

    // Scroll up to read. The reply goes on growing and the place being read does not move.
    await scroller.evaluate((element) => element.scrollTo({ top: 0 }));
    const growing = await scroller.evaluate((element) => element.scrollHeight);
    await expect.poll(() => scroller.evaluate((element) => element.scrollHeight)).toBeGreaterThan(growing + 100);
    expect(await scroller.evaluate((element) => element.scrollTop)).toBe(0);
    // The way back down is offered, and takes it.
    await page.getByRole("button", { name: "Newest words" }).click();
    await expect.poll(fromEnd).toBeLessThan(80);
    await stop.click();
    await expect(reply.getByText("Stopped. This reply is unfinished.")).toBeVisible();
    expect((await stopBox.y) - (await page.getByRole("button", { name: "Send" }).boundingBox())!.y).toBeLessThanOrEqual(1);

    // The model picker fits the screen.
    await page.getByRole("button", { name: /^Model:/ }).click();
    const menu = (await page.getByRole("menu").boundingBox())!;
    expect(menu.x).toBeGreaterThanOrEqual(0);
    expect(menu.x + menu.width).toBeLessThanOrEqual(390);
    await page.keyboard.press("Escape");
    expect(await overflow()).toBeLessThanOrEqual(1);
    expect(errors).toEqual([]);
  });

  test("moves the box above a keyboard that covers the bottom of the screen", async ({ page }) => {
    const id = (await api(page, "POST", "/api/chat/conversations", { title: "Keyboard" })).conversation.id;
    await page.goto(`/chat/${id}`);
    const box = page.getByRole("textbox", { name: "Your message" });
    await expect(box).toBeVisible();
    const before = (await box.boundingBox())!;
    // No emulated phone has a keyboard, so the browser's report of one is stood in for: 336 pixels of the window covered.
    await page.evaluate(() => {
      const viewport = window.visualViewport!;
      Object.defineProperty(viewport, "height", { configurable: true, get: () => window.innerHeight - 336 });
      viewport.dispatchEvent(new Event("resize"));
    });
    await expect.poll(async () => (await box.boundingBox())!.y).toBeLessThan(before.y - 200);
    const after = (await box.boundingBox())!;
    const modeLine = (await page.getByTestId("chat-mode").boundingBox())!;
    expect(modeLine.y + modeLine.height).toBeLessThanOrEqual(844 - 336 + 1);
    expect(after.y).toBeGreaterThan(60);
  });
});
