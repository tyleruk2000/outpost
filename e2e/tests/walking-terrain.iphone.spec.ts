/** Walking over the terrain in Safari on an iPhone, with a finger (walking-terrain.ts). */
import { test } from "./fixtures";
import { walkingRouteOverHills, walkOverTerrain } from "./walking-terrain";

test("reachable on foot over the terrain, by touch", async ({ page }, info) => {
  test.setTimeout(180_000);
  await walkOverTerrain(page, info, (target) => target.tap(), false);
});

test.describe("on an iPad held upright", () => {
  // The panel's Directions form, as directions.iphone.spec.ts uses it. On a phone Directions is the picker and the route
  // sheet, and that sheet does not show a walk's climb yet (a follow-up), so the route over the hills is tried here.
  test.use({ viewport: { width: 820, height: 1180 } });

  test("a walking route timed over the hills, by touch", async ({ page }, info) => {
    test.setTimeout(180_000);
    await walkingRouteOverHills(page, info, (target) => target.tap(), false);
  });
});
