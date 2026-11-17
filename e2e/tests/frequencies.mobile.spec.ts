/**
 * Frequencies to listen to, on a phone: reached from the More sheet under Radio,
 * filtered to time signals through the Kind drop-down, an entry opened to its source and
 * the day it was checked, opened again from an address that names the kind (the way
 * the Solar clock's link does), and the list offered as a PDF. Nothing is fetched: the
 * list comes with the app, and a source is only a link.
 */
import { expect, test, watchForErrors } from "./fixtures";

test.use({ viewport: { width: 390, height: 844 } });

test.describe("Frequencies to listen to on a phone", () => {
  test("filters to time signals, opens an entry to its source and date, and makes a PDF", async ({ page }) => {
    const errors = watchForErrors(page);
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    await page.goto("/");

    await page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: "More" }).tap();
    await page.getByRole("dialog", { name: "More" }).locator('a[href="/radio/frequencies"]').first().tap();
    await expect(page.getByRole("heading", { level: 1, name: "Frequencies to listen to" })).toBeVisible();
    await expect(page.getByText(/^Last checked /)).toBeVisible();
    await expect(page.getByTestId("frequency-row").first()).toBeVisible();
    expect(await overflow()).toBeLessThanOrEqual(1);

    // Every place, so that what is shown does not hang on a home place; then time signals from the drop-down.
    await page.getByRole("combobox", { name: "Country or region" }).tap();
    await page.getByRole("option", { name: "Every place" }).tap();
    await page.getByRole("combobox", { name: "Kind" }).tap();
    await page.getByRole("option", { name: "Time signals" }).tap();
    await expect(page.getByRole("combobox", { name: "Kind" })).toHaveText("Time signals");
    await expect(page).toHaveURL(/kind=time-signals/);

    const first = page.getByTestId("frequency-row").first();
    await expect(first).toBeVisible();
    // A target big enough for a finger.
    const button = first.getByRole("button").first();
    expect((await button.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
    await button.tap();
    const detail = first.getByTestId("frequency-detail");
    await expect(detail).toBeVisible();
    await expect(detail.getByText(/^Sources?$/)).toBeVisible();
    await expect(detail.getByRole("link", { name: /^https?:\/\// }).first()).toBeVisible();
    await expect(detail.getByText("Checked", { exact: true })).toBeVisible();
    await expect(detail.getByText(/\d{1,2} [A-Z][a-z]+ 20\d\d/).first()).toBeVisible();
    expect(await overflow()).toBeLessThanOrEqual(1);

    // An address that names the kind opens on it.
    await page.goto("/radio/frequencies?kind=time-signals&place=any");
    await expect(page.getByRole("combobox", { name: "Kind" })).toHaveText("Time signals");
    const kinds = await page.getByTestId("frequency-row").count();
    expect(kinds).toBeGreaterThan(0);

    await page.getByRole("button", { name: "Make a PDF" }).tap();
    const dialog = page.getByRole("dialog", { name: "This list as a PDF" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("link", { name: "Save as PDF" })).toHaveAttribute("download", /\.pdf$/);
    await expect(dialog.getByRole("button", { name: "Add to library" })).toBeEnabled();
    expect(errors).toEqual([]);
  });
});
