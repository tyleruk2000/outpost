/**
 * Radio → Satellites in Safari on an iPhone (WebKit, 390 wide): a satellite is found by
 * typing in the picker, its passes and sky track come first, and under "where it is now"
 * the ground track is drawn with no map tiles, its caption in words and its table opened
 * as the text alternative. Nothing runs off the side, nothing is too small to touch
 * (layout-audit.ts), and the server's answer is stood in for (satellite-stand-in.ts).
 */
import type { Page } from "@playwright/test";
import { accessibilityInBothThemes } from "./a11y";
import { expect, test, watchForErrors } from "./fixtures";
import { auditLayout } from "./layout-audit";
import { LONDON, standInSatellites } from "./satellite-stand-in";

async function wrong(page: Page): Promise<string[]> {
  const findings = await page.evaluate(auditLayout, { shell: ["header.bg-spine", 'nav[aria-label="Main"]'] });
  return findings
    .filter((finding) => !finding.shell)
    .filter((finding) => !(finding.kind === "small-target" && finding.what.startsWith("link in a line of text")))
    .map((finding) => `${finding.kind}: ${finding.what} (${finding.detail})`);
}

test.describe("a satellite's ground track on an iPhone", () => {
  test("is found by name, drawn under where it is now, and read as a table", async ({ page }, testInfo) => {
    const errors = watchForErrors(page);
    await standInSatellites(page);
    await page.goto("/radio/satellites");
    await page.getByRole("textbox", { name: "Seen from" }).fill(LONDON);
    await page.getByRole("tab", { name: "One satellite" }).tap();

    await page.getByRole("button", { name: "Satellite", exact: true }).tap();
    await page.getByRole("searchbox", { name: "Find a satellite" }).fill("funcube");
    await page.getByRole("option", { name: /FUNCUBE-1/ }).tap();
    await expect(page.getByRole("heading", { name: "FUNCUBE-1 (AO-73)", level: 2 })).toBeVisible();

    // Passes and the sky track come before where it is now.
    const passes = await page.getByRole("heading", { name: "Passes in the next 24 hours" }).boundingBox();
    const now = await page.getByRole("heading", { name: /horizon at .* now$/ }).boundingBox();
    expect(passes!.y).toBeLessThan(now!.y);

    const map = page.getByRole("img", { name: /^Ground track\. Now over / });
    await map.scrollIntoViewIfNeeded();
    await expect(map).toBeVisible();
    const box = await map.boundingBox();
    expect(box!.width).toBeGreaterThan(300);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);
    await expect(page.getByText(/^Now over \d+\.\d° [NS], \d+\.\d° [EW]\./)).toBeVisible();

    await page.getByText("The track as a table").tap();
    const table = page.getByRole("table", { name: "The ground track every 10 minutes" });
    await expect(table).toBeVisible();
    expect(await table.getByRole("row").count()).toBeGreaterThan(10);
    await testInfo.attach("ground track on an iPhone", { body: await page.screenshot({ fullPage: false }), contentType: "image/png" });

    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    expect(await wrong(page)).toEqual([]);
    expect(await accessibilityInBothThemes(page, "/radio/satellites")).toEqual([]);
    expect(errors).toEqual([]);
  });
});
