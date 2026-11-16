import { adifLog, longAdifLog } from "./adif";
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

  test("the drop-down in the form for an entry works with a mouse and with the keyboard", async ({ page }) => {
    const errors = watchForErrors(page);
    await page.goto("/radio/log");
    await page.getByRole("button", { name: "Log an entry" }).click();
    const dialog = page.getByRole("dialog", { name: "Log an entry" });
    const what = dialog.getByRole("combobox", { name: "What happened" });

    // With a mouse: the list is over the form, where the pointer is.
    await what.click();
    const item = page.getByRole("option", { name: "Called, not heard" });
    await expect(item).toBeVisible();
    expect(
      await item.evaluate((element) => {
        const box = element.getBoundingClientRect();
        return element.contains(document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2));
      }),
    ).toBe(true);
    await item.click();
    await expect(what).toHaveText("Called, not heard");

    // With the keyboard: opened from the field, moved through with the arrows, taken with Enter.
    await what.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("listbox")).toBeVisible();
    // The list opens with the focus on the one chosen, a moment after it appears; the arrows move from there.
    await expect(page.getByRole("option", { name: "Called, not heard" })).toBeFocused();
    await page.keyboard.press("ArrowUp");
    await expect(page.getByRole("option", { name: "Heard, no contact" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(what).toHaveText("Heard, no contact");
    await expect(page.getByRole("listbox")).toHaveCount(0);
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
    expect(errors).toEqual([]);
  });

  test("a long log is brought in by a job, and is in the log whole or not at all", async ({ page, request }) => {
    const errors = watchForErrors(page);
    await page.goto("/radio/log");
    await expect(page.getByRole("heading", { level: 1, name: "Contact log" })).toBeVisible();
    const buffer = longAdifLog("G4LNG", 4000);
    expect(buffer.length).toBeGreaterThan(128 * 1024);
    await page.getByLabel("ADIF file to import").setInputFiles({ name: "years.adi", mimeType: "text/plain", buffer });
    // The job is quick; what must be seen is its end, said in the same words as a small file's.
    await expect(page.getByText("years.adi: 4,000 entries brought in")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/4,000 records in the file.* 4,000 brought in, 0 already in the log, 0 left out\./)).toBeVisible();
    await expect(page.getByRole("progressbar", { name: "Log read" })).toHaveCount(0);
    const jobs = (await (await request.get("/api/jobs?limit=50")).json()).jobs as Array<{ type: string; state: string; title: string }>;
    expect(jobs.find((job) => job.type === "propagation.adif-import")).toMatchObject({
      state: "succeeded",
      title: "Contact log from years.adi",
    });

    // Taken back, all of it goes.
    await page.getByRole("button", { name: "Take back years.adi" }).click();
    const confirm = page.getByRole("alertdialog");
    await expect(confirm).toContainText("The 4,000 entries that “years.adi” brought in will be removed from the log.");
    await confirm.getByRole("button", { name: "Take back" }).click();
    await expect(confirm).toBeHidden();
    await expect(page.getByRole("button", { name: "Take back years.adi" })).toHaveCount(0);
    expect(errors).toEqual([]);
  });
});
