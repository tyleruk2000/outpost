/**
 * The nuclear screen's map on a phone: at the screen's start its zoom buttons are whole, with nothing over
 * them (axe's target-size rule). After a tab below the map is pressed the page has scrolled and the top bar
 * lies over the map, as it lies over anything scrolled up past it; a zoom button reached with the keyboard
 * then is scrolled clear of the bar again.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test, watchForErrors } from "./fixtures";

test("the map's zoom buttons are clear of the top bar at the start, and when reached by keyboard", async ({ page }) => {
  const errors = watchForErrors(page);
  await page.goto("/prepare/nuclear");
  const zoomOut = page.getByRole("button", { name: "Zoom out" });
  await expect(zoomOut).toBeVisible();
  const atStart = await new AxeBuilder({ page }).withRules(["target-size"]).analyze();
  expect(atStart.violations.flatMap((violation) => violation.nodes.map((node) => node.target.join(" ")))).toEqual([]);

  await page.getByRole("tab", { name: "Layers", exact: true }).click();
  await zoomOut.focus();
  const clear = await zoomOut.evaluate((button) => {
    const bar = document.querySelector("header.bg-spine")!.getBoundingClientRect();
    const box = button.getBoundingClientRect();
    return box.top >= bar.bottom && box.bottom <= innerHeight;
  });
  expect(clear).toBe(true);
  expect(errors).toEqual([]);
});
