/**
 * Prepare › Households on a phone: reached from the More sheet, a person added on the
 * household's page, every control a finger can reach (44 px), the switcher at the top of
 * the More sheet with two households, and the accessibility check in both themes.
 */
import { accessibilityInBothThemes } from "./a11y";
import { api, expect, test, watchForErrors } from "./fixtures";
import { backToOneHousehold, sideways } from "./households";
import { auditLayout } from "./layout-audit";

test.use({ viewport: { width: 390, height: 844 } });

test.describe("Households on a phone", () => {
  test.afterEach(async ({ page }) => {
    await backToOneHousehold(page);
  });

  test("adds a person, fits the screen, and changes the household from the More sheet", async ({ page }) => {
    test.setTimeout(120_000);
    const errors = watchForErrors(page);
    await page.goto("/");
    await backToOneHousehold(page);

    await page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: "More" }).tap();
    const more = page.getByRole("dialog", { name: "More" });
    // With one household, no switcher.
    await expect(more.getByRole("button", { name: /^Household:/ })).toHaveCount(0);
    await more.getByRole("button", { name: "Show the screens under Preparedness" }).tap();
    await more.locator('a[href="/prepare/households"]').first().tap();
    await expect(page.getByRole("heading", { level: 1, name: "Households" })).toBeVisible();

    // The first household's page: a person added with the same rows as Supplies had.
    await page.getByRole("list", { name: "Households" }).getByRole("link").first().tap();
    const people = page.getByRole("list", { name: /^People of / });
    await page.getByRole("button", { name: "Add a person" }).tap();
    await people.getByLabel(/^Name/).last().fill("E2E Bea");
    await page.getByRole("button", { name: "Save people" }).tap();
    await expect(page.getByText(/^The people of .* saved\.$/)).toBeVisible();
    expect((await api(page, "GET", "/api/people")).people.some((person: { name: string }) => person.name === "E2E Bea")).toBe(true);

    expect(await sideways(page)).toBeLessThanOrEqual(0);
    const findings = await page.evaluate(auditLayout, { shell: ["header.bg-spine", 'nav[aria-label="Main"]'] });
    expect(findings.filter((finding) => !finding.shell && finding.kind === "small-target")).toEqual([]);
    expect(await accessibilityInBothThemes(page, "/prepare/households/:id")).toEqual([]);

    // A second household: the switcher is at the top of the More sheet.
    await api(page, "POST", "/api/households", { name: "E2E Caravan", kind: "portable" });
    await page.goto("/prepare/households");
    await expect(page.getByRole("list", { name: "Households" }).getByRole("listitem")).toHaveCount(2);
    const findingsList = await page.evaluate(auditLayout, { shell: ["header.bg-spine", 'nav[aria-label="Main"]'] });
    expect(findingsList.filter((finding) => !finding.shell && finding.kind === "small-target")).toEqual([]);
    expect(await accessibilityInBothThemes(page, "/prepare/households")).toEqual([]);
    await page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: "More" }).tap();
    await more.getByRole("button", { name: /^Household:/ }).tap();
    await expect(page.getByRole("menu").getByText("Changes it for everyone using this Outpost.")).toBeVisible();
    await page.getByRole("menuitemradio", { name: "E2E Caravan" }).tap();
    await expect(page.getByRole("dialog", { name: "More" })).toBeHidden();
    await expect
      .poll(async () => {
        const listed = await api(page, "GET", "/api/households");
        return listed.households.find((household: { id: string }) => household.id === listed.currentId).name;
      })
      .toBe("E2E Caravan");
    expect(errors).toEqual([]);
  });
});
