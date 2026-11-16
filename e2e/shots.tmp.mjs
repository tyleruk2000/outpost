import { chromium, devices } from "@playwright/test";
const out = "/private/tmp/claude-501/-Users-tylerallen-Documents-projects/ac6b71dd-bfd7-4879-9073-28712f9229e0/scratchpad/sat-shots";
const base = "http://localhost:8905";
const browser = await chromium.launch();
const ready = async (page) => { await page.locator('.outpost-map[data-map-idle="true"]').waitFor({ timeout: 30000 }); await page.waitForTimeout(800); };
for (const scheme of ["light", "dark"]) {
  for (const [name, opts] of [["desktop", { viewport: { width: 1360, height: 860 } }], ["phone", { ...devices["iPhone 13"], viewport: { width: 390, height: 844 } }]]) {
    const context = await browser.newContext({ ...opts, colorScheme: scheme, serviceWorkers: "block" });
    await context.addInitScript(() => { localStorage.setItem("outpost.maps.satellite", "true"); });
    const page = await context.newPage();
    await page.goto(`${base}/maps?lat=54.595&lon=-3.14&z=13.4`);
    await ready(page);
    const dismiss = page.getByRole("button", { name: "Dismiss" });
    if (await dismiss.isVisible().catch(() => false)) await dismiss.click();
    if (name === "phone") { /* lower the sheet */ }
    await page.mouse.move(2, 2);
    await page.screenshot({ path: `${out}/keswick-${name}-${scheme}.png` });
    await page.goto(`${base}/maps?lat=54.595&lon=-3.14&z=9.5`);
    await ready(page);
    await page.screenshot({ path: `${out}/keswick-z9-${name}-${scheme}.png` });
    await context.close();
  }
}
await browser.close();
