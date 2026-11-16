import type { Page } from "@playwright/test";
import { api, expect, test, watchForErrors } from "./fixtures";

test.use({ viewport: { width: 390, height: 844 } });

/** Where screenshots go when OUTPOST_E2E_SHOTS names a folder; none are taken otherwise. */
const shots = process.env.OUTPOST_E2E_SHOTS;

async function addDevice(page: Page, search: string, name: RegExp) {
  await page.getByRole("button", { name: "Add a device" }).click();
  const picker = page.getByRole("dialog", { name: "Add a device" });
  await picker.getByLabel("Find a device").fill(search);
  await picker.getByRole("button", { name }).click();
  await expect(picker).toBeHidden();
}

test.describe("Battery runtime from common devices, on a phone", () => {
  test("a Raspberry Pi, two phones and a radio: the answers, a plan made from them, and the sources in the plan", async ({ page }) => {
    const errors = watchForErrors(page);
    await page.goto("/tools/power");
    await page.getByText("Battery runtime").click();
    const runtime = page.locator("#calc-runtime");

    await addDevice(page, "pi 5", /^Raspberry Pi 5\s?:/);
    await addDevice(page, "iphone 16", /^iPhone 16\s?:/);
    await addDevice(page, "iphone 16", /^iPhone 16\s?:/);
    await addDevice(page, "ft-65", /^Yaesu FT-65\s?:/);

    // The worked example in docs/tools-power.md: 100 Ah at 12.8 V, 80% usable, three days.
    await expect(runtime.getByText("6.3 days (151 hours)")).toBeVisible();
    await expect(runtime.getByText("45 instead, 23 besides")).toBeVisible();
    await expect(
      runtime.getByText(
        /for 3 days, you can run the Raspberry Pi 5 and the Yaesu FT-65 as set, and charge each iPhone 16 up to 3.9 times a day/,
      ),
    ).toBeVisible();
    await expect(runtime.getByRole("table", { name: /Watt-hours a day from the battery/ })).toContainText("Raspberry Pi 5");

    // A drop-down in the list: the Pi at the most it should draw makes every answer "at least".
    await runtime.getByLabel("Figure").click();
    await page.getByRole("option", { name: /At most, the recommended supply/ }).click();
    await expect(runtime.getByText("At least", { exact: true })).toBeVisible();
    await runtime.getByLabel("Figure").click();
    await page.getByRole("option", { name: /Bare board, typical/ }).click();
    await expect(runtime.getByText("At least", { exact: true })).toBeHidden();

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    expect((await page.getByRole("button", { name: "Add a device" }).boundingBox())!.height).toBeGreaterThanOrEqual(44);
    if (shots) {
      await runtime.screenshot({ path: `${shots}/runtime-phone.png` });
      await page.getByRole("button", { name: "Add a device" }).click();
      await page.getByRole("dialog", { name: "Add a device" }).getByLabel("Find a device").fill("yaesu");
      await page.screenshot({ path: `${shots}/picker-phone.png` });
      await page.getByRole("dialog", { name: "Add a device" }).getByRole("button", { name: "Done" }).click();
    }

    await runtime.getByRole("button", { name: "Make this a plan" }).click();
    const naming = page.getByRole("dialog", { name: "Make this a plan" });
    await naming.getByLabel("Name").fill("Power cut at home");
    await naming.getByRole("button", { name: "Create plan" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Power cut at home" })).toBeVisible();

    // The plan cites where each figure came from.
    await expect(page.getByText(/From the library: Raspberry Pi 5, the maker's typical figure/)).toBeVisible();
    const pi = page.getByRole("listitem").filter({ hasText: "From the library: Raspberry Pi 5" });
    await pi.getByText("Where these figures come from").click();
    await expect(pi.getByText(/Raspberry Pi Ltd, Raspberry Pi documentation/).first()).toBeVisible();
    await expect(page.getByText(/From the library: iPhone 16/)).toBeVisible();
    await expect(page.getByRole("heading", { name: "USB converter" })).toBeVisible();
    const planOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(planOverflow).toBeLessThanOrEqual(0);
    if (shots) await page.screenshot({ path: `${shots}/plan-phone.png`, fullPage: true });

    const { plans } = await api(page, "GET", "/api/power/plans");
    expect(plans[0].loads.map((load: { origin?: { id: string } }) => load.origin?.id)).toEqual([
      "raspberry-pi-5",
      "iphone-16",
      "yaesu-ft-65",
    ]);
    for (const plan of plans) await api(page, "DELETE", `/api/power/plans/${plan.id}`);
    expect(errors).toEqual([]);
  });

  test("a device of one's own is kept, and offered next time", async ({ page }) => {
    const errors = watchForErrors(page);
    await page.goto("/tools/power");
    await page.getByText("Battery runtime").click();
    await page.getByRole("button", { name: "Add a device" }).click();
    const picker = page.getByRole("dialog", { name: "Add a device" });
    await picker.getByRole("button", { name: "Add a device of your own" }).click();
    const own = page.getByRole("dialog", { name: "A device of your own" });
    await own.getByLabel("Name").fill("Shed lamp");
    await own.getByLabel("Power while on").fill("6");
    // A drop-down inside a dialog inside a dialog.
    await own.getByLabel("Supplied").click();
    await page.getByRole("option", { name: /Over USB/ }).click();
    await own.getByRole("button", { name: "Keep device" }).click();
    await expect(page.locator("#calc-runtime").getByText(/Your own figure/)).toBeVisible();

    await page.reload();
    await page.getByText("Battery runtime").click();
    await page.getByRole("button", { name: "Add a device" }).click();
    await expect(page.getByRole("dialog", { name: "Add a device" }).getByRole("region", { name: "Your own devices" })).toContainText(
      "Shed lamp",
    );
    const { devices } = await api(page, "GET", "/api/power/devices");
    expect(devices).toMatchObject([{ name: "Shed lamp", kind: "run", watts: 6, supply: "usb" }]);
    for (const device of devices) await api(page, "DELETE", `/api/power/devices/${device.id}`);
    expect(errors).toEqual([]);
  });
});
