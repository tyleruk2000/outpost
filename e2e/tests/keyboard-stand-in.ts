/**
 * Safari's keyboard as it is: the page keeps its height and the keyboard is laid over its foot
 * (the bar of screens too), and only `visualViewport` says so. WebKit under test has no
 * keyboard of its own, so one is stood in for: the visual viewport made shorter by its height,
 * and a grey block drawn where it would be, for the pictures.
 */
import type { Locator, Page } from "@playwright/test";
import { expect } from "./fixtures";

/** Installs the stand-in; call before the page is opened. `keyboard(page, height)` then raises or lowers it. */
export async function standInKeyboard(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const viewport = new EventTarget();
    let keyboard = 0;
    const readings: Record<string, () => number> = {
      height: () => window.innerHeight - keyboard,
      width: () => window.innerWidth,
      offsetTop: () => 0,
      offsetLeft: () => 0,
      pageTop: () => window.scrollY,
      pageLeft: () => window.scrollX,
      scale: () => 1,
    };
    for (const [name, value] of Object.entries(readings)) Object.defineProperty(viewport, name, { get: value });
    Object.defineProperty(window, "visualViewport", { configurable: true, get: () => viewport });
    (window as unknown as { keyboard: (height: number) => void }).keyboard = (height) => {
      keyboard = height;
      let block = document.getElementById("stand-in-keyboard");
      if (!block) {
        block = document.createElement("div");
        block.id = "stand-in-keyboard";
        block.style.cssText = "position:fixed;left:0;right:0;bottom:0;background:#8a8f98;z-index:2147483647;pointer-events:none";
        document.body.append(block);
      }
      block.style.height = `${height}px`;
      viewport.dispatchEvent(new Event("resize"));
    };
  });
}

/** Raises the stand-in keyboard to `height` px, or lowers it with 0. */
export async function keyboard(page: Page, height: number): Promise<void> {
  await page.evaluate((h) => (window as unknown as { keyboard: (height: number) => void }).keyboard(h), height);
}

/** Wholly above the keyboard, and on the screen. */
export async function aboveKeyboard(page: Page, locator: Locator, height: number): Promise<void> {
  const box = (await locator.boundingBox())!;
  const screen = page.viewportSize()!.height;
  expect(box.y, "below the top of the screen").toBeGreaterThanOrEqual(0);
  expect(box.y + box.height, "above the keyboard").toBeLessThanOrEqual(screen - height + 0.5);
}
