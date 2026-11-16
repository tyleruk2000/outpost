import { AT_LEAST, expectArrived, failing } from "./every-screen";
import { expect, test, watchForErrors } from "./fixtures";

test.describe("every screen, on a phone", () => {
  test("is reached from Home by pressing only the bottom bar and the More sheet, and none scrolls sideways", async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    const errors = watchForErrors(page);
    await page.goto("/");
    let heading = await expectArrived(page, "/", testInfo);
    const bar = page.getByRole("navigation", { name: "Main" });
    const sheet = page.getByRole("dialog", { name: "More" });

    const tabs = await bar.getByRole("link").evaluateAll((all) => all.map((link) => link.getAttribute("href") ?? ""));
    await bar.getByRole("button", { name: "More" }).click();
    const more = await sheet
      .getByRole("list")
      .first()
      .getByRole("link")
      .evaluateAll((all) => all.map((link) => link.getAttribute("href") ?? ""));
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
        await sheet.locator(`a[href="${path}"]`).first().click();
        await expect(sheet).toBeHidden();
      }
      // Home is where the walk starts, so pressing it changes nothing.
      heading = await expectArrived(page, path, testInfo, path === "/" ? undefined : heading);
      const sideways = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(sideways, `${path} scrolls sideways`).toBeLessThanOrEqual(1);
      expect(failing(errors), `no error on ${path}`).toEqual([]);
    }
  });
});
