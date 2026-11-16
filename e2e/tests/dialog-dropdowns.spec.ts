/**
 * A drop-down inside a dialog opens above the dialog, where it can be seen and pressed.
 *
 * Lists and menus are drawn in a layer of their own. That layer sat under the dialog's,
 * so every drop-down in every dialog opened behind it: the owner pressed "Antenna" in
 * "Add a station" and nothing appeared to happen. No test had ever chosen from one.
 */
import { expect, test } from "./fixtures";

test("a drop-down in a dialog can be opened and chosen from", async ({ page }) => {
  await page.goto("/radio/plans");
  await page.getByRole("button", { name: "New plan" }).click();
  const naming = page.getByRole("dialog");
  await naming.getByRole("textbox").first().fill("Drop-down check");
  await naming.getByRole("button", { name: "Create plan" }).click();
  await page.waitForURL(/\/radio\/plans\/.+/);

  await page
    .getByRole("button", { name: /add a station/i })
    .first()
    .click();
  const dialog = page.getByRole("dialog", { name: "Add a station" });
  const antenna = dialog.getByRole("combobox").filter({ hasText: "Low horizontal dipole, 5 m" });
  await antenna.click();

  // The option is the thing under the pointer at its own middle: nothing lies over it.
  const option = page.getByRole("option", { name: /Quarter-wave vertical/ });
  await expect(option).toBeVisible();
  const onTop = await option.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const top = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    return top !== null && element.contains(top);
  });
  expect(onTop).toBe(true);
  await option.click();
  await expect(dialog.getByRole("combobox").filter({ hasText: "Quarter-wave vertical" })).toBeVisible();

  // And the second one, to show it is the layer and not this one control.
  await dialog.getByRole("combobox").filter({ hasText: "Residential" }).click();
  await page.getByRole("option", { name: /Urban/ }).click();
  await expect(dialog.getByRole("combobox").filter({ hasText: /Urban/ })).toBeVisible();
});
