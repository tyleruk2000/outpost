/**
 * The grey line on a phone the width of an iPhone (390 points): the button and the time
 * control within reach of a thumb and 44 points across, nothing pushed sideways off the
 * screen, the legend clear of the coordinates and the line of sun times at the bottom,
 * and the night drawn over Britain on a December evening.
 *
 * The clock is held at 17:00 UTC on 21 December 2026, after sunset in London (15:53) and
 * before the end of astronomical twilight; the device keeps London time.
 */
import type { Locator, Page } from "@playwright/test";
import { expect, test, watchForErrors } from "./fixtures";
import { centreOf, lightnessAt, mapReady, settled } from "./grey-line";

test.use({ timezoneId: "Europe/London", viewport: { width: 390, height: 844 } });

const BRITAIN = "/maps?lat=54&lon=-2.5&z=5";

/** Whether a thing is on the screen and nothing lies over its middle: what a person could see and touch. */
async function isInReach(page: Page, locator: Locator): Promise<boolean> {
  const box = await locator.boundingBox();
  const screen = page.viewportSize();
  if (!box || !screen || box.y < 0 || box.y + box.height > screen.height || box.x < 0 || box.x + box.width > screen.width) return false;
  return locator.evaluate(
    (element, [x, y]) => {
      const top = document.elementFromPoint(x!, y!);
      return Boolean(top && (element === top || element.contains(top)));
    },
    [box.x + box.width / 2, box.y + box.height / 2],
  );
}

const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

const apart = (a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) =>
  a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y;

test("the grey line on a phone: in reach, clear of the rest, and drawn", async ({ page }) => {
  const errors = watchForErrors(page);
  await page.clock.setFixedTime(new Date("2026-12-21T17:00:00Z"));
  await page.goto(BRITAIN);
  await mapReady(page);
  const dismiss = page.getByRole("button", { name: "Dismiss" });
  if (await dismiss.isVisible()) await dismiss.tap();

  const centre = await centreOf(page);
  // Beside the cross, on the land or sea round Britain.
  const spot = { x: centre.x - 70, y: centre.y + 30 };
  const before = await lightnessAt(page, spot);

  const button = page.getByRole("button", { name: "Grey line (day and night)" });
  await expect.poll(() => isInReach(page, button)).toBe(true);
  const size = (await button.boundingBox())!;
  expect(size.width).toBeGreaterThanOrEqual(44);
  expect(size.height).toBeGreaterThanOrEqual(44);
  await button.tap();
  await expect(button).toHaveAttribute("aria-pressed", "true");

  const legend = page.getByRole("region", { name: "Grey line" });
  await expect(legend).toBeVisible();
  await expect(legend.locator("[data-grey-line-time]")).toHaveText("Now, 17:00 on Monday 21 December 2026");
  expect(await overflow(page)).toBe(0);

  // Clear of the coordinates and the line of sun times at the bottom, of the search box and of every map control.
  const box = (await legend.boundingBox())!;
  for (const other of [
    page.getByRole("button", { name: "Copy these coordinates" }),
    page.locator("[data-sun-glance]"),
    page.getByLabel("Search the map"),
    page.getByRole("button", { name: "Maidenhead locator grid" }),
    page.getByRole("button", { name: "Measure a distance" }),
    button,
  ]) {
    if ((await other.count()) === 0 || !(await other.first().isVisible())) continue;
    expect(apart(box, (await other.first().boundingBox())!), `the legend and ${other}`).toBe(true);
  }

  // Night over Britain at five in the evening in December.
  await settled(page);
  await expect.poll(async () => before - (await lightnessAt(page, spot)), { message: "darker after dark" }).toBeGreaterThan(15);

  // The time control: opened with a touch, its fields and "now" 44 points high and in reach.
  const choose = legend.getByRole("button", { name: "Choose the time it is drawn for" });
  expect((await choose.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await choose.tap();
  const time = legend.getByLabel("Time of the grey line");
  await expect.poll(() => isInReach(page, time)).toBe(true);
  expect((await time.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await time.fill("12:00");
  // Open, it is still clear of the coordinates at the bottom.
  expect(apart((await legend.boundingBox())!, (await page.getByRole("button", { name: "Copy these coordinates" }).boundingBox())!)).toBe(
    true,
  );
  await expect(legend.locator("[data-grey-line-time]")).toHaveText("Not now: drawn for 12:00 on Monday 21 December 2026");
  // Closed again to look at the map under it.
  await choose.tap();
  await settled(page);
  await expect.poll(async () => Math.abs(before - (await lightnessAt(page, spot))), { message: "midday in December" }).toBeLessThan(3);
  await choose.tap();
  const now = legend.getByRole("button", { name: "Now", exact: true });
  await expect.poll(() => isInReach(page, now)).toBe(true);
  expect((await now.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await now.tap();
  await expect(legend.locator("[data-grey-line-time]")).toHaveText("Now, 17:00 on Monday 21 December 2026");
  expect(await overflow(page)).toBe(0);
  expect(errors).toEqual([]);
});
