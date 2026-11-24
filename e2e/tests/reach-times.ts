/**
 * Reachable from here with a long time: 8 hours on foot, chosen as a person does, on the
 * desktop and on an iPhone. The streets service is the stand-in (streets.ts) for a drive;
 * on foot the walk is worked out over the terrain, of which none is installed at this
 * point here, so the card says where to get it (walking-terrain.ts walks over some).
 * Nothing reaches the internet.
 */
import type { Locator, Page, TestInfo } from "@playwright/test";
import { expect, watchForErrors } from "./fixtures";
import { installStreets, removeStreets } from "./streets";

async function picture(page: Page, info: TestInfo, name: string): Promise<void> {
  await info.attach(name, { body: await page.screenshot(), contentType: "image/png" });
  const folder = process.env.OUTPOST_E2E_SHOTS;
  if (folder) await page.screenshot({ path: `${folder}/${info.project.name}-${name}.png` });
}

export async function eightHoursOnFoot(
  page: Page,
  info: TestInfo,
  press: (target: Locator) => Promise<void>,
  /** More to check while the 8 hours are showing. */
  showing?: () => Promise<void>,
): Promise<void> {
  const errors = watchForErrors(page);
  installStreets("ready");
  try {
    await page.goto("/maps?lat=51.2965&lon=-0.3303&z=10&reach=1");
    const card = page.getByTestId("reach-card");
    await expect(card).toBeVisible({ timeout: 15_000 });
    const ways = card.getByRole("radiogroup", { name: "Way of travelling" });
    const times = card.getByRole("radiogroup", { name: "Time" });

    // By car, up to 2 hours.
    await expect(times.getByRole("radio")).toHaveText(["15 min", "30 min", "1 h", "1½ h", "2 h"].map((t) => new RegExp(`^${t}`)));
    await expect(times.getByRole("radio", { name: "2 hours" })).toBeVisible();

    // On foot, up to 8 hours: the choice is made, and the walk over the terrain is asked for, not the streets.
    await press(ways.getByRole("radio", { name: "Walk" }));
    await expect(times.getByRole("radio", { name: "8 hours" })).toBeVisible();
    const asked = page.waitForRequest(
      (request) => request.url().includes("/api/maps/walk-reach?") && request.url().includes("minutes=480"),
    );
    await press(times.getByRole("radio", { name: "8 hours" }));
    expect(new URL((await asked).url()).searchParams.get("pace")).toBe("standard");
    await expect(times.getByRole("radio", { name: "8 hours" })).toHaveAttribute("aria-checked", "true");
    // No terrain here: said, with where to get it.
    await expect(card.getByText(/No terrain is held here/)).toBeVisible({ timeout: 20_000 });
    await expect(card.getByRole("button", { name: "Get terrain in Offline maps" })).toBeVisible();

    // The six times fit the card, with room for a finger on each.
    const fits = await times.evaluate((group) => {
      const card = group.closest("[data-testid=reach-card]")!;
      const box = card.getBoundingClientRect();
      return [...group.querySelectorAll("[role=radio]")].map((radio) => {
        const r = radio.getBoundingClientRect();
        return { inside: r.left >= box.left - 1 && r.right <= box.right + 1, height: r.height, width: r.width };
      });
    });
    expect(fits).toHaveLength(6);
    for (const each of fits) expect(each.inside).toBe(true);
    const touch = info.project.name === "iphone";
    for (const each of fits) expect(Math.min(each.height, each.width)).toBeGreaterThanOrEqual(touch ? 44 : 24);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await picture(page, info, "reach-8-hours-walk");
    await showing?.();

    // Back to driving: its own time is kept, and so is the walk's when it comes back.
    await press(ways.getByRole("radio", { name: "Drive" }));
    await expect(times.getByRole("radio", { name: "30 min" })).toHaveAttribute("aria-checked", "true");
    await press(ways.getByRole("radio", { name: "Walk" }));
    await expect(times.getByRole("radio", { name: "8 hours" })).toHaveAttribute("aria-checked", "true");
  } finally {
    removeStreets();
  }
  expect(errors).toEqual([]);
}
