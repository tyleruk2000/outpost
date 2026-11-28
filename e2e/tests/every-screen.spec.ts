import { accessibilityInBothThemes } from "./a11y";
import { AT_LEAST, expectArrived, failing } from "./every-screen";
import { expect, test, watchForErrors } from "./fixtures";

/**
 * The screens whose title is not their name in the navigation: Home's is "Your library", a sentence about it, and
 * the set-up guide's is a sentence too long for a line of the sidebar ("Setting up search by meaning, answers and chat"),
 * and the Raspberry Pi's set-up is a part of the deployment guide, whose title is the guide's.
 */
const TITLED_OTHERWISE = new Set(["/", "/help/search-and-answers", "/help/deployment#h-on-a-raspberry-pi-step-by-step"]);

test.describe("every screen, on a wide screen", () => {
  test("is reached from Home by pressing only what the sidebar shows, and each parent screen links to those under it", async ({
    page,
  }, testInfo) => {
    test.setTimeout(600_000);
    const errors = watchForErrors(page);
    await page.goto("/");
    let heading = await expectArrived(page, "/", testInfo);
    const sidebar = page.getByRole("complementary", { name: "Main" });

    // A screen with others under it says so with a button; open each. What was opened is remembered.
    const closed = sidebar.getByRole("button", { name: /^Show the screens under / });
    await expect(closed.first()).toBeVisible();
    while ((await closed.count()) > 0) await closed.first().click();
    // One for each screen that has others under it: Search, Library, Maps, Tools, Preparedness, Games, Radio, Notes, Storage, Settings.
    await expect(sidebar.getByRole("button", { name: /^Hide the screens under / })).toHaveCount(10);

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
      // The sidebar names each screen by its own title, so that a person knows they are where they pressed.
      if (!TITLED_OTHERWISE.has(entry.path)) expect(heading, `the title of ${entry.path}`).toBe(entry.name);
      expect(failing(errors), `no error on ${entry.path}`).toEqual([]);
      // Checked in both themes; the walk at an address that is not secure shows the same screens.
      if (!testInfo.project.name.startsWith("not-secure")) {
        expect.soft(await accessibilityInBothThemes(page, entry.path), `no serious accessibility finding on ${entry.path}`).toEqual([]);
      }
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
