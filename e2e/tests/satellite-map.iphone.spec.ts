/**
 * "Show on the map" in Safari on an iPhone (WebKit, by touch). Before, it only remembered
 * the choice and opened Maps: with the Satellites layer off (as it is until switched on)
 * the map was bare, and with it on the chosen satellite was off-screen among 114 others.
 * Now one tap switches the layer on, fits the map to the satellite, and draws the others
 * small and unlabelled, with a way back to all alike. The server's answers for the
 * satellites are stood in for in the page; nothing is fetched from CelesTrak or SatNOGS.
 */
import { parseCelestrakCsv } from "../../packages/shared/src/index.ts";
import { expect, test, watchForErrors } from "./fixtures";

const HEADER =
  "OBJECT_NAME,OBJECT_ID,EPOCH,MEAN_MOTION,ECCENTRICITY,INCLINATION,RA_OF_ASC_NODE,ARG_OF_PERICENTER,MEAN_ANOMALY,EPHEMERIS_TYPE,CLASSIFICATION_TYPE,NORAD_CAT_ID,ELEMENT_SET_NO,REV_AT_EPOCH,BSTAR,MEAN_MOTION_DOT,MEAN_MOTION_DDOT";

test.use({ viewport: { width: 390, height: 664 } });

test("Show on the map, tapped on an iPhone, switches the satellites on, fits the chosen one and thins out the rest", async ({
  page,
}, info) => {
  test.setTimeout(90_000);
  const errors = watchForErrors(page);
  const now = Date.now();
  const epoch = new Date(now - 86_400_000).toISOString().replace("Z", "");
  const satellites = parseCelestrakCsv(
    [
      HEADER,
      `ISS (ZARYA),1998-067A,${epoch},15.49527370,.0007384,51.6319,243.0636,49.3258,310.8372,0,U,25544,999,59609,.2073332E-3,.11207E-3,0`,
      `AN OTHER,2020-001A,${epoch},14.80000000,.0010000,97.5000,10.0000,90.0000,200.0000,0,U,90001,999,100,.1E-3,.1E-4,0`,
    ].join("\n"),
    "amateur",
  );
  const source = (id: string) => ({ id, label: id, url: "", fetchedAt: now, count: 1, error: null, triedAt: now });
  await page.route("**/api/satellites", (route) =>
    route.fulfill({
      json: {
        satellites,
        transmitters: [],
        about: [],
        wikipedia: [],
        wikipediaDiscarded: [],
        sources: [source("celestrak"), source("satnogs"), source("satnogs-satellites")],
        fetching: false,
        now,
      },
    }),
  );
  await page.addInitScript(() => {
    // The layer as it is on a device that never switched it on.
    if (!sessionStorage.getItem("seeded")) {
      localStorage.removeItem("outpost.maps.satellites");
      localStorage.setItem("outpost.maps.view", JSON.stringify({ lat: 20, lon: 0, zoom: 1.5 }));
      sessionStorage.setItem("seeded", "1");
    }
  });

  await page.goto("/radio/satellites");
  await page.getByRole("textbox", { name: "Seen from" }).fill("51.5074, -0.1278");
  await page.getByRole("tab", { name: "One satellite" }).tap();
  await expect(page.getByRole("heading", { name: "ISS (ZARYA)" })).toBeVisible();
  const show = page.getByRole("button", { name: "Show on the map" });
  await show.scrollIntoViewIfNeeded();
  await show.tap();

  await expect(page).toHaveURL(/\/maps\?satellite=25544$/);
  await expect(page.locator('.outpost-map[data-map-idle="true"]')).toBeVisible({ timeout: 20_000 });
  expect(await page.evaluate(() => localStorage.getItem("outpost.maps.satellites"))).toBe("true");
  // The map moved off the bare world view it was left at (20° N, 0°, zoom 1.5) to the satellite, and was kept there.
  await expect
    .poll(
      async () =>
        JSON.parse((await page.evaluate(() => localStorage.getItem("outpost.maps.view"))) ?? "{}") as { lat: number; lon: number },
      {
        timeout: 15_000,
      },
    )
    .not.toMatchObject({ lat: 20, lon: 0 });
  const view = JSON.parse((await page.evaluate(() => localStorage.getItem("outpost.maps.view"))) ?? "{}") as { lat: number; zoom: number };
  expect(view.zoom).toBeLessThanOrEqual(5);
  expect(Math.abs(view.lat)).toBeLessThan(70);
  await info.attach("fitted to the ISS", { body: await page.screenshot(), contentType: "image/png" });

  await page.getByRole("tab", { name: "Layers" }).tap();
  const layer = page.getByRole("region", { name: "Satellites" });
  await expect(layer.getByRole("switch")).toBeChecked();
  await expect(layer).toContainText("The track drawn is ISS (ZARYA)'s");
  await expect(layer).toContainText("The others are drawn small, without names.");
  await layer.getByRole("button", { name: "Show every satellite alike" }).tap();
  await expect(layer).not.toContainText("The others are drawn small");
  expect(errors).toEqual([]);
});
