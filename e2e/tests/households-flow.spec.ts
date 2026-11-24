/**
 * Several households, the whole way through: with one household everything is as it was;
 * a second, portable one (a caravan) with someone of the first in it too and someone new,
 * said to be at a point pressed on the map, then made current; Supplies, an emergency plan
 * and the household book are then the caravan's, say so, and offer its people; made the
 * first again, nothing of the caravan's shows.
 */
import type { Page } from "@playwright/test";
import { api, expect, test, watchForErrors } from "./fixtures";
import { backToOneHousehold } from "./households";

const idle = (page: Page) => page.locator('.outpost-map[data-map-idle="true"]').first().waitFor({ timeout: 20_000 });

const plan = (name: string) => ({
  name,
  kind: "other",
  kindText: "Journey",
  templateId: null,
  emergencyNumber: "999",
  reviewEveryDays: 180,
  body: {
    steps: [],
    people: [],
    contacts: [],
    places: [],
    comms: { text: "", commPlanId: null, frequency: "", schedule: "" },
    days: null,
    supplies: [],
    powerPlanId: null,
    where: [],
    notes: "",
    links: [],
  },
});

/** The book's questions, at the people step, whether or not they were answered before. */
async function bookPeople(page: Page) {
  await page.goto("/prepare/book");
  await expect(page.getByRole("heading", { level: 1, name: "Household book" })).toBeVisible();
  const start = page.getByRole("button", { name: /^(Start the questions|Change the answers)$/ });
  await start.click();
  await expect(page.getByText(/^Step 1 of \d+: /)).toBeVisible();
}

