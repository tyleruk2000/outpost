import fs from "node:fs";
import { accessibilityInBothThemes } from "./a11y";
import { api, expect, test, watchForErrors } from "./fixtures";
import { pdfWords } from "./pdf";
import { choosePlace, installChannelTrip, removeChannelTrip } from "./road-routes";

// Road routes are planned on this Outpost from road networks it holds, here built from made-up
// extracts in storage (road-routes.ts): nothing is downloaded and nothing reaches the internet.
test.describe("road routes", () => {
  test("plans a route with a via point and a ferry, shows the owner's lines, saves it and makes the route card", async ({
    page,
  }, testInfo) => {
    test.setTimeout(150_000);
    const errors = watchForErrors(page);
    await page.goto("/");

    const places = await installChannelTrip(page);

    try {
      // Offline maps lists the routes under each country; a row opens to what they are and the day their data is from.
      await page.goto("/maps/data");
      const gb = page.locator('[data-place="country:GB"]');
      await gb.getByRole("button", { name: /^United Kingdom/ }).click();
      const roads = gb.getByRole("region", { name: "United Kingdom in detail" });
      await expect(roads).toContainText("Great Britain (test)");
      await expect(roads).toContainText(/roads from 20 Nov 2026/);
      const fr = page.locator('[data-place="country:FR"]');
      await fr.getByRole("button", { name: /^France/ }).click();
      await expect(fr).toContainText("France north (test)");
      await expect(page.getByText(/© OpenStreetMap contributors/).first()).toBeAttached();

      await page.goto("/maps?lat=49&lon=3&z=5");
      await expect(page.locator("canvas").first()).toBeVisible({ timeout: 15_000 });

      // Routes, Road route.
      await page.getByRole("tab", { name: /Routes/ }).click();
      await page.getByRole("button", { name: "Plan a route" }).first().click();
      await expect(page.getByRole("heading", { name: "Plan a route", exact: true })).toBeVisible();
      const choose = (label: string, place: string) => choosePlace(page, label, place);
      await choose("From", "Leatherhead");
      await page.getByRole("button", { name: "Add a via point" }).click();
      await choose("Via 1", "Reims");
      await choose("To", "Chamonix");
      // The ferry, not the tunnel.
      // Over the Channel: the sea crossing is asked about, as it is for no route over land.
      await page.getByLabel("Sea crossing").click();
      await page.getByRole("option", { name: /Dover \(UK\) - Calais \(F\)/ }).click();
      await page.getByRole("button", { name: "Plan route" }).click();

      await expect(page.getByRole("heading", { name: "Leatherhead to Chamonix" })).toBeVisible({ timeout: 60_000 });
      const directions = page.getByRole("list", { name: "Directions" });
      for (const line of [
        "M25",
        "M20 - Folkestone",
        "A20 - Dover",
        "Ferry, Dover – Calais",
        "Via Reims",
        "A26 (E17) - Troyes",
        "N205 - Chamonix",
      ])
        await expect(directions.getByText(line, { exact: true })).toBeVisible();
      await expect(directions.getByText("Leave the N205, then local roads")).toBeVisible();
      await expect(directions.getByText("Tunnel")).toHaveCount(0);
      // A line shows that leg on the map.
      await directions.getByRole("button", { name: /A26 \(E17\) - Troyes/ }).click();
      await expect(directions.getByRole("button", { name: /A26 \(E17\) - Troyes/ })).toHaveAttribute("aria-pressed", "true");
      // And from the keyboard.
      await directions.getByRole("button", { name: /N205 - Chamonix/ }).focus();
      await page.keyboard.press("Enter");
      await expect(directions.getByRole("button", { name: /N205 - Chamonix/ })).toHaveAttribute("aria-pressed", "true");

      expect(await accessibilityInBothThemes(page, "/maps (road route)")).toEqual([]);

      // The condensed plain text: 48 characters wide at most.
      const text = await page.getByLabel("The route as plain text").inputValue();
      expect(Math.max(...text.split("\n").map((line) => line.length))).toBeLessThanOrEqual(48);
      expect(text).toContain("Ferry, Dover - Calais");

      // Saved under a name of its own, and listed.
      await page.getByLabel("Name to save it under").fill("Alps by the ferry");
      await page.getByRole("button", { name: "Save route" }).click();
      await expect(page.getByRole("heading", { name: "Alps by the ferry" })).toBeVisible();

      // The route card.
      await page.getByRole("button", { name: "Printable route card (PDF)" }).click();
      const save = page.getByTestId("road-route-card").getByRole("link", { name: "Save as PDF" });
      await expect(save).toBeVisible({ timeout: 60_000 });
      const downloading = page.waitForEvent("download");
      await save.click();
      const bytes = fs.readFileSync(await (await downloading).path());
      await testInfo.attach("road-route.pdf", { body: bytes, contentType: "application/pdf" });
      const words = await pdfWords(bytes);
      for (const line of ["Alps by the ferry", "M20 - Folkestone", "Ferry, Dover", "A26 (E17) - Troyes", "N205 - Chamonix"])
        expect(words).toContain(line);
      expect(words).toContain("Start: Leatherhead");
      expect(words).toContain("Via 1: Reims");
      expect(words).toContain("Planned in advance, not live");
      expect(words).toContain("Check the signs and closures");
      expect(words).toContain("OpenStreetMap contributors");

      await page.getByRole("button", { name: "Plan a route", exact: true }).click();
      await expect(
        page.getByRole("region", { name: "Saved road routes" }).getByRole("button", { name: /Alps by the ferry/ }),
      ).toBeVisible();
      expect(errors).toEqual([]);
    } finally {
      await removeChannelTrip(page, places);
    }
  });

  test("names the country a route has no roads for before Plan route, and adds exactly that one", async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    const errors = watchForErrors(page);
    await page.goto("/");
    // Only Great Britain's roads are kept.
    const places = await installChannelTrip(page, ["GB"]);
    places.push(
      (await api<{ marker: { id: string } }>(page, "POST", "/api/maps/markers", { name: "London", lat: 51.5074, lon: -0.1278 })).marker.id,
    );
    try {
      await page.goto("/maps?lat=49&lon=3&z=5");
      await expect(page.locator("canvas").first()).toBeVisible({ timeout: 15_000 });
      await page.getByRole("tab", { name: /Routes/ }).click();
      await page.getByRole("button", { name: "Plan a route" }).first().click();
      await expect(page.getByRole("heading", { name: "Plan a route", exact: true })).toBeVisible();
      await choosePlace(page, "From", "London");
      await choosePlace(page, "To", "Chamonix");

      // Said before Plan route is pressed, worked out on this device.
      await expect(page.getByText("France has no roads yet")).toBeVisible();
      await expect(page.getByText("This route runs through France. United Kingdom is ready.")).toBeVisible();
      const plan = page.getByRole("button", { name: "Plan route" });
      await expect(plan).toBeDisabled();
      await expect(page.getByText("Add France first")).toBeVisible();
      await expect(page.getByLabel("Sea crossing")).toBeVisible();
      await expect(page.getByText("Crossing the Channel")).toHaveCount(0);
      expect(await accessibilityInBothThemes(page, "/maps (route needs a country)")).toEqual([]);
      const shots = process.env.OUTPOST_SHOTS_DIR;
      if (shots) await page.screenshot({ path: `${shots}/p1-route-needs-france-1280.png` });

      // One press opens Map data's add flow for France and nothing else.
      const opened = page.waitForURL(/\/maps\/data\?add=1&kinds=roads&countries=FR$/, { waitUntil: "commit" });
      await page.getByRole("button", { name: "Add roads for France" }).click();
      await opened;
      await testInfo.attach("url", { body: page.url() });
      expect(errors).toEqual([]);
    } finally {
      await removeChannelTrip(page, places);
    }
  });
});

