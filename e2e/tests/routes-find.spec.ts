import fs from "node:fs";
import { api, expect, test, watchForErrors } from "./fixtures";

// "Find a route" asks a route source on the internet. Here the source is the suite's own
// stand-in (see playwright.config.ts and tools/fake-dist.mjs), which answers with a
// made-up route: ways out of order and back to front, a gap, a branch, an alternative leg.
test.describe("finding a route", () => {
  test("finds a route by name, shows it on the map, adds it, and exports it with its credit", async ({ page }) => {
    const errors = watchForErrors(page);
    await page.goto("/maps?lat=54.49&lon=-3.15&z=11");
    await expect(page.locator("canvas").first()).toBeVisible({ timeout: 15_000 });
    await page.getByRole("tab", { name: /Routes/ }).click();
    await page
      .getByRole("button", { name: /^Find a route/ })
      .first()
      .click();
    await expect(page.getByRole("heading", { name: "Find a route" })).toBeVisible();

    // Before anything is sent, the view says where a search goes.
    await expect(
      page.getByText(/Search sends this name and the edges of the map view to 127\.0\.0\.1:\d+ \(the Outpost test suite\)/),
    ).toBeVisible();
    await expect(page.getByText(/It needs the internet\. A route you add is kept here and works offline\./)).toBeVisible();

    await page.getByLabel("Name of the route").fill("kestrel");
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(page.getByText("4 results. OpenStreetMap as it was on 15 Nov 2026")).toBeVisible();
    await expect(page.getByRole("button", { name: /Kestrel Valley Cycleway.*Cycle route · regional/ })).toBeVisible();
    // A name that is only ways, with no route made of them, is found too.
    await expect(page.getByRole("button", { name: /Heron Beck Track.*Named path, 3 ways/ })).toBeVisible();

    await page.getByRole("button", { name: /Kestrel Ridge Path.*Walking route · local/ }).click();
    await expect(page.getByRole("heading", { name: "Kestrel Ridge Path" })).toBeVisible();
    await expect(page.getByText("3 lines: 1 gap (the widest 146 m) and 1 branch")).toBeVisible();
    await expect(page.getByText(/Gaps are left open, never joined with a straight line/)).toBeVisible();
    await expect(page.getByRole("link", { name: "OpenStreetMap relation 9001" })).toBeVisible();
    // The preview is on the map, and credited there, before it is saved.
    await expect(page.getByText("Routes: © OpenStreetMap contributors")).toBeVisible();
    expect(
      (await api<{ tracks: unknown[] }>(page, "GET", "/api/maps/tracks")).tracks.filter(
        (track) => (track as { name: string }).name === "Kestrel Ridge Path",
      ),
    ).toEqual([]);

    await page.getByRole("button", { name: "Add to my routes" }).click();
    await expect(page.getByText("Added “Kestrel Ridge Path” to your routes, without heights.")).toBeVisible();
    // It opens like any other route, and says where it came from.
    await expect(page.getByRole("button", { name: "Export as GPX" }).or(page.getByRole("link", { name: "Export as GPX" }))).toBeVisible();
    await expect(page.getByRole("link", { name: "OpenStreetMap relation 9001" })).toBeVisible();
    await expect(page.getByRole("tabpanel", { name: "Routes" }).getByRole("link", { name: "© OpenStreetMap contributors" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Open Database Licence (ODbL) 1.0" })).toBeVisible();
    await expect(page.getByText("Not known: no terrain installed here")).toBeVisible();

    // The file it exports carries the credit in the places GPX has for it.
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Export as GPX" }).click()]);
    expect(download.suggestedFilename()).toBe("Kestrel Ridge Path.gpx");
    const gpx = fs.readFileSync(await download.path(), "utf8");
    expect(gpx).toContain('<copyright author="OpenStreetMap contributors">');
    expect(gpx).toContain("<license>https://opendatacommons.org/licenses/odbl/1-0/</license>");
    expect(gpx.match(/<src>From OpenStreetMap \(relation 9001\), fetched /g)).toHaveLength(3);
    expect(gpx).toContain('<link href="https://www.openstreetmap.org/relation/9001">');
    // Three lines, so three tracks: the gap is not drawn across.
    expect(gpx.match(/<trk>/g)).toHaveLength(3);

    // And it is in the list with the others.
    await page.getByRole("button", { name: "Routes", exact: true }).click();
    await expect(page.getByRole("button", { name: /Kestrel Ridge Path\s*3\.06 km/ })).toBeVisible();
    await expect(page.getByText("Routes: © OpenStreetMap contributors")).toBeVisible();
    expect(errors).toEqual([]);

    // Leave the library as it was found, for the tests that count routes.
    const { tracks } = await api<{ tracks: Array<{ id: string; name: string }> }>(page, "GET", "/api/maps/tracks");
    for (const track of tracks.filter((item) => item.name === "Kestrel Ridge Path"))
      await api(page, "DELETE", `/api/maps/tracks/${track.id}`);
  });
});
