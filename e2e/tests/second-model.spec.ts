import { expect, test, watchForErrors } from "./fixtures";

// The ITU's P.533 is never shipped: the packaged app under test has no P.533 engine,
// and the maps here are three small stand-ins from the suite's own file server
// (apps/server/test/fixtures/propagation/p533-maps-stand-in.ts). This follows the
// download from the planner to "Manage and clean up". The engine's own tests, with the
// real maps, are in apps/server/test/propagation-p533*.test.ts.
test.describe("A second model (ITU P.533)", () => {
  test("is not offered until it is set up, and its maps download when asked and can be removed", async ({ page }) => {
    const errors = watchForErrors(page);
    await page.goto("/radio/propagation");
    await page.getByRole("button", { name: "Try London to Birmingham on 40 m" }).click();
    await expect(page.getByRole("heading", { name: "London to Birmingham" })).toBeVisible();
    const section = page.locator("section").filter({ has: page.getByRole("heading", { name: "Compare with a second model (ITU P.533)" }) });
    await expect(section).toBeVisible();
    // One line says what is missing; there is nothing to press for a comparison yet.
    await expect(
      section.getByText(/The second model \(ITU P\.533\) is not set up here\. To use it, .*download the ITU's P\.533 maps/),
    ).toBeVisible();
    await expect(section.getByRole("button", { name: "Compare with a second model (ITU P.533)" })).toHaveCount(0);

    await section.getByRole("button", { name: /Download the P\.533 maps/ }).click();
    // Once they are in, only the engine is missing: it is built on the computer, never shipped.
    await expect(section.getByText(/build the P\.533 engine on this computer/)).toBeVisible({ timeout: 20_000 });
    await expect(section.getByText(/download the ITU's P\.533 maps/)).toHaveCount(0);

    await page.goto("/storage/manage");
    await page.getByRole("tab", { name: "Installed" }).click();
    await page.getByRole("searchbox", { name: "Filter by name" }).fill("P.533");
    const list = page.getByRole("list", { name: "Everything installed" });
    await expect(list.getByRole("listitem")).toHaveCount(1);
    await page.getByRole("checkbox", { name: "Select ITU-R P.533 ionospheric and noise maps" }).click();
    await page.getByRole("button", { name: "Remove", exact: true }).click();
    await page.getByRole("dialog", { name: "Remove 1 item" }).getByRole("button", { name: "Remove 1 item" }).click();
    await expect(list.getByRole("listitem")).toHaveCount(0);

    await page.goto("/radio/propagation");
    await page.getByRole("button", { name: "Predict", exact: true }).click();
    await expect(section.getByText(/download the ITU's P\.533 maps/)).toBeVisible();
    expect(errors).toEqual([]);
  });
});
