/**
 * Plan a route's ways of travelling and Reachable from here, with and without the optional
 * streets service. The service is a stand-in answering with replies recorded from a real
 * Valhalla serving Great Britain (streets.ts); the road networks are the made-up channel
 * trip (road-routes.ts). Nothing is downloaded and nothing reaches the internet.
 */
import type { Page } from "@playwright/test";
import { accessibilityInBothThemes } from "./a11y";
import { api, expect, test, watchForErrors } from "./fixtures";
import { choosePlace, installChannelTrip, removeChannelTrip } from "./road-routes";
import { installStreets, removeStreets } from "./streets";

const openPlanner = async (page: Page, at = "lat=51.2&lon=0.5&z=8") => {
  await page.goto(`/maps?${at}`);
  await expect(page.locator("canvas").first()).toBeVisible({ timeout: 15_000 });
  await page.getByRole("tab", { name: /Routes/ }).click();
  await page.getByRole("button", { name: "Plan a route" }).first().click();
  await expect(page.getByRole("heading", { name: "Plan a route", exact: true })).toBeVisible();
};

test.describe("street routes", () => {
  test("without the streets service: one way, one line saying how to add the others, and a drive's reach on main roads", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const errors = watchForErrors(page);
    removeStreets();
    await page.goto("/");
    const places = await installChannelTrip(page);
    try {
      await openPlanner(page);
      await expect(page.getByText(/come with an optional add-on for the streets/)).toBeVisible();
      await expect(page.getByRole("radiogroup", { name: "Way of travelling" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Plan route" })).toBeVisible();

      // Map data has no streets row, and says once what the add-on is and how to turn it on.
      await page.goto("/maps/data");
      await expect(page.getByRole("list", { name: "Map data for United Kingdom" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Streets for routes" })).toHaveCount(0);
      await expect(page.getByText(/come with an optional add-on, not part of this installation/)).toBeVisible();
      await expect(page.getByRole("link", { name: "How to turn it on" })).toHaveAttribute("href", "/help/deployment#h-street-routes");

      // Reachable from here still works for a drive, over the main roads, and says so.
      await page.goto("/maps?lat=51.296&lon=-0.33&z=10&reach=1");
      const card = page.getByTestId("reach-card");
      await expect(card.getByRole("list", { name: "Legend" })).toContainText("Within 15 min", { timeout: 20_000 });
      await expect(card.getByRole("list", { name: "Legend" })).toContainText("Within 30 min");
      await expect(card.getByText("Main roads only")).toBeVisible();
      await expect(card.getByText(/Free-flowing traffic, no stops/)).toBeVisible();
      await expect(card.getByRole("radiogroup", { name: "Way of travelling" })).toHaveCount(0);
    } finally {
      await removeChannelTrip(page, places);
    }
    expect(errors).toEqual([]);
  });

  test("with streets: door to door with the owner's lines and the turns at each end, a walk, 30 minutes' reach, and Map data's row", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const errors = watchForErrors(page);
    await page.goto("/");
    const places = await installChannelTrip(page);
    const doors: string[] = [];
    for (const place of [
      { name: "Fetcham", lat: 51.2905, lon: -0.3555 },
      { name: "Dover door", lat: 51.1265, lon: 1.3135 },
      { name: "Box Hill", lat: 51.2556, lon: -0.3106 },
    ])
      doors.push((await api<{ marker: { id: string } }>(page, "POST", "/api/maps/markers", place)).marker.id);
    try {
      // Installed with no streets yet: the row offers to add them, and the dialog asks for a kept country file first.
      installStreets("none");
      await page.goto("/maps/data");
      const gb = page.getByRole("list", { name: "Map data for United Kingdom" });
      await expect(gb.getByRole("heading", { name: "Streets for routes" })).toBeVisible();
      await gb.getByRole("button", { name: "Add: streets for routes" }).click();
      const dialog = page.getByRole("dialog", { name: "Add streets for routes" });
      await expect(dialog.getByRole("button", { name: "Keep a country file" })).toBeVisible();
      await dialog.getByRole("button", { name: "Cancel" }).click();

      // A way that cannot be used yet says why, with the step that puts it right.
      await openPlanner(page);
      await page.getByRole("radiogroup", { name: "Way of travelling" }).getByRole("radio", { name: "Walk" }).click();
      await expect(page.getByText(/This needs streets for routes/)).toBeVisible();
      await expect(page.getByRole("button", { name: /^Add streets for/ })).toBeVisible();

      // Streets for Great Britain ready.
      installStreets("ready");
      await page.goto("/maps/data");
      await expect(gb.getByText("Streets for routes: Great Britain")).toBeVisible();

      await openPlanner(page);
      const ways = page.getByRole("radiogroup", { name: "Way of travelling" });
      await ways.getByRole("radio", { name: "Door to door" }).click();
      await choosePlace(page, "From", "Fetcham");
      await choosePlace(page, "To", "Dover door");
      await page.getByRole("button", { name: "Plan route" }).click();
      await expect(page.getByRole("heading", { name: "Fetcham to Dover door" })).toBeVisible({ timeout: 60_000 });
      const directions = page.getByRole("list", { name: "Directions" });
      for (const line of ["M25", "M20 - Folkestone", "A20 - Dover"])
        await expect(directions.getByText(line, { exact: true })).toBeVisible();
      const start = directions.getByTestId("door-start");
      await expect(start).toContainText(/From your door to .*\d+ turns?, [\d.]+ (km|m)/);
      await expect(start.getByText("Drive north-east on Bell Lane")).toBeHidden();
      await start.getByText(/From your door to/).click();
      await expect(start.getByText("Drive north-east on Bell Lane")).toBeVisible();
      await expect(directions.getByTestId("door-end")).toContainText(/to your door/);
      expect(await accessibilityInBothThemes(page, "/maps (door to door)")).toEqual([]);
      const text = await page.getByLabel("The route as plain text").inputValue();
      expect(text).toContain("Drive north-east on Bell Lane");
      expect(text).toContain("M20 - Folkestone");
      expect(Math.max(...text.split("\n").map((line) => line.length))).toBeLessThanOrEqual(48);

      // A walk between the same points (the stand-in answers every walk with Leatherhead to Box Hill): a short list of plain turns.
      await page.getByRole("button", { name: "Change the route" }).click();
      await ways.getByRole("radio", { name: "Walk" }).click();
      await expect(page.getByText("Dover door")).toBeVisible();
      await page.getByRole("button", { name: "Plan route" }).click();
      const walk = page.getByRole("list", { name: "Directions" });
      await expect(walk.getByText("Take the steps").first()).toBeVisible({ timeout: 30_000 });
      await expect(walk.getByText("Turn left onto Church Street (B2450)")).toBeVisible();
      await expect(page.getByText(/walking\./)).toBeVisible();

      // Reachable from here, from the menu at a point: 30 minutes' drive, from the streets.
      await page.goto("/maps?lat=51.2965&lon=-0.3303&z=10");
      await expect(page.locator("canvas").first()).toBeVisible({ timeout: 15_000 });
      const map = (await page.locator(".outpost-map").boundingBox())!;
      await page.mouse.click(map.x + map.width / 2, map.y + map.height / 2, { button: "right" });
      const asked = page.waitForRequest((request) => request.url().endsWith("/api/streets/reach"));
      await page.getByRole("menuitem", { name: "Reachable from here" }).click();
      const card = page.getByTestId("reach-card");
      await card.getByRole("radiogroup", { name: "Way of travelling" }).getByRole("radio", { name: "Drive" }).click();
      await card.getByRole("radiogroup", { name: "Time" }).getByRole("radio", { name: "30 min" }).click();
      expect((await asked).postDataJSON()).toMatchObject({ mode: "drive" });
      const legend = card.getByRole("list", { name: "Legend" });
      await expect(legend).toContainText("Within 15 min", { timeout: 20_000 });
      await expect(legend).toContainText("Within 30 min");
      await expect(card.getByText("Streets", { exact: true })).toBeVisible();
      await expect(card.getByText(/Free-flowing traffic, no stops/)).toBeVisible();
      expect(await accessibilityInBothThemes(page, "/maps (reachable from here)")).toEqual([]);
    } finally {
      removeStreets();
      for (const id of doors) await api(page, "DELETE", `/api/maps/markers/${id}`);
      await removeChannelTrip(page, places);
    }
    expect(errors).toEqual([]);
  });
});
