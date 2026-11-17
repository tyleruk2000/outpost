import fs from "node:fs";
import { chromium } from "@playwright/test";
const [base, out, ...targets] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
for (const target of targets) {
  const [route, ...flags] = target.split("@");
  const mobile = !flags.includes("desktop");
  const theme = flags.includes("dark") ? "dark" : "light";
  const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1360, height: 900 }, deviceScaleFactor: 1, colorScheme: theme, isMobile: mobile, hasTouch: mobile, locale: "en-GB" });
  const page = await context.newPage();
  const problems = [];
  page.on("console", (m) => m.type() === "error" && problems.push(m.text()));
  page.on("pageerror", (e) => problems.push(String(e)));
  await page.goto(new URL(route, base).toString(), { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  const name = `${route.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "")}-${theme}${mobile ? "-m" : ""}.png`;
  await page.screenshot({ path: `${out}/${name}`, fullPage: true });
  console.log(name, "overflow", overflow, problems.length ? `PROBLEMS: ${problems.join(" | ")}` : "ok");
  await context.close();
}
await browser.close();
