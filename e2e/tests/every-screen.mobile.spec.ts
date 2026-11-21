import { accessibilityInBothThemes } from "./a11y";
import { AT_LEAST, expectArrived, failing } from "./every-screen";
import { expect, test, watchForErrors } from "./fixtures";

test.describe("every screen, on a phone", () => {
  test("is reached from Home by pressing only the bottom bar and the More sheet, and none scrolls sideways", async ({ page }, testInfo) => {
    test.setTimeout(600_000);
    const errors = watchForErrors(page);
    await page.goto("/");
    let heading = await expectArrived(page, "/", testInfo);
    const bar = page.getByRole("navigation", { name: "Main" });
    const sheet = page.getByRole("dialog", { name: "More" });

    const tabs = await bar.getByRole("link").evaluateAll((all) => all.map((link) => link.getAttribute("href") ?? ""));
    await bar.getByRole("button", { name: "More" }).click();
    // The screens under each heading are folded away until asked for: open every group.
    const closed = sheet.getByRole("button", { name: /^Show the screens under / });
    while ((await closed.count()) > 0) await closed.first().click();
    const entries = await sheet.getByRole("link").evaluateAll((all) =>
      all.map((link) => ({
        path: link.getAttribute("href") ?? "",
        under: link.closest("ul[aria-label^='Under ']")?.getAttribute("aria-label")?.slice("Under ".length) ?? null,
      })),
    );
    const more = entries.map((entry) => entry.path);
    const parentOf = new Map(entries.map((entry) => [entry.path, entry.under]));
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
    expect([...tabs, ...more]).toEqual(expect.arrayContaining(AT_LEAST.map(([, path]) => path)));

    const walk: Array<[string, "tab" | "more"]> = [
      ...tabs.map((path) => [path, "tab"] as [string, "tab"]),
      ...more.map((path) => [path, "more"] as [string, "more"]),
    ];
    for (const [path, where] of walk) {
      if (where === "tab") {
        await bar.locator(`a[href="${path}"]`).click();
      } else {
        await bar.getByRole("button", { name: "More" }).click();
        const link = sheet.locator(`a[href="${path}"]`).first();
        // The group of the screen in view opens by itself; any other is opened by its button.
        const parent = parentOf.get(path);
        if (parent && !(await link.isVisible())) await sheet.getByRole("button", { name: `Show the screens under ${parent}` }).click();
        await link.click();
        await expect(sheet).toBeHidden();
      }
      // Home is where the walk starts, so pressing it changes nothing.
      heading = await expectArrived(page, path, testInfo, path === "/" ? undefined : heading);
      const sideways = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(sideways, `${path} scrolls sideways`).toBeLessThanOrEqual(1);
      expect(failing(errors), `no error on ${path}`).toEqual([]);
      // Checked in both themes; the walk at an address that is not secure shows the same screens.
      if (!testInfo.project.name.startsWith("not-secure")) {
        expect.soft(await accessibilityInBothThemes(page, path), `no serious accessibility finding on ${path}`).toEqual([]);
      }
    }
  });
});
