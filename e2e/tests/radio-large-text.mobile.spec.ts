/**
 * The radio screens on a 390 px phone with the text at 150% and at 200% (a root font size
 * of 24 and 32 px): none is wider than the screen. Long badges and buttons wrap, the
 * prosign table and a plan's table of shares scroll in their own box, and the Morse
 * trainer's step buttons keep a finger's size. The phone's bottom bar is the shell's, and
 * is left out at 200%, where its five names do not fit.
 */
import type { Locator, Page } from "@playwright/test";
import { api, expect, test, watchForErrors } from "./fixtures";

test.use({ viewport: { width: 390, height: 844 } });

/** What reaches past the right of the screen, outside the bottom bar; nothing when the page does not scroll sideways. */
function tooWide(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    return (
      [...document.querySelectorAll("main *")]
        .filter((element) => !element.closest("svg") || element.tagName.toLowerCase() === "svg")
        // A table kept for screen readers (sr-only: a box of one pixel that hides what overflows it) is out of sight on purpose.
        .filter((element) => {
          for (let box: Element | null = element; box && box !== document.body; box = box.parentElement) {
            if (box.getBoundingClientRect().width <= 1 && getComputedStyle(box).overflow === "hidden") return false;
          }
          return true;
        })
        .filter((element) => {
          // Inside a box that scrolls sideways, or in text cut short with an ellipsis on purpose, and that box within
          // the screen, is not past the edge. Anything else clipped is: words cut off are as lost as words off screen.
          for (let parent = element.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
            const style = getComputedStyle(parent);
            if (/auto|scroll/.test(style.overflowX) || style.textOverflow === "ellipsis")
              return parent.getBoundingClientRect().right > width + 1;
          }
          return true;
        })
        .map((element) => ({ element, box: element.getBoundingClientRect() }))
        .filter(({ box }) => box.width > 0 && box.right > width + 1)
        .slice(0, 5)
        .map(
          ({ element, box }) =>
            `${element.tagName.toLowerCase()} "${(element.textContent ?? "").trim().slice(0, 40)}" to ${Math.round(box.right)}`,
        )
    );
  });
}

const dipole = { kind: "horizontal-dipole", heightM: 5, ground: "average", broadsideDeg: null, gainDb: 0, feedlineLossDb: 0 };
const station = (id: string, name: string, lat: number, lon: number) => ({
  id,
  name,
  lat,
  lon,
  powerWatts: 5,
  antenna: dipole,
  antennaName: "Low horizontal dipole, 5 m",
  noise: "residential",
});

for (const size of ["24px", "32px"]) {
  test(`the radio screens fit a phone with the root text at ${size}`, async ({ page }) => {
    test.setTimeout(180_000);
    const errors = watchForErrors(page);
    await page.addInitScript((value) => {
      const apply = () => document.documentElement.style.setProperty("font-size", value, "important");
      if (document.documentElement) apply();
      document.addEventListener("DOMContentLoaded", apply);
    }, size);
    await page.goto("/");
    const { plan } = await api(page, "POST", "/api/radio/communication-plans", {
      name: "Large text plan",
      notes: "",
      stations: [station("a", "Car park", 54.45, -3.02), station("b", "Summit shelter", 54.53, -3.21)],
      date: "2026-11-16",
      fromUtc: 8,
      toUtc: 16,
      bands: ["80m", "40m"],
      mode: "ssb",
      requiredSnrDb: null,
      referenceBandwidthHz: null,
      solar: { source: "table" },
      links: [],
    });
    try {
      // Worked out before the screens are walked, with time for a cold start of the engine (a request's own limit is 30 s).
      const matrix = await page.request.post(`/api/radio/communication-plans/${plan.id}/matrix`, {
        headers: { "X-Outpost-Request": "1" },
        timeout: 120_000,
      });
      expect(matrix.ok(), await matrix.text()).toBe(true);
      // What shows each screen is ready. Waited for a while, not for the whole of the test's time: a name changed on a
      // screen (the On the air callsign field, 21 Nov 2026) once left the wait to run out the test's three minutes,
      // which read as the plan's matrix taking too long.
      const screens: Array<[string, () => Locator]> = [
        ["/radio/propagation", () => page.getByRole("button", { name: /choose on the map/ }).first()],
        ["/radio/coverage", () => page.getByRole("link", { name: "One path, in the planner" })],
        [`/radio/plans/${plan.id}`, () => page.getByText(/share of days$/).first()],
        ["/radio/repeaters", () => page.getByRole("button", { name: /Import the file from/ }).first()],
        ["/radio/morse?tab=receive", () => page.getByRole("group", { name: "Koch lesson" })],
        ["/radio/morse?tab=send", () => page.getByRole("group", { name: "Keyer speed" })],
        // With no radio licence set in Settings, the callsign is one to practise with.
        ["/radio/morse?tab=rbn", () => page.getByLabel("A callsign to practise with")],
        ["/radio/morse?tab=reference", () => page.getByRole("region", { name: "Table of prosigns" })],
        ["/radio/frequencies", () => page.getByText("Only some of the time, or when activated").first()],
      ];
      for (const [address, ready] of screens) {
        await page.goto(address);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        await expect(ready(), `what shows ${address} is ready`).toBeVisible({ timeout: 20_000 });
        expect(await tooWide(page), `${address} at ${size}`).toEqual([]);
      }
      // An icon-only step button is a finger's size, not the text's.
      await page.goto("/radio/morse?tab=receive");
      const step = (await page.getByRole("button", { name: "Increase koch lesson" }).boundingBox())!;
      expect(Math.round(step.width)).toBe(44);
    } finally {
      await api(page, "DELETE", `/api/radio/communication-plans/${plan.id}`);
    }
    expect(errors).toEqual([]);
  });
}
