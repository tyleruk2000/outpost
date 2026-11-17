import { chromium } from "@playwright/test";
const [base, out, route, theme, ...ids] = process.argv.slice(2);
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: theme, isMobile: true, hasTouch: true, locale: "en-GB" });
const page = await context.newPage();
await page.goto(new URL(route, base).toString(), { waitUntil: "networkidle" });
await page.waitForTimeout(500);
for (const id of ids) {
  const el = page.locator(`#${id}`);
  await el.screenshot({ path: `${out}/${id}-${theme}.png` });
}
console.log(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth));
await browser.close();
