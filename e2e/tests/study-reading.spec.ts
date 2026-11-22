/**
 * The reading and people screens walked on a wide screen, empty and then full (study-reading.ts).
 */
import { expect, test } from "./fixtures";
import { type ScreenReport, screens, seed, walk, writeReport } from "./study-reading";

test.describe("the reading and people screens at 1280 by 800", () => {
  test.describe.configure({ mode: "serial" });
  test.use({ viewport: { width: 1280, height: 800 } });

  test("hold up empty and full, in both themes and at 200% text", async ({ page }) => {
    test.setTimeout(900_000);
    const reports: ScreenReport[] = [];
    await page.goto("/");
    for (const [name, address] of screens(null)) reports.push(await walk(page, `empty-${name}`, address, "desktop", 24));
    const seeded = await seed(page.request);
    for (const [name, address] of screens(seeded)) reports.push(await walk(page, name, address, "desktop", 24));
    writeReport("desktop.json", reports);
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
