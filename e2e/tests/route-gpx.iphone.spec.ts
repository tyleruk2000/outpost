/** A walk planned, saved, opened again and downloaded as GPX, by touch in Safari on an iPhone (route-gpx.ts). */
import { expect, test, watchForErrors } from "./fixtures";
import { planSaveReopenAndDownload } from "./route-gpx";

test("by touch: a walk with a via point is saved, opened as planned and saved as GPX", async ({ page }) => {
  test.setTimeout(150_000);
  const errors = watchForErrors(page);
  await planSaveReopenAndDownload(page, true);
  expect(errors).toEqual([]);
});
