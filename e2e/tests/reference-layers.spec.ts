import { expect, test, watchForErrors } from "./fixtures";
import { referenceLayersFlow, removeReferencePacks } from "./reference-layers";

test.describe("reference layers", () => {
  test.afterEach(async ({ page }) => {
    await removeReferencePacks(page);
  });

  test("imports a file of shelters, draws it, opens a record with its source, with nothing fetched from the internet", async ({
    page,
    sealed,
  }, testInfo) => {
    const errors = watchForErrors(page);
    await referenceLayersFlow(page, testInfo, false);
    expect(errors).toEqual([]);
    expect(sealed.external).toEqual([]);
  });
});
