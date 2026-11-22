/**
 * Prepare › Households on a wide screen: one household as most Outposts have (no switcher),
 * a second one made from the dialog, the switcher in the sidebar changing the current one
 * for everyone, Home saying which it is for, deleting it with what goes said first, the
 * accessibility check in both themes, and the screen at 200% text.
 */
import { accessibilityInBothThemes } from "./a11y";
import { api, expect, test, watchForErrors } from "./fixtures";
import { backToOneHousehold, sideways } from "./households";

test.describe("Households", () => {
  test.afterEach(async ({ page }) => {
    await backToOneHousehold(page);
  });

  test("one household, then a caravan: made, made current from the sidebar, and deleted", async ({ page }) => {
    test.setTimeout(120_000);
    const errors = watchForErrors(page);
    await page.goto("/");
    await backToOneHousehold(page);
    await api(page, "POST", "/api/people", { kind: "person", name: "E2E Ann", band: "19-64" });

    // Reached from Preparedness, near the top of its list.
    await page.goto("/prepare");
    await page
      .getByRole("main")
      .getByRole("link", { name: /^Households/ })
      .click();
    await expect(page.getByRole("heading", { level: 1, name: "Households" })).toBeVisible();
    const list = page.getByRole("list", { name: "Households" });
    await expect(list.getByRole("listitem")).toHaveCount(1);
    await expect(list).toContainText("Current");
    await expect(page.getByRole("list", { name: "People" })).toContainText("E2E Ann");
    // With one household there is no switcher.
    await expect(page.getByRole("button", { name: /^Household:/ })).toHaveCount(0);
    expect(await accessibilityInBothThemes(page, "/prepare/households")).toEqual([]);

    // A portable household, starting with the people of the first.
    await page.getByRole("button", { name: "New household" }).click();
    const dialog = page.getByRole("dialog", { name: "New household" });
    await dialog.getByLabel("Name").fill("E2E Caravan");
    await dialog.getByRole("radio", { name: "Portable" }).click();
    await expect(dialog.getByRole("button", { name: "Use this device's location" })).toBeVisible();
    await dialog.getByRole("combobox", { name: "Start with the people of" }).click();
    // The first household, whatever earlier specs left in it: the choice after "Nobody".
    await page.getByRole("option").nth(1).click();
    await dialog.getByRole("button", { name: "Make the household" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "E2E Caravan" })).toBeVisible();
    await expect(page.getByRole("list", { name: "People of E2E Caravan" })).toContainText("Also in");
    await expect(page.getByTestId("where-now")).toContainText("Not set yet");
    expect(await accessibilityInBothThemes(page, page.url().replace(/^https?:\/\/[^/]+/, ""))).toEqual([]);

    // Two households: the switcher is in the sidebar, and says it changes it for everyone.
    const switcher = page.getByRole("complementary", { name: "Main" }).getByRole("button", { name: /^Household:/ });
    await expect(switcher).toBeVisible();
    await switcher.click();
    await expect(page.getByRole("menu").getByText("Changes it for everyone using this Outpost.")).toBeVisible();
    await page.getByRole("menuitemradio", { name: "E2E Caravan" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "E2E Caravan" })).toBeVisible();
    await expect(page.getByText("Current", { exact: true })).toBeVisible();
    const listed = await api(page, "GET", "/api/households");
    expect(listed.households.find((household: { id: string }) => household.id === listed.currentId).name).toBe("E2E Caravan");

    // Home says which household its lines are for.
    await page.goto("/");
    await expect(page.getByTestId("household-home-line")).toContainText("For E2E Caravan");
    await expect(page.getByTestId("household-home-line").getByRole("button", { name: "We're here now" })).toBeVisible();

    // Deleting it says what goes first, and nobody leaves the People list.
    await page.goto("/prepare/households");
    await page.getByRole("link", { name: "E2E Caravan" }).click();
    await page.getByRole("button", { name: "Delete E2E Caravan" }).click();
    const confirm = page.getByRole("alertdialog", { name: "Delete E2E Caravan?" });
    await expect(confirm).toContainText("Nobody is removed from the People list");
    await confirm.getByRole("button", { name: "Delete E2E Caravan" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Households" })).toBeVisible();
    await expect(page.getByRole("list", { name: "Households" }).getByRole("listitem")).toHaveCount(1);
    await expect(page.getByRole("list", { name: "People" })).toContainText("E2E Ann");
    await expect(page.getByRole("button", { name: /^Household:/ })).toHaveCount(0);
    // The one 409 is the server saying what a delete would take, before it is confirmed.
    expect(errors.filter((error) => !error.includes("status of 409"))).toEqual([]);
  });

  test("fits the window at 200% text", async ({ page }) => {
    await page.addInitScript(() => {
      const apply = () => document.documentElement.style.setProperty("font-size", "32px", "important");
      if (document.documentElement) apply();
      document.addEventListener("DOMContentLoaded", apply);
    });
    await page.goto("/");
    await api(page, "POST", "/api/households", { name: "E2E Gran's flat in town, with a long name" });
    await page.goto("/prepare/households");
    await expect(page.getByRole("heading", { level: 1, name: "Households" })).toBeVisible();
    await expect(page.getByRole("link", { name: "E2E Gran's flat in town, with a long name" })).toBeVisible();
    expect(await sideways(page)).toBeLessThanOrEqual(0);
    await page.getByRole("link", { name: "E2E Gran's flat in town, with a long name" }).click();
    await expect(page.getByRole("heading", { name: "People", exact: true })).toBeVisible();
    expect(await sideways(page)).toBeLessThanOrEqual(0);
  });
});