// Pictures of the same at a phone's width, for looking at by eye: only when a folder is given.
test.describe("road routes on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test("pictures the countries a route needs", async ({ page }) => {
    const shots = process.env.OUTPOST_SHOTS_DIR;
    test.skip(!shots, "Pictures only when OUTPOST_SHOTS_DIR is set");
    test.setTimeout(120_000);
    await page.goto("/");
    const places = await installChannelTrip(page, ["GB"]);
    places.push(
      (await api<{ marker: { id: string } }>(page, "POST", "/api/maps/markers", { name: "London", lat: 51.5074, lon: -0.1278 })).marker.id,
    );
    try {
      await page.goto("/maps?lat=49&lon=3&z=5");
      await page.getByRole("tab", { name: /Routes/ }).click();
      await page.getByRole("button", { name: "Plan a route" }).first().click();
      await page.screenshot({ path: `${shots}/p1-route-empty-390.png` });
      await choosePlace(page, "From", "London");
      await choosePlace(page, "To", "Chamonix");
      await page.getByText("France has no roads yet").scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${shots}/p1-route-needs-france-390.png` });
      await page.getByRole("button", { name: "Plan route" }).scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${shots}/p1-route-needs-france-390-b.png` });
    } finally {
      await removeChannelTrip(page, places);
    }
  });
});
