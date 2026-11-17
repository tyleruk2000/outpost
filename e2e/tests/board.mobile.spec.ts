/**
 * Messages, the household board, on two phones at once: one checks in and sends a file,
 * the other sees both arrive without reloading (by the live-events stream) and saves
 * the file. Both are at phone width, each with its own name kept on the device.
 */
import fs from "node:fs";
import type { Browser, BrowserContext, Page } from "@playwright/test";
import { api, expect, test, watchForErrors } from "./fixtures";

async function phone(
  browser: Browser,
  baseURL: string,
  name: string,
): Promise<{ context: BrowserContext; page: Page; external: string[] }> {
  const context = await browser.newContext({
    baseURL,
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    acceptDownloads: true,
  });
  const external: string[] = [];
  // The same seal as every other test: nothing may leave for the internet.
  await context.route("**/*", (route, request) => {
    const url = new URL(request.url());
    if (["localhost", "127.0.0.1"].includes(url.hostname) || ["data:", "blob:", "about:"].includes(url.protocol)) return route.continue();
    external.push(request.url());
    return route.abort("internetdisconnected");
  });
  await context.addInitScript((who) => localStorage.setItem("outpost.board.name", who), name);
  const page = await context.newPage();
  return { context, page, external };
}

test.describe("the household board on two phones", () => {
  test.afterEach(async ({ page }) => {
    await page.goto("/");
    await api(page, "POST", "/api/manage/leftovers/clear", { ids: ["board:all"] });
  });

  test("a check-in and a file from one phone arrive on the other without reloading, and the file is saved", async ({
    browser,
    baseURL,
  }) => {
    const sam = await phone(browser, baseURL!, "Sam");
    const alex = await phone(browser, baseURL!, "Alex");
    const errors = { sam: watchForErrors(sam.page), alex: watchForErrors(alex.page) };
    try {
      // Alex's phone has the board open first, and marks the page so that a reload would show.
      await alex.page.goto("/messages");
      await expect(alex.page.getByRole("heading", { level: 1, name: "Messages" })).toBeVisible();
      await expect(alex.page.getByText("Posting from this device as")).toContainText("Alex");
      await alex.page.evaluate(() => {
        (window as unknown as { stayed: boolean }).stayed = true;
      });

      await sam.page.goto("/messages");
      await sam.page.getByLabel(/Where you are, in a few words/).fill("gone to Mum's");
      await sam.page.getByRole("button", { name: "I'm safe" }).click();
      await expect(sam.page.getByText("You checked in as safe.")).toBeVisible();

      const strip = alex.page.getByRole("list", { name: "Latest check-ins" });
      await expect(strip.getByRole("listitem").filter({ hasText: "Sam:" })).toContainText(/safe · gone to Mum's · \d\d:\d\d today/);

      // A file from Sam's phone.
      const content = "Milk\nBread\nAA batteries\n";
      await sam.page
        .locator('input[type="file"]')
        .setInputFiles({ name: "Shopping list.txt", mimeType: "text/plain", buffer: Buffer.from(content) });
      await expect(sam.page.getByText(/Up to 200 MB, kept for 7 days/)).toBeVisible();
      await sam.page.getByLabel(/A few words with it/).fill("For whoever goes");
      await sam.page.getByRole("button", { name: "Send to the board" }).click();
      await expect(sam.page.getByText("Sent “Shopping list.txt”")).toBeVisible();

      const board = alex.page.getByRole("list", { name: "Messages, oldest first" });
      const sent = board.getByRole("listitem").filter({ hasText: "Shopping list.txt" });
      await expect(sent).toContainText("Sam");
      await expect(sent).toContainText("For whoever goes");
      await expect(sent).toContainText("24 bytes");
      await expect(board.getByRole("listitem").filter({ hasText: "gone to Mum's" })).toContainText("Safe");
      expect(await alex.page.evaluate(() => (window as unknown as { stayed?: boolean }).stayed)).toBe(true);

      const download = alex.page.waitForEvent("download");
      await sent.getByRole("link", { name: "Save" }).click();
      const saved = await download;
      expect(saved.suggestedFilename()).toBe("Shopping list.txt");
      expect(fs.readFileSync((await saved.path())!, "utf8")).toBe(content);

      expect(sam.external).toEqual([]);
      expect(alex.external).toEqual([]);
      expect(errors).toEqual({ sam: [], alex: [] });
    } finally {
      await sam.context.close();
      await alex.context.close();
    }
  });
});
