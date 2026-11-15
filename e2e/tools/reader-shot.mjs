// Opens a reference article in the reader, follows a link inside it, and reports what
// the sandboxed page could and could not do.
import { chromium } from "@playwright/test";
const [base, out, collectionId] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
const problems = [];
const external = [];
page.on("console", (m) => m.type() === "error" && problems.push(m.text().slice(0, 160)));
page.on("request", (r) => { const u = new URL(r.url()); if (!["localhost", "127.0.0.1"].includes(u.hostname) && u.protocol.startsWith("http")) external.push(r.url()); });
await page.goto(`${base}/library/read/${collectionId}/Bowline`, { waitUntil: "networkidle" });
await page.waitForTimeout(1200);
await page.screenshot({ path: `${out}/reader-1.png` });
const frame = page.frames().find((f) => f.url().includes("/kiwix/"));
console.log("frame url:", frame?.url());
// What can the archive's page reach?
const probe = await frame.evaluate(async () => {
  const result = { origin: self.origin };
  try { result.cookie = document.cookie; } catch (e) { result.cookie = `blocked: ${e.name}`; }
  try { localStorage.getItem("x"); result.storage = "allowed"; } catch (e) { result.storage = `blocked: ${e.name}`; }
  try { const r = await fetch("/api/settings"); result.apiRead = `status ${r.status}`; } catch (e) { result.apiRead = `blocked: ${e.name}`; }
  try { const r = await fetch("/api/settings", { method: "PATCH", headers: { "X-Outpost-Request": "1", "Content-Type": "application/json" }, body: "{}" }); result.apiWrite = `status ${r.status}`; } catch (e) { result.apiWrite = `blocked: ${e.name}`; }
  try { result.parent = parent.location.href; } catch (e) { result.parent = `blocked: ${e.name}`; }
  return result;
});
console.log("sandbox probe:", JSON.stringify(probe));
// Follow a link inside the article; the address bar should follow.
await frame.locator('a[href*="Clove_hitch"]').first().click().catch(() => {});
await page.waitForTimeout(1500);
console.log("address after in-frame navigation:", page.url());
await page.getByRole("searchbox").fill("sheep");
await page.waitForTimeout(900);
await page.screenshot({ path: `${out}/reader-2.png` });
await page.getByRole("searchbox").press("Enter");
await page.waitForTimeout(1200);
await page.screenshot({ path: `${out}/reader-3.png` });
console.log("external requests:", external.length, external.slice(0, 3));
console.log(problems.length ? `console errors: ${problems.slice(0, 6).join(" | ")}` : "no console errors");
await browser.close();
