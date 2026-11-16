import { adifLog } from "./adif";
import { api, expect, test, watchForErrors } from "./fixtures";

test.use({ viewport: { width: 390, height: 844 } });

test.describe("The contact log on a phone", () => {
  test("imports a file, fits a 390 px screen, and its buttons are a thumb high", async ({ page }) => {
    const errors = watchForErrors(page);
    await page.goto("/radio/log");
    await page.getByLabel("ADIF file to import").setInputFiles({ name: "phone.adi", mimeType: "text/plain", buffer: adifLog("M0PHN") });
    await expect(page.getByText(/^phone\.adi: \d entries brought in$/)).toBeVisible();
    await expect(page.getByText("M0PHN (IO91WM) to G4BBB (IO92BL)")).toBeVisible();
    await page.getByRole("button", { name: "Compare", exact: true }).click();
    await expect(page.getByRole("heading", { name: "What this can and cannot show" })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    for (const name of ["Log an entry", "Import an ADIF file", "Compare again"]) {
      const button = await page.getByRole("button", { name }).boundingBox();
      expect(button!.height, name).toBeGreaterThanOrEqual(44);
    }
    // The form for an entry fits too, with the map a tap away.
    await page.getByRole("button", { name: "Log an entry" }).click();
    const dialog = page.getByRole("dialog", { name: "Log an entry" });
    await expect(dialog.getByRole("button", { name: "Your station: where: choose on the map" })).toBeVisible();
    const box = await dialog.boundingBox();
    expect(box!.width).toBeLessThanOrEqual(390);
    await dialog.getByRole("button", { name: "Cancel" }).click();
    // Leave the log as it was found.
    const { imports } = await api(page, "GET", "/api/radio/observations");
    for (const item of imports as Array<{ id: string; fileName: string }>) {
      if (item.fileName === "phone.adi") await api(page, "DELETE", `/api/radio/observations/imports/${item.id}`);
    }
    expect(errors).toEqual([]);
  });

  test("every drop-down in the form for an entry opens over the form, and what is chosen is saved", async ({ page }) => {
    const errors = watchForErrors(page);
    // Two saved places, so that each end of the entry has a drop-down of them.
    const made: string[] = [];
    for (const [name, lat, lon] of [
      ["Log test hut", 54.5, -3.1],
      ["Log test summit", 54.6, -3.2],
    ] as const) {
      made.push((await api(page, "POST", "/api/maps/markers", { name, lat, lon })).marker.id);
    }
    await page.goto("/radio/log");
    await page.getByRole("button", { name: "Log an entry" }).tap();
    const dialog = page.getByRole("dialog", { name: "Log an entry" });
    await expect(dialog).toBeVisible();

    /** Opens a drop-down by touch, checks its list is on top where a finger lands, and takes an option. */
    const choose = async (name: string, option: string) => {
      await dialog.getByRole("combobox", { name }).tap();
      const item = page.getByRole("option", { name: option, exact: true });
      await expect(item).toBeVisible();
      const onTop = await item.evaluate((element) => {
        const box = element.getBoundingClientRect();
        return element.contains(document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2));
      });
      expect(onTop, `the list of “${name}” is drawn over the form`).toBe(true);
      await item.tap();
      await expect(page.getByRole("listbox")).toHaveCount(0);
    };

    await choose("What happened", "Heard, no contact");
    await expect(dialog.getByRole("combobox", { name: "What happened" })).toHaveText("Heard, no contact");
    await expect(dialog.getByText("The first station was heard at the second. Yours is the second.")).toBeVisible();
    await dialog.getByLabel("Frequency, MHz").fill("7.123");
    await dialog.getByLabel("The station heard: callsign").fill("M0HRD");
    await choose("The station heard: where: choose a saved place", "Log test summit");
    await expect(dialog.getByLabel("The station heard: where", { exact: true })).toHaveValue("54.60000, -3.20000");
    // A map opened over the form and closed again leaves the form as it was: the next drop-down still opens.
    await dialog.getByRole("button", { name: "Your station: where: choose on the map" }).tap();
    const picker = page.getByRole("dialog", { name: "Choose where your station is" });
    await expect(picker).toBeVisible();
    await picker.getByRole("button", { name: "Cancel" }).tap();
    await expect(picker).toBeHidden();
    await choose("Your station: where: choose a saved place", "Log test hut");
    await expect(dialog.getByLabel("Your station: where", { exact: true })).toHaveValue("54.50000, -3.10000");

    await dialog.getByRole("button", { name: "Add to the log" }).tap();
    await expect(dialog).toBeHidden();
    const row = page.getByRole("listitem").filter({ hasText: "M0HRD" });
    await expect(row).toContainText("7.123 MHz · SSB · Heard, no contact");
    await expect(row).toContainText("M0HRD (54.60, -3.20) to No callsign (54.50, -3.10)");

    // Leave the log and the map as they were found.
    const { observations } = await api(page, "GET", "/api/radio/observations");
    for (const item of observations as Array<{ id: string; tx: { call: string } }>) {
      if (item.tx.call === "M0HRD") await api(page, "DELETE", `/api/radio/observations/${item.id}`);
    }
    for (const id of made) await api(page, "DELETE", `/api/maps/markers/${id}`);
    expect(errors).toEqual([]);
  });
});
