/** Reachable from here on the desktop: 8 hours on foot chosen with the mouse (reach-times.ts), the card clean in both themes. */
import { accessibilityInBothThemes } from "./a11y";
import { expect, test } from "./fixtures";
import { eightHoursOnFoot } from "./reach-times";

test("reachable from here: 8 hours on foot, each way with its own times", async ({ page }, info) => {
  test.setTimeout(90_000);
  await eightHoursOnFoot(
    page,
    info,
    (target) => target.click(),
    async () => {
      expect(await accessibilityInBothThemes(page, "/maps (reachable, 8 hours on foot)")).toEqual([]);
    },
  );
});
