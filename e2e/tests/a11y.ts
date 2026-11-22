/**
 * The automated accessibility check: axe-core, run inside the page (it is a package of
 * the suite, nothing is fetched), against WCAG 2.2 AA (PRODUCT.md). Serious and critical
 * findings fail; lesser ones are judged by hand. What is let through is in a11y-waivers.ts.
 */
import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { WAIVERS } from "./a11y-waivers";

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const FAILING = new Set(["serious", "critical"]);

/**
 * A target axe finds "partially obscured" only because the page rests with it under the fixed
 * top bar or bar of screens is measured again scrolled to the middle of the screen, where a
 * person would press it (owner's decision, 22 Nov 2026); a target too small or too crowded
 * fails there too.
 */
async function obscuredOnlyByWhereItRests(page: Page, rule: string, target: string[], why: string): Promise<boolean> {
  if (rule !== "target-size" || !/partially obscured/.test(why) || target.length !== 1) return false;
  const scroll = await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }));
  try {
    await page
      .locator(target[0]!)
      .first()
      .evaluate((node) => node.scrollIntoView({ block: "center", inline: "nearest" }));
    const again = await new AxeBuilder({ page }).include(target[0]!).withRules(["target-size"]).analyze();
    return again.violations.length === 0;
  } catch {
    return false;
  } finally {
    await page.evaluate(({ x, y }) => window.scrollTo(x, y), scroll);
  }
}

/** The serious and critical findings on the page as it is now, less the waived ones, one line each. */
export async function accessibilityFindings(page: Page, path: string, theme: string): Promise<string[]> {
  const result = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const found: string[] = [];
  for (const violation of result.violations) {
    if (!FAILING.has(violation.impact ?? "")) continue;
    for (const node of violation.nodes) {
      if (await obscuredOnlyByWhereItRests(page, violation.id, node.target.map(String), node.failureSummary ?? "")) continue;
      const target = node.target.map(String).join(" ");
      const html = node.html.replace(/\s+/g, " ").slice(0, 200);
      const waived = WAIVERS.some(
        (waiver) =>
          waiver.rule === violation.id &&
          (!waiver.where || waiver.where.test(path)) &&
          (!waiver.target || waiver.target.test(`${target} ${html}`)),
      );
      if (waived) continue;
      const why = (node.failureSummary ?? "").replace(/\s+/g, " ").trim();
      found.push(`${path} (${theme}) ${violation.id} [${violation.impact}] ${target}: ${why} ${html}`);
    }
  }
  return found;
}

/** The findings in the light theme and then the dark one; the page is left in the light theme. */
export async function accessibilityInBothThemes(page: Page, path: string): Promise<string[]> {
  const found: string[] = [];
  for (const theme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await page.locator(`html[data-theme="${theme}"]`).waitFor({ state: "attached" });
    found.push(...(await accessibilityFindings(page, path, theme)));
  }
  await page.emulateMedia({ colorScheme: "light" });
  return found;
}
