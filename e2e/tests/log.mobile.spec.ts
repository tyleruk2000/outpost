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
});
