import { checkDiagrams } from "./diagrams";
import { expect, test, watchForErrors } from "./fixtures";

/**
 * The night sky's chart and pole-finding plate, and celestial navigation's plot, drawn on
 * a phone and measured as drawn: each named and described, no label over another, none
 * outside its drawing or under the small text size (diagrams.ts). Both screens take the
 * Solar clock's place, set here as typed coordinates on a clock of UTC+0.
 */
test.describe("the sky's plates, on a phone", () => {
  const placeAt = (typed: string) => {
    localStorage.setItem("outpost.tools.solar-clock.place", "typed");
    localStorage.setItem("outpost.tools.text.solar-clock.typed", typed);
    localStorage.setItem("outpost.tools.solar-clock.zone", "fixed:0");
  };

  for (const [where, coordinates, pole] of [
    ["Greenwich", "51.4779, -0.0015", /Polaris/],
    ["Sydney", "-33.8688, 151.2093", /Cross|south pole/],
  ] as const) {
    test(`draws the night sky at ${where} with no label over another`, async ({ page }) => {
      test.setTimeout(60_000);
      const errors = watchForErrors(page);
      await page.addInitScript(placeAt, coordinates);
      await page.goto("/tools/night-sky");
      await page.getByRole("radio", { name: "Another time" }).click();
      await page.getByLabel("Date", { exact: true }).fill("2026-11-17");
      await page.getByLabel("Time", { exact: true }).fill("22:00");
      const drawn = await checkDiagrams(page);
      expect(drawn.map((each) => each.name)).toEqual(["sky-chart", "pole-finding"]);
      // The four points of the compass and the names of bright stars and planets: kept clear of every faint dot,
      // the chart once had room at this width for one name at Greenwich and none at Sydney.
      expect(drawn[0]!.labels).toBeGreaterThanOrEqual(10);
      expect(drawn[1]!.label).toMatch(pole);
      expect(errors).toEqual([]);
    });
  }

  test("draws celestial navigation's plot of a line of position with no label over another", async ({ page }) => {
    test.setTimeout(60_000);
    const errors = watchForErrors(page);
    // Worked from the sight form's example position, 50° 10′ N 4° 40′ W (form.ts).
    await page.addInitScript(placeAt, "50.16667, -4.66667");
    await page.goto("/tools/celestial-navigation");
    // The sight form's worked example: the Sun's lower limb at 14:30:00 UT on 21 June 2026, as seen from 50° N 5° W.
    await page.getByLabel("Date (UT)").fill("2026-06-21");
    await page.getByLabel("Time (UT)").fill("14:30:00");
    await page.getByLabel("Sextant altitude").fill("53.40732");
    await page.getByLabel("Index error, minutes").fill("2");
    await page.getByLabel("Height of eye, metres").fill("3");
    await expect(page.getByText(/One line of position: you are somewhere on it/)).toBeVisible();
    const drawn = await checkDiagrams(page);
    expect(drawn.map((each) => each.name)).toEqual(["celnav-plot"]);
    // The line itself, which passes about fifteen miles from the position worked from: a sheet of eight miles once left it out.
    await expect(page.locator("figure[data-diagram=celnav-plot] text", { hasText: "Sun" })).toBeVisible();
    expect(errors).toEqual([]);
  });
});
