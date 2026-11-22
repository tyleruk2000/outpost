/**
 * The reading and people screens walked in WebKit on an iPhone-sized screen (study-reading.ts).
 */
import { expect, test } from "./fixtures";
import { type ScreenReport, screens, seed, walk, writeReport } from "./study-reading";

test.describe("the reading and people screens on an iPhone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("hold up full, in both themes and at 200% text", async ({ page }) => {
    test.setTimeout(900_000);
    const reports: ScreenReport[] = [];
    await page.goto("/");
    const seeded = await seed(page.request);
    for (const [name, address] of screens(seeded)) reports.push(await walk(page, name, address, "iphone", 24));
    writeReport("iphone.json", reports);
    expect(reports.flatMap((report) => report.axe)).toEqual([]);
    // Settings, Text size: Largest (150%) never makes a screen scroll sideways.
    expect(reports.filter((report) => report.wide150 > 0).map((report) => report.path)).toEqual([]);
    // And neither does text at 200%.
    expect(reports.filter((report) => report.wide200 > 0).map((report) => report.path)).toEqual([]);
    expect(
      reports.filter((report) => report.layout.some((finding) => finding.kind === "sideways-scroll")).map((report) => report.path),
    ).toEqual([]);
  });
});
