import { expect, test, watchForErrors } from "./fixtures";
import { acceptanceFlow, clearNuclear, installCountryPack } from "./nuclear-acceptance";
import { removeReferencePacks } from "./reference-layers";

test.describe("Nuclear preparedness, the specification's acceptance sentence", () => {
  test.afterEach(async ({ page }) => {
    await removeReferencePacks(page);
  });

  test("a country pack from fixtures, its public and historical records, a scenario with people inside its rings, and a plan found again", async ({
    page,
    sealed,
  }) => {
    test.setTimeout(150_000);
    const errors = watchForErrors(page);
    await clearNuclear(page);
    await installCountryPack(page);
    await acceptanceFlow(page, false);
    expect(errors).toEqual([]);
    expect(sealed.external).toEqual([]);
  });
});
