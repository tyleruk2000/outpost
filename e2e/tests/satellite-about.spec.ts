/**
 * Radio → Satellites, One satellite, "About this satellite": the description made from
 * SatNOGS DB's facts and the orbit, its website, and "Read about it on Wikipedia", whose
 * article is shown with how it was found, credited, and can be discarded. The server's
 * answers are stood in for in the page (nothing is fetched from CelesTrak, SatNOGS or
 * Wikipedia); axe finds nothing serious with the article shown, in either theme.
 */
import type { Page } from "@playwright/test";
import { parseCelestrakCsv, type SatelliteWikipedia } from "../../packages/shared/src/index.ts";
import { accessibilityInBothThemes } from "./a11y";
import { expect, test, watchForErrors } from "./fixtures";

const HEADER =
  "OBJECT_NAME,OBJECT_ID,EPOCH,MEAN_MOTION,ECCENTRICITY,INCLINATION,RA_OF_ASC_NODE,ARG_OF_PERICENTER,MEAN_ANOMALY,EPHEMERIS_TYPE,CLASSIFICATION_TYPE,NORAD_CAT_ID,ELEMENT_SET_NO,REV_AT_EPOCH,BSTAR,MEAN_MOTION_DOT,MEAN_MOTION_DDOT";

const ARTICLE: SatelliteWikipedia = {
  noradId: 25544,
  title: "International Space Station",
  url: "https://en.wikipedia.org/wiki/International_Space_Station",
  description: "Space station in low Earth orbit",
  extract: "The International Space Station is a large space station in low Earth orbit.",
  foundBy: "name",
  searchedFor: "NA1SS",
  editedAt: null,
  fetchedAt: Date.now(),
};

/** The ISS with SatNOGS's facts and one transmitter; the article kept or not as the presses go. */
async function standIn(page: Page) {
  const now = Date.now();
  const epoch = new Date(now - 2 * 86_400_000).toISOString().replace("Z", "");
  const satellites = parseCelestrakCsv(
    `${HEADER}\nISS (ZARYA),1998-067A,${epoch},15.49527370,.0007384,51.6319,243.0636,49.3258,310.8372,0,U,25544,999,59609,.2073332E-3,.11207E-3,0`,
    "amateur",
  );
  let wikipedia: SatelliteWikipedia[] = [];
  const asked: string[] = [];
  const source = (id: string, label: string) => ({ id, label, url: "", fetchedAt: now, count: 1, error: null, triedAt: now });
  await page.route("**/api/satellites", (route) =>
    route.fulfill({
      json: {
        satellites,
        transmitters: [
          {
            id: "t",
            noradId: 25544,
            description: "Mode V/U FM - Voice Repeater",
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
          },
        ],
        about: [
          {
            noradId: 25544,
            name: "ISS",
            otherNames: ["ZARYA", "RS0ISS", "NA1SS"],
            status: "in orbit",
            launched: "1998-11-20T00:00:00Z",
            deployed: null,
            decayed: null,
            website: "https://www.nasa.gov/mission_pages/station/main/index.html",
            operator: null,
            countries: ["RU", "US"],
            citation: null,
            frequencyViolator: false,
            associated: [],
          },
        ],
        wikipedia,
        sources: [source("celestrak", "CelesTrak"), source("satnogs", "SatNOGS DB"), source("satnogs-satellites", "SatNOGS DB satellites")],
        fetching: false,
        now,
      },
    }),
  );
  await page.route("**/api/satellites/25544/wikipedia", (route) => {
    asked.push(route.request().method());
    if (route.request().method() === "POST") {
      wikipedia = [ARTICLE];
      return route.fulfill({ json: { wikipedia: ARTICLE } });
    }
    wikipedia = [];
    return route.fulfill({ json: { ok: true } });
  });
  return asked;
}

test.describe("about a satellite", () => {
  test("describes it from facts, and reads, credits and discards its Wikipedia article on a press", async ({ page }) => {
    const errors = watchForErrors(page);
    const asked = await standIn(page);
    await page.goto("/radio/satellites");
    await page.getByRole("tab", { name: "One satellite" }).click();

    const about = page.locator("section").filter({ has: page.getByRole("heading", { name: "About this satellite" }) });
    await expect(about.getByRole("heading", { name: "About this satellite", level: 2 })).toBeVisible();
    await expect(about).toContainText("Also called ZARYA, RS0ISS and NA1SS.");
    await expect(about).toContainText("from Russia and the United States.");
    await expect(about).toContainText(/In orbit, about 4[12]0 km up, going round every 93 minutes at 51\.6° to the equator/);
    await expect(about).toContainText("an FM voice repeater");
    await expect(about.getByRole("link", { name: "nasa.gov" })).toHaveAttribute("href", /nasa\.gov/);
    expect(asked).toEqual([]);

    await about.getByRole("button", { name: "Read about it on Wikipedia" }).click();
    await expect(about.getByRole("heading", { name: "From Wikipedia", level: 3 })).toBeVisible();
    await expect(about).toContainText("The International Space Station is a large space station in low Earth orbit.");
    await expect(about).toContainText("found under the name “NA1SS”");
    await expect(about.getByRole("link", { name: "“International Space Station” on Wikipedia" })).toHaveAttribute("href", ARTICLE.url);
    await expect(about.getByRole("link", { name: "CC BY-SA 4.0" })).toBeVisible();
    expect(await accessibilityInBothThemes(page, "/radio/satellites")).toEqual([]);

    await about.getByRole("button", { name: "Discard this article" }).click();
    await expect(about.getByRole("button", { name: "Read about it on Wikipedia" })).toBeVisible();
    await expect(about).not.toContainText("large space station");
    expect(asked).toEqual(["POST", "DELETE"]);
    expect(errors).toEqual([]);
  });
});
