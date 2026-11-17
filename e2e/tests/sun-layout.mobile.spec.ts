/**
 * Sun times that can be found and read on a phone.
 *
 * Two things went wrong on a real phone that a test at one size, at the usual text size,
 * on a screen with no home indicator, did not see: the names on the lowered sheet lay
 * under the bar at the bottom of the screen, and with larger text the last of them, Sun,
 * was off the edge of a row that gave no sign it scrolled. So these run at 320, 375 and
 * 390 pixels wide, with the text at its usual size and enlarged, and with the inset at
 * the bottom of the screen that a phone with a home indicator reports.
 *
 * The inset is the browser's own, set through its developer protocol; larger text is
 * stood in for by a larger root font size. Neither is a real iPhone, which these were
 * not tried on.
 */
import type { Locator, Page } from "@playwright/test";
import { api, expect, test, watchForErrors } from "./fixtures";

test.use({ timezoneId: "Europe/London" });

const GREENWICH = "/maps?lat=51.48&lon=0&z=9";
const SIZES = [
  { width: 320, height: 568 },
  { width: 375, height: 667 },
  { width: 390, height: 664 },
];

/** Whether a thing is on the screen and nothing lies over its middle: what a person could see and touch. */
async function isInReach(page: Page, locator: Locator): Promise<boolean> {
  const box = await locator.boundingBox();
  const screen = page.viewportSize();
  if (!box || !screen || box.x < 0 || box.x + box.width > screen.width + 0.5 || box.y < 0 || box.y + box.height > screen.height + 0.5)
    return false;
  return locator.evaluate(
    (element, [x, y]) => {
      const top = document.elementFromPoint(x!, y!);
      return Boolean(top && (element === top || element.contains(top)));
    },
    [box.x + box.width / 2, box.y + box.height / 2],
  );
}
const expectInReach = (page: Page, locator: Locator, what?: string) => expect.poll(() => isInReach(page, locator), what).toBe(true);

const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

/** One of the day's times, by the name written over or beside it. */
const time = (page: Page, label: string) =>
  page
    .locator("dl > div")
    .filter({ has: page.getByText(label, { exact: true }) })
    .locator("dd");

/** The inset a phone with a home indicator reports at the bottom of the screen. */
async function bottomInset(page: Page, pixels: number): Promise<void> {
  const session = await page.context().newCDPSession(page);
  await session.send("Emulation.setSafeAreaInsetsOverride" as never, { insets: { bottom: pixels } } as never);
  // The page has to see it, or the test would pass by not testing anything.
  await expect
    .poll(() =>
      page.evaluate(() => {
        const probe = document.createElement("div");
        probe.style.cssText = "position:fixed;height:env(safe-area-inset-bottom,0px);width:1px;visibility:hidden";
        document.body.append(probe);
        const height = probe.getBoundingClientRect().height;
        probe.remove();
        return height;
      }),
    )
    .toBe(pixels);
}

/** Larger text: every size the app sets in rem grows with it. */
const largerText = (page: Page, rootPixels: number) =>
  page.addInitScript((size) => {
    const apply = () => document.documentElement.style.setProperty("font-size", `${size}px`, "important");
    if (document.documentElement) apply();
    document.addEventListener("DOMContentLoaded", apply);
  }, rootPixels);

async function openMaps(page: Page): Promise<void> {
  await page.goto(GREENWICH);
  await expect(page.locator("canvas").first()).toBeVisible({ timeout: 15_000 });
  // The card that offers a first map is not what these are about, and on a small screen it covers most of the map.
  // On the smallest screens with the largest text its close button is off the top of the map; it is then left
  // where it is, which is what a person there has too.
  const dismiss = page.getByRole("button", { name: "Dismiss" });
  await expect(dismiss.or(page.getByRole("tab", { name: "Sun" })).first()).toBeVisible();
  // Only touched where a finger could reach it: asked to tap something off the screen, the browser would scroll
  // the map's own box to bring it into view, which no person can do.
  if ((await dismiss.isVisible()) && (await isInReach(page, dismiss))) await dismiss.tap();
}

