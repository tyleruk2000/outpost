import { expect, test, watchForErrors } from "./fixtures";

test.describe("encryption on a phone", () => {
  test("fits each part of the screen at phone width, and makes a key", async ({ page }) => {
    const errors = watchForErrors(page);
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

    await page.goto("/encryption");
    await expect(page.getByRole("heading", { name: "Encryption", level: 1 })).toBeVisible();
    await page.getByRole("button", { name: "Make a key" }).first().click();
    await page.getByLabel("Name", { exact: true }).fill("Phone Example");
    await page.getByRole("button", { name: "Suggest one" }).click();
    expect(await overflow()).toBeLessThanOrEqual(1);
    await page.getByRole("button", { name: "Make key", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Phone Example’s key is ready" })).toBeVisible({ timeout: 20_000 });
    expect(await overflow()).toBeLessThanOrEqual(1);
    await page.getByRole("button", { name: "Done" }).click();

    // The fingerprint wraps between its groups rather than pushing the page sideways.
    const row = page.locator("li[data-key]").filter({ hasText: "Phone Example" });
    await expect(row.getByRole("img", { name: /^Fingerprint / })).toBeVisible();
    const fingerprint = await row.getAttribute("data-key");
    expect(await overflow()).toBeLessThanOrEqual(1);
    // The menu button is a full touch target.
    const menu = await row.getByRole("button", { name: /Actions for/ }).boundingBox();
    expect(menu!.width).toBeGreaterThanOrEqual(44);
    expect(menu!.height).toBeGreaterThanOrEqual(44);

    for (const tab of ["Text", "Files", "By hand"]) {
      await page.getByRole("tab", { name: tab }).click();
      expect(await overflow(), `${tab} tab`).toBeLessThanOrEqual(1);
    }

    // A long working (a key square and its pairs, a zigzag) scrolls inside its own box.
    await page.getByLabel("Message", { exact: true }).fill("We are discovered. Flee at once, and take the long way round by the river.");
    await page.getByRole("combobox", { name: "Cipher" }).click();
    await page.getByRole("option", { name: "Rail fence" }).click();
    await expect(page.getByText("Rail 3")).toBeVisible();
    expect(await overflow()).toBeLessThanOrEqual(1);

    await page.request.fetch(`/api/encryption/keys/${fingerprint}`, { method: "DELETE", headers: { "X-Outpost-Request": "1" } });
    expect(errors).toEqual([]);
  });
});
