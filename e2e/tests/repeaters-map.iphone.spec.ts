/**
 * The Repeaters screen's map in Safari on an iPhone (WebKit, touch): every choice made by
 * a tap, as a finger makes it, not a click. Opens the list, switches to the map, taps the
 * map to measure from a point there and sees the list re-sort, finds a place by typing and
 * taps the answer, taps a repeater for its card, opens its details, and comes Back to the
 * same filters, place and view.
 */
import fs from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";
import { api, expect, test, watchForErrors } from "./fixtures";

const LIST = path.join(import.meta.dirname, "../../apps/server/test/fixtures/repeaters/etcc-status.csv");
const VIEW = { lat: 54.52, lon: -3.05, zoom: 9.5 };

/** Where a position is on screen for the view: Web Mercator, zoom 0 is one 512 px tile, the view's centre is the map's. */
function offsetOf(position: { lat: number; lon: number }): { dx: number; dy: number } {
  const world = 512 * 2 ** VIEW.zoom;
  const down = (lat: number) => (1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2;
  return { dx: ((position.lon - VIEW.lon) / 360) * world, dy: (down(position.lat) - down(VIEW.lat)) * world };
}

async function tapMap(page: Page, position: { lat: number; lon: number }) {
  const box = (await page.locator(".outpost-map").boundingBox())!;
  const { dx, dy } = offsetOf(position);
  await page.touchscreen.tap(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy);
}

const idle = (page: Page) => page.locator('.outpost-map[data-map-idle="true"]').waitFor({ timeout: 20_000 });

test.describe("repeaters on a map, on an iPhone", () => {
  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    const response = await page.request.post("/api/repeaters/import", {
      headers: { "X-Outpost-Request": "1" },
      multipart: {
        name: "North list",
        source: "A made-up society",
        dataDate: "2026-10-01",
        file: { name: "etcc-status.csv", mimeType: "text/csv", buffer: fs.readFileSync(LIST) },
      },
    });
    expect(response.ok()).toBe(true);
    await page.close();
  });

  test.afterAll(async ({ browser }) => {
    // Other tests expect a library with no repeaters in it.
    const page = await browser.newPage();
    const { lists } = await api<{ lists: Array<{ id: string }> }>(page, "GET", "/api/repeaters/overview");
    for (const list of lists) await api(page, "DELETE", `/api/repeaters/lists/${list.id}`);
    await page.close();
  });

  test("taps the map to measure from a point, opens a repeater from its pin, and comes Back to the same filters", async ({
    page,
    sealed,
  }) => {
    test.setTimeout(90_000);
    const errors = watchForErrors(page);
    await page.goto(`/radio/repeaters?map=${VIEW.lat},${VIEW.lon},${VIEW.zoom}`);
    await expect(page.getByRole("heading", { name: "Repeaters", level: 1 })).toBeVisible();

    // A drop-down chosen by a tap: two metres.
    await page.getByRole("combobox", { name: "Band" }).tap();
    await page.getByRole("option", { name: /^2 m \(2\)/ }).tap();
    await expect(page.getByRole("combobox", { name: "Band" })).toHaveText(/2 m \(2\)/);

    // The map, and a tap on it where there is no repeater: the list is measured from there.
    await page.getByRole("radio", { name: "Map" }).tap();
    await idle(page);
    await expect(page.getByRole("list", { name: "What the shapes mean" })).toContainText("70 cm");
    await tapMap(page, { lat: 54.45, lon: -2.95 });
    const heading = page.locator("#repeaters-results");
    await expect(heading).toHaveText(/2 repeaters of 6, nearest to a point on the map \(54\.4\d, -2\.9\d\) first/);
    await expect(page.getByRole("combobox", { name: "Measure from" })).toHaveText(/A point on the map \(54\.4\d, -2\.9\d\)/);

    // The list, re-sorted from the point, each with its distance.
    await page.getByRole("radio", { name: "List" }).tap();
    const rows = page.getByRole("list", { name: "Repeaters" }).getByRole("listitem");
    await expect(rows).toHaveCount(2);
    await expect(rows.first()).toContainText(/QZ3AB.*145\.6625 MHz.*\d+(\.\d+)? km, \d+° [NESW]+/s);

    // Back on the map, a tap on a repeater's pin opens its card.
    await page.getByRole("radio", { name: "Map" }).tap();
    await idle(page);
    await tapMap(page, { lat: 54.521, lon: -3.123 });
    const card = page.locator(".outpost-map-card").filter({ has: page.getByRole("heading", { name: "QZ3AB", exact: true }) });
    await expect(card).toContainText("145.6625 MHz, shift -0.6 MHz");
    await expect(card).toContainText(/km, \d+° [NESW]+ \(true\) from a point on the map/);

    // Its details, and Back: the same band, place and view.
    await card.getByRole("link", { name: "Details" }).tap();
    await expect(page.getByRole("heading", { name: "QZ3AB", level: 1 })).toBeVisible();
    await page.goBack();
    await expect(page.getByRole("combobox", { name: "Band" })).toHaveText(/2 m \(2\)/);
    await expect(heading).toHaveText(/2 repeaters of 6, nearest to a point on the map \(54\.4\d, -2\.9\d\) first/);
    await expect(page.getByRole("radio", { name: "Map" })).toHaveAttribute("data-state", "on");
    await expect(card).toBeVisible();

    // Another place, found by typing, its answer chosen by a tap.
    await page.getByRole("combobox", { name: "Measure from" }).tap();
    await page.getByRole("option", { name: "Search for a place…" }).tap();
    await page.getByLabel("Place to measure from").fill("IO84JL");
    await page.getByRole("button", { name: /IO84JL/ }).tap();
    await expect(heading).toHaveText(/nearest to IO84JL first/);

    expect(errors).toEqual([]);
    expect(sealed.external).toEqual([]);
  });
});
