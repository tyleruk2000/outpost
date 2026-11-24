/** Reachable from here in Safari on an iPhone: 8 hours on foot chosen with a finger (reach-times.ts). */
import { test } from "./fixtures";
import { eightHoursOnFoot } from "./reach-times";

test("reachable from here by touch: 8 hours on foot", async ({ page }, info) => {
  test.setTimeout(90_000);
  await eightHoursOnFoot(page, info, (target) => target.tap());
});
