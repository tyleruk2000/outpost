/**
 * The radio screens on a phone, as a keyboard and a screen reader meet them (outpost-apnn.3).
 *
 * - A box that scrolls on its own (the solar table, the log set beside the engine, a
 *   satellite's transmitters) can be reached and scrolled from the keyboard: axe finds no
 *   serious fault in the states where those boxes are filled.
 * - With the text at 200% on a 320 px screen, the coverage map's hours, the log's counts, a
 *   plan's stations and a satellite's fields stay within the width: nothing scrolls sideways.
 * - What the keyboard moves to is never left behind the top bar or the bar of screens at the
 *   bottom (WCAG 2.4.11).
 */
import type { Page } from "@playwright/test";
import { parseCelestrakCsv } from "../../packages/shared/src/index.ts";
import { accessibilityInBothThemes } from "./a11y";
import { adifLog } from "./adif";
import { api, expect, test, watchForErrors } from "./fixtures";

const HEADER =
  "OBJECT_NAME,OBJECT_ID,EPOCH,MEAN_MOTION,ECCENTRICITY,INCLINATION,RA_OF_ASC_NODE,ARG_OF_PERICENTER,MEAN_ANOMALY,EPHEMERIS_TYPE,CLASSIFICATION_TYPE,NORAD_CAT_ID,ELEMENT_SET_NO,REV_AT_EPOCH,BSTAR,MEAN_MOTION_DOT,MEAN_MOTION_DDOT";

/** One satellite with one transmitter, answered in place of the server's list (nothing is fetched). */
async function oneSatellite(page: Page) {
  const now = Date.now();
  const epoch = new Date(now - 2 * 86_400_000).toISOString().replace("Z", "");
  const satellites = parseCelestrakCsv(
    `${HEADER}\nISS (ZARYA),1998-067A,${epoch},15.49527370,.0007384,51.6319,243.0636,49.3258,310.8372,0,U,25544,999,59609,.2073332E-3,.11207E-3,0`,
    "amateur",
  );
  const transmitter = {
    id: "t",
    noradId: 25544,
    description: "FM voice repeater",
    alive: true,
    status: "active",
    type: "Transceiver",
    mode: "FM",
    uplinkLowHz: 145_990_000,
    uplinkHighHz: null,
    downlinkLowHz: 437_800_000,
    downlinkHighHz: null,
    invert: false,
    baud: null,
    updatedAt: null,
  };
  const source = (id: string, label: string) => ({ id, label, url: "", fetchedAt: now, count: 1, error: null, triedAt: now });
  await page.route("**/api/satellites", (route) =>
    route.fulfill({
      json: {
        satellites,
        transmitters: [transmitter],
        sources: [source("celestrak", "CelesTrak"), source("satnogs", "SatNOGS DB")],
        fetching: false,
        now,
      },
    }),
  );
}

const station = (id: string, name: string, lat: number, lon: number) => ({
  id,
  name,
  lat,
  lon,
  powerWatts: 5,
  antenna: { kind: "horizontal-dipole", heightM: 5, ground: "average", broadsideDeg: null, gainDb: 0, feedlineLossDb: 0 },
  antennaName: "Low horizontal dipole, 5 m",
  noise: "residential",
});

/** What reaches past the right of the screen and is not inside a box that scrolls within it, outside the bar of screens. */
function pastTheEdge(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const inBox = (element: Element) => {
      for (let parent = element.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
        if (/auto|scroll|hidden|clip/.test(getComputedStyle(parent).overflowX)) return parent.getBoundingClientRect().right <= width + 1;
      }
      return false;
    };
    // The phone's bar of screens at the bottom is the shell's, and does not fit its five names at 200% (another test's business).
    // Measured first, as that is cheap; the boxes round each are looked at only for what reaches past the edge.
    const wide = [...document.querySelectorAll("body *")]
      .filter((element) => {
        const box = element.getBoundingClientRect();
        return box.width > 0 && box.right > width + 1;
      })
      .filter((element) => !element.closest('nav[aria-label="Main"]'))
      .filter((element) => !inBox(element));
    return wide
      .filter((element) => !wide.some((other) => other !== element && element.contains(other)))
      .slice(0, 5)
      .map((element) => `${element.tagName.toLowerCase()} "${(element.textContent ?? "").trim().slice(0, 40)}"`);
  });
}

