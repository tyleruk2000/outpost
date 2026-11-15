// Takes screenshots of a running Outpost for design review and the README.
//   node tools/screenshot.mjs <base-url> <out-dir> <route[@theme][@mobile]>...
// Example: node tools/screenshot.mjs http://localhost:8080 ./shots /storage /storage@dark /@mobile
import fs from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";

const [base, outDir, ...targets] = process.argv.slice(2);
if (!base || !outDir || targets.length === 0) {
  console.error("usage: screenshot.mjs <base-url> <out-dir> <route[@dark][@mobile][@full]>...");
  process.exit(2);
}
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch();
for (const target of targets) {
  const [route, ...flags] = target.split("@");
  const mobile = flags.includes("mobile");
  const theme = flags.includes("dark") ? "dark" : "light";
  const context = await browser.newContext({
    viewport: mobile ? { width: 390, height: 844 } : { width: 1360, height: 860 },
    deviceScaleFactor: mobile ? 2 : 1,
    colorScheme: theme,
    isMobile: mobile,
    hasTouch: mobile,
  });
  const page = await context.newPage();
  const problems = [];
  page.on("console", (message) => message.type() === "error" && problems.push(message.text()));
  page.on("pageerror", (error) => problems.push(String(error)));
  page.on("requestfailed", (request) => problems.push(`request failed: ${request.url()}`));
  await page.goto(new URL(route, base).toString(), { waitUntil: "networkidle" });
  await page.waitForTimeout(350);
  const name = `${(route.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "home")}-${theme}${mobile ? "-mobile" : ""}.png`;
  await page.screenshot({ path: path.join(outDir, name), fullPage: flags.includes("full") });
  console.log(name, problems.length ? `PROBLEMS: ${problems.join(" | ")}` : "ok");
  await context.close();
}
await browser.close();
