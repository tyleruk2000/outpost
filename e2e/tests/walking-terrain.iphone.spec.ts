/** Walking over the terrain in Safari on an iPhone, with a finger (walking-terrain.ts). */
import { test } from "./fixtures";
import { walkingRouteOverHills, walkOverTerrain } from "./walking-terrain";

test("reachable on foot over the terrain, by touch", async ({ page }, info) => {
  test.setTimeout(180_000);
  await walkOverTerrain(page, info, (target) => target.tap(), false);
});

test("a walking route timed over the hills, by touch", async ({ page }, info) => {
  test.setTimeout(180_000);
  await walkingRouteOverHills(page, info, (target) => target.tap(), false);
});
