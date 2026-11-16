import { expect, test, watchForErrors } from "./fixtures";
import { referenceLayersFlow, removeReferencePacks } from "./reference-layers";

test.describe("reference layers on a phone", () => {
  test.afterEach(async ({ page }) => {
    await removeReferencePacks(page);
  });

  test("imports, draws and opens a record at phone width, with nothing fetched from the internet", async ({ page, sealed }, testInfo) => {
    const errors = watchForErrors(page);
    await referenceLayersFlow(page, testInfo, true);
    expect(errors).toEqual([]);
    expect(sealed.external).toEqual([]);
  });
});
