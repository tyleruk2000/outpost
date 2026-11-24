/** A walk planned, saved, opened again and downloaded as GPX, on a desktop (route-gpx.ts). */
import { expect, test, watchForErrors } from "./fixtures";
import { planSaveReopenAndDownload } from "./route-gpx";

test("a walk with a via point is saved, opened as planned and saved as GPX", async ({ page }) => {
  test.setTimeout(120_000);
  const errors = watchForErrors(page);
  await planSaveReopenAndDownload(page, false);
  expect(errors).toEqual([]);
});
