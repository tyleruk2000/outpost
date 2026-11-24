/**
 * Weather and hazards on a phone: opening it fetches nothing while "also update when I
 * open this screen" is off; a saved place is chosen with its warning region picked from
 * a drop-down; Update now fetches from the stand-in publishers (e2e/tools/fake-dist.mjs,
 * recorded answers) and every copy says how old it is; river and sea levels are fetched
 * on a press, and a station's last days on another; and barometer readings give a
 * tendency in the Met Office's words.
 */
import { api, expect, test, watchForErrors } from "./fixtures";

test.use({ viewport: { width: 390, height: 844 } });

async function clear(page: import("@playwright/test").Page) {
  const { places } = await api(page, "GET", "/api/weather");
  for (const place of places as Array<{ id: string }>) await api(page, "DELETE", `/api/weather/places/${place.id}`);
  const { kept } = await api(page, "GET", "/api/weather");
  for (const copy of kept as Array<{ id: string }>) await api(page, "DELETE", `/api/weather/kept/${copy.id}`);
  const { readings } = await api(page, "GET", "/api/weather/readings");
  for (const reading of readings as Array<{ id: string }>) await api(page, "DELETE", `/api/weather/readings/${reading.id}`);
  await api(page, "PUT", "/api/weather/options", { updateOnOpen: false });
}

