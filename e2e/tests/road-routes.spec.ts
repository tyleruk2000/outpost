import fs from "node:fs";
import { accessibilityInBothThemes } from "./a11y";
import { expect, test, watchForErrors } from "./fixtures";
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
      await page.goto("/maps?lat=49&lon=3&z=5&tab=offline");
      await expect(page.locator("canvas").first()).toBeVisible({ timeout: 15_000 });

      // Offline maps lists the networks, with what they are.
      const networks = page.getByRole("region", { name: "Road networks for routes" });
      await networks.scrollIntoViewIfNeeded();
      await expect(networks.getByRole("heading", { name: "Great Britain (test)" })).toBeVisible();
      await expect(networks.getByText("map data from 20 Nov 2026").first()).toBeVisible();
      await expect(networks.getByText(/© OpenStreetMap contributors/)).toBeVisible();

      // Routes, Road route.
      await page.getByRole("tab", { name: /Routes/ }).click();
      await page.getByRole("button", { name: "Road route" }).first().click();
      await expect(page.getByRole("heading", { name: "Road route", exact: true })).toBeVisible();
      const choose = (label: string, place: string) => choosePlace(page, label, place);
      await choose("From", "Leatherhead");
      await page.getByRole("button", { name: "Add a via point" }).click();
      await choose("Via 1", "Reims");
      await choose("To", "Chamonix");
      // The ferry, not the tunnel.
      await page.getByLabel("Crossing the Channel").click();
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

      await page.getByRole("button", { name: "Road route", exact: true }).click();
      await expect(
        page.getByRole("region", { name: "Saved road routes" }).getByRole("button", { name: /Alps by the ferry/ }),
      ).toBeVisible();
      expect(errors).toEqual([]);
    } finally {
      await removeChannelTrip(page, places);
    }
  });
});
