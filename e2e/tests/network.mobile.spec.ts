/**
 * Devices on this network, on a phone. The server under test is given a made-up home
 * network (OUTPOST_NETWORK_STAND_IN in playwright.config.ts): the scan runs at its real
 * rate through the real job, and nothing is sent onto any network.
 */
import { expect, test, watchForErrors } from "./fixtures";

test.use({ viewport: { width: 390, height: 844 } });

test.describe("Devices on this network, on a phone", () => {
  test("says what it will do, scans, lists what answered, and keeps a name given to a device", async ({ page }) => {
    const errors = watchForErrors(page);
    await page.goto("/tools/network");
    await expect(page.getByRole("heading", { level: 1, name: "Devices on this network" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "What a scan does" })).toBeVisible();
    await expect(page.getByText("192.168.77.0/28")).toBeVisible();
    await expect(page.getByText(/13 addresses asked/)).toBeVisible();

    const look = page.getByRole("button", { name: /Look for devices|Look again/ }).first();
    expect((await look.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await look.tap();

    // A scan of a /28 at 20 probes a second takes a couple of seconds.
    const rows = page.getByTestId("network-device");
    await expect(rows.first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/Last looked .*probes sent in/)).toBeVisible();
    await expect(page.getByText("This computer", { exact: true })).toBeVisible();
    const router = rows.filter({ hasText: "Your router" });
    await expect(router).toContainText("router.home");
    const nas = rows.filter({ hasText: "192.168.77.12" });
    await expect(nas).toContainText("File sharing");
    await expect(nas.getByRole("link", { name: /Open its web page/ })).toHaveAttribute("href", "http://192.168.77.12:5000/");

    await nas.getByRole("button", { name: /Name and note/ }).tap();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Your name for it").fill("Shed NAS");
    await dialog.getByLabel("Note").fill("Behind the paint tins.");
    await dialog.getByRole("button", { name: "Keep" }).tap();
    await expect(dialog).toBeHidden();
    await expect(rows.filter({ hasText: "Behind the paint tins." }).getByRole("heading", { name: "Shed NAS" })).toBeVisible();

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    for (const name of ["Copy the list", "Forget all devices"]) {
      expect((await page.getByRole("button", { name }).boundingBox())!.height, name).toBeGreaterThanOrEqual(44);
    }
    expect(errors).toEqual([]);
  });
});
