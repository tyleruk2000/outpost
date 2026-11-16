import { api, expect, test, watchForErrors } from "./fixtures";
import { acceptanceFlow, clearNuclear, GROUND_ZERO, installCountryPack, openTab } from "./nuclear-acceptance";
import { removeReferencePacks } from "./reference-layers";

test.use({ viewport: { width: 390, height: 844 } });

test.describe("Nuclear preparedness on a phone", () => {
  test.afterEach(async ({ page }) => {
    await removeReferencePacks(page);
  });

  test("the acceptance sentence at phone width, with nothing fetched from the internet", async ({ page, sealed }) => {
    test.setTimeout(150_000);
    const errors = watchForErrors(page);
    await clearNuclear(page);
    await installCountryPack(page);
    await acceptanceFlow(page, true);
    expect(errors).toEqual([]);
    expect(sealed.external).toEqual([]);
  });

  test("three scenarios on the map, each with its own letter, switched between, saved as a set and opened again", async ({ page }) => {
    test.setTimeout(120_000);
    const errors = watchForErrors(page);
    await clearNuclear(page);
    await page.goto("/prepare/nuclear");
    await page.getByLabel("Name", { exact: true }).fill("Small");
    await page.getByLabel("Ground zero", { exact: true }).fill(`${GROUND_ZERO.lat}, ${GROUND_ZERO.lon}`);
    await page.getByLabel("Wind from, degrees", { exact: true }).fill("270");
    await page.getByLabel("Wind speed", { exact: true }).fill("24");
    for (const [name, lon, yieldKt] of [
      ["Middle", GROUND_ZERO.lon + 0.05, "50"],
      ["Large", GROUND_ZERO.lon + 0.1, "200"],
    ] as const) {
      await page.getByRole("button", { name: "Add another scenario" }).click();
      await page.getByLabel("Name", { exact: true }).fill(name);
      await page.getByLabel("Ground zero", { exact: true }).fill(`${GROUND_ZERO.lat}, ${lon}`);
      await page.getByLabel("Yield", { exact: true }).fill(yieldKt);
    }
    const list = page.getByRole("list", { name: "Scenarios on the map" });
    await expect(list.getByRole("listitem")).toHaveCount(3);
    // The compact switcher under the map, and every letter in the map's key.
    await page.getByRole("radiogroup", { name: "Scenario being edited" }).getByRole("radio", { name: "A" }).click();
    await expect(page.getByRole("heading", { level: 2, name: "Small" })).toBeVisible();
    await expect(page.getByTestId("fallout-state")).toContainText("Drawn: wind from the west");
    const key = page.getByRole("list", { name: "Scenarios drawn, by letter" });
    for (const name of ["Small", "Middle", "Large"]) await expect(key).toContainText(name);
    // No figure across them, anywhere on the screen.
    await expect(page.locator("body")).not.toContainText(/in total|altogether|all of them together/i);
    // What a thumb presses is 44 px tall, and nothing is wider than the screen.
    for (const name of ["Hide A on the map", "Remove C from the map", "Add another scenario"]) {
      const box = await page.getByRole("button", { name }).boundingBox();
      expect(box!.height, name).toBeGreaterThanOrEqual(44);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);

    await openTab(page, /Saved/);
    await page.getByLabel("Name of the set").fill("Three at the fixture");
    await page.getByRole("button", { name: /Save the 3 scenarios on the map as a set/ }).click();
    await expect(page.getByText("Three at the fixture").first()).toBeVisible();
    const sets = (await api(page, "GET", "/api/nuclear/sets")).sets as Array<{ members: Array<{ letter: string }> }>;
    expect(sets[0]!.members.map((member) => member.letter)).toEqual(["A", "B", "C"]);

    await page.reload();
    await openTab(page, /Saved/);
    await page.getByRole("button", { name: "Open the set" }).click();
    await expect(page.getByRole("list", { name: "Scenarios on the map" }).getByRole("listitem")).toHaveCount(3);
    await expect(page.getByRole("list", { name: "Scenarios on the map" })).toContainText("Large");
    // Both scenarios on paper, under their letters.
    await expect(page.getByRole("heading", { name: "The 3 scenarios shown, on paper" })).toBeVisible();
    expect(errors).toEqual([]);
  });
});

test.describe("Nuclear preparedness at 320 px with the text at 150%", () => {
  test.use({ viewport: { width: 320, height: 568 } });

  test("the key to the colours and the wind field fit the screen", async ({ page }) => {
    test.setTimeout(90_000);
    await page.addInitScript(() => {
      const apply = () => document.documentElement.style.setProperty("font-size", "24px", "important");
      if (document.documentElement) apply();
      document.addEventListener("DOMContentLoaded", apply);
    });
    await page.goto("/prepare/nuclear");
    await page.getByLabel("Ground zero", { exact: true }).fill(`${GROUND_ZERO.lat}, ${GROUND_ZERO.lon}`);
    await page.getByLabel("Wind from, degrees", { exact: true }).fill("270");
    await page.getByLabel("Wind speed", { exact: true }).fill("24");
    const key = page.getByRole("list", { name: "How the map draws each kind of effect" });
    for (const name of ["Blast", "Burns (heat)", "Initial radiation", "Fireball, crater", "Fallout (idealised)"]) {
      const item = key.getByRole("listitem").filter({ hasText: name });
      await expect(item).toBeVisible();
      const box = (await item.boundingBox())!;
      expect(box.x + box.width, name).toBeLessThanOrEqual(320);
    }
    await expect(page.getByTestId("fallout-state")).toBeVisible();
    // What reaches past the right of the screen, named in the message if anything does.
    const wide = await page.evaluate(() =>
      [...document.querySelectorAll("body *")]
        .filter(
          (element) =>
            (!element.closest("svg") || element.tagName.toLowerCase() === "svg") &&
            !element.closest("nav") &&
            !element.closest("[role=tablist]"),
        )
        .map((element) => ({ element, box: element.getBoundingClientRect() }))
        .filter(({ box }) => box.width > 0 && box.right > document.documentElement.clientWidth + 1)
        // The outermost that reaches past: its parent does not.
        .filter(({ element }) => (element.parentElement?.getBoundingClientRect().right ?? 0) <= document.documentElement.clientWidth + 1)
        .slice(0, 8)
        .map(
          ({ element, box }) =>
            `${element.tagName.toLowerCase()} "${(element.textContent ?? "").trim().slice(0, 40)}" to ${Math.round(box.right)}`,
        ),
    );
    expect(wide).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  });
});
