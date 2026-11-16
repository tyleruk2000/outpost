import { adifLog } from "./adif";
import { expect, test, watchForErrors } from "./fixtures";

test.describe("The contact log", () => {
  test("an ADIF file is read, every record is accounted for, and the log is set beside the engine's predictions", async ({ page }) => {
    const errors = watchForErrors(page);
    await page.goto("/radio");
    await page
      .getByRole("link", { name: /Contact log/ })
      .first()
      .click();
    await expect(page.getByRole("heading", { level: 1, name: "Contact log" })).toBeVisible();

    const file = { name: "november.adi", mimeType: "text/plain", buffer: adifLog("G4DSK") };
    await page.getByLabel("ADIF file to import").setInputFiles(file);
    await expect(page.getByText("november.adi: 4 entries brought in")).toBeVisible();
    await expect(
      page.getByText(
        /7 records in the file, which says it is ADIF 3\.1\.8, written by E2ELog\. 4 brought in, 1 already in the log, 2 left out\./,
      ),
    ).toBeVisible();
    const reasons = page.getByRole("list", { name: "Records left out, by reason" });
    await expect(reasons.getByRole("listitem")).toHaveText([
      "No callsign for the station contacted (CALL): 1",
      "The date or the time is not one the specification allows: 1",
    ]);
    // A position is what the file stated, or nothing.
    await expect(page.getByText("G4DSK (IO91WM) to G4BBB (IO92BL)")).toBeVisible();
    await expect(page.getByText("G4DSK (IO91WM) to EA3XYZ (no position)")).toBeVisible();
    await expect(page.getByText(/16 Nov 2026, 12:04 UTC · 7\.100 MHz · SSB · Contact/)).toBeVisible();

    // The same file again adds nothing.
    await page.getByLabel("ADIF file to import").setInputFiles(file);
    await expect(page.getByText("november.adi: 0 entries brought in")).toBeVisible();
    await expect(page.getByText(/7 records in the file.* 0 brought in, 5 already in the log, 2 left out\./)).toBeVisible();

    // Compared with the engine: one entry has all it needs, and with one compared there are counts and no percentages.
    await page.getByRole("button", { name: "Compare", exact: true }).click();
    await expect(page.getByText(/^1 of \d+ entries could be compared with a prediction\.$/)).toBeVisible();
    await expect(page.getByText(/With fewer than 30 compared, no percentages are given/)).toBeVisible();
    const left = page.getByRole("list", { name: "Entries left out, by reason" });
    await expect(left).toContainText("One end or both have no stated position: 1");
    await expect(left).toContainText("PROP_MODE SAT");
    await expect(left).toContainText("No power was logged, and none was given to assume: 1");
    const compared = page.getByRole("table", { name: "Each entry compared, with the engine's figures for it" });
    await expect(compared.getByRole("row", { name: /G4DSK to G4BBB/ })).toContainText(/\d+% at 12:00, SSN 83/);
    await expect(page.getByText("These counts do not adjust the engine in any way.")).toBeVisible();

    // Taking the first file back (the older of the two) removes the four entries it brought in.
    await page.getByRole("button", { name: "Take back november.adi" }).last().click();
    const confirm = page.getByRole("alertdialog");
    await expect(confirm).toContainText("The 4 entries that “november.adi” brought in will be removed from the log.");
    await confirm.getByRole("button", { name: "Take back" }).click();
    await expect(confirm).toBeHidden();
    await expect(page.getByText("G4DSK (IO91WM) to G4BBB (IO92BL)")).toHaveCount(0);
    expect(errors).toEqual([]);
  });
});
