import { AT_LEAST, expectArrived, failing } from "./every-screen";
import { expect, test, watchForErrors } from "./fixtures";

test.describe("every screen, on a wide screen", () => {
  test("is reached from Home by pressing only what the sidebar shows, and each parent screen links to those under it", async ({
    page,
  }, testInfo) => {
    test.setTimeout(120_000);
    const errors = watchForErrors(page);
    await page.goto("/");
    let heading = await expectArrived(page, "/", testInfo);
    const sidebar = page.getByRole("complementary", { name: "Main" });

    // A screen with others under it says so with a button; open each. What was opened is remembered.
    const closed = sidebar.getByRole("button", { name: /^Show the screens under / });
    await expect(closed.first()).toBeVisible();
    while ((await closed.count()) > 0) await closed.first().click();
    // One more each time a section gains its first screen: Preparedness did with Supplies.
    await expect(sidebar.getByRole("button", { name: /^Hide the screens under / })).toHaveCount(6);

    const links = sidebar.locator('nav[aria-label="Knowledge"] a, nav[aria-label="Upkeep"] a');
    const screens = await links.evaluateAll((all) =>
      all.map((link) => ({
        name: link.textContent?.trim() ?? "",
        path: link.getAttribute("href") ?? "",
        child: link.closest("ul[aria-label^='Under ']") !== null,
      })),
    );
    expect(screens.map((entry) => entry.path)).toEqual(expect.arrayContaining(AT_LEAST.map(([, path]) => path)));

    for (const [index, entry] of screens.entries()) {
      await sidebar.locator(`nav a[href="${entry.path}"]`).click();
      // Home is where the walk starts, so pressing it changes nothing.
      heading = await expectArrived(page, entry.path, testInfo, index === 0 && entry.path === "/" ? undefined : heading);
      expect(failing(errors), `no error on ${entry.path}`).toEqual([]);
    }

    // Each parent screen says where the screens under it are, in its own content, not only in the sidebar.
    const parents = screens.filter((item, index) => !item.child && screens[index + 1]?.child);
    for (const owner of parents) {
      await sidebar.locator(`nav a[href="${owner.path}"]`).click();
      heading = await expectArrived(page, owner.path, testInfo, heading);
      const under = screens.slice(screens.indexOf(owner) + 1);
      for (const entry of under.slice(
        0,
        under.findIndex((item) => !item.child) === -1 ? undefined : under.findIndex((item) => !item.child),
      )) {
        await expect(page.locator(`#content a[href="${entry.path}"]`).first(), `${owner.name} links to ${entry.name}`).toBeVisible();
      }
    }
    expect(failing(errors)).toEqual([]);
  });
});
