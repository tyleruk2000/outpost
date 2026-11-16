import { expect, test, watchForErrors } from "./fixtures";

// VOACAP's coefficients are not shipped. The server under test starts with the tests'
// copy in its data directory, as a set-up leaves it (playwright.config.ts). This removes
// them, finds the planner saying in one line what is missing, downloads them from the
// suite's own file server (the real files, under Outpost's own list and checksums), and
// predicts again with no restart. It leaves them installed, as it found them.
test.describe("VOACAP's data, which Outpost does not ship", () => {
  test("can be removed, is then offered as a download where the planner runs, and predicts again once fetched", async ({ page }) => {
    const errors = watchForErrors(page);
    await page.goto("/radio/propagation?tab=data");
    const row = page.getByRole("listitem").filter({ hasText: "Ionospheric and noise coefficients" });
    await expect(row.getByText(/Fetched when Outpost was set up on/)).toBeVisible();
    await row.getByRole("button", { name: "Remove" }).click();
    const confirm = page.getByRole("alertdialog", { name: "Remove VOACAP's data?" });
    await expect(
      confirm.getByText(/planner, coverage maps, radio plans and the log's comparison with predictions stop working/),
    ).toBeVisible();
    await confirm.getByRole("button", { name: "Remove the data" }).click();
    await expect(row.getByText("Missing")).toBeVisible();

    // Where the form runs: one calm line, the size, why, and a Download button.
    await page.getByRole("tab", { name: "Plan" }).click();
    const line = page.getByTestId("engine-data-line");
    await expect(line.getByText("VOACAP's ionospheric and noise maps are not on this computer yet (15 files, 559 kB).")).toBeVisible();
    await expect(line.getByText(/the ITU has not given Outpost permission to pass them on/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Predict", exact: true })).toBeDisabled();
    // The same line on the other screens that ask the engine.
    await page.goto("/radio/coverage");
    await expect(page.getByTestId("engine-data-line")).toBeVisible();

    await page.goto("/radio/propagation");
    await page.getByRole("button", { name: "Download (559 kB)" }).click();
    await expect(page.getByTestId("engine-data-line")).toHaveCount(0, { timeout: 20_000 });
    await page.getByRole("button", { name: "Try London to Birmingham on 40 m" }).click();
    await expect(page.getByRole("heading", { name: "London to Birmingham" })).toBeVisible();

    // Downloaded in the app, it is listed under "Manage and clean up", with what removing it does.
    await page.goto("/storage/manage");
    await page.getByRole("tab", { name: "Installed" }).click();
    await page.getByRole("searchbox", { name: "Filter by name" }).fill("VOACAP");
    await page.getByRole("checkbox", { name: "Select VOACAP ionospheric and noise coefficients" }).click();
    await page.getByRole("button", { name: "Remove", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Remove 1 item" });
    await expect(dialog.getByText(/HF propagation planner, coverage maps, radio plans/)).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel" }).click();

    await page.goto("/radio/propagation?tab=data");
    await expect(
      page
        .getByRole("listitem")
        .filter({ hasText: "Ionospheric and noise coefficients" })
        .getByText(/^Downloaded on/),
    ).toBeVisible();
    expect(errors).toEqual([]);
  });
});
