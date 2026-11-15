// Signs in as a member (not an administrator) and screenshots the screens whose
// controls differ by role, so that what a member sees can be looked at.
//   node tools/member-shot.mjs <base-url> <out-dir>
import fs from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";

const [base, outDir] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1360, height: 860 }, baseURL: base });
const H = { "X-Outpost-Request": "1" };
const call = async (method, url, data) => {
  const response = await context.request.fetch(url, { method, headers: H, data });
  if (!response.ok()) throw new Error(`${method} ${url} -> ${response.status()} ${await response.text()}`);
  return response.json();
};

const session = await call("GET", "/api/auth/session");
if (session.setupRequired) await call("POST", "/api/auth/setup", { username: "keeper", password: "a long test password" });
else await call("POST", "/api/auth/login", { username: "keeper", password: "a long test password" });
const { users } = await call("GET", "/api/users");
if (!users.some((user) => user.username === "reader"))
  await call("POST", "/api/users", { username: "reader", password: "another long password", role: "member" });
await call("POST", "/api/auth/logout", {});
await call("POST", "/api/auth/login", { username: "reader", password: "another long password" });

const page = await context.newPage();
const problems = [];
page.on("console", (message) => message.type() === "error" && problems.push(`${page.url()}: ${message.text().slice(0, 200)}`));
page.on("pageerror", (error) => problems.push(`${page.url()}: ${error}`));
for (const route of ["/", "/explore", "/downloads", "/storage", "/settings", "/maps", "/library", "/import", "/search/how-it-works"]) {
  await page.goto(route, { waitUntil: "networkidle" });
  if (route === "/maps")
    await page
      .getByRole("tab", { name: /Offline maps/ })
      .click()
      .catch(() => {});
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(outDir, `member-${route.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "home"}.png`) });
}
// What the server refuses a member, whatever the screen shows.
const refused = [];
for (const [method, url, data] of [
  ["PATCH", "/api/settings", { "downloads.rateLimitKbps": 10 }],
  ["POST", "/api/catalog/refresh", {}],
  ["POST", "/api/maps/regions", { name: "x", bbox: [0, 0, 1, 1], maxZoom: 3 }],
  ["GET", "/api/backup/download"],
  ["GET", "/api/users"],
  ["POST", "/api/downloads/pause-all", {}],
]) {
  const response = await context.request.fetch(url, { method, headers: H, data });
  refused.push(`${method} ${url} -> ${response.status()}`);
}
console.log(refused.join("\n"));
console.log(problems.length ? `PROBLEMS:\n${problems.join("\n")}` : "no console errors");
await browser.close();
