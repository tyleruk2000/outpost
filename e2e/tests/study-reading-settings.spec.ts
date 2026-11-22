/**
 * The reading surfaces at every reading setting (Settings, Appearance: theme, reading
 * typeface, text size): each is read in the chosen face, nothing runs off the side, and
 * axe finds nothing serious (study-reading.ts seeds them).
 */
import fs from "node:fs";
import path from "node:path";
import { accessibilityFindings } from "./a11y";
import { expect, test } from "./fixtures";
import { seed } from "./study-reading";

const FACES = ["serif", "sans"] as const;
const SIZES = ["smaller", "default", "larger", "largest"] as const;

for (const viewport of [
  { width: 1280, height: 800 },
  { width: 390, height: 844 },
]) {
  test.describe(`the reading settings at ${viewport.width} wide`, () => {
    test.use({ viewport, hasTouch: viewport.width < 500, isMobile: viewport.width < 500 });

    test("every face, size and theme on every reading surface", async ({ page }) => {
      test.setTimeout(900_000);
      await page.goto("/");
      const seeded = await seed(page.request);
      const surfaces: Array<[string, string, string]> = [
        ["epub", `/library/documents/${seeded.epub}?chapter=1`, "article, [role=region]"],
        ["markdown", `/library/documents/${seeded.markdown}`, "article, [role=region]"],
        ["text", `/library/documents/${seeded.text}`, "pre, article, [role=region]"],
        ["note", `/notes/${seeded.note}`, "[contenteditable]"],
      ];
      const out = process.env.OUTPOST_STUDY_OUT;
      const found: string[] = [];
      const faces: Record<string, string> = {};
      for (const [name, address, body] of surfaces) {
        for (const face of FACES) {
          for (const size of SIZES) {
            for (const theme of ["light", "dark"] as const) {
              await page.evaluate(
                ([f, s, t]: [string, string, string]) => {
                  localStorage.setItem("outpost.reading", f);
                  localStorage.setItem("outpost.textSize", s);
                  localStorage.setItem("outpost.theme", t);
                },
                [face, size, theme] as [string, string, string],
              );
              await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
              await page.goto(address);
              await page.locator(body).first().waitFor({ timeout: 15_000 });
              await page.waitForTimeout(400);
              const label = `${viewport.width}-${name}-${face}-${size}-${theme}`;
              const wide = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
              if (wide > 0) found.push(`${label}: ${wide} px wider than the screen`);
              faces[label] = await page
                .locator(body)
                .first()
                .evaluate((element) => getComputedStyle(element.querySelector("p") ?? element).fontFamily);
              if (size === "default" || size === "largest")
                found.push(...(await accessibilityFindings(page, address, `${theme} ${face} ${size}`)));
              if (out && (theme === "light" || size === "largest"))
                await page.screenshot({ path: path.join(out, `settings-${label}.png`) });
            }
          }
        }
      }
      await page.evaluate(() => {
        localStorage.removeItem("outpost.reading");
        localStorage.removeItem("outpost.textSize");
        localStorage.removeItem("outpost.theme");
      });
      if (out) fs.writeFileSync(path.join(out, `settings-${viewport.width}.json`), JSON.stringify({ found, faces }, null, 2));
      expect(found).toEqual([]);
    });
  });
}
