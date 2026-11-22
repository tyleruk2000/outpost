/**
 * The reading and people screens walked on a phone (Chromium, touch) at 390 by 844 and
 * 320 by 568, empty and then full (study-reading.ts).
 */
import { expect, test } from "./fixtures";
import { type ScreenReport, screens, seed, walk, writeReport } from "./study-reading";

for (const size of [
  { width: 390, height: 844 },
  { width: 320, height: 568 },
]) {
  test.describe(`the reading and people screens at ${size.width} by ${size.height}`, () => {
    test.use({ viewport: size });

    test("hold up empty and full, in both themes and at 200% text", async ({ page }) => {
      test.setTimeout(900_000);
      const label = `phone${size.width}`;
      const reports: ScreenReport[] = [];
      await page.goto("/");
      for (const [name, address] of screens(null)) reports.push(await walk(page, `empty-${name}`, address, label, 24));
      const seeded = await seed(page.request);
      for (const [name, address] of screens(seeded)) reports.push(await walk(page, name, address, label, 24));
      writeReport(`${label}.json`, reports);
      expect(reports.flatMap((report) => report.axe)).toEqual([]);
      expect(
        reports.filter((report) => report.layout.some((finding) => finding.kind === "sideways-scroll")).map((report) => report.path),
      ).toEqual([]);
    });
  });
}
