/**
 * The reading and people screens by keyboard alone: every stop Tab reaches shows a focus
 * ring, is not under a sticky bar, and the walk does not get stuck (study-reading.ts seeds them).
 */
import fs from "node:fs";
import path from "node:path";
import { expect, test } from "./fixtures";
import { screens, seed } from "./study-reading";

interface Stop {
  what: string;
  ring: boolean;
  covered: string | null;
}

test.describe("the reading and people screens by keyboard", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("every Tab stop is seen, and none is hidden", async ({ page }) => {
    test.setTimeout(600_000);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    const seeded = await seed(page.request);
    const report: Record<string, { stops: Stop[]; stuck: boolean }> = {};
    for (const [name, address] of screens(seeded)) {
      await page.goto(address);
      await page.waitForTimeout(1200);
      const stops: Stop[] = [];
      let stuck = false;
      let last = "";
      let same = 0;
      for (let press = 0; press < 70; press++) {
        await page.keyboard.press("Tab");
        const stop = await page.evaluate(() => {
          const element = document.activeElement as HTMLElement | null;
          if (!element || element === document.body) return null;
          const style = getComputedStyle(element);
          const ring =
            (style.outlineStyle !== "none" && Number.parseFloat(style.outlineWidth) > 0) ||
            (style.boxShadow !== "none" && style.boxShadow !== "") ||
            element.matches("[contenteditable], textarea, input:not([type=checkbox]):not([type=radio])");
          const box = element.getBoundingClientRect();
          const x = Math.min(Math.max(box.left + box.width / 2, 0), window.innerWidth - 1);
          const y = Math.min(Math.max(box.top + Math.min(box.height / 2, 10), 0), window.innerHeight - 1);
          const top = document.elementFromPoint(x, y);
          const covered =
            top && !element.contains(top) && !top.contains(element)
              ? `${top.tagName.toLowerCase()}.${String(top.className).slice(0, 60)}`
              : null;
          const label = element.getAttribute("aria-label") ?? element.textContent?.trim().slice(0, 40) ?? "";
          // Each element gets a number of its own, so that two fields with the same name are not taken for one.
          element.dataset.studyStop ??= String(document.querySelectorAll("[data-study-stop]").length + 1);
          return {
            what: `#${element.dataset.studyStop} ${element.tagName.toLowerCase()}[${element.getAttribute("role") ?? ""}] ${label}`,
            ring,
            covered,
          };
        });
        if (!stop) continue;
        if (stop.what === last) {
          same += 1;
          if (same > 3) {
            stuck = true;
            break;
          }
        } else same = 0;
        last = stop.what;
        stops.push(stop);
      }
      report[name] = { stops, stuck };
    }
    const out = process.env.OUTPOST_STUDY_OUT;
    if (out) fs.writeFileSync(path.join(out, "keys.json"), JSON.stringify(report, null, 2));
    expect(
      Object.entries(report)
        .filter(([, value]) => value.stuck)
        .map(([name]) => name),
    ).toEqual([]);
    const unseen = Object.entries(report).flatMap(([name, value]) =>
      value.stops
        .filter((stop) => !stop.ring || stop.covered)
        .map((stop) => `${name}: ${stop.what} ${stop.ring ? "" : "shows no ring"} ${stop.covered ? `is under ${stop.covered}` : ""}`),
    );
    expect([...new Set(unseen)]).toEqual([]);
  });
});