/** The middle of the cross that marks the centre of the map. */
async function crossAt(page: Page): Promise<{ x: number; y: number }> {
  const box = (await page.locator("[data-centre-mark]").boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

const TABS = [/^Places/, /^Routes/, "Offline maps", "Sun"] as const;

test.describe("sun times on a phone", () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(new Date("2026-06-21T09:00:00Z"));
    for (const marker of (await api(page, "GET", "/api/maps/markers")).markers) await api(page, "DELETE", `/api/maps/markers/${marker.id}`);
  });

  test("are on the screen when Maps opens, in words, without opening or finding anything", async ({ page }) => {
    const errors = watchForErrors(page);
    await openMaps(page);

    // Under the coordinates of the centre, above the lowered sheet: today's sunrise and sunset.
    const line = page.getByRole("button", { name: /^Today at the centre of the map: Sunrise 04:43, Sunset 21:21\./ });
    await expect(line).toBeVisible();
    await expectInReach(page, line);
    await expectInReach(page, line.getByText("Sunrise 04:43", { exact: true }));
    await expectInReach(page, line.getByText("Sunset 21:21", { exact: true }));
    const box = (await line.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44);
    // The same point as the readout it sits under, and the one the cross marks.
    const readout = page.getByRole("button", { name: "Copy these coordinates" });
    await expect(readout).toContainText("Centre");
    await expect(readout).toContainText("51.4800, 0.0000");
    expect(Math.abs((await readout.boundingBox())!.x - box.x)).toBeLessThanOrEqual(1);
    await expect(page.locator("[data-centre-mark]")).toBeVisible();
    const cross = await crossAt(page);
    const sheet = (await page.getByRole("button", { name: /^Panel height: lowered/ }).boundingBox())!;
    expect(cross.y, "the cross is on the part of the map that shows").toBeLessThan(box.y);
    expect(cross.y).toBeLessThan(sheet.y);

    // One touch opens the rest of the day, with the sheet raised to show it.
    await line.tap();
    await expect(page.getByRole("tab", { name: "Sun" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("button", { name: /^Panel height: half/ })).toBeVisible();
    await expect(time(page, "Sunrise")).toHaveText("04:43");
    await expectInReach(page, time(page, "Sunrise"));
    await expectInReach(page, time(page, "Sunset"));
    // The line itself steps aside while the sheet is raised: the map keeps what room there is.
    await expect(line).toBeHidden();
    // The centre has not moved for being looked at: the same point, still marked, above the sheet.
    await expect(page.getByRole("button", { name: "Copy coordinates 51.4800, 0.0000" })).toBeAttached();
    const raised = (await page.getByRole("button", { name: /^Panel height: half/ }).boundingBox())!;
    await expect(page.locator("[data-centre-mark]")).toBeVisible();
    await expect.poll(async () => (await crossAt(page)).y).toBeLessThan(raised.y - 40);
    expect(await overflow(page)).toBeLessThanOrEqual(1);
    expect(errors).toEqual([]);
  });

  test("set sunrise and sunset largest, first and last light next, and the rest quieter beneath", async ({ page }) => {
    const errors = watchForErrors(page);
    await openMaps(page);
    await page.getByRole("tab", { name: "Sun" }).tap();
    await page.getByRole("button", { name: /^Panel height: half/ }).tap();
    await expect(page.getByRole("button", { name: /^Panel height: full/ })).toBeVisible();
    // The sheet takes a moment to finish rising; nothing is measured until it has come to rest.
    let before = -1;
    await expect
      .poll(async () => {
        const now = (await time(page, "Sunrise").boundingBox())!.y;
        const still = now === before;
        before = now;
        return still;
      })
      .toBe(true);

    const figures = (label: string) => time(page, label).locator(".tabular").first();
    const style = (locator: Locator) =>
      locator.evaluate((element) => {
        const computed = getComputedStyle(element);
        return { size: Number.parseFloat(computed.fontSize), weight: Number(computed.fontWeight), numeric: computed.fontVariantNumeric };
      });
    const [sunrise, sunset, first, last, noon] = await Promise.all(
      ["Sunrise", "Sunset", "First light (civil dawn)", "Last light (civil dusk)"]
        .map((label) => style(figures(label)))
        .concat(style(time(page, "Solar noon"))),
    );
    // 34 pixels for the two times most people came for; 23 for first and last light; 14 for everything else.
    expect(sunrise!.size).toBeGreaterThanOrEqual(32);
    expect(sunset!.size).toBe(sunrise!.size);
    expect(first!.size).toBeGreaterThanOrEqual(21);
    expect(first!.size).toBeLessThan(sunrise!.size);
    expect(last!.size).toBe(first!.size);
    expect(noon!.size).toBeLessThan(first!.size);
    expect(sunrise!.weight).toBeGreaterThanOrEqual(600);
    // The app's tabular figures: a 1 as wide as a 0, so the times line up and do not jump as the day is stepped.
    for (const figure of [sunrise, sunset, first, last, noon]) expect(figure!.numeric).toContain("tabular-nums");

    // In that order down the screen, with the date control between the times and the quieter list.
    const top = async (locator: Locator) => (await locator.boundingBox())!.y;
    const order = [
      await top(time(page, "Sunrise")),
      await top(time(page, "First light (civil dawn)")),
      await top(page.getByLabel("Date", { exact: true })),
      await top(time(page, "Solar noon")),
      await top(time(page, "Rises towards")),
      await top(time(page, "Day length")),
      await top(time(page, "Moon")),
    ];
    expect(order).toEqual([...order].sort((a, b) => a - b));
    // Sunrise beside sunset, first light beside last light.
    expect(Math.abs((await top(time(page, "Sunrise"))) - (await top(time(page, "Sunset"))))).toBeLessThanOrEqual(1);
    expect(
      Math.abs((await top(time(page, "First light (civil dawn)"))) - (await top(time(page, "Last light (civil dusk)")))),
    ).toBeLessThanOrEqual(1);
    // Nothing is lost for having moved: the bearings, noon and its height, the day's length, the twilight, the moon.
    await expect(time(page, "Rises towards")).toHaveText("49° NE");
    await expect(time(page, "Sets towards")).toHaveText("311° NW");
    await expect(time(page, "Solar noon")).toHaveText(/13:02\s*sun 62° up/);
    await expect(time(page, "Day length")).toContainText("16 h 38 min");
    await expect(time(page, "Nautical twilight")).toHaveText("02:41 to 23:23");
    await expect(time(page, "Moon")).toHaveText("First quarter, 46% lit");

    // Touch-sized: the arrows either side of the date.
    for (const name of ["The day before", "The day after"]) {
      const box = (await page.getByRole("button", { name }).boundingBox())!;
      expect(box.width, name).toBeGreaterThanOrEqual(44);
      expect(box.height, name).toBeGreaterThanOrEqual(44);
    }
    expect(errors).toEqual([]);
  });

  for (const size of SIZES) {
    test(`fit a screen ${size.width} pixels wide: every name on the sheet, the line under the readout, and the two times whole`, async ({
      page,
    }) => {
      await page.setViewportSize(size);
      const errors = watchForErrors(page);
      await openMaps(page);
      for (const name of TABS) await expectInReach(page, page.getByRole("tab", { name }), `the ${String(name)} tab`);
      await expectInReach(page, page.locator("[data-sun-glance]"), "today's sunrise and sunset under the readout");
      expect(await overflow(page)).toBeLessThanOrEqual(1);

      await page.getByRole("tab", { name: "Sun" }).tap();
      // With the sheet half raised, sunrise and sunset are both on the screen, whole.
      for (const label of ["Sunrise", "Sunset"]) {
        await expect(time(page, label)).toHaveText(/^\d\d:\d\d$/);
        await expectInReach(page, time(page, label), label);
      }
      // Nothing in the tab is cut off at the side, in either clock or in UTC, which is the widest.
      const clipped = () =>
        page.evaluate(() => {
          const panel = document.querySelector('[role="tabpanel"]:not([hidden])');
          if (!panel) return ["no panel"];
          const edge = panel.getBoundingClientRect().right;
          // Not the line kept for screen readers, which is clipped to nothing on purpose.
          return [...panel.querySelectorAll("dt, dd, dd *, p:not(.sr-only), button")]
            .filter(
              (element) =>
                element.getBoundingClientRect().right > edge + 0.5 ||
                (element as HTMLElement).scrollWidth > (element as HTMLElement).clientWidth + 1,
            )
            .map((element) => `${element.tagName}: ${element.textContent?.slice(0, 40)}`);
        });
      expect(await clipped()).toEqual([]);
      const utc = page.getByRole("radio", { name: "UTC" });
      await utc.scrollIntoViewIfNeeded();
      await utc.tap();
      await expect(time(page, "Sunrise")).toHaveText("03:43 UTC");
      await expect(time(page, "Last light (civil dusk)")).toHaveText("21:09 UTC");
      expect(await clipped()).toEqual([]);
      // Side by side still, not pushed one under the other.
      expect(Math.abs((await time(page, "Sunrise").boundingBox())!.y - (await time(page, "Sunset").boundingBox())!.y)).toBeLessThanOrEqual(
        1,
      );
      expect(await overflow(page)).toBeLessThanOrEqual(1);
      expect(errors).toEqual([]);
    });
  }

  for (const size of SIZES) {
    test(`put the five names on the sheet on one line at ${size.width} pixels wide`, async ({ page }) => {
      await page.setViewportSize(size);
      await openMaps(page);
      await expect(page.getByRole("tab", { name: "Sun" })).toBeVisible();
      const tops = await page.getByRole("tab").evaluateAll((tabs) => tabs.map((tab) => Math.round(tab.getBoundingClientRect().top)));
      expect(tops).toHaveLength(5);
      expect(new Set(tops).size, `tabs at ${tops.join(", ")}`).toBe(1);
    });

    for (const root of [20, 24]) {
      test(`keep every name on the sheet in reach at ${size.width} pixels wide with the text at ${root} pixels`, async ({ page }) => {
        await page.setViewportSize(size);
        await largerText(page, root);
        const errors = watchForErrors(page);
        await openMaps(page);
        expect(await page.evaluate(() => Number.parseFloat(getComputedStyle(document.documentElement).fontSize))).toBe(root);
        // None is off the edge and none is under the bar at the bottom, on one line or two.
        for (const name of TABS) await expectInReach(page, page.getByRole("tab", { name }), `the ${String(name)} tab`);
        const list = page.getByRole("tablist");
        expect(
          await list.evaluate((element) => element.scrollWidth - element.clientWidth),
          "the row of names does not scroll",
        ).toBeLessThanOrEqual(1);
        await expectInReach(page, page.locator("[data-sun-glance]"), "today's sunrise and sunset under the readout");
        await expect(page.locator("[data-sun-glance]")).toContainText("Sunrise 04:43");
        await expect(page.locator("[data-sun-glance]")).toContainText("Sunset 21:21");

        await page.getByRole("tab", { name: "Sun" }).tap();
        await expect(page.getByRole("tab", { name: "Sun" })).toHaveAttribute("aria-selected", "true");
        await expect(time(page, "Sunrise")).toHaveText("04:43");
        expect(await overflow(page)).toBeLessThanOrEqual(1);
        expect(errors).toEqual([]);
      });
    }
  }

  for (const size of SIZES) {
    test(`keep the sheet clear of the bar at the bottom on a ${size.width} pixel phone with a home indicator`, async ({ page }) => {
      await page.setViewportSize(size);
      const errors = watchForErrors(page);
      await openMaps(page);
      await bottomInset(page, 34);
      // The bar at the bottom is taller by the inset, and nothing of the sheet is under it.
      const bar = (await page.getByRole("navigation", { name: "Main" }).boundingBox())!;
      expect(bar.height).toBeGreaterThanOrEqual(34 + 44);
      for (const name of TABS) {
        const tab = page.getByRole("tab", { name });
        await expectInReach(page, tab, `the ${String(name)} tab`);
        const box = (await tab.boundingBox())!;
        expect(box.y + box.height, `the foot of the ${String(name)} tab`).toBeLessThanOrEqual(bar.y + 0.5);
      }
      await expectInReach(page, page.locator("[data-sun-glance]"));
      await page.getByRole("tab", { name: "Sun" }).tap();
      await expect(time(page, "Sunrise")).toHaveText("04:43");
      await expectInReach(page, time(page, "Sunrise"));
      expect(errors).toEqual([]);
    });
  }

  test.describe("on a phone that uses the 12-hour clock", () => {
    test.use({ locale: "en-US" });

    test("fit 320 pixels with am and pm small beside the figures", async ({ page }) => {
      await page.setViewportSize({ width: 320, height: 568 });
      const errors = watchForErrors(page);
      await openMaps(page);
      await expect(page.locator("[data-sun-glance]")).toContainText("Sunrise 4:43 am");
      await expectInReach(page, page.locator("[data-sun-glance]"));
      await page.getByRole("tab", { name: "Sun" }).tap();
      await expect(time(page, "Sunrise")).toHaveText("4:43 am");
      await expect(time(page, "Sunset")).toHaveText("9:21 pm");
      await expectInReach(page, time(page, "Sunrise"));
      await expectInReach(page, time(page, "Sunset"));
      const sizes = await time(page, "Sunset").evaluate((element) =>
        [...element.querySelectorAll("span span")].map((span) => [
          span.textContent?.trim(),
          Number.parseFloat(getComputedStyle(span).fontSize),
        ]),
      );
      expect(sizes).toEqual([
        ["9:21", 34],
        ["pm", 14],
      ]);
      expect(Math.abs((await time(page, "Sunrise").boundingBox())!.y - (await time(page, "Sunset").boundingBox())!.y)).toBeLessThanOrEqual(
        1,
      );
      expect(await overflow(page)).toBeLessThanOrEqual(1);
      expect(errors).toEqual([]);
    });
  });

  test("are pointed to from an empty Places tab, for someone who looks for them there", async ({ page }) => {
    const errors = watchForErrors(page);
    await openMaps(page);
    await page.getByRole("tab", { name: /^Places/ }).tap();
    await expect(page.getByRole("heading", { name: "No saved places yet" })).toBeVisible();
    const pointer = page.getByText(/Sunrise and sunset do not need a saved place\./);
    await pointer.scrollIntoViewIfNeeded();
    await expect(pointer).toBeVisible();
    await page.getByRole("button", { name: "Show sun times" }).tap();
    await expect(page.getByRole("tab", { name: "Sun" })).toHaveAttribute("aria-selected", "true");
    await expect(time(page, "Sunrise")).toHaveText("04:43");
    expect(errors).toEqual([]);
  });
});