test.describe("Several households, end to end", () => {
  const plans: string[] = [];
  test.afterEach(async ({ page }) => {
    await backToOneHousehold(page);
    for (const id of plans.splice(0)) await api(page, "DELETE", `/api/emergency-plans/${id}`).catch(() => undefined);
  });

  test("one household as before, then a caravan made current, then back", async ({ page }) => {
    test.setTimeout(180_000);
    const errors = watchForErrors(page);
    await page.goto("/");
    await backToOneHousehold(page);
    await api(page, "POST", "/api/people", { kind: "person", name: "E2E Tyler", band: "19-64" });
    plans.push((await api(page, "POST", "/api/emergency-plans", plan("E2E Home plan"))).plan.id);

    // One household: no "For" line, no switcher, the people where they always were.
    await page.goto("/prepare/supplies?view=household");
    await expect(page.getByRole("heading", { level: 1, name: "Supplies" })).toBeVisible();
    await expect(page.getByLabel(/^Name/).first()).toBeVisible();
    await expect(page.getByTestId("for-household")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Household:/ })).toHaveCount(0);
    await page.goto("/prepare/plans");
    await expect(page.getByRole("link", { name: "E2E Home plan", exact: true })).toBeVisible();
    await expect(page.getByTestId("for-household")).toHaveCount(0);

    // A second household that moves, starting with nobody.
    await page.goto("/prepare/households");
    await page.getByRole("button", { name: "New household" }).click();
    const dialog = page.getByRole("dialog", { name: "New household" });
    await dialog.getByLabel("Name").fill("E2E Caravan");
    await dialog.getByRole("radio", { name: "Portable" }).click();
    await dialog.getByRole("button", { name: "Make the household" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "E2E Caravan" })).toBeVisible();

    // Tyler, who is in the first household too, and someone new.
    await page.getByRole("button", { name: "Add someone already here" }).click();
    await page.getByRole("menuitem", { name: /E2E Tyler/ }).click();
    await page.getByRole("button", { name: "Add a person" }).click();
    const people = page.getByRole("list", { name: "People of E2E Caravan" });
    await people.getByLabel(/^Name/).last().fill("E2E Robin");
    await page.getByRole("button", { name: "Save people" }).click();
    await expect(page.getByText("The people of E2E Caravan saved.")).toBeVisible();
    await expect(people).toContainText("Also in");

    // We're here now, from a point pressed on the map.
    await page.getByRole("button", { name: "We're here now" }).click();
    const here = page.getByRole("dialog", { name: "Where E2E Caravan is now" });
    await here.getByRole("radio", { name: "On the map" }).click();
    await idle(page);
    const map = await here.getByRole("region", { name: "Map: press where the household is" }).boundingBox();
    await page.mouse.click(map!.x + map!.width / 2, map!.y + map!.height / 2);
    await expect(here.getByTestId("here-chosen")).toContainText(/-?\d+\.\d+/);
    await here.getByLabel(/^Name for this place/).fill("E2E Lakeside campsite");
    await here.getByRole("button", { name: "We're here now" }).click();
    await expect(here).toBeHidden();
    await expect(page.getByTestId("where-now")).toContainText("E2E Lakeside campsite");

    // Made current, for everyone.
    await page.getByRole("button", { name: "Make current" }).first().click();
    await expect
      .poll(async () => {
        const listed = await api(page, "GET", "/api/households");
        return listed.households.find((household: { id: string }) => household.id === listed.currentId).name;
      })
      .toBe("E2E Caravan");

    // Supplies is the caravan's: it says so, and its people are Tyler and Robin.
    await page.goto("/prepare/supplies?view=household");
    await expect(page.getByTestId("for-household")).toHaveText("For E2E Caravan · Change");
    await expect(page.getByTestId("for-household").getByRole("link", { name: "Change" })).toHaveAttribute("href", "/prepare/households");
    await expect(page.getByText("These are E2E Caravan’s people.")).toBeVisible();
    await expect(page.locator('input[value="E2E Robin"]')).toHaveCount(1);
    await expect(page.locator('input[value="E2E Tyler"]')).toHaveCount(1);

    // A plan made now is the caravan's, says so, and offers its people by name; the first household's is not listed.
    plans.push((await api(page, "POST", "/api/emergency-plans", plan("E2E Caravan plan"))).plan.id);
    await page.goto("/prepare/plans");
    await expect(page.getByTestId("for-household")).toHaveText("For E2E Caravan · Change");
    await expect(page.getByRole("link", { name: "E2E Caravan plan", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "E2E Home plan", exact: true })).toHaveCount(0);
    await page.getByRole("link", { name: "E2E Caravan plan", exact: true }).click();
    await expect(page.getByTestId("plan-household")).toHaveText("For E2E Caravan · Change");
    const offered = page.getByTestId("household-people");
    await expect(offered).toContainText("In E2E Caravan:");
    await expect(offered.getByRole("button", { name: "Add E2E Robin" })).toBeVisible();
    await expect(offered.getByRole("button", { name: "Add E2E Tyler" })).toBeVisible();

    // The book is the caravan's, with its people.
    await bookPeople(page);
    await expect(page.getByTestId("for-household")).toHaveText("For E2E Caravan · Change");
    await expect(page.getByRole("main")).toContainText("E2E Robin");

    // Back to the first household: nothing of the caravan's shows.
    await page.goto("/prepare/households");
    await page.getByRole("button", { name: /^Make current: (?!E2E Caravan)/ }).click();
    await expect
      .poll(async () => {
        const listed = await api(page, "GET", "/api/households");
        return listed.currentId;
      })
      .toBe("household");
    await page.goto("/prepare/supplies?view=household");
    await expect(page.getByTestId("for-household")).not.toContainText("E2E Caravan");
    await expect(page.locator('input[value="E2E Tyler"]')).toHaveCount(1);
    await expect(page.locator('input[value="E2E Robin"]')).toHaveCount(0);
    await page.goto("/prepare/plans");
    await expect(page.getByRole("link", { name: "E2E Home plan", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "E2E Caravan plan", exact: true })).toHaveCount(0);
    await bookPeople(page);
    await expect(page.getByRole("main")).not.toContainText("E2E Robin");
    expect(errors).toEqual([]);
  });
});
