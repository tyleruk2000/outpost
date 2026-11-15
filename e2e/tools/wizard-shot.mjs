// Drives the portable-drive wizard far enough to photograph each step.
import { chromium } from "@playwright/test";

const [base, out] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
const problems = [];
page.on("console", (m) => m.type() === "error" && problems.push(m.text()));
await page.goto(`${base}/storage`, { waitUntil: "networkidle" });
await page.getByRole("button", { name: "Make a portable drive" }).click();
await page.waitForTimeout(400);
await page.screenshot({ path: `${out}/wizard-1.png` });
// Open the first root, then the usb folder if present.
const folders = page.getByRole("list", { name: "Folders" });
await folders.getByRole("button").first().click();
await page.waitForTimeout(300);
const usb = folders.getByRole("button", { name: /usb/ });
if (await usb.count()) {
  await usb.click();
  await page.waitForTimeout(300);
}
await page.getByRole("button", { name: "New folder" }).click();
await page.getByLabel("Name of the new folder").fill("Trip drive");
await page.getByRole("button", { name: "Continue" }).click();
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/wizard-2.png` });
await page.getByRole("button", { name: "Continue" }).click();
await page.waitForTimeout(900);
await page.screenshot({ path: `${out}/wizard-3.png` });
console.log(problems.length ? `PROBLEMS: ${problems.join(" | ")}` : "ok");
await browser.close();