test.describe("Weather and hazards on a phone", () => {
  // The place marked as a home is taken away again: left behind, it was where every later test's "home" was, and Maps'
  // Nearest measured from it rather than from the middle of the map.
  let marker: string | undefined;
  test.afterEach(async ({ page }) => {
    if (marker) await api(page, "DELETE", `/api/maps/markers/${marker}`);
    marker = undefined;
  });

  test("fetches nothing on opening, then fetches on a press and says how old each copy is", async ({ page }) => {
    const errors = watchForErrors(page);
    const updates: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/api/weather/update")) updates.push(request.method());
    });
    await page.goto("/");
    await clear(page);
    marker = (
      await api<{ marker: { id: string } }>(page, "POST", "/api/maps/markers", {
        name: "Weather home",
        lat: 52.13,
        lon: -0.46,
        icon: "home",
      })
    ).marker.id;

    // Reached from the More sheet, under Preparedness.
    await page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: "More" }).tap();
    // The screens under Preparedness are folded away until asked for.
    await page.getByRole("dialog", { name: "More" }).getByRole("button", { name: "Show the screens under Preparedness" }).tap();
    await page.getByRole("dialog", { name: "More" }).locator('a[href="/prepare/weather"]').first().tap();
    await expect(page.getByRole("heading", { level: 1, name: "Weather and hazards" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Choose a place for forecasts" })).toBeVisible();
    await expect(page.getByRole("checkbox", { name: "Also update when I open this screen" })).not.toBeChecked();
    // With the tick off, opening the screen asks nobody for anything.
    await page.waitForTimeout(500);
    expect(updates).toEqual([]);
    expect((await api(page, "GET", "/api/weather")).kept).toEqual([]);

    // A saved place, and its warning region from the drop-down.
    // Home is offered in one press; another place is chosen under Places.
    await expect(page.getByRole("button", { name: "Use Weather home" })).toBeVisible();
    await page.getByRole("button", { name: "Choose another place" }).tap();
    await page.getByRole("button", { name: "Add a place" }).tap();
    const dialog = page.getByRole("dialog", { name: "Add a place" });
    await dialog.getByRole("button", { name: /Weather home/ }).tap();
    await expect(dialog).toBeHidden();
    await page.getByRole("combobox", { name: "Met Office warning region for Weather home" }).tap();
    await page.getByRole("option", { name: "East Midlands" }).tap();
    await expect(page.getByRole("combobox", { name: "Met Office warning region for Weather home" })).toHaveText(/East Midlands/);
    expect(updates).toEqual([]);

    await page.getByRole("button", { name: "Update now" }).tap();
    await expect(page.getByText(/copies fetched/)).toBeVisible();
    expect(updates).toEqual(["POST"]);

    await page.getByRole("tab", { name: "Forecast" }).tap();
    await expect(page.getByText("Fetched just now.").first()).toBeVisible();
    await expect(page.getByText(/^From Open-Meteo, fetched/)).toBeVisible();

    await page.getByRole("tab", { name: "Warnings" }).tap();
    await expect(page.getByRole("heading", { name: "East Midlands" })).toBeVisible();
    await expect(page.getByText(/it may be out of date/)).toBeVisible();

    await page.getByRole("tab", { name: "Flood" }).tap();
    await expect(page.getByText("Christchurch Harbour, Bournemouth, Christchurch and Poole")).toBeVisible();

    await page.getByRole("tab", { name: "Kept and sources" }).tap();
    await expect(page.getByText(/Sent to api\.open-meteo\.com: latitude 52\.13, longitude -0\.46/)).toBeVisible();

    const wide = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(wide).toBeLessThanOrEqual(390);
    expect(errors).toEqual([]);
  });

  test("fetches river and sea levels on a press, and a station's last days on another", async ({ page }) => {
    const errors = watchForErrors(page);
    const outbound: string[] = [];
    page.on("request", (request) => {
      const url = request.url();
      if (url.includes("/api/weather/update") || url.includes("/api/weather/river-readings")) outbound.push(new URL(url).pathname);
    });
    await page.goto("/");
    await clear(page);
    await api(page, "PUT", "/api/weather/options", { riversKm: 8 });
    await api(page, "POST", "/api/weather/places", { name: "Lynn", lat: 52.75, lon: 0.4 });

    await page.goto("/prepare/weather?view=rivers");
    await expect(page.getByText(/River and sea levels have not been fetched for Lynn yet/)).toBeVisible();
    await expect(page.getByText(/England only/)).toBeVisible();
    expect(outbound).toEqual([]);

    // The distance is a drop-down; choosing one fetches nothing.
    await page.getByRole("combobox", { name: "Stations within" }).tap();
    await page.getByRole("option", { name: "15 km (9 miles)" }).tap();
    await expect(page.getByRole("combobox", { name: "Stations within" })).toHaveText(/15 km/);
    expect(outbound).toEqual([]);

    await page.getByRole("button", { name: "Fetch river and sea levels" }).tap();
    await expect(page.getByRole("heading", { name: "6 stations within 15 km, nearest first" })).toBeVisible();
    expect(outbound).toEqual(["/api/weather/update"]);
    await expect(page.getByText("Fetched just now.")).toBeVisible();
    const tidal = page.locator('[data-station="E47901"]');
    await expect(tidal.getByText("Tidal", { exact: true })).toBeVisible();
    await expect(
      page.locator('[data-station="E21183"]').getByText(/^1\.09 m above Ordnance Datum, (\d\d:\d\d|\d{1,2} [A-Z][a-z]{2} \d{4})$/),
    ).toBeVisible();

    await page.getByRole("link", { name: /Kilham's Bridge/ }).tap();
    await expect(page.getByRole("heading", { level: 2, name: "Kilham's Bridge" })).toBeVisible();
    await page.getByRole("button", { name: "Fetch the last 3 days" }).tap();
    await expect(page.getByRole("region", { name: /Level at Kilham's Bridge/ })).toBeVisible();
    expect(outbound).toEqual(["/api/weather/update", "/api/weather/river-readings"]);
    await page.getByText("The readings as a table").tap();
    await expect(page.getByRole("columnheader", { name: "Level, mAOD" })).toBeVisible();

    await page.getByRole("link", { name: "All river and sea levels" }).tap();
    await expect(page.getByRole("heading", { name: "6 stations within 15 km, nearest first" })).toBeVisible();
    const wide = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(wide).toBeLessThanOrEqual(390);
    await api(page, "PUT", "/api/weather/options", { riversKm: 8 });
    expect(errors).toEqual([]);
  });

  test("keeps barometer readings and gives the three-hour tendency", async ({ page }) => {
    const errors = watchForErrors(page);
    await page.goto("/");
    await clear(page);
    const now = Date.now();
    await api(page, "POST", "/api/weather/readings", { takenAt: now - 3 * 3_600_000, value: 1012.4, unit: "hPa", heightM: 40 });
    await page.goto("/prepare/weather?view=barometer");
    await page.getByLabel("Pressure the barometer shows").fill("1008.2");
    await page.getByLabel("Height of the barometer above sea level, m").fill("40");
    await page.getByRole("button", { name: "Keep this reading" }).tap();
    await expect(page.getByTestId("tendency")).toContainText("Falling quickly: -4.2 hPa");
    await expect(page.getByRole("heading", { name: "Pressure at sea level over the last three days of readings" })).toBeVisible();
    expect(errors).toEqual([]);
  });
});
