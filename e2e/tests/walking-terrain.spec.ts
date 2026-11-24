/** Walking over the terrain on the desktop (walking-terrain.ts): Reachable from here on foot to paper, and a walking route's hills to its route card. */
import { accessibilityInBothThemes } from "./a11y";
import { expect, test } from "./fixtures";
import { walkingRouteOverHills, walkOverTerrain } from "./walking-terrain";

test.describe("walking over the terrain", () => {
  test("reachable on foot over the terrain, clean in both themes, and the page of it", async ({ page }, info) => {
    test.setTimeout(240_000);
    await walkOverTerrain(
      page,
      info,
      (target) => target.click(),
      true,
      async () => {
        expect(await accessibilityInBothThemes(page, "/maps (reachable on foot)")).toEqual([]);
      },
    );
  });

  test("a walking route timed over the hills, with its climb, and its route card", async ({ page }, info) => {
    test.setTimeout(180_000);
    await walkingRouteOverHills(page, info, (target) => target.click(), true);
  });
});
