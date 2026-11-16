import type { Page } from "@playwright/test";
import { expect, test, watchForErrors } from "./fixtures";

/** Where screenshots go when OUTPOST_E2E_SHOTS names a folder; none are taken otherwise. */
const shots = process.env.OUTPOST_E2E_SHOTS;

async function addDevice(page: Page, search: string, name: RegExp) {
  await page.getByRole("button", { name: "Add a device" }).click();
  const picker = page.getByRole("dialog", { name: "Add a device" });
  await picker.getByLabel("Find a device").fill(search);
  await picker.getByRole("button", { name }).click();
  await expect(picker).toBeHidden();
}

test.describe("Battery runtime from common devices, on a desktop", () => {
  test("the same answers at desktop width", async ({ page }) => {
    const errors = watchForErrors(page);
    await page.goto("/tools/power");
    await page.getByText("Battery runtime").click();
    await addDevice(page, "pi 5", /^Raspberry Pi 5\s?:/);
    await addDevice(page, "iphone 16", /^iPhone 16\s?:/);
    await addDevice(page, "ic-7300", /^Icom IC-7300\s?:/);
    await expect(page.locator("#calc-runtime").getByText("Runs what runs", { exact: true })).toBeVisible();
    if (shots) await page.locator("#calc-runtime").screenshot({ path: `${shots}/runtime-desktop.png` });
    expect(errors).toEqual([]);
  });
});