test.describe("the radio screens on a phone", () => {
  test("a box that scrolls on its own is reached from the keyboard", async ({ page }) => {
    test.setTimeout(180_000);
    const errors = watchForErrors(page);

    await page.goto("/radio/propagation?tab=data");
    const solar = page.getByRole("region", { name: "The solar table in use, by month" });
    await expect(solar).toBeVisible();
    await expect(solar).toHaveAttribute("tabindex", "0");
    expect(await accessibilityInBothThemes(page, "/radio/propagation?tab=data")).toEqual([]);

    await page.goto("/radio/log");
    await page.getByLabel("ADIF file to import").setInputFiles({ name: "november.adi", mimeType: "text/plain", buffer: adifLog("G4DSK") });
    await expect(page.getByText("november.adi: 4 entries brought in")).toBeVisible();
    await page.getByRole("button", { name: "Compare", exact: true }).click();
    const compared = page.getByRole("region", { name: "Each entry compared, with the engine's figures for it" });
    await expect(compared).toBeVisible({ timeout: 30_000 });
    await compared.focus();
    await expect(compared).toBeFocused();
    expect(await accessibilityInBothThemes(page, "/radio/log")).toEqual([]);

    await oneSatellite(page);
    await page.goto("/radio/satellites");
    await page.getByRole("tab", { name: "One satellite" }).click();
    await expect(page.getByRole("region", { name: "Transmitters" })).toBeVisible();
    expect(await accessibilityInBothThemes(page, "/radio/satellites")).toEqual([]);
    expect(errors).toEqual([]);
  });

  test("with the text at 200% on a 320 px screen nothing scrolls sideways", async ({ page }) => {
    test.setTimeout(240_000);
    const errors = watchForErrors(page);
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto("/");
    const { plan } = await api(page, "POST", "/api/radio/communication-plans", {
      name: "Large text plan",
      notes: "",
      stations: [station("a", "Car park", 54.45, -3.02), station("b", "Summit shelter", 54.53, -3.21)],
      date: "2026-11-16",
      fromUtc: 8,
      toUtc: 16,
      bands: ["80m", "40m"],
      mode: "ssb",
      requiredSnrDb: null,
      referenceBandwidthHz: null,
      solar: { source: "table" },
      links: [],
    });
    const large = () => page.evaluate(() => document.documentElement.style.setProperty("font-size", "32px", "important"));
    try {
      // The coverage map with a grid on it: the hour and its slider.
      await page.goto("/radio/coverage");
      await page.getByLabel("Transmitter", { exact: true }).fill("51.5074, -0.1278");
      await page.getByLabel("Date (UTC)").fill("2026-11-16");
      await page.getByRole("button", { name: "Work out coverage" }).click();
      await expect(page.getByRole("heading", { name: "What this map rests on" })).toBeVisible({ timeout: 60_000 });
      expect(await pastTheEdge(page), "coverage at 100%").toEqual([]);
      await large();
      expect(await pastTheEdge(page), "coverage at 200%").toEqual([]);

      // The log set beside the engine: the counts by reliability.
      await page.goto("/radio/log");
      await page.getByLabel("ADIF file to import").setInputFiles({ name: "large.adi", mimeType: "text/plain", buffer: adifLog("G4DSK") });
      await page.getByRole("button", { name: "Compare", exact: true }).click();
      await expect(page.getByText(/entries could be compared with a prediction/)).toBeVisible({ timeout: 30_000 });
      await large();
      expect(await pastTheEdge(page), "the log at 200%").toEqual([]);

      // A plan's stations, each with Change and Remove.
      await page.goto(`/radio/plans/${plan.id}`);
      await expect(page.getByRole("button", { name: "Remove Car park" })).toBeVisible();
      await large();
      expect(await pastTheEdge(page), "a plan at 200%").toEqual([]);

      // A satellite's fields.
      await oneSatellite(page);
      await page.goto("/radio/satellites");
      await expect(page.getByText(/1 satellite, from CelesTrak/)).toBeVisible();
      await large();
      expect(await pastTheEdge(page), "satellites at 200%").toEqual([]);
      await page.getByRole("tab", { name: "One satellite" }).click();
      expect(await pastTheEdge(page), "one satellite at 200%").toEqual([]);

      // The Morse paddles and the code chart.
      await page.goto("/radio/morse?tab=send");
      await page.getByRole("group", { name: "Keyer speed" }).waitFor();
      await large();
      expect(await pastTheEdge(page), "Morse send at 200%").toEqual([]);
      await page.goto("/radio/morse?tab=reference");
      await page.getByRole("region", { name: "Table of prosigns" }).waitFor();
      await large();
      expect(await pastTheEdge(page), "the code chart at 200%").toEqual([]);

      // The first licence classes opened, with their notes.
      await page.goto("/radio/licences?country=GB");
      await page.locator("main details").first().waitFor({ state: "attached" });
      await page.evaluate(() => {
        for (const details of [...document.querySelectorAll<HTMLDetailsElement>("main details")].slice(0, 3)) details.open = true;
      });
      await large();
      expect(await pastTheEdge(page), "licences at 200%").toEqual([]);

      // The guides to setting up a receiver name a long host.
      await page.goto("/radio/heard");
      await expect(page.getByText("host.docker.internal").first()).toBeAttached();
      await large();
      expect(await pastTheEdge(page), "heard at 200%").toEqual([]);
    } finally {
      await api(page, "DELETE", `/api/radio/communication-plans/${plan.id}`);
    }
    expect(errors).toEqual([]);
  });

  test("what the keyboard moves to is not hidden behind the phone's bars", async ({ page }) => {
    const errors = watchForErrors(page);
    await page.goto("/radio/coverage");
    await expect(page.getByRole("button", { name: "Work out coverage" })).toBeVisible();
    const bars = await page.evaluate(() => ({
      top: document.querySelector("header")!.getBoundingClientRect().bottom,
      bottom: document.querySelector('nav[aria-label="Main"]')!.getBoundingClientRect().top,
    }));
    await page.locator("main").evaluate((main) => (main as HTMLElement).focus());
    const hidden: string[] = [];
    let stops = 0;
    for (let step = 0; step < 24; step++) {
      await page.keyboard.press("Tab");
      const where = await page.evaluate(() => {
        const element = document.activeElement as HTMLElement;
        // Past the end of the screen, focus goes on to the browser and the shell: the walk is over.
        if (!document.querySelector("main")?.contains(element)) return null;
        const box = element.getBoundingClientRect();
        return {
          name: (element.getAttribute("aria-label") ?? element.textContent ?? "").trim().slice(0, 40),
          top: box.top,
          bottom: box.bottom,
        };
      });
      if (!where) break;
      stops += 1;
      // 2.4.11 fails only what is wholly hidden; here each stop is expected to be wholly in sight, between the bars.
      if (where.top < bars.top - 1 || where.bottom > bars.bottom + 1)
        hidden.push(`${where.name} (${Math.round(where.top)} to ${Math.round(where.bottom)})`);
    }
    // The form, the map and its buttons: enough stops to reach below the first screenful.
    expect(stops).toBeGreaterThan(12);
    expect(hidden).toEqual([]);
    expect(errors).toEqual([]);
  });
});
